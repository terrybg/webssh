package com.terry.webssh.application.util;

/**
 * Parse verbose {@code rm -v} / {@code rm -rfv} progress lines.
 */
public final class RmOutputParser {

    private RmOutputParser() {
    }

    /**
     * @return removed path, or null if the line is not a progress line
     */
    public static String parseRemoved(String line) {
        if (line == null) {
            return null;
        }
        String s = line.trim();
        if (s.isEmpty()) {
            return null;
        }
        String lower = s.toLowerCase();
        if (lower.startsWith("rm:") || lower.startsWith("cannot ") || lower.contains("permission denied")) {
            return null;
        }
        String[] prefixes = {
                "removed directory '", "removed directory \"",
                "removed '", "removed \"",
                "removing '", "removing \"",
                "removed directory ", "removed ", "removing "
        };
        for (int i = 0; i < prefixes.length; i++) {
            String p = prefixes[i];
            if (lower.startsWith(p)) {
                String rest = s.substring(p.length()).trim();
                if (rest.endsWith("'") || rest.endsWith("\"")) {
                    rest = rest.substring(0, rest.length() - 1);
                }
                return rest.isEmpty() ? null : rest;
            }
        }
        return null;
    }
}
