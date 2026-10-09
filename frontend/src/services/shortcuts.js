// Atajos globales (se registran en Electron, ver registerShortcuts en main.js): captura de la combinación pulsada y su texto para mostrar.

// Convierte la tecla pulsada al formato de atajos de Electron (p. ej. "CommandOrControl+Shift+A"); null si no es válida
// o si solo se pulsó un modificador (se espera a la tecla final).
export const getElectronKey = (e) => {
  const code = e.code;
  const key = e.key;

  if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return null;

  const modifiers = [];
  if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl'); // MetaKey es 'Cmd' en Mac
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');

  let mainKey = null;

  if (code.startsWith('Numpad')) {
    const num = code.replace('Numpad', '');
    if (!isNaN(num)) {
      mainKey = `num${num}`;
    } else {
      const numMap = { Add: 'numadd', Subtract: 'numsub', Multiply: 'nummult', Divide: 'numdiv', Decimal: 'numdec', Enter: 'Enter' };
      mainKey = numMap[num] || key;
    }
  } else {
    const specialMap = {
      ' ': 'Space', Tab: 'Tab', CapsLock: 'Capslock',
      PageUp: 'PageUp', PageDown: 'PageDown',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace',
      Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
      '+': 'Plus', '-': 'Minus',
    };
    if (specialMap[key]) mainKey = specialMap[key];
    else if (/^[a-zA-Z0-9]$/.test(key)) mainKey = key.toUpperCase();
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) mainKey = key;
  }

  if (!mainKey) return null;
  return modifiers.length > 0 ? `${modifiers.join('+')}+${mainKey}` : mainKey;
};

export const displayShortcut = (shortcut) => (shortcut ? shortcut.replace(/CommandOrControl/g, 'Ctrl') : 'Sin asignar');
