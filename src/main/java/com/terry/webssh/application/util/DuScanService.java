package com.terry.webssh.application.util;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.Session;
import com.terry.webssh.application.pojo.SSHConnectInfo;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * TreeSize-style recursive disk usage: one {@code du --max-depth=1} per directory,
 * sequential, niceness + skip virtual fs. Does not hold the SFTP session lock for the
 * whole scan so listing/deleting stays responsive.
 */
public final class DuScanService {

    private static final int MAX_DIRS = 80000;
    private static final int MAX_ENTRIES = 200000;
    /** Per-directory du timeout (large dirs like /data/offline can take a while). */
    private static final int DU_TIMEOUT_MS = 12000;
    private static final int FIND_TIMEOUT_MS = 8000;
    private static final int YIELD_MS = 25;
    private static final int DELTA_BATCH = 2500;

    private static final ConcurrentHashMap<String, Job> JOBS = new ConcurrentHashMap<String, Job>();

    private DuScanService() {
    }

    public static Job start(String tagId, String root, SSHConnectInfo cache) {
        return start(tagId, root, cache, false);
    }

    public static Job start(String tagId, String root, SSHConnectInfo cache, boolean force) {
        Job running = JOBS.get(tagId);
        if (!force && running != null && running.running) {
            return running;
        }
        if (!force && running != null && running.done && !running.cancelled
                && root.equals(running.root) && running.entryCount() > 0) {
            return running;
        }
        if (running != null) {
            running.cancelled = true;
        }
        Job job = new Job(tagId, root);
        JOBS.put(tagId, job);
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                walk(job, cache);
            }
        }, "webssh-du-" + tagId);
        t.setDaemon(true);
        t.start();
        return job;
    }

    public static Job get(String tagId) {
        return JOBS.get(tagId);
    }

    public static void cancel(String tagId) {
        Job job = JOBS.get(tagId);
        if (job != null) {
            job.cancelled = true;
            job.paused = false;
            synchronized (job) {
                job.notifyAll();
            }
        }
    }

    public static void pause(String tagId) {
        Job job = JOBS.get(tagId);
        if (job != null && job.running && !job.done) {
            job.paused = true;
        }
    }

    public static void resume(String tagId) {
        Job job = JOBS.get(tagId);
        if (job != null) {
            job.paused = false;
            synchronized (job) {
                job.notifyAll();
            }
        }
    }

    private static void awaitIfPaused(Job job) {
        synchronized (job) {
            while (job.paused && !job.cancelled) {
                try {
                    job.wait(400L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    static boolean skipPath(String path) {
        if (path == null || path.isEmpty()) {
            return true;
        }
        String p = path;
        if ("/proc".equals(p) || p.startsWith("/proc/")
                || "/sys".equals(p) || p.startsWith("/sys/")
                || "/dev".equals(p) || p.startsWith("/dev/")
                || "/run".equals(p) || p.startsWith("/run/")) {
            return true;
        }
        return false;
    }

    static String joinPath(String parent, String name) {
        if (parent == null || "/".equals(parent)) {
            return "/" + name;
        }
        return parent + "/" + name;
    }

    static String parentOf(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) {
            return null;
        }
        int i = path.lastIndexOf('/');
        if (i <= 0) {
            return "/";
        }
        return path.substring(0, i);
    }

    static List<String> parseDirNames(String text) {
        List<String> names = new ArrayList<String>();
        if (text == null) {
            return names;
        }
        String[] lines = text.replace('\r', '\n').split("\n");
        for (String line : lines) {
            String n = line.trim();
            if (n.isEmpty()) {
                continue;
            }
            if (n.startsWith("./")) {
                n = n.substring(2);
            }
            int slash = n.lastIndexOf('/');
            if (slash >= 0) {
                n = n.substring(slash + 1);
            }
            if (!n.isEmpty() && !".".equals(n)) {
                names.add(n);
            }
        }
        return names;
    }

    private static void walk(Job job, SSHConnectInfo cache) {
        ArrayDeque<String> queue = new ArrayDeque<String>();
        queue.add(job.root);
        Set<String> seen = new HashSet<String>();
        Session session = null;
        try {
            synchronized (cache) {
                session = cache.getSession();
            }
            if (session == null || !session.isConnected()) {
                job.error = "SSH 已断开";
                return;
            }
            while (!job.cancelled && !queue.isEmpty() && job.dirsDone < MAX_DIRS
                    && job.entryCount() < MAX_ENTRIES) {
                awaitIfPaused(job);
                if (job.cancelled) {
                    break;
                }
                String dir = queue.poll();
                if (dir == null || !seen.add(dir) || skipPath(dir)) {
                    continue;
                }
                job.beginDir(dir, "find");
                List<String> childDirs;
                try {
                    if (!session.isConnected()) {
                        job.error = "SSH 已断开";
                        break;
                    }
                    childDirs = parseDirNames(execCapture(session, findDirsCommand(dir), FIND_TIMEOUT_MS));
                } catch (Exception e) {
                    childDirs = new ArrayList<String>();
                }

                job.beginDir(dir, "du");
                DuOutputParser.Result parsed = new DuOutputParser.Result();
                boolean duTimedOut = false;
                try {
                    if (!session.isConnected()) {
                        job.error = "SSH 已断开";
                        break;
                    }
                    String duOut = execCapture(session, duDepth1Command(dir), DU_TIMEOUT_MS);
                    parsed = DuOutputParser.parse(duOut);
                } catch (Exception e) {
                    duTimedOut = true;
                    job.noteDirIssue(dir, e.getMessage());
                }

                long total = parsed.total != null ? parsed.total : 0L;
                job.emit(dir, total, true);
                Set<String> childDirSet = new HashSet<String>(childDirs);
                for (Map.Entry<String, Long> e : parsed.entries.entrySet()) {
                    String name = e.getKey();
                    if (name == null) {
                        continue;
                    }
                    String child = joinPath(dir, name);
                    boolean isDir = childDirSet.contains(name);
                    job.emit(child, e.getValue() == null ? 0L : e.getValue(), isDir);
                    if (isDir && !skipPath(child) && job.dirsDone < MAX_DIRS) {
                        queue.add(child);
                    }
                }
                for (String name : childDirs) {
                    String child = joinPath(dir, name);
                    if (parsed.entries.containsKey(name) || skipPath(child)) {
                        continue;
                    }
                    job.emit(child, 0L, true);
                    queue.add(child);
                }
                if (duTimedOut && !childDirs.isEmpty()) {
                    job.noteDirIssue(dir, "统计超时，子目录将继续扫描");
                }
                job.dirsDone++;
                yieldQuiet();
            }
            if (!job.cancelled && (job.dirsDone >= MAX_DIRS || job.entryCount() >= MAX_ENTRIES)) {
                job.error = "已达扫描上限，已停止以保护服务器";
            }
        } catch (Exception e) {
            job.error = e.getMessage() == null ? "扫描失败" : e.getMessage();
        } finally {
            job.running = false;
            job.done = true;
            job.currentPhase = "";
            if (job.cancelled) {
                job.currentPath = "";
            }
        }
    }

    /** List immediate subdirectories only (fast; does not walk file contents). */
    static String findDirsCommand(String path) {
        String q = shellQuote(path);
        return "cd " + q + " && find . -xdev -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sed 's|^\\./||'";
    }

    /**
     * One-level du; BusyBox/GNU compatible. Shell {@code timeout} when available.
     */
    static String duDepth1Command(String path) {
        String q = shellQuote(path);
        int sec = Math.max(5, DU_TIMEOUT_MS / 1000);
        return "cd " + q + " && ( "
                + "if command -v timeout >/dev/null 2>&1; then T=timeout; else T=; fi; "
                + "out=$($T " + sec + " nice -n 19 du -sbPx --max-depth=1 . 2>/dev/null); "
                + "if [ -n \"$out\" ]; then printf 'BYTES\\n'; printf '%s\\n' \"$out\"; "
                + "else out=$($T " + sec + " nice -n 19 du -skx --max-depth=1 . 2>/dev/null); "
                + "if [ -n \"$out\" ]; then printf 'KB\\n'; printf '%s\\n' \"$out\"; "
                + "else out=$($T " + sec + " nice -n 19 du -d 1 -sk . 2>/dev/null "
                + "|| $T " + sec + " nice -n 19 du -sk ./* 2>/dev/null); "
                + "printf 'KB\\n'; printf '%s\\n' \"$out\"; fi; fi )";
    }

    private static String shellQuote(String s) {
        return "'" + String.valueOf(s).replace("'", "'\"'\"'") + "'";
    }

    private static void yieldQuiet() {
        try {
            Thread.sleep(YIELD_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String execCapture(Session session, String command, int timeoutMs) throws Exception {
        ChannelExec exec = (ChannelExec) session.openChannel("exec");
        exec.setCommand(command);
        InputStream in = exec.getInputStream();
        InputStream err = exec.getErrStream();
        exec.connect(Math.min(15000, timeoutMs));
        byte[] buf = new byte[4096];
        StringBuilder out = new StringBuilder();
        long deadline = System.currentTimeMillis() + timeoutMs;
        try {
            while (true) {
                while (in.available() > 0) {
                    int n = in.read(buf);
                    if (n <= 0) {
                        break;
                    }
                    out.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                    if (out.length() > 2 * 1024 * 1024) {
                        break;
                    }
                }
                while (err.available() > 0) {
                    if (err.read(buf) < 0) {
                        break;
                    }
                }
                if (exec.isClosed()) {
                    while (in.available() > 0) {
                        int n = in.read(buf);
                        if (n <= 0) {
                            break;
                        }
                        out.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                    }
                    break;
                }
                if (System.currentTimeMillis() > deadline) {
                    throw new IllegalStateException("目录扫描超时");
                }
                Thread.sleep(20);
            }
        } finally {
            if (exec.isConnected()) {
                exec.disconnect();
            }
        }
        return out.toString();
    }

    public static final class Job {
        public final String tagId;
        public final String root;
        public volatile boolean running = true;
        public volatile boolean done = false;
        public volatile boolean cancelled = false;
        public volatile boolean paused = false;
        public volatile String currentPath = "";
        public volatile String currentPhase = "";
        public volatile long currentSinceMs = 0L;
        public volatile int dirsDone = 0;
        public volatile String error = "";
        public volatile String lastIssue = "";
        private long seq = 0;
        private final List<Map<String, Object>> log = new ArrayList<Map<String, Object>>();
        private final Map<String, Long> sizes = new LinkedHashMap<String, Long>();
        private final Map<String, Set<String>> childPaths = new LinkedHashMap<String, Set<String>>();

        Job(String tagId, String root) {
            this.tagId = tagId;
            this.root = root;
        }

        void beginDir(String path, String phase) {
            currentPath = path == null ? "" : path;
            currentPhase = phase == null ? "" : phase;
            currentSinceMs = System.currentTimeMillis();
        }

        void noteDirIssue(String path, String msg) {
            if (msg != null && !msg.isEmpty()) {
                lastIssue = path + ": " + msg;
            }
        }

        void emit(String path, long size, boolean dir) {
            synchronized (this) {
                Long prev = sizes.get(path);
                if (prev != null && prev > size) {
                    size = prev;
                }
                sizes.put(path, size);
                appendRow(path, size, dir);
                String parent = parentOf(path);
                if (parent != null) {
                    Set<String> kids = childPaths.get(parent);
                    if (kids == null) {
                        kids = new HashSet<String>();
                        childPaths.put(parent, kids);
                    }
                    kids.add(path);
                }
                String p = parent;
                while (p != null) {
                    long sum = 0L;
                    Set<String> kids = childPaths.get(p);
                    if (kids != null) {
                        for (String c : kids) {
                            Long s = sizes.get(c);
                            if (s != null) {
                                if (sum > Long.MAX_VALUE - s) {
                                    sum = Long.MAX_VALUE;
                                    break;
                                }
                                sum += s;
                            }
                        }
                    }
                    Long old = sizes.get(p);
                    long neu = old == null ? sum : Math.max(old, sum);
                    if (old == null || neu != old.longValue()) {
                        sizes.put(p, neu);
                        appendRow(p, neu, true);
                    }
                    p = parentOf(p);
                }
            }
        }

        private void appendRow(String path, long size, boolean dir) {
            seq++;
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("seq", seq);
            row.put("path", path);
            row.put("size", size);
            row.put("dir", dir);
            log.add(row);
        }

        int entryCount() {
            synchronized (this) {
                return log.size();
            }
        }

        public Map<String, Object> snapshot(long since) {
            List<Map<String, Object>> delta = new ArrayList<Map<String, Object>>();
            long head;
            synchronized (this) {
                head = seq;
                for (Map<String, Object> row : log) {
                    long s = ((Number) row.get("seq")).longValue();
                    if (s > since) {
                        delta.add(row);
                        if (delta.size() >= DELTA_BATCH) {
                            break;
                        }
                    }
                }
            }
            Map<String, Object> body = new LinkedHashMap<String, Object>();
            body.put("running", running);
            body.put("done", done);
            body.put("cancelled", cancelled);
            body.put("paused", paused);
            body.put("root", root);
            body.put("currentPath", currentPath == null ? "" : currentPath);
            body.put("currentPhase", currentPhase == null ? "" : currentPhase);
            body.put("currentSinceMs", currentSinceMs);
            body.put("dirsDone", dirsDone);
            body.put("error", error == null ? "" : error);
            body.put("lastIssue", lastIssue == null ? "" : lastIssue);
            body.put("seq", head);
            body.put("entries", delta);
            body.put("more", !delta.isEmpty() && ((Number) delta.get(delta.size() - 1).get("seq")).longValue() < head);
            return body;
        }
    }
}
