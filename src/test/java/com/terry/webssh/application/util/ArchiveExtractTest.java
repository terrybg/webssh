package com.terry.webssh.application.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ArchiveExtractTest {

    @Test
    void detectFormats() {
        assertEquals(ArchiveExtract.Kind.ZIP, ArchiveExtract.detect("a.zip"));
        assertEquals(ArchiveExtract.Kind.TAR, ArchiveExtract.detect("a.tar.gz"));
        assertEquals(ArchiveExtract.Kind.TAR, ArchiveExtract.detect("a.tgz"));
        assertEquals(ArchiveExtract.Kind.TAR, ArchiveExtract.detect("a.tar"));
        assertEquals(ArchiveExtract.Kind.TAR, ArchiveExtract.detect("a.tar.bz2"));
        assertEquals(ArchiveExtract.Kind.GZIP_FILE, ArchiveExtract.detect("log.gz"));
        assertEquals(ArchiveExtract.Kind.UNKNOWN, ArchiveExtract.detect("a.txt"));
    }

    @Test
    void stripGzipKeepsTarGz() {
        assertEquals("log", ArchiveExtract.stripGzipName("log.gz"));
        assertEquals("a.tar.gz", ArchiveExtract.stripGzipName("a.tar.gz"));
    }

    @Test
    void buildZipCommand() {
        String cmd = ArchiveExtract.buildCommand(
                ArchiveExtract.Kind.ZIP, "'/a.zip'", "'/tmp'", null);
        assertTrue(cmd.contains("unzip"));
        assertTrue(cmd.contains("-d '/tmp'"));
        assertTrue(cmd.contains("-q"));
        String verbose = ArchiveExtract.buildVerboseCommand(
                ArchiveExtract.Kind.ZIP, "'/a.zip'", "'/tmp'", null);
        assertTrue(!verbose.contains("-q"));
    }

    @Test
    void parseProgressLines() {
        assertEquals("a/b.txt", ArchiveExtract.parseProgressLine("  inflating: a/b.txt"));
        assertEquals("dir/", ArchiveExtract.parseProgressLine("   creating: dir/"));
        assertEquals("usr/bin/ls", ArchiveExtract.parseProgressLine("usr/bin/ls"));
        assertNull(ArchiveExtract.parseProgressLine("Archive: foo.zip"));
    }
}
