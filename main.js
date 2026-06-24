const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

require('./server.js'); 

let currentShortcuts = {};

function registerShortcuts(win) {
  globalShortcut.unregisterAll(); // Limpia los viejos por si los cambiaste en la UI

  const configPath = path.join(__dirname, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  const ttsSettings = config.tts || {};
  const keySkipCurrent = ttsSettings.keySkipCurrent || 'F9';
  const keySkipAll = ttsSettings.keySkipAll || 'F10';
  const keyToggleBot = ttsSettings.keyToggleBot || 'F11';

  // 1. Saltar Comentario Actual
  globalShortcut.register(keySkipCurrent, () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-skip-current'))");
  });

  // 2. Saltar Todos (Limpiar Cola)
  globalShortcut.register(keySkipAll, () => {
    if (win) win.webContents.executeJavaScript("window.dispatchEvent(new Event('tts-action-skip-all'))");
  });

  // 3. Apagar / Encender Bot
  globalShortcut.register(keyToggleBot, () => {
    console.log(`\n🛑 [ELECTRON] Tecla presionada: ${keyToggleBot} (Apagar/Encender Bot)`);
    console.log(`🛑 [ELECTRON] Enviando señal a React...`);
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
    }
  });

  win.loadURL('http://localhost:3000');

  // Registramos las teclas una vez la ventana existe
  registerShortcuts(win);

  // Vigilar si cambias las teclas para actualizarlas en vivo
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    fs.watchFile(configPath, () => { registerShortcuts(win); });
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