const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/logo.png'),
    show: false
  });

  // Check if we are in development
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper: Get standard database path
function getDbPath() {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, 'sabyan_school.db');
}

// Helper: Get automatic backups path
function getBackupDir() {
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'auto_backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

// IPC Handlers
ipcMain.handle('db-load', async () => {
  try {
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath);
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    return null;
  } catch (error) {
    console.error('Failed to load database:', error);
    throw error;
  }
});

ipcMain.handle('db-save', async (event, arrayBuffer) => {
  try {
    const dbPath = getDbPath();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(dbPath, buffer);
    return true;
  } catch (error) {
    console.error('Failed to save database:', error);
    throw error;
  }
});

ipcMain.handle('db-create-backup', async (event, arrayBuffer, customPath = null) => {
  try {
    let destPath = customPath;
    if (!destPath) {
      // Auto backup
      const backupDir = getBackupDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      destPath = path.join(backupDir, `sabyan_backup_${timestamp}.db`);

      // Clean up old backups (keep maximum 10)
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('sabyan_backup_') && f.endsWith('.db'))
        .map(f => ({ name: f, path: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length >= 10) {
        for (let i = 9; i < files.length; i++) {
          try {
            fs.unlinkSync(files[i].path);
          } catch (e) {
            console.error('Failed to delete old backup:', e);
          }
        }
      }
    }

    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);
    return destPath;
  } catch (error) {
    console.error('Failed to create backup:', error);
    throw error;
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Database Files', extensions: ['db'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-external-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } catch (error) {
    console.error('Failed to read external file:', error);
    throw error;
  }
});

ipcMain.handle('save-file-dialog', async (event, { defaultName, filters, arrayBuffer }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters
  });
  if (result.canceled) return null;

  try {
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(result.filePath, buffer);
    return result.filePath;
  } catch (error) {
    console.error('Failed to save file:', error);
    throw error;
  }
});

ipcMain.handle('load-wasm', async () => {
  try {
    const wasmPath = path.join(__dirname, 'sql-wasm-browser.wasm');
    const data = fs.readFileSync(wasmPath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } catch (error) {
    console.error('Failed to load wasm binary:', error);
    throw error;
  }
});

// Logs errors
ipcMain.on('log-error', (event, message) => {
  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, 'error.log');
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
});
