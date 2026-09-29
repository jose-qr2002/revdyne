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
    blockedTerms: []
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

module.exports = { DEFAULT_SETTINGS, EMPTY_PROFILES, EMPTY_CATALOG, EMPTY_STICKERS };