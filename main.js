/* CROWDNET_STUDIO desktop shell and portable static frontend. */

const APP_TITLE = "CROWDNET_STUDIO";

/** Mount the frontend. This function intentionally depends only on browser APIs. */
function mountCrowdnetStudio(documentRoot = document) {
  const style = documentRoot.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; min-height: 100vh; overflow: hidden; color: #ecf8ff;
      background: radial-gradient(circle at 50% 32%, #172f4c 0, #09131f 42%, #05090f 100%); }
    .app { min-height: 100vh; display: grid; place-items: center; padding: 32px; }
    .launch { text-align: center; opacity: 0; transform: translateY(16px); animation: arrive .75s ease-out forwards; }
    .mark { position: relative; width: 92px; height: 92px; margin: 0 auto 28px; display: grid; place-items: center; }
    .mark::before, .mark::after { content: ""; position: absolute; inset: 5px; border: 1px solid #49c9ff;
      border-radius: 27px; transform: rotate(45deg); box-shadow: 0 0 32px #128bd966; animation: breathe 2.4s ease-in-out infinite; }
    .mark::after { inset: 20px; border-color: #b4f3ff; border-radius: 14px; animation-delay: -.8s; }
    .core { width: 10px; height: 10px; border-radius: 50%; background: #d9fbff; box-shadow: 0 0 22px #56d9ff; }
    h1 { margin: 0; font-size: clamp(28px, 4.5vw, 48px); letter-spacing: .16em; font-weight: 650; }
    .accent { color: #65d7ff; }
    .status { margin: 18px 0 0; color: #a9bbca; font-size: 14px; letter-spacing: .08em; }
    .status::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 9px;
      border-radius: 50%; background: #57e5af; box-shadow: 0 0 10px #57e5af; }
    .stage { margin-top: 34px; color: #5f788d; font-size: 11px; text-transform: uppercase; letter-spacing: .22em; }
    @keyframes arrive { to { opacity: 1; transform: translateY(0); } }
    @keyframes breathe { 50% { transform: rotate(45deg) scale(1.07); opacity: .62; } }
    @media (prefers-reduced-motion: reduce) { .launch { animation: none; opacity: 1; transform: none; } .mark::before, .mark::after { animation: none; } }
  `;

  const app = documentRoot.createElement("main");
  app.className = "app";
  app.innerHTML = `
    <section class="launch" aria-labelledby="app-title">
      <div class="mark" aria-hidden="true"><span class="core"></span></div>
      <h1 id="app-title">CROWDNET<span class="accent">_STUDIO</span></h1>
      <p class="status">Application initialized successfully</p>
      <p class="stage">Foundation build · v0.1.0</p>
    </section>`;
  documentRoot.head.appendChild(style);
  documentRoot.body.replaceChildren(app);
}

function frontendDocument() {
  const mountSource = mountCrowdnetStudio.toString();
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${APP_TITLE}</title></head><body><script>(${mountSource})(document);<\/script></body></html>`;
}

async function startDesktopShell() {
  const { app, BrowserWindow } = require("electron");
  app.setName(APP_TITLE);
  app.setAppUserModelId("studio.crowdnet.desktop");

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  let mainWindow = null;
  const focusWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  app.on("second-instance", focusWindow);
  await app.whenReady();

  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: "#05090f",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, devTools: false, sandbox: true },
  });
  mainWindow.removeMenu();
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; app.quit(); });
  await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(frontendDocument())}`);

  app.on("activate", focusWindow);
  app.on("window-all-closed", () => app.quit());
}

const isElectronMain = typeof process !== "undefined" && process.versions?.electron && process.type === "browser";
if (isElectronMain) {
  startDesktopShell().catch((error) => { console.error(`[${APP_TITLE}] Startup failed:`, error); process.exitCode = 1; });
} else if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mountCrowdnetStudio());
  else mountCrowdnetStudio();
}

if (typeof module !== "undefined") module.exports = { mountCrowdnetStudio, frontendDocument };
