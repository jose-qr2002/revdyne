const { ipcMain, app, BrowserWindow, globalShortcut, session } = require('electron');
const fs = require('fs');

require('./server.js');

const paths = require('./backend/paths');
const store = require('./backend/data/store');

function registerShortcuts(win) {
  globalShortcut.unregisterAll();

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

  fs.watchFile(paths.CONFIG_FILE, { interval: 1000 }, () => {
    registerShortcuts(win);
  });
}

// ==========================================
// AUTENTICACIÓN DE TIKTOK (para el catálogo de stickers)
// ==========================================
ipcMain.on('open-tiktok-login', (event) => {
  const authSession = session.fromPartition('persist:tiktok-auth');

  const loginWin = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'Inicia sesión en TikTok (con cualquier cuenta)',
    autoHideMenuBar: true,
    webPreferences: { session: authSession, nodeIntegration: false, contextIsolation: true }
  });

  loginWin.loadURL('https://www.tiktok.com/login');

  const checkForSession = async () => {
    try {
      const sessionCookies = await authSession.cookies.get({ domain: '.tiktok.com', name: 'sessionid' });
      if (sessionCookies.length === 0) return;

      const idcCookies = await authSession.cookies.get({ domain: '.tiktok.com', name: 'tt-target-idc' });

      const settings = store.loadSettings();
      settings.tiktokAuth = {
        sessionId: sessionCookies[0].value,
        ttTargetIdc: idcCookies[0]?.value || null
      };
      store.saveSettings(settings);

      event.reply('tiktok-login-success');
      loginWin.close();
    } catch (e) {
      console.error('Error verificando sesión de TikTok:', e.message);
    }
  };

  loginWin.webContents.on('did-navigate', checkForSession);
  const poller = setInterval(checkForSession, 1500);
  loginWin.on('closed', () => clearInterval(poller));
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});