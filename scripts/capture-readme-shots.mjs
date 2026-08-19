const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = path.join(__dirname, "..", "img");
fs.mkdirSync(OUT, { recursive: true });

const DEMO = [
  { id: "demo-lab", name: "Demo Lab", ip: "10.10.0.21", port: 22, userName: "deploy", password: "demo-pass" },
  { id: "demo-ci", name: "CI Runner", ip: "10.10.0.88", port: 22, userName: "builder", password: "demo-pass" },
  { id: "demo-db", name: "DB Jumpbox", ip: "10.10.0.55", port: 22, userName: "ops", password: "demo-pass" }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1360, height: 860 },
    deviceScaleFactor: 1
  });
  await page.goto("http://127.0.0.1:9092/webssh/page/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    try { localStorage.removeItem("webssh.sessionLayout.v1"); } catch (e) {}
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate((sessions) => {
    if (window.Desktop && Desktop.render) {
      Desktop.render(sessions);
    }
  }, DEMO);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "01-desktop.png") });

  // server click menu
  await page.click('.desktop-icon[data-icon-type="server"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, "02-server-menu.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // add server modal
  await page.click('.desktop-icon[data-icon-id="__add__"]');
  await page.waitForSelector("#sessionModal.show, #sessionModal", { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.fill("#sessionName", "Demo Lab");
  await page.fill("#sessionIp", "10.10.0.21");
  await page.fill("#sessionPort", "22");
  await page.fill("#sessionUser", "deploy");
  await page.fill("#sessionPassword", "••••••••");
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, "03-add-server.png") });
  await page.click('#sessionModal [data-dismiss="modal"], #sessionModal .close').catch(() => {});
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const $m = window.jQuery && jQuery("#sessionModal");
    if ($m && $m.modal) $m.modal("hide");
  });
  await page.waitForTimeout(300);

  // global commands
  await page.click('.desktop-icon[data-icon-id="__global_cmd__"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "04-global-commands.png") });
  await page.evaluate(() => {
    const $m = window.jQuery && jQuery("#commandModal");
    if ($m && $m.modal) $m.modal("hide");
  });
  await page.waitForTimeout(300);

  // help window
  await page.click('.desktop-icon[data-icon-id="__help__"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "05-help.png") });
  await page.evaluate(() => {
    jQuery('.session-win[data-kind="help"] .sw-close').click();
  });
  await page.waitForTimeout(300);

  // inject realistic-looking floating windows (demo content only)
  await page.evaluate(() => {
    const layer = document.querySelector("#desktopSessionLayer");
    if (!layer) return;
    layer.innerHTML = "";
    const mk = (kind, title, left, top, w, h, bodyHtml) => {
      const el = document.createElement("div");
      el.className = "session-win folder-win focused";
      el.setAttribute("data-kind", kind);
      el.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;z-index:3200;`;
      el.innerHTML =
        '<div class="session-win-title folder-win-title">' +
        '<span class="session-win-title-text folder-win-title-text"></span>' +
        '<div class="session-win-actions folder-win-actions">' +
        '<button type="button" class="fw-btn">▤</button>' +
        '<button type="button" class="fw-btn">—</button>' +
        '<button type="button" class="fw-btn">□</button>' +
        '<button type="button" class="fw-btn">×</button>' +
        "</div></div>" +
        '<div class="session-win-body folder-win-body" style="background:#111;overflow:hidden;"></div>';
      el.querySelector(".session-win-title-text").textContent = title;
      const body = el.querySelector(".session-win-body");
      body.innerHTML = bodyHtml;
      layer.appendChild(el);
      return el;
    };
    const term =
      '<div style="font:13px/1.45 Consolas,monospace;color:#d7dde5;padding:10px 12px;height:100%;background:#0f1419;box-sizing:border-box;">' +
      '<div style="color:#7dcea0;">deploy@demo-lab:~$</div>' +
      '<div>uname -a</div>' +
      '<div style="color:#9aa7b5;">Linux demo-lab 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux</div>' +
      '<div style="color:#7dcea0;margin-top:8px;">deploy@demo-lab:~$</div>' +
      '<div>cd /data/apps && ls -lh</div>' +
      '<div>total 48K</div>' +
      '<div>drwxr-xr-x  5 deploy deploy 4.0K Aug 12 09:21 <span style="color:#6cb6ff;">api</span></div>' +
      '<div>drwxr-xr-x  3 deploy deploy 4.0K Aug 12 09:22 <span style="color:#6cb6ff;">web</span></div>' +
      '<div>-rw-r--r--  1 deploy deploy 1.2K Aug 12 09:20 README.md</div>' +
      '<div style="color:#7dcea0;margin-top:8px;">deploy@demo-lab:/data/apps$ <span style="background:#d7dde5;color:#0f1419;">█</span></div>' +
      "</div>";
    const files =
      '<div style="display:flex;height:100%;font:12.5px/1.4 Segoe UI,Microsoft YaHei,sans-serif;color:#222;background:#fff;">' +
      '<div style="width:180px;border-right:1px solid #ddd;background:#f7f7f7;padding:8px;">' +
      '<div style="font-weight:600;margin-bottom:6px;color:#555;">Demo Lab(10.10.0.21)</div>' +
      '<div style="padding:3px 4px;">📁 /</div>' +
      '<div style="padding:3px 4px 3px 16px;background:#e8f0fe;border-radius:3px;">📁 data</div>' +
      '<div style="padding:3px 4px 3px 28px;">📁 apps</div>' +
      '<div style="padding:3px 4px 3px 28px;">📁 logs</div>' +
      '<div style="padding:3px 4px 3px 16px;">📁 opt</div>' +
      "</div>" +
      '<div style="flex:1;display:flex;flex-direction:column;">' +
      '<div style="padding:6px 10px;border-bottom:1px solid #e5e5e5;background:#fafafa;">Demo Lab(10.10.0.21) › data › apps</div>' +
      '<div style="padding:8px 10px;">' +
      '<div style="display:grid;grid-template-columns:1.4fr 80px 120px;gap:6px;color:#666;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px;"><span>名称</span><span>大小</span><span>修改时间</span></div>' +
      '<div style="display:grid;grid-template-columns:1.4fr 80px 120px;gap:6px;padding:4px 0;"><span>📁 api</span><span></span><span>2026-08-12 09:21</span></div>' +
      '<div style="display:grid;grid-template-columns:1.4fr 80px 120px;gap:6px;padding:4px 0;background:#e8f0fe;"><span>📁 web</span><span></span><span>2026-08-12 09:22</span></div>' +
      '<div style="display:grid;grid-template-columns:1.4fr 80px 120px;gap:6px;padding:4px 0;"><span>📄 README.md</span><span>1.2 KB</span><span>2026-08-12 09:20</span></div>' +
      '<div style="display:grid;grid-template-columns:1.4fr 80px 120px;gap:6px;padding:4px 0;"><span>📄 docker-compose.yml</span><span>846 B</span><span>2026-08-11 18:03</span></div>' +
      "</div></div></div>";
    mk("ssh", "Demo Lab", 40, 36, 620, 420, term);
    mk("sftp", "Demo Lab (10.10.0.21) · apps", 520, 90, 720, 480, files);
    const tb = document.querySelector("#desktopTaskbar") || document.querySelector(".desktop-taskbar");
    if (tb) {
      tb.style.display = "";
      tb.innerHTML =
        '<div style="display:flex;gap:6px;align-items:center;height:100%;padding:0 8px;">' +
        '<div style="background:#3a3a3a;color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;">终端 Demo Lab</div>' +
        '<div style="background:#2f5f8a;color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;">Demo Lab (10.10.0.21) · apps</div>' +
        "</div>";
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "06-workspace.png") });

  // dock-like layout shot
  await page.evaluate(() => {
    const layer = document.querySelector("#desktopSessionLayer");
    const wins = layer ? Array.from(layer.querySelectorAll(".session-win")) : [];
    if (wins[0]) {
      wins[0].style.left = "0px";
      wins[0].style.top = "0px";
      wins[0].style.width = "48%";
      wins[0].style.height = "calc(100% - 48px)";
    }
    if (wins[1]) {
      wins[1].style.left = "50%";
      wins[1].style.top = "0px";
      wins[1].style.width = "50%";
      wins[1].style.height = "calc(100% - 48px)";
    }
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, "07-split-layout.png") });

  await browser.close();
  console.log("screenshots written to", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
