package com.terry.webssh.application.store;

import com.terry.webssh.application.pojo.CommandItem;
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
}
