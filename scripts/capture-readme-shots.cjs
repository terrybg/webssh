/**
 * Capture README screenshots against the real desktop UI + mocked APIs.
 * Requires: WebSSH on :9092, playwright installed in tools/webssh.
 *
 * Usage: node scripts/capture-readme-shots.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT_DIRS = [
  path.join(ROOT, 'img'),
  path.join(ROOT, 'src', 'main', 'resources', 'static', 'webssh', 'img')
];
OUT_DIRS.forEach((d) => fs.mkdirSync(d, { recursive: true }));

const BASE = 'http://127.0.0.1:9092/webssh/page';
const VIEW = { width: 1360, height: 860 };

const DEMO_SESSIONS = [
  { id: 'demo-lab', name: 'Demo Lab', ip: '10.10.0.21', port: 22, userName: 'deploy', password: 'demo-pass' },
  { id: 'demo-ci', name: 'CI Runner', ip: '10.10.0.88', port: 22, userName: 'builder', password: 'demo-pass' },
  { id: 'gpu-lab', name: 'gpu-lab', ip: '10.10.0.50', port: 22, userName: 'deploy', password: 'demo-pass' }
];

const DEMO_LS = [
  { name: 'api', dir: true, size: 4096, modifyTime: '2026-08-12 09:21', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'web', dir: true, size: 4096, modifyTime: '2026-08-12 09:22', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'logs', dir: true, size: 4096, modifyTime: '2026-08-10 14:02', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'backup', dir: true, size: 4096, modifyTime: '2026-08-05 12:00', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'README.md', dir: false, size: 1240, modifyTime: '2026-08-12 09:20', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'docker-compose.yml', dir: false, size: 846, modifyTime: '2026-08-11 18:03', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'app.log', dir: false, size: 204800, modifyTime: '2026-08-18 08:11', permissions: '-rw-r-----', permissionText: '640', owner: 'deploy' },
  { name: 'banner.png', dir: false, size: 48200, modifyTime: '2026-08-09 16:40', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'demo.mp4', dir: false, size: 5242880, modifyTime: '2026-08-15 11:00', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'deploy.py', dir: false, size: 2100, modifyTime: '2026-08-12 10:00', permissions: '-rwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'report.xlsx', dir: false, size: 18432, modifyTime: '2026-08-16 09:30', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' }
];

const TREE_ROOT = [
  { name: 'data', dir: true, size: 4096, modifyTime: '2026-08-01 10:00', permissions: 'drwxr-xr-x', owner: 'root' },
  { name: 'opt', dir: true, size: 4096, modifyTime: '2026-07-20 11:00', permissions: 'drwxr-xr-x', owner: 'root' },
  { name: 'home', dir: true, size: 4096, modifyTime: '2026-07-01 09:00', permissions: 'drwxr-xr-x', owner: 'root' }
];
const TREE_DATA = [
  { name: 'apps', dir: true, size: 4096, modifyTime: '2026-08-12 09:00', permissions: 'drwxr-xr-x', owner: 'deploy' },
  { name: 'backup', dir: true, size: 4096, modifyTime: '2026-08-05 12:00', permissions: 'drwxr-xr-x', owner: 'deploy' }
];

const DEMO_DISKS = [
  { name: '/', device: '/dev/sda1', total: 53687091200, used: 32212254720, avail: 21474836480, pctAvail: 40 },
  { name: '/data', device: '/dev/sdb1', total: 1099511627776, used: 687194767360, avail: 412316860416, pctAvail: 37 },
  { name: '/overlay', device: 'overlay', total: 8589934592, used: 3221225472, avail: 5368709120, pctAvail: 62 }
];

const SCAN_ENTRIES = [
  { path: '/data/apps', size: 3221225472, dir: true, seq: 1 },
  { path: '/data/apps/api', size: 2147483648, dir: true, seq: 2 },
  { path: '/data/apps/web', size: 536870912, dir: true, seq: 3 },
  { path: '/data/apps/logs', size: 419430400, dir: true, seq: 4 },
  { path: '/data/apps/backup', size: 104857600, dir: true, seq: 5 },
  { path: '/data/apps/README.md', size: 1240, dir: false, seq: 6 },
  { path: '/data/apps/docker-compose.yml', size: 846, dir: false, seq: 7 },
  { path: '/data/apps/app.log', size: 204800, dir: false, seq: 8 }
];

const DEMO_COMMANDS = [
  { id: 'c1', name: '查看本机 IP', value: 'ip -br a' },
  { id: 'c2', name: '磁盘占用 Top', value: 'df -hT' },
  { id: 'c3', name: '监听端口', value: 'ss -lntup' },
  { id: 'c4', name: 'Docker 容器', value: 'docker ps --format "table {{.Names}}\\t{{.Status}}"' },
  { id: 'c5', name: 'systemd 失败单元', value: 'systemctl --failed' },
  { id: 'c6', name: '最近日志', value: 'journalctl -xe -n 80 --no-pager' },
  { id: 'c7', name: 'CPU / 内存快照', value: 'top -b -n 1 | head -n 20' },
  { id: 'c8', name: '查找大文件', value: 'du -ahx /data | sort -rh | head -n 30' },
  { id: 'c9', name: '重启应用', value: 'systemctl restart app && systemctl status app --no-pager' },
  { id: 'c10', name: '同步时间', value: 'timedatectl status' }
];

function jsonOk(result) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 200, message: 'ok', result: result })
  };
}

function monitorSnapshot(tick) {
  const t = tick || 0;
  return {
    host: 'gpu-lab',
    cores: 16,
    cpuPercent: 28 + (t % 5),
    memPercent: 41,
    memTotal: 64 * 1024 * 1024 * 1024,
    memUsed: 26.2 * 1024 * 1024 * 1024,
    memAvail: 37.8 * 1024 * 1024 * 1024,
    swapTotal: 8 * 1024 * 1024 * 1024,
    swapUsed: 512 * 1024 * 1024,
    load1: '1.24',
    load5: '0.98',
    load15: '0.72',
    uptimeSec: 12 * 86400 + 3 * 3600,
    net: { rxBytes: 12e9 + t * 2.5e6, txBytes: 8e9 + t * 1.2e6 },
    disks: [
      { fs: '/dev/sda1', size: 53687091200, used: 32212254720, avail: 21474836480, percent: 60, mount: '/' },
      { fs: '/dev/sdb1', size: 1099511627776, used: 687194767360, avail: 412316860416, percent: 63, mount: '/data' }
    ],
    processes: [
      { name: 'java', pid: 18421, user: 'deploy', cpu: 38.2, mem: 12.4, rss: 1.8 * 1024 * 1024 * 1024, stat: 'S', cmd: '/usr/lib/jvm/java -jar app.jar' },
      { name: 'nginx', pid: 902, user: 'root', cpu: 4.1, mem: 0.6, rss: 48 * 1024 * 1024, stat: 'S', cmd: 'nginx: worker process' },
      { name: 'postgres', pid: 1104, user: 'postgres', cpu: 9.8, mem: 18.2, rss: 2.4 * 1024 * 1024 * 1024, stat: 'S', cmd: '/usr/lib/postgresql/14/bin/postgres' },
      { name: 'sshd', pid: 811, user: 'root', cpu: 0.2, mem: 0.1, rss: 8 * 1024 * 1024, stat: 'S', cmd: '/usr/sbin/sshd -D' },
      { name: 'dockerd', pid: 1402, user: 'root', cpu: 2.6, mem: 3.1, rss: 210 * 1024 * 1024, stat: 'S', cmd: '/usr/bin/dockerd' },
      { name: 'node', pid: 22108, user: 'deploy', cpu: 14.7, mem: 6.8, rss: 512 * 1024 * 1024, stat: 'S', cmd: 'node server.js' },
      { name: 'python', pid: 23001, user: 'deploy', cpu: 22.4, mem: 9.1, rss: 740 * 1024 * 1024, stat: 'R', cmd: 'python train.py --gpu 0' }
    ],
    ports: [
      { proto: 'tcp', local: '0.0.0.0:22', pid: 811, process: 'sshd' },
      { proto: 'tcp', local: '0.0.0.0:80', pid: 902, process: 'nginx' },
      { proto: 'tcp', local: '0.0.0.0:443', pid: 902, process: 'nginx' },
      { proto: 'tcp', local: '127.0.0.1:5432', pid: 1104, process: 'postgres' },
      { proto: 'tcp', local: '0.0.0.0:8080', pid: 18421, process: 'java' },
      { proto: 'tcp', local: '0.0.0.0:3000', pid: 22108, process: 'node' },
      { proto: 'udp', local: '0.0.0.0:53', pid: 612, process: 'systemd-resolve' }
    ],
    accelerators: [
      {
        id: 'gpu-0', kind: 'gpu', vendor: 'NVIDIA', label: 'GPU 0',
        name: 'NVIDIA RTX 4090', util: 72, memUsed: 14.2 * 1024 * 1024 * 1024,
        memTotal: 24 * 1024 * 1024 * 1024, temp: 68, power: 285
      },
      {
        id: 'npu-0', kind: 'npu', vendor: '算能', label: 'NPU 0',
        name: '算能 BM1684', util: 35, memUsed: 2.1 * 1024 * 1024 * 1024,
        memTotal: 8 * 1024 * 1024 * 1024, temp: 52, power: 0
      }
    ],
    sampledAt: Date.now()
  };
}

function pageUrl(name, qs) {
  const q = Object.keys(qs || {}).map((k) => k + '=' + encodeURIComponent(qs[k])).join('&');
  return BASE + '/' + name + (q ? '?' + q : '');
}

function sftpSrc(cwd) {
  return pageUrl('sftp.html', {
    folderWin: 1, v: 'readme', sessionName: 'Demo Lab', ip: '10.10.0.21',
    sessionId: 'demo-lab', port: 22, tagId: 'demo-tag-id', cwd: cwd || '/data/apps'
  });
}

function sshSrc(extra) {
  return pageUrl('ssh.html', Object.assign({
    sessionWin: 1, v: 'readme', sessionName: 'Demo Lab', ip: '10.10.0.21',
    sessionId: 'demo-lab', port: 22, tagId: 'demo-tag-id', userName: 'deploy',
    initialCd: '/data/apps'
  }, extra || {}));
}

function monitorSrc(session) {
  return pageUrl('monitor.html', {
    v: 7, tagId: 'demo-tag-' + session.id, sessionId: session.id, port: session.port,
    sessionName: session.name, ip: session.ip
  });
}

async function saveShot(page, name) {
  const buf = await page.screenshot({ type: 'png' });
  for (const dir of OUT_DIRS) fs.writeFileSync(path.join(dir, name), buf);
  console.log('wrote', name);
}

async function mockApis(page) {
  let duPoll = 0;
  let monTick = 0;
  await page.route('**/webssh/api/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    const method = route.request().method();

    if (p.endsWith('/checkLogin') || p.endsWith('/pwd')) return route.fulfill(jsonOk('/data/apps'));
    if (p.endsWith('/loginSsh')) return route.fulfill(jsonOk('demo-tag-id'));
    if (p.endsWith('/latency')) return route.fulfill(jsonOk(28));
    if (p.endsWith('/ls')) {
      const dir = u.searchParams.get('path') || '/';
      if (dir === '/' || dir === '') return route.fulfill(jsonOk(TREE_ROOT));
      if (dir === '/data') return route.fulfill(jsonOk(TREE_DATA));
      if (dir.indexOf('/data/apps') === 0) return route.fulfill(jsonOk(DEMO_LS));
      return route.fulfill(jsonOk([]));
    }
    if (p.endsWith('/df')) return route.fulfill(jsonOk({ disks: DEMO_DISKS }));
    if (p.endsWith('/du/start') && method === 'POST') {
      duPoll = 0;
      return route.fulfill(jsonOk({
        running: true, done: false, cancelled: false, root: '/data/apps',
        currentPath: '/data/apps/api', currentPhase: 'du', currentSinceMs: Date.now() - 12000,
        dirsDone: 18, error: '', lastIssue: '', seq: SCAN_ENTRIES.length,
        entries: SCAN_ENTRIES.slice(0, 4), more: true
      }));
    }
    if (p.endsWith('/du/status')) {
      duPoll += 1;
      const running = duPoll < 8;
      return route.fulfill(jsonOk({
        running, done: !running, cancelled: false, root: '/data/apps',
        currentPath: running ? '/data/apps/logs/archive' : '',
        currentPhase: running ? 'du' : '', currentSinceMs: Date.now() - 9000,
        dirsDone: 18 + duPoll * 3, error: '', lastIssue: '', seq: SCAN_ENTRIES.length,
        entries: duPoll === 1 ? SCAN_ENTRIES.slice(4) : [], more: duPoll === 1
      }));
    }
    if (p.endsWith('/du/cancel')) return route.fulfill(jsonOk('cancelled'));
    if (p.includes('/commands') && method === 'GET' && !p.includes('/settings') && !p.includes('/for-session')) {
      return route.fulfill(jsonOk(DEMO_COMMANDS));
    }
    if (p.includes('/commands/settings')) {
      return route.fulfill(jsonOk({ autoCollect: false, suggestEnabled: true }));
    }
    if (p.endsWith('/monitor') || p.includes('/monitor?') || /\/monitor$/.test(p)) {
      monTick += 1;
      return route.fulfill(jsonOk(monitorSnapshot(monTick)));
    }
    if (p.includes('/monitor/kill')) return route.fulfill(jsonOk(true));
    return route.fulfill(jsonOk(null));
  });
  await page.route('**/webssh/websocket/**', (route) => route.abort());
}

async function gotoDesktop(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.removeItem('webssh.sessionLayout.v1');
      Object.keys(localStorage).forEach((k) => {
        if (k.indexOf('tagId') === 0 || k.indexOf('tagOwner') === 0) localStorage.removeItem(k);
      });
    } catch (e) {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#desktopIconGrid', { timeout: 15000 });
  await page.evaluate((sessions) => {
    document.querySelectorAll('#desktopSessionLayer .session-win, #desktopDockStrip .session-win').forEach((n) => n.remove());
    const bar = document.querySelector('#desktopTaskbar');
    if (bar) { bar.innerHTML = ''; bar.style.display = 'none'; }
    if (window.Desktop && Desktop.render) Desktop.render(sessions);
  }, DEMO_SESSIONS);
  await page.waitForTimeout(400);
}

async function centerWin(page, kind, opts) {
  return page.evaluate(({ kind, opts }) => {
    const layer = document.getElementById('desktopSessionLayer');
    const aw = layer ? layer.clientWidth : 1360;
    const ah = layer ? layer.clientHeight : 800;
    const w = opts.width || 980;
    const h = opts.height || 620;
    const left = Math.max(24, Math.round((aw - w) / 2));
    const top = Math.max(28, Math.round((ah - h) / 2) - 10);
    const $win = SessionWindows.open(Object.assign({ kind: kind }, opts));
    if ($win && $win.length) {
      $win.css({ left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
      if (SessionWindows.focus) SessionWindows.focus($win);
    }
    return true;
  }, { kind, opts });
}

async function waitSignal(page, min) {
  await page.waitForFunction((n) => {
    const sigs = Array.from(document.querySelectorAll('#desktopSessionLayer .sw-signal'));
    return sigs.length >= n && sigs.some((el) => el.classList.contains('good') || el.classList.contains('fair'));
  }, min || 1, { timeout: 8000 }).catch(() => {});
}

async function prepareSftpFrame(frame, mode, withScan) {
  await frame.waitForSelector('#fileView', { timeout: 15000 });
  await frame.evaluate(({ mode, withScan }) => {
    try {
      localStorage.setItem('websshSftpViewMode', mode || 'details');
      localStorage.setItem('websshSftpFavorites', JSON.stringify(['/data/apps', '/data/backup', '/opt']));
    } catch (e) {}
    if (typeof setViewMode === 'function') setViewMode(mode || 'details');
    if (typeof renderFavorites === 'function') renderFavorites();
    if (typeof renderFileList === 'function') renderFileList('/data/apps');
  }, { mode: mode || 'details', withScan: !!withScan });
  await frame.waitForTimeout(400);
  if (withScan) {
    await frame.click('#btnScanSize');
    await frame.waitForSelector('#scanProgress:not([hidden])', { timeout: 8000 }).catch(() => {});
    await frame.waitForSelector('#sftpDiskTable:not([hidden])', { timeout: 8000 }).catch(() => {});
    await frame.waitForTimeout(600);
  }
}

async function injectTerm(frame, withFind) {
  await frame.waitForSelector('#terminal, .xterm', { timeout: 12000 }).catch(() => {});
  await frame.evaluate((withFind) => {
    try { if (window.client && client.close) client.close(); } catch (e) {}
    if (typeof term === 'undefined' || !term) return;
    try { term.reset(); } catch (e) {}
    const lines = [
      '\x1b[32mdeploy@demo-lab\x1b[0m:\x1b[34m/data/apps\x1b[0m$ pwd',
      '/data/apps',
      '\x1b[32mdeploy@demo-lab\x1b[0m:\x1b[34m/data/apps\x1b[0m$ journalctl -u app -n 20 --no-pager',
      'Aug 24 17:02:11 gpu-lab app[18421]: started on :8080',
      'Aug 24 17:08:44 gpu-lab app[18421]: error: redis timeout after 2000ms',
      'Aug 24 17:08:44 gpu-lab app[18421]: retrying connection…',
      'Aug 24 17:09:01 gpu-lab app[18421]: health=ok',
      'Aug 24 17:12:19 gpu-lab app[18421]: error: upstream 10.10.0.88:9000 reset',
      '\x1b[32mdeploy@demo-lab\x1b[0m:\x1b[34m/data/apps\x1b[0m$ '
    ];
    lines.forEach((l) => term.writeln(l));
    if (withFind) {
      try {
        if (typeof openSessionFind === 'function') openSessionFind();
        else if ($('#sshFindBar').length) {
          $('#sshFindBar').show();
          $('#sshFindInput').val('error');
          $('#sshFindCount').text('2 / 4');
        }
      } catch (e2) {}
    }
  }, !!withFind);
}

async function seedMonitorSparks(frame) {
  await frame.waitForSelector('#procTable, .tm-tab', { timeout: 12000 });
  // Fire many refreshes in-page (avoid Playwright click timeouts stacking)
  await frame.evaluate(() => {
    const btn = document.getElementById('btnRefresh');
    if (!btn) return;
    for (let i = 0; i < 24; i++) btn.click();
  });
  await frame.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await mockApis(page);

  // ========== 02 server menu ==========
  await gotoDesktop(page);
  await page.click('.desktop-icon[data-session-id="demo-lab"]');
  await page.waitForSelector('#desktopMenu .desktop-menu-item');
  await page.waitForTimeout(250);
  await saveShot(page, '02-server-menu.png');
  await page.keyboard.press('Escape');

  // ========== 03 add server (desktop visible) ==========
  await gotoDesktop(page);
  await page.click('.desktop-icon[data-icon-id="__add__"]');
  await page.waitForSelector('#sessionModal.show');
  await page.fill('#sessionName', 'Demo Lab');
  await page.fill('#sessionIp', '10.10.0.21');
  await page.fill('#sessionPort', '22');
  await page.fill('#sessionUserName', 'deploy');
  await page.fill('#sessionPassword', 'demopass');
  await page.waitForTimeout(250);
  await saveShot(page, '03-add-server.png');
  await page.evaluate(() => jQuery('#sessionModal').modal('hide'));

  // ========== 04 global commands (mock data) ==========
  await gotoDesktop(page);
  await page.click('.desktop-icon[data-icon-id="__global_cmd__"]');
  await page.waitForSelector('#commandModal.show');
  await page.waitForSelector('#commandTable tbody tr', { timeout: 8000 });
  await page.waitForTimeout(400);
  await saveShot(page, '04-global-commands.png');
  await page.evaluate(() => jQuery('#commandModal').modal('hide'));

  // ========== 05 help ==========
  await gotoDesktop(page);
  await page.click('.desktop-icon[data-icon-id="__help__"]');
  await page.waitForSelector('.session-win[data-kind="help"]');
  await page.evaluate(() => {
    const $w = jQuery('.session-win[data-kind="help"]').first();
    const layer = document.getElementById('desktopSessionLayer');
    const aw = layer.clientWidth; const ah = layer.clientHeight;
    const w = 900; const h = 620;
    $w.css({ left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) - 8 + 'px', width: w + 'px', height: h + 'px' });
  });
  await page.waitForTimeout(1400);
  await saveShot(page, '05-help.png');

  // helper: open centered sftp
  async function openCenteredSftp(mode, withScan) {
    await gotoDesktop(page);
    await centerWin(page, 'sftp', {
      title: 'Demo Lab (10.10.0.21) · apps',
      session: DEMO_SESSIONS[0],
      sessionId: 'demo-lab',
      port: 22,
      tagId: 'demo-tag-id',
      cwd: '/data/apps',
      src: sftpSrc('/data/apps'),
      width: 1000,
      height: 640
    });
    await waitSignal(page, 1);
    const frame = page.frames().find((f) => f.url().indexOf('sftp.html') >= 0);
    if (frame) await prepareSftpFrame(frame, mode, withScan);
    return frame;
  }

  // ========== 06 details ==========
  let sftpFrame = await openCenteredSftp('details', false);
  if (sftpFrame) {
    await sftpFrame.locator('#fileView tr').filter({ hasText: 'web' }).first().click().catch(() => {});
  }
  await page.waitForTimeout(300);
  await saveShot(page, '06-sftp-details.png');

  // ========== 07 icons + hover ==========
  sftpFrame = await openCenteredSftp('icons', false);
  if (sftpFrame) {
    await sftpFrame.locator('#fileView .icon-tile').filter({ hasText: 'README.md' }).first().hover({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await saveShot(page, '07-sftp-icons.png');

  // ========== 08 content ==========
  await openCenteredSftp('content', false);
  await page.waitForTimeout(300);
  await saveShot(page, '08-sftp-content.png');

  // ========== 09 context ==========
  sftpFrame = await openCenteredSftp('details', false);
  if (sftpFrame) {
    await sftpFrame.locator('#fileView tr').filter({ hasText: 'README.md' }).first().click({ button: 'right' });
    await sftpFrame.waitForSelector('#fileContextMenu', { state: 'visible' });
    await page.waitForTimeout(200);
  }
  await saveShot(page, '09-sftp-context.png');

  // ========== 20 disk scan (centered on desktop) ==========
  await openCenteredSftp('details', true);
  await page.waitForTimeout(300);
  await saveShot(page, '20-sftp-disk-scan.png');

  // ========== 10 workspace ==========
  await gotoDesktop(page);
  await page.evaluate(({ ssh, sftp }) => {
    SessionWindows.open({
      kind: 'ssh', title: 'Demo Lab', session: { id: 'demo-lab', port: 22 },
      sessionId: 'demo-lab', port: 22, tagId: 'demo-tag-id', src: ssh, width: 620, height: 560
    }).css({ left: '36px', top: '40px' });
    SessionWindows.open({
      kind: 'sftp', title: 'Demo Lab (10.10.0.21) · apps', session: { id: 'demo-lab', port: 22 },
      sessionId: 'demo-lab', port: 22, tagId: 'demo-tag-id', cwd: '/data/apps', src: sftp, width: 780, height: 600
    }).css({ left: '520px', top: '56px' });
  }, { ssh: sshSrc(), sftp: sftpSrc('/data/apps') });
  await waitSignal(page, 2);
  const sshF = page.frames().find((f) => f.url().indexOf('ssh.html') >= 0);
  const sf = page.frames().find((f) => f.url().indexOf('sftp.html') >= 0);
  if (sshF) await injectTerm(sshF, false);
  if (sf) await prepareSftpFrame(sf, 'details', false);
  await saveShot(page, '10-workspace.png');

  // ========== 21 terminal↔files (keep) ==========
  await saveShot(page, '21-terminal-files-sync.png');

  // ========== 11 layout picker (four modes) ==========
  await gotoDesktop(page);
  await centerWin(page, 'ssh', {
    title: 'Demo Lab',
    session: DEMO_SESSIONS[0],
    sessionId: 'demo-lab',
    port: 22,
    tagId: 'demo-tag-id',
    src: sshSrc(),
    width: 720,
    height: 480
  });
  await waitSignal(page, 1);
  const sshFrame11 = page.frames().find((f) => f.url().indexOf('ssh.html') >= 0);
  if (sshFrame11) await injectTerm(sshFrame11, false);
  await page.evaluate(() => {
    const $win = jQuery('.session-win[data-kind="ssh"]').first();
    const $btn = $win.find('.sw-max');
    if (window.SessionLayout && SessionLayout.showPicker) {
      SessionLayout.showPicker($btn, $win);
    }
  });
  await page.waitForSelector('#desktopLayoutPicker .desktop-layout-tpl', { timeout: 5000 });
  await page.waitForTimeout(300);
  await saveShot(page, '11-split-layout.png');

  // ========== previews 12-15 ==========
  async function setupPreviewDesktop() {
    await gotoDesktop(page);
    await centerWin(page, 'sftp', {
      title: 'Demo Lab (10.10.0.21) · apps',
      session: DEMO_SESSIONS[0],
      sessionId: 'demo-lab',
      port: 22,
      tagId: 'demo-tag-id',
      cwd: '/data/apps',
      src: sftpSrc('/data/apps'),
      width: 980,
      height: 600
    });
    await waitSignal(page, 1);
    const fr = page.frames().find((f) => f.url().indexOf('sftp.html') >= 0);
    if (fr) await prepareSftpFrame(fr, 'icons', false);
  }

  await setupPreviewDesktop();
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 960, 540);
    g.addColorStop(0, '#0b3d5c'); g.addColorStop(0.55, '#1a7a6d'); g.addColorStop(1, '#f0c75e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = 'bold 42px Segoe UI, sans-serif';
    ctx.fillText('WebSSH Image Preview', 48, 120);
    ctx.font = '22px Segoe UI, sans-serif';
    ctx.fillText('滚轮缩放 · 拖拽平移 · 双击适应/1:1', 48, 170);
    openSessionPreview({ name: 'banner.png', kind: 'image', url: canvas.toDataURL('image/png') });
  });
  await page.waitForSelector('#sessionPreviewOverlay.show');
  await page.waitForTimeout(400);
  await saveShot(page, '12-preview-image.png');
  await page.evaluate(() => closeSessionPreview());

  // 13 video with fake 01:50 / 05:00
  await setupPreviewDesktop();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 854; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, 854, 480);
      ctx.fillStyle = '#1f6feb'; ctx.fillRect(0, 0, 854 * ((frame % 90) / 90), 8);
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 36px Segoe UI, sans-serif';
      ctx.fillText('Demo Video Preview', 40, 80);
      ctx.font = '20px Segoe UI, sans-serif';
      ctx.fillText('空格暂停/播放 · Esc 关闭', 40, 120);
      frame += 1;
    };
    for (let i = 0; i < 10; i++) draw();
    let url;
    if (typeof MediaRecorder !== 'undefined' && canvas.captureStream) {
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise((r) => { rec.onstop = () => r(); });
      rec.start(50);
      const timer = setInterval(draw, 33);
      await new Promise((r) => setTimeout(r, 700));
      clearInterval(timer); rec.stop(); await done;
      url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    } else {
      url = canvas.toDataURL('image/png');
    }
    openSessionPreview({ name: 'demo.mp4', kind: 'video', url: url });
    await new Promise((r) => setTimeout(r, 500));
    const v = document.querySelector('#sessionPreviewBody video');
    if (v) {
      try { v.pause(); } catch (e) {}
      // Native controls often show real duration; overlay a demo time bar.
      v.controls = false;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:40px;background:linear-gradient(transparent,rgba(0,0,0,.75));display:flex;align-items:center;gap:10px;padding:0 14px;color:#fff;font:12px Segoe UI,sans-serif;';
      wrap.innerHTML = '<span style="opacity:.9">❚❚</span><div style="flex:1;height:4px;background:rgba(255,255,255,.25);border-radius:2px;position:relative;"><i style="position:absolute;left:0;top:0;height:100%;width:37%;background:#3b82f6;border-radius:2px;"></i></div><span style="font-variant-numeric:tabular-nums">01:50 / 05:00</span>';
      const body = document.getElementById('sessionPreviewBody');
      body.style.position = 'relative';
      body.appendChild(wrap);
    }
  });
  await page.waitForSelector('#sessionPreviewOverlay.show');
  await page.waitForTimeout(400);
  await saveShot(page, '13-preview-video.png');
  await page.evaluate(() => closeSessionPreview());

  // 14 text
  await setupPreviewDesktop();
  await page.evaluate(() => {
    const code = [
      '#!/usr/bin/env python3',
      '"""Deploy helper — previewed as plain text in WebSSH."""',
      'import argparse',
      'from pathlib import Path',
      '',
      'def main():',
      '    parser = argparse.ArgumentParser(description="Roll out app bundle")',
      '    parser.add_argument("--env", default="prod")',
      '    parser.add_argument("--dry-run", action="store_true")',
      '    args = parser.parse_args()',
      '    root = Path("/data/apps")',
      '    print(f"env={args.env} root={root}")',
      '    for p in sorted(root.glob("*.service")):',
      '        print(" unit:", p.name)',
      '',
      'if __name__ == "__main__":',
      '    main()',
      ''
    ].join('\n');
    openSessionPreview({ name: 'deploy.py', kind: 'text', url: URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' })) });
  });
  await page.waitForSelector('#sessionPreviewBody pre');
  await page.waitForTimeout(300);
  await saveShot(page, '14-preview-text-py.png');
  await page.evaluate(() => closeSessionPreview());

  // 15 excel fullscreen-ish dense sheet
  await setupPreviewDesktop();
  await page.evaluate(() => {
    const wb = XLSX.utils.book_new();
    const rows = [['服务', '实例', 'CPU%', '内存%', '磁盘%', '状态', '区域', '负责人', '备注']];
    const services = ['api', 'web', 'worker', 'redis', 'mysql', 'gateway', 'scheduler', 'metrics', 'logship', 'auth'];
    for (let i = 0; i < 42; i++) {
      const s = services[i % services.length];
      rows.push([s, (i % 4) + 1, 8 + (i * 3) % 70, 12 + (i * 5) % 60, 20 + (i * 2) % 50,
        i % 7 === 0 ? '告警' : '运行中', 'cn-east-' + ((i % 3) + 1), 'deploy', i % 5 === 0 ? '蓝绿发布' : '']);
    }
    const hosts = [['主机', 'IP', '角色', '磁盘%', '负载', 'GPU', '备注']];
    for (let i = 0; i < 20; i++) {
      hosts.push(['node-' + (i + 1), '10.10.0.' + (20 + i), i % 2 ? 'app' : 'db', 40 + i, (i / 10).toFixed(1), i % 3 === 0 ? '4090' : '-', '']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '概览');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hosts), '主机');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    openSessionPreview({
      name: 'report.xlsx',
      kind: 'excel',
      url: URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    });
  });
  await page.waitForSelector('#sessionPreviewBody .excel-table');
  await page.evaluate(() => {
    const ov = document.getElementById('sessionPreviewOverlay');
    const body = document.getElementById('sessionPreviewBody');
    if (ov) {
      ov.style.inset = '0';
      ov.style.width = '100%';
      ov.style.height = '100%';
    }
    if (body) {
      body.style.cssText = 'height:calc(100% - 44px);max-height:none;width:100%;padding:0;margin:0;';
    }
    const preview = body && body.querySelector('.excel-preview');
    if (preview) {
      preview.style.cssText = 'width:100%;height:100%;max-width:none;margin:0;border-radius:0;';
    }
    const wrap = body && body.querySelector('.excel-table-wrap');
    if (wrap) {
      wrap.style.cssText = 'width:100%;flex:1;min-height:calc(100vh - 110px);height:100%;overflow:auto;';
    }
    const table = body && body.querySelector('.excel-table');
    if (table) {
      table.style.width = '100%';
      table.style.minHeight = '100%';
    }
  });
  await page.waitForTimeout(400);
  await saveShot(page, '15-preview-excel.png');
  await page.evaluate(() => closeSessionPreview());

  // ========== monitors 16/17/18/22/19 ==========
  async function openMonitor(session, left, top, w, h) {
    await page.evaluate(({ session, left, top, w, h, src }) => {
      const $w = SessionWindows.open({
        kind: 'monitor',
        title: (session.name || '服务器') + ' — 任务管理器',
        session: session,
        sessionId: session.id,
        port: session.port,
        tagId: 'demo-tag-' + session.id,
        src: src,
        width: w,
        height: h
      });
      $w.css({ left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
      return true;
    }, { session, left, top, w, h, src: monitorSrc(session) });
  }

  // 16 processes
  await gotoDesktop(page);
  await openMonitor(DEMO_SESSIONS[2], 0, 0, 1000, 640);
  await page.evaluate(() => {
    const layer = document.getElementById('desktopSessionLayer');
    const $w = jQuery('.session-win[data-kind="monitor"]').first();
    const aw = layer.clientWidth; const ah = layer.clientHeight;
    const w = 1040; const h = 660;
    $w.css({ left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) - 8 + 'px', width: w + 'px', height: h + 'px' });
  });
  await waitSignal(page, 1);
  let monFrame = page.frames().find((f) => f.url().indexOf('monitor.html') >= 0);
  if (monFrame) {
    await seedMonitorSparks(monFrame);
    await monFrame.evaluate(() => {
      const input = document.getElementById('procSearch');
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await monFrame.waitForTimeout(200);
    await monFrame.locator('#procTable tbody tr').first().click().catch(() => {});
  }
  await saveShot(page, '16-monitor-processes.png');

  // 17 performance
  await gotoDesktop(page);
  await openMonitor(DEMO_SESSIONS[2], 0, 0, 1040, 660);
  await page.evaluate(() => {
    const layer = document.getElementById('desktopSessionLayer');
    const $w = jQuery('.session-win[data-kind="monitor"]').first();
    const aw = layer.clientWidth; const ah = layer.clientHeight;
    const w = 1040; const h = 660;
    $w.css({ left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) - 8 + 'px', width: w + 'px', height: h + 'px' });
  });
  await waitSignal(page, 1);
  monFrame = page.frames().find((f) => f.url().indexOf('monitor.html') >= 0);
  if (monFrame) {
    await seedMonitorSparks(monFrame);
    await monFrame.click('.tm-tab[data-tab="perf"]');
    await monFrame.waitForTimeout(200);
    await monFrame.click('.perf-nav-item[data-perf="gpu-0"]').catch(() => {});
    await monFrame.waitForTimeout(250);
  }
  await saveShot(page, '17-monitor-performance.png');

  // 22 ports (new)
  await gotoDesktop(page);
  await openMonitor(DEMO_SESSIONS[2], 0, 0, 1040, 660);
  await page.evaluate(() => {
    const layer = document.getElementById('desktopSessionLayer');
    const $w = jQuery('.session-win[data-kind="monitor"]').first();
    const aw = layer.clientWidth; const ah = layer.clientHeight;
    const w = 1040; const h = 660;
    $w.css({ left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) - 8 + 'px', width: w + 'px', height: h + 'px' });
  });
  await waitSignal(page, 1);
  monFrame = page.frames().find((f) => f.url().indexOf('monitor.html') >= 0);
  if (monFrame) {
    await seedMonitorSparks(monFrame);
    await monFrame.click('.tm-tab[data-tab="ports"]');
    await monFrame.waitForTimeout(300);
  }
  await saveShot(page, '22-monitor-ports.png');

  // 18 multi monitors
  console.log('capturing 18…');
  await gotoDesktop(page);
  await openMonitor(DEMO_SESSIONS[2], 40, 48, 640, 560);
  await openMonitor(DEMO_SESSIONS[1], 700, 72, 620, 560);
  await waitSignal(page, 1);
  await page.waitForTimeout(800);
  const monFrames = page.frames().filter((f) => f.url().indexOf('monitor.html') >= 0);
  for (const fr of monFrames) {
    try {
      await seedMonitorSparks(fr);
      await fr.evaluate(() => {
        const tab = document.querySelector('.tm-tab[data-tab="perf"]');
        if (tab) tab.click();
      });
    } catch (e) {
      console.warn('monitor frame seed failed', e.message);
    }
  }
  await page.waitForTimeout(400);
  await saveShot(page, '18-monitor-multi.png');

  // 19 ssh signal + find
  console.log('capturing 19…');
  await gotoDesktop(page);
  await centerWin(page, 'ssh', {
    title: 'gpu-lab',
    session: DEMO_SESSIONS[2],
    sessionId: 'gpu-lab',
    port: 22,
    tagId: 'demo-tag-gpu-lab',
    src: sshSrc({ sessionName: 'gpu-lab', sessionId: 'gpu-lab', ip: '10.10.0.50', tagId: 'demo-tag-gpu-lab' }),
    width: 980,
    height: 620
  });
  await waitSignal(page, 1);
  const ssh19 = page.frames().find((f) => f.url().indexOf('ssh.html') >= 0);
  if (ssh19) {
    await injectTerm(ssh19, true);
    await ssh19.evaluate(() => {
      try {
        if (typeof openSessionFind === 'function') openSessionFind();
      } catch (e) {}
      const bar = document.getElementById('sshFindBar');
      if (bar) bar.style.display = 'flex';
      const input = document.getElementById('sshFindInput');
      if (input) {
        input.value = 'error';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const status = document.getElementById('sshFindStatus');
      if (status) status.textContent = '2 / 4';
    });
  }
  await page.waitForTimeout(400);
  await saveShot(page, '19-ssh-signal-find.png');

  await browser.close();
  console.log('readme shots done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
