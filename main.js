/* MAGICUS desktop shell. Access credentials stay in Electron's main process. */

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const APP_TITLE = "MAGICUS";
const BRIDGE_REPOSITORY = "MAGICUS_BRIDGE";
const ALWAYS_ON_TOP_LEVEL = "floating";

function keepWindowOnTop(window) {
  window.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  return window;
}

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
  const { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } = require("electron");
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
  const dataDirectory = path.join(app.getPath("userData"), "workspace");
  const assetDirectory = path.join(dataDirectory, "assets");
  const workspaceFile = path.join(dataDirectory, "workspace.json");
  const assetFile = path.join(dataDirectory, "assets.json");
  const credentialFile = path.join(dataDirectory, "access.json");
  await fs.mkdir(assetDirectory, { recursive: true });
  const readJson = async (file, fallback) => {
    try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
  };
  const writeJson = async (file, value) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  };
  const mediaType = (file) => {
    const extension = path.extname(file).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"].includes(extension)) return "image";
    if ([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"].includes(extension)) return "video";
    return null;
  };
  const importAssets = async (paths) => {
    const current = await readJson(assetFile, []);
    const results = [];
    for (const sourcePath of paths) {
      try {
        const type = mediaType(sourcePath);
        if (!type) throw new Error("Unsupported media type");
        const stat = await fs.stat(sourcePath);
        const id = crypto.randomUUID();
        const storedName = `${id}${path.extname(sourcePath).toLowerCase()}`;
        const storagePath = path.join(assetDirectory, storedName);
        await fs.copyFile(sourcePath, storagePath);
        const record = { id, name: path.basename(sourcePath), type, importedAt: new Date().toISOString(), storagePath, size: stat.size, url: pathToFileURL(storagePath).href };
        current.unshift(record); results.push({ ok: true, asset: record });
      } catch (error) { results.push({ ok: false, name: path.basename(sourcePath || "File"), error: error.message }); }
    }
    await writeJson(assetFile, current);
    return results;
  };

  ipcMain.handle("magicus:validate-access", async (_event, payload) => {
    const accessKey = typeof payload?.accessKey === "string" ? payload.accessKey.trim() : "";
    if (!accessKey) return { ok: false, code: "missing", message: "Enter your access key to continue." };
    return validateAccessKey(accessKey, net.fetch);
  });
  ipcMain.handle("magicus:access-load", async () => {
    const saved = await readJson(credentialFile, null);
    if (!saved?.username || !saved?.encryptedKey || !safeStorage.isEncryptionAvailable()) return null;
    try { return { username: saved.username, accessKey: safeStorage.decryptString(Buffer.from(saved.encryptedKey, "base64")) }; } catch { return null; }
  });
  ipcMain.handle("magicus:access-save", async (_event, credentials) => {
    const savedUsername = typeof credentials?.username === "string" ? credentials.username.trim().slice(0, 60) : "";
    const savedKey = typeof credentials?.accessKey === "string" ? credentials.accessKey : "";
    if (!savedUsername || !savedKey || !safeStorage.isEncryptionAvailable()) return { ok: false, message: "Secure credential storage is unavailable on this device." };
    const encryptedKey = safeStorage.encryptString(savedKey).toString("base64");
    await writeJson(credentialFile, { username: savedUsername, encryptedKey });
    return { ok: true };
  });
  ipcMain.handle("magicus:access-clear", async () => { await fs.rm(credentialFile, { force: true }); return { ok: true }; });
  ipcMain.handle("magicus:workspace-load", () => readJson(workspaceFile, { folders: [] }));
  ipcMain.handle("magicus:workspace-save", async (_event, workspace) => {
    const safe = {
      version: 4,
      folders: Array.isArray(workspace?.folders) ? workspace.folders.slice(0, 100) : [],
      projects: Array.isArray(workspace?.projects) ? workspace.projects.slice(0, 250) : [],
      sync: { provider: "MAGICUS_BRIDGE", status: "local", updatedAt: new Date().toISOString() },
    };
    await writeJson(workspaceFile, safe); return { ok: true };
  });
  ipcMain.handle("magicus:launch-app", (_event, shortcut) => {
    let target; try { target = new URL(shortcut?.url); } catch { return { ok: false }; }
    if (!["http:", "https:"].includes(target.protocol)) return { ok: false };
    const win = keepWindowOnTop(new BrowserWindow({ title: shortcut.name || APP_TITLE, width: 1180, height: 780, minWidth: 640, minHeight: 480, autoHideMenuBar: true, alwaysOnTop: true, backgroundColor: "#090a0d", webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } }));
    win.removeMenu();
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
    win.loadURL(target.href); return { ok: true };
  });
  ipcMain.handle("magicus:assets-select", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openFile", "multiSelections"], filters: [{ name: "Images & videos", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "mp4", "webm", "mov", "m4v", "avi", "mkv"] }] });
    return result.canceled ? [] : importAssets(result.filePaths);
  });
  ipcMain.handle("magicus:assets-import", (_event, paths) => importAssets(Array.isArray(paths) ? paths : []));
  ipcMain.handle("magicus:assets-list", () => readJson(assetFile, []));
  ipcMain.handle("magicus:asset-delete", async (_event, id) => {
    const assets = await readJson(assetFile, []); const match = assets.find((asset) => asset.id === id);
    if (!match) return { ok: false };
    await fs.rm(match.storagePath, { force: true }); await writeJson(assetFile, assets.filter((asset) => asset.id !== id)); return { ok: true };
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
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
      webSecurity: true,
    },
  });
  keepWindowOnTop(mainWindow);
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

module.exports = { ALWAYS_ON_TOP_LEVEL, APP_TITLE, BRIDGE_REPOSITORY, accessFailure, isElectronMainProcess, keepWindowOnTop, validateAccessKey };
