package com.terry.webssh.application.ctrl;

import cn.hutool.core.date.DatePattern;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.ssh.JschUtil;
import cn.hutool.extra.ssh.Sftp;
import com.jcraft.jsch.*;
import com.terry.webssh.application.pojo.SSHConnectInfo;
import com.terry.webssh.application.pojo.Server;
import com.terry.webssh.application.pojo.StatusContent;
import com.terry.webssh.application.service.WebSSHService;
import com.terry.webssh.application.pojo.SftpFile;
import com.terry.webssh.util.ProgressInputStream;
import lombok.extern.java.Log;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.Vector;

/**
 * (Server)表控制层
 *
 * @author makejava
 * @since 2022-01-23 19:45:07
 */
@RestController
@RequestMapping("/webssh/api")
@CrossOrigin
@Log
public class RemoteController {

    RemoteController(){
        System.out.println("RemoteController...........");
    }

    /**
     * 上传：响应为 NDJSON 流。
     * 浏览器侧 xhr.upload 只能反映「发到本机」；本接口在收到文件后推送 remote 写入进度，
     * 最后一行 phase=done / error。
     */
    @PostMapping("/upload")
    public void upload(String path, String tagId,
                       @RequestParam(value = "fileName", required = false) String fileName,
                       @RequestPart MultipartFile file,
                       HttpServletResponse response) throws IOException {
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/x-ndjson;charset=UTF-8");
        response.setHeader("Cache-Control", "no-cache, no-store");
        response.setHeader("X-Accel-Buffering", "no");
        PrintWriter writer = response.getWriter();

        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"未登录或会话已过期\"}");
            return;
        }
        if (file == null || file.isEmpty()) {
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"未选择文件\"}");
            return;
        }
        if (StrUtil.isBlank(path)) {
            path = "/";
        }
        String name = StrUtil.isNotBlank(fileName) ? fileName.trim() : file.getOriginalFilename();
        if (StrUtil.isBlank(name) || name.contains("/") || name.contains("\\")
                || ".".equals(name) || "..".equals(name)) {
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"文件名不合法\"}");
            return;
        }
        SSHConnectInfo cacheSsh = getCacheSsh(server);
        if (!path.endsWith("/")) {
            path = path + "/";
        }
        long total = file.getSize();
        writeUploadEvent(writer, "{\"phase\":\"remote\",\"loaded\":0,\"total\":" + total + "}");
        try {
            synchronized (cacheSsh) {
                Sftp sftp = cacheSsh.getSftp();
                ProgressInputStream pin = new ProgressInputStream(file.getInputStream(), total, (loaded, tot) -> {
                    writeUploadEvent(writer, "{\"phase\":\"remote\",\"loaded\":" + loaded + ",\"total\":" + tot + "}");
                });
                boolean ok;
                try (InputStream in = pin) {
                    ok = sftp.upload(path, name, in);
                }
                if (ok) {
                    writeUploadEvent(writer, "{\"phase\":\"done\",\"status\":200,\"message\":\"操作成功！\",\"result\":"
                            + jsonQuote(name) + "}");
                } else {
                    writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"操作失败！\"}");
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
            try {
                invalidateSharedSftp(cacheSsh);
            } catch (Exception ignored) {
                // ignore
            }
            String msg = e.getMessage() == null ? "上传失败" : e.getMessage();
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":" + jsonQuote("上传失败: " + msg) + "}");
        }
    }

    private static String jsonQuote(String s) {
        if (s == null) {
            return "null";
        }
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static void writeUploadEvent(PrintWriter writer, String jsonLine) {
        writer.write(jsonLine);
        writer.write('\n');
        writer.flush();
    }

    /**
     * 查询交互式终端当前工作目录（不影响终端显示）。
     * 若 shell 未连接，则回退到独立 exec 的 pwd（一般为登录目录）。
     */
    @GetMapping("/pwd")
    public StatusContent<String> pwd(@RequestParam("tagId") String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        SSHConnectInfo shell = WebSSHService.findShellByTagId(tagId);
        if (shell != null && shell.getChannel() != null && shell.getChannel().isConnected()) {
            try {
                // 注意：不可在持有 shell 监视器时 await。
                // await 期间读线程需要进入 filterPwdCapture（synchronized），否则会死锁直到超时。
                shell.beginPwdCapture();
                // 避免前导换行把当前提示符顶成单独一行
                String cmd = "printf '%s\\n' '" + SSHConnectInfo.PWD_MARK_START
                        + "'; pwd; printf '%s\\n' '" + SSHConnectInfo.PWD_MARK_END + "'\n";
                WebSSHService.writeToChannel(shell.getChannel(), cmd, shell.getEncoded());
                String path = shell.awaitPwd(1500);
                if (StrUtil.isNotBlank(path)) {
                    return StatusContent.ok("成功！", path.trim());
                }
            } catch (Exception e) {
                log.warning("shell pwd failed: " + e.getMessage());
            }
        }
        // 回退：exec（可能不是交互 shell 目录，但总比没有好）
        try {
            SSHConnectInfo cache = getCacheSsh(server);
            Session session = cache.getSession();
            ChannelExec exec = (ChannelExec) session.openChannel("exec");
            exec.setCommand("pwd");
            InputStream in = exec.getInputStream();
            exec.connect(3000);
            byte[] buf = new byte[1024];
            StringBuilder sb = new StringBuilder();
            int n;
            while ((n = in.read(buf)) > 0) {
                sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            }
            exec.disconnect();
            String path = sb.toString().trim();
            if (StrUtil.isNotBlank(path)) {
                return StatusContent.ok("成功！", path);
            }
        } catch (Exception e) {
            log.warning("exec pwd failed: " + e.getMessage());
            return StatusContent.error("获取目录失败: " + e.getMessage());
        }
        return StatusContent.error("无法获取当前目录");
    }

    private static final long PREVIEW_MAX_BYTES = 8L * 1024 * 1024;
    /** Excel 只读预览（SheetJS），略严于文本以免撑爆浏览器 */
    private static final long EXCEL_PREVIEW_MAX_BYTES = 5L * 1024 * 1024;
    /** 视频可边下边播，上限放宽 */
    private static final long VIDEO_PREVIEW_MAX_BYTES = 512L * 1024 * 1024;
    private static final Set<String> VIDEO_EXT = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "mp4", "webm", "ogg", "ogv", "m4v", "mov"
    )));
    private static final Set<String> EXCEL_EXT = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "xlsx", "xlsm", "xls"
    )));

    private static final Map<String, String> PREVIEW_MIME = new HashMap<>();

    static {
        PREVIEW_MIME.put("png", "image/png");
        PREVIEW_MIME.put("jpg", "image/jpeg");
        PREVIEW_MIME.put("jpeg", "image/jpeg");
        PREVIEW_MIME.put("gif", "image/gif");
        PREVIEW_MIME.put("webp", "image/webp");
        PREVIEW_MIME.put("bmp", "image/bmp");
        PREVIEW_MIME.put("ico", "image/x-icon");
        PREVIEW_MIME.put("svg", "image/svg+xml");
        PREVIEW_MIME.put("mp4", "video/mp4");
        PREVIEW_MIME.put("m4v", "video/mp4");
        PREVIEW_MIME.put("webm", "video/webm");
        PREVIEW_MIME.put("ogg", "video/ogg");
        PREVIEW_MIME.put("ogv", "video/ogg");
        PREVIEW_MIME.put("mov", "video/quicktime");
        PREVIEW_MIME.put("txt", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("log", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("md", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("json", "application/json;charset=UTF-8");
        PREVIEW_MIME.put("xml", "application/xml;charset=UTF-8");
        PREVIEW_MIME.put("csv", "text/csv;charset=UTF-8");
        PREVIEW_MIME.put("yml", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("yaml", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("conf", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("ini", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("properties", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("sh", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("bash", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("py", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("js", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("ts", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("css", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("html", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("htm", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("sql", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("java", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("go", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("c", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("h", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("cpp", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("hpp", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("rs", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("toml", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("env", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("gitignore", "text/plain;charset=UTF-8");
        PREVIEW_MIME.put("dockerfile", "text/plain;charset=UTF-8");
        // Excel：用 octet-stream，避免浏览器把 /preview 导航当成「另存为 Office」
        PREVIEW_MIME.put("xlsx", "application/octet-stream");
        PREVIEW_MIME.put("xlsm", "application/octet-stream");
        PREVIEW_MIME.put("xls", "application/octet-stream");
    }

    private static String fileExt(String path) {
        if (path == null) {
            return "";
        }
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        String name = slash >= 0 ? path.substring(slash + 1) : path;
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return "";
        }
        return name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String fileNameOnly(String path) {
        if (path == null) {
            return "file";
        }
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return slash >= 0 ? path.substring(slash + 1) : path;
    }

    /** 每次预览/下载使用独立 ChannelSftp，避免与列表共用通道并发弄坏 JSch */
    private ChannelSftp openTempSftp(Session session) throws JSchException {
        if (session == null || !session.isConnected()) {
            throw new JSchException("SSH session 未连接");
        }
        Channel channel = session.openChannel("sftp");
        channel.connect(15000);
        return (ChannelSftp) channel;
    }

    private void closeQuietly(Channel channel) {
        if (channel == null) {
            return;
        }
        try {
            channel.disconnect();
        } catch (Exception ignored) {
            // ignore
        }
    }

    private void invalidateSharedSftp(SSHConnectInfo info) {
        if (info == null) {
            return;
        }
        Sftp sftp = info.getSftp();
        if (sftp == null) {
            return;
        }
        try {
            sftp.close();
        } catch (Exception ignored) {
            // ignore
        }
        info.setSftp(null);
    }

    /**
     * 下载
     */
    @GetMapping("/download")
    public void download(@RequestParam("path") String path, @RequestParam("tagId") String tagId,
                         HttpServletResponse response) throws IOException {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "未登录会话");
            return;
        }
        path = URLDecoder.decode(path, "UTF-8");
        SSHConnectInfo sshConnectInfo = getCacheSsh(server);
        String name = fileNameOnly(path);
        response.setContentType("application/octet-stream");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"" + URLEncoder.encode(name, StandardCharsets.UTF_8.name()).replace("+", "%20") + "\"");
        ChannelSftp ch = null;
        try {
            ch = openTempSftp(sshConnectInfo.getSession());
            ch.get(path, response.getOutputStream());
            response.flushBuffer();
        } catch (Exception e) {
            log.warning("download failed: " + e.getMessage());
            if (!response.isCommitted()) {
                response.sendError(HttpServletResponse.SC_NOT_FOUND, "下载失败: " + e.getMessage());
            }
        } finally {
            closeQuietly(ch);
        }
    }

    private void copyLimited(InputStream in, OutputStream out, long maxBytes) throws IOException {
        byte[] buf = new byte[8192];
        long remaining = maxBytes;
        while (remaining > 0) {
            int n = in.read(buf, 0, (int) Math.min(buf.length, remaining));
            if (n < 0) {
                break;
            }
            out.write(buf, 0, n);
            remaining -= n;
        }
    }

    private void skipFully(InputStream in, long skip) throws IOException {
        long left = skip;
        while (left > 0) {
            long n = in.skip(left);
            if (n > 0) {
                left -= n;
                continue;
            }
            if (in.read() < 0) {
                break;
            }
            left -= 1;
        }
    }

    /**
     * 内联预览（缩略图 / 图片 / 文本 / 视频）。Content-Disposition=inline。
     * 视频支持 Range，便于 HTML5 播放器拖动进度。
     */
    @GetMapping("/preview")
    public void preview(@RequestParam("path") String path, @RequestParam("tagId") String tagId,
                        HttpServletRequest request, HttpServletResponse response) throws IOException {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "未登录会话");
            return;
        }
        // Spring 已对 query 解码，避免二次 decode 弄坏含 % 的文件名
        if (StrUtil.isBlank(path)) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "路径为空");
            return;
        }
        String ext = fileExt(path);
        String mime = PREVIEW_MIME.get(ext);
        if (mime == null) {
            response.sendError(HttpServletResponse.SC_UNSUPPORTED_MEDIA_TYPE, "不支持预览该类型");
            return;
        }
        boolean video = VIDEO_EXT.contains(ext);
        boolean excel = EXCEL_EXT.contains(ext);
        long maxBytes = video ? VIDEO_PREVIEW_MAX_BYTES
                : (excel ? EXCEL_PREVIEW_MAX_BYTES : PREVIEW_MAX_BYTES);
        SSHConnectInfo sshConnectInfo = getCacheSsh(server);
        ChannelSftp ch = null;
        try {
            ch = openTempSftp(sshConnectInfo.getSession());
            long fileSize = -1;
            try {
                SftpATTRS attrs = ch.stat(path);
                if (attrs != null && attrs.isDir()) {
                    response.sendError(HttpServletResponse.SC_BAD_REQUEST, "不能预览目录");
                    return;
                }
                if (attrs != null) {
                    fileSize = attrs.getSize();
                    if (fileSize > maxBytes) {
                        String tooLarge = video
                                ? "视频过大无法预览（上限约 512MB）"
                                : (excel ? "Excel 过大无法预览（上限约 5MB）" : "文件过大无法预览");
                        response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, tooLarge);
                        return;
                    }
                }
            } catch (SftpException e) {
                log.warning("preview stat failed: " + e.getMessage());
            }
            String name = fileNameOnly(path);
            response.resetBuffer();
            response.setContentType(mime);
            response.setHeader("Content-Disposition",
                    "inline; filename=\"" + URLEncoder.encode(name, StandardCharsets.UTF_8.name()).replace("+", "%20") + "\"");
            response.setHeader("Cache-Control", "private, max-age=60");
            response.setHeader("Accept-Ranges", "bytes");

            String range = request.getHeader("Range");
            if (video && fileSize > 0 && range != null && range.startsWith("bytes=")) {
                String spec = range.substring(6).trim();
                long start = 0;
                long end = fileSize - 1;
                int dash = spec.indexOf('-');
                if (dash >= 0) {
                    String a = spec.substring(0, dash).trim();
                    String b = spec.substring(dash + 1).trim();
                    if (!a.isEmpty()) {
                        start = Long.parseLong(a);
                    }
                    if (!b.isEmpty()) {
                        end = Long.parseLong(b);
                    }
                }
                if (start < 0 || start >= fileSize || end < start) {
                    response.setHeader("Content-Range", "bytes */" + fileSize);
                    response.sendError(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
                    return;
                }
                end = Math.min(end, fileSize - 1);
                long len = end - start + 1;
                response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
                response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
                response.setContentLengthLong(len);
                try (InputStream in = ch.get(path)) {
                    skipFully(in, start);
                    copyLimited(in, response.getOutputStream(), len);
                }
            } else {
                if (fileSize > 0) {
                    response.setContentLengthLong(fileSize);
                }
                ch.get(path, response.getOutputStream());
            }
            response.flushBuffer();
        } catch (Exception e) {
            log.warning("preview download failed: " + e.getMessage());
            if (!response.isCommitted()) {
                response.sendError(HttpServletResponse.SC_NOT_FOUND, "预览失败: " + e.getMessage());
            }
        } finally {
            closeQuietly(ch);
        }
    }

    /**
     * 查询目录
     */
    @GetMapping("/ls")
    public StatusContent<List<SftpFile>> ls(@RequestParam("path") String path, @RequestParam("tagId") String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期，请重新连接");
        }
        try {
            // 兼容旧客户端二次编码；已解码路径再 decode 通常无害
            path = URLDecoder.decode(path, "UTF-8");
        } catch (Exception ignored) {
            // keep original path
        }

        SSHConnectInfo sshConnectInfo = getCacheSsh(server);
        if (StrUtil.isEmpty(path)) {
            path = "";
        }
        List<ChannelSftp.LsEntry> lsEntries;
        synchronized (sshConnectInfo) {
            Sftp sftp = sshConnectInfo.getSftp();
            try {
                lsEntries = sftp.lsEntries(path);
            } catch (Exception e) {
                String msg = e.getMessage() == null ? String.valueOf(e) : e.getMessage();
                boolean transientFail = msg.contains("Pipe closed")
                        || msg.contains("inputstream is closed")
                        || msg.contains("channel is not opened")
                        || msg.contains("session is down")
                        || msg.contains("Not connected");
                if (transientFail) {
                    // 仅连接损坏时重建共享通道
                    log.warning("ls failed, recreate sftp: " + msg);
                    invalidateSharedSftp(sshConnectInfo);
                    try {
                        sftp = getCacheSsh(server).getSftp();
                        lsEntries = sftp.lsEntries(path);
                    } catch (Exception e2) {
                        log.warning("ls retry failed: " + e2.getMessage());
                        return StatusContent.error("列出目录失败: " + e2.getMessage());
                    }
                } else {
                    // Permission denied / No such file 等：不拆通道，避免拖垮后续正常浏览
                    log.warning("ls denied/fail path=" + path + " : " + msg);
                    return StatusContent.error("列出目录失败: " + msg);
                }
            }
        }
        List<SftpFile> files = new ArrayList<>();
        for (ChannelSftp.LsEntry item : lsEntries) {
            String name = item.getFilename();
            if (".".equals(name) || "..".equals(name)) {
                continue;
            }
            SftpFile sftpFile = new SftpFile();
            sftpFile.setName(name);
            sftpFile.setDir(item.getAttrs().isDir());
            sftpFile.setSize(item.getAttrs().getSize());
            // SFTP 通常只有 mtime；用秒级时间戳格式化，供详细信息视图展示
            long mtimeMs = item.getAttrs().getMTime() * 1000L;
            String mtime = DateUtil.format(new Date(mtimeMs), DatePattern.NORM_DATETIME_PATTERN);
            sftpFile.setModifyTime(mtime);
            sftpFile.setCreateTime(mtime);
            int perm = item.getAttrs().getPermissions() & 0777;
            sftpFile.setPermissions(String.format("%03o", perm));
            sftpFile.setPermissionText(permissionText(perm));
            sftpFile.setOwner(String.valueOf(item.getAttrs().getUId()));
            sftpFile.setGroup(String.valueOf(item.getAttrs().getGId()));
            files.add(sftpFile);
        }
        return StatusContent.ok("成功！", files);
    }

    private static String permissionText(int perm) {
        char[] chars = new char[9];
        chars[0] = (perm & 0400) != 0 ? 'r' : '-';
        chars[1] = (perm & 0200) != 0 ? 'w' : '-';
        chars[2] = (perm & 0100) != 0 ? 'x' : '-';
        chars[3] = (perm & 040) != 0 ? 'r' : '-';
        chars[4] = (perm & 020) != 0 ? 'w' : '-';
        chars[5] = (perm & 010) != 0 ? 'x' : '-';
        chars[6] = (perm & 04) != 0 ? 'r' : '-';
        chars[7] = (perm & 02) != 0 ? 'w' : '-';
        chars[8] = (perm & 01) != 0 ? 'x' : '-';
        return new String(chars);
    }

    /**
     * 删除文件或目录（目录递归删除）
     */
    @PostMapping("/rm")
    public StatusContent<String> rm(@RequestParam("path") String path, @RequestParam("tagId") String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        if (StrUtil.isBlank(path) || "/".equals(path.trim())) {
            return StatusContent.error("不允许删除根目录");
        }
        SSHConnectInfo cache = getCacheSsh(server);
        try {
            synchronized (cache) {
                ChannelSftp ch = cache.getSftp().getClient();
                deletePath(ch, path);
            }
            return StatusContent.ok("删除成功");
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error("删除失败: " + e.getMessage());
        }
    }

    private void deletePath(ChannelSftp ch, String path) throws SftpException {
        SftpATTRS attrs = ch.stat(path);
        if (attrs.isDir()) {
            @SuppressWarnings("unchecked")
            Vector<ChannelSftp.LsEntry> entries = ch.ls(path);
            for (ChannelSftp.LsEntry entry : entries) {
                String name = entry.getFilename();
                if (".".equals(name) || "..".equals(name)) {
                    continue;
                }
                String child = path.endsWith("/") ? path + name : path + "/" + name;
                deletePath(ch, child);
            }
            ch.rmdir(path);
        } else {
            ch.rm(path);
        }
    }

    /**
     * 重命名（newName 仅为新文件名，不含路径）
     */
    @PostMapping("/rename")
    public StatusContent<String> rename(@RequestParam("path") String path,
                                        @RequestParam("newName") String newName,
                                        @RequestParam("tagId") String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        if (StrUtil.isBlank(path) || StrUtil.isBlank(newName)) {
            return StatusContent.error("参数无效");
        }
        newName = newName.trim();
        if (newName.contains("/") || newName.contains("\\") || "..".equals(newName) || ".".equals(newName)) {
            return StatusContent.error("新名称不合法");
        }
        String parent = path.contains("/") ? path.substring(0, path.lastIndexOf('/')) : "";
        if (StrUtil.isBlank(parent)) {
            parent = "/";
        }
        String dest = "/".equals(parent) ? "/" + newName : parent + "/" + newName;
        SSHConnectInfo cache = getCacheSsh(server);
        try {
            synchronized (cache) {
                cache.getSftp().getClient().rename(path, dest);
            }
            return StatusContent.ok("重命名成功", dest);
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error("重命名失败: " + e.getMessage());
        }
    }

    /**
     * 新建文件夹
     */
    @PostMapping("/mkdir")
    public StatusContent<String> mkdir(@RequestParam("path") String path,
                                       @RequestParam("name") String name,
                                       @RequestParam("tagId") String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        if (StrUtil.isBlank(name)) {
            return StatusContent.error("名称不能为空");
        }
        name = name.trim();
        if (name.contains("/") || name.contains("\\") || "..".equals(name) || ".".equals(name)) {
            return StatusContent.error("名称不合法");
        }
        if (StrUtil.isBlank(path)) {
            path = "/";
        }
        String dest = path.endsWith("/") ? path + name : path + "/" + name;
        SSHConnectInfo cache = getCacheSsh(server);
        try {
            synchronized (cache) {
                cache.getSftp().getClient().mkdir(dest);
            }
            return StatusContent.ok("创建成功", dest);
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error("创建失败: " + e.getMessage());
        }
    }

    /**
     * 修改权限；mode 为八进制字符串，如 755 / 0644
     */
    @PostMapping("/chmod")
    public StatusContent<String> chmod(@RequestParam("path") String path,
                                       @RequestParam("mode") String mode,
                                       @RequestParam("tagId") String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        if (StrUtil.isBlank(path) || StrUtil.isBlank(mode)) {
            return StatusContent.error("参数无效");
        }
        mode = mode.trim();
        if (!mode.matches("^[0-7]{3,4}$")) {
            return StatusContent.error("权限格式应为 3~4 位八进制，如 755");
        }
        int perm = Integer.parseInt(mode, 8);
        SSHConnectInfo cache = getCacheSsh(server);
        try {
            synchronized (cache) {
                cache.getSftp().getClient().chmod(perm, path);
            }
            return StatusContent.ok("权限已更新", String.format("%03o", perm & 0777));
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error("修改权限失败: " + e.getMessage());
        }
    }

    /** 新建空文件 */
    @PostMapping("/touch")
    public StatusContent<String> touch(@RequestParam("path") String path,
                                       @RequestParam("name") String name,
                                       @RequestParam("tagId") String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        if (StrUtil.isBlank(name) || name.contains("/") || name.contains("\\")
                || ".".equals(name) || "..".equals(name)) {
            return StatusContent.error("名称不合法");
        }
        if (StrUtil.isBlank(path)) {
            path = "/";
        }
        String dest = path.endsWith("/") ? path + name : path + "/" + name;
        SSHConnectInfo cache = getCacheSsh(server);
        try {
            synchronized (cache) {
                ChannelSftp ch = cache.getSftp().getClient();
                try {
                    ch.stat(dest);
                    return StatusContent.error("文件已存在");
                } catch (SftpException ignore) {
                    // not exists
                }
                OutputStream out = ch.put(dest);
                out.close();
            }
            return StatusContent.ok("创建成功", dest);
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error("创建失败: " + e.getMessage());
        }
    }

    /** 写入文本文件（覆盖） */
    @PostMapping("/writeText")
    public StatusContent<String> writeText(@RequestParam("path") String path,
                                           @RequestParam("tagId") String tagId,
                                           @RequestParam("content") String content) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        if (StrUtil.isBlank(path)) {
            return StatusContent.error("路径无效");
        }
        SSHConnectInfo cache = getCacheSsh(server);
        try {
            synchronized (cache) {
                ChannelSftp ch = cache.getSftp().getClient();
                OutputStream out = ch.put(path);
                out.write(content == null ? new byte[0] : content.getBytes(StandardCharsets.UTF_8));
                out.close();
            }
            return StatusContent.ok("保存成功");
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error("保存失败: " + e.getMessage());
        }
    }

    /**
     * 复制：sources 为绝对路径，逗号分隔；destDir 为目标目录
     */
    @PostMapping("/copy")
    public StatusContent<String> copy(@RequestParam("sources") String sources,
                                      @RequestParam("destDir") String destDir,
                                      @RequestParam("tagId") String tagId) {
        return batchTransfer(sources, destDir, tagId, false);
    }

    /**
     * 移动/剪切粘贴
     */
    @PostMapping("/move")
    public StatusContent<String> move(@RequestParam("sources") String sources,
                                      @RequestParam("destDir") String destDir,
                                      @RequestParam("tagId") String tagId) {
        return batchTransfer(sources, destDir, tagId, true);
    }

    /**
     * 跨会话/跨服务器复制（服务端 SFTP 流式中转，始终复制不删除源）。
     * 响应为 NDJSON：start / file / progress / done / error。
     */
    @PostMapping("/crossCopy")
    public void crossCopy(@RequestParam("sourceTagId") String sourceTagId,
                          @RequestParam("destTagId") String destTagId,
                          @RequestParam("sources") String sources,
                          @RequestParam("destDir") String destDir,
                          HttpServletResponse response) throws IOException {
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/x-ndjson;charset=UTF-8");
        response.setHeader("Cache-Control", "no-cache, no-store");
        response.setHeader("X-Accel-Buffering", "no");
        PrintWriter writer = response.getWriter();

        if (StrUtil.isBlank(sourceTagId) || StrUtil.isBlank(destTagId)) {
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"参数无效\"}");
            return;
        }
        if (sourceTagId.equals(destTagId)) {
            StatusContent<String> same = batchTransfer(sources, destDir, destTagId, false);
            if (same != null && same.getStatus() == 200) {
                writeUploadEvent(writer, "{\"phase\":\"done\",\"status\":200,\"message\":"
                        + jsonQuote(same.getMessage() != null ? same.getMessage() : "复制成功")
                        + ",\"result\":" + jsonQuote(same.getResult() != null ? String.valueOf(same.getResult()) : "") + "}");
            } else {
                String msg = same != null && same.getMessage() != null ? same.getMessage() : "复制失败";
                writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":" + jsonQuote(msg) + "}");
            }
            return;
        }
        Server srcServer = WebSSHService.webLoginMap.get(sourceTagId);
        Server dstServer = WebSSHService.webLoginMap.get(destTagId);
        if (srcServer == null || dstServer == null) {
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"源或目标会话未登录或已过期\"}");
            return;
        }
        if (StrUtil.isBlank(sources) || StrUtil.isBlank(destDir)) {
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"参数无效\"}");
            return;
        }
        String[] parts = sources.split("\n");
        List<String> list = new ArrayList<>();
        for (String p : parts) {
            if (StrUtil.isNotBlank(p)) {
                list.add(p.trim());
            }
        }
        if (list.isEmpty()) {
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":\"未选择文件\"}");
            return;
        }
        String destDirNorm = destDir.endsWith("/") ? destDir : destDir + "/";
        SSHConnectInfo srcCache = getCacheSsh(srcServer);
        SSHConnectInfo dstCache = getCacheSsh(dstServer);
        ChannelSftp srcCh = null;
        ChannelSftp dstCh = null;
        List<String> resultNames = new ArrayList<>();
        try {
            srcCh = openTempSftp(srcCache.getSession());
            dstCh = openTempSftp(dstCache.getSession());
            for (String src : list) {
                if (!isSafeRemotePath(src) || src.equals("/")) {
                    writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":"
                            + jsonQuote("非法路径: " + src) + "}");
                    return;
                }
            }
            long batchTotal = 0L;
            int fileCount = 0;
            for (String src : list) {
                batchTotal += measureRemoteBytes(srcCh, src);
                fileCount += countRemoteFiles(srcCh, src);
            }
            writeUploadEvent(writer, "{\"phase\":\"start\",\"total\":" + batchTotal
                    + ",\"fileCount\":" + fileCount + "}");

            final long[] batchLoaded = {0L};
            final PrintWriter out = writer;
            final long total = batchTotal;
            for (String src : list) {
                String base = src.substring(src.lastIndexOf('/') + 1);
                if (remoteExists(dstCh, destDirNorm + base)) {
                    base = uniqueCopyBaseName(dstCh, destDirNorm, base);
                }
                String dest = destDirNorm + base;
                copyRemoteRecursiveWithProgress(srcCh, dstCh, src, dest, batchLoaded, total, out);
                resultNames.add(base);
            }
            writeUploadEvent(writer, "{\"phase\":\"done\",\"status\":200,\"message\":\"复制成功\",\"result\":"
                    + jsonQuote(String.join("\n", resultNames)) + "}");
        } catch (Exception e) {
            e.printStackTrace();
            String msg = e.getMessage() == null ? "跨服务器复制失败" : ("跨服务器复制失败: " + e.getMessage());
            writeUploadEvent(writer, "{\"phase\":\"error\",\"message\":" + jsonQuote(msg) + "}");
        } finally {
            closeQuietly(srcCh);
            closeQuietly(dstCh);
        }
    }

    private long measureRemoteBytes(ChannelSftp src, String path) throws SftpException {
        SftpATTRS attrs = src.stat(path);
        if (!attrs.isDir()) {
            return Math.max(0L, attrs.getSize());
        }
        long sum = 0L;
        @SuppressWarnings("unchecked")
        Vector<ChannelSftp.LsEntry> entries = src.ls(path);
        for (ChannelSftp.LsEntry entry : entries) {
            String name = entry.getFilename();
            if (".".equals(name) || "..".equals(name)) {
                continue;
            }
            String child = path.endsWith("/") ? path + name : path + "/" + name;
            sum += measureRemoteBytes(src, child);
        }
        return sum;
    }

    private int countRemoteFiles(ChannelSftp src, String path) throws SftpException {
        SftpATTRS attrs = src.stat(path);
        if (!attrs.isDir()) {
            return 1;
        }
        int n = 0;
        @SuppressWarnings("unchecked")
        Vector<ChannelSftp.LsEntry> entries = src.ls(path);
        for (ChannelSftp.LsEntry entry : entries) {
            String name = entry.getFilename();
            if (".".equals(name) || "..".equals(name)) {
                continue;
            }
            String child = path.endsWith("/") ? path + name : path + "/" + name;
            n += countRemoteFiles(src, child);
        }
        return n;
    }

    private void copyRemoteRecursiveWithProgress(ChannelSftp src, ChannelSftp dst,
                                                 String srcPath, String destPath,
                                                 long[] batchLoaded, long batchTotal,
                                                 PrintWriter writer)
            throws SftpException, IOException {
        SftpATTRS attrs = src.stat(srcPath);
        if (attrs.isDir()) {
            try {
                dst.mkdir(destPath);
            } catch (SftpException e) {
                if (!remoteExists(dst, destPath)) {
                    throw e;
                }
            }
            @SuppressWarnings("unchecked")
            Vector<ChannelSftp.LsEntry> entries = src.ls(srcPath);
            for (ChannelSftp.LsEntry entry : entries) {
                String name = entry.getFilename();
                if (".".equals(name) || "..".equals(name)) {
                    continue;
                }
                String childSrc = srcPath.endsWith("/") ? srcPath + name : srcPath + "/" + name;
                String childDst = destPath.endsWith("/") ? destPath + name : destPath + "/" + name;
                copyRemoteRecursiveWithProgress(src, dst, childSrc, childDst, batchLoaded, batchTotal, writer);
            }
            return;
        }
        long fileTotal = Math.max(0L, attrs.getSize());
        String baseName = srcPath.substring(srcPath.lastIndexOf('/') + 1);
        writeUploadEvent(writer, "{\"phase\":\"file\",\"name\":" + jsonQuote(baseName)
                + ",\"fileTotal\":" + fileTotal
                + ",\"batchLoaded\":" + batchLoaded[0]
                + ",\"batchTotal\":" + batchTotal + "}");
        writeUploadEvent(writer, "{\"phase\":\"progress\",\"name\":" + jsonQuote(baseName)
                + ",\"fileLoaded\":0,\"fileTotal\":" + fileTotal
                + ",\"batchLoaded\":" + batchLoaded[0]
                + ",\"batchTotal\":" + batchTotal + "}");
        try (InputStream raw = src.get(srcPath); OutputStream out = dst.put(destPath)) {
            ProgressInputStream pin = new ProgressInputStream(raw, fileTotal, (loaded, tot) -> {
                writeUploadEvent(writer, "{\"phase\":\"progress\",\"name\":" + jsonQuote(baseName)
                        + ",\"fileLoaded\":" + loaded
                        + ",\"fileTotal\":" + tot
                        + ",\"batchLoaded\":" + (batchLoaded[0] + loaded)
                        + ",\"batchTotal\":" + batchTotal + "}");
            });
            byte[] buf = new byte[8192];
            int n;
            while ((n = pin.read(buf)) >= 0) {
                if (n > 0) {
                    out.write(buf, 0, n);
                }
            }
            out.flush();
        }
        batchLoaded[0] += fileTotal;
        writeUploadEvent(writer, "{\"phase\":\"progress\",\"name\":" + jsonQuote(baseName)
                + ",\"fileLoaded\":" + fileTotal + ",\"fileTotal\":" + fileTotal
                + ",\"batchLoaded\":" + batchLoaded[0]
                + ",\"batchTotal\":" + batchTotal + "}");
    }

    private void copyRemoteRecursive(ChannelSftp src, ChannelSftp dst, String srcPath, String destPath)
            throws SftpException, IOException {
        SftpATTRS attrs = src.stat(srcPath);
        if (attrs.isDir()) {
            try {
                dst.mkdir(destPath);
            } catch (SftpException e) {
                // may already exist
                if (!remoteExists(dst, destPath)) {
                    throw e;
                }
            }
            @SuppressWarnings("unchecked")
            Vector<ChannelSftp.LsEntry> entries = src.ls(srcPath);
            for (ChannelSftp.LsEntry entry : entries) {
                String name = entry.getFilename();
                if (".".equals(name) || "..".equals(name)) {
                    continue;
                }
                String childSrc = srcPath.endsWith("/") ? srcPath + name : srcPath + "/" + name;
                String childDst = destPath.endsWith("/") ? destPath + name : destPath + "/" + name;
                copyRemoteRecursive(src, dst, childSrc, childDst);
            }
            return;
        }
        try (InputStream in = src.get(srcPath); OutputStream out = dst.put(destPath)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) {
                if (n > 0) {
                    out.write(buf, 0, n);
                }
            }
            out.flush();
        }
    }

    private StatusContent<String> batchTransfer(String sources, String destDir, String tagId, boolean move) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        if (StrUtil.isBlank(sources) || StrUtil.isBlank(destDir)) {
            return StatusContent.error("参数无效");
        }
        String[] parts = sources.split("\n");
        List<String> list = new ArrayList<>();
        for (String p : parts) {
            if (StrUtil.isNotBlank(p)) {
                list.add(p.trim());
            }
        }
        if (list.isEmpty()) {
            return StatusContent.error("未选择文件");
        }
        String destDirNorm = destDir.endsWith("/") ? destDir : destDir + "/";
        SSHConnectInfo cache = getCacheSsh(server);
        List<String> resultNames = new ArrayList<>();
        try {
            synchronized (cache) {
                Session session = cache.getSession();
                ChannelSftp ch = cache.getSftp().getClient();
                for (String src : list) {
                    if (!isSafeRemotePath(src) || src.equals("/") || destDirNorm.startsWith(src + "/")) {
                        return StatusContent.error("非法路径: " + src);
                    }
                    String base = src.substring(src.lastIndexOf('/') + 1);
                    String dest = destDirNorm + base;
                    if (move) {
                        if (src.equals(dest)) {
                            resultNames.add(base);
                            continue;
                        }
                        String err = execCommand(session,
                                "mv -f -- " + shellQuote(src) + " " + shellQuote(dest));
                        if (StrUtil.isNotBlank(err)) {
                            return StatusContent.error("移动失败: " + err);
                        }
                        resultNames.add(base);
                    } else {
                        // 同目录复制或目标已存在：自动加「副本」
                        if (src.equals(dest) || remoteExists(ch, dest)) {
                            base = uniqueCopyBaseName(ch, destDirNorm, base);
                            dest = destDirNorm + base;
                        }
                        String err = execCommand(session,
                                "cp -a -- " + shellQuote(src) + " " + shellQuote(dest));
                        if (StrUtil.isNotBlank(err)) {
                            return StatusContent.error("复制失败: " + err);
                        }
                        resultNames.add(base);
                    }
                }
            }
            return StatusContent.ok(move ? "移动成功" : "复制成功", String.join("\n", resultNames));
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error((move ? "移动" : "复制") + "失败: " + e.getMessage());
        }
    }

    private static boolean remoteExists(ChannelSftp ch, String path) {
        try {
            ch.stat(path);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Windows 风格：name.ext → name - 副本.ext → name - 副本 (2).ext */
    private static String uniqueCopyBaseName(ChannelSftp ch, String destDir, String baseName) {
        String candidate = withCopySuffix(baseName, 0);
        int n = 2;
        while (remoteExists(ch, destDir + candidate)) {
            candidate = withCopySuffix(baseName, n++);
            if (n > 500) {
                break;
            }
        }
        return candidate;
    }

    private static String withCopySuffix(String name, int index) {
        String suffix = index <= 1 ? " - 副本" : (" - 副本 (" + index + ")");
        int dot = name.lastIndexOf('.');
        if (dot > 0 && !name.startsWith(".")) {
            return name.substring(0, dot) + suffix + name.substring(dot);
        }
        return name + suffix;
    }

    /**
     * 压缩选中项为 zip（写在 destDir 下）
     */
    @PostMapping("/compress")
    public StatusContent<String> compress(@RequestParam("sources") String sources,
                                          @RequestParam("destDir") String destDir,
                                          @RequestParam("tagId") String tagId,
                                          @RequestParam(value = "archiveName", required = false) String archiveName) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        String[] parts = sources.split("\n");
        List<String> names = new ArrayList<>();
        String parent = null;
        for (String p : parts) {
            if (StrUtil.isBlank(p)) {
                continue;
            }
            p = p.trim();
            if (!isSafeRemotePath(p)) {
                return StatusContent.error("非法路径");
            }
            int idx = p.lastIndexOf('/');
            String dir = idx <= 0 ? "/" : p.substring(0, idx);
            String name = p.substring(idx + 1);
            if (parent == null) {
                parent = dir;
            } else if (!parent.equals(dir)) {
                return StatusContent.error("只能压缩同一目录下的项目");
            }
            names.add(name);
        }
        if (names.isEmpty()) {
            return StatusContent.error("未选择文件");
        }
        if (StrUtil.isBlank(destDir)) {
            destDir = parent == null ? "/" : parent;
        }
        if (StrUtil.isBlank(archiveName)) {
            archiveName = (names.size() == 1 ? names.get(0) : "archive") + ".zip";
        }
        if (archiveName.contains("/") || archiveName.contains("\\")) {
            return StatusContent.error("压缩包名称不合法");
        }
        String zipPath = destDir.endsWith("/") ? destDir + archiveName : destDir + "/" + archiveName;
        StringBuilder args = new StringBuilder();
        for (String n : names) {
            args.append(' ').append(shellQuote(n));
        }
        String cmd = "cd " + shellQuote(parent) + " && zip -r -q " + shellQuote(zipPath) + args;
        SSHConnectInfo cache = getCacheSsh(server);
        try {
            synchronized (cache) {
                String err = execCommand(cache.getSession(), cmd);
                if (StrUtil.isNotBlank(err) && !err.contains("adding:")) {
                    // zip 可能不存在，回退 tar.gz
                    String tarName = archiveName.endsWith(".zip")
                            ? archiveName.substring(0, archiveName.length() - 4) + ".tar.gz"
                            : archiveName + ".tar.gz";
                    String tarPath = destDir.endsWith("/") ? destDir + tarName : destDir + "/" + tarName;
                    String tarCmd = "cd " + shellQuote(parent) + " && tar -czf " + shellQuote(tarPath) + args;
                    String err2 = execCommand(cache.getSession(), tarCmd);
                    if (StrUtil.isNotBlank(err2)) {
                        return StatusContent.error("压缩失败: " + (StrUtil.blankToDefault(err, "") + " " + err2).trim());
                    }
                    return StatusContent.ok("压缩成功", tarPath);
                }
            }
            return StatusContent.ok("压缩成功", zipPath);
        } catch (Exception e) {
            invalidateSharedSftp(cache);
            return StatusContent.error("压缩失败: " + e.getMessage());
        }
    }

    private static boolean isSafeRemotePath(String path) {
        if (StrUtil.isBlank(path) || !path.startsWith("/")) {
            return false;
        }
        return path.indexOf('\0') < 0 && path.indexOf('`') < 0
                && !path.contains("$(") && !path.contains("${");
    }

    private static String shellQuote(String s) {
        return "'" + String.valueOf(s).replace("'", "'\"'\"'") + "'";
    }

    private static String execCommand(Session session, String command) throws Exception {
        ChannelExec exec = (ChannelExec) session.openChannel("exec");
        exec.setCommand(command);
        InputStream in = exec.getInputStream();
        InputStream err = exec.getErrStream();
        exec.connect(15000);
        byte[] buf = new byte[2048];
        StringBuilder out = new StringBuilder();
        StringBuilder er = new StringBuilder();
        int n;
        while ((n = in.read(buf)) > 0) {
            out.append(new String(buf, 0, n, StandardCharsets.UTF_8));
        }
        while ((n = err.read(buf)) > 0) {
            er.append(new String(buf, 0, n, StandardCharsets.UTF_8));
        }
        exec.disconnect();
        int code = exec.getExitStatus();
        if (code != 0 && code != -1) {
            String msg = er.toString().trim();
            if (StrUtil.isBlank(msg)) {
                msg = out.toString().trim();
            }
            if (StrUtil.isBlank(msg)) {
                msg = "exit " + code;
            }
            return msg;
        }
        return null;
    }

    private static String sshShareKey(Server server) {
        if (server == null) {
            return "";
        }
        String ip = server.getIp() == null ? "" : server.getIp();
        int port = server.getPort();
        String user = server.getUserName() == null ? "" : server.getUserName();
        return ip + ":" + port + ":" + user;
    }

    private void disconnectQuietly(SSHConnectInfo info) {
        if (info == null) {
            return;
        }
        try {
            invalidateSharedSftp(info);
        } catch (Exception ignored) {
            // ignore
        }
        try {
            Session old = info.getSession();
            if (old != null && old.isConnected()) {
                old.disconnect();
            }
        } catch (Exception ignored) {
            // ignore
        }
    }

    public SSHConnectInfo getCacheSsh(Server server){
        String key = sshShareKey(server);
        SSHConnectInfo sshConnectInfo = WebSSHService.webSshMap.get(key);
        // 兼容旧版仅按 ip:port 缓存的键
        if (sshConnectInfo == null) {
            sshConnectInfo = WebSSHService.webSshMap.get(server.getIp() + ":" + server.getPort());
            if (sshConnectInfo != null) {
                WebSSHService.webSshMap.put(key, sshConnectInfo);
            }
        }
        if (sshConnectInfo == null) {
            sshConnectInfo = new SSHConnectInfo();
            WebSSHService.webSshMap.put(key, sshConnectInfo);
        }
        synchronized (sshConnectInfo) {
            Session session = sshConnectInfo.getSession();
            String cachedUser = sshConnectInfo.getCachedUserName();
            String cachedPass = sshConnectInfo.getCachedPassword();
            boolean credChanged = (cachedUser != null || cachedPass != null)
                    && (!java.util.Objects.equals(cachedUser, server.getUserName())
                    || !java.util.Objects.equals(cachedPass, server.getPassword()));
            if (session == null || !session.isConnected() || credChanged) {
                if (session != null) {
                    try {
                        session.disconnect();
                    } catch (Exception ignored) {
                        // ignore
                    }
                }
                invalidateSharedSftp(sshConnectInfo);
                session = JschUtil.getSession(server.getIp(), server.getPort(), server.getUserName(), server.getPassword());
                sshConnectInfo.setSession(session);
                sshConnectInfo.setCachedUserName(server.getUserName());
                sshConnectInfo.setCachedPassword(server.getPassword());
            }
            Sftp sftp = sshConnectInfo.getSftp();
            if (sftp != null) {
                try {
                    ChannelSftp client = sftp.getClient();
                    if (client == null || !client.isConnected()) {
                        invalidateSharedSftp(sshConnectInfo);
                        sftp = null;
                    }
                } catch (Exception e) {
                    invalidateSharedSftp(sshConnectInfo);
                    sftp = null;
                }
            }
            if (sftp == null) {
                sftp = JschUtil.createSftp(session);
                sshConnectInfo.setSftp(sftp);
            }
            return sshConnectInfo;
        }
    }

    @PostMapping("/loginSsh")
    public StatusContent<String> loginSsh(@ModelAttribute Server server){
        Session session = null;
        try {
            session = JschUtil.getSession(server.getIp(), server.getPort(), server.getUserName(), server.getPassword());
            String tagId = IdUtil.simpleUUID();
            WebSSHService.webLoginMap.put(tagId, server);

            String key = sshShareKey(server);
            SSHConnectInfo previous = WebSSHService.webSshMap.get(key);
            if (previous == null) {
                previous = WebSSHService.webSshMap.get(server.getIp() + ":" + server.getPort());
            }
            disconnectQuietly(previous);

            // 会话共用：按 ip:port:user 隔离，改密后覆盖旧连接
            SSHConnectInfo sshConnectInfo = new SSHConnectInfo();
            sshConnectInfo.setSession(session);
            sshConnectInfo.setCachedUserName(server.getUserName());
            sshConnectInfo.setCachedPassword(server.getPassword());
            WebSSHService.webSshMap.put(key, sshConnectInfo);
            // 清掉旧 ip:port 键，避免继续命中旧会话
            WebSSHService.webSshMap.remove(server.getIp() + ":" + server.getPort());

            return StatusContent.ok("登录成功", tagId);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UnknownHostException")) {
                return StatusContent.error("登录失败，" + server.getIp() + " 主机不通！");
            } else if (e.getMessage() != null && e.getMessage().contains("Connection refused")) {
                return StatusContent.error("登录失败，" + server.getIp() + ":" + server.getPort() + " 网络不通！");
            } else if (e.getMessage() != null && e.getMessage().contains("Auth fail")) {
                return StatusContent.error("登录失败，密码错误！");
            }
            return StatusContent.error("登录失败，" + e.getMessage());
        }/* finally {
            if (session != null) {
                session.disconnect();
            }
        }*/
    }

    @GetMapping("/checkLogin")
    public StatusContent<String> checkLogin(@RequestParam String tagId){
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("过期！");
        }
        return StatusContent.ok("成功！");
    }

    /**
     * SSH 往返延迟（毫秒）。走已登录会话执行空命令，反映到远端的实际时延。
     */
    @GetMapping("/latency")
    public StatusContent<Long> latency(@RequestParam String tagId) {
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("未登录或会话已过期");
        }
        SSHConnectInfo info = WebSSHService.webSshMap.get(sshShareKey(server));
        if (info == null) {
            info = WebSSHService.webSshMap.get(server.getIp() + ":" + server.getPort());
        }
        Session session = info == null ? null : info.getSession();
        if (session == null || !session.isConnected()) {
            return StatusContent.error("SSH 未连接");
        }
        ChannelExec channel = null;
        long started = System.nanoTime();
        try {
            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(":");
            channel.setInputStream(null);
            channel.connect(4000);
            long deadline = System.currentTimeMillis() + 4000;
            while (!channel.isClosed()) {
                if (System.currentTimeMillis() > deadline) {
                    return StatusContent.error("探测超时");
                }
                Thread.sleep(8);
            }
            long ms = Math.max(1L, (System.nanoTime() - started) / 1_000_000L);
            return StatusContent.ok("成功！", ms);
        } catch (Exception e) {
            return StatusContent.error(e.getMessage() == null ? "探测失败" : e.getMessage());
        } finally {
            if (channel != null) {
                try {
                    channel.disconnect();
                } catch (Exception ignored) {
                    // ignore
                }
            }
        }
    }
}

