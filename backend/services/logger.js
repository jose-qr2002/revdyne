// backend/services/logger.js
// Registro persistente de avisos y errores para diagnosticar la app (regalos perdidos, conexión caída...).
// Un archivo de texto en AppData\Roaming\Revdyne\logs, con rotación por tamaño. Nunca debe lanzar un error ni
// frenar la app: si no se puede escribir, se ignora en silencio.
//
// Niveles: info / warn / error siempre se guardan; debug solo si se activa el "registro detallado".
// Privacidad: aquí solo van ids de regalo, conteos y el @usuario de quien envía; nunca tokens ni cookies.
const fs = require('fs');
const path = require('path');

const DEFAULTS = { maxBytes: 2 * 1024 * 1024, keep: 3, spamWindowMs: 5000, maxDataChars: 700 };

const pad = (n, w = 2) => String(n).padStart(w, '0');
function timestamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatData(data, maxChars) {
  if (data === undefined || data === null || data === '') return '';
  let text;
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    text = String(data);
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function createLogger(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const file = opts.file;
  const dir = path.dirname(file);
  let size = 0;
  let debugEnabled = !!opts.debug;
  const recent = new Map(); // anti-repetición: clave -> { at, count, timer }

  try { fs.mkdirSync(dir, { recursive: true }); size = fs.existsSync(file) ? fs.statSync(file).size : 0; } catch { /* sin logs */ }

  // Rotación: revdyne.log -> revdyne.1.log -> revdyne.2.log (el más viejo se descarta)
  function rotate() {
    try {
      const ext = path.extname(file);
      const base = file.slice(0, file.length - ext.length);
      const at = (i) => (i === 0 ? file : `${base}.${i}${ext}`);
      const last = at(opts.keep - 1);
      if (fs.existsSync(last)) fs.unlinkSync(last);
      for (let i = opts.keep - 2; i >= 0; i--) if (fs.existsSync(at(i))) fs.renameSync(at(i), at(i + 1));
      size = 0;
    } catch { /* si no se puede rotar, se sigue escribiendo en el mismo archivo */ }
  }

  // Escritura síncrona a propósito: el volumen es bajo y así no se pierde nada si la app se cae justo después.
  function writeRaw(line) {
    try {
      if (size + line.length > opts.maxBytes) rotate();
      fs.appendFileSync(file, line);
      size += Buffer.byteLength(line);
    } catch { /* nunca romper la app por el log */ }
  }

  function write(level, category, message, data) {
    try {
      if (level === 'DEBUG' && !debugEnabled) return;

      // Un mismo mensaje CON LOS MISMOS DATOS repetido en pocos segundos se resume en una sola línea.
      // Si los datos cambian (p. ej. dos regalos distintos) cada uno se escribe: son justo lo que sirve para diagnosticar.
      const extra = formatData(data, opts.maxDataChars);
      const key = `${level}|${category}|${message}|${extra}`;
      const now = Date.now();
      const prev = recent.get(key);
      if (prev && now - prev.at < opts.spamWindowMs) {
        prev.count++;
        if (!prev.timer) {
          prev.timer = setTimeout(() => {
            if (prev.count) writeRaw(`${timestamp()} [${level}] [${category}] ${message}${extra ? ` ${extra}` : ''} (repetido ${prev.count} veces más)\n`);
            prev.count = 0; prev.timer = null;
          }, opts.spamWindowMs);
          if (prev.timer.unref) prev.timer.unref();
        }
        return;
      }
      if (recent.size > 500) recent.clear();
      recent.set(key, { at: now, count: 0, timer: prev?.timer || null });

      writeRaw(`${timestamp()} [${level}] [${category}] ${message}${extra ? ` ${extra}` : ''}\n`);
    } catch { /* ignorar */ }
  }

  // Últimas `lines` líneas del archivo actual (lee solo el final para no cargar todo el log)
  function tail(lines = 200) {
    try {
      const fd = fs.openSync(file, 'r');
      try {
        const { size: total } = fs.fstatSync(fd);
        const len = Math.min(total, 256 * 1024);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, total - len);
        const all = buf.toString('utf8').split('\n').filter(Boolean);
        if (len < total) all.shift(); // la primera línea puede venir cortada
        return all.slice(-lines);
      } finally { fs.closeSync(fd); }
    } catch { return []; }
  }

  return {
    file, dir,
    debug: (cat, msg, data) => write('DEBUG', cat, msg, data),
    info: (cat, msg, data) => write('INFO', cat, msg, data),
    warn: (cat, msg, data) => write('WARN', cat, msg, data),
    error: (cat, msg, data) => write('ERROR', cat, msg, data),
    setDebug: (on) => { debugEnabled = !!on; },
    isDebug: () => debugEnabled,
    size: () => size,
    tail,
  };
}

// Instancia de la app. paths.js asegura que la carpeta existe en AppData (no en la instalación ni en Documentos).
let appLogger = null;
function getAppLogger() {
  if (!appLogger) {
    const paths = require('../paths');
    appLogger = createLogger({ file: paths.LOG_FILE });
  }
  return appLogger;
}

// Atajos para no repetir getAppLogger() en cada archivo
const proxy = {};
for (const method of ['debug', 'info', 'warn', 'error', 'setDebug', 'isDebug', 'size', 'tail']) {
  proxy[method] = (...args) => getAppLogger()[method](...args);
}
Object.defineProperty(proxy, 'file', { get: () => getAppLogger().file });
Object.defineProperty(proxy, 'dir', { get: () => getAppLogger().dir });

// OJO: no usar { ...proxy }: el spread solo copia propiedades enumerables y descarta los getters `file` y `dir`.
module.exports = Object.assign(proxy, { createLogger });
