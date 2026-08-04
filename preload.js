const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("magicus", {
  validateAccess: (accessKey) => ipcRenderer.invoke("magicus:validate-access", { accessKey }),
  loadRememberedAccess: () => ipcRenderer.invoke("magicus:access-load"),
  rememberAccess: (credentials) => ipcRenderer.invoke("magicus:access-save", credentials),
  forgetAccess: () => ipcRenderer.invoke("magicus:access-clear"),
  loadWorkspace: () => ipcRenderer.invoke("magicus:workspace-load"),
  saveWorkspace: (workspace) => ipcRenderer.invoke("magicus:workspace-save", workspace),
  launchApp: (app) => ipcRenderer.invoke("magicus:launch-app", app),
  openGooglePhotos: () => ipcRenderer.invoke("magicus:google-photos-open"),
  selectAssets: () => ipcRenderer.invoke("magicus:assets-select"),
  importDroppedAssets: (files) => ipcRenderer.invoke("magicus:assets-import", files.map((file) => webUtils.getPathForFile(file))),
  loadAssets: () => ipcRenderer.invoke("magicus:assets-list"),
  deleteAsset: (id) => ipcRenderer.invoke("magicus:asset-delete", id),
});
