const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("magicus", {
  validateAccess: (accessKey) => ipcRenderer.invoke("magicus:validate-access", { accessKey }),
  loadWorkspace: () => ipcRenderer.invoke("magicus:workspace-load"),
  saveWorkspace: (workspace) => ipcRenderer.invoke("magicus:workspace-save", workspace),
  launchApp: (app) => ipcRenderer.invoke("magicus:launch-app", app),
  selectAssets: () => ipcRenderer.invoke("magicus:assets-select"),
  importDroppedAssets: (files) => ipcRenderer.invoke("magicus:assets-import", files.map((file) => webUtils.getPathForFile(file))),
  loadAssets: () => ipcRenderer.invoke("magicus:assets-list"),
  deleteAsset: (id) => ipcRenderer.invoke("magicus:asset-delete", id),
});
