package com.terry.webssh.application.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Background file operations (delete / extract / compress / cross-copy) that survive
 * browser refresh. Clients get a jobId and can poll {@link #snapshot(String)}.
 */
public final class FileOpJob {

    private static final ConcurrentHashMap<String, FileOpJob> JOBS = new ConcurrentHashMap<String, FileOpJob>();
    private static final ExecutorService EXEC = Executors.newCachedThreadPool(new ThreadFactory() {
        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, "webssh-file-op");
            t.setDaemon(true);
            return t;
        }
    });
    private static final int MAX_EVENTS = 400;
    private static final long TTL_MS = 2L * 60L * 60L * 1000L;

    public final String id;
    public final String kind;
    public final String tagId;
    public final String cwd;
    public final String title;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private final AtomicBoolean paused = new AtomicBoolean(false);
    private final AtomicInteger seq = new AtomicInteger(0);
    private final Object lock = new Object();
    private final List<String> events = new ArrayList<String>();
    private volatile String state = "running"; // running | paused | done | error | cancelled
    private volatile String detail = "";
    private volatile int progress = 0;
    private volatile boolean indeterminate = true;
    private volatile long updatedAt = System.currentTimeMillis();
    private volatile long finishedAt = 0L;

    private FileOpJob(String kind, String tagId, String cwd, String title) {
        this.id = "fop-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        this.kind = kind;
        this.tagId = tagId == null ? "" : tagId;
        this.cwd = cwd == null ? "" : cwd;
        this.title = title == null ? kind : title;
    }

    public static FileOpJob create(String kind, String tagId, String cwd, String title) {
        prune();
        FileOpJob job = new FileOpJob(kind, tagId, cwd, title);
        JOBS.put(job.id, job);
        return job;
    }

    public static FileOpJob get(String id) {
        if (id == null) {
            return null;
        }
        return JOBS.get(id);
    }

    public static void submit(FileOpJob job, Runnable work) {
        EXEC.execute(() -> {
            try {
                work.run();
            } catch (Throwable t) {
                job.fail(t.getMessage() != null ? t.getMessage() : "操作失败");
            }
        });
    }

    public static boolean cancel(String id) {
        FileOpJob job = get(id);
        if (job == null) {
            return false;
        }
        job.cancelled.set(true);
        job.paused.set(false);
        synchronized (job.lock) {
            job.lock.notifyAll();
        }
        if ("running".equals(job.state) || "paused".equals(job.state)) {
            job.state = "cancelled";
            job.detail = "已取消";
            job.touch();
            job.finishedAt = job.updatedAt;
            job.emit("{\"phase\":\"error\",\"message\":\"已取消\",\"jobId\":\"" + job.id + "\"}");
        }
        return true;
    }

    public static boolean pause(String id) {
        FileOpJob job = get(id);
        if (job == null || job.isFinished()) {
            return false;
        }
        job.paused.set(true);
        job.state = "paused";
        job.detail = job.detail == null || job.detail.isEmpty() ? "已暂停" : job.detail;
        job.touch();
        return true;
    }

    public static boolean resume(String id) {
        FileOpJob job = get(id);
        if (job == null || job.isFinished()) {
            return false;
        }
        job.paused.set(false);
        job.state = "running";
        job.touch();
        synchronized (job.lock) {
            job.lock.notifyAll();
        }
        return true;
    }

    public boolean isCancelled() {
        return cancelled.get();
    }

    public boolean isPaused() {
        return paused.get();
    }

    public boolean isFinished() {
        return !"running".equals(state) && !"paused".equals(state);
    }

    /** Block while paused; return true if cancelled (caller should stop). */
    public boolean checkControl() {
        awaitIfPaused();
        return isCancelled();
    }

    public void awaitIfPaused() {
        synchronized (lock) {
            while (paused.get() && !cancelled.get()) {
                try {
                    lock.wait(400L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    public void emit(String jsonLine) {
        synchronized (lock) {
            events.add(jsonLine);
            while (events.size() > MAX_EVENTS) {
                events.remove(0);
            }
            seq.incrementAndGet();
            touch();
            lock.notifyAll();
        }
    }

    public void setProgress(int pct, String detailText, boolean indeterminateFlag) {
        this.progress = Math.max(0, Math.min(100, pct));
        if (detailText != null) {
            this.detail = detailText;
        }
        this.indeterminate = indeterminateFlag;
        touch();
    }

    public void succeed(String detailText) {
        this.state = "done";
        this.progress = 100;
        this.indeterminate = false;
        if (detailText != null) {
            this.detail = detailText;
        }
        touch();
        this.finishedAt = this.updatedAt;
    }

    public void fail(String message) {
        this.state = "error";
        this.indeterminate = false;
        this.detail = message != null ? message : "失败";
        touch();
        this.finishedAt = this.updatedAt;
    }

    public List<String> eventsSince(int fromIndex) {
        synchronized (lock) {
            if (fromIndex < 0) {
                fromIndex = 0;
            }
            if (fromIndex >= events.size()) {
                return new ArrayList<String>();
            }
            return new ArrayList<String>(events.subList(fromIndex, events.size()));
        }
    }

    public int eventCount() {
        synchronized (lock) {
            return events.size();
        }
    }

    /** Wait briefly for new events; returns false if finished and nothing new. */
    public boolean awaitEvents(int knownCount, long timeoutMs) {
        synchronized (lock) {
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (events.size() <= knownCount && ("running".equals(state) || "paused".equals(state))) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) {
                    break;
                }
                try {
                    lock.wait(Math.min(left, 200L));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            return events.size() > knownCount || !"running".equals(state);
        }
    }

    public Map<String, Object> snapshot() {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", id);
        m.put("kind", kind);
        m.put("tagId", tagId);
        m.put("cwd", cwd);
        m.put("title", title);
        m.put("state", state);
        m.put("paused", paused.get());
        m.put("detail", detail);
        m.put("progress", progress);
        m.put("indeterminate", indeterminate);
        m.put("updatedAt", updatedAt);
        m.put("finishedAt", finishedAt);
        m.put("eventCount", eventCount());
        synchronized (lock) {
            // last few events for reconnect UI
            int from = Math.max(0, events.size() - 8);
            m.put("recentEvents", new ArrayList<String>(events.subList(from, events.size())));
        }
        return m;
    }

    private void touch() {
        updatedAt = System.currentTimeMillis();
    }

    private static void prune() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, FileOpJob> e : JOBS.entrySet()) {
            FileOpJob j = e.getValue();
            if (j.isFinished() && now - j.finishedAt > TTL_MS) {
                JOBS.remove(e.getKey(), j);
            }
        }
    }
}
