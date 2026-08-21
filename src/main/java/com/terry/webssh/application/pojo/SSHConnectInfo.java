package com.terry.webssh.application.pojo;

import cn.hutool.extra.ssh.Sftp;
import com.jcraft.jsch.Channel;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import lombok.Data;
import org.springframework.web.socket.WebSocketSession;

import java.io.BufferedReader;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * ssh连接信息
 * @version 1.0
 * @author terry
 * @date 2022/7/4
 */
@Data
public class SSHConnectInfo {

    public static final String PWD_MARK_START = "__WEBSSH_PWD__";
    public static final String PWD_MARK_END = "__WEBSSH_PWD_END__";

    private WebSocketSession webSocketSession;
    private String tagId;
    private String userId;
    private JSch jSch;
    private Channel channel;
    private Session session;
    private String encoded;
    private Sftp sftp;
    /** 共享连接建立时的账号，改密后用于判定是否需要重连 */
    private String cachedUserName;
    private String cachedPassword;

    BufferedReader stdInput;
    BufferedReader stdError;
    Process process;

    /** 查询交互式 shell 当前目录时的捕获缓冲 */
    private final StringBuilder pwdOutBuf = new StringBuilder();
    /** 0 idle, 1 wait path, 2 wait end */
    private volatile int pwdState;
    private final AtomicReference<String> capturedPwd = new AtomicReference<>();
    private volatile CountDownLatch pwdLatch;
    /** 探测尚未完全结束（含 await 超时后仍要吞掉残留输出） */
    private volatile boolean pwdActive;
    /** 探测结束后再吞掉若干行（新提示符），避免终端多出 tony@host:~$ */
    private volatile int suppressPromptRemaining;

    public synchronized void beginPwdCapture() {
        pwdOutBuf.setLength(0);
        pwdState = 0;
        capturedPwd.set(null);
        pwdActive = true;
        suppressPromptRemaining = 0;
        pwdLatch = new CountDownLatch(1);
    }

    public String awaitPwd(long timeoutMs) {
        CountDownLatch latch = pwdLatch;
        if (latch == null) {
            return capturedPwd.get();
        }
        try {
            latch.await(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        String path = capturedPwd.get();
        synchronized (this) {
            // 只释放等待；过滤状态留给 filter 继续吞到 END，并抑制随后的提示符
            if (pwdLatch != null) {
                pwdLatch = null;
            }
            if (pwdActive) {
                // 超时仍未结束：继续按探测过滤，结束后再吞提示符
                suppressPromptRemaining = Math.max(suppressPromptRemaining, 2);
            }
        }
        return path;
    }

    /**
     * 过滤 pwd 探测输出，避免刷到终端；同时解析路径。
     * 探测进行期间抑制相关输出；结束后再抑制紧随其后的新提示符行。
     */
    public synchronized String filterPwdCapture(String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return chunk;
        }
        boolean busy = pwdActive || suppressPromptRemaining > 0 || pwdOutBuf.length() > 0;
        if (!busy) {
            return chunk;
        }
        pwdOutBuf.append(chunk);
        StringBuilder emit = new StringBuilder();
        while (true) {
            int nl = indexOfNewline(pwdOutBuf);
            if (nl < 0) {
                // 非探测中的无换行残留才放出；探测中的半行继续攒
                if (!pwdActive && suppressPromptRemaining <= 0 && pwdState == 0) {
                    emit.append(pwdOutBuf);
                    pwdOutBuf.setLength(0);
                }
                break;
            }
            String line = pwdOutBuf.substring(0, nl);
            int drop = nl + 1;
            if (nl + 1 < pwdOutBuf.length()
                    && pwdOutBuf.charAt(nl) == '\r'
                    && pwdOutBuf.charAt(nl + 1) == '\n') {
                drop = nl + 2;
            }
            pwdOutBuf.delete(0, drop);
            String trimmed = line.replace("\r", "").trim();

            if (pwdActive) {
                if (pwdState == 0) {
                    if (trimmed.contains(PWD_MARK_START)) {
                        pwdState = 1;
                    }
                    // 探测命令回显、空行一律吞掉
                    continue;
                }
                if (pwdState == 1) {
                    if (trimmed.contains(PWD_MARK_START) || trimmed.isEmpty()) {
                        continue;
                    }
                    if (trimmed.contains(PWD_MARK_END)) {
                        finishPwd();
                        continue;
                    }
                    if (trimmed.startsWith("/") || trimmed.matches("^[A-Za-z]:[\\\\/].*")) {
                        capturedPwd.set(trimmed);
                        pwdState = 2;
                    }
                    continue;
                }
                // pwdState == 2：等到结束标记
                if (trimmed.contains(PWD_MARK_END) || trimmed.contains(PWD_MARK_START)) {
                    finishPwd();
                }
                continue;
            }

            // 探测刚结束：吞掉紧随其后的提示符/空行
            if (suppressPromptRemaining > 0) {
                suppressPromptRemaining--;
                continue;
            }
            emit.append(line).append('\n');
        }
        return emit.toString();
    }

    private void finishPwd() {
        CountDownLatch latch = pwdLatch;
        pwdLatch = null;
        pwdActive = false;
        pwdState = 0;
        // 吞掉命令结束后 shell 打印的新提示符（通常 1 行，多留 1 行容错）
        suppressPromptRemaining = Math.max(suppressPromptRemaining, 2);
        if (latch != null) {
            latch.countDown();
        }
    }

    private static int indexOfNewline(StringBuilder sb) {
        for (int i = 0; i < sb.length(); i++) {
            char c = sb.charAt(i);
            if (c == '\n' || c == '\r') {
                return i;
            }
        }
        return -1;
    }
}
