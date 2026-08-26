/**
 * Capture README feature shots 20 / 21 against the real UI with mocked APIs.
 * Requires: WebSSH on :9092, playwright in tools/webssh.
 *
 * Prefer this over hand-drawn HTML in capture-feature-shots.cjs —
 * layout/CSS/toolbar come from the live app.
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

const DEMO_SESSIONS = [
  { id: 'demo-lab', name: 'Demo Lab', ip: '10.10.0.21', port: 22, userName: 'deploy', password: 'demo-pass' },
  { id: 'demo-ci', name: 'CI Runner', ip: '10.10.0.88', port: 22, userName: 'builder', password: 'demo-pass' }
];

const DEMO_LS = [
  { name: 'api', dir: true, size: 4096, modifyTime: '2026-08-12 09:21', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'web', dir: true, size: 4096, modifyTime: '2026-08-12 09:22', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'logs', dir: true, size: 4096, modifyTime: '2026-08-10 14:02', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'backup', dir: true, size: 4096, modifyTime: '2026-08-05 12:00', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'README.md', dir: false, size: 1240, modifyTime: '2026-08-12 09:20', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'docker-compose.yml', dir: false, size: 846, modifyTime: '2026-08-11 18:03', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'app.log', dir: false, size: 204800, modifyTime: '2026-08-18 08:11', permissions: '-rw-r-----', permissionText: '640', owner: 'deploy' }
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

function jsonOk(result) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 200, message: 'ok', result: result })
  };
}

function sftpPageUrl(cwd) {
  return (
    'http://127.0.0.1:9092/webssh/page/sftp.html?folderWin=1&v=mockshot'
    + '&sessionName=' + encodeURIComponent('Demo Lab')
    + '&ip=' + encodeURIComponent('10.10.0.21')
    + '&sessionId=demo-lab&port=22&tagId=demo-tag-id'
    + '&cwd=' + encodeURIComponent(cwd || '/data/apps')
  );
}

function sshPageUrl() {
  return (
    'http://127.0.0.1:9092/webssh/page/ssh.html?sessionWin=1&v=mockshot'
    + '&sessionName=' + encodeURIComponent('Demo Lab')
    + '&ip=' + encodeURIComponent('10.10.0.21')
    + '&sessionId=demo-lab&port=22&tagId=demo-tag-id'
    + '&userName=' + encodeURIComponent('deploy')
    + '&initialCd=' + encodeURIComponent('/data/apps')
  );
}

async function saveShot(page, name) {
  const buf = await page.screenshot({ type: 'png' });
  for (const dir of OUT_DIRS) {
    fs.writeFileSync(path.join(dir, name), buf);
  }
  console.log('wrote', name);
}

async function mockApis(page) {
  let pollCount = 0;
  await page.route('**/webssh/api/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    const method = route.request().method();

    if (p.endsWith('/checkLogin') || p.endsWith('/pwd')) {
      return route.fulfill(jsonOk('/data/apps'));
    }
    if (p.endsWith('/loginSsh')) {
      return route.fulfill(jsonOk('demo-tag-id'));
    }
    if (p.endsWith('/ls')) {
      const dir = u.searchParams.get('path') || '/';
      if (dir === '/' || dir === '') return route.fulfill(jsonOk(TREE_ROOT));
      if (dir === '/data') return route.fulfill(jsonOk(TREE_DATA));
      if (dir === '/data/apps' || dir.indexOf('/data/apps') === 0) return route.fulfill(jsonOk(DEMO_LS));
      return route.fulfill(jsonOk([]));
    }
    if (p.endsWith('/df')) {
      return route.fulfill(jsonOk({ disks: DEMO_DISKS }));
    }
    if (p.endsWith('/du/start') && method === 'POST') {
      pollCount = 0;
      return route.fulfill(jsonOk({
        running: true,
        done: false,
        cancelled: false,
        root: '/data/apps',
        currentPath: '/data/apps/api',
        currentPhase: 'du',
        currentSinceMs: Date.now() - 12000,
        dirsDone: 18,
        error: '',
        lastIssue: '',
        seq: SCAN_ENTRIES.length,
        entries: SCAN_ENTRIES.slice(0, 4),
        more: true
      }));
    }
    if (p.endsWith('/du/status')) {
      pollCount += 1;
      const stillRunning = pollCount < 8;
      return route.fulfill(jsonOk({
        running: stillRunning,
        done: !stillRunning,
        cancelled: false,
        root: '/data/apps',
        currentPath: stillRunning ? '/data/apps/logs/archive' : '',
        currentPhase: stillRunning ? 'du' : '',
        currentSinceMs: Date.now() - 9000,
        dirsDone: 18 + pollCount * 3,
        error: '',
        lastIssue: '',
        seq: SCAN_ENTRIES.length,
        entries: pollCount === 1 ? SCAN_ENTRIES.slice(4) : [],
        more: pollCount === 1
      }));
    }
    if (p.endsWith('/du/cancel')) {
      return route.fulfill(jsonOk('cancelled'));
    }
    // Window title signal bars (SessionWindows.pingWindowLatency)
    if (p.endsWith('/latency')) {
      return route.fulfill(jsonOk(28)); // <=40ms → 5 bars, good
    }
    return route.fulfill(jsonOk(null));
  });

  // Block real SSH websocket so the page stays on chrome + our injected buffer
  await page.route('**/webssh/websocket/**', (route) => route.abort());
}

async function seedDesktop(page) {
  await page.evaluate((sessions) => {
    try { localStorage.removeItem('webssh.sessionLayout.v1'); } catch (e) {}
    document.querySelectorAll('#desktopSessionLayer .session-win, #desktopDockStrip .session-win').forEach((n) => n.remove());
    if (window.Desktop && Desktop.render) Desktop.render(sessions);
  }, DEMO_SESSIONS);
  await page.waitForTimeout(350);
}

async function prepareSftpScan(page) {
  await page.waitForSelector('#fileView table, #fileView .icon-tile', { timeout: 15000 });
  await page.evaluate(() => {
    try {
      localStorage.setItem('websshSftpViewMode', 'details');
      localStorage.setItem('websshSftpFavorites', JSON.stringify(['/data/apps', '/data/backup', '/opt']));
    } catch (e) {}
    if (typeof setViewMode === 'function') setViewMode('details');
    if (typeof renderFavorites === 'function') renderFavorites();
  });
  await page.evaluate(() => {
    if (typeof renderFileList === 'function') renderFileList('/data/apps');
  });
  await page.waitForTimeout(500);
  // Toggle scan on (starts /du/start via mock)
  await page.click('#btnScanSize');
  await page.waitForSelector('#scanProgress:not([hidden])', { timeout: 8000 });
  await page.waitForSelector('#sftpDiskTable:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(700);
}

async function injectFakeTerminal(frame) {
  await frame.evaluate(() => {
    try {
      if (window.client && typeof client.close === 'function') {
        try { client.close(); } catch (e) {}
      }
    } catch (e) {}
    if (typeof term === 'undefined' || !term) return;
    try { term.reset(); } catch (e) {}
    const lines = [
      '\x1b[32mdeploy@demo-lab\x1b[0m:\x1b[34m~\x1b[0m$ cd /data/apps && ls -lh',
      'total 3.1G',
      'drwxr-xr-x  5 deploy deploy 4.0K Aug 12 09:21 api',
      'drwxr-xr-x  3 deploy deploy 4.0K Aug 12 09:22 web',
      'drwxr-xr-x  4 deploy deploy 4.0K Aug 10 14:02 logs',
      'drwxr-xr-x  2 deploy deploy 4.0K Aug  5 12:00 backup',
      '-rw-r--r--  1 deploy deploy 1.2K Aug 12 09:20 README.md',
      '-rw-r--r--  1 deploy deploy  846 Aug 11 18:03 docker-compose.yml',
      '-rw-r-----  1 deploy deploy 200K Aug 18 08:11 app.log',
      '\x1b[32mdeploy@demo-lab\x1b[0m:\x1b[34m/data/apps\x1b[0m$ '
    ];
    lines.forEach((l) => term.writeln(l));
    // Keep chrome: 文件管理 button is in real DOM
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await mockApis(page);

  // ---- 20: real SFTP + disk scan + df table ----
  await page.goto(sftpPageUrl('/data/apps'), { waitUntil: 'domcontentloaded' });
  await prepareSftpScan(page);
  await saveShot(page, '20-sftp-disk-scan.png');

  // ---- 21: desktop + SessionWindows (real chrome + signal bars) ----
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto('http://127.0.0.1:9092/webssh/page/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#desktopIconGrid', { timeout: 15000 });
  await seedDesktop(page);

  const sftpSrc = sftpPageUrl('/data/apps');
  const sshSrc = sshPageUrl();
  await page.evaluate(({ sftpSrc, sshSrc, sessions }) => {
    const layer = document.querySelector('#desktopSessionLayer');
    if (layer) layer.innerHTML = '';
    const session = sessions[0];
    if (!window.SessionWindows || !SessionWindows.open) {
      throw new Error('SessionWindows missing');
    }
    // Real window chrome includes .sw-signal; startSignalMonitor pings /latency
    const $ssh = SessionWindows.open({
      kind: 'ssh',
      title: 'Demo Lab',
      session: session,
      sessionId: session.id,
      port: session.port,
      tagId: 'demo-tag-id',
      src: sshSrc,
      width: 620,
      height: 560
    });
    const $sftp = SessionWindows.open({
      kind: 'sftp',
      title: 'Demo Lab (10.10.0.21) · apps',
      session: session,
      sessionId: session.id,
      port: session.port,
      tagId: 'demo-tag-id',
      cwd: '/data/apps',
      src: sftpSrc,
      width: 800,
      height: 640
    });
    if ($ssh && $ssh.length) {
      $ssh.css({ left: '28px', top: '36px' });
    }
    if ($sftp && $sftp.length) {
      $sftp.css({ left: '520px', top: '56px' });
      if (SessionWindows.focus) SessionWindows.focus($sftp);
    }
  }, { sftpSrc, sshSrc, sessions: DEMO_SESSIONS });

  // First latency paint is delayed ~1.5s in startSignalMonitor
  await page.waitForFunction(() => {
    const sigs = Array.from(document.querySelectorAll('#desktopSessionLayer .sw-signal'));
    return sigs.length >= 2 && sigs.every((el) => el.classList.contains('good') || el.classList.contains('fair'));
  }, { timeout: 8000 });

  const frames = page.frames();
  const sshFrame = frames.find((f) => f.url().indexOf('ssh.html') >= 0);
  const sftpFrame = frames.find((f) => f.url().indexOf('sftp.html') >= 0);
  if (sshFrame) {
    await sshFrame.waitForSelector('#btnOpenFiles, .terminal, #terminal', { timeout: 12000 }).catch(() => {});
    await injectFakeTerminal(sshFrame);
  }
  if (sftpFrame) {
    await sftpFrame.waitForSelector('#fileView', { timeout: 12000 });
    await sftpFrame.evaluate(() => {
      try {
        localStorage.setItem('websshSftpViewMode', 'details');
      } catch (e) {}
      if (typeof setViewMode === 'function') setViewMode('details');
      if (typeof renderFileList === 'function') renderFileList('/data/apps');
    });
    await page.waitForTimeout(500);
  }

  await saveShot(page, '21-terminal-files-sync.png');

  await browser.close();
  console.log('mock feature shots done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
