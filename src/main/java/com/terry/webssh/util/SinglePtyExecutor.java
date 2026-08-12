package com.terry.webssh.util;


import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import lombok.extern.slf4j.Slf4j;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;

@Slf4j
public class SinglePtyExecutor {

    private static SinglePtyExecutor instance;
    private PtyProcess process;
    private Thread outputThread;
    private Thread errorThread;

    private SinglePtyExecutor() {
    }

    public static SinglePtyExecutor getInstance() {
        if (instance == null) {
            synchronized (SinglePtyExecutor.class) {
                if (instance == null) {
                    instance = new SinglePtyExecutor();
                }
            }
        }
        return instance;
    }

    public void execute(String command, Consumer<String> consumer) {
        if (process != null && process.isAlive()) {
            log.info("Another process is already running.");
            return;
        }

        try {
            String commandPrefix;
            String type;

            // 根据操作系统设置命令前缀和参数
            if (System.getProperty("os.name").toLowerCase().contains("win")) {
                commandPrefix = "powershell.exe";
                type = "-Command";
            } else {
                commandPrefix = "/bin/sh";
                type = "-c";
            }

            String[] cmd = new String[]{commandPrefix, type, command};

            // 使用 PtyProcessBuilder 启动进程
            process = new PtyProcessBuilder()
                    .setCommand(cmd)
                    .start();

            // 异步读取进程的标准输出
            outputThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        consumer.accept(line);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
            outputThread.start();

            // 异步读取进程的错误输出
            errorThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        consumer.accept("ERROR: " + line);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
            errorThread.start();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    int count = 0;
    private long lastExecuteTime = 0;
    private static final long MIN_INTERVAL = 1000; // 最小间隔时间（毫秒）

    public synchronized void autoExecute(String command, Consumer<String> consumer) {
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastExecuteTime < MIN_INTERVAL) {
            consumer.accept("请求过于频繁，还有命令在执行，请重试！");
            return;
        }
        lastExecuteTime = currentTime;

        log.info("autoExecute start... {}", count);
        if (process != null && process.isAlive()) {
            stopCommand();
        }
        execute(command, consumer);
        log.info("autoExecute end... {}", count++);
    }

    public void stopCommand() {
        if (process != null && process.isAlive()) {
            try {
                // 发送 Ctrl + C 命令
                try (OutputStreamWriter writer = new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8)) {
                    writer.write("\u0003"); // ASCII 值 3 对应 Ctrl + C
                    writer.write("\n");
                    writer.flush();
                }

                // 等待进程终止并获取退出码
                int exitCode = process.waitFor();
                log.info("Process exited with code: " + exitCode);

                // 等待输出线程结束
                if (outputThread != null) {
                    outputThread.join(1000);
                }
                if (errorThread != null) {
                    errorThread.join(1000);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}