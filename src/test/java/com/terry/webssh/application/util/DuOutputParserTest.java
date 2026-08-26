package com.terry.webssh.application.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DuOutputParserTest {

    @Test
    void parsesGnuByteDepth1() {
        DuOutputParser.Result r = DuOutputParser.parse(
                "BYTES\n"
                        + "4096\t./a.txt\n"
                        + "1048576\t./logs\n"
                        + "1052672\t.\n");
        assertEquals(4096L, r.entries.get("a.txt"));
        assertEquals(1048576L, r.entries.get("logs"));
        assertEquals(1052672L, r.total);
        assertEquals(false, r.kilobytes);
    }

    @Test
    void parsesKilobyteFallback() {
        DuOutputParser.Result r = DuOutputParser.parse(
                "KB\n"
                        + "4\t./bin\n"
                        + "10\t.\n");
        assertTrue(r.kilobytes);
        assertEquals(4096L, r.entries.get("bin"));
        assertEquals(10240L, r.total);
    }

    @Test
    void childNameSkipsDot() {
        assertNull(DuOutputParser.childName("."));
        assertNull(DuOutputParser.childName("./"));
        assertEquals("var", DuOutputParser.childName("./var"));
        assertEquals("var", DuOutputParser.childName("/var"));
    }

    @Test
    void totalNotSmallerThanChildren() {
        DuOutputParser.Result r = DuOutputParser.parse(
                "BYTES\n"
                        + "54525952\t.\n"
                        + "34359738368\t./data\n");
        assertEquals(34359738368L, r.total);
        assertEquals(34359738368L, r.entries.get("data"));
    }
}
