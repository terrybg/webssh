package com.terry.webssh.application.util;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Parse {@code du --max-depth=1} output into per-child sizes.
 */
public final class DuOutputParser {

    private DuOutputParser() {
    }

    public static final class Result {
        public final Map<String, Long> entries = new LinkedHashMap<String, Long>();
        public Long total;
        public boolean kilobytes;
    }

    public static Result parse(String text) {
        Result result = new Result();
        if (text == null || text.trim().isEmpty()) {
            return result;
        }
        String[] lines = text.replace('\r', '\n').split("\n");
        int i = 0;
        if (lines.length > 0) {
            String first = lines[0].trim();
            if ("KB".equalsIgnoreCase(first)) {
                result.kilobytes = true;
                i = 1;
            } else if ("BYTES".equalsIgnoreCase(first)) {
                result.kilobytes = false;
                i = 1;
            }
        }
        for (; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) {
                continue;
            }
            int sep = indexOfSplit(line);
            if (sep <= 0) {
                continue;
            }
            long n;
            try {
                n = Long.parseLong(line.substring(0, sep).trim());
            } catch (NumberFormatException e) {
                continue;
            }
            if (result.kilobytes) {
                if (n > Long.MAX_VALUE / 1024L) {
                    n = Long.MAX_VALUE;
                } else {
                    n = n * 1024L;
                }
            }
            String rawPath = line.substring(sep).trim();
            String name = childName(rawPath);
            if (name == null) {
                result.total = n;
            } else {
                result.entries.put(name, n);
            }
        }
        result.total = effectiveTotal(result);
        return result;
    }

    /** Some du print {@code .} first (dir itself) while children are larger, or omit other filesystems. */
    static long effectiveTotal(Result result) {
        long childSum = 0L;
        for (Long v : result.entries.values()) {
            if (v != null && v > 0L) {
                if (childSum > Long.MAX_VALUE - v) {
                    childSum = Long.MAX_VALUE;
                    break;
                }
                childSum += v;
            }
        }
        long total = result.total != null ? result.total : 0L;
        return Math.max(total, childSum);
    }

    private static int indexOfSplit(String line) {
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == ' ' || c == '\t') {
                return i;
            }
        }
        return -1;
    }

    /** {@code .} / {@code ./} → current dir (total); {@code ./foo} → {@code foo}. */
    static String childName(String rawPath) {
        if (rawPath == null) {
            return null;
        }
        String p = rawPath.replace('\\', '/').trim();
        if (p.startsWith("./")) {
            p = p.substring(2);
        }
        if (p.isEmpty() || ".".equals(p) || "/".equals(p)) {
            return null;
        }
        while (p.endsWith("/") && p.length() > 1) {
            p = p.substring(0, p.length() - 1);
        }
        int slash = p.lastIndexOf('/');
        if (slash >= 0) {
            p = p.substring(slash + 1);
        }
        if (p.isEmpty() || ".".equals(p)) {
            return null;
        }
        return p;
    }
}
