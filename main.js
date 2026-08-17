const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

require('./server.js'); 

let watchTimeout = null;

// 🧠 NUEVO: Obligamos a main.js a buscar la configuración en la carpeta correcta de Windows
const ROOT_DIR = app.getPath('userData');
const configPath = path.join(ROOT_DIR, 'config.json');

function registerShortcuts(win) {
  globalShortcut.unregisterAll(); // Limpia los viejos por si los cambiaste en la UI

  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.log("⚠️ Error leyendo config en main.js:", e.message);
      return; 
    }
  }

  const ttsSettings = config.tts || {};
  const keySkipCurrent = ttsSettings.keySkipCurrent || null;
  const keySkipAll = ttsSettings.keySkipAll || null;
  const keyToggleBot = ttsSettings.keyToggleBot || null;

  // Función segura para registrar teclas sin que crashee Electron
  const safeRegister = (key, actionName, callback) => {
    if (!key) return;
    try {
      globalShortcut.register(key, callback);
      console.log(`✅ [HOTKEY] Tecla vinculada: ${key} -> ${actionName}`);
    } catch (e) {
      console.log(`❌ [HOTKEY ERROR] No se pudo vincular la tecla "${key}". Asegúrate de que es válida.`);
    }
  };

  // 1. Saltar Comentario Actual
  safeRegister(keySkipCurrent, 'Omitir Actual', () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-skip-current'))");
  });

  // 2. Saltar Todos (Limpiar Cola)
  safeRegister(keySkipAll, 'Limpiar Cola', () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-skip-all'))");
  });

  // 3. Apagar / Encender Bot
  safeRegister(keyToggleBot, 'Toggle Bot', () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-toggle-bot'))");
  });
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "TikTok L4D2 Controller",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.webContents.openDevTools();

  // 🚀 CÁMBIO CLAVE: Detecta si la app está empaquetada o en desarrollo
  const isDev = !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173'); // ⚡ En desarrollo: Apunta a Vite para ver cambios al instante
  } else {
    win.loadURL('http://localhost:3000'); // 📦 En producción: Apunta al servidor Express local
  }

  // Registramos las teclas una vez la ventana existe
  win.webContents.on('did-finish-load', () => registerShortcuts(win));

  // Vigilar cambios en la ruta correcta con "Debounce"
  if (fs.existsSync(configPath)) {
    fs.watchFile(configPath, { interval: 1000 }, () => {
      registerShortcuts(win);
    });
  }
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