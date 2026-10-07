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

const DEFAULT_OVERLAYS = {
  schemaVersion: 1,
  likes: {
    goal: 5000,
    title: 'Like Goal',
    onReach: 'increase',    // keep | increase | double | hide
    actionId: '',           // acción al alcanzar la meta ('' = ninguna)
    activeStyle: 1,
    styles: {
      1: { ...DEFAULT_OVERLAY_STYLE },
      2: { ...DEFAULT_OVERLAY_STYLE, barColor: '#ff0050' },
      3: { ...DEFAULT_OVERLAY_STYLE, barColor: '#ff4d4d' },
      4: { ...DEFAULT_OVERLAY_STYLE, barColor: '#c4002f' },
      5: { ...DEFAULT_OVERLAY_STYLE, bgColor: '#000000', barColor: '#ff0050' },
    },
  },
};

module.exports = { DEFAULT_SETTINGS, EMPTY_PROFILES, EMPTY_CATALOG, EMPTY_STICKERS, DEFAULT_OVERLAYS, DEFAULT_OVERLAY_STYLE, OVERLAY_FONTS, OVERLAY_PUBLIC_BASE_URL };