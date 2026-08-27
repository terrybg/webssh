/**
 * Capture README shot for desktop background operations panel.
 * Requires WebSSH on :9092 and playwright.
 *
 * Usage: node scripts/capture-ops-panel-shot.cjs
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
  { id: 'demo-lab', name: 'Demo Lab', ip: '10.10.0.21', port: 22, userName: 'deploy', password: 'demo-pass' }
];

async function saveShot(page, name) {
  const buf = await page.screenshot({ type: 'png' });
  for (const dir of OUT_DIRS) {
    fs.writeFileSync(path.join(dir, name), buf);
  }
  console.log('wrote', name);
}

async function mockApis(page) {
  await page.route('**/webssh/api/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    if (p.endsWith('/checkLogin') || p.endsWith('/loginSsh')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, message: 'ok', result: 'demo-tag-id' })
      });
    }
    if (p.endsWith('/latency') || p.endsWith('/ping')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, message: 'ok', result: 18 })
      });
    }
    if (p.endsWith('/ls')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          message: 'ok',
          result: [
            { name: 'api', dir: true, size: 4096, modifyTime: '2026-08-12 09:21', permissions: 'drwxr-xr-x', owner: 'deploy' },
            { name: 'web', dir: true, size: 4096, modifyTime: '2026-08-12 09:22', permissions: 'drwxr-xr-x', owner: 'deploy' },
            { name: 'README.md', dir: false, size: 1240, modifyTime: '2026-08-12 09:20', permissions: '-rw-r--r--', owner: 'deploy' }
          ]
        })
      });
    }
    if (p.endsWith('/pwd')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, message: 'ok', result: '/data/apps' })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, message: 'ok', result: null })
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
  await mockApis(page);

  await page.goto('http://127.0.0.1:9092/webssh/page/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#desktopIconGrid', { timeout: 15000 });

  await page.evaluate((sessions) => {
    try {
      localStorage.setItem('webssh.sessions', JSON.stringify(sessions));
    } catch (e) {}
    if (typeof loadSessions === 'function') {
      loadSessions();
    } else if (window.sessionsCache) {
      sessions.forEach((s) => { window.sessionsCache[s.id] = s; });
      if (typeof renderDesktopIcons === 'function') renderDesktopIcons();
    }
  }, DEMO_SESSIONS);

  await page.waitForTimeout(400);

  const sftpSrc =
    'http://127.0.0.1:9092/webssh/page/sftp.html?folderWin=1&v=opshot'
    + '&sessionName=' + encodeURIComponent('Demo Lab')
    + '&ip=' + encodeURIComponent('10.10.0.21')
    + '&sessionId=demo-lab&port=22&tagId=demo-tag-id'
    + '&cwd=' + encodeURIComponent('/data/apps');

  await page.evaluate(({ sftpSrc, session }) => {
    const layer = document.querySelector('#desktopSessionLayer');
    if (layer) layer.innerHTML = '';
    if (!window.SessionWindows || !SessionWindows.open) {
      throw new Error('SessionWindows missing');
    }
    const $sftp = SessionWindows.open({
      kind: 'sftp',
      title: 'Demo Lab (10.10.0.21) · apps',
      session: session,
      sessionId: session.id,
      port: session.port,
      tagId: 'demo-tag-id',
      cwd: '/data/apps',
      src: sftpSrc,
      width: 860,
      height: 620
    });
    if ($sftp && $sftp.length) {
      $sftp.css({ left: '48px', top: '40px' });
      if (SessionWindows.focus) SessionWindows.focus($sftp);
    }
  }, { sftpSrc, session: DEMO_SESSIONS[0] });

  await page.waitForTimeout(800);

  // Seed tasks, reload so OperationHub.init loads them cleanly
  await page.evaluate(() => {
    const now = Date.now();
    const sample = [
      {
        id: 'scan-demo-tag-id',
        kind: 'scan',
        title: '扫描目录大小',
        detail: '/data · 已扫 128 个目录',
        cwd: '/data',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        state: 'running',
        indeterminate: true,
        cancelable: true,
        reconnectable: true,
        startedAt: now - 120000,
        updatedAt: now - 2000
      },
      {
        id: 'upload-demo-1',
        kind: 'upload',
        title: '上传 3 个文件',
        detail: 'app.jar · 42 MB / 128 MB',
        cwd: '/data/apps',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        state: 'running',
        progress: 33,
        indeterminate: false,
        cancelable: true,
        reconnectable: false,
        startedAt: now - 90000,
        updatedAt: now - 1000
      },
      {
        id: 'fop-delete-demo',
        kind: 'delete',
        title: '删除 12 项',
        detail: '/data/apps/logs/old · 已删除 12 项',
        cwd: '/data/apps/logs',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        jobId: 'fop-demo-delete',
        state: 'paused',
        indeterminate: true,
        cancelable: true,
        reconnectable: true,
        startedAt: now - 60000,
        updatedAt: now - 5000
      },
      {
        id: 'fop-extract-demo',
        kind: 'extract',
        title: '解压 release.tar.gz',
        detail: '已解压 86 项',
        cwd: '/data/apps',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        jobId: 'fop-demo-extract',
        state: 'done',
        progress: 100,
        indeterminate: false,
        startedAt: now - 300000,
        finishedAt: now - 180000,
        updatedAt: now - 180000
      },
      {
        id: 'fop-copy-demo',
        kind: 'copy',
        title: '跨服务器复制（4 项）',
        detail: '页面刷新后无法继续（示例）',
        cwd: '/data/apps',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        state: 'interrupted',
        progress: 55,
        indeterminate: false,
        startedAt: now - 400000,
        finishedAt: now - 350000,
        updatedAt: now - 350000
      }
    ];
    localStorage.setItem('webssh.operations.v1', JSON.stringify(sample));
    localStorage.setItem('webssh.sessions', JSON.stringify([{
      id: 'demo-lab', name: 'Demo Lab', ip: '10.10.0.21', port: 22, userName: 'deploy', password: 'demo-pass'
    }]));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#desktopIconGrid', { timeout: 15000 });
  await page.waitForTimeout(500);

  // Re-open sftp window + restore demo running states (markInterrupted turns non-reconnectable into interrupted)
  await page.evaluate(({ sftpSrc, session }) => {
    if (typeof loadSessions === 'function') loadSessions();
    const layer = document.querySelector('#desktopSessionLayer');
    if (layer) layer.innerHTML = '';
    if (!window.SessionWindows || !SessionWindows.open) return;
    const $sftp = SessionWindows.open({
      kind: 'sftp',
      title: 'Demo Lab (10.10.0.21) · apps',
      session: session,
      sessionId: session.id,
      port: session.port,
      tagId: 'demo-tag-id',
      cwd: '/data/apps',
      src: sftpSrc,
      width: 860,
      height: 620
    });
    if ($sftp && $sftp.length) {
      $sftp.css({ left: '48px', top: '40px' });
      if (SessionWindows.focus) SessionWindows.focus($sftp);
    }
    const now = Date.now();
    if (window.OperationHub && OperationHub.upsert) {
      OperationHub.upsert({
        id: 'scan-demo-tag-id',
        kind: 'scan',
        title: '扫描目录大小',
        detail: '/data · 已扫 128 个目录',
        cwd: '/data',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        state: 'running',
        indeterminate: true,
        cancelable: true,
        reconnectable: true,
        startedAt: now - 120000
      }, 'update');
      OperationHub.upsert({
        id: 'upload-demo-1',
        kind: 'upload',
        title: '上传 3 个文件',
        detail: 'app.jar · 42 MB / 128 MB',
        cwd: '/data/apps',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        state: 'running',
        progress: 33,
        indeterminate: false,
        cancelable: true,
        reconnectable: true,
        startedAt: now - 90000
      }, 'update');
      OperationHub.upsert({
        id: 'fop-delete-demo',
        kind: 'delete',
        title: '删除 12 项',
        detail: '/data/apps/logs/old · 已删除 12 项',
        cwd: '/data/apps/logs',
        tagId: 'demo-tag-id',
        sessionName: 'Demo Lab',
        jobId: 'fop-demo-delete',
        state: 'paused',
        indeterminate: true,
        cancelable: true,
        reconnectable: true,
        startedAt: now - 60000
      }, 'update');
      OperationHub.open();
    }
  }, { sftpSrc, session: DEMO_SESSIONS[0] });

  await page.waitForSelector('#desktopOperationsPanel.show', { timeout: 8000 });
  await page.waitForTimeout(600);
  await saveShot(page, '23-desktop-operations.png');

  await page.evaluate(() => {
    if (window.OperationHub && OperationHub.close) OperationHub.close();
  });
  await page.waitForTimeout(250);
  // Keep fab visible with badge
  await page.evaluate(() => {
    const fab = document.getElementById('desktopOperationsFab');
    const badge = document.getElementById('desktopOperationsBadge');
    if (fab) fab.removeAttribute('hidden');
    if (badge) {
      badge.textContent = '3';
      badge.style.display = '';
      badge.classList.add('is-active');
    }
  });
  await saveShot(page, '23b-desktop-operations-fab.png');

  await browser.close();
  console.log('ops panel shots done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
