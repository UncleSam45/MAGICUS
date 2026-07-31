const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("magicus", {
  validateAccess: (accessKey) => ipcRenderer.invoke("magicus:validate-access", { accessKey }),
});
