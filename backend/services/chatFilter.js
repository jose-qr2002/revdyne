const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

// Deja el texto en una forma "comparable": sin acentos, sin fuentes raras,
// números por letras, h muda fuera, v=b, k=c. Los términos pasan por lo mismo.
function normalizeForMatch(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[013457@$]/g, c => LEET[c])
    .replace(/h/g, '')
    .replace(/v/g, 'b')
    .replace(/k/g, 'c');
}

// "puta" -> detecta "puta", "p u t a", "puuuta", "putas", "pu7a", "putha"
// pero NO "computadora" ni "disputa" (exige inicio de palabra a la izquierda).
function termToRegex(term) {
  const letters = normalizeForMatch(term).replace(/[^a-z]/g, '');
  if (letters.length < 3) return null; // términos tan cortos dan demasiados falsos positivos

  const SEP = '[^a-z]{0,3}'; // hasta 3 símbolos/espacios entre letras
  const runs = letters.match(/(.)\1*/g);
  const body = runs.map(run => {
    const ch = run[0];
    // Una letra puede repetirse ("puuuta"); una doble en el término ("perro") exige 2 mínimo,
    // para que "perro" no termine bloqueando "pero".
    return run.length === 1
      ? `${ch}(?:${SEP}${ch})*`
      : `${ch}(?:${SEP}${ch}){${run.length - 1},}`;
  }).join(SEP);

  return new RegExp(`(?<![a-z])${body}(?:e?s)?(?![a-z])`);
}

let cachedKey = null;
let cachedList = [];
function getCompiled(terms) {
  const key = terms.join('\u0000');
  if (key !== cachedKey) {
    cachedList = terms.map(term => ({ term, regex: termToRegex(term) })).filter(x => x.regex);
    cachedKey = key;
  }
  return cachedList;
}

function findBlockedTerm(text, terms) {
  if (!text || !Array.isArray(terms) || terms.length === 0) return null;
  const normalized = normalizeForMatch(text);
  for (const { term, regex } of getCompiled(terms)) {
    if (regex.test(normalized)) return term;
  }
  return null;
}

// ---- Antispam (estado en memoria) ----
const recentByUser = new Map(); // userKey -> Map(textoNormalizado -> timestamp)
const lastSpokenAt = new Map(); // userKey -> timestamp
let lastPrune = 0;

function duplicateKey(text) {
  return normalizeForMatch(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/(.)\1{2,}/g, '$1$1'); // "holaaaaa" y "holaa" cuentan como el mismo mensaje
}

function maybePrune(now) {
  if (now - lastPrune < 60000) return;
  lastPrune = now;
  const maxAge = 10 * 60 * 1000;
  for (const [user, msgs] of recentByUser) {
    for (const [key, at] of msgs) if (now - at > maxAge) msgs.delete(key);
    if (msgs.size === 0) recentByUser.delete(user);
  }
  for (const [user, at] of lastSpokenAt) if (now - at > maxAge) lastSpokenAt.delete(user);
}

function evaluateMessage({ userKey, text, tts, exempt = false }) {
  if (tts.profanityFilter) {
    const hit = findBlockedTerm(text, tts.blockedTerms);
    if (hit) return { allowed: false, reason: `filtro de palabras: "${hit}"` };
  }

  if (exempt) return { allowed: true };

  const now = Date.now();
  maybePrune(now);

  const slowMs = tts.slowModeEnabled ? (tts.slowModeMs ?? 3000) : 0;
  if (slowMs > 0) {
    const last = lastSpokenAt.get(userKey);
    if (last && now - last < slowMs) return { allowed: false, reason: `modo lento (${slowMs}ms)` };
  }

  const dupKey = tts.blockDuplicates ? duplicateKey(text) : null;
  if (dupKey) {
    const windowMs = (tts.duplicateWindowSec || 30) * 1000;
    const seenAt = recentByUser.get(userKey)?.get(dupKey);
    if (seenAt && now - seenAt < windowMs) return { allowed: false, reason: 'mensaje repetido' };
  }

  // Aceptado: recién ahora se registra
  if (slowMs > 0) lastSpokenAt.set(userKey, now);
  if (dupKey) {
    if (!recentByUser.has(userKey)) recentByUser.set(userKey, new Map());
    recentByUser.get(userKey).set(dupKey, now);
  }
  return { allowed: true };
}

module.exports = { evaluateMessage, findBlockedTerm };