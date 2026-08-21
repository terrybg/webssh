/**
 * Capture file-preview overlays for README (image / video / text·py / excel).
 * Requires: WebSSH on :9092, playwright installed in tools/webssh.
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

async function saveShot(page, name) {
  const buf = await page.screenshot({ type: 'png' });
  for (const dir of OUT_DIRS) {
    fs.writeFileSync(path.join(dir, name), buf);
  }
  console.log('wrote', name);
}

async function seedDesktop(page) {
  await page.evaluate(() => {
    const sessions = [
      { id: 'demo-lab', name: 'Demo Lab', ip: '10.10.0.21', port: 22, userName: 'deploy', password: 'x' },
      { id: 'demo-ci', name: 'CI Runner', ip: '10.10.0.88', port: 22, userName: 'builder', password: 'x' }
    ];
    try { localStorage.removeItem('webssh.sessionLayout.v1'); } catch (e) {}
    if (window.Desktop && Desktop.render) Desktop.render(sessions);
  });
  await page.waitForTimeout(400);
}

async function placeFileWindow(page) {
  await page.evaluate(() => {
    const layer = document.querySelector('#desktopSessionLayer');
    if (!layer) return;
    layer.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'session-win folder-win';
    el.setAttribute('data-kind', 'sftp');
    el.style.cssText = 'left:36px;top:40px;width:980px;height:640px;z-index:2100;';
    el.innerHTML =
      '<div class="session-win-title folder-win-title">' +
      '<span class="session-win-title-text">Demo Lab (10.10.0.21) · apps</span>' +
      '<div class="session-win-actions folder-win-actions">' +
      '<button type="button" class="fw-btn">▤</button>' +
      '<button type="button" class="fw-btn">—</button>' +
      '<button type="button" class="fw-btn">□</button>' +
      '<button type="button" class="fw-btn">×</button></div></div>' +
      '<div class="session-win-body folder-win-body" style="background:#f3f3f3;padding:16px;font:13px Segoe UI,sans-serif;color:#333;">' +
      '<div style="margin-bottom:10px;color:#555;">文件资源管理器 · 双击或空格预览</div>' +
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">' +
      ['banner.png', 'demo.mp4', 'deploy.py', 'report.xlsx', 'app.log'].map(function (n) {
        return '<div style="background:#fff;border:1px solid #ddd;border-radius:4px;padding:18px 8px;text-align:center;">' +
          '<div style="font-size:28px;margin-bottom:6px;">📄</div><div>' + n + '</div></div>';
      }).join('') +
      '</div></div>';
    layer.appendChild(el);
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:9092/webssh/page/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#desktopIconGrid', { timeout: 15000 });
  await seedDesktop(page);
  await placeFileWindow(page);
  await page.waitForTimeout(300);

  // ---- image ----
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 960, 540);
    g.addColorStop(0, '#0b3d5c');
    g.addColorStop(0.55, '#1a7a6d');
    g.addColorStop(1, '#f0c75e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = 'bold 42px Segoe UI, sans-serif';
    ctx.fillText('WebSSH Image Preview', 48, 120);
    ctx.font = '22px Segoe UI, sans-serif';
    ctx.fillText('滚轮缩放 · 拖拽平移 · 双击适应/1:1', 48, 170);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(700 + (i % 4) * 40, 360 + Math.floor(i / 4) * 40, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    const url = canvas.toDataURL('image/png');
    openSessionPreview({ name: 'banner.png', kind: 'image', url: url });
  });
  await page.waitForSelector('#sessionPreviewOverlay.show');
  await page.waitForTimeout(500);
  await saveShot(page, '12-preview-image.png');
  await page.evaluate(() => closeSessionPreview());

  // ---- video (canvas stream -> webm blob) ----
  const videoOk = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 854;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      const t = frame / 30;
      ctx.fillStyle = '#101820';
      ctx.fillRect(0, 0, 854, 480);
      ctx.fillStyle = '#1f6feb';
      ctx.fillRect(0, 0, 854 * ((frame % 90) / 90), 8);
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 36px Segoe UI, sans-serif';
      ctx.fillText('Demo Video Preview', 40, 80);
      ctx.font = '20px Segoe UI, sans-serif';
      ctx.fillText('空格暂停/播放 · Esc 关闭 · 支持 Range 拖进度', 40, 120);
      ctx.beginPath();
      ctx.arc(427 + Math.cos(t) * 120, 280 + Math.sin(t) * 60, 28, 0, Math.PI * 2);
      ctx.fillStyle = '#3fb950';
      ctx.fill();
      frame += 1;
    };
    for (let i = 0; i < 8; i++) draw();
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      // fallback: show image as faux video chrome
      const url = canvas.toDataURL('image/png');
      openSessionPreview({ name: 'demo.mp4', kind: 'image', url: url });
      $('#sessionPreviewTitle').text('demo.mp4');
      setPreviewHint('video');
      return 'fallback';
    }
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { rec.onstop = () => resolve(); });
    rec.start(50);
    const timer = setInterval(draw, 33);
    await new Promise((r) => setTimeout(r, 900));
    clearInterval(timer);
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (!blob.size) {
      const url = canvas.toDataURL('image/png');
      openSessionPreview({ name: 'demo.mp4', kind: 'image', url: url });
      $('#sessionPreviewTitle').text('demo.mp4');
      setPreviewHint('video');
      return 'fallback-empty';
    }
    const url = URL.createObjectURL(blob);
    openSessionPreview({ name: 'demo.mp4', kind: 'video', url: url });
    await new Promise((r) => setTimeout(r, 400));
    const v = document.querySelector('#sessionPreviewBody video');
    if (v) {
      try { v.pause(); v.currentTime = 0.2; } catch (e) {}
    }
    return 'ok';
  });
  console.log('video mode', videoOk);
  await page.waitForSelector('#sessionPreviewOverlay.show');
  await page.waitForTimeout(600);
  await saveShot(page, '13-preview-video.png');
  await page.evaluate(() => closeSessionPreview());

  // ---- python / text ----
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
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    openSessionPreview({ name: 'deploy.py', kind: 'text', url: url });
  });
  await page.waitForSelector('#sessionPreviewBody pre');
  await page.waitForTimeout(400);
  await saveShot(page, '14-preview-text-py.png');
  await page.evaluate(() => closeSessionPreview());

  // ---- excel ----
  await page.evaluate(() => {
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX missing');
    }
    const wb = XLSX.utils.book_new();
    const overview = XLSX.utils.aoa_to_sheet([
      ['服务', '实例', 'CPU%', '内存%', '状态', '备注'],
      ['api', 3, 18, 42, '运行中', '蓝绿发布'],
      ['web', 2, 9, 31, '运行中', ''],
      ['worker', 4, 55, 67, '运行中', '队列积压中'],
      ['redis', 1, 4, 22, '运行中', ''],
      ['mysql', 1, 27, 71, '运行中', '只读副本健康'],
      ['gateway', 2, 11, 28, '运行中', '']
    ]);
    const hosts = XLSX.utils.aoa_to_sheet([
      ['主机', 'IP', '角色', '磁盘%', '负载'],
      ['demo-lab', '10.10.0.21', 'app', 61, 1.2],
      ['demo-ci', '10.10.0.88', 'ci', 44, 0.6],
      ['demo-db', '10.10.0.55', 'db', 73, 1.8]
    ]);
    XLSX.utils.book_append_sheet(wb, overview, '概览');
    XLSX.utils.book_append_sheet(wb, hosts, '主机');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const url = URL.createObjectURL(new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));
    openSessionPreview({ name: 'report.xlsx', kind: 'excel', url: url });
  });
  await page.waitForSelector('#sessionPreviewBody .excel-table');
  await page.waitForTimeout(500);
  await saveShot(page, '15-preview-excel.png');
  await page.evaluate(() => closeSessionPreview());

  await browser.close();
  console.log('preview shots done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
