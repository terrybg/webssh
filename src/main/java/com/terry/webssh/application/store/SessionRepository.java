package com.terry.webssh.application.store;

import cn.hutool.core.util.StrUtil;
import com.terry.webssh.application.pojo.SessionConfig;
import lombok.Data;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Component
public class SessionRepository {
    private final JsonFileStore store;

    public SessionRepository() {
        this(Paths.get(System.getProperty("user.dir"), "data", "sessions.json"));
    }

    public SessionRepository(Path file) {
        this.store = new JsonFileStore(file);
    }

    public List<SessionConfig> list() {
        return new ArrayList<>(load().getItems());
    }

    public SessionConfig get(String id) {
        for (SessionConfig item : load().getItems()) {
            if (id != null && id.equals(item.getId())) {
                return item;
            }
        }
        return null;
    }

    public SessionConfig create(SessionConfig config) {
        validate(config);
        SessionStoreData data = load();
        config.setId(UUID.randomUUID().toString());
        config.setUpdatedAt(System.currentTimeMillis());
        data.getItems().add(config);
        store.write(data);
        return config;
    }

    public SessionConfig update(String id, SessionConfig config) {
        validate(config);
        SessionStoreData data = load();
        for (int i = 0; i < data.getItems().size(); i++) {
            if (id != null && id.equals(data.getItems().get(i).getId())) {
                config.setId(id);
                config.setUpdatedAt(System.currentTimeMillis());
                data.getItems().set(i, config);
                store.write(data);
                return config;
            }
        }
        throw new IllegalArgumentException("session not found: " + id);
    }

    public boolean delete(String id) {
        SessionStoreData data = load();
        boolean removed = data.getItems().removeIf(item -> id != null && id.equals(item.getId()));
        if (removed) {
            store.write(data);
        }
        return removed;
    }

    private SessionStoreData load() {
        return store.read(SessionStoreData.class, SessionStoreData::new);
    }

    private static void validate(SessionConfig config) {
        if (config == null) {
            throw new IllegalArgumentException("session is required");
        }
        if (StrUtil.isBlank(config.getName())) {
            throw new IllegalArgumentException("name is required");
        }
        if (StrUtil.isBlank(config.getIp())) {
            throw new IllegalArgumentException("ip is required");
        }
        if (StrUtil.isBlank(config.getUserName())) {
            throw new IllegalArgumentException("userName is required");
        }
        if (config.getPort() == null || config.getPort() <= 0) {
            throw new IllegalArgumentException("port must be > 0");
        }
    }

    @Data
    static class SessionStoreData {
        private List<SessionConfig> items = new ArrayList<>();
    }
}
