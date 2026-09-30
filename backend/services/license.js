const crypto = require('crypto');
const fs = require('fs');
const { machineIdSync } = require('node-machine-id');
const paths = require('../paths');
const { version: APP_VERSION } = require('../../package.json');

const LICENSE_SERVER = 'https://api.reveljk.com';
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA+NE6Bx0HBH1j9ffs/ZtFNmeFZ2DV2yOzKbDXNf9jMic=
-----END PUBLIC KEY-----`;

const GRACE_SEC = 7 * 24 * 3600;       // margen extra si no hay internet
const REFRESH_EVERY_MS = 12 * 3600 * 1000;

const MESSAGES = {
  INVALID_CODE: 'El código no es válido.',
  REVOKED: 'Este código fue revocado.',
  EXPIRED: 'Este código ya venció.',
  DEVICE_LIMIT: 'Este código ya está en uso en el máximo de equipos permitidos.',
  NOT_ACTIVATED: 'Este equipo ya no está activado.',
  NETWORK: 'No se pudo contactar al servidor de licencias. Revisa tu conexión.',
  BAD_REQUEST: 'Solicitud inválida.',
};
const licenseError = (code) => Object.assign(new Error(MESSAGES[code] || 'Error de licencia.'), { code });
const nowSec = () => Math.floor(Date.now() / 1000);

let publicKey = null;
function getPublicKey() {
  if (!publicKey) publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
  return publicKey;
}

let machine = null;
function getMachine() {
  if (!machine) machine = crypto.createHash('sha256').update('revdyne:' + machineIdSync(true)).digest('hex');
  return machine;
}

const readFile = () => { try { return JSON.parse(fs.readFileSync(paths.LICENSE_FILE, 'utf8')); } catch { return null; } };
const writeFile = (obj) => fs.writeFileSync(paths.LICENSE_FILE, JSON.stringify(obj));
const clearFile = () => { try { fs.unlinkSync(paths.LICENSE_FILE); } catch { /* no existía */ } };

function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    if (!crypto.verify(null, Buffer.from(body), getPublicKey(), Buffer.from(sig, 'base64url'))) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch { return null; } // incluye una llave pública sin configurar: queda en plan gratis
}

function evaluate() {
  const file = readFile();
  const p = file?.token && verifyToken(file.token);
  if (!p || p.v !== 1 || p.mid !== getMachine()) return null;

  const now = nowSec();
  if (file.lastSeen && now < file.lastSeen - 86400) return null; // reloj atrasado para estirar el permiso
  if (p.lexp && now >= p.lexp) return null;                      // licencia vencida
  if (now >= p.exp + GRACE_SEC) return null;                     // sin renovar por demasiado tiempo

  if (now - (file.lastSeen || 0) > 3600) writeFile({ ...file, lastSeen: now });
  return p;
}

let memo = { at: 0, payload: null };
function current() {
  if (Date.now() - memo.at < 30000) return memo.payload; // evita leer disco en cada evento
  memo = { at: Date.now(), payload: evaluate() };
  return memo.payload;
}
const invalidate = () => { memo.at = 0; };

async function post(path, body) {
  let res;
  try {
    res = await fetch(LICENSE_SERVER + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
  } catch { throw licenseError('NETWORK'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw licenseError(data.code || 'BAD_REQUEST');
  return data;
}

async function activate(code) {
  const data = await post('/v1/activate', { code, machine: getMachine(), appVersion: APP_VERSION });
  if (!verifyToken(data.token)) throw licenseError('BAD_REQUEST');
  writeFile({ token: data.token, lastSeen: nowSec() });
  invalidate();
}

async function refresh() {
  const p = verifyToken(readFile()?.token);
  if (!p) return;
  try {
    const data = await post('/v1/refresh', { licenseId: p.lid, machine: getMachine(), appVersion: APP_VERSION });
    if (verifyToken(data.token)) { writeFile({ token: data.token, lastSeen: nowSec() }); invalidate(); }
  } catch (e) {
    if (['REVOKED', 'EXPIRED', 'NOT_ACTIVATED', 'INVALID_CODE'].includes(e.code)) {
      console.warn(`🔒 [LICENCIA] ${e.message} Se vuelve al plan gratuito.`);
      clearFile(); invalidate();
    }
    // errores de red: se sigue con el permiso actual hasta que venza
  }
}

async function deactivate() {
  const p = verifyToken(readFile()?.token);
  if (p) { try { await post('/v1/deactivate', { licenseId: p.lid, machine: getMachine() }); } catch { /* igual se borra local */ } }
  clearFile(); invalidate();
}

function startRefreshLoop() {
  setTimeout(() => refresh(), 10000);       // no compite con el arranque
  setInterval(() => refresh(), REFRESH_EVERY_MS);
}

const getTier = () => (current()?.tier === 'pro' ? 'pro' : 'free');

function getStatus() {
  const p = current();
  return { tier: getTier(), licenseId: p?.lid || null, expiresAt: p?.lexp || null, device: getMachine().slice(0, 8) };
}

module.exports = { activate, deactivate, refresh, startRefreshLoop, getTier, getStatus };