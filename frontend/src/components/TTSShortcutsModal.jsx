import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import ModalShell from './ModalShell';

// Atajos globales del Bot TTS: se registran en Electron (main.js, registerShortcuts) y funcionan aunque la app no esté en primer plano.
// Un atajo vacío significa "sin asignar": no se registra ninguna tecla.
const SHORTCUTS = [
  { id: 'keySkipCurrent', icon: 'arrowRight', label: 'Omitir actual' },
  { id: 'keySkipAll', icon: 'trash', label: 'Limpiar cola' },
  { id: 'keyToggleBot', icon: 'stop', label: 'Apagar bot' },
];

// Convierte la tecla pulsada al formato de atajos de Electron (p. ej. "CommandOrControl+Shift+A"); null si no es válida
// o si solo se pulsó un modificador (se espera a la tecla final).
const getElectronKey = (e) => {
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

const display = (shortcut) => (shortcut ? shortcut.replace(/CommandOrControl/g, 'Ctrl') : 'Sin asignar');

export default function TTSShortcutsModal({ tts, onChange, onClose }) {
  const [listeningFor, setListeningFor] = useState(null);
  const [warning, setWarning] = useState('');

  // Un clic fuera del botón cancela la captura
  useEffect(() => {
    if (!listeningFor) return;
    const cancel = () => setListeningFor(null);
    const t = setTimeout(() => window.addEventListener('click', cancel), 50);
    return () => { clearTimeout(t); window.removeEventListener('click', cancel); };
  }, [listeningFor]);

  useEffect(() => {
    if (!listeningFor) return;
    const onKeyDown = (e) => {
      e.preventDefault();
      if (e.repeat) return;
      const electronKey = getElectronKey(e);
      if (!electronKey) return; // solo un modificador o una tecla que Electron no admite: se sigue esperando

      // La misma combinación en dos acciones haría que solo una funcione
      const clash = SHORTCUTS.find(s => s.id !== listeningFor && tts[s.id] === electronKey);
      if (clash) { setWarning(`"${display(electronKey)}" ya está asignado a "${clash.label}". Elige otra combinación.`); return; }

      setWarning('');
      onChange({ [listeningFor]: electronKey });
      setListeningFor(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [listeningFor, tts, onChange]);

  const toggleListening = (id) => (e) => {
    e.stopPropagation();
    setWarning('');
    setListeningFor(listeningFor === id ? null : id);
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={<><Icon name="keyboard" size={16} /> Atajos de teclado</>}
      width="520px"
      footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}
    >
      <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.6 }}>
        <Icon name="info" size={15} /> Son atajos <strong>globales</strong>: funcionan aunque Revdyne no esté en primer plano.
        Usa combinaciones con <strong>Ctrl</strong> o <strong>Alt</strong> + una tecla (por ejemplo Ctrl+S) para no activarlos sin querer mientras juegas.
        Si no asignas ninguno, no se registra ninguna tecla.
      </div>

      <div className="tts-keys">
        {SHORTCUTS.map(s => (
          <div className="tts-key-row" key={s.id}>
            <span className="tts-key-label"><Icon name={s.icon} size={15} /> {s.label}</span>
            <button
              className={`tts-key-btn${listeningFor === s.id ? ' listening' : ''}${tts[s.id] ? '' : ' empty'}`}
              onClick={toggleListening(s.id)}
            >
              {listeningFor === s.id ? <><Icon name="clock" size={15} /> Presiona la combinación…</> : display(tts[s.id])}
            </button>
            <button
              className="icon-btn danger" title="Quitar atajo" aria-label={`Quitar el atajo de ${s.label}`}
              disabled={!tts[s.id]}
              onClick={() => { setWarning(''); onChange({ [s.id]: '' }); }}
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
      </div>

      {warning && <div className="tts-key-warn"><Icon name="alert" size={15} /> {warning}</div>}
    </ModalShell>
  );
}
