package com.terry.webssh.application.util;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DfDiskParserTest {

    @Test
    void parsesByteBlocksAndFiltersVirtual() {
        String text = ""
                + "Filesystem     1B-blocks        Used    Available Use% Mounted on\n"
                + "/dev/sda1     10000000000  4000000000  6000000000  40% /\n"
                + "tmpfs           500000000           0   500000000   0% /dev/shm\n"
                + "overlay         8000000000  1000000000  7000000000  13% /\n"
                + "/dev/sdb1     50000000000 10000000000 40000000000  20% /data\n";
        List<Map<String, Object>> disks = DfDiskParser.parse(text);
        // tmpfs skipped; overlay root kept (Sophon etc.)
        assertEquals(3, disks.size());
        assertEquals("/", disks.get(0).get("name"));
        assertEquals("/dev/sda1", disks.get(0).get("device"));
        assertEquals(10000000000L, ((Number) disks.get(0).get("total")).longValue());
        assertEquals(4000000000L, ((Number) disks.get(0).get("used")).longValue());
        assertEquals(6000000000L, ((Number) disks.get(0).get("avail")).longValue());
        assertEquals(60, ((Number) disks.get(0).get("pctAvail")).intValue());
        assertEquals("overlay", disks.get(1).get("device"));
        assertEquals("/data", disks.get(2).get("name"));
    }

    @Test
    void parsesKiloBlocksHeader() {
        String text = ""
                + "Filesystem     1024-blocks    Used Available Capacity Mounted on\n"
                + "/dev/mmcblk0p2   1048576  524288   524288      50% /\n";
        List<Map<String, Object>> disks = DfDiskParser.parse(text);
        assertEquals(1, disks.size());
        assertEquals(1048576L * 1024L, ((Number) disks.get(0).get("total")).longValue());
        assertEquals(50, ((Number) disks.get(0).get("pctAvail")).intValue());
    }

    @Test
    void parsesBusyBoxStyle() {
        String text = ""
                + "Filesystem           1K-blocks      Used Available Use% Mounted on\n"
                + "/dev/root              7634944   4123456   3123456  57% /\n"
                + "tmpfs                   495232         0    495232   0% /dev/shm\n"
                + "/dev/mmcblk0p8        28811264  18811264   9000000  68% /data\n";
        List<Map<String, Object>> disks = DfDiskParser.parse(text);
        assertEquals(2, disks.size());
        assertEquals("/", disks.get(0).get("name"));
        assertEquals(7634944L * 1024L, ((Number) disks.get(0).get("total")).longValue());
        assertEquals("/data", disks.get(1).get("name"));
    }

    @Test
    void skipsVirtualFsAndMounts() {
        assertTrue(DfDiskParser.skipFilesystem("tmpfs"));
        assertFalse(DfDiskParser.skipFilesystem("overlay"));
        assertTrue(DfDiskParser.skipFilesystem("cgroup2"));
        assertFalse(DfDiskParser.skipFilesystem("/dev/sda1"));
        assertTrue(DfDiskParser.skipMount("/proc"));
        assertTrue(DfDiskParser.skipMount("/run/user/0"));
        assertFalse(DfDiskParser.skipMount("/data"));
    }

    @Test
    void parsesSophonDfHStyle() {
        String text = ""
                + "Filesystem     1K-blocks    Used Available Use% Mounted on\n"
                + "overlay          9123456  3987456  4823456  46% /\n"
                + "tmpfs             701440        0   701440   0% /dev/shm\n"
                + "/dev/mmcblk0p1    131072    20480   110592  16% /boot\n"
                + "/dev/mmcblk0p6  16777216  5872025  9961472  37% /data\n";
        List<Map<String, Object>> disks = DfDiskParser.parse(text);
        assertEquals(3, disks.size());
        assertEquals("/", disks.get(0).get("name"));
        assertEquals("overlay", disks.get(0).get("device"));
        assertEquals("/boot", disks.get(1).get("name"));
        assertEquals("/data", disks.get(2).get("name"));
    }
}
