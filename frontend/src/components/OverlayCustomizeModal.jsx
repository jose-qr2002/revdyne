import React from 'react';
import ModalShell from './ModalShell';

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

function Toggle({ label, checked, onChange }) {
  return (
    <label className={`pz-toggle ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {checked ? '●' : '○'} {label}
    </label>
  );
}

export default function OverlayCustomizeModal({
  isOpen, title = 'Personalizar barra', onClose, activeStyle, styles, fonts, defaultStyles, onSelectStyle, onChangeStyle,
}) {
  if (!isOpen) return null;

  const s = styles[activeStyle];
  const set = (partial) => onChangeStyle(activeStyle, partial);
  const num = (key, min, max) => (e) => {
    const n = parseInt(e.target.value, 10);
    if (Number.isFinite(n)) set({ [key]: Math.min(max, Math.max(min, n)) });
  };

  return (
    <ModalShell
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      width="540px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => set(defaultStyles[activeStyle])}>Restablecer estilo</button>
          <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }} onClick={onClose}>Listo</button>
        </>
      }
    >
      <div className="pz-styles" role="tablist" aria-label="Estilo">
        {[1, 2, 3, 4, 5].map(id => (
          <button key={id} className={activeStyle === id ? 'active' : ''} onClick={() => onSelectStyle(id)}>Estilo {id}</button>
        ))}
      </div>

      <section className="pz-group">
        <h4>Texto</h4>
        <div className="pz-grid">
          <Field label="Fuente">
            <select className="modifier-select" value={s.font} onChange={e => set({ font: e.target.value })}>
              {fonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Texto tras el %">
            <input className="key-input" type="text" maxLength={30} value={s.finalText} onChange={e => set({ finalText: e.target.value })} />
          </Field>
          <Field label="Tamaño">
            <input className="key-input" type="number" min="10" max="200" value={s.fontSize} onChange={num('fontSize', 10, 200)} />
          </Field>
          <Field label="Espaciado entre partes">
            <input className="key-input" type="number" min="0" max="200" value={s.fontSpacing} onChange={num('fontSpacing', 0, 200)} />
          </Field>
          <Color label="Color del título" value={s.titleColor} onChange={v => set({ titleColor: v })} />
          <Color label="Color del progreso" value={s.progressColor} onChange={v => set({ progressColor: v })} />
          <Color label="Color del contorno" value={s.borderColor} onChange={v => set({ borderColor: v })} />
          <div className="pz-field" style={{ justifyContent: 'flex-end' }}>
            <Toggle label="Contorno en el texto" checked={s.fontBorder} onChange={v => set({ fontBorder: v })} />
          </div>
        </div>
      </section>

      <section className="pz-group">
        <h4>Barra</h4>
        <div className="pz-grid">
          <Field label={`Largo de la barra: ${s.barWidth}%`} hint="Más corto = la barra se centra">
            <input type="range" min="30" max="100" value={s.barWidth} onChange={num('barWidth', 30, 100)} className="pz-range" />
          </Field>
          <Field label={`Grosor de la barra: ${s.barHeight}%`} hint="El tamaño total lo da el recuadro de la fuente">
            <input type="range" min="40" max="100" value={s.barHeight} onChange={num('barHeight', 40, 100)} className="pz-range" />
          </Field>
          <Color label="Relleno" value={s.barColor} onChange={v => set({ barColor: v })} />
          <Color label="Fondo" value={s.bgColor} onChange={v => set({ bgColor: v })} />
          <Field wide label="Imagen sobre la barra (URL)" hint="Recomendado: 880 x 140, PNG con transparencia">
            <input className="key-input" type="text" placeholder="https://…/barra.png" value={s.barImage} onChange={e => set({ barImage: e.target.value.trim() })} />
          </Field>
        </div>
      </section>

      <section className="pz-group">
        <h4>Mostrar</h4>
        <div className="pz-toggles">
          <Toggle label="Título" checked={s.showTitle} onChange={v => set({ showTitle: v })} />
          <Toggle label="Porcentaje" checked={s.showPercent} onChange={v => set({ showPercent: v })} />
          <Toggle label="Progreso (0/5000)" checked={s.showProgress} onChange={v => set({ showProgress: v })} />
          <Toggle label="Ícono" checked={s.showIcon} onChange={v => set({ showIcon: v })} />
        </div>
      </section>
    </ModalShell>
  );
}
