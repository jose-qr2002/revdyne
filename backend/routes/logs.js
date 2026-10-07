// backend/routes/logs.js
// Consulta del registro de avisos y errores (revdyne.log) desde el panel.
const express = require('express');
const fs = require('fs');
const { spawn } = require('child_process');
const logger = require('../services/logger');
const store = require('../data/store');

module.exports = function logsRoutes(settings) {
  const router = express.Router();

  // Últimas líneas del registro. ?n=cantidad (máx. 500) y ?solo=problemas para ver solo avisos y errores.
  router.get('/', (req, res) => {
    const n = Math.min(500, Math.max(10, parseInt(req.query.n, 10) || 200));
    let lines = logger.tail(req.query.solo === 'problemas' ? 2000 : n);
    if (req.query.solo === 'problemas') lines = lines.filter(l => l.includes('[WARN]') || l.includes('[ERROR]')).slice(-n);
    res.json({ file: logger.file, dir: logger.dir, sizeBytes: logger.size(), debug: logger.isDebug(), lines });
  });

  // Registro detallado: además de avisos y errores, guarda cada regalo recibido (útil para diagnosticar una sesión).
  router.post('/debug', (req, res) => {
    const enabled = !!req.body?.enabled;
    logger.setDebug(enabled);
    const current = store.loadSettings();
    current.logDebug = enabled;
    store.saveSettings(current);
    Object.assign(settings, current);
    logger.info('app', enabled ? 'Registro detallado ACTIVADO' : 'Registro detallado desactivado');
    res.json({ ok: true, debug: enabled });
  });

  // Muestra el archivo del registro en el Explorador (carpeta abierta con revdyne.log seleccionado).
  // Se prueba en este orden y se devuelve cuál funcionó o por qué falló, para no fallar en silencio.
  router.post('/open', async (req, res) => {
    const file = logger.file;
    const dir = logger.dir;
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* si no se puede crear, abajo fallará con un motivo claro */ }
    const attempts = [];

    // 1) Dentro de Electron: showItemInFolder abre la carpeta con el archivo marcado y suele traer la ventana al frente
    let shell = null;
    try { shell = require('electron').shell; } catch { /* node puro, sin Electron */ }
    if (shell?.showItemInFolder && fs.existsSync(file)) {
      try { shell.showItemInFolder(file); return res.json({ ok: true, method: 'electron', file, dir }); } catch (e) { attempts.push(`showItemInFolder: ${e.message}`); }
    }
    if (shell?.openPath) {
      try {
        const err = await shell.openPath(dir); // devuelve '' si salió bien, o el texto del error
        if (!err) return res.json({ ok: true, method: 'electron-openPath', file, dir });
        attempts.push(`openPath: ${err}`);
      } catch (e) { attempts.push(`openPath: ${e.message}`); }
    }

    // 2) Fuera de Electron (npm run dev) en Windows: Explorador con el archivo seleccionado
    if (process.platform === 'win32') {
      try {
        const child = spawn('explorer.exe', [`/select,"${file}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
        child.on('error', (e) => logger.warn('app', 'No se pudo lanzar el Explorador', { error: e.message }));
        child.unref();
        return res.json({ ok: true, method: 'explorer', file, dir });
      } catch (e) { attempts.push(`explorer: ${e.message}`); }
    }

    logger.warn('app', 'No se pudo abrir la carpeta de logs', { intentos: attempts, dir });
    res.json({ ok: false, file, dir, error: attempts.join(' | ') || 'Este sistema no permite abrir carpetas desde la app' });
  });

  return router;
};
