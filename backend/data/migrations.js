// backend/data/migrations.js
// Migraciones de formato de los JSON de datos. store.js las aplica cada vez que LEE un archivo del disco (al arrancar, al recuperar un
// .bak antiguo o si alguien lo edita a mano), así el resto del código solo conoce el formato ACTUAL y no lleva conversiones de
// formatos viejos repartidas por ahí.
//
// Para cambiar un formato: subir `current` del archivo y añadir la función `N: (data) => data` que pasa de la versión N-1 a la N.
// Cada función recibe una copia y devuelve el dato migrado; deben tolerar datos a medias (archivos editados a mano).
// Antes de guardar el resultado, store.js deja una copia `<archivo>.v<versión vieja>.bak` (una vez) por si hubiera que volver atrás.

// ---------- profiles.json ----------

// v2: una acción es una lista de pasos ({ name, enabled, steps }) en vez de un solo `type` con sus campos en la raíz
function actionToSteps(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action.steps)) return action;
  const { name, enabled, type, ...rest } = action;
  let step;
  switch (type) {
    case 'keyboard':
      step = { type, key: rest.key, delay: rest.delay, sound: rest.sound || null, volume: rest.volume ?? 100, soundEveryKey: !!rest.soundEveryKey };
      break;
    case 'sound':
      step = { type, sound: rest.sound, volume: rest.volume ?? 100 }; // el antiguo "delay" de los sonidos no se usaba
      break;
    case 'video':
      step = { type, video: rest.video, screen: rest.screen, volume: rest.volume ?? 100 };
      break;
    case 'win':
      step = { type, mode: rest.mode, amount: rest.amount };
      break;
    default:
      step = type ? { type, ...rest } : null; // tipo que aún no existe (p. ej. l4d2_command): se conserva tal cual
  }
  return { name, enabled: enabled !== false, steps: step ? [step] : [] };
}

// v2: los eventos (no los stickers) tienen `actionIds` (todas a la vez) y `randomActionIds` (una al azar) en vez de un solo `actionId`
function eventToLists(evt) {
  if (!evt || typeof evt !== 'object' || evt.trigger === 'sticker' || Array.isArray(evt.actionIds)) return evt;
  const { actionId, ...rest } = evt;
  return { ...rest, actionIds: actionId ? [actionId] : [], randomActionIds: Array.isArray(evt.randomActionIds) ? evt.randomActionIds : [] };
}

const profiles = {
  current: 2,
  steps: {
    2: (data) => {
      for (const profile of Object.values(data.list || {})) {
        if (!profile || typeof profile !== 'object') continue;
        profile.actions = Object.fromEntries(Object.entries(profile.actions || {}).map(([id, a]) => [id, actionToSteps(a)]));
        profile.events = (profile.events || []).map(eventToLists);
      }
      return data;
    },
  },
};

const MIGRATIONS = { profiles };

// Devuelve { data, from, to, changed }. Un archivo sin schemaVersion se trata como versión 1.
function migrate(kind, input) {
  const def = MIGRATIONS[kind];
  if (!def || !input || typeof input !== 'object') return { data: input, changed: false };
  const from = Number(input.schemaVersion) || 1;
  if (from >= def.current) return { data: input, from, to: from, changed: false };

  let data = structuredClone(input);
  for (let v = from + 1; v <= def.current; v++) {
    if (def.steps[v]) data = def.steps[v](data);
    data.schemaVersion = v;
  }
  return { data, from, to: def.current, changed: true };
}

module.exports = { migrate, MIGRATIONS };
