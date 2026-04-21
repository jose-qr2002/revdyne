const { app, BrowserWindow } = require('electron');
const path = require('path');

// 1. INICIAMOS TU SERVIDOR BACKEND MÁGICAMENTE
require('./server.js'); 

function createWindow () {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "TikTok L4D2 Controller",
    autoHideMenuBar: true, // Oculta la barra fea de "Archivo, Editar, Ver..."
    webPreferences: {
      nodeIntegration: true,
    }
  });

  // Cargamos el puerto donde está corriendo tu server.js
  win.loadURL('http://localhost:3000');

  // 🔥 NUEVO: Esto abrirá la consola de desarrollador de Chrome dentro de tu app
  //win.webContents.openDevTools();
}

// Cuando Electron esté listo, abre la ventana
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});