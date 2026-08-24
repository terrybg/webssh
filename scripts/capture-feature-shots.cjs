/**
 * README shots for task-manager + Ctrl+F (demo HTML, no live SSH).
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

function win(title, ms, n, cls, body) {
  return '<div class="win"><div class="ttl"><span class="ico"></span><span class="name">' +
    title + '</span>' + sig(n, cls) + '<span class="ms">' + ms +
    '</span><span class="btns"><b>—</b><b>□</b><b class="x">×</b></span></div>' +
    '<div class="bd">' + body + '</div></div>';
}

function processes() {
  const rows = [
    ['java', 18421, 'deploy', 38.2, 12.4, '1.8 GB', 'S', '/usr/lib/jvm/java -jar app.jar'],
    ['nginx', 902, 'root', 4.1, 0.6, '48 MB', 'S', 'nginx: worker process'],
    ['postgres', 1104, 'postgres', 9.8, 18.2, '2.4 GB', 'S', '/usr/lib/postgresql/14/bin/postgres'],
    ['sshd', 811, 'root', 0.2, 0.1, '8 MB', 'S', '/usr/sbin/sshd -D'],
    ['dockerd', 1402, 'root', 2.6, 3.1, '210 MB', 'S', '/usr/bin/dockerd'],
    ['node', 22108, 'deploy', 14.7, 6.8, '512 MB', 'S', 'node server.js']
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
    '<div class="tools"><input placeholder="筛选进程名 / 命令 / PID / 用户"><button>结束任务</button></div>' +
    '<div class="tbl"><table><thead><tr><th>名称</th><th class="n">PID</th><th>用户</th>' +
    '<th class="n"><strong>28%</strong><small>CPU</small></th>' +
    '<th class="n"><strong>41%</strong><small>内存</small></th>' +
    '<th class="n"><strong>6.2 GB</strong><small>内存使用</small></th>' +
    '<th>状态</th><th>命令行</th></tr></thead><tbody>' + tr + '</tbody></table></div></div>';
}

function performance() {
  return '<div class="tm"><div class="tabs"><span>进程</span><span class="on">性能</span><span>端口</span>' +
    '<em>gpu-lab · 16 核 · 运行 12 天</em></div>' +
    '<div class="perf"><div class="nav">' +
    '<div class="ni">CPU<span>28%</span><div class="sp"></div></div>' +
    '<div class="ni">内存<span>41%</span><div class="sp"></div></div>' +
    '<div class="ni">磁盘<span>12%</span><div class="sp"></div></div>' +
    '<div class="ni">以太网<span>18 MB/s</span><div class="sp"></div></div>' +
    '<div class="ni on">GPU 0<span>72%</span><div class="sp g"></div></div>' +
    '<div class="ni">NPU 0<span>35%</span><div class="sp"></div></div>' +
    '</div><div class="de"><div class="dh"><h3>GPU 0 · NVIDIA RTX 4090</h3><div class="big">72%</div></div>' +
    '<div class="ch"></div><div class="st">' +
    '<div><span>类型</span>GPU（NVIDIA）</div><div><span>型号</span>NVIDIA RTX 4090</div>' +
    '<div><span>利用率</span>72.0%</div><div><span>显存</span>14.2 GB / 24.0 GB</div>' +
    '<div><span>温度</span>68 °C</div><div><span>功耗</span>285.0 W</div></div></div></div></div>';
}

function ssh() {
  return '<div class="term"><div class="find"><input value="error"><span>2 / 4</span>' +
    '<button>↑</button><button>↓</button><button>×</button></div><pre>' +
    'deploy@gpu-lab:~$ journalctl -u app -n 20 --no-pager\n' +
    'Aug 24 17:02:11 gpu-lab app[18421]: started on :8080\n' +
    'Aug 24 17:08:44 gpu-lab app[18421]: <mark>error</mark>: redis timeout after 2000ms\n' +
    'Aug 24 17:08:44 gpu-lab app[18421]: retrying connection…\n' +
    'Aug 24 17:09:01 gpu-lab app[18421]: health=ok\n' +
    'Aug 24 17:12:19 gpu-lab app[18421]: <mark>error</mark>: upstream 10.10.0.88:9000 reset\n' +
    'deploy@gpu-lab:~$ _</pre></div>';
}

const CSS =
  'html,body{margin:0;height:100%;font-family:"Segoe UI","Microsoft YaHei",sans-serif}' +
  '.desk{height:100%;background:linear-gradient(160deg,#0b3d5c,#1a7a6d 55%,#0e4b3c);position:relative;overflow:hidden}' +
  '.icons{position:absolute;left:16px;top:16px;color:#fff;font-size:12px;text-align:center;width:72px}' +
  '.icons div{margin-bottom:14px}.icons i{display:block;width:40px;height:42px;margin:0 auto 6px;border-radius:10px;background:#2f5f8a}' +
  '.win{position:absolute;inset:0;background:#fff;border-radius:8px;box-shadow:0 12px 28px rgba(0,0,0,.22);overflow:hidden;display:flex;flex-direction:column}' +
  '.ttl{height:32px;display:flex;align-items:center;gap:8px;padding-left:12px;border-bottom:1px solid #eee;font-size:12px;font-weight:500}' +
  '.ico{width:14px;height:14px;border-radius:3px;background:#1b4f72}.name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.sig{display:inline-flex;align-items:flex-end;gap:2px;height:12px}.sig i{width:3px;border-radius:1px;background:currentColor;opacity:.22}' +
  '.sig i:nth-child(1){height:4px}.sig i:nth-child(2){height:6px}.sig i:nth-child(3){height:8px}.sig i:nth-child(4){height:10px}.sig i:nth-child(5){height:12px}' +
  '.sig i.on{opacity:1}.sig.good{color:#16a34a}.sig.fair{color:#ca8a04}.ms{font-variant-numeric:tabular-nums}' +
  '.btns{display:flex;height:32px}.btns b{width:40px;display:flex;align-items:center;justify-content:center;font-weight:400}' +
  '.bd{flex:1;min-height:0;display:flex;flex-direction:column}.tm{flex:1;display:flex;flex-direction:column;min-height:0;font-size:12px}' +
  '.tabs{display:flex;gap:4px;padding:6px 10px 0;border-bottom:1px solid #e5e5e5;align-items:center}' +
  '.tabs span{padding:7px 12px;border-bottom:2px solid transparent}.tabs span.on{color:#0b57d0;border-bottom-color:#0b57d0;font-weight:600}' +
  '.tabs em{margin-left:auto;color:#666;font-style:normal;font-size:11px}' +
  '.tools{display:flex;gap:8px;padding:8px 10px}.tools input{flex:1;border:1px solid #d0d0d0;border-radius:4px;padding:5px 8px}' +
  '.tools button{border:1px solid #d0d0d0;background:#fff;padding:4px 10px;border-radius:4px;color:#b42318}' +
  'table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border-bottom:1px solid #eee;text-align:left;white-space:nowrap}' +
  'th{background:#fafafa}th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}' +
  'th strong{display:block;font-size:13px}th small{display:block;font-size:11px;color:#444}' +
  'tr.sel td{background:#cfe8ff}td.cmd{max-width:280px;overflow:hidden;text-overflow:ellipsis;color:#444}' +
  '.perf{flex:1;display:flex;min-height:0}.nav{width:200px;background:#f7f7f7;border-right:1px solid #e5e5e5;padding:8px 0}' +
  '.ni{padding:8px 12px;border-left:3px solid transparent}.ni.on{background:#fff;border-left-color:#0b57d0}' +
  '.ni span{float:right;font-weight:600}.sp{height:36px;margin-top:4px;clear:both;border:1px solid #e5e5e5;background:#fff}' +
  '.sp.g{background:linear-gradient(180deg,#e8f8d8,#fff)}.de{flex:1;padding:12px 16px}' +
  '.dh{display:flex;justify-content:space-between;align-items:baseline}.dh h3{margin:0;font-size:16px}.big{font-size:22px;font-weight:600}' +
  '.ch{height:180px;border:1px solid #d0d0d0;background:linear-gradient(to top,rgba(118,185,0,.28),transparent 70%),#fafafa}' +
  '.st{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-top:12px}.st span{display:block;color:#666}' +
  '.term{flex:1;background:#111;color:#ddd;position:relative}' +
  '.find{position:absolute;right:12px;top:10px;display:flex;gap:6px;align-items:center;background:#2a2a2a;border:1px solid #555;border-radius:6px;padding:4px 8px}' +
  '.find input{width:140px;height:24px;border:1px solid #555;background:#1a1a1a;color:#eee;border-radius:3px;padding:0 8px}' +
  '.find span{color:#bbb;font-size:12px}.find button{height:24px;min-width:24px;border:1px solid #555;background:#3a3a3a;color:#eee;border-radius:3px}' +
  'pre{margin:0;padding:44px 14px 12px;font:13px Consolas,monospace;line-height:1.55;white-space:pre-wrap}' +
  'mark{background:#ffcc00;color:#000;font-weight:700;outline:2px solid #ff6600}' +
  '.bar{position:absolute;left:0;right:0;bottom:0;height:36px;background:rgba(20,30,40,.72);display:flex;gap:6px;align-items:center;padding:0 10px;color:#eee;font-size:12px}' +
  '.bar u{text-decoration:none;background:rgba(255,255,255,.12);padding:4px 10px;border-radius:4px}';

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
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });

  await page.setContent(html(
    '<div class="desk"><div class="icons"><div><i></i>gpu-lab</div><div><i></i>ci-node</div></div>' +
    '<div style="position:absolute;left:28px;top:36px;width:640px;height:560px">' +
    win('gpu-lab — 任务管理器', '18ms', 5, 'good', processes()) + '</div>' +
    '<div style="position:absolute;left:690px;top:72px;width:640px;height:560px">' +
    win('ci-node — 任务管理器', '86ms', 3, 'fair', performance()) + '</div>' +
    '<div class="bar"><u>gpu-lab 任务管理器</u><u>ci-node 任务管理器</u></div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '18-monitor-multi.png');

  await page.setContent(html(
    '<div class="desk"><div style="position:absolute;left:48px;top:40px;width:980px;height:640px">' +
    win('gpu-lab — 任务管理器', '18ms', 5, 'good', processes()) +
    '</div><div class="bar"><u>gpu-lab 任务管理器</u></div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '16-monitor-processes.png');

  await page.setContent(html(
    '<div class="desk"><div style="position:absolute;left:48px;top:40px;width:980px;height:640px">' +
    win('gpu-lab — 任务管理器', '18ms', 5, 'good', performance()) +
    '</div><div class="bar"><u>gpu-lab 任务管理器</u></div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '17-monitor-performance.png');

  await page.setContent(html(
    '<div class="desk"><div style="position:absolute;left:80px;top:48px;width:1100px;height:640px">' +
    win('gpu-lab', '22ms', 5, 'good', ssh()) +
    '</div><div class="bar"><u>gpu-lab</u></div></div>'
  ), { waitUntil: 'domcontentloaded' });
  await save(page, '19-ssh-signal-find.png');

  await browser.close();
  console.log('feature shots done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
