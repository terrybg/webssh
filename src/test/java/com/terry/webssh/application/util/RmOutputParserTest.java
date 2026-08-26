package com.terry.webssh.application.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RmOutputParserTest {

    @Test
    void parsesGnuRmVerbose() {
        assertEquals("/tmp/a.txt", RmOutputParser.parseRemoved("removed '/tmp/a.txt'"));
        assertEquals("/tmp/d", RmOutputParser.parseRemoved("removed directory '/tmp/d'"));
        assertEquals("foo", RmOutputParser.parseRemoved("removing 'foo'"));
    }

    @Test
    void ignoresErrors() {
        assertNull(RmOutputParser.parseRemoved("rm: cannot remove '/x': Permission denied"));
        assertNull(RmOutputParser.parseRemoved(""));
    }
}
