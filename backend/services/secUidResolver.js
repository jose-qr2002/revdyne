const store = require('../data/store');
const { findSecUidDeep } = require('./secUidUtils');

let electron = null;
try { electron = require('electron'); } catch { /* node puro, sin Electron */ }

const HIDDEN_TIMEOUT_MS = 20000;
const PREVIEW_TIMEOUT_MS = 12000;
const VISIBLE_TIMEOUT_MS = 90000; // margen para resolver un CAPTCHA
const POLL_MS = 800;
const PREVIEW_TTL_MS = 60 * 60 * 1000; // las URLs de avatar traen x-expires, no conviene guardarlas mucho
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9_.]{2,24}$/;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const normalize = (u) => String(u || '').replace(/^@/, '').trim().toLowerCase();
const fail = (code, message) => Object.assign(new Error(message), { code });

// Una sola ventana a la vez: dos búsquedas nunca abren dos navegadores en paralelo
let chain = Promise.resolve();
function runExclusive(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

// ---- Caché persistente del secUid (nunca cambia para una cuenta) ----
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

// ---- Lectura del bloque embebido, SOLO del perfil visitado (no de app-context, que es tu cuenta) ----
function extractProfileUser(rawJson, expectedUsername) {
  const detail = JSON.parse(rawJson)?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
  if (!detail) return null; // el desafío anti-bot aún no terminó

  if (detail.statusCode === 10221) {
    throw fail('USER_NOT_FOUND', `El usuario @${expectedUsername} no existe en TikTok`);
  }

  const user = detail.userInfo?.user;
  if (user?.secUid && normalize(user.uniqueId) === expectedUsername) return user;

  const secUid = findSecUidDeep(detail); // respaldo, limitado al bloque del perfil
  return secUid ? { secUid, uniqueId: expectedUsername } : null;
}

async function tryWindow(username, { visible, timeoutMs }) {
  const { BrowserWindow, session } = electron;
  const authSession = session.fromPartition('persist:tiktok-auth');

  const win = new BrowserWindow({
    show: visible, width: 900, height: 700, autoHideMenuBar: true,
    title: 'Verificación de TikTok',
    webPreferences: { session: authSession, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
  });
  win.webContents.setUserAgent(authSession.getUserAgent().replace(/\s(Electron|revdyne)\/\S+/gi, ''));

  try {
    win.loadURL(`https://www.tiktok.com/@${encodeURIComponent(username)}`).catch(() => {});

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !win.isDestroyed()) {
      try {
        const raw = await win.webContents.executeJavaScript(
          `(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__') || {}).textContent || null`
        );
        if (raw) {
          const user = extractProfileUser(raw, username);
          if (user) return user;
        }
      } catch (e) {
        if (e.code === 'USER_NOT_FOUND') throw e; // reintentar no tiene sentido
        /* lo demás: la página está navegando o el desafío sigue corriendo */
      }
      await sleep(POLL_MS);
    }
    return null;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// allowVisible=false: para la vista previa. Nunca debe abrirse una ventana por un simple avatar.
async function resolveUser(username, { allowVisible = true } = {}) {
  if (!electron?.BrowserWindow) throw fail('UNAVAILABLE', 'Solo funciona dentro de la app de escritorio');

  console.log(`🔎 [PERFIL] Resolviendo @${username}...`);
  let user = await tryWindow(username, {
    visible: false,
    timeoutMs: allowVisible ? HIDDEN_TIMEOUT_MS : PREVIEW_TIMEOUT_MS
  });

  if (!user && allowVisible) {
    console.warn('⚠️ [PERFIL] Ventana oculta sin resultado, reintentando visible por si hay un CAPTCHA...');
    user = await tryWindow(username, { visible: true, timeoutMs: VISIBLE_TIMEOUT_MS });
  }

  if (!user) throw fail('BLOCKED', `No se pudo obtener el perfil de @${username}`);
  return user;
}

// ---- Vista previa (avatar + nombre) para el Sidebar ----
const previewCache = new Map(); // username -> { info | null, at }
const inflight = new Map();     // username -> Promise
let latestPreview = null;

function toProfileInfo(user, fallbackUsername) {
  return {
    uniqueId: user.uniqueId || fallbackUsername,
    nickname: user.nickname || user.nickName || null,
    avatar: user.avatarMedium || user.avatarLarger || user.avatarThumb || null,
    verified: !!user.verified
  };
}

function getProfilePreview(username) {
  const clean = normalize(username);
  if (!USERNAME_RE.test(clean)) return Promise.resolve({ found: false, code: 'INVALID' });

  const hit = previewCache.get(clean);
  if (hit && Date.now() - hit.at < (hit.info ? PREVIEW_TTL_MS : NEGATIVE_TTL_MS)) {
    return Promise.resolve(hit.info ? { found: true, profile: hit.info } : { found: false, code: 'NOT_FOUND' });
  }

  latestPreview = clean;
  if (inflight.has(clean)) return inflight.get(clean);

  const job = (async () => {
    try {
      const user = await runExclusive(() => {
        // Si mientras esperaba turno ya escribiste otro nombre, ni siquiera abre la ventana
        if (latestPreview !== clean) throw fail('SUPERSEDED', 'reemplazada por una búsqueda más reciente');
        return resolveUser(clean, { allowVisible: false });
      });
      if (user.secUid) saveSecUid(clean, user.secUid); // de paso, deja listo el secUid para los stickers
      const info = toProfileInfo(user, clean);
      previewCache.set(clean, { info, at: Date.now() });
      return { found: true, profile: info };
    } catch (e) {
      if (e.code === 'USER_NOT_FOUND') {
        previewCache.set(clean, { info: null, at: Date.now() });
        return { found: false, code: 'NOT_FOUND' };
      }
      return { found: false, code: e.code || 'ERROR' }; // los fallos temporales no se cachean
    } finally {
      inflight.delete(clean);
    }
  })();

  inflight.set(clean, job);
  return job;
}

// Orden para stickers: directo en vivo -> caché -> ventana
async function getSecUid(username, liveSecUid = null) {
  const clean = normalize(username);
  if (!clean) throw new Error('No hay un usuario de TikTok configurado en Ajustes');

  if (liveSecUid) { saveSecUid(clean, liveSecUid); return liveSecUid; }

  const cached = getCachedSecUid(clean);
  if (cached) return cached;

  const user = await runExclusive(() => resolveUser(clean));
  saveSecUid(clean, user.secUid);
  return user.secUid;
}

module.exports = { getSecUid, saveSecUid, getCachedSecUid, getProfilePreview };