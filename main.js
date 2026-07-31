/* MAGICUS desktop shell. Access credentials stay in Electron's main process. */

const path = require("node:path");

const APP_TITLE = "MAGICUS";
const BRIDGE_REPOSITORY = "MAGICUS_BRIDGE";

function accessFailure(status) {
  if (status === 401) return { ok: false, code: "invalid", message: "That access key is invalid or has expired." };
  if (status === 403) return { ok: false, code: "restricted", message: "This access key is not authorized for MAGICUS." };
  if (status === 404) return { ok: false, code: "bridge", message: "The private bridge is not available to this access key." };
  return { ok: false, code: "service", message: "Access validation is temporarily unavailable. Please try again." };
}

async function validateAccessKey(accessKey, request) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessKey}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": APP_TITLE,
  };
  try {
    const accountResponse = await request("https://api.github.com/user", { headers });
    if (!accountResponse.ok) return accessFailure(accountResponse.status);
    const account = await accountResponse.json();
    if (!account?.login) return accessFailure(401);

    const owner = encodeURIComponent(account.login);
    const repositoryResponse = await request(`https://api.github.com/repos/${owner}/${BRIDGE_REPOSITORY}`, { headers });
    if (!repositoryResponse.ok) return accessFailure(repositoryResponse.status);
    const repository = await repositoryResponse.json();
    if (repository?.name !== BRIDGE_REPOSITORY || repository?.private !== true) return accessFailure(404);
    return { ok: true, account: account.login, bridge: BRIDGE_REPOSITORY };
  } catch {
    return accessFailure(0);
  }
}

async function startDesktopShell() {
  const { app, BrowserWindow, ipcMain, net } = require("electron");
  app.setName(APP_TITLE);
  app.setAppUserModelId("com.magicus.studio");

  if (!app.requestSingleInstanceLock()) return app.quit();
  let mainWindow;
  const focusWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };
  app.on("second-instance", focusWindow);
  await app.whenReady();

  ipcMain.handle("magicus:validate-access", async (_event, payload) => {
    const accessKey = typeof payload?.accessKey === "string" ? payload.accessKey.trim() : "";
    if (!accessKey) return { ok: false, code: "missing", message: "Enter your access key to continue." };
    return validateAccessKey(accessKey, net.fetch);
  });

  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: "#06070a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
    },
  });
  mainWindow.removeMenu();
  // `ready-to-show` can be withheld by some GPU/Windows configurations.  Do
  // not make the application's visibility depend on that optional event.
  const revealWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once("ready-to-show", revealWindow);
  const revealFallback = setTimeout(revealWindow, 2500);
  mainWindow.on("closed", () => { mainWindow = null; app.quit(); });
  try {
    await mainWindow.loadFile(path.join(__dirname, "index.html"));
    revealWindow();
  } finally {
    clearTimeout(revealFallback);
  }
  app.on("activate", focusWindow);
  app.on("window-all-closed", () => app.quit());
}

function isElectronMainProcess(runtime = process) {
  return Boolean(runtime?.versions?.electron && runtime?.type === "browser");
}

// Electron does not guarantee that its entry script is exposed as
// `require.main`. Detect the documented main-process runtime instead, otherwise
// Electron may stay alive without ever creating a BrowserWindow.
if (isElectronMainProcess()) {
  startDesktopShell().catch((error) => {
    // Deliberately log no request data or credentials.
    console.error(`[${APP_TITLE}] Startup failed:`, error?.message || "Unknown error");
    process.exitCode = 1;
  });
}

module.exports = { APP_TITLE, BRIDGE_REPOSITORY, accessFailure, isElectronMainProcess, validateAccessKey };
