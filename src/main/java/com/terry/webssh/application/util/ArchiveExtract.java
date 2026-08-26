package com.terry.webssh.application.util;

/**
 * Detect archive type and build a safe remote extract shell command.
 */
public final class ArchiveExtract {

    public enum Kind {
        ZIP, TAR, GZIP_FILE, UNKNOWN
    }

    private ArchiveExtract() {
    }

    public static Kind detect(String fileName) {
        if (fileName == null) {
            return Kind.UNKNOWN;
        }
        String n = fileName.toLowerCase();
        if (n.endsWith(".tar.gz") || n.endsWith(".tgz")
                || n.endsWith(".tar.bz2") || n.endsWith(".tar.xz")
                || n.endsWith(".tar")) {
            return Kind.TAR;
        }
        if (n.endsWith(".zip")) {
            return Kind.ZIP;
        }
        if (n.endsWith(".gz")) {
            return Kind.GZIP_FILE;
        }
        return Kind.UNKNOWN;
    }

    /** Strip trailing .gz for single-file gzip output name. */
    public static String stripGzipName(String fileName) {
        if (fileName == null) {
            return "out";
        }
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".gz") && !lower.endsWith(".tar.gz")) {
            return fileName.substring(0, fileName.length() - 3);
        }
        return fileName;
    }

    /**
     * Quiet extract (legacy). Paths must already be shell-quoted.
     */
    public static String buildCommand(Kind kind, String quotedArchive, String quotedDest, String quotedGzipOut) {
        return buildCommand(kind, quotedArchive, quotedDest, quotedGzipOut, false);
    }

    /**
     * Verbose extract so the server can stream per-file progress.
     */
    public static String buildVerboseCommand(Kind kind, String quotedArchive, String quotedDest, String quotedGzipOut) {
        return buildCommand(kind, quotedArchive, quotedDest, quotedGzipOut, true);
    }

    private static String buildCommand(Kind kind, String quotedArchive, String quotedDest,
                                       String quotedGzipOut, boolean verbose) {
        if (kind == Kind.ZIP) {
            return "mkdir -p -- " + quotedDest
                    + " && unzip -o" + (verbose ? "" : " -q")
                    + " -- " + quotedArchive + " -d " + quotedDest;
        }
        if (kind == Kind.TAR) {
            return "mkdir -p -- " + quotedDest
                    + " && tar -x" + (verbose ? "v" : "") + "f " + quotedArchive + " -C " + quotedDest;
        }
        if (kind == Kind.GZIP_FILE) {
            return "mkdir -p -- " + quotedDest
                    + " && gzip -dc -- " + quotedArchive + " > " + quotedGzipOut;
        }
        throw new IllegalArgumentException("不支持的压缩格式");
    }

    /**
     * Parse one stdout/stderr line from verbose unzip/tar into an entry path, or null.
     */
    public static String parseProgressLine(String line) {
        if (line == null) {
            return null;
        }
        String s = line.trim();
        if (s.isEmpty()) {
            return null;
        }
        String lower = s.toLowerCase();
        if (lower.startsWith("archive:") || lower.startsWith("replace ")
                || lower.startsWith("caution:") || lower.startsWith("warning:")
                || lower.startsWith("tar:") || lower.startsWith("gzip:")
                || lower.startsWith("unzip:") || "inflating".equals(lower)
                || lower.startsWith("finishing")) {
            return null;
        }
        String[] prefixes = {
                "inflating:", "extracting:", "creating:", "linking:",
                "inflating: ", "extracting: ", "creating: "
        };
        for (int i = 0; i < prefixes.length; i++) {
            String p = prefixes[i];
            if (lower.startsWith(p)) {
                String name = s.substring(p.length()).trim();
                return name.isEmpty() ? null : name;
            }
        }
        // unzip sometimes: "  inflating: name"
        int colon = s.indexOf(':');
        if (colon > 0) {
            String head = s.substring(0, colon).trim().toLowerCase();
            if ("inflating".equals(head) || "extracting".equals(head) || "creating".equals(head)
                    || "linking".equals(head)) {
                String name = s.substring(colon + 1).trim();
                return name.isEmpty() ? null : name;
            }
        }
        // tar -v: bare path
        if (s.indexOf(' ') < 0 && (s.indexOf('/') >= 0 || s.indexOf('.') >= 0 || s.length() > 0)) {
            if (s.startsWith("-") || s.contains("=")) {
                return null;
            }
            return s;
        }
        return null;
    }
}
