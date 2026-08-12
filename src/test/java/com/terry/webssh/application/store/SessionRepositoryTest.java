package com.terry.webssh.application.store;

import com.terry.webssh.application.pojo.SessionConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SessionRepositoryTest {
    @TempDir Path temp;
    SessionRepository repo;

    @BeforeEach
    void setUp() {
        repo = new SessionRepository(temp.resolve("sessions.json"));
    }

    @Test
    void createListUpdateDelete() {
        SessionConfig created = repo.create(newSession("prod", "10.0.0.1", 22, "root", "secret"));
        assertNotNull(created.getId());
        List<SessionConfig> list = repo.list();
        assertEquals(1, list.size());
        assertEquals("prod", list.get(0).getName());

        created.setName("prod2");
        SessionConfig updated = repo.update(created.getId(), created);
        assertEquals("prod2", updated.getName());

        assertTrue(repo.delete(created.getId()));
        assertTrue(repo.list().isEmpty());
        assertFalse(repo.delete("missing"));
    }

    private static SessionConfig newSession(String name, String ip, int port, String user, String pass) {
        SessionConfig s = new SessionConfig();
        s.setName(name);
        s.setIp(ip);
        s.setPort(port);
        s.setUserName(user);
        s.setPassword(pass);
        return s;
    }
}
