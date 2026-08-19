const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'img');
fs.mkdirSync(OUT, { recursive: true });

const DEMO_SESSIONS = [
  { id: 'demo-lab', name: 'Demo Lab', ip: '10.10.0.21', port: 22, userName: 'deploy', password: 'demo-pass' },
  { id: 'demo-ci', name: 'CI Runner', ip: '10.10.0.88', port: 22, userName: 'builder', password: 'demo-pass' },
  { id: 'demo-db', name: 'DB Jumpbox', ip: '10.10.0.55', port: 22, userName: 'ops', password: 'demo-pass' }
];

const DEMO_LS = [
  { name: 'api', dir: true, size: 4096, modifyTime: '2026-08-12 09:21', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'web', dir: true, size: 4096, modifyTime: '2026-08-12 09:22', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'logs', dir: true, size: 4096, modifyTime: '2026-08-10 14:02', permissions: 'drwxr-xr-x', permissionText: '755', owner: 'deploy' },
  { name: 'README.md', dir: false, size: 1240, modifyTime: '2026-08-12 09:20', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'docker-compose.yml', dir: false, size: 846, modifyTime: '2026-08-11 18:03', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' },
  { name: 'app.log', dir: false, size: 204800, modifyTime: '2026-08-18 08:11', permissions: '-rw-r-----', permissionText: '640', owner: 'deploy' },
  { name: 'banner.png', dir: false, size: 48200, modifyTime: '2026-08-09 16:40', permissions: '-rw-r--r--', permissionText: '644', owner: 'deploy' }
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

function jsonOk(result) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 200, message: 'ok', result: result })
  };
}

async function mockApis(page) {
  await page.route('**/webssh/api/**', async (route) => {
    const url = route.request().url();
    const u = new URL(url);
    const p = u.pathname;
    if (p.endsWith('/checkLogin') || p.endsWith('/pwd')) {
      return route.fulfill(jsonOk('/data/apps'));
    }
    if (p.endsWith('/ls')) {
      const dir = u.searchParams.get('path') || '/';
      if (dir === '/' || dir === '') return route.fulfill(jsonOk(TREE_ROOT));
      if (dir === '/data') return route.fulfill(jsonOk(TREE_DATA));
      if (dir === '/data/apps' || dir.indexOf('/data/apps') === 0) return route.fulfill(jsonOk(DEMO_LS));
      return route.fulfill(jsonOk([]));
    }
    if (p.endsWith('/loginSsh')) {
      return route.fulfill(jsonOk('demo-tag-id'));
    }
    return route.fulfill(jsonOk(null));
  });
}

async function seedDesktop(page) {
  await page.evaluate((sessions) => {
    try { localStorage.removeItem('webssh.sessionLayout.v1'); } catch (e) {}
    document.querySelectorAll('#desktopSessionLayer .session-win, #desktopDockStrip .session-win').forEach((n) => n.remove());
    if (window.Desktop && Desktop.render) Desktop.render(sessions);
  }, DEMO_SESSIONS);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
  await mockApis(page);

  // ---- desktop shots ----
  await page.goto('http://127.0.0.1:9092/webssh/page/index.html', { waitUntil: 'domcontentloaded' });
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
  await page.waitForTimeout(600);
  await seedDesktop(page);
  await page.screenshot({ path: path.join(OUT, '01-desktop.png') });

  await page.click('.desktop-icon[data-session-id="demo-lab"]');
  await page.waitForSelector('#desktopMenu .desktop-menu-item');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '02-server-menu.png') });
  await page.keyboard.press('Escape');

  await page.click('.desktop-icon[data-icon-id="__add__"]');
  await page.waitForSelector('#sessionModal.show');
  await page.fill('#sessionName', 'Demo Lab');
  await page.fill('#sessionIp', '10.10.0.21');
  await page.fill('#sessionPort', '22');
  await page.fill('#sessionUserName', 'deploy');
  await page.fill('#sessionPassword', 'demopass');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '03-add-server.png') });
  await page.evaluate(() => jQuery('#sessionModal').modal('hide'));
  await page.waitForTimeout(300);

  await page.click('.desktop-icon[data-icon-id="__global_cmd__"]');
  await page.waitForSelector('#commandModal.show');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '04-global-commands.png') });
  await page.evaluate(() => jQuery('#commandModal').modal('hide'));
  await page.waitForTimeout(300);

  await page.click('.desktop-icon[data-icon-id="__help__"]');
  await page.waitForSelector('.session-win[data-kind="help"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '05-help.png') });
  await page.evaluate(() => {
    const b = document.querySelector('.session-win[data-kind="help"] .sw-close');
    if (b) b.click();
  });
  await page.waitForTimeout(300);

  // ---- real SFTP UI (details) ----
  const sftpUrl =
    'http://127.0.0.1:9092/webssh/page/sftp.html?folderWin=1&v=shot'
    + '&sessionName=' + encodeURIComponent('Demo Lab')
    + '&ip=' + encodeURIComponent('10.10.0.21')
    + '&sessionId=demo-lab&port=22&tagId=demo-tag-id'
    + '&cwd=' + encodeURIComponent('/data/apps');
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.goto(sftpUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#fileView table, #fileView .icon-tile, #fileView .p-3', { timeout: 10000 });
  await page.waitForTimeout(800);
  // ensure details + favorites
  await page.evaluate(() => {
    try {
      localStorage.setItem('websshSftpViewMode', 'details');
      localStorage.setItem('websshSftpFavorites', JSON.stringify(['/data/apps', '/data/backup', '/opt']));
    } catch (e) {}
    if (typeof setViewMode === 'function') setViewMode('details');
    if (typeof renderFavorites === 'function') renderFavorites();
    else if (window.renderFavorites) window.renderFavorites();
  });
  // reload list after fav
  await page.evaluate(() => {
    if (typeof renderFileList === 'function') renderFileList('/data/apps');
  });
  await page.waitForTimeout(700);
  await page.locator('#fileView tr').filter({ hasText: 'web' }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '06-sftp-details.png') });

  // icons + hover tip
  await page.evaluate(() => {
    if (typeof setViewMode === 'function') setViewMode('icons');
  });
  await page.waitForTimeout(500);
  const tile = page.locator('#fileView .icon-tile').filter({ hasText: 'README.md' }).first();
  await tile.hover({ force: true });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, '07-sftp-icons.png') });

  // content view
  await page.evaluate(() => {
    if (typeof setViewMode === 'function') setViewMode('content');
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '08-sftp-content.png') });

  // context menu
  await page.evaluate(() => {
    if (typeof setViewMode === 'function') setViewMode('details');
  });
  await page.waitForTimeout(400);
  await page.locator('#fileView tr').filter({ hasText: 'README.md' }).first().click({ button: 'right' });
  await page.waitForSelector('#fileContextMenu', { state: 'visible' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '09-sftp-context.png') });
  await page.keyboard.press('Escape');

  // ---- workspace: desktop + real sftp iframe window + terminal chrome ----
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto('http://127.0.0.1:9092/webssh/page/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#desktopIconGrid');
  await seedDesktop(page);
  await page.evaluate((sftpSrc) => {
    const layer = document.querySelector('#desktopSessionLayer');
    if (!layer) return;
    layer.innerHTML = '';
    const termBody =
      '<div style="font:13px/1.45 Consolas,monospace;color:#d7dde5;padding:10px 12px;height:100%;background:#0f1419;box-sizing:border-box;">' +
      '<div style="color:#7dcea0;">deploy@demo-lab:~$</div>' +
      '<div>cd /data/apps && ls -lh</div>' +
      '<div>total 48K</div>' +
      '<div>drwxr-xr-x  5 deploy deploy 4.0K Aug 12 09:21 api</div>' +
      '<div>drwxr-xr-x  3 deploy deploy 4.0K Aug 12 09:22 web</div>' +
      '<div>-rw-r--r--  1 deploy deploy 1.2K Aug 12 09:20 README.md</div>' +
      '<div style="color:#7dcea0;margin-top:8px;">deploy@demo-lab:/data/apps$ <span style="display:inline-block;width:8px;height:14px;background:#d7dde5;"></span></div></div>';

    function mkWin(kind, title, left, top, w, h, inner) {
      const el = document.createElement('div');
      el.className = 'session-win folder-win focused';
      el.setAttribute('data-kind', kind);
      el.style.cssText = 'left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px;z-index:3200;';
      el.innerHTML =
        '<div class="session-win-title folder-win-title">' +
        '<span class="session-win-title-text folder-win-title-text"></span>' +
        '<div class="session-win-actions folder-win-actions">' +
        '<button type="button" class="fw-btn">▤</button>' +
        '<button type="button" class="fw-btn">—</button>' +
        '<button type="button" class="fw-btn">□</button>' +
        '<button type="button" class="fw-btn">×</button></div></div>' +
        '<div class="session-win-body folder-win-body" style="overflow:hidden;background:#fff;"></div>';
      el.querySelector('.session-win-title-text').textContent = title;
      const body = el.querySelector('.session-win-body');
      if (typeof inner === 'string' && inner.indexOf('<iframe') === 0) {
        body.innerHTML = inner;
      } else {
        body.innerHTML = inner;
      }
      layer.appendChild(el);
      return el;
    }
    mkWin('ssh', 'Demo Lab', 24, 28, 540, 460, termBody);
    mkWin(
      'sftp',
      'Demo Lab (10.10.0.21) · apps',
      480,
      48,
      820,
      620,
      '<iframe class="session-win-frame folder-win-frame" src="' + sftpSrc + '" style="width:100%;height:100%;border:0;"></iframe>'
    );
  }, sftpUrl);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '10-workspace.png') });

  await page.evaluate(() => {
    const wins = Array.from(document.querySelectorAll('#desktopSessionLayer .session-win'));
    if (wins[0]) Object.assign(wins[0].style, { left: '0px', top: '0px', width: '42%', height: 'calc(100% - 48px)' });
    if (wins[1]) Object.assign(wins[1].style, { left: '43%', top: '0px', width: '57%', height: 'calc(100% - 48px)' });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '11-split-layout.png') });

  await browser.close();
  console.log('ok', OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
