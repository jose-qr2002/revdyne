const store = require('../data/store');
const { findSecUidDeep } = require('./secUidUtils');

let electron = null;
try { electron = require('electron'); } catch { /* corriendo con node puro, sin Electron */ }

const HIDDEN_TIMEOUT_MS = 20000;
const VISIBLE_TIMEOUT_MS = 90000; // margen para que el usuario resuelva un CAPTCHA
const POLL_MS = 800;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const normalize = (u) => String(u || '').replace(/^@/, '').trim().toLowerCase();

// ---- Caché: el secUid de una cuenta nunca cambia, se resuelve una sola vez ----
function getCachedSecUid(username) {
  return store.loadSettings().secUidCache?.[normalize(username)] || null;
}

function saveSecUid(username, secUid) {
  const key = normalize(username);
  if (!key || !secUid) return;
  const settings = store.loadSettings();
  settings.secUidCache = settings.secUidCache || {};
  if (settings.secUidCache[key] === secUid) return;
  settings.secUidCache[key] = secUid;
  store.saveSettings(settings);
}

function extractProfileSecUid(rawJson, expectedUsername) {
  const data = JSON.parse(rawJson);
  const detail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
  if (!detail) return null; // el desafío aún no terminó, se reintenta

  if (detail.statusCode === 10221) {
    const err = new Error(`El usuario @${expectedUsername} no existe en TikTok`);
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const user = detail.userInfo?.user;
  if (user?.secUid && normalize(user.uniqueId) === expectedUsername) return user.secUid;

  return findSecUidDeep(detail);
}

async function tryWindow(username, { visible, timeoutMs }) {
  const { BrowserWindow, session } = electron;
  const authSession = session.fromPartition('persist:tiktok-auth'); // misma sesión ya logueada

  const win = new BrowserWindow({
    show: visible,
    width: 900,
    height: 700,
    autoHideMenuBar: true,
    title: 'Verificación de TikTok',
    webPreferences: {
      session: authSession,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  // Quita "Electron/x" y el nombre de la app del User-Agent: se ve como un Chrome normal
  win.webContents.setUserAgent(authSession.getUserAgent().replace(/\s(Electron|revinity)\/\S+/gi, ''));

  try {
    // El desafío anti-bot recarga la página; loadURL puede rechazar con ERR_ABORTED y es normal
    win.loadURL(`https://www.tiktok.com/@${encodeURIComponent(username)}`).catch(() => {});

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !win.isDestroyed()) {
      try {
        const raw = await win.webContents.executeJavaScript(
          `(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__') || {}).textContent || null`
        );
        if (raw) {
          const secUid = extractProfileSecUid(raw, username);
          if (secUid) return secUid;
        }
      } catch (e) {
        if (e.code === 'USER_NOT_FOUND') throw e; // no tiene sentido reintentar
        /* lo demás: la página está navegando, se reintenta */
      }
      await sleep(POLL_MS);
    }
    return null;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function resolveSecUid(username) {
  const clean = normalize(username);
  if (!clean) throw new Error('No hay un usuario de TikTok configurado en Ajustes');
  if (!electron?.BrowserWindow) throw new Error('Resolver el perfil solo funciona dentro de la app de escritorio');

  console.log(`🔎 [SECUID] Resolviendo @${clean} con ventana oculta...`);
  let secUid = await tryWindow(clean, { visible: false, timeoutMs: HIDDEN_TIMEOUT_MS });

  if (!secUid) {
    console.warn('⚠️ [SECUID] La ventana oculta no llegó al perfil, reintentando visible por si TikTok pide un CAPTCHA...');
    secUid = await tryWindow(clean, { visible: true, timeoutMs: VISIBLE_TIMEOUT_MS });
  }

  if (!secUid) throw new Error(`No se pudo obtener el perfil de @${clean}`);
  console.log(`✅ [SECUID] @${clean} resuelto`);
  return secUid;
}

// Orden: directo en vivo -> caché -> ventana
async function getSecUid(username, liveSecUid = null) {
  if (liveSecUid) { saveSecUid(username, liveSecUid); return liveSecUid; }

  const cached = getCachedSecUid(username);
  if (cached) return cached;

  const resolved = await resolveSecUid(username);
  saveSecUid(username, resolved);
  return resolved;
}

module.exports = { getSecUid, saveSecUid, getCachedSecUid };