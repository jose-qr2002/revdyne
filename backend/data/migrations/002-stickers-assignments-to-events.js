// backend/data/migrations/002-stickers-assignments-to-events.js
const store = require('../store');

// Devuelve true si migró algo, false si no había assignments que migrar
// (será el caso normal en cuanto se ejecute una vez).
function migrateStickerAssignmentsIfPresent() {
  const stickers = store.loadStickers();
  const assignments = stickers.assignments;

  if (!assignments || Object.keys(assignments).length === 0) {
    return false;
  }

  console.log('🔄 [MIGRACIÓN] Encontradas asignaciones de sticker antiguas, convirtiendo a eventos...');

  const profiles = store.loadProfiles();
  const globalProfile = profiles.list.prof_global;
  if (!globalProfile.actions) globalProfile.actions = {};
  if (!globalProfile.events) globalProfile.events = [];

  let migrados = 0;

  Object.entries(assignments).forEach(([stickerId, assignment]) => {
    if (!assignment || !assignment.actionId) return;
    const target = assignment.actionId;
    let realActionId = null;

    if (target.startsWith('sound:')) {
      const soundFile = target.replace('sound:', '');

      // Si ya migramos otro sticker con el mismo archivo, reutiliza la acción
      // en vez de crear una duplicada.
      realActionId = Object.keys(globalProfile.actions).find(
        id => globalProfile.actions[id].type === 'sound' && globalProfile.actions[id].sound === soundFile
      );

      if (!realActionId) {
        realActionId = `act_migrated_${Date.now()}_${migrados}`;
        globalProfile.actions[realActionId] = {
          name: `Sonido: ${soundFile}`,
          type: 'sound',
          enabled: true,
          sound: soundFile,
          delay: 0
        };
      }
    } else if (target.startsWith('action:')) {
      realActionId = target.replace('action:', '');
    } else {
      console.warn(`⚠️ [MIGRACIÓN] Formato desconocido en sticker ${stickerId}: "${target}", se omite`);
      return;
    }

    const yaExiste = globalProfile.events.some(e => e.trigger === 'sticker' && e.condition === stickerId);
    if (!yaExiste) {
      globalProfile.events.push({
        id: `evt_migrated_${Date.now()}_${migrados}`,
        trigger: 'sticker',
        condition: stickerId,
        actionId: realActionId,
        enabled: assignment.enabled !== false
      });
      migrados++;
    }
  });

  store.saveProfiles(profiles);

  // stickers.json se queda solo con catalog, como acordamos
  delete stickers.assignments;
  store.saveStickers(stickers);

  console.log(`✅ [MIGRACIÓN] ${migrados} sticker(s) migrados a eventos en prof_global.`);
  return true;
}

module.exports = { migrateStickerAssignmentsIfPresent };