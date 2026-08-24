package com.terry.webssh.application.ctrl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.ssh.JschUtil;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.Session;
import com.terry.webssh.application.pojo.SSHConnectInfo;
import com.terry.webssh.application.pojo.Server;
import com.terry.webssh.application.pojo.StatusContent;
import com.terry.webssh.application.service.WebSSHService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Remote Linux snapshot: processes, performance, listening ports.
 */
@RestController
@RequestMapping("/webssh/api/monitor")
@CrossOrigin
public class MonitorController {

    private static final Pattern PS_LINE = Pattern.compile(
            "^\\s*(\\d+)\\s+(\\S+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+(\\d+)\\s+(\\S+)\\s+(\\S+)\\s*(.*)$");
    private static final Pattern SS_LINE = Pattern.compile(
            "(?i)^(tcp|udp|tcp6|udp6)\\s+\\S+\\s+\\d+\\s+\\d+\\s+(\\S+)\\s+\\S+(?:\\s+users:\\(\\((.+)\\)\\))?");
    private static final Pattern SS_PROC = Pattern.compile("\"([^\"]+)\",pid=(\\d+)");
    private static final Pattern DF_LINE = Pattern.compile(
            "^(\\S+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)%\\s+(.+)$");
    private static final Pattern PID_SAFE = Pattern.compile("^\\d{1,10}$");

    @GetMapping
    public StatusContent<Map<String, Object>> snapshot(@RequestParam String tagId) {
        Session session;
        try {
            session = requireSession(tagId);
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
        String script =
                "echo '===HOST==='; hostname; nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo\n"
                        + "echo '===STAT1==='; awk '/^cpu /{print; exit}' /proc/stat\n"
                        + "echo '===PCPU1==='; for d in /proc/[0-9]*; do cat \"$d/stat\" 2>/dev/null; done\n"
                        + "sleep 0.25\n"
                        + "echo '===STAT2==='; awk '/^cpu /{print; exit}' /proc/stat\n"
                        + "echo '===PCPU2==='; for d in /proc/[0-9]*; do cat \"$d/stat\" 2>/dev/null; done\n"
                        + "echo '===MEM==='; cat /proc/meminfo\n"
                        + "echo '===LOAD==='; cat /proc/loadavg\n"
                        + "echo '===UP==='; cat /proc/uptime\n"
                        + "echo '===NET==='; cat /proc/net/dev\n"
                        + "echo '===DF==='; df -P -B1 2>/dev/null\n"
                        + "echo '===PS==='; ps -ww -eo pid,user,pcpu,pmem,rss,stat,comm,args --no-headers 2>/dev/null | head -n 400\n"
                        + "echo '===SS==='; ss -lntupH 2>/dev/null || netstat -lntup 2>/dev/null || true\n"
                        + "echo '===NVSMI==='; timeout 3 nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits 2>/dev/null || true\n"
                        + "echo '===SOPHON==='; "
                        + "for d in /sys/class/bm-sophon/bm-sophon* /sys/class/bm-tpu/bm-tpu*; do "
                        + "[ -e \"$d\" ] || continue; "
                        + "echo \"DEV $(basename \"$d\")\"; "
                        + "echo -n 'USAGE '; cat \"$d/device/npu_usage\" 2>/dev/null || cat \"$d/npu_usage\" 2>/dev/null; echo; "
                        + "done\n"
                        + "echo '===BMSMI==='; timeout 3 bm-smi --text_format --noloop 2>/dev/null || timeout 3 bm-smi --noloop --text_format 2>/dev/null || true\n"
                        + "echo '===END==='\n";
        String raw;
        try {
            raw = execStdout(session, script, 22000);
        } catch (Exception e) {
            return StatusContent.error("采集失败: " + e.getMessage());
        }
        if (StrUtil.isBlank(raw) || !raw.contains("===STAT1===")) {
            return StatusContent.error("当前系统不支持监控采集（需要 Linux /proc）");
        }
        Map<String, String> sections = splitSections(raw);
        Map<String, Object> body = new LinkedHashMap<String, Object>();
        body.put("host", firstLine(sections.get("HOST")));
        body.put("cores", parseCores(sections.get("HOST")));
        body.put("cpuPercent", cpuPercent(sections.get("STAT1"), sections.get("STAT2")));
        body.putAll(parseMem(sections.get("MEM")));
        body.putAll(parseLoad(sections.get("LOAD")));
        body.put("uptimeSec", parseUptime(sections.get("UP")));
        body.put("net", parseNet(sections.get("NET")));
        body.put("disks", parseDisks(sections.get("DF")));
        List<Map<String, Object>> processes = parseProcesses(sections.get("PS"));
        applyLiveProcessCpu(processes, sections.get("PCPU1"), sections.get("PCPU2"),
                sections.get("STAT1"), sections.get("STAT2"));
        body.put("processes", processes);
        body.put("ports", parsePorts(sections.get("SS")));
        body.put("accelerators", parseAccelerators(sections.get("NVSMI"), sections.get("SOPHON"), sections.get("BMSMI")));
        body.put("sampledAt", System.currentTimeMillis());
        return StatusContent.ok("成功！", body);
    }

    @PostMapping("/kill")
    public StatusContent<Boolean> kill(@RequestParam String tagId, @RequestParam String pid) {
        if (!PID_SAFE.matcher(pid == null ? "" : pid.trim()).matches()) {
            return StatusContent.error("PID 不合法");
        }
        Session session;
        try {
            session = requireSession(tagId);
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
        try {
            execStdout(session, "kill -TERM " + pid.trim() + " 2>/dev/null || kill " + pid.trim(), 8000);
            return StatusContent.ok("已发送结束信号", Boolean.TRUE);
        } catch (Exception e) {
            return StatusContent.error("结束进程失败: " + e.getMessage());
        }
    }

    private Session requireSession(String tagId) {
        if (StrUtil.isBlank(tagId)) {
            throw new IllegalArgumentException("缺少 tagId");
        }
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            throw new IllegalArgumentException("未登录或会话已过期");
        }
        SSHConnectInfo info = WebSSHService.webSshMap.get(shareKey(server));
        if (info == null) {
            info = WebSSHService.webSshMap.get(server.getIp() + ":" + server.getPort());
        }
        Session session = info == null ? null : info.getSession();
        if (session == null || !session.isConnected()) {
            session = JschUtil.getSession(server.getIp(), server.getPort(),
                    server.getUserName(), server.getPassword());
            if (info == null) {
                info = new SSHConnectInfo();
                WebSSHService.webSshMap.put(shareKey(server), info);
            }
            info.setSession(session);
        }
        return session;
    }

    private static String shareKey(Server server) {
        String ip = server.getIp() == null ? "" : server.getIp();
        String user = server.getUserName() == null ? "" : server.getUserName();
        return ip + ":" + server.getPort() + ":" + user;
    }

    private static String execStdout(Session session, String command, int timeoutMs) throws Exception {
        ChannelExec channel = (ChannelExec) session.openChannel("exec");
        channel.setCommand(command);
        channel.setInputStream(null);
        InputStream in = channel.getInputStream();
        InputStream err = channel.getErrStream();
        channel.connect(Math.min(timeoutMs, 8000));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (true) {
            while (in.available() > 0) {
                int n = in.read(buf);
                if (n < 0) {
                    break;
                }
                out.write(buf, 0, n);
            }
            while (err.available() > 0) {
                if (err.read(buf) < 0) {
                    break;
                }
            }
            if (channel.isClosed()) {
                while (in.available() > 0) {
                    int n = in.read(buf);
                    if (n < 0) {
                        break;
                    }
                    out.write(buf, 0, n);
                }
                break;
            }
            if (System.currentTimeMillis() > deadline) {
                channel.disconnect();
                throw new IllegalStateException("命令超时");
            }
            Thread.sleep(20);
        }
        channel.disconnect();
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static Map<String, String> splitSections(String raw) {
        Map<String, String> map = new LinkedHashMap<String, String>();
        String[] lines = raw.split("\\r?\\n");
        String current = null;
        StringBuilder buf = new StringBuilder();
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            if (line.startsWith("===") && line.endsWith("===") && line.length() > 6) {
                if (current != null) {
                    map.put(current, buf.toString());
                }
                current = line.substring(3, line.length() - 3);
                buf.setLength(0);
            } else if (current != null) {
                if (buf.length() > 0) {
                    buf.append('\n');
                }
                buf.append(line);
            }
        }
        if (current != null) {
            map.put(current, buf.toString());
        }
        return map;
    }

    private static String firstLine(String text) {
        if (text == null) {
            return "";
        }
        int n = text.indexOf('\n');
        return n < 0 ? text.trim() : text.substring(0, n).trim();
    }

    private static int parseCores(String hostSection) {
        if (hostSection == null) {
            return 1;
        }
        String[] lines = hostSection.split("\\r?\\n");
        if (lines.length >= 2) {
            try {
                return Math.max(1, Integer.parseInt(lines[1].trim()));
            } catch (NumberFormatException ignored) {
                return 1;
            }
        }
        return 1;
    }

    private static double cpuPercent(String s1, String s2) {
        long[] a = cpuTimes(s1);
        long[] b = cpuTimes(s2);
        if (a == null || b == null) {
            return 0;
        }
        long idle = b[0] - a[0];
        long total = b[1] - a[1];
        if (total <= 0) {
            return 0;
        }
        double pct = (1.0 - (idle * 1.0 / total)) * 100.0;
        if (pct < 0) {
            return 0;
        }
        if (pct > 100) {
            return 100;
        }
        return Math.round(pct * 10.0) / 10.0;
    }

    /** @return [idle, total] */
    private static long[] cpuTimes(String line) {
        if (line == null) {
            return null;
        }
        String t = line.trim();
        if (!t.startsWith("cpu")) {
            return null;
        }
        String[] p = t.split("\\s+");
        if (p.length < 5) {
            return null;
        }
        long user = parseLong(p, 1);
        long nice = parseLong(p, 2);
        long system = parseLong(p, 3);
        long idle = parseLong(p, 4);
        long iowait = parseLong(p, 5);
        long irq = parseLong(p, 6);
        long soft = parseLong(p, 7);
        long steal = parseLong(p, 8);
        long idleAll = idle + iowait;
        long total = user + nice + system + idle + iowait + irq + soft + steal;
        return new long[]{idleAll, total};
    }

    private static long parseLong(String[] p, int i) {
        if (i >= p.length) {
            return 0L;
        }
        try {
            return Long.parseLong(p[i]);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static Map<String, Object> parseMem(String mem) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        long total = kvKb(mem, "MemTotal") * 1024L;
        long avail = kvKb(mem, "MemAvailable") * 1024L;
        if (avail <= 0) {
            avail = (kvKb(mem, "MemFree") + kvKb(mem, "Buffers") + kvKb(mem, "Cached")) * 1024L;
        }
        long used = Math.max(0L, total - avail);
        long swapTotal = kvKb(mem, "SwapTotal") * 1024L;
        long swapFree = kvKb(mem, "SwapFree") * 1024L;
        m.put("memTotal", total);
        m.put("memUsed", used);
        m.put("memAvail", avail);
        m.put("swapTotal", swapTotal);
        m.put("swapUsed", Math.max(0L, swapTotal - swapFree));
        m.put("memPercent", total <= 0 ? 0 : Math.round(used * 1000.0 / total) / 10.0);
        return m;
    }

    private static long kvKb(String mem, String key) {
        if (mem == null) {
            return 0L;
        }
        String[] lines = mem.split("\\r?\\n");
        String prefix = key + ":";
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith(prefix)) {
                String[] p = line.split("\\s+");
                if (p.length >= 2) {
                    try {
                        return Long.parseLong(p[1]);
                    } catch (NumberFormatException e) {
                        return 0L;
                    }
                }
            }
        }
        return 0L;
    }

    private static Map<String, Object> parseLoad(String load) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        String line = firstLine(load);
        String[] p = line.split("\\s+");
        m.put("load1", p.length > 0 ? p[0] : "0");
        m.put("load5", p.length > 1 ? p[1] : "0");
        m.put("load15", p.length > 2 ? p[2] : "0");
        return m;
    }

    private static long parseUptime(String up) {
        String line = firstLine(up);
        String[] p = line.split("\\s+");
        if (p.length == 0) {
            return 0L;
        }
        try {
            return (long) Double.parseDouble(p[0]);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static Map<String, Object> parseNet(String net) {
        long rx = 0L;
        long tx = 0L;
        if (net != null) {
            String[] lines = net.split("\\r?\\n");
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i].trim();
                int colon = line.indexOf(':');
                if (colon < 1) {
                    continue;
                }
                String name = line.substring(0, colon).trim();
                if ("lo".equals(name) || name.startsWith("lo:")) {
                    continue;
                }
                String rest = line.substring(colon + 1).trim();
                String[] p = rest.split("\\s+");
                if (p.length >= 9) {
                    rx += parseLong(p, 0);
                    tx += parseLong(p, 8);
                }
            }
        }
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("rxBytes", rx);
        m.put("txBytes", tx);
        return m;
    }

    private static List<Map<String, Object>> parseDisks(String df) {
        List<Map<String, Object>> list = new ArrayList<Map<String, Object>>();
        if (df == null) {
            return list;
        }
        String[] lines = df.split("\\r?\\n");
        for (int i = 1; i < lines.length; i++) {
            Matcher m = DF_LINE.matcher(lines[i].trim());
            if (!m.matches()) {
                continue;
            }
            String fs = m.group(1);
            if (fs.startsWith("tmpfs") || fs.startsWith("devtmpfs") || fs.startsWith("overlay")
                    || fs.startsWith("shm") || "udev".equals(fs)) {
                continue;
            }
            Map<String, Object> d = new LinkedHashMap<String, Object>();
            d.put("fs", fs);
            d.put("size", Long.parseLong(m.group(2)));
            d.put("used", Long.parseLong(m.group(3)));
            d.put("avail", Long.parseLong(m.group(4)));
            d.put("percent", Integer.parseInt(m.group(5)));
            d.put("mount", m.group(6));
            list.add(d);
            if (list.size() >= 12) {
                break;
            }
        }
        return list;
    }

    private static List<Map<String, Object>> parseProcesses(String ps) {
        List<Map<String, Object>> list = new ArrayList<Map<String, Object>>();
        if (ps == null) {
            return list;
        }
        String[] lines = ps.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            Matcher m = PS_LINE.matcher(lines[i]);
            if (!m.matches()) {
                continue;
            }
            Map<String, Object> p = new LinkedHashMap<String, Object>();
            p.put("pid", Integer.parseInt(m.group(1)));
            p.put("user", m.group(2));
            p.put("cpu", Double.parseDouble(m.group(3)));
            p.put("mem", Double.parseDouble(m.group(4)));
            p.put("rss", Long.parseLong(m.group(5)) * 1024L);
            p.put("stat", m.group(6));
            p.put("name", m.group(7));
            p.put("cmd", m.group(8) == null ? "" : m.group(8).trim());
            list.add(p);
        }
        return list;
    }

    /** /proc/pid/stat 两次取样，算出和表头同窗口的即时 CPU%（ps 的 %CPU 是启动以来平均值，几乎不变） */
    private static void applyLiveProcessCpu(List<Map<String, Object>> processes,
                                             String pcpu1, String pcpu2, String stat1, String stat2) {
        long[] a = cpuTimes(stat1);
        long[] b = cpuTimes(stat2);
        if (a == null || b == null || processes == null || processes.isEmpty()) {
            return;
        }
        long totalDelta = b[1] - a[1];
        if (totalDelta <= 0) {
            return;
        }
        Map<Integer, Long> t1 = parsePidJiffies(pcpu1);
        Map<Integer, Long> t2 = parsePidJiffies(pcpu2);
        if (t1.isEmpty() || t2.isEmpty()) {
            return;
        }
        for (int i = 0; i < processes.size(); i++) {
            Map<String, Object> p = processes.get(i);
            Object pidObj = p.get("pid");
            if (!(pidObj instanceof Number)) {
                continue;
            }
            int pid = ((Number) pidObj).intValue();
            Long c1 = t1.get(Integer.valueOf(pid));
            Long c2 = t2.get(Integer.valueOf(pid));
            if (c1 == null || c2 == null || c2 < c1) {
                continue;
            }
            double pct = (c2.longValue() - c1.longValue()) * 100.0 / totalDelta;
            if (pct < 0) {
                pct = 0;
            }
            if (pct > 100) {
                pct = 100;
            }
            p.put("cpu", Double.valueOf(Math.round(pct * 10.0) / 10.0));
        }
    }

    private static Map<Integer, Long> parsePidJiffies(String raw) {
        Map<Integer, Long> map = new HashMap<Integer, Long>();
        if (raw == null) {
            return map;
        }
        String[] lines = raw.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) {
                continue;
            }
            int l = line.indexOf('(');
            int r = line.lastIndexOf(')');
            if (l <= 0 || r <= l) {
                continue;
            }
            try {
                int pid = Integer.parseInt(line.substring(0, l).trim());
                String[] f = line.substring(r + 1).trim().split("\\s+");
                if (f.length < 13) {
                    continue;
                }
                long ticks = Long.parseLong(f[11]) + Long.parseLong(f[12]);
                map.put(Integer.valueOf(pid), Long.valueOf(ticks));
            } catch (Exception ignored) {
                // skip malformed /proc/pid/stat
            }
        }
        return map;
    }

    private static List<Map<String, Object>> parsePorts(String ss) {
        List<Map<String, Object>> list = new ArrayList<Map<String, Object>>();
        if (ss == null) {
            return list;
        }
        String[] lines = ss.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty() || line.startsWith("Netid") || line.startsWith("Proto")) {
                continue;
            }
            Matcher m = SS_LINE.matcher(line);
            if (!m.find()) {
                continue;
            }
            Map<String, Object> p = new LinkedHashMap<String, Object>();
            p.put("proto", m.group(1).toLowerCase());
            p.put("local", m.group(2));
            String users = m.group(3);
            String proc = "";
            Integer pid = null;
            if (users != null) {
                Matcher u = SS_PROC.matcher(users);
                if (u.find()) {
                    proc = u.group(1);
                    pid = Integer.valueOf(u.group(2));
                }
            }
            p.put("process", proc);
            p.put("pid", pid);
            list.add(p);
            if (list.size() >= 200) {
                break;
            }
        }
        return list;
    }

    private static List<Map<String, Object>> parseAccelerators(String nvidia, String sophon, String bmsmi) {
        List<Map<String, Object>> list = new ArrayList<Map<String, Object>>();
        if (nvidia != null) {
            String[] lines = nvidia.split("\\r?\\n");
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.isEmpty() || line.toLowerCase().startsWith("index")) {
                    continue;
                }
                String[] p = line.split("\\s*,\\s*");
                if (p.length < 5) {
                    continue;
                }
                Map<String, Object> a = new LinkedHashMap<String, Object>();
                int idx = (int) parseDouble(p[0], i);
                a.put("id", "gpu-" + idx);
                a.put("kind", "gpu");
                a.put("vendor", "NVIDIA");
                a.put("label", "GPU " + idx);
                a.put("name", p[1].trim());
                a.put("util", parseDouble(p[2], 0));
                a.put("memUsed", Math.round(parseDouble(p[3], 0) * 1024L * 1024L));
                a.put("memTotal", Math.round(parseDouble(p[4], 0) * 1024L * 1024L));
                a.put("temp", p.length > 5 ? parseDouble(p[5], 0) : 0);
                a.put("power", p.length > 6 ? parseDouble(p[6], 0) : 0);
                list.add(a);
            }
        }
        Map<String, Map<String, Object>> npu = new LinkedHashMap<String, Map<String, Object>>();
        if (sophon != null) {
            String curId = null;
            String[] lines = sophon.split("\\r?\\n");
            int n = 0;
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.startsWith("DEV ")) {
                    curId = "npu-" + n;
                    Map<String, Object> a = new LinkedHashMap<String, Object>();
                    a.put("id", curId);
                    a.put("kind", "npu");
                    a.put("vendor", "算能");
                    a.put("label", "NPU " + n);
                    a.put("name", "算能 " + line.substring(4).trim());
                    a.put("util", Double.valueOf(0));
                    a.put("memUsed", Long.valueOf(0));
                    a.put("memTotal", Long.valueOf(0));
                    npu.put(curId, a);
                    n++;
                } else if (curId != null && line.startsWith("USAGE")) {
                    Matcher m = Pattern.compile("usage\"?\\s*:\\s*([\\d.]+)").matcher(line);
                    if (m.find()) {
                        npu.get(curId).put("util", Double.valueOf(parseDouble(m.group(1), 0)));
                    }
                }
            }
        }
        if (bmsmi != null && !bmsmi.trim().isEmpty()) {
            enrichSophonFromBmSmi(npu, bmsmi);
        }
        list.addAll(npu.values());
        return list;
    }

    private static void enrichSophonFromBmSmi(Map<String, Map<String, Object>> npu, String text) {
        if (npu.isEmpty()) {
            Matcher util = Pattern.compile("(?i)Tpu-Util\\s*[|: ]\\s*([\\d.]+)\\s*%").matcher(text);
            Matcher mem = Pattern.compile("(?i)Memory-Usage\\s*[|: ]\\s*([\\d.]+)\\s*MiB\\s*/\\s*([\\d.]+)\\s*MiB").matcher(text);
            if (util.find()) {
                Map<String, Object> a = new LinkedHashMap<String, Object>();
                a.put("id", "npu-0");
                a.put("kind", "npu");
                a.put("vendor", "算能");
                a.put("label", "NPU 0");
                a.put("name", "算能 NPU");
                a.put("util", Double.valueOf(parseDouble(util.group(1), 0)));
                if (mem.find()) {
                    a.put("memUsed", Long.valueOf(Math.round(parseDouble(mem.group(1), 0) * 1024L * 1024L)));
                    a.put("memTotal", Long.valueOf(Math.round(parseDouble(mem.group(2), 0) * 1024L * 1024L)));
                }
                npu.put("npu-0", a);
            }
            return;
        }
        Matcher mem = Pattern.compile("(?i)([\\d.]+)\\s*MiB\\s*/\\s*([\\d.]+)\\s*MiB").matcher(text);
        int i = 0;
        for (Map<String, Object> a : npu.values()) {
            if (mem.find()) {
                a.put("memUsed", Long.valueOf(Math.round(parseDouble(mem.group(1), 0) * 1024L * 1024L)));
                a.put("memTotal", Long.valueOf(Math.round(parseDouble(mem.group(2), 0) * 1024L * 1024L)));
            }
            i++;
            if (i > 8) {
                break;
            }
        }
    }

    private static double parseDouble(String s, double fallback) {
        if (s == null) {
            return fallback;
        }
        try {
            return Double.parseDouble(s.trim().replace("%", ""));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
