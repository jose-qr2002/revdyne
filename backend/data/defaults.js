// backend/data/defaults.js
const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  username: '',
  keyDelayMs: 80,
  tts: {
    enabled: false,
    filterMode: 'all',
    keySkipCurrent: 'num1',
    keySkipAll: 'num2',
    keyToggleBot: 'num3',
    onlyLatin: true,
    speed: 1.2,
    engine: 'tiktok',
    sayUsername: false,
    tiktokVoice: 'es_male_m3',
    piperVoice: null,
    edgeVoice: null,
    usePrefix: false,
    prefixText: '!tts',
    minFanLevel: 0,
    volume: 100,
    blockDuplicates: false,
    duplicateWindowSec: 30,
    slowModeEnabled: false,
    slowModeMs: 3000,
    profanityFilter: false,
    blockedTerms: [],
    stickerAntispam: { onePerComment: true, userCooldownMs: 6000 },
  }
};

const EMPTY_PROFILES = {
  schemaVersion: 1,
  activeProfileId: null,
  list: {
    prof_global: {
      name: 'Comandos Globales (Audios/Stickers)',
      isGlobal: true,
      actions: {},
      events: []
    }
  }
};

const EMPTY_CATALOG = {};

const EMPTY_STICKERS = {
  schemaVersion: 1,
  catalog: {}
};

// Fuentes del sistema: OBS (CEF) solo ve las que tiene instaladas Windows.
const OVERLAY_FONTS = ['Arial', 'Arial Black', 'Impact', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Georgia', 'Comic Sans MS', 'Courier New'];

const DEFAULT_OVERLAY_STYLE = {
  font: 'Arial',
  fontSize: 50,
  fontSpacing: 50,          // separación entre título / porcentaje / progreso, en % de em
  barWidth: 100,            // largo de la barra, % del ancho disponible
  barHeight: 100,           // grosor de la barra, % de su alto normal
  barImage: '',             // URL opcional que se dibuja encima de la barra (880x140)
  titleColor: '#ffffff',
  fontBorder: true,
  borderColor: '#000000',
  progressColor: '#ffffff', // color del texto de progreso (actual/meta)
  barColor: '#ee1d52',      // relleno
  bgColor: '#010101',       // fondo de la barra
  showTitle: true,
  showPercent: true,
  showProgress: false,
  showIcon: true,
  finalText: 'Likes',
};

// Dominio propio donde se aloja la página del overlay para TikTok LIVE Studio (exige https + dominio real).
// Ahí solo vive el HTML estático; los datos llegan desde la app local por Socket.IO.
const OVERLAY_PUBLIC_BASE_URL = 'https://overlays.reveljk.com';

// Valores iniciales de una meta (likes, seguidores...). Cada estilo parte de DEFAULT_OVERLAY_STYLE.
const goalDefaults = ({ goal, title, finalText }) => {
  const base = { ...DEFAULT_OVERLAY_STYLE, finalText };
  return {
    goal,
    title,
    onReach: 'increase',    // keep | increase | double | hide
    countMode: 'total',     // total: empieza con lo que ya hay | live: solo lo nuevo del directo
    allowMultiple: false,   // solo compartidas: false = una por usuario | true = todas las que haga
    actionId: '',           // acción al alcanzar la meta ('' = ninguna)
    activeStyle: 1,
    styles: {
      1: { ...base },
      2: { ...base, barColor: '#ff0050' },
      3: { ...base, barColor: '#ff4d4d' },
      4: { ...base, barColor: '#c4002f' },
      5: { ...base, bgColor: '#000000', barColor: '#ff0050' },
    },
  };
};

// Overlays "mejor regalo" / "mejor combo": tarjeta con el regalo, quién lo envió y su valor.
const topDefaults = ({ title, valueColor }) => ({
  activeStyle: 3,           // 1 tarjeta horizontal | 2 etiqueta compacta | 3 vertical compacta sin fondos (por defecto)
  title,
  font: 'Arial',
  fontScale: 100,           // % del tamaño base del texto (título y usuario)
  valueScale: 100,          // % del tamaño del valor (monedas / xN); bajarlo da un aspecto más compacto
  valueMode: 'unit',        // solo mejor regalo: unit (valor del regalo, por defecto) | coins (monedas totales) | both (xN + monedas); 'count' (xN) ya no se ofrece
  keepOnClose: false,       // guardar el líder aunque se cierre la app (si no, se reinicia al cerrarla)
  nameOverIcon: false,      // en desuso: el estilo 3 siempre coloca el nombre sobre el regalo
  accentColor: '#ff0050',
  titleColor: '#ffffff',
  nameColor: '#ffffff',
  valueColor,
  cardColor: '#14141c',
  showTitle: true,
  showIcon: true,
  showUser: true,
  userField: 'nickname',    // nickname (nombre visible) | username (@usuario)
  animate: true,
});

const DEFAULT_OVERLAYS = {
  schemaVersion: 1,
  likes: goalDefaults({ goal: 5000, title: 'Like Goal', finalText: 'Likes' }),
  followers: goalDefaults({ goal: 100, title: 'Follower Goal', finalText: 'Seguidores' }),
  shares: goalDefaults({ goal: 50, title: 'Share Goal', finalText: 'Compartidas' }),
  viewers: goalDefaults({ goal: 100, title: 'Viewer Goal', finalText: 'Espectadores' }),
  coins: goalDefaults({ goal: 1000, title: 'Coin Goal', finalText: 'Monedas' }),
  topgift: topDefaults({ title: 'Mejor regalo', valueColor: '#ffd24a' }),
  topcombo: topDefaults({ title: 'Mejor combo', valueColor: '#ff4d6a' }),
};

module.exports = { DEFAULT_SETTINGS, EMPTY_PROFILES, EMPTY_CATALOG, EMPTY_STICKERS, DEFAULT_OVERLAYS, DEFAULT_OVERLAY_STYLE, OVERLAY_FONTS, OVERLAY_PUBLIC_BASE_URL };