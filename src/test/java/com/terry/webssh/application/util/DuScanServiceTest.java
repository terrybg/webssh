package com.terry.webssh.application.util;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DuScanServiceTest {

    @Test
    void skipsVirtualFs() {
        assertTrue(DuScanService.skipPath("/proc"));
        assertTrue(DuScanService.skipPath("/proc/1"));
        assertTrue(DuScanService.skipPath("/sys/fs"));
        assertTrue(DuScanService.skipPath("/dev"));
        assertTrue(DuScanService.skipPath("/run/user"));
        assertFalse(DuScanService.skipPath("/"));
        assertFalse(DuScanService.skipPath("/home"));
        assertFalse(DuScanService.skipPath("/usr"));
    }

    @Test
    void parseDirNamesStripsDotSlash() {
        List<String> names = DuScanService.parseDirNames("./bin\n./sbin\n");
        assertEquals("bin", names.get(0));
        assertEquals("sbin", names.get(1));
    }

    @Test
    void duCommandUsesTimeoutAndBusyboxFallback() {
        String cmd = DuScanService.duDepth1Command("/data/offline");
        assertTrue(cmd.contains("timeout"));
        assertTrue(cmd.contains("du -d 1"));
        assertTrue(cmd.contains("--max-depth=1"));
    }

    @Test
    void findCommandListsDirsOnly() {
        String cmd = DuScanService.findDirsCommand("/data");
        assertTrue(cmd.contains("find ."));
        assertTrue(cmd.contains("-type d"));
        assertTrue(cmd.contains("-maxdepth 1"));
    }
}
