/* MAGICUS desktop shell. Access credentials stay in Electron's main process. */

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const APP_TITLE = "MAGICUS";
const BRIDGE_REPOSITORY = "MAGICUS_BRIDGE";
const BRIDGE_WORKSPACE_PATH = ".magicus/workspace.json";
const ALWAYS_ON_TOP_LEVEL = "floating";
const GOOGLE_PHOTOS_ALBUMS_URL = "https://photos.google.com/albums";

function isGooglePhotosNavigation(value) {
  try {
    const target = new URL(value);
    return target.protocol === "https:" && (target.hostname === "google.com" || target.hostname.endsWith(".google.com"));
  } catch { return false; }
}

function keepWindowOnTop(window) {
  window.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  return window;
}

function enforceAlwaysOnTop(app) {
  app.on("browser-window-created", (_event, window) => keepWindowOnTop(window));
}

function accessFailure(status) {
  if (status === 401) return { ok: false, code: "invalid", message: "That access key is invalid or has expired." };
  if (status === 403) return { ok: false, code: "restricted", message: "This access key is not authorized for MAGICUS." };
  if (status === 404) return { ok: false, code: "bridge", message: "The private bridge is not available to this access key." };
  return { ok: false, code: "service", message: "Access validation is temporarily unavailable. Please try again." };
}

function normalizeServer(server) {
  const value = String(server || "").trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(value)) return null;
  return value;
}

async function validateAccessKey(accessKey, request, server = BRIDGE_REPOSITORY) {
  const repositoryName = normalizeServer(server);
  if (!repositoryName) return { ok: false, code: "missing", message: "Enter a valid server to continue." };
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
    const repositoryResponse = await request(`https://api.github.com/repos/${owner}/${encodeURIComponent(repositoryName)}`, { headers });
    if (!repositoryResponse.ok) return accessFailure(repositoryResponse.status);
    const repository = await repositoryResponse.json();
    if (repository?.name !== repositoryName || repository?.private !== true) return accessFailure(404);
    return { ok: true, account: account.login, bridge: repositoryName };
  } catch {
    return accessFailure(0);
  }
}

function bridgeHeaders(accessKey) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessKey}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": APP_TITLE,
  };
}

function workspacePayload(workspace, updatedAt = new Date().toISOString()) {
  return {
    version: 4,
    folders: Array.isArray(workspace?.folders) ? workspace.folders.slice(0, 100) : [],
    projects: Array.isArray(workspace?.projects) ? workspace.projects.slice(0, 250) : [],
    sync: { provider: "MAGICUS_BRIDGE", status: "synced", updatedAt },
  };
}

function mergeWorkspace(local, remote) {
  const localTime = Date.parse(local?.sync?.updatedAt || "") || 0;
  const remoteTime = Date.parse(remote?.sync?.updatedAt || "") || 0;
  const preferred = localTime > remoteTime ? local : remote;
  const other = preferred === local ? remote : local;
  const mergeById = (preferredItems, otherItems, combine) => {
    const result = (Array.isArray(preferredItems) ? preferredItems : []).map(item => ({ ...item }));
    for (const item of Array.isArray(otherItems) ? otherItems : []) {
      const index = result.findIndex(candidate => candidate.id === item.id);
      if (index < 0) result.push({ ...item });
      else if (combine) result[index] = combine(result[index], item);
    }
    return result;
  };
  const folders = mergeById(preferred?.folders, other?.folders, (winner, older) => ({
    ...older,
    ...winner,
    apps: mergeById(winner.apps, older.apps),
  }));
  return workspacePayload({
    folders,
    projects: mergeById(preferred?.projects, other?.projects),
  });
}

async function readBridgeWorkspace(session, request) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(session.account)}/${encodeURIComponent(session.server || BRIDGE_REPOSITORY)}/contents/${BRIDGE_WORKSPACE_PATH}`;
  const requestMetadata = () => request(endpoint, { cache: "no-store", headers: { ...bridgeHeaders(session.accessKey), "Cache-Control": "no-cache" } });
  let response = await requestMetadata();
  if (response.status === 404) return { workspace: null, sha: null };
  if (!response.ok) throw new Error(accessFailure(response.status).message);
  let record;
  try {
    record = await response.json();
  } catch {
    // Electron's network cache can occasionally yield a successful response
    // with an empty body. Retry once rather than preventing desktop login.
    response = await requestMetadata();
    if (response.status === 404) return { workspace: null, sha: null };
    if (!response.ok) throw new Error(accessFailure(response.status).message);
    try { record = await response.json(); } catch { throw new Error("MAGICUS_BRIDGE returned an empty response. Please try syncing again."); }
  }
  if (!record?.content && Number(record?.size) === 0) return { workspace: null, sha: record.sha || null };
  let content;
  if (record?.content) {
    content = Buffer.from(String(record.content).replace(/\s/g, ""), "base64").toString("utf8");
  } else {
    // GitHub deliberately omits base64 `content` for files larger than 1 MB.
    const rawResponse = await request(endpoint, { headers: { ...bridgeHeaders(session.accessKey), Accept: "application/vnd.github.raw+json" } });
    if (!rawResponse.ok) throw new Error(accessFailure(rawResponse.status).message);
    content = await rawResponse.text();
  }
  try {
    const parsed = JSON.parse(content);
    return { workspace: workspacePayload(parsed, parsed?.sync?.updatedAt), sha: record.sha };
  } catch {
    throw new Error("The bridge workspace is empty or invalid JSON. Repair .magicus/workspace.json, then sign in again.");
  }
}

async function writeBridgeWorkspace(session, workspace, request, knownSha) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(session.account)}/${encodeURIComponent(session.server || BRIDGE_REPOSITORY)}/contents/${BRIDGE_WORKSPACE_PATH}`;
  const safe = workspacePayload(workspace);
  const body = { message: "Sync MAGICUS workspace", content: Buffer.from(JSON.stringify(safe, null, 2), "utf8").toString("base64") };
  if (knownSha) body.sha = knownSha;
  const response = await request(endpoint, { method: "PUT", headers: { ...bridgeHeaders(session.accessKey), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(response.status === 409 ? "The bridge changed on another client. Reload MAGICUS and try again." : accessFailure(response.status).message);
  return safe;
}

async function startDesktopShell() {
  const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, safeStorage, shell, Tray } = require("electron");
  app.setName(APP_TITLE);
  app.setAppUserModelId("com.magicus.studio");
  // Cover every BrowserWindow, including windows introduced by future features
  // or created indirectly by Electron rather than at the call sites below.
  enforceAlwaysOnTop(app);

  if (!app.requestSingleInstanceLock()) return app.quit();
  let mainWindow;
  let googlePhotosWindow;
  let tray;
  let isQuitting = false;
  let bridgeSession = null;
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
  const workspaceBackupFile = path.join(dataDirectory, "workspace.backup.json");
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
  const hasWorkspaceData = value => (Array.isArray(value?.folders) && value.folders.length > 0) || (Array.isArray(value?.projects) && value.projects.length > 0);
  const writeWorkspace = async value => {
    const current = await readJson(workspaceFile, null);
    if (hasWorkspaceData(current)) await writeJson(workspaceBackupFile, current);
    await writeJson(workspaceFile, value);
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
    const server = normalizeServer(payload?.server);
    const accessKey = typeof payload?.accessKey === "string" ? payload.accessKey.trim() : "";
    if (!server) return { ok: false, code: "missing", message: "Enter your server to continue." };
    if (!accessKey) return { ok: false, code: "missing", message: "Enter your access key to continue." };
    const result = await validateAccessKey(accessKey, net.fetch, server);
    bridgeSession = result.ok ? { accessKey, account: result.account, server } : null;
    return result;
  });
  ipcMain.handle("magicus:access-load", async () => {
    const saved = await readJson(credentialFile, null);
    if (!saved?.server || !saved?.encryptedKey || !safeStorage.isEncryptionAvailable()) return null;
    try { return { server: saved.server, accessKey: safeStorage.decryptString(Buffer.from(saved.encryptedKey, "base64")) }; } catch { return null; }
  });
  ipcMain.handle("magicus:access-save", async (_event, credentials) => {
    const savedServer = normalizeServer(credentials?.server);
    const savedKey = typeof credentials?.accessKey === "string" ? credentials.accessKey : "";
    if (!savedServer || !savedKey || !safeStorage.isEncryptionAvailable()) return { ok: false, message: "Secure credential storage is unavailable on this device." };
    const encryptedKey = safeStorage.encryptString(savedKey).toString("base64");
    await writeJson(credentialFile, { server: savedServer, encryptedKey });
    return { ok: true };
  });
  ipcMain.handle("magicus:access-clear", async () => { await fs.rm(credentialFile, { force: true }); return { ok: true }; });
  ipcMain.handle("magicus:workspace-load", async () => {
    let local = await readJson(workspaceFile, { folders: [], projects: [] });
    const backup = await readJson(workspaceBackupFile, null);
    if (!hasWorkspaceData(local) && hasWorkspaceData(backup)) local = backup;
    if (!bridgeSession) return local;
    try {
      const remote = await readBridgeWorkspace(bridgeSession, net.fetch);
      // Never let an incomplete bridge erase records that still exist locally.
      const merged = mergeWorkspace(local, remote.workspace || {});
      const seeded = await writeBridgeWorkspace(bridgeSession, merged, net.fetch, remote.sha);
      await writeWorkspace(seeded);
      return seeded;
    } catch (error) {
      // A temporary/malformed GitHub response must not lock users out of their
      // desktop data. Saves will retry the bridge and report a concrete error.
      return { ...local, sync: { ...(local.sync || {}), provider: "MAGICUS_BRIDGE", status: "offline", error: error.message } };
    }
  });
  ipcMain.handle("magicus:workspace-save", async (_event, workspace) => {
    const safe = workspacePayload(workspace);
    await writeWorkspace({ ...safe, sync: { ...safe.sync, status: "pending" } });
    if (!bridgeSession) return { ok: false, message: "Reconnect your private bridge before saving." };
    try {
      const current = await readBridgeWorkspace(bridgeSession, net.fetch);
      const synced = await writeBridgeWorkspace(bridgeSession, safe, net.fetch, current.sha);
      await writeWorkspace(synced);
      return { ok: true };
    } catch (error) { return { ok: false, message: error.message }; }
  });
  ipcMain.handle("magicus:launch-app", (_event, shortcut) => {
    let target; try { target = new URL(shortcut?.url); } catch { return { ok: false }; }
    if (!["http:", "https:"].includes(target.protocol)) return { ok: false };
    const win = keepWindowOnTop(new BrowserWindow({ title: shortcut.name || APP_TITLE, width: 1180, height: 780, minWidth: 640, minHeight: 480, autoHideMenuBar: true, alwaysOnTop: true, backgroundColor: "#090a0d", webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } }));
    win.removeMenu();
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
    win.loadURL(target.href); return { ok: true };
  });
  ipcMain.handle("magicus:google-photos-open", () => {
    if (googlePhotosWindow && !googlePhotosWindow.isDestroyed()) {
      if (googlePhotosWindow.isMinimized()) googlePhotosWindow.restore();
      googlePhotosWindow.show(); googlePhotosWindow.focus();
      return { ok: true, reused: true };
    }
    googlePhotosWindow = keepWindowOnTop(new BrowserWindow({
      title: "Google Photos — MAGICUS Asset Vault",
      width: 1120, height: 760, minWidth: 760, minHeight: 540,
      autoHideMenuBar: true, alwaysOnTop: true, fullscreenable: false,
      backgroundColor: "#111214",
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: "persist:magicus-google-photos", devTools: false },
    }));
    googlePhotosWindow.removeMenu();
    googlePhotosWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isGooglePhotosNavigation(url)) { googlePhotosWindow.loadURL(url); return { action: "deny" }; }
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    googlePhotosWindow.webContents.on("will-navigate", (event, url) => {
      if (!isGooglePhotosNavigation(url)) { event.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
    });
    googlePhotosWindow.on("closed", () => { googlePhotosWindow = null; });
    googlePhotosWindow.loadURL(GOOGLE_PHOTOS_ALBUMS_URL);
    return { ok: true, reused: false };
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
  const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" rx="3" transform="rotate(45 16 16)" fill="#111216" stroke="#d9b879"/><path d="M10 21V11h2.5l3.5 5.7 3.5-5.7H22v10h-2.5v-6l-3.5 5.3-3.5-5.3v6z" fill="#f2eee5"/></svg>`;
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(traySvg).toString("base64")}`));
  tray.setToolTip("MAGICUS — running in the background");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open MAGICUS", click: focusWindow },
    { type: "separator" },
    { label: "Quit MAGICUS", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", focusWindow);
  // `ready-to-show` can be withheld by some GPU/Windows configurations.  Do
  // not make the application's visibility depend on that optional event.
  const revealWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once("ready-to-show", revealWindow);
  const revealFallback = setTimeout(revealWindow, 2500);
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    isQuitting = true;
    app.quit();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  try {
    await mainWindow.loadFile(path.join(__dirname, "index.html"));
    revealWindow();
  } finally {
    clearTimeout(revealFallback);
  }
  app.on("activate", focusWindow);
  app.on("before-quit", () => {
    isQuitting = true;
    if (tray && !tray.isDestroyed()) tray.destroy();
  });
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

module.exports = { ALWAYS_ON_TOP_LEVEL, APP_TITLE, BRIDGE_REPOSITORY, BRIDGE_WORKSPACE_PATH, GOOGLE_PHOTOS_ALBUMS_URL, accessFailure, bridgeHeaders, enforceAlwaysOnTop, isElectronMainProcess, isGooglePhotosNavigation, keepWindowOnTop, mergeWorkspace, readBridgeWorkspace, validateAccessKey, workspacePayload, writeBridgeWorkspace };
