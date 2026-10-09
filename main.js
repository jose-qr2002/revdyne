const { app, BrowserWindow, globalShortcut, ipcMain, session, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const ICON_PATH = path.join(__dirname, 'build', 'icon.ico');
const APP_ICON = fs.existsSync(ICON_PATH) ? ICON_PATH : undefined;

// Si usas app.setPath('userData', ...), va AQUÍ, antes del candado.

const isDev = !app.isPackaged;
let APP_URL = isDev ? 'http://localhost:5173' : 'http://localhost:47321'; // el puerto real se fija tras arrancar el servidor (puede no ser el 3000)
const REVEAL_FALLBACK_MS = 25000; // si la interfaz no avisa en este tiempo, se muestra igual
const MAX_LOAD_RETRIES = 15;

let splash = null;
let mainWindow = null;
let revealed = false;
let revealTimer = null;
let bootStartedAt = 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let updateState = { status: 'idle' }; // idle | available | downloading | ready | error
let notifiedVersion = null;
let lastPercent = -1;

function sendUpdateState(next) {
  updateState = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-state', next);
  }
}

function setupAutoUpdates() {
  if (isDev) return; // en desarrollo no hay nada que actualizar

  autoUpdater.autoDownload = false;         // el usuario decide cuándo descargar
  autoUpdater.autoInstallOnAppQuit = false; // cerrar la app nunca instala nada

  autoUpdater.on('update-available', (info) => {
    if (updateState.status === 'downloading' || updateState.status === 'ready') return;
    if (info.version === notifiedVersion) return; // no repetir el aviso cada 4 horas
    notifiedVersion = info.version;
    sendUpdateState({ status: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => console.log('✅ [UPDATE] Ya tienes la última versión'));

  autoUpdater.on('download-progress', (p) => {
    const percent = Math.round(p.percent);
    if (percent === lastPercent) return;
    lastPercent = percent;
    sendUpdateState({ status: 'downloading', version: notifiedVersion, percent });
  });

  autoUpdater.on('error', (err) => {
    console.error('⚠️ [UPDATE]', err?.message || err);
    // Solo se avisa si el usuario estaba descargando; un fallo al buscar (sin internet) es silencioso
    if (updateState.status === 'downloading') {
      sendUpdateState({ status: 'error', version: notifiedVersion, message: 'La descarga falló. Inténtalo de nuevo.' });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`📦 [UPDATE] v${info.version} descargada, esperando que el usuario reinicie`);
    sendUpdateState({ status: 'ready', version: info.version });
  });

  const check = () => {
    if (updateState.status === 'downloading' || updateState.status === 'ready') return;
    autoUpdater.checkForUpdates().catch(() => {});
  };
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

ipcMain.on('download-update', () => {
  if (updateState.status === 'downloading' || updateState.status === 'ready') return;
  lastPercent = -1;
  sendUpdateState({ status: 'downloading', version: notifiedVersion, percent: 0 });
  autoUpdater.downloadUpdate().catch(() => {}); // el evento 'error' ya informa
});

ipcMain.on('install-update', () => {
  if (updateState.status !== 'ready') return;
  sendUpdateState({ status: 'installing', version: updateState.version });
  // Un respiro para que el aviso se pinte antes de cerrar la app
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 1200);
});

ipcMain.handle('get-update-state', () => updateState);

// ==========================================
// INSTANCIA ÚNICA
// Debe evaluarse ANTES de cargar server.js: la segunda copia no debe abrir
// otro servidor ni tocar los JSON. Tampoco toca disco: store y paths se cargan bajo demanda.
// ==========================================
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Si el usuario vuelve a abrir la app, se enfoca la que ya existe
    const win = revealed ? mainWindow : splash;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(boot);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

// ==========================================
// ARRANQUE: splash -> servidor -> ventana principal (oculta) -> revelar
// ==========================================
async function boot() {
  if (process.platform === 'win32') {
    let appId = 'com.jkrevil.revdyne';
    try { appId = require('./package.json').build?.appId || appId; } catch { /* usa el valor por defecto */ }
    app.setAppUserModelId(appId); // agrupa bien la ventana y conserva el icono al fijarla en la barra
  }
  bootStartedAt = Date.now();
  try {
    splash = createSplash();
    await new Promise(resolve => {
      splash.once('ready-to-show', () => { splash.show(); resolve(); });
      setTimeout(resolve, 1500); // por si acaso
    });
    await sleep(60); // deja que el splash pinte antes de bloquear el hilo principal

    registerTikTokLoginIpc();

    setSplashStatus('Iniciando el motor…');
    await sleep(60);
    const { ready } = require('./server.js'); // la carga es síncrona y pesada: por eso el splash ya está en pantalla
    const port = await ready;                 // si el 3000 está ocupado, el servidor usa otro puerto libre
    if (!isDev) APP_URL = `http://localhost:${port}`;
    console.log(`⏱️ [ARRANQUE] Servidor cargado en ${Date.now() - bootStartedAt} ms`);

    setSplashStatus('Cargando la interfaz…');
    createMainWindow();
  } catch (err) {
    console.error('🔥 [ARRANQUE] Error fatal:', err);
    dialog.showErrorBox('No se pudo iniciar', String(err?.stack || err));
    app.exit(1);
  }
}

function createSplash() {
  const win = new BrowserWindow({
    width: 420, height: 260,
    frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, center: true, show: false, icon: APP_ICON,
    backgroundColor: '#0f0f13',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, 'splash.html'), { query: { n: app.name, v: app.getVersion() } })
    .catch(() => {});
  win.on('closed', () => { splash = null; });
  return win;
}

function setSplashStatus(text) {
  if (!splash || splash.isDestroyed()) return;
  splash.webContents.executeJavaScript(`window.__setStatus(${JSON.stringify(text)})`).catch(() => {});
}

function createMainWindow() {
  const paths = require('./backend/paths');

  mainWindow = new BrowserWindow({
    width: 1100, height: 750,
    show: false, // se muestra cuando la interfaz avisa que ya cargó sus datos
    backgroundColor: '#0f0f13',
    title: app.name,
    icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  if (isDev) mainWindow.webContents.openDevTools();

  // La interfaz avisa por IPC cuando ya cargó su configuración (ver App.jsx)
  ipcMain.once('renderer-ready', revealMainWindow);
  revealTimer = setTimeout(revealMainWindow, REVEAL_FALLBACK_MS);

  let retries = 0;
  mainWindow.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = navegación cancelada, es normal
    if (retries++ < MAX_LOAD_RETRIES) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(APP_URL).catch(() => {});
      }, 700);
    } else {
      setSplashStatus('No se pudo cargar la interfaz');
    }
  });

  mainWindow.webContents.on('did-finish-load', () => registerShortcuts(mainWindow));
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL(APP_URL).catch(() => {});

  // bootstrap.js (cargado con server.js) ya garantiza que config.json existe
  fs.watchFile(paths.CONFIG_FILE, { interval: 1000 }, () => registerShortcuts(mainWindow));
}

function revealMainWindow() {
  if (revealed) return;
  revealed = true;
  clearTimeout(revealTimer);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  // Primero se muestra la principal y luego se cierra el splash: nunca hay un instante sin ventana
  if (splash && !splash.isDestroyed()) splash.close();

  console.log(`⏱️ [ARRANQUE] Interfaz lista en ${Date.now() - bootStartedAt} ms`);
  setupAutoUpdates();
}

// ==========================================
// ATAJOS GLOBALES
// ==========================================
function registerShortcuts(win) {
  globalShortcut.unregisterAll();

  const store = require('./backend/data/store');
  const tts = store.loadSettings().tts || {};

  const fire = (eventName) => {
    if (win && !win.isDestroyed()) {
      win.webContents.executeJavaScript(`window.dispatchEvent(new Event('${eventName}'))`).catch(() => {});
    }
  };

  const safeRegister = (key, label, eventName) => {
    if (!key) return;
    try {
      globalShortcut.register(key, () => fire(eventName));
      console.log(`✅ [HOTKEY] Tecla vinculada: ${key} -> ${label}`);
    } catch (e) {
      console.log(`❌ [HOTKEY ERROR] No se pudo vincular la tecla "${key}". Asegúrate de que es válida.`);
    }
  };

  safeRegister(tts.keySkipCurrent, 'Omitir Actual', 'tts-action-skip-current');
  safeRegister(tts.keySkipAll, 'Limpiar Cola', 'tts-action-skip-all');
  safeRegister(tts.keyToggleBot, 'Toggle Bot', 'tts-action-toggle-bot');
}

// ==========================================
// AUTENTICACIÓN DE TIKTOK (catálogo de stickers)
// ==========================================
function registerTikTokLoginIpc() {
  ipcMain.on('open-tiktok-login', (event) => {
    const store = require('./backend/data/store');
    const authSession = session.fromPartition('persist:tiktok-auth');

    const loginWin = new BrowserWindow({
      width: 480, height: 720,
      title: 'Inicia sesión en TikTok (con cualquier cuenta)',
      icon: APP_ICON,
      autoHideMenuBar: true,
      webPreferences: { session: authSession, nodeIntegration: false, contextIsolation: true }
    });
    loginWin.loadURL('https://www.tiktok.com/login');

    let done = false;
    const checkForSession = async () => {
      if (done || loginWin.isDestroyed()) return;
      try {
        const sessionCookies = await authSession.cookies.get({ domain: '.tiktok.com', name: 'sessionid' });
        if (sessionCookies.length === 0) return;

        const idcCookies = await authSession.cookies.get({ domain: '.tiktok.com', name: 'tt-target-idc' });

        done = true;
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
}