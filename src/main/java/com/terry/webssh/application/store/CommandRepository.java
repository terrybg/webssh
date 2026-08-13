package com.terry.webssh.application.store;

import cn.hutool.core.io.IoUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.terry.webssh.application.pojo.CommandItem;
import com.terry.webssh.application.pojo.SessionCommandSettings;
import lombok.Data;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class CommandRepository {
    private static final String CLASSPATH_DICT = "static/webssh/data/dict.json";

    private final Object lock = new Object();
    private final JsonFileStore store;
    private final Path commandsFile;
    private final Path dictPath;
    private final boolean useClasspathDict;

    public CommandRepository() {
        this(Paths.get(System.getProperty("user.dir"), "data", "commands.json"), null, true);
    }

    public CommandRepository(Path commandsFile, Path dictPath) {
        this(commandsFile, dictPath, false);
    }

    private CommandRepository(Path commandsFile, Path dictPath, boolean useClasspathDict) {
        this.commandsFile = commandsFile;
        this.dictPath = dictPath;
        this.useClasspathDict = useClasspathDict;
        this.store = new JsonFileStore(commandsFile);
    }

    public List<CommandItem> listGlobal() {
        synchronized (lock) {
            return new ArrayList<>(load().getGlobal());
        }
    }

    public List<CommandItem> listSession(String sessionId) {
        synchronized (lock) {
            return new ArrayList<>(sessionList(load(), sessionId));
        }
    }

    public Map<String, List<CommandItem>> listForSession(String sessionId) {
        synchronized (lock) {
            CommandStoreData data = load();
            Map<String, List<CommandItem>> result = new LinkedHashMap<>();
            result.put("global", new ArrayList<>(data.getGlobal()));
            result.put("session", new ArrayList<>(sessionList(data, sessionId)));
            return result;
        }
    }

    public CommandItem createGlobal(String name, String value) {
        synchronized (lock) {
            validateNameValue(name, value);
            CommandStoreData data = load();
            CommandItem item = newItem(name, value);
            data.getGlobal().add(item);
            store.write(data);
            return item;
        }
    }

    public CommandItem createSession(String sessionId, String name, String value) {
        synchronized (lock) {
            if (StrUtil.isBlank(sessionId)) {
                throw new IllegalArgumentException("sessionId is required");
            }
            validateNameValue(name, value);
            CommandStoreData data = load();
            CommandItem item = newItem(name, value);
            data.getBySession().computeIfAbsent(sessionId, k -> new ArrayList<>()).add(item);
            store.write(data);
            return item;
        }
    }

    public CommandItem updateGlobal(String id, String name, String value) {
        synchronized (lock) {
            validateNameValue(name, value);
            CommandStoreData data = load();
            CommandItem item = findById(data.getGlobal(), id);
            if (item == null) {
                throw new IllegalArgumentException("command not found: " + id);
            }
            item.setName(name);
            item.setValue(value);
            item.setUpdatedAt(Instant.now().toString());
            store.write(data);
            return item;
        }
    }

    public CommandItem updateSession(String sessionId, String id, String name, String value) {
        synchronized (lock) {
            if (StrUtil.isBlank(sessionId)) {
                throw new IllegalArgumentException("sessionId is required");
            }
            validateNameValue(name, value);
            CommandStoreData data = load();
            List<CommandItem> list = data.getBySession().get(sessionId);
            CommandItem item = findById(list, id);
            if (item == null) {
                throw new IllegalArgumentException("command not found: " + id);
            }
            item.setName(name);
            item.setValue(value);
            item.setUpdatedAt(Instant.now().toString());
            store.write(data);
            return item;
        }
    }

    public boolean deleteGlobal(String id) {
        synchronized (lock) {
            CommandStoreData data = load();
            boolean removed = data.getGlobal().removeIf(item -> id != null && id.equals(item.getId()));
            if (removed) {
                store.write(data);
            }
            return removed;
        }
    }

    public boolean deleteSession(String sessionId, String id) {
        synchronized (lock) {
            CommandStoreData data = load();
            List<CommandItem> list = data.getBySession().get(sessionId);
            if (list == null) {
                return false;
            }
            boolean removed = list.removeIf(item -> id != null && id.equals(item.getId()));
            if (removed) {
                if (list.isEmpty()) {
                    data.getBySession().remove(sessionId);
                }
                store.write(data);
            }
            return removed;
        }
    }

    public void deleteBySessionId(String sessionId) {
        synchronized (lock) {
            CommandStoreData data = load();
            boolean removedCommands = data.getBySession().remove(sessionId) != null;
            boolean removedSettings = data.getSessionSettings().remove(sessionId) != null;
            if (removedCommands || removedSettings) {
                store.write(data);
            }
        }
    }

    public SessionCommandSettings getSettings(String sessionId) {
        synchronized (lock) {
            CommandStoreData data = load();
            return copySettings(settingsOrDefault(data, sessionId));
        }
    }

    public SessionCommandSettings saveSettings(String sessionId, SessionCommandSettings settings) {
        synchronized (lock) {
            if (StrUtil.isBlank(sessionId)) {
                throw new IllegalArgumentException("sessionId is required");
            }
            if (settings == null) {
                throw new IllegalArgumentException("settings is required");
            }
            SessionCommandSettings validated = validateSettings(settings);
            CommandStoreData data = load();
            data.getSessionSettings().put(sessionId, copySettings(validated));
            store.write(data);
            return copySettings(validated);
        }
    }

    public int collect(String sessionId, String text) {
        synchronized (lock) {
            if (StrUtil.isBlank(sessionId)) {
                throw new IllegalArgumentException("sessionId is required");
            }
            CommandStoreData data = load();
            SessionCommandSettings settings = settingsOrDefault(data, sessionId);
            if (!settings.isAutoCollect()) {
                return 0;
            }
            List<String> lines = takeCollectLines(text, settings.getCollectLines());
            if (lines.isEmpty()) {
                return 0;
            }
            List<CommandItem> list = data.getBySession().computeIfAbsent(sessionId, k -> new ArrayList<>());
            for (String line : lines) {
                CommandItem existing = findByValue(list, line);
                if (existing != null) {
                    list.remove(existing);
                    existing.setUpdatedAt(Instant.now().toString());
                    list.add(0, existing);
                } else {
                    list.add(0, newItem(nameFrom(line), line));
                }
            }
            int limit = settings.getCollectLimit();
            while (list.size() > limit) {
                list.remove(list.size() - 1);
            }
            store.write(data);
            return lines.size();
        }
    }

    private CommandStoreData load() {
        if (Files.exists(commandsFile)) {
            CommandStoreData data = store.read(CommandStoreData.class, CommandStoreData::new);
            normalize(data);
            return data;
        }
        CommandStoreData imported = importFromDictOrEmpty();
        // persist only when dict produced entries so a second instance will not re-import
        if (!imported.getGlobal().isEmpty()) {
            store.write(imported);
        }
        return imported;
    }

    private CommandStoreData importFromDictOrEmpty() {
        String json = readDictJson();
        if (StrUtil.isBlank(json)) {
            return new CommandStoreData();
        }
        JSONObject root = JSONUtil.parseObj(json);
        JSONArray result = root.getJSONArray("result");
        CommandStoreData data = new CommandStoreData();
        if (result == null) {
            return data;
        }
        for (int i = 0; i < result.size(); i++) {
            JSONObject row = result.getJSONObject(i);
            if (row == null) {
                continue;
            }
            String name = row.getStr("name");
            String value = row.getStr("value");
            if (StrUtil.isBlank(name) || StrUtil.isBlank(value)) {
                continue;
            }
            data.getGlobal().add(newItem(name, value));
        }
        return data;
    }

    private String readDictJson() {
        if (dictPath != null && Files.isRegularFile(dictPath)) {
            try {
                return new String(Files.readAllBytes(dictPath), StandardCharsets.UTF_8);
            } catch (Exception e) {
                throw new IllegalStateException("failed to read dict " + dictPath, e);
            }
        }
        if (useClasspathDict) {
            ClassPathResource resource = new ClassPathResource(CLASSPATH_DICT);
            if (!resource.exists()) {
                return null;
            }
            try (InputStream in = resource.getInputStream()) {
                return IoUtil.read(in, StandardCharsets.UTF_8);
            } catch (Exception e) {
                throw new IllegalStateException("failed to read classpath dict " + CLASSPATH_DICT, e);
            }
        }
        return null;
    }

    private static void normalize(CommandStoreData data) {
        if (data.getGlobal() == null) {
            data.setGlobal(new ArrayList<>());
        }
        if (data.getBySession() == null) {
            data.setBySession(new HashMap<>());
        }
        if (data.getSessionSettings() == null) {
            data.setSessionSettings(new HashMap<>());
        }
    }

    private static List<CommandItem> sessionList(CommandStoreData data, String sessionId) {
        if (sessionId == null) {
            return Collections.emptyList();
        }
        List<CommandItem> list = data.getBySession().get(sessionId);
        return list != null ? list : Collections.emptyList();
    }

    private static SessionCommandSettings settingsOrDefault(CommandStoreData data, String sessionId) {
        SessionCommandSettings stored = sessionId == null ? null : data.getSessionSettings().get(sessionId);
        if (stored == null) {
            return defaultSettings();
        }
        return stored;
    }

    private static SessionCommandSettings defaultSettings() {
        SessionCommandSettings settings = new SessionCommandSettings();
        settings.setAutoCollect(true);
        settings.setCollectLimit(1000);
        settings.setCollectLines(1);
        return settings;
    }

    private static SessionCommandSettings copySettings(SessionCommandSettings source) {
        SessionCommandSettings copy = new SessionCommandSettings();
        copy.setAutoCollect(source.isAutoCollect());
        copy.setCollectLimit(source.getCollectLimit());
        copy.setCollectLines(source.getCollectLines());
        return copy;
    }

    private static SessionCommandSettings validateSettings(SessionCommandSettings settings) {
        int collectLimit = settings.getCollectLimit();
        if (collectLimit < 1 || collectLimit > 1000) {
            throw new IllegalArgumentException("collectLimit must be between 1 and 1000");
        }
        int collectLines = settings.getCollectLines();
        if (collectLines < 1 || collectLines > 50) {
            throw new IllegalArgumentException("collectLines must be between 1 and 50");
        }
        SessionCommandSettings validated = new SessionCommandSettings();
        validated.setAutoCollect(settings.isAutoCollect());
        validated.setCollectLimit(collectLimit);
        validated.setCollectLines(collectLines);
        return validated;
    }

    private static List<String> takeCollectLines(String text, int collectLines) {
        List<String> lines = new ArrayList<>();
        if (text == null) {
            return lines;
        }
        String[] parts = text.split("\\r?\\n");
        for (String part : parts) {
            if (part == null) {
                continue;
            }
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            lines.add(trimmed);
            if (lines.size() >= collectLines) {
                break;
            }
        }
        return lines;
    }

    private static String nameFrom(String line) {
        if (line.length() <= 40) {
            return line;
        }
        return line.substring(0, 40);
    }

    private static CommandItem findById(List<CommandItem> list, String id) {
        if (list == null || id == null) {
            return null;
        }
        for (CommandItem item : list) {
            if (id.equals(item.getId())) {
                return item;
            }
        }
        return null;
    }

    private static CommandItem findByValue(List<CommandItem> list, String value) {
        if (list == null || value == null) {
            return null;
        }
        for (CommandItem item : list) {
            if (value.equals(item.getValue())) {
                return item;
            }
        }
        return null;
    }

    private static CommandItem newItem(String name, String value) {
        CommandItem item = new CommandItem();
        item.setId(UUID.randomUUID().toString());
        item.setName(name);
        item.setValue(value);
        item.setUpdatedAt(Instant.now().toString());
        return item;
    }

    private static void validateNameValue(String name, String value) {
        if (StrUtil.isBlank(name)) {
            throw new IllegalArgumentException("name is required");
        }
        if (StrUtil.isBlank(value)) {
            throw new IllegalArgumentException("value is required");
        }
    }

    @Data
    static class CommandStoreData {
        private List<CommandItem> global = new ArrayList<>();
        private Map<String, List<CommandItem>> bySession = new HashMap<>();
        private Map<String, SessionCommandSettings> sessionSettings = new HashMap<>();
    }
}
