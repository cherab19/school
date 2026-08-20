const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  dbLoad: () => ipcRenderer.invoke('db-load'),
  dbSave: (arrayBuffer) => ipcRenderer.invoke('db-save', arrayBuffer),
  dbCreateBackup: (arrayBuffer, customPath) => ipcRenderer.invoke('db-create-backup', arrayBuffer, customPath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  readExternalFile: (filePath) => ipcRenderer.invoke('read-external-file', filePath),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  loadWasm: () => ipcRenderer.invoke('load-wasm'),
  logError: (message) => ipcRenderer.send('log-error', message)
});
