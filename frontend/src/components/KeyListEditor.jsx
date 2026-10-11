import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import { captureKeyDown, modifierKeyUp } from '../services/keyCapture';
import { comboLabel, MAX_REPEAT, MIN_KEY_DELAY_MS, MAX_WAIT_MS } from '../services/actionSteps';

const DEFAULT_DELAY_MS = 80;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Lista de teclas de un paso de teclado: "Añadir tecla" captura la pulsación (o la combinación con Ctrl/Shift/Alt) y la añade a la lista, donde
// cada tecla lleva la espera tras cada pulsación (ms) y cuántas veces se repite. `keys`: [{ key, modifiers, delay, repeat }].
export default function KeyListEditor({ keys, onChange }) {
  const [listening, setListening] = useState(false);

  // Mientras se escucha: la primera tecla "normal" pulsada (con sus modificadores) se añade. Un modificador pulsado y soltado SOLO
  // (p. ej. Shift) también se puede asignar.
  useEffect(() => {
    if (!listening) return;
    let usedOther = false;
    const add = (combo) => { onChange([...keys, { ...combo, delay: DEFAULT_DELAY_MS, repeat: 1 }]); setListening(false); };
    const onDown = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      const combo = captureKeyDown(e);
      if (combo) { usedOther = true; add(combo); }
    };
    const onUp = (e) => {
      e.preventDefault(); e.stopPropagation();
      const mod = modifierKeyUp(e);
      if (mod && !usedOther) add({ key: mod, modifiers: [] });
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => { window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true); };
  }, [listening, keys, onChange]);

  // Un clic fuera cancela la captura
  useEffect(() => {
    if (!listening) return;
    const cancel = () => setListening(false);
    const t = setTimeout(() => window.addEventListener('click', cancel), 50);
    return () => { clearTimeout(t); window.removeEventListener('click', cancel); };
  }, [listening]);

  const update = (index, patch) => onChange(keys.map((k, i) => (i === index ? { ...k, ...patch } : k)));
  const remove = (index) => onChange(keys.filter((_, i) => i !== index));

  const presses = keys.reduce((n, k) => n + (parseInt(k.repeat, 10) || 1), 0);
  const totalMs = keys.reduce((n, k) => n + (parseInt(k.repeat, 10) || 1) * Math.max(MIN_KEY_DELAY_MS, Number(k.delay) || 0), 0);

  return (
    <div className="kl">
      <div className="kl-head">
        <button
          type="button"
          className={`btn btn-secondary kl-add${listening ? ' listening' : ''}`}
          onClick={(e) => { e.stopPropagation(); setListening(l => !l); }}
        >
          {listening ? <><Icon name="clock" size={15} /> Presiona una tecla o combinación…</> : <><Icon name="plus" size={15} /> Añadir tecla</>}
        </button>
        {listening && <span className="kl-hint">Puedes usar Ctrl, Shift o Alt junto a otra tecla. Clic fuera para cancelar.</span>}
      </div>

      {keys.length === 0 ? (
        <div className="kl-empty">Pulsa "Añadir tecla" y presiona la tecla (o la combinación) que debe pulsarse. Puedes añadir todas las que quieras: se pulsan en orden.</div>
      ) : (
        <>
          <div className="kl-list">
            {keys.map((k, i) => (
              <div className="kl-row" key={i}>
                <span className="kl-n">{i + 1}</span>
                <span className="kl-combo">
                  {comboLabel(k).split('+').map((part, j) => <kbd key={j}>{part}</kbd>)}
                </span>
                <label className="kl-field" title="Milisegundos que se espera después de cada pulsación de esta tecla (mínimo 30)">
                  <span>Espera tras cada pulsación</span>
                  <span className="kl-num">
                    <input
                      type="number" className="key-input" min={MIN_KEY_DELAY_MS} max={MAX_WAIT_MS} step="10"
                      value={k.delay ?? DEFAULT_DELAY_MS}
                      onChange={e => update(i, { delay: e.target.value === '' ? '' : clamp(parseInt(e.target.value, 10) || 0, 0, MAX_WAIT_MS) })}
                      onBlur={() => update(i, { delay: clamp(parseInt(k.delay, 10) || DEFAULT_DELAY_MS, MIN_KEY_DELAY_MS, MAX_WAIT_MS) })}
                    /> ms
                  </span>
                </label>
                <label className="kl-field" title="Cuántas veces se pulsa esta tecla seguidas">
                  <span>Repeticiones</span>
                  <span className="kl-num">
                    <input
                      type="number" className="key-input" min="1" max={MAX_REPEAT} step="1"
                      value={k.repeat ?? 1}
                      onChange={e => update(i, { repeat: e.target.value === '' ? '' : clamp(parseInt(e.target.value, 10) || 1, 1, MAX_REPEAT) })}
                      onBlur={() => update(i, { repeat: clamp(parseInt(k.repeat, 10) || 1, 1, MAX_REPEAT) })}
                    /> veces
                  </span>
                </label>
                <button type="button" className="icon-btn danger" onClick={() => remove(i)} title="Quitar esta tecla" aria-label={`Quitar la tecla ${comboLabel(k)}`}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="kl-total">
            {presses} {presses === 1 ? 'pulsación' : 'pulsaciones'} por disparo · unos {totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1).replace(/\.0$/, '')} s` : `${totalMs} ms`}
          </div>
        </>
      )}
    </div>
  );
}
