package com.terry.webssh.application.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parse {@code df -P} output into real-disk rows (TreeSize-style).
 */
public final class DfDiskParser {

    private static final Pattern DF_LINE = Pattern.compile(
            "^(\\S+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*%\\s+(.+)$");

    private DfDiskParser() {
    }

    public static List<Map<String, Object>> parse(String text) {
        List<Map<String, Object>> list = new ArrayList<Map<String, Object>>();
        if (text == null || text.trim().isEmpty()) {
            return list;
        }
        String[] lines = text.replace('\r', '\n').split("\n");
        long blockBytes = 1L;
        int start = 0;
        if (lines.length > 0 && looksLikeHeader(lines[0])) {
            blockBytes = detectBlockBytes(lines[0]);
            start = 1;
        }
        for (int i = start; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) {
                continue;
            }
            Matcher m = DF_LINE.matcher(line);
            if (!m.matches()) {
                continue;
            }
            String fs = m.group(1);
            String mount = m.group(6).trim();
            if (skipFilesystem(fs) || skipMount(mount)) {
                continue;
            }
            long totalBlocks = Long.parseLong(m.group(2));
            long usedBlocks = Long.parseLong(m.group(3));
            long availBlocks = Long.parseLong(m.group(4));
            int usedPct = Integer.parseInt(m.group(5));
            long total = mulBlocks(totalBlocks, blockBytes);
            long used = mulBlocks(usedBlocks, blockBytes);
            long avail = mulBlocks(availBlocks, blockBytes);
            int pctAvail = 0;
            if (total > 0L) {
                pctAvail = (int) Math.min(100L, Math.round(100.0 * avail / (double) total));
            } else {
                pctAvail = Math.max(0, 100 - usedPct);
            }
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("name", mount);
            row.put("device", fs);
            row.put("total", total);
            row.put("used", used);
            row.put("avail", avail);
            row.put("pctAvail", pctAvail);
            row.put("pctUsed", usedPct);
            list.add(row);
            if (list.size() >= 24) {
                break;
            }
        }
        return list;
    }

    static boolean skipFilesystem(String fs) {
        if (fs == null || fs.isEmpty()) {
            return true;
        }
        String f = fs.toLowerCase(Locale.ROOT);
        if ("udev".equals(f) || "none".equals(f) || "shm".equals(f)) {
            return true;
        }
        return f.startsWith("tmpfs")
                || f.startsWith("devtmpfs")
                || f.startsWith("proc")
                || f.startsWith("sysfs")
                || f.startsWith("cgroup")
                || f.startsWith("squashfs")
                || f.startsWith("devpts")
                || f.startsWith("mqueue")
                || f.startsWith("debugfs")
                || f.startsWith("tracefs")
                || f.startsWith("securityfs")
                || f.startsWith("pstore")
                || f.startsWith("bpf")
                || f.startsWith("fusectl")
                || f.startsWith("configfs")
                || f.startsWith("ramfs");
    }

    static boolean skipMount(String mount) {
        if (mount == null || mount.isEmpty()) {
            return true;
        }
        return "/proc".equals(mount) || mount.startsWith("/proc/")
                || "/sys".equals(mount) || mount.startsWith("/sys/")
                || "/dev".equals(mount) || mount.startsWith("/dev/")
                || "/run".equals(mount) || mount.startsWith("/run/");
    }

    static boolean looksLikeHeader(String line) {
        if (line == null) {
            return false;
        }
        String l = line.toLowerCase(Locale.ROOT);
        return l.contains("filesystem") || l.contains("mounted on") || l.contains("blocks");
    }

    static long detectBlockBytes(String header) {
        if (header == null) {
            return 1L;
        }
        String h = header.toLowerCase(Locale.ROOT);
        if (h.contains("1b-blocks") || h.contains("1b-block") || h.contains("bytes")) {
            return 1L;
        }
        if (h.contains("1024-blocks") || h.contains("1k-blocks") || h.contains("1k-block")) {
            return 1024L;
        }
        if (h.contains("512-blocks")) {
            return 512L;
        }
        // BusyBox df -P default is often 1K-blocks
        if (h.contains("blocks")) {
            return 1024L;
        }
        return 1L;
    }

    private static long mulBlocks(long blocks, long blockBytes) {
        if (blocks <= 0L || blockBytes <= 1L) {
            return Math.max(0L, blocks);
        }
        if (blocks > Long.MAX_VALUE / blockBytes) {
            return Long.MAX_VALUE;
        }
        return blocks * blockBytes;
    }
}
