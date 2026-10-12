import React, { useEffect, useRef, useCallback } from 'react';
import Select from './Select';
import Icon from './Icon';
import ModalShell from './ModalShell';
import { renderAlertText } from '../services/actionSteps';

const NAME_EFFECTS = { none: 'Sin efecto', rainbow: 'Arcoíris', gold: 'Dorado', fire: 'Fuego', ice: 'Hielo' };
const ENTRANCES = { pop: 'Rebote', slide: 'Deslizar', fade: 'Aparecer', none: 'Sin animación' };

// Regalo de ejemplo para ver dónde queda la imagen del regalo (en la vista previa no hay un regalo real)
const PREVIEW_GIFT = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="10" y="26" width="44" height="30" rx="4" fill="#ff4d6d"/><rect x="6" y="18" width="52" height="12" rx="3" fill="#ff7a90"/><rect x="29" y="18" width="6" height="38" fill="#ffd24a"/><path d="M32 18c-8-12-20-6-14 0 4 4 14 0 14 0zM32 18c8-12 20-6 14 0-4 4-14 0-14 0z" fill="none" stroke="#ffd24a" stroke-width="4"/></svg>')}`;

function Field({ label, hint, wide, children }) {
  return (
    <label className={`pz-field ${wide ? 'wide' : ''}`}>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Color({ label, value, onChange }) {
  return (
    <Field label={label}>
      <span className="pz-color">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} />
        {value}
      </span>
    </Field>
  );
}

function Toggle({ label, checked, onChange, title }) {
  return (
    <label className={`pz-toggle ${checked ? 'on' : ''}`} title={title}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// Número con control deslizante y valor exacto
function Range({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <Field label={<>{label}: <strong>{value}{unit}</strong></>}>
      <input type="range" className="pz-range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </Field>
  );
}

const options = (map) => Object.entries(map).map(([value, label]) => <option key={value} value={value}>{label}</option>);

// Diseñador de una alerta: controles a la izquierda y vista previa en vivo a la derecha. La vista previa es la MISMA página que usa el directo
// (/overlays/screen/N?designer=1) y le llega el diseño por postMessage. Los cambios se aplican al paso al instante (se guardan con la acción).
// `info` = datos del servidor (fuentes, valores por defecto, límites, datos de ejemplo); `step` = el paso de alerta; `onChange(patch)` lo modifica.
export default function AlertDesignModal({ step, info, onChange, onClose }) {
  const frameRef = useRef(null);
  const readyRef = useRef(false);
  const style = { ...info.defaults, ...(step.style || {}) };
  const setStyle = (patch) => onChange({ style: { ...(step.style || {}), ...patch } });
  const L = info.limits;

  const send = useCallback((replay) => {
    const win = frameRef.current?.contentWindow;
    if (!win || !readyRef.current) return;
    const st = { ...info.defaults, ...(step.style || {}) };
    const font = info.fonts.find(f => f.name === st.font) || info.fonts[0];
    win.postMessage({
      type: 'revdyne-alert-preview', replay: !!replay,
      item: {
        kind: 'alert',
        text: renderAlertText(step.text, info.sample),
        name: info.sample.user.nickname,
        avatar: '', gift: step.showGift ? PREVIEW_GIFT : '',
        showAvatar: step.showAvatar !== false, showGift: !!step.showGift, singleLine: !!step.singleLine,
        durationMs: 6000, style: st, fontWeight: font.weight,
      },
    }, window.location.origin);
  }, [step, info]);

  // La página avisa cuando está lista (y se le manda el diseño con su animación de entrada)
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'revdyne-alert-ready' || e.source !== frameRef.current?.contentWindow) return;
      readyRef.current = true;
      send(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [send]);

  // Cada cambio se refleja al instante, sin repetir la animación de entrada
  useEffect(() => { send(false); }, [send]);

  const num = (key) => (v) => setStyle({ [key]: Math.min(L[key][1], Math.max(L[key][0], v)) });

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      width="940px"
      title={<><Icon name="sparkles" size={16} /> Diseño de la alerta</>}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => onChange({ style: {}, showAvatar: true, showGift: false, singleLine: false })}>Restablecer diseño</button>
          <button className="btn btn-primary" onClick={onClose}>Ok</button>
        </>
      }
    >
      <div className="ad-layout">
        <div className="ad-controls">
          <section className="pz-group first">
            <h4>Texto</h4>
            <div className="pz-grid">
              <Field label="Fuente">
                <Select className="modifier-select" value={style.font} onChange={e => setStyle({ font: e.target.value })}>
                  {info.fonts.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                </Select>
              </Field>
              <Color label="Color del texto" value={style.textColor} onChange={v => setStyle({ textColor: v })} />
              <Range label="Tamaño" value={style.textSize} min={L.textSize[0]} max={L.textSize[1]} unit=" px" onChange={num('textSize')} />
              <Range label="Espaciado de letras" value={style.letterSpacing} min={L.letterSpacing[0]} max={L.letterSpacing[1]} unit=" px" onChange={num('letterSpacing')} />
              <Range label="Interlineado" value={style.lineSpacing} min={L.lineSpacing[0]} max={L.lineSpacing[1]} step={0.1} onChange={num('lineSpacing')} />
            </div>
          </section>

          <section className="pz-group">
            <h4>Borde y sombras</h4>
            <div className="pz-toggles">
              <Toggle label="Borde" checked={style.border} onChange={v => setStyle({ border: v })} />
              <Toggle label="Relieve 3D" checked={style.shadow3d} onChange={v => setStyle({ shadow3d: v })} />
              <Toggle label="Sombra suave" checked={style.softShadow} onChange={v => setStyle({ softShadow: v })} />
            </div>
            {style.border && (
              <div className="pz-grid" style={{ marginTop: 10 }}>
                <Color label="Color del borde" value={style.borderColor} onChange={v => setStyle({ borderColor: v })} />
                <Range label="Grosor del borde" value={style.borderWidth} min={L.borderWidth[0]} max={L.borderWidth[1]} unit=" px" onChange={num('borderWidth')} />
              </div>
            )}
          </section>

          <section className="pz-group">
            <h4>Efectos</h4>
            <div className="pz-toggles">
              <Toggle label="Ola" checked={style.wave} onChange={v => setStyle({ wave: v })} title="Las letras suben y bajan en onda" />
              <Toggle label="Temblor" checked={style.wiggle} onChange={v => setStyle({ wiggle: v })} title="Las letras tiemblan" />
              <Toggle label="Flotar" checked={style.float} onChange={v => setStyle({ float: v })} title="Todo sube y baja suavemente" />
            </div>
            <small className="ad-note">Un nombre con efecto de color (arcoíris, dorado...) no hace ola ni tiembla; sí flota.</small>
          </section>

          <section className="pz-group">
            <h4>Nombre</h4>
            <div className="pz-grid">
              <Color label="Color del nombre" value={style.nameColor} onChange={v => setStyle({ nameColor: v })} />
              <Field label="Efecto del nombre">
                <Select className="modifier-select" value={style.nameEffect} onChange={e => setStyle({ nameEffect: e.target.value })}>{options(NAME_EFFECTS)}</Select>
              </Field>
              <Range label="Tamaño del nombre" value={style.nameSize} min={L.nameSize[0]} max={L.nameSize[1]} unit=" px" onChange={num('nameSize')} />
            </div>
          </section>

          <section className="pz-group">
            <h4>Foto y entrada</h4>
            <div className="pz-toggles">
              <Toggle label="Mostrar foto de perfil" checked={step.showAvatar !== false} onChange={v => onChange({ showAvatar: v })} />
              <Toggle label="Mostrar imagen del regalo" checked={!!step.showGift} onChange={v => onChange({ showGift: v })} title="Solo en alertas de regalos" />
              <Toggle label="Todo en una línea" checked={!!step.singleLine} onChange={v => onChange({ singleLine: v })} title="La foto, el nombre y el texto en fila" />
            </div>
            <div className="pz-grid" style={{ marginTop: 10 }}>
              <Range label="Tamaño de la foto" value={style.avatarSize} min={L.avatarSize[0]} max={L.avatarSize[1]} unit=" px" onChange={num('avatarSize')} />
              <Field label="Animación de entrada">
                <Select className="modifier-select" value={style.entrance} onChange={e => setStyle({ entrance: e.target.value })}>{options(ENTRANCES)}</Select>
              </Field>
            </div>
          </section>
        </div>

        <div className="ad-preview">
          <div className="ad-stage">
            <iframe
              ref={frameRef}
              title="Vista previa de la alerta"
              src={`/overlays/screen/${step.screen || 1}?designer=1`}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => send(true)}><Icon name="refresh" size={14} /> Ver animación</button>
          <small className="ad-note">Así se verá en tu pantalla. Los datos son de ejemplo (nombre, regalo, cantidades). Necesita internet para cargar la fuente.</small>
        </div>
      </div>
    </ModalShell>
  );
}
