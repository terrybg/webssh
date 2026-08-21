# -*- coding: utf-8 -*-
"""Generate static/webssh/data/dict.json with ~1000 common Linux ops commands."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "main" / "resources" / "static" / "webssh" / "data" / "dict.json"

# Curated (name, value) — high-value day-to-day ops
BASE: list[tuple[str, str]] = [
    # 网络 / MAC / IP
    ("查看网卡与 MAC 地址", "ip link show"),
    ("查看所有网卡 MAC（ifconfig）", "ifconfig -a | grep -i ether"),
    ("查看指定网卡 MAC", "cat /sys/class/net/eth0/address"),
    ("列出网卡名", "ls /sys/class/net"),
    ("查看 IP 地址", "ip addr show"),
    ("简要查看 IP", "hostname -I"),
    ("查看路由表", "ip route show"),
    ("查看默认网关", "ip route | grep default"),
    ("测试连通性", "ping -c 4 8.8.8.8"),
    ("连续 ping", "ping 8.8.8.8"),
    ("查看 DNS 配置", "cat /etc/resolv.conf"),
    ("解析域名", "nslookup baidu.com"),
    ("dig 查询 A 记录", "dig baidu.com +short"),
    ("查看监听端口", "ss -tulpn"),
    ("netstat 查看端口", "netstat -tulpn"),
    ("查看 TCP 连接", "ss -antp"),
    ("按端口查进程", "ss -lptn 'sport = :80'"),
    ("traceroute", "traceroute baidu.com"),
    ("mtr 网络诊断", "mtr -rwc 10 baidu.com"),
    ("查看防火墙规则 firewalld", "firewall-cmd --list-all"),
    ("查看 iptables", "iptables -L -n -v"),
    ("查看 nftables", "nft list ruleset"),
    ("下载测速（curl）", "curl -o /dev/null -s -w '%{speed_download}\\n' https://speed.cloudflare.com/__down?bytes=10000000"),
    ("公网 IP", "curl -s ifconfig.me"),
    ("公网 IP（备用）", "curl -s ip.sb"),
    ("查看 ARP 表", "ip neigh show"),
    ("抓包 80 端口", "tcpdump -i any port 80 -nn -c 50"),
    ("查看网卡流量", "iftop -n"),
    ("实时带宽", "nload"),
    ("curl 带响应头", "curl -I https://baidu.com"),
    ("wget 下载", "wget -O /tmp/out.bin URL"),
    ("HTTP 状态码", "curl -o /dev/null -s -w '%{http_code}\\n' URL"),
    # 系统信息
    ("主机名", "hostname"),
    ("设置主机名（临时）", "hostnamectl set-hostname NEWNAME"),
    ("系统版本", "cat /etc/os-release"),
    ("内核版本", "uname -a"),
    ("CPU 信息", "lscpu"),
    ("CPU 型号简要", "grep 'model name' /proc/cpuinfo | head -1"),
    ("CPU 核数", "nproc"),
    ("内存概况", "free -h"),
    ("详细内存", "cat /proc/meminfo | head -20"),
    ("磁盘分区", "lsblk -f"),
    ("磁盘用量", "df -h"),
    ("inode 用量", "df -ih"),
    ("目录占用 Top", "du -xh --max-depth=1 / | sort -hr | head -20"),
    ("当前目录占用", "du -sh * | sort -hr | head -20"),
    ("硬件概览", "lshw -short"),
    ("PCI 设备", "lspci"),
    ("USB 设备", "lsusb"),
    ("运行时间", "uptime"),
    ("开机时间", "who -b"),
    ("时区", "timedatectl"),
    ("同步时间", "chronyc tracking"),
    ("日历", "cal"),
    ("日期时间", "date '+%Y-%m-%d %H:%M:%S'"),
    # 进程 / 服务
    ("进程列表", "ps aux"),
    ("按 CPU 排序进程", "ps aux --sort=-%cpu | head -20"),
    ("按内存排序进程", "ps aux --sort=-%mem | head -20"),
    ("查找进程", "ps -ef | grep nginx"),
    ("杀进程（按名）", "pkill -f PROCESS"),
    ("杀进程（按 PID）", "kill -9 PID"),
    ("top", "top"),
    ("htop", "htop"),
    ("systemd 服务状态", "systemctl status SERVICE"),
    ("启动服务", "systemctl start SERVICE"),
    ("停止服务", "systemctl stop SERVICE"),
    ("重启服务", "systemctl restart SERVICE"),
    ("开机自启", "systemctl enable SERVICE"),
    ("取消自启", "systemctl disable SERVICE"),
    ("列出失败服务", "systemctl --failed"),
    ("重载 systemd", "systemctl daemon-reload"),
    ("查看服务日志", "journalctl -u SERVICE -n 100 --no-pager"),
    ("跟随服务日志", "journalctl -u SERVICE -f"),
    ("最近系统日志", "journalctl -xe --no-pager | tail -100"),
    ("开机日志", "journalctl -b --no-pager | tail -100"),
    # 文件 / 权限
    ("列出文件详情", "ls -lah"),
    ("按时间排序", "ls -laht | head"),
    ("按大小排序", "ls -lahS | head"),
    ("创建目录", "mkdir -p /path/to/dir"),
    ("复制", "cp -a SRC DEST"),
    ("移动/重命名", "mv SRC DEST"),
    ("删除文件", "rm -f FILE"),
    ("删除目录", "rm -rf DIR"),
    ("软链接", "ln -s TARGET LINK"),
    ("查找文件名", "find / -name 'FILE' 2>/dev/null"),
    ("按类型找", "find /path -type f -name '*.log'"),
    ("按大小找", "find / -type f -size +100M 2>/dev/null"),
    ("按修改时间找", "find /path -mtime -1"),
    ("grep 内容", "grep -RIn 'PATTERN' /path"),
    ("忽略大小写 grep", "grep -RIni 'pattern' /path"),
    ("查看文件", "cat FILE"),
    ("带行号查看", "cat -n FILE"),
    ("分页查看", "less FILE"),
    ("文件头", "head -n 50 FILE"),
    ("文件尾", "tail -n 50 FILE"),
    ("实时看日志", "tail -f FILE"),
    ("实时看多行", "tail -n 100 -f FILE"),
    ("统计行数", "wc -l FILE"),
    ("文件类型", "file FILE"),
    ("改权限", "chmod 755 FILE"),
    ("递归改权限", "chmod -R 755 DIR"),
    ("改所有者", "chown user:group FILE"),
    ("递归改所有者", "chown -R user:group DIR"),
    ("查看 ACL", "getfacl FILE"),
    ("diff 比较", "diff -u a b"),
    ("md5", "md5sum FILE"),
    ("sha256", "sha256sum FILE"),
    ("打包 tar.gz", "tar -czvf archive.tar.gz DIR"),
    ("解压 tar.gz", "tar -xzvf archive.tar.gz"),
    ("打包 zip", "zip -r archive.zip DIR"),
    ("解压 zip", "unzip archive.zip"),
    ("查看磁盘 IO", "iostat -xz 1 5"),
    ("同步落盘", "sync"),
    # 用户 / 安全
    ("当前用户", "whoami"),
    ("当前登录", "who"),
    ("登录历史", "last | head -20"),
    ("失败登录", "lastb | head -20"),
    ("切换 root", "sudo -i"),
    ("以某用户执行", "sudo -u USER COMMAND"),
    ("添加用户", "useradd -m -s /bin/bash USER"),
    ("设置密码", "passwd USER"),
    ("删除用户", "userdel -r USER"),
    ("用户组", "id USER"),
    ("查看 sudoers", "cat /etc/sudoers"),
    ("SSH 配置", "cat /etc/ssh/sshd_config"),
    ("重启 sshd", "systemctl restart sshd"),
    ("查看授权密钥", "cat ~/.ssh/authorized_keys"),
    ("生成 SSH 密钥", "ssh-keygen -t ed25519 -C 'comment'"),
    ("检查开放端口安全", "ss -tulpn"),
    # 包管理
    ("apt 更新", "apt update && apt upgrade -y"),
    ("apt 安装", "apt install -y PKG"),
    ("apt 搜索", "apt search KEYWORD"),
    ("apt 卸载", "apt remove -y PKG"),
    ("yum 安装", "yum install -y PKG"),
    ("dnf 安装", "dnf install -y PKG"),
    ("rpm 查包", "rpm -qa | grep PKG"),
    ("dpkg 查包", "dpkg -l | grep PKG"),
    ("哪个包提供文件", "yum provides '*/bin/xxx'"),
    # Docker
    ("Docker 版本", "docker version"),
    ("Docker 信息", "docker info"),
    ("容器列表", "docker ps -a"),
    ("镜像列表", "docker images"),
    ("启动容器", "docker start NAME"),
    ("停止容器", "docker stop NAME"),
    ("重启容器", "docker restart NAME"),
    ("进入容器", "docker exec -it NAME bash"),
    ("容器日志", "docker logs -f --tail 200 NAME"),
    ("删除容器", "docker rm -f NAME"),
    ("删除镜像", "docker rmi IMAGE"),
    ("清理无用资源", "docker system prune -af"),
    ("查看容器资源", "docker stats --no-stream"),
    ("compose 启动", "docker compose up -d"),
    ("compose 停止", "docker compose down"),
    ("compose 日志", "docker compose logs -f --tail 200"),
    ("构建镜像", "docker build -t NAME:TAG ."),
    ("导出镜像", "docker save -o name.tar IMAGE"),
    ("导入镜像", "docker load -i name.tar"),
    # Kubernetes
    ("查看节点", "kubectl get nodes -o wide"),
    ("查看 Pod", "kubectl get pods -A -o wide"),
    ("查看服务", "kubectl get svc -A"),
    ("描述 Pod", "kubectl describe pod NAME -n NS"),
    ("Pod 日志", "kubectl logs -f --tail=200 NAME -n NS"),
    ("进入 Pod", "kubectl exec -it NAME -n NS -- bash"),
    ("应用 YAML", "kubectl apply -f FILE"),
    ("删除资源", "kubectl delete -f FILE"),
    ("上下文", "kubectl config get-contexts"),
    # 性能 / 排查
    ("负载", "uptime"),
    ("vmstat", "vmstat 1 5"),
    ("mpstat", "mpstat -P ALL 1 5"),
    ("内存详情", "free -mh"),
    ("打开文件数", "lsof | wc -l"),
    ("进程打开文件", "lsof -p PID"),
    ("端口占用进程", "lsof -i :PORT"),
    ("dmesg 内核日志", "dmesg -T | tail -100"),
    ("系统限制", "ulimit -a"),
    ("文件描述符上限", "cat /proc/sys/fs/file-nr"),
    ("连接跟踪数", "cat /proc/sys/net/netfilter/nf_conntrack_count"),
    ("GPU 状态", "nvidia-smi"),
    ("持续看 GPU", "watch -n 1 nvidia-smi"),
    # 文本处理
    ("awk 第1列", "awk '{print $1}' FILE"),
    ("cut 字段", "cut -d: -f1 /etc/passwd"),
    ("sort uniq 统计", "sort FILE | uniq -c | sort -nr | head"),
    ("sed 替换", "sed -i 's/OLD/NEW/g' FILE"),
    ("jq 解析 JSON", "cat FILE.json | jq ."),
    ("base64 编码", "echo -n 'text' | base64"),
    ("base64 解码", "echo 'ENCODED' | base64 -d"),
    # Git
    ("git 状态", "git status"),
    ("git 分支", "git branch -vv"),
    ("git 最近提交", "git log --oneline -20"),
    ("git pull", "git pull --rebase"),
    ("git diff", "git diff"),
    ("git 暂存", "git add -A && git commit -m 'msg'"),
    # 其他实用
    ("后台运行 jar", "nohup java -jar app.jar > app.log 2>&1 &"),
    ("查看后台任务", "jobs -l"),
    ("环境变量", "env | sort"),
    ("PATH", "echo $PATH"),
    ("历史命令", "history | tail -50"),
    ("清屏", "clear"),
    ("磁盘 SMART", "smartctl -a /dev/sda"),
    ("挂载查看", "mount | column -t"),
    ("重新挂载读写", "mount -o remount,rw /"),
    ("同步时钟 NTP", "chronyc -a makestep"),
    ("检查 SELinux", "getenforce"),
    ("临时关 SELinux", "setenforce 0"),
    ("查看 crontab", "crontab -l"),
    ("编辑 crontab", "crontab -e"),
    ("系统定时任务", "ls /etc/cron.*"),
    ("rsync 同步", "rsync -avz --progress SRC/ DEST/"),
    ("scp 拷贝", "scp -r SRC user@host:/path"),
    ("ssh 登录", "ssh user@host"),
    ("生成随机密码", "openssl rand -base64 24"),
    ("测磁盘写入", "dd if=/dev/zero of=/tmp/test.img bs=1M count=1024 oflag=direct"),
    ("测磁盘读取", "dd if=/tmp/test.img of=/dev/null bs=1M iflag=direct"),
    ("查看打开端口(nmap本机)", "nmap -sT -O localhost"),
    ("Python HTTP 临时服务", "python3 -m http.server 8000"),
    ("统计目录文件数", "find . -type f | wc -l"),
    ("空目录清理", "find . -type d -empty -delete"),
    ("按扩展名统计", "find . -type f | sed 's/.*\\.//' | sort | uniq -c | sort -nr | head"),
]

# Expand with systematic variants to reach ~1000
SERVICES = [
    "nginx", "httpd", "apache2", "mysql", "mariadb", "redis", "postgresql",
    "docker", "containerd", "sshd", "cron", "rsyslog", "firewalld", "NetworkManager",
    "kubelet", "php-fpm", "tomcat", "rabbitmq-server", "mongod", "elasticsearch",
    "prometheus", "grafana-server", "node_exporter", "fail2ban", "ntpd", "chronyd",
]
PORTS = [22, 80, 443, 3306, 6379, 5432, 8080, 8443, 9000, 9200, 27017, 2379, 6443, 10250]
LOGS = [
    ("系统日志", "/var/log/messages"),
    ("syslog", "/var/log/syslog"),
    ("安全日志", "/var/log/secure"),
    ("auth 日志", "/var/log/auth.log"),
    ("nginx access", "/var/log/nginx/access.log"),
    ("nginx error", "/var/log/nginx/error.log"),
    ("mysql error", "/var/log/mysqld.log"),
    ("docker 守护进程", "/var/log/docker.log"),
    ("kern 日志", "/var/log/kern.log"),
    ("boot 日志", "/var/log/boot.log"),
]
NICS = ["eth0", "ens33", "ens160", "enp0s3", "wlan0", "docker0", "br0"]
PATHS = ["/", "/home", "/var", "/var/log", "/tmp", "/opt", "/usr", "/etc", "/data", "/root"]
EXTS = ["log", "conf", "yml", "yaml", "json", "sh", "py", "jar", "war", "gz", "tar", "zip", "sql", "out"]


def add(items: list[tuple[str, str]], name: str, value: str) -> None:
    items.append((name, value))


def build() -> list[dict]:
    rows: list[tuple[str, str]] = list(BASE)

    for svc in SERVICES:
        add(rows, f"查看 {svc} 状态", f"systemctl status {svc}")
        add(rows, f"重启 {svc}", f"systemctl restart {svc}")
        add(rows, f"停止 {svc}", f"systemctl stop {svc}")
        add(rows, f"启动 {svc}", f"systemctl start {svc}")
        add(rows, f"是否开机自启 {svc}", f"systemctl is-enabled {svc}")
        add(rows, f"{svc} 最近日志", f"journalctl -u {svc} -n 100 --no-pager")
        add(rows, f"跟随 {svc} 日志", f"journalctl -u {svc} -f")

    for port in PORTS:
        add(rows, f"查看谁占用 {port} 端口", f"ss -lptn 'sport = :{port}'")
        add(rows, f"lsof 查端口 {port}", f"lsof -i :{port}")
        add(rows, f"curl 本机 {port}", f"curl -sS -o /dev/null -w '%{{http_code}}\\n' http://127.0.0.1:{port}/")

    for title, path in LOGS:
        add(rows, f"查看{title}尾部", f"tail -n 100 {path}")
        add(rows, f"实时看{title}", f"tail -f {path}")
        add(rows, f"{title} 大小", f"ls -lh {path}")

    for nic in NICS:
        add(rows, f"查看 {nic} MAC", f"cat /sys/class/net/{nic}/address")
        add(rows, f"查看 {nic} 详情", f"ip addr show {nic}")
        add(rows, f"查看 {nic} 链路", f"ip -s link show {nic}")
        add(rows, f"重启 {nic}（down/up）", f"ip link set {nic} down && ip link set {nic} up")

    for p in PATHS:
        add(rows, f"查看 {p} 磁盘占用", f"du -xh --max-depth=1 {p} 2>/dev/null | sort -hr | head -20")
        add(rows, f"列出 {p}", f"ls -lah {p}")

    for ext in EXTS:
        add(rows, f"查找 *.{ext} 文件", f"find / -type f -name '*.{ext}' 2>/dev/null | head -50")
        add(rows, f"当前目录 *.{ext}", f"find . -type f -name '*.{ext}' | head -50")

    # docker compose / common inspect
    for name in ["web", "api", "db", "redis", "nginx", "app", "worker", "mysql", "postgres"]:
        add(rows, f"进入容器 {name}", f"docker exec -it {name} bash || docker exec -it {name} sh")
        add(rows, f"容器 {name} 日志", f"docker logs -f --tail 200 {name}")
        add(rows, f"检查容器 {name}", f"docker inspect {name} --format '{{{{.State.Status}}}}'")

    # java / app ops
    for jar in ["app.jar", "server.jar", "gateway.jar", "admin.jar", "api.jar"]:
        add(rows, f"后台启动 {jar}", f"nohup java -jar {jar} > {jar}.out 2>&1 &")
        add(rows, f"查看 {jar} 进程", f"ps -ef | grep {jar} | grep -v grep")
        add(rows, f"实时看 {jar} 输出", f"tail -n 100 -f {jar}.out")

    # network diagnose extras
    for host in ["baidu.com", "127.0.0.1", "8.8.8.8", "1.1.1.1", "google.com"]:
        add(rows, f"ping {host}", f"ping -c 4 {host}")
        add(rows, f"解析 {host}", f"getent hosts {host} || nslookup {host}")

    # permission / selinux / firewall extras
    for p in [22, 80, 443, 3306, 8080]:
        add(rows, f"firewalld 放行 {p}/tcp", f"firewall-cmd --permanent --add-port={p}/tcp && firewall-cmd --reload")
        add(rows, f"firewalld 查询 {p}", f"firewall-cmd --query-port={p}/tcp")

    # text / count patterns
    for pattern in ["ERROR", "WARN", "Exception", "OutOfMemory", "timeout", "refused", "denied"]:
        add(rows, f"日志搜 {pattern}", f"grep -RIn '{pattern}' /var/log --include='*.log' | tail -50")
        add(rows, f"当前目录搜 {pattern}", f"grep -RIn '{pattern}' . | head -50")

    # kubectl ns extras
    for ns in ["default", "kube-system", "monitoring", "ingress-nginx", "prod", "dev"]:
        add(rows, f"查看 {ns} 命名空间 Pod", f"kubectl get pods -n {ns} -o wide")
        add(rows, f"查看 {ns} 事件", f"kubectl get events -n {ns} --sort-by=.lastTimestamp | tail -30")
        add(rows, f"查看 {ns} Deployment", f"kubectl get deploy -n {ns}")
        add(rows, f"查看 {ns} ConfigMap", f"kubectl get cm -n {ns}")
        add(rows, f"查看 {ns} Secret", f"kubectl get secret -n {ns}")

    # mysql / redis / mongo quick ops
    for db in ["mysql", "information_schema", "test", "app"]:
        add(rows, f"MySQL 进库 {db}", f"mysql -uroot -p {db}")
        add(rows, f"MySQL 显示 {db} 表", f"mysql -uroot -p -e 'SHOW TABLES' {db}")
    for key in ["*", "user:*", "session:*", "cache:*"]:
        add(rows, f"Redis 扫描键 {key}", f"redis-cli --scan --pattern '{key}' | head -50")
    add(rows, "Redis 信息", "redis-cli INFO")
    add(rows, "Redis 内存", "redis-cli INFO memory")
    add(rows, "Redis 慢日志", "redis-cli SLOWLOG GET 20")
    add(rows, "Mongo 状态", "mongosh --eval 'db.serverStatus()' --quiet")

    # common sysctl / limits
    for key, title in [
        ("net.ipv4.ip_forward", "IP 转发"),
        ("fs.file-max", "文件句柄上限"),
        ("vm.swappiness", "swappiness"),
        ("net.core.somaxconn", "somaxconn"),
        ("net.ipv4.tcp_tw_reuse", "tcp_tw_reuse"),
        ("kernel.pid_max", "pid_max"),
        ("fs.inotify.max_user_watches", "inotify watches"),
    ]:
        add(rows, f"查看 {title}", f"sysctl {key}")
        add(rows, f"临时设置 {title}", f"sysctl -w {key}=VALUE")

    # journal / logrotate / audit
    for unit in SERVICES:
        add(rows, f"{unit} 今天日志", f"journalctl -u {unit} --since today --no-pager | tail -100")
        add(rows, f"{unit} 一小时日志", f"journalctl -u {unit} --since '1 hour ago' --no-pager")

    # disk devices
    for disk in ["sda", "sdb", "nvme0n1", "vda", "vdb"]:
        add(rows, f"查看 /dev/{disk} 分区", f"fdisk -l /dev/{disk}")
        add(rows, f"SMART /dev/{disk}", f"smartctl -H /dev/{disk}")
        add(rows, f"IO 统计 {disk}", f"iostat -xd {disk} 1 3")

    # openssl / cert
    for host in ["baidu.com:443", "127.0.0.1:443", "localhost:8443"]:
        add(rows, f"查看证书 {host}", f"echo | openssl s_client -servername {host.split(':')[0]} -connect {host} 2>/dev/null | openssl x509 -noout -dates -subject")

    # npm / pip / go / maven quick
    add(rows, "npm 全局列表", "npm list -g --depth=0")
    add(rows, "pip 列表", "pip3 list")
    add(rows, "pip 过期包", "pip3 list --outdated")
    add(rows, "go 环境", "go env")
    add(rows, "java 版本", "java -version")
    add(rows, "javac 版本", "javac -version")
    add(rows, "mvn 版本", "mvn -v")
    add(rows, "node 版本", "node -v && npm -v")
    add(rows, "python 版本", "python3 --version")
    add(rows, "gcc 版本", "gcc --version | head -1")

    # archive / backup patterns
    for src in ["/etc", "/home", "/var/www", "/opt/app", "/data"]:
        add(rows, f"备份目录 {src}", f"tar -czvf /tmp/backup-$(date +%F).tar.gz {src}")
        add(rows, f"rsync 备份 {src}", f"rsync -avz --delete {src}/ /backup{src}/")

    # permission audit
    for p in ["/etc/passwd", "/etc/shadow", "/etc/ssh/sshd_config", "/var/log", "/tmp"]:
        add(rows, f"查看权限 {p}", f"ls -ld {p}")
        add(rows, f"查看属主 {p}", f"stat -c '%U:%G %a %n' {p}")

    # network counters / conntrack
    for nic in NICS:
        add(rows, f"{nic} 丢包统计", f"ip -s link show {nic} | sed -n '1,8p'")
        add(rows, f"ethtool {nic}", f"ethtool {nic}")

    # process by name extras
    for proc in ["java", "python", "node", "nginx", "mysql", "redis-server", "dockerd", "containerd", "kubelet", "sshd"]:
        add(rows, f"查找 {proc} 进程", f"ps -ef | grep {proc} | grep -v grep")
        add(rows, f"top 看 {proc}", f"top -b -n 1 | grep {proc} | head")
        add(rows, f"pgrep {proc}", f"pgrep -a {proc}")
        add(rows, f"杀光 {proc}（慎用）", f"pkill -9 {proc}")

    # timedate / locale / lang
    add(rows, "查看 locale", "locale")
    add(rows, "查看语言环境", "echo $LANG")
    add(rows, "硬件时钟", "hwclock -r")
    add(rows, "同步硬件时钟", "hwclock -w")

    # tar / compress variants
    for name in ["logs", "conf", "backup", "release", "data"]:
        add(rows, f"打包 {name}.tar.gz", f"tar -czvf {name}.tar.gz {name}")
        add(rows, f"解压 {name}.tar.gz", f"tar -xzvf {name}.tar.gz")
        add(rows, f"列出 {name}.tar.gz", f"tar -tzvf {name}.tar.gz | head")

    # curl API smoke
    for path in ["/", "/health", "/actuator/health", "/api/status", "/metrics", "/ready", "/live"]:
        add(rows, f"探测本地 {path}", f"curl -sS -m 3 http://127.0.0.1{path}")
        add(rows, f"探测本地 HTTPS {path}", f"curl -sk -m 3 https://127.0.0.1{path}")

    # file size buckets
    for size in ["10M", "50M", "100M", "500M", "1G"]:
        add(rows, f"查找大于 {size} 的文件", f"find / -type f -size +{size} 2>/dev/null | head -50")

    # git remotes / stash
    add(rows, "git remote", "git remote -v")
    add(rows, "git stash 列表", "git stash list")
    add(rows, "git 当前分支", "git rev-parse --abbrev-ref HEAD")
    add(rows, "git 最近作者", "git shortlog -sn | head")

    # docker network / volume
    add(rows, "Docker 网络", "docker network ls")
    add(rows, "Docker 卷", "docker volume ls")
    add(rows, "Docker 磁盘占用", "docker system df")
    for net in ["bridge", "host", "none"]:
        add(rows, f"检查 Docker 网络 {net}", f"docker network inspect {net} --format '{{{{.Name}}}}'")

    # systemd timers / sockets
    add(rows, "列出 timers", "systemctl list-timers --all")
    add(rows, "列出 sockets", "systemctl list-sockets --all")
    add(rows, "列出 unit 文件", "systemctl list-unit-files --type=service | head -50")

    # security quick checks
    add(rows, "空密码账户", "awk -F: '($2==\"\"){print $1}' /etc/shadow")
    add(rows, "UID=0 账户", "awk -F: '($3==0){print $1}' /etc/passwd")
    add(rows, "可登录账户", "grep -E '/bin/(bash|sh)$' /etc/passwd")
    add(rows, "世界可写文件（抽样）", "find / -xdev -type f -perm -0002 2>/dev/null | head -50")
    add(rows, "SUID 文件（抽样）", "find / -xdev -perm -4000 2>/dev/null | head -50")

    # zstd / xz
    add(rows, "xz 压缩", "xz -k FILE")
    add(rows, "xz 解压", "xz -d FILE.xz")
    add(rows, "zstd 压缩", "zstd -19 FILE")
    add(rows, "zstd 解压", "zstd -d FILE.zst")

    # tmux / screen
    add(rows, "tmux 新建会话", "tmux new -s work")
    add(rows, "tmux 列会话", "tmux ls")
    add(rows, "tmux 接入", "tmux attach -t work")
    add(rows, "screen 列表", "screen -ls")

    # more network helpers
    for dns in ["114.114.114.114", "8.8.8.8", "1.1.1.1", "223.5.5.5"]:
        add(rows, f"用 {dns} 解析 baidu.com", f"dig @{dns} baidu.com +short")

    # file editors / viewers
    for f in ["/etc/hosts", "/etc/fstab", "/etc/profile", "/etc/bashrc", "/etc/environment",
              "/etc/security/limits.conf", "/etc/sysctl.conf", "/etc/crontab"]:
        add(rows, f"查看 {f}", f"cat {f}")
        add(rows, f"编辑 {f}", f"vi {f}")

    # common app ports health
    for port in [3000, 3001, 4000, 5000, 5601, 7001, 8000, 8081, 8088, 8090, 8888, 9090, 9092, 9411]:
        add(rows, f"检测端口 {port} 是否监听", f"ss -lptn 'sport = :{port}'")
        add(rows, f"curl 端口 {port}", f"curl -sS -m 3 -o /dev/null -w '%{{http_code}}\\n' http://127.0.0.1:{port}/")

    # cpu governor / thermal
    add(rows, "CPU 频率", "cat /proc/cpuinfo | grep MHz | head")
    add(rows, "负载详细", "cat /proc/loadavg")
    add(rows, "上下文切换", "vmstat 1 3")
    add(rows, "中断统计", "cat /proc/interrupts | head")
    add(rows, "软中断", "cat /proc/softirqs | head")

    # package query extras
    for pkg in ["curl", "wget", "vim", "git", "htop", "net-tools", "tcpdump", "lsof", "jq", "tree"]:
        add(rows, f"是否安装 {pkg}", f"command -v {pkg} || which {pkg}")
        add(rows, f"rpm 查 {pkg}", f"rpm -q {pkg} 2>/dev/null || dpkg -l {pkg} 2>/dev/null | tail -1")

    # shell helpers
    add(rows, "当前 shell", "echo $SHELL")
    add(rows, "当前工作目录", "pwd")
    add(rows, "目录栈", "dirs -v")
    add(rows, "别名列表", "alias")
    add(rows, "函数列表", "declare -F | head")
    add(rows, "最近 20 条历史", "history 20")
    add(rows, "磁盘 inode Top 目录", "find / -xdev -printf '%h\\n' 2>/dev/null | sort | uniq -c | sort -nr | head")

    # nginx / apache config test
    add(rows, "nginx 配置检测", "nginx -t")
    add(rows, "nginx 重载", "nginx -s reload")
    add(rows, "apache 配置检测", "apachectl configtest || httpd -t")
    add(rows, "查看 nginx 编译参数", "nginx -V")

    # time sync / chrony / ntp
    add(rows, "chrony 源", "chronyc sources -v")
    add(rows, "ntp 对时状态", "ntpq -p")
    add(rows, "手动对时（date）", "date -s '2026-01-01 12:00:00'")

    # swap / memory reclaim
    add(rows, "查看 swap", "swapon --show")
    add(rows, "清理 page cache（慎用）", "sync; echo 3 > /proc/sys/vm/drop_caches")
    add(rows, "内存压力", "cat /proc/pressure/memory 2>/dev/null")
    add(rows, "CPU 压力", "cat /proc/pressure/cpu 2>/dev/null")
    add(rows, "IO 压力", "cat /proc/pressure/io 2>/dev/null")

    # dedupe by value, keep first name
    seen: set[str] = set()
    out: list[dict] = []
    for name, value in rows:
        value = value.strip()
        name = name.strip()
        if not name or not value or value in seen:
            continue
        seen.add(value)
        out.append({"name": name, "value": value})

    # ensure >= 1000 with remaining useful numbered log-tail variants on common paths
    log_targets = [
        "/var/log/messages", "/var/log/syslog", "/var/log/secure",
        "/var/log/nginx/access.log", "/var/log/nginx/error.log",
        "nohup.out", "app.log", "server.log",
    ]
    n = 20
    while len(out) < 1000 and n <= 200:
        for path in log_targets:
            if len(out) >= 1000:
                break
            value = f"tail -n {n} {path}"
            if value in seen:
                continue
            seen.add(value)
            out.append({"name": f"查看 {path} 最近 {n} 行", "value": value})
        n += 5

    return out[:1000]


def main() -> None:
    items = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"result": items}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(items)} commands -> {OUT}")


if __name__ == "__main__":
    main()
