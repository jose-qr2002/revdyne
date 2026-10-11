// Captura de teclas para las acciones: convierte un KeyboardEvent a los nombres de tecla de RobotJS (los que usa el servidor al pulsar).
// A diferencia de shortcuts.js (atajos globales de Electron), aquí las teclas se PULSAN, así que los nombres son otros ('control', 'pageup',
// 'numpad_1'...). Los modificadores se guardan aparte: [{ key: 'w', modifiers: ['shift'] }].

const MODIFIER_CODES = {
  ShiftLeft: 'shift', ShiftRight: 'shift', ControlLeft: 'control', ControlRight: 'control',
  AltLeft: 'alt', AltRight: 'alt', MetaLeft: 'command', MetaRight: 'command',
};

const NAMED = {
  Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Escape: 'escape', Tab: 'tab', Backspace: 'backspace', Delete: 'delete',
  Insert: 'insert', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowUp: 'up', ArrowDown: 'down',
  ArrowLeft: 'left', ArrowRight: 'right', CapsLock: 'capslock', PrintScreen: 'printscreen', ContextMenu: 'menu', NumLock: 'numpad_lock',
  NumpadAdd: 'numpad_+', NumpadSubtract: 'numpad_-', NumpadMultiply: 'numpad_*', NumpadDivide: 'numpad_/', NumpadDecimal: 'numpad_.',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
  Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};

// Tecla principal (no modificador) de un evento, con el nombre de RobotJS; null si no se reconoce
export function mainKeyName(e) {
  const code = e.code || '';
  if (NAMED[code]) return NAMED[code];
  let m;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1].toLowerCase();
  if ((m = code.match(/^Digit([0-9])$/))) return m[1];
  if ((m = code.match(/^F([1-9]|1[0-9]|2[0-4])$/))) return `f${m[1]}`;
  if ((m = code.match(/^Numpad([0-9])$/))) return `numpad_${m[1]}`;
  return null;
}

// Modificadores que están pulsados en el evento (siempre en el mismo orden)
export function activeModifiers(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('control');
  if (e.shiftKey) mods.push('shift');
  if (e.altKey) mods.push('alt');
  if (e.metaKey) mods.push('command');
  return mods;
}

// keydown: { key, modifiers } si se pulsó una tecla "normal" (con los modificadores que hubiera); null si solo es un modificador o no se reconoce
export function captureKeyDown(e) {
  if (MODIFIER_CODES[e.code]) return null;
  const key = mainKeyName(e);
  return key ? { key, modifiers: activeModifiers(e) } : null;
}

// keyup de un modificador: se usa para asignar un modificador SOLO (p. ej. pulsar y soltar Shift). Devuelve el nombre de RobotJS o null.
export const modifierKeyUp = (e) => MODIFIER_CODES[e.code] || null;
export const isModifierCode = (code) => !!MODIFIER_CODES[code];
