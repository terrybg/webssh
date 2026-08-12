package com.terry.webssh.application.store;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.function.Supplier;

public class JsonFileStore {
    private final Path file;

    public JsonFileStore(Path file) {
        this.file = file;
    }

    public synchronized <T> T read(Class<T> type, Supplier<T> empty) {
        try {
            if (!Files.exists(file)) {
                return empty.get();
            }
            String json = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
            if (StrUtil.isBlank(json)) {
                return empty.get();
            }
            T value = JSONUtil.toBean(json, type);
            return value != null ? value : empty.get();
        } catch (IOException e) {
            throw new IllegalStateException("failed to read " + file, e);
        }
    }

    public synchronized void write(Object value) {
        try {
            Path parent = file.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Path tmp = file.resolveSibling(file.getFileName().toString() + ".tmp");
            byte[] bytes = JSONUtil.toJsonPrettyStr(value).getBytes(StandardCharsets.UTF_8);
            Files.write(tmp, bytes);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new IllegalStateException("failed to write " + file, e);
        }
    }
}
