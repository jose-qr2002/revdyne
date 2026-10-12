// backend/services/alertTemplate.js
// Alertas en pantalla (paso `alert` de una acción): texto con marcadores ({giftname}, {repeatcount}...), foto de perfil, nombre y un diseño
// personalizable. Este módulo es la ÚNICA fuente de los valores por defecto, las fuentes y los límites del diseño (el panel los pide en
// GET /api/overlays/video -> `alert`); backend/overlays/screen.html dibuja el resultado.
//
// Paso:  { type: 'alert', text, screen, duration (s), showAvatar, showGift, singleLine, style: { ...parcial, se completa con DEFAULT_STYLE } }
// Datos del evento (`context`, lo rellenan los manejadores de backend/services/tiktok/):
//        { user: { nickname, username, avatar }, gift: { name, image }, repeatCount, coins, likeCount, totalLikeCount, comment }

const MAX_TEXT = 200;
const DURATION = { min: 1, max: 60, default: 6 };

// Fuentes de Google que carga la propia página (necesita internet, igual que el Win Game). weight = grosor que se pide
const FONTS = [
  { name: 'Lilita One', weight: 400 }, { name: 'Bangers', weight: 400 }, { name: 'Luckiest Guy', weight: 400 },
  { name: 'Permanent Marker', weight: 400 }, { name: 'Press Start 2P', weight: 400 }, { name: 'Pacifico', weight: 400 },
  { name: 'Roboto', weight: 700 }, { name: 'Montserrat', weight: 800 }, { name: 'Poppins', weight: 700 },
  { name: 'Oswald', weight: 700 }, { name: 'Rubik', weight: 700 },
];

const NAME_EFFECTS = ['none', 'rainbow', 'gold', 'fire', 'ice'];
const ENTRANCES = ['pop', 'slide', 'fade', 'none'];

const DEFAULT_STYLE = {
  font: 'Lilita One',
  textSize: 44, textColor: '#ffffff', letterSpacing: 1, lineSpacing: 1.2,
  border: true, borderColor: '#1a1a1a', borderWidth: 3,
  shadow3d: true, softShadow: false,
  wave: false, float: false, wiggle: false,
  nameColor: '#34d3b0', nameEffect: 'none', nameSize: 56,
  avatarSize: 150,
  entrance: 'pop',
};

// Límites de los campos numéricos: [mínimo, máximo]
const LIMITS = { textSize: [16, 140], letterSpacing: [0, 20], lineSpacing: [0.8, 2.5], borderWidth: [0, 8], nameSize: [16, 140], avatarSize: [40, 400] };

const PLACEHOLDERS = [
  { key: 'username', label: '@usuario', help: 'El @ de quien lo hizo' },
  { key: 'nickname', label: 'Nombre', help: 'El nombre visible de quien lo hizo' },
  { key: 'giftname', label: 'Regalo', help: 'Nombre del regalo' },
  { key: 'repeatcount', label: 'Cantidad', help: 'Unidades del regalo (la racha completa hasta ahora)' },
  { key: 'coins', label: 'Monedas', help: 'Valor total del regalo en monedas (por la cantidad)' },
  { key: 'likecount', label: 'Likes', help: 'Likes de este envío' },
  { key: 'totallikecount', label: 'Likes totales', help: 'Likes totales del directo' },
  { key: 'comment', label: 'Comentario', help: 'El comentario (en stickers)' },
];

const COLOR = /^#[0-9a-f]{6}$/i;
const num = (v, [min, max], fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Diseño limpio y completo (cualquier valor raro vuelve a su valor por defecto)
function sanitizeStyle(input) {
  const s = input && typeof input === 'object' ? input : {};
  const d = DEFAULT_STYLE;
  const out = { ...d };
  out.font = FONTS.some(f => f.name === s.font) ? s.font : d.font;
  for (const k of Object.keys(LIMITS)) out[k] = num(s[k], LIMITS[k], d[k]);
  for (const k of ['textColor', 'borderColor', 'nameColor']) out[k] = COLOR.test(s[k]) ? s[k].toLowerCase() : d[k];
  for (const k of ['border', 'shadow3d', 'softShadow', 'wave', 'float', 'wiggle']) out[k] = s[k] === undefined ? d[k] : !!s[k];
  out.nameEffect = NAME_EFFECTS.includes(s.nameEffect) ? s.nameEffect : d.nameEffect;
  out.entrance = ENTRANCES.includes(s.entrance) ? s.entrance : d.entrance;
  return out;
}

// Valores de los marcadores a partir de los datos del evento. Lo que el evento no trae queda vacío
function templateValues(context) {
  const c = context || {};
  const u = c.user || {};
  const g = c.gift || {};
  const val = (v) => (v === undefined || v === null ? '' : String(v));
  return {
    username: val(u.username), nickname: val(u.nickname || u.username), giftname: val(g.name),
    repeatcount: val(c.repeatCount), coins: val(c.coins), likecount: val(c.likeCount), totallikecount: val(c.totalLikeCount),
    comment: val(c.comment),
  };
}

// "Gracias {nickname} por {giftname} x{repeatcount}" -> texto final. Un marcador desconocido se deja tal cual (así se ve el error de tipeo)
function renderTemplate(text, context) {
  const values = templateValues(context);
  return String(text ?? '').slice(0, MAX_TEXT * 3).replace(/\{(\w+)\}/g, (m, key) => (Object.prototype.hasOwnProperty.call(values, key.toLowerCase()) ? values[key.toLowerCase()] : m)).slice(0, MAX_TEXT);
}

// Solo se aceptan imágenes https (la foto de perfil y el regalo vienen del CDN de TikTok)
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '');

// Lo que se manda a la página de la pantalla
function buildPayload(step, context) {
  const u = context?.user || {};
  const seconds = num(step.duration, [DURATION.min, DURATION.max], DURATION.default);
  const style = sanitizeStyle(step.style);
  return {
    kind: 'alert',
    text: renderTemplate(step.text, context),
    name: String(u.nickname || u.username || '').slice(0, 60),
    avatar: safeUrl(u.avatar),
    gift: safeUrl(context?.gift?.image),
    showAvatar: step.showAvatar !== false,
    showGift: !!step.showGift,
    singleLine: !!step.singleLine,
    durationMs: Math.round(seconds * 1000),
    style,
    fontWeight: (FONTS.find(f => f.name === style.font) || FONTS[0]).weight,
  };
}

// Datos de ejemplo (botón de probar y vista previa del diseño)
const SAMPLE_CONTEXT = {
  user: { nickname: 'Usuario de prueba', username: 'usuario_prueba', avatar: '' },
  gift: { name: 'Rose', image: '' },
  repeatCount: 15, coins: 15, likeCount: 12, totalLikeCount: 3480, comment: 'Hola a todos',
};

module.exports = { FONTS, DEFAULT_STYLE, LIMITS, NAME_EFFECTS, ENTRANCES, PLACEHOLDERS, DURATION, MAX_TEXT, SAMPLE_CONTEXT, sanitizeStyle, renderTemplate, buildPayload };
