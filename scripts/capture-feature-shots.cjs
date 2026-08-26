/**
 * README feature shots (demo HTML, no live SSH).
 * Includes task-manager icons, disk scan, terminal↔files, Win11 dialogs.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTS = [
  path.join(ROOT, 'img'),
  path.join(ROOT, 'src', 'main', 'resources', 'static', 'webssh', 'img')
];
OUTS.forEach((d) => fs.mkdirSync(d, { recursive: true }));

function heat(pct) {
  const t = Math.max(0, Math.min(1, pct / 100));
  return 'hsl(' + (52 - t * 34) + ',88%,' + (96 - t * 42) + '%)';
}

function sig(n, cls) {
  let s = '<span class="sig ' + cls + '">';
  for (let i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
  return s + '</span>';
}

function win(title, ms, n, cls, body, opts) {
  opts = opts || {};
  const dock = opts.dock ? '<button class="dock">▤</button>' : '';
  return '<div class="win"><div class="ttl"><span class="ico"></span><span class="name">' +
    title + '</span>' + sig(n, cls) + '<span class="ms">' + ms +
    '</span><span class="btns">' + dock + '<b>—</b><b>□</b><b class="x">×</b></span></div>' +
    '<div class="bd">' + body + '</div></div>';
}

const ICO = {
  cpu: '<svg class="pi" viewBox="0 0 16 16"><path d="M5 1h1v2h4V1h1v2h2v2h2v1h-2v4h2v1h-2v2H11v2h-1v-2H6v2H5v-2H3v-2H1v-1h2V5H1V4h2V2h2V1zm1 3v8h4V4H6z"/></svg>',
  mem: '<svg class="pi" viewBox="0 0 16 16"><path d="M1 4h14v8H1V4zm2 2v4h2V6H3zm4 0v4h2V6H7zm4 0v4h2V6h-2z"/></svg>',
  disk: '<svg class="pi" viewBox="0 0 16 16"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v6h10V5H3zm8 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
  net: '<svg class="pi" viewBox="0 0 16 16"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 0 0-1.6 10.75c.4-1.7.9-3.55 1.6-4.75.7 1.2 1.2 3.05 1.6 4.75A5.5 5.5 0 0 0 8 2.5zm0 1.2c.55 1.05 1.15 2.7 1.55 4.3H6.45C6.85 6.4 7.45 4.75 8 3.7z"/></svg>',
  gpu: '<svg class="pi" viewBox="0 0 16 16"><path d="M2 3h12v7H9.5v1.5H11V13H5v-1.5h1.5V10H2V3zm1.5 1.5v4h9v-4h-9z"/></svg>',
  npu: '<svg class="pi" viewBox="0 0 16 16"><path d="M3 2h10v3H3V2zm0 4.5h10V12H9.5v2H6.5v-2H3V6.5zM5 8v2.5h6V8H5z"/></svg>',
  hdd: '<svg class="ti" viewBox="0 0 16 16"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v6h10V5H3zm8 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
  term: '<svg class="ti" viewBox="0 0 16 16"><path d="M1.5 2h13A1.5 1.5 0 0 1 16 3.5v9A1.5 1.5 0 0 1 14.5 14h-13A1.5 1.5 0 0 1 0 12.5v-9A1.5 1.5 0 0 1 1.5 2zM2 4v8h12V4H2zm2.2 2.1 2.2 1.9-2.2 1.9.9 1 3.2-2.8L5.1 5.1l-.9 1zM8.5 10H12v1.2H8.5V10z"/></svg>',
  folder: '<svg class="ti" viewBox="0 0 16 16"><path d="M1 3h5l1.5 1.5H15v9H1V3zm1.2 2.7V12h11.6V5.7H7.2L5.7 4.2H2.2v1.5z"/></svg>'
};

function navItem(label, val, ico, on) {
  return '<div class="ni' + (on ? ' on' : '') + '"><div class="nt">' +
    '<span class="nico">' + ico + '</span><span class="nl">' + label + '</span><span class="nv">' + val +
    '</span></div><div class="sp' + (on ? ' g' : '') + '"></div></div>';
}

function processes() {
  const rows = [
    ['java', 18421, 'deploy', 38.2, 12.4, '1.8 GB', 'S', '/usr/lib/jvm/java -jar app.jar'],
    ['nginx', 902, 'root', 4.1, 0.6, '48 MB', 'S', 'nginx: worker process'],
    ['postgres', 1104, 'postgres', 9.8, 18.2, '2.4 GB', 'S', '/usr/lib/postgresql/14/bin/postgres'],
    ['sshd', 811, 'root', 0.2, 0.1, '8 MB', 'S', '/usr/sbin/sshd -D'],
    ['dockerd', 1402, 'root', 2.6, 3.1, '210 MB', 'S', '/usr/bin/dockerd'],
    ['node', 22108, 'deploy', 14.7, 6.8, '512 MB', 'S', 'node server.js'],
    ['python', 23001, 'deploy', 22.4, 9.1, '740 MB', 'R', 'python train.py --gpu 0']
  ];
  let tr = '';
  rows.forEach((r, i) => {
    tr += '<tr' + (i === 0 ? ' class="sel"' : '') + '><td>' + r[0] + '</td><td class="n">' + r[1] +
      '</td><td>' + r[2] + '</td><td class="n" style="background:' + heat(r[3]) + '">' + r[3].toFixed(1) +
      '%</td><td class="n" style="background:' + heat(r[4]) + '">' + r[4].toFixed(1) +
      '%</td><td class="n" style="background:' + heat(r[4] * 4) + '">' + r[5] +
      '</td><td>' + r[6] + '</td><td class="cmd">' + r[7] + '</td></tr>';
  });
  return '<div class="tm"><div class="tabs"><span class="on">进程</span><span>性能</span><span>端口</span>' +
    '<em>gpu-lab · 16 核 · 运行 12 天</em></div>' +
    '<div class="tools"><input placeholder="筛选进程名 / 命令 / PID / 用户" value="java"><button>结束任务</button></div>' +
    '<div class="tbl"><table><thead><tr><th>名称</th><th class="n">PID</th><th>用户</th>' +
    '<th class="n sorted"><strong>28%</strong><small>CPU</small></th>' +
    '<th class="n"><strong>41%</strong><small>内存</small></th>' +
    '<th class="n"><strong>6.2 GB</strong><small>内存使用</small></th>' +
    '<th>状态</th><th>命令行</th></tr></thead><tbody>' + tr + '</tbody></table></div></div>';
}

function performance() {
  return '<div class="tm"><div class="tabs"><span>进程</span><span class="on">性能</span><span>端口</span>' +
    '<em>gpu-lab · 16 核 · 运行 12 天</em></div>' +
    '<div class="perf"><div class="nav">' +
    navItem('CPU', '28%', ICO.cpu, false) +
    navItem('内存', '41%', ICO.mem, false) +
    navItem('磁盘', '12%', ICO.disk, false) +
    navItem('以太网', '18 MB/s', ICO.net, false) +
    navItem('GPU 0', '72%', ICO.gpu, true) +
    navItem('NPU 0', '35%', ICO.npu, false) +
    '</div><div class="de"><div class="dh"><h3>GPU 0 · NVIDIA RTX 4090</h3><div class="big">72%</div></div>' +
    '<div class="ch"></div><div class="st">' +
    '<div><span>类型</span>GPU（NVIDIA）</div><div><span>型号</span>NVIDIA RTX 4090</div>' +
    '<div><span>利用率</span>72.0%</div><div><span>显存</span>14.2 GB / 24.0 GB</div>' +
    '<div><span>温度</span>68 °C</div><div><span>功耗</span>285.0 W</div></div></div></div></div>';
}

function sshToolbar(activeFiles) {
  return '<div class="sshbar">' +
    '<button title="刷新">↻</button>' +
    '<button>UTF-8 ▾</button>' +
    '<button class="' + (activeFiles ? 'on' : '') + '">' + ICO.folder + ' 文件管理</button>' +
    '<button>快捷键</button><button>主题 ▾</button>' +
    '<span class="hint">Ctrl+F 查找会话内容</span></div>';
}

function ssh(bodyExtra) {
  return sshToolbar(false) +
    '<div class="term"><div class="find"><input value="error"><span>2 / 4</span>' +
    '<button>↑</button><button>↓</button><button>×</button></div><pre>' +
    'deploy@gpu-lab:/data/apps$ pwd\n' +
    '/data/apps\n' +
    'deploy@gpu-lab:/data/apps$ journalctl -u app -n 20 --no-pager\n' +
    'Aug 24 17:02:11 gpu-lab app[18421]: started on :8080\n' +
    'Aug 24 17:08:44 gpu-lab app[18421]: <mark>error</mark>: redis timeout after 2000ms\n' +
    'Aug 24 17:08:44 gpu-lab app[18421]: retrying connection…\n' +
    'Aug 24 17:09:01 gpu-lab app[18421]: health=ok\n' +
    'Aug 24 17:12:19 gpu-lab app[18421]: <mark>error</mark>: upstream 10.10.0.88:9000 reset\n' +
    'deploy@gpu-lab:/data/apps$ _</pre></div>' + (bodyExtra || '');
}

function taskBtn(kind, label) {
  const cls = kind === 'ssh' ? 'ssh' : (kind === 'sftp' ? 'sftp' : 'mon');
  const glyph = kind === 'ssh' ? '&gt;_' : (kind === 'sftp' ? '📁' : '📊');
  return '<u class="tb"><span class="tb-ico ' + cls + '">' + glyph + '</span><span>' + label + '</span></u>';
}

function sftpScan() {
  return '<div class="sftp">' +
    '<div class="nav">' +
    '<button type="button" class="ico-only">◀</button>' +
    '<button type="button" class="ico-only">▶</button>' +
    '<button type="button" class="ico-only">↑</button>' +
    '<div class="addr"><b>Demo Lab(10.10.0.21)</b><span> › data › apps</span></div>' +
    '<button type="button" class="ico-only" title="刷新">↻</button>' +
    '<span class="sep"></span>' +
    '<button type="button">查看 ▾</button>' +
    '<button type="button" class="on tool"><span class="ti-box">💾</span><span>磁盘空间扫描</span></button>' +
    '<button type="button" class="tool"><span class="ti-box">&gt;_</span><span>打开终端</span></button>' +
    '<button type="button" class="ico-only" title="上传">⬆</button>' +
    '<button type="button" class="ico-only" title="收藏">★</button>' +
    '<span class="sep"></span>' +
    '<input class="search" placeholder="搜索…">' +
    '<select><option>1 层</option></select>' +
    '</div>' +
    '<div class="scan">' +
    '<i class="spin"></i>' +
    '<div class="scan-copy"><b>正在扫描大小…</b>' +
    '<div class="scan-path">/data/apps/offline · 统计大小… · 已用时 3s · 已扫 42 个目录</div></div>' +
    '<div class="scan-meter"><div class="scan-meter-fill"></div></div>' +
    '<button type="button" class="stop">停止扫描</button></div>' +
    '<div class="body">' +
    '<aside>' +
    '<div class="st">快速访问</div><div class="fav">★ /data/apps</div>' +
    '<div class="st">目录树</div>' +
    '<div class="tree">' +
    '<div>📁 <b>5.93 GB</b> data</div>' +
    '<div class="ind">📁 <b>2.10 GB</b> apps</div>' +
    '<div class="ind2">📄 config.yml</div>' +
    '</div>' +
    '<div class="disk">' +
    '<div class="dh"><span>磁盘使用空间</span><button type="button">刷新</button></div>' +
    '<div class="disk-scroll"><table class="disk-tbl">' +
    '<thead><tr><th class="c-name">磁盘名称</th><th class="n">总大小</th><th class="n">已用</th><th class="n">剩余</th><th class="n">%可用</th></tr></thead>' +
    '<tbody>' +
    '<tr><td class="c-name"><span class="dn">/</span><span class="dd">overlay</span></td><td class="n">8.70 GB</td><td class="n">3.80 GB</td><td class="n">4.60 GB</td><td class="n">54%</td></tr>' +
    '<tr class="sel"><td class="c-name"><span class="dn">/data</span><span class="dd">/dev/mmcblk0p6</span></td><td class="n">16.0 GB</td><td class="n">5.60 GB</td><td class="n">9.50 GB</td><td class="n">63%</td></tr>' +
    '<tr><td class="c-name"><span class="dn">/boot</span><span class="dd">/dev/mmcblk0p1</span></td><td class="n">128 MB</td><td class="n">20.0 MB</td><td class="n">108 MB</td><td class="n">84%</td></tr>' +
    '</tbody></table></div></div></aside>' +
    '<main><div class="file-scroll"><table class="files">' +
    '<thead><tr><th>名称</th><th>修改日期</th><th class="n">大小</th><th>类型</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>📁 offline</td><td>2026/08/20 11:02</td><td class="n">4.12 GB</td><td>文件夹</td></tr>' +
    '<tr><td>📁 logs</td><td>2026/08/25 09:18</td><td class="n">186 MB</td><td>文件夹</td></tr>' +
    '<tr><td>📄 app.jar</td><td>2026/08/18 16:40</td><td class="n">82.4 MB</td><td>JAR 文件</td></tr>' +
    '<tr><td>📄 config.yml</td><td>2026/08/22 08:11</td><td class="n">12.1 KB</td><td>YML 文件</td></tr>' +
    '</tbody></table></div>' +
    '<div class="sb">4 个项目　选中了 0 个项目</div></main></div></div>';
}

function duoTerminalFiles() {
  return '<div class="duo">' +
    '<div class="half">' + win('Demo Lab', '22ms', 5, 'good',
      sshToolbar(true) +
      '<div class="term"><pre style="padding-top:16px">deploy@gpu-lab:/data/apps$ pwd\n/data/apps\n' +
      'deploy@gpu-lab:/data/apps$ ls\noffline  logs  app.jar  config.yml\n' +
      'deploy@gpu-lab:/data/apps$ _</pre></div>', { dock: true }) + '</div>' +
    '<div class="half">' + win('Demo Lab (10.10.0.21) · apps', '22ms', 5, 'good',
      '<div class="sftp">' +
      '<div class="nav">' +
      '<button type="button" class="ico-only">◀</button>' +
      '<button type="button" class="ico-only">▶</button>' +
      '<button type="button" class="ico-only">↑</button>' +
      '<div class="addr"><b>Demo Lab(10.10.0.21)</b><span> › data › apps</span></div>' +
      '<span class="sep"></span>' +
      '<button type="button" class="on tool"><span class="ti-box">💾</span><span>磁盘空间扫描</span></button>' +
      '<button type="button" class="tool"><span class="ti-box">&gt;_</span><span>打开终端</span></button>' +
      '</div>' +
      '<main><div class="file-scroll"><table class="files">' +
      '<thead><tr><th>名称</th><th class="n">大小</th></tr></thead><tbody>' +
      '<tr><td>📁 offline</td><td class="n">4.12 GB</td></tr>' +
      '<tr><td>📁 logs</td><td class="n">186 MB</td></tr>' +
      '<tr><td>📄 app.jar</td><td class="n">82.4 MB</td></tr>' +
      '<tr><td>📄 config.yml</td><td class="n">12.1 KB</td></tr>' +
      '</tbody></table></div>' +
      '<div class="sb">已从终端目录 /data/apps 打开</div></main></div>', { dock: true }) + '</div></div>';
}

function win11Dialog() {
  return '<div class="desk dim"><div class="dlg">' +
    '<div class="dlg-h"><span>添加会话</span><button>×</button></div>' +
    '<div class="dlg-b">' +
    '<label>会话名称</label><input value="Demo Lab">' +
    '<label>IP 地址</label><input value="10.10.0.21">' +
    '<label>端口</label><input value="22">' +
    '<label>用户名</label><input value="deploy">' +
    '<label>密码</label><input type="password" value="••••••••">' +
    '</div><div class="dlg-f"><button class="sec">取消</button><button class="pri">保存</button></div></div></div>';
}

const CSS =
  'html,body{margin:0;height:100%;font-family:"Segoe UI","Microsoft YaHei",sans-serif}' +
  '.desk{height:100%;background:linear-gradient(160deg,#0b3d5c,#1a7a6d 55%,#0e4b3c);position:relative;overflow:hidden}' +
  '.desk.dim{background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}' +
  '.icons{position:absolute;left:16px;top:16px;color:#fff;font-size:12px;text-align:center;width:72px}' +
  '.icons div{margin-bottom:14px}.icons i{display:block;width:40px;height:42px;margin:0 auto 6px;border-radius:10px;background:#2f5f8a}' +
  '.win{position:absolute;inset:0;background:#fff;border-radius:8px;box-shadow:0 12px 28px rgba(0,0,0,.22);overflow:hidden;display:flex;flex-direction:column}' +
  '.ttl{height:32px;display:flex;align-items:center;gap:8px;padding-left:12px;border-bottom:1px solid #eee;font-size:12px;font-weight:500}' +
  '.ico{width:14px;height:14px;border-radius:3px;background:#1b4f72}.name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.sig{display:inline-flex;align-items:flex-end;gap:2px;height:12px}.sig i{width:3px;border-radius:1px;background:currentColor;opacity:.22}' +
  '.sig i:nth-child(1){height:4px}.sig i:nth-child(2){height:6px}.sig i:nth-child(3){height:8px}.sig i:nth-child(4){height:10px}.sig i:nth-child(5){height:12px}' +
  '.sig i.on{opacity:1}.sig.good{color:#16a34a}.sig.fair{color:#ca8a04}.ms{font-variant-numeric:tabular-nums}' +
  '.btns{display:flex;height:32px}.btns b,.btns .dock{width:40px;display:flex;align-items:center;justify-content:center;font-weight:400;border:0;background:transparent}' +
  '.bd{flex:1;min-height:0;display:flex;flex-direction:column}.tm{flex:1;display:flex;flex-direction:column;min-height:0;font-size:12px}' +
  '.tabs{display:flex;gap:4px;padding:6px 10px 0;border-bottom:1px solid #e5e5e5;align-items:center}' +
  '.tabs span{padding:7px 12px;border-bottom:2px solid transparent}.tabs span.on{color:#0b57d0;border-bottom-color:#0b57d0;font-weight:600}' +
  '.tabs em{margin-left:auto;color:#666;font-style:normal;font-size:11px}' +
  '.tools{display:flex;gap:8px;padding:8px 10px}.tools input{flex:1;border:1px solid #d0d0d0;border-radius:4px;padding:5px 8px}' +
  '.tools button{border:1px solid #d0d0d0;background:#fff;padding:4px 10px;border-radius:4px;color:#b42318}' +
  'table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border-bottom:1px solid #eee;text-align:left;white-space:nowrap}' +
  'th{background:#fafafa}th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}' +
  'th strong{display:block;font-size:13px}th small{display:block;font-size:11px;color:#444}' +
  'th.sorted{color:#0b57d0}tr.sel td{background:#cfe8ff}td.cmd{max-width:280px;overflow:hidden;text-overflow:ellipsis;color:#444}' +
  '.perf{flex:1;display:flex;min-height:0}.nav{width:220px;background:#f7f7f7;border-right:1px solid #e5e5e5;padding:8px 0}' +
  '.ni{padding:8px 12px;border-left:3px solid transparent}.ni.on{background:#fff;border-left-color:#0b57d0}' +
  '.nt{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px}' +
  '.nico{width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;color:#555}' +
  '.nico .pi{width:16px;height:16px;fill:currentColor}.ni.on .nico{color:#0b57d0}' +
  '.ni:nth-child(5) .nico{color:#76b900}.ni:nth-child(6) .nico{color:#e67e22}' +
  '.nl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.nv{font-variant-numeric:tabular-nums}' +
  '.sp{height:36px;margin-top:4px;clear:both;border:1px solid #e5e5e5;background:#fff}' +
  '.sp.g{background:linear-gradient(180deg,#e8f8d8,#fff)}.de{flex:1;padding:12px 16px}' +
  '.dh{display:flex;justify-content:space-between;align-items:baseline}.dh h3{margin:0;font-size:16px}.big{font-size:22px;font-weight:600}' +
  '.ch{height:180px;border:1px solid #d0d0d0;background:linear-gradient(to top,rgba(118,185,0,.28),transparent 70%),#fafafa}' +
  '.st{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-top:12px}.st span{display:block;color:#666}' +
  '.sshbar{display:flex;gap:6px;align-items:center;padding:6px 10px;background:#1e1e1e;border-bottom:1px solid #333;flex:0 0 auto}' +
  '.sshbar button{border:1px solid #444;background:#2a2a2a;color:#ddd;border-radius:4px;padding:4px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px}' +
  '.sshbar button.on{background:#0b57d0;border-color:#0b57d0;color:#fff}' +
  '.sshbar .ti{width:14px;height:14px;fill:currentColor}.sshbar .hint{margin-left:auto;color:#888;font-size:11px}' +
  '.term{flex:1;background:#111;color:#ddd;position:relative;min-height:0}' +
  '.find{position:absolute;right:12px;top:10px;display:flex;gap:6px;align-items:center;background:#2a2a2a;border:1px solid #555;border-radius:6px;padding:4px 8px}' +
  '.find input{width:140px;height:24px;border:1px solid #555;background:#1a1a1a;color:#eee;border-radius:3px;padding:0 8px}' +
  '.find span{color:#bbb;font-size:12px}.find button{height:24px;min-width:24px;border:1px solid #555;background:#3a3a3a;color:#eee;border-radius:3px}' +
  'pre{margin:0;padding:44px 14px 12px;font:13px Consolas,monospace;line-height:1.55;white-space:pre-wrap}' +
  'mark{background:#ffcc00;color:#000;font-weight:700;outline:2px solid #ff6600}' +
  '.bar{position:absolute;left:0;right:0;bottom:0;height:48px;background:rgba(32,32,32,.78);display:flex;gap:6px;align-items:center;padding:0 12px;color:#eee;font-size:12px}' +
  '.bar .tb{text-decoration:none;background:rgba(255,255,255,.14);padding:6px 12px;border-radius:4px;display:inline-flex;align-items:center;gap:8px;max-width:240px}' +
  '.bar .tb-ico{width:18px;height:18px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 18px;font-size:11px;line-height:1}' +
  '.bar .tb-ico.ssh{background:#0b57d0;color:#fff;font-family:Consolas,monospace;font-size:10px;font-weight:700}' +
  '.bar .tb-ico.sftp{background:#e8b84a;font-size:12px}' +
  '.bar .tb-ico.mon{background:#1b4f72;font-size:11px}' +
  '.sftp{flex:1;display:flex;flex-direction:column;min-height:0;background:#f3f3f3;font-size:12px;color:#1a1a1a}' +
  '.sftp .nav{display:grid;grid-template-columns:auto auto auto minmax(180px,1fr) auto 8px auto auto auto auto auto 8px 120px 58px;align-items:center;column-gap:6px;padding:6px 10px;border-bottom:1px solid #e5e5e5;background:#f3f3f3;flex:0 0 auto;min-height:44px;box-sizing:border-box}' +
  '.sftp .nav button{border:1px solid transparent;background:transparent;height:32px;padding:0 10px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;font-size:12px;color:#1a1a1a;line-height:32px;box-sizing:border-box}' +
  '.sftp .nav button.ico-only{width:32px;padding:0}' +
  '.sftp .nav button.tool{min-width:max-content}' +
  '.sftp .nav button.on{background:#cce8ff;color:#005a9e}' +
  '.sftp .ti-box{flex:0 0 auto;font-size:13px;line-height:1}' +
  '.sftp .addr{height:32px;border:1px solid #8a8a8a;border-radius:4px;background:#fff;display:flex;align-items:center;padding:0 10px;overflow:hidden;white-space:nowrap;min-width:0}' +
  '.sftp .sep{width:1px;height:20px;background:#d0d0d0}' +
  '.sftp .search{height:32px;border:1px solid #8a8a8a;border-radius:4px 0 0 4px;border-right:0;padding:0 8px;width:100%;box-sizing:border-box}' +
  '.sftp .nav select{height:32px;border:1px solid #8a8a8a;border-radius:0 4px 4px 0;background:#fafafa;width:100%;box-sizing:border-box}' +
  '.sftp .scan{display:flex;align-items:center;gap:10px;margin:6px 8px 0;padding:8px 10px;background:#f3f9ff;border:1px solid #cce8ff;border-radius:4px;flex:0 0 auto}' +
  '.sftp .spin{width:16px;height:16px;border:2px solid #cce8ff;border-top-color:#0078d4;border-radius:50%;animation:spin .8s linear infinite;flex:0 0 16px}' +
  '@keyframes spin{to{transform:rotate(360deg)}}' +
  '.sftp .scan-copy{flex:1 1 auto;min-width:0}.sftp .scan-path{color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.sftp .scan-meter{position:relative;flex:0 0 120px;height:4px;background:#d6ebfa;border-radius:2px;overflow:hidden}' +
  '.sftp .scan-meter-fill{position:absolute;left:0;top:0;height:100%;width:40%;background:#0078d4}' +
  '.sftp .stop{border:1px solid #c8c8c8;background:#fff;height:26px;padding:0 10px;border-radius:4px;flex:0 0 auto;white-space:nowrap}' +
  '.sftp .body{flex:1;display:flex;min-height:0}' +
  '.sftp aside{width:300px;border-right:1px solid #d4d4d4;background:#f3f3f3;display:flex;flex-direction:column;min-height:0;flex:0 0 300px}' +
  '.sftp .st{padding:8px 10px 4px;color:#555;font-weight:600;font-size:11px}' +
  '.sftp .fav,.sftp .tree div{padding:4px 10px;line-height:1.4}' +
  '.sftp .ind{padding-left:22px}.sftp .ind2{padding-left:36px;color:#444}' +
  '.sftp .disk{border-top:1px solid #d0d0d0;background:#f7f7f7;flex:0 0 auto;max-height:46%;display:flex;flex-direction:column;min-height:0}' +
  '.sftp .disk .dh{display:flex;justify-content:space-between;align-items:center;padding:6px 8px 4px;font-weight:600;font-size:11px;flex:0 0 auto}' +
  '.sftp .disk .dh button{border:1px solid #c8c8c8;background:#fff;height:22px;padding:0 8px;border-radius:3px;font-size:11px}' +
  '.sftp .disk-scroll{overflow:auto;padding:0 6px 8px;flex:1 1 auto;min-height:0}' +
  '.sftp .disk-tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}' +
  '.sftp .disk-tbl th,.sftp .disk-tbl td{padding:4px 6px;border-bottom:1px solid #e6e6e6;vertical-align:top}' +
  '.sftp .disk-tbl th{color:#666;background:#f0f0f0;font-weight:600;white-space:nowrap}' +
  '.sftp .disk-tbl .c-name{width:34%;text-align:left}' +
  '.sftp .disk-tbl th.n,.sftp .disk-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
  '.sftp .dn{display:block;font-weight:600;line-height:1.2}.sftp .dd{display:block;color:#888;font-size:10px;font-weight:400;line-height:1.2;margin-top:1px}' +
  '.sftp .disk-tbl tr.sel td{background:#e5f3ff}' +
  '.sftp main{flex:1;display:flex;flex-direction:column;min-width:0;background:#fff;min-height:0}' +
  '.sftp .file-scroll{flex:1 1 auto;overflow:auto;min-height:0}' +
  '.sftp .files{width:100%;border-collapse:collapse;table-layout:fixed}' +
  '.sftp .files th,.sftp .files td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left;white-space:nowrap;line-height:1.35;height:auto}' +
  '.sftp .files th{background:#fafafa;position:sticky;top:0}' +
  '.sftp .files th.n,.sftp .files td.n{text-align:right;font-variant-numeric:tabular-nums}' +
  '.sftp .sb{padding:4px 10px;border-top:1px solid #d4d4d4;background:#f3f3f3;color:#333;flex:0 0 auto}' +
  '.duo{position:absolute;inset:36px 24px 56px;display:flex;gap:12px}' +
  '.duo .half{flex:1;position:relative;min-width:0}.duo .win{position:absolute;inset:0}' +
  '.duo .sftp .nav{grid-template-columns:auto auto auto minmax(120px,1fr) 8px auto auto}' +
  '.dlg{width:420px;background:#f3f3f3;border:1px solid #ebebeb;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.18);overflow:hidden}' +
  '.dlg-h{display:flex;justify-content:space-between;align-items:center;padding:14px 18px 12px;background:#f9f9f9;border-bottom:1px solid #e5e5e5;font-weight:600}' +
  '.dlg-h button{border:0;background:transparent;font-size:20px;line-height:1;border-radius:4px;padding:4px 8px}' +
  '.dlg-b{padding:16px 18px}.dlg-b label{display:block;font-size:12px;font-weight:600;color:#5d5d5d;margin:10px 0 4px}' +
  '.dlg-b input{width:100%;box-sizing:border-box;border:1px solid #8a8a8a;border-radius:4px;padding:8px 10px;font-size:13px}' +
  '.dlg-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;background:#f9f9f9;border-top:1px solid #e5e5e5}' +
  '.dlg-f button{min-width:80px;padding:6px 14px;border-radius:4px;font-size:13px}' +
  '.dlg-f .sec{background:#fff;border:1px solid #8a8a8a}.dlg-f .pri{background:#005fb8;border:1px solid #005fb8;color:#fff}';

function html(inner) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + CSS + '</style></head><body>' + inner + '</body></html>';
}

async function save(page, name) {
  const buf = await page.screenshot({ type: 'png' });
  OUTS.forEach((d) => fs.writeFileSync(path.join(d, name), buf));
  console.log('wrote', name);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  await page.setContent(html(
    '<div class="desk"><div class="icons"><div><i></i>gpu-lab</div><div><i></i>ci-node</div></div>' +
    '<div style="position:absolute;left:28px;top:36px;width:680px;height:600px">' +
    win('gpu-lab — 任务管理器', '18ms', 5, 'good', processes()) + '</div>' +
    '<div style="position:absolute;left:730px;top:72px;width:680px;height:600px">' +
    win('ci-node — 任务管理器', '86ms', 3, 'fair', performance()) + '</div>' +
    '<div class="bar">' + taskBtn('mon', 'gpu-lab 任务管理器') + taskBtn('mon', 'ci-node 任务管理器') + '</div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '18-monitor-multi.png');

  await page.setContent(html(
    '<div class="desk"><div style="position:absolute;left:48px;top:40px;width:1100px;height:700px">' +
    win('gpu-lab — 任务管理器', '18ms', 5, 'good', processes()) +
    '</div><div class="bar">' + taskBtn('mon', 'gpu-lab 任务管理器') + '</div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '16-monitor-processes.png');

  await page.setContent(html(
    '<div class="desk"><div style="position:absolute;left:48px;top:40px;width:1100px;height:700px">' +
    win('gpu-lab — 任务管理器', '18ms', 5, 'good', performance()) +
    '</div><div class="bar">' + taskBtn('mon', 'gpu-lab 任务管理器') + '</div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '17-monitor-performance.png');

  await page.setContent(html(
    '<div class="desk"><div style="position:absolute;left:80px;top:48px;width:1180px;height:680px">' +
    win('gpu-lab', '22ms', 5, 'good', ssh()) +
    '</div><div class="bar">' + taskBtn('ssh', 'gpu-lab') + '</div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '19-ssh-signal-find.png');

  await page.setContent(html(
    '<div class="desk"><div style="position:absolute;left:40px;top:32px;width:1280px;height:760px">' +
    win('Demo Lab (10.10.0.21) · apps', '19ms', 5, 'good', sftpScan(), { dock: true }) +
    '</div><div class="bar">' + taskBtn('sftp', 'Demo Lab 文件') + '</div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '20-sftp-disk-scan.png');

  await page.setContent(html(
    '<div class="desk">' + duoTerminalFiles() +
    '<div class="bar">' + taskBtn('ssh', 'Demo Lab') + taskBtn('sftp', 'Demo Lab 文件') + '</div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '21-terminal-files-sync.png');

  await page.setContent(html(win11Dialog()), { waitUntil: 'domcontentloaded' });
  await save(page, '03-add-server.png');

  await browser.close();
  console.log('feature shots done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
