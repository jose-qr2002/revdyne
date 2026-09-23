const { app, BrowserWindow, globalShortcut } = require('electron');
const fs = require('fs');

require('./server.js');

const paths = require('./backend/paths');
const store = require('./backend/data/store');

function registerShortcuts(win) {
  globalShortcut.unregisterAll(); // Limpia los viejos por si los cambiaste en la UI

  const settings = store.loadSettings();
  const ttsSettings = settings.tts || {};
  const keySkipCurrent = ttsSettings.keySkipCurrent || null;
  const keySkipAll = ttsSettings.keySkipAll || null;
  const keyToggleBot = ttsSettings.keyToggleBot || null;

  const safeRegister = (key, actionName, callback) => {
    if (!key) return;
    try {
      globalShortcut.register(key, callback);
      console.log(`✅ [HOTKEY] Tecla vinculada: ${key} -> ${actionName}`);
    } catch (e) {
      console.log(`❌ [HOTKEY ERROR] No se pudo vincular la tecla "${key}". Asegúrate de que es válida.`);
    }
  };

  safeRegister(keySkipCurrent, 'Omitir Actual', () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-skip-current'))");
  });

  safeRegister(keySkipAll, 'Limpiar Cola', () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-skip-all'))");
  });

  safeRegister(keyToggleBot, 'Toggle Bot', () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-toggle-bot'))");
  });
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "REVINITY",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.webContents.openDevTools();

  const isDev = !app.isPackaged;
  win.loadURL(isDev ? 'http://localhost:5173' : 'http://localhost:3000');

  win.webContents.on('did-finish-load', () => registerShortcuts(win));

  // bootstrap.js (disparado por require('./server.js') arriba) ya garantiza
  // que config.json existe antes de llegar aquí, así que no hace falta
  // comprobar fs.existsSync antes de vigilarlo.
  fs.watchFile(paths.CONFIG_FILE, { interval: 1000 }, () => {
    registerShortcuts(win);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});