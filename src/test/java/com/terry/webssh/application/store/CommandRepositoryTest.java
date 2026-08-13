package com.terry.webssh.application.store;

import com.terry.webssh.application.pojo.CommandItem;
import com.terry.webssh.application.pojo.SessionCommandSettings;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CommandRepositoryTest {

    @Test
    void importsDictOnceWhenMissing(@TempDir Path temp) throws Exception {
        Path dict = temp.resolve("dict.json");
        Files.write(dict, ("{\"status\":200,\"result\":[{\"name\":\"df\",\"value\":\"df -h\"}]}").getBytes(StandardCharsets.UTF_8));
        Path commands = temp.resolve("commands.json");
        CommandRepository repo = new CommandRepository(commands, dict);
        assertEquals(1, repo.listGlobal().size());
        assertEquals("df", repo.listGlobal().get(0).getName());
        // second instance must NOT re-import / duplicate
        CommandRepository repo2 = new CommandRepository(commands, dict);
        assertEquals(1, repo2.listGlobal().size());
    }

    @Test
    void sessionCommandsIsolated(@TempDir Path temp) {
        CommandRepository repo = new CommandRepository(temp.resolve("commands.json"), null);
        CommandItem g = repo.createGlobal("g", "echo g");
        CommandItem s = repo.createSession("sid1", "s", "echo s");
        assertEquals(1, repo.listGlobal().size());
        assertEquals(1, repo.listSession("sid1").size());
        assertTrue(repo.listSession("other").isEmpty());
        Map<String, List<CommandItem>> both = repo.listForSession("sid1");
        assertEquals(1, both.get("global").size());
        assertEquals(1, both.get("session").size());
        repo.deleteSession("sid1", s.getId());
        repo.deleteBySessionId("sid1");
        assertNotNull(g.getId());
    }

    @Test
    void settingsDefaultsAndSave(@TempDir Path temp) {
        CommandRepository repo = new CommandRepository(temp.resolve("commands.json"), null);
        SessionCommandSettings d = repo.getSettings("sid");
        assertTrue(d.isAutoCollect());
        assertEquals(1000, d.getCollectLimit());
        assertEquals(1, d.getCollectLines());
        d.setCollectLimit(10);
        d.setCollectLines(2);
        d.setAutoCollect(false);
        SessionCommandSettings saved = repo.saveSettings("sid", d);
        assertEquals(10, saved.getCollectLimit());
        assertFalse(repo.getSettings("sid").isAutoCollect());
    }

    @Test
    void collectDedupesAndTrimsToLimit(@TempDir Path temp) {
        CommandRepository repo = new CommandRepository(temp.resolve("commands.json"), null);
        SessionCommandSettings s = repo.getSettings("sid");
        s.setCollectLimit(2);
        s.setCollectLines(5);
        repo.saveSettings("sid", s);
        assertEquals(1, repo.collect("sid", "echo a"));
        assertEquals(1, repo.collect("sid", "echo b"));
        assertEquals(1, repo.collect("sid", "echo c")); // drops oldest
        List<CommandItem> list = repo.listSession("sid");
        assertEquals(2, list.size());
        assertEquals("echo c", list.get(0).getValue());
        assertEquals(1, repo.collect("sid", "echo c")); // dedupe still counts as processed
        list = repo.listSession("sid");
        assertEquals(2, list.size());
        assertEquals("echo c", list.get(0).getValue());
    }

    @Test
    void collectRespectsAutoCollectOffAndLines(@TempDir Path temp) {
        CommandRepository repo = new CommandRepository(temp.resolve("commands.json"), null);
        SessionCommandSettings s = repo.getSettings("sid");
        s.setAutoCollect(false);
        repo.saveSettings("sid", s);
        assertEquals(0, repo.collect("sid", "echo x"));
        assertTrue(repo.listSession("sid").isEmpty());
        s.setAutoCollect(true);
        s.setCollectLines(2);
        repo.saveSettings("sid", s);
        assertEquals(2, repo.collect("sid", "line1\nline2\nline3"));
        assertEquals(2, repo.listSession("sid").size());
    }

    @Test
    void saveSettingsRejectsInvalidCollectLimitAndLines(@TempDir Path temp) {
        CommandRepository repo = new CommandRepository(temp.resolve("commands.json"), null);
        SessionCommandSettings s = repo.getSettings("sid");

        s.setCollectLimit(0);
        assertThrows(IllegalArgumentException.class, () -> repo.saveSettings("sid", s));

        s.setCollectLimit(1001);
        assertThrows(IllegalArgumentException.class, () -> repo.saveSettings("sid", s));

        s.setCollectLimit(10);
        s.setCollectLines(0);
        assertThrows(IllegalArgumentException.class, () -> repo.saveSettings("sid", s));

        s.setCollectLines(51);
        assertThrows(IllegalArgumentException.class, () -> repo.saveSettings("sid", s));
    }

    @Test
    void deleteBySessionIdClearsSettings(@TempDir Path temp) {
        CommandRepository repo = new CommandRepository(temp.resolve("commands.json"), null);
        SessionCommandSettings s = repo.getSettings("sid");
        s.setAutoCollect(false);
        s.setCollectLimit(10);
        repo.saveSettings("sid", s);
        repo.createSession("sid", "n", "echo x");
        repo.deleteBySessionId("sid");
        assertTrue(repo.listSession("sid").isEmpty());
        SessionCommandSettings after = repo.getSettings("sid");
        assertTrue(after.isAutoCollect());
        assertEquals(1000, after.getCollectLimit());
    }
}
