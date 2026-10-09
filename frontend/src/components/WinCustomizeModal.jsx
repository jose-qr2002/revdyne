import React, { useRef, useState } from 'react';
import Select from './Select';
import Icon from './Icon';
import ModalShell from './ModalShell';

const LAYOUTS = { horizontal: 'Horizontal', vertical: 'Vertical' };
const BG_STYLES = { color: 'Color fijo', transparent: 'Transparente', rainbow: 'Rainbow', media: 'Imagen / GIF / Video' };
const TEXT_STYLES = { color: 'Color fijo', rainbow: 'Rainbow', aqua: 'Aqua', fire: 'Fire', gold: 'Gold', ice: 'Ice' };
const ICON_MODES = { icon: 'Iconos', none: 'Ninguno' };
const ICONS = { trophy: 'Trofeo', crown: 'Corona', star: 'Estrella', medal: 'Medalla', fire: 'Fuego', gem: 'Gema', rocket: 'Cohete', skull: 'Calavera' };

function Field({ label, hint, wide, children }) {
  return (
    <label className={`pz-field ${wide ? 'wide' : ''}`}>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// El selector de color solo admite #rrggbb: de un valor con transparencia (#rrggbbaa) se muestra la parte de color
function Color({ label, value, onChange }) {
  const shown = /^#[0-9a-fA-F]{6}/.test(value) ? value.slice(0, 7) : '#000000';
  return (
    <Field label={label}>
      <span className="pz-color">
        <input type="color" value={shown} onChange={e => onChange(e.target.value)} />
        {shown}
      </span>
    </Field>
  );
}

const optionsOf = (map) => Object.entries(map).map(([value, label]) => <option key={value} value={value}>{label}</option>);

// Personalización del overlay Win Game: 5 estilos, cada uno con su diseño completo.
export default function WinCustomizeModal({ config, fonts, onSelectStyle, onChangeStyle, onResetStyle, onUploadMedia, onClose }) {
  const styleId = config.activeStyle;
  const s = config.styles[styleId];
  const set = (patch) => onChangeStyle(styleId, patch);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState('');

  const num = (key, min, max) => (e) => {
    const n = parseInt(e.target.value, 10);
    if (Number.isFinite(n)) set({ [key]: Math.min(max, Math.max(min, n)) });
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setMediaError('');
    const res = await onUploadMedia(file);
    setUploading(false);
    if (res.error) setMediaError(res.error); else set({ bgStyle: 'media', bgMedia: res.url });
  };

  const mediaName = s.bgMedia ? decodeURIComponent(s.bgMedia.split('/').pop()) : '';

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={<><Icon name="settings" size={16} /> Personalizar Win Game</>}
      width="560px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => onResetStyle(styleId)}>Restablecer estilo</button>
          <button className="btn btn-primary" onClick={onClose}>Ok</button>
        </>
      }
    >
      <div className="pz-styles" role="tablist" aria-label="Estilo">
        {[1, 2, 3, 4, 5].map(id => (
          <button key={id} className={styleId === id ? 'active' : ''} onClick={() => onSelectStyle(id)}>Estilo {id}</button>
        ))}
      </div>

      <section className="pz-group">
        <h4>Diseño</h4>
        <div className="pz-grid">
          <Field label="Diseño" wide>
            <Select className="modifier-select" value={s.layout} onChange={e => set({ layout: e.target.value })}>{optionsOf(LAYOUTS)}</Select>
          </Field>
        </div>
      </section>

      <section className="pz-group">
        <h4>Fondo</h4>
        <div className="pz-grid">
          <Field label="Estilo del fondo">
            <Select className="modifier-select" value={s.bgStyle} onChange={e => set({ bgStyle: e.target.value })}>{optionsOf(BG_STYLES)}</Select>
          </Field>
          {s.bgStyle === 'color' && <Color label="Color del fondo" value={s.bgColor} onChange={v => set({ bgColor: v })} />}
          {s.bgStyle === 'media' && (
            <>
              <Field wide label="Imagen, GIF o video" hint="PNG, JPG, GIF, WEBP, MP4 o WEBM, hasta 25 MB. También puedes pegar un enlace https.">
                <div className="win-media">
                  <input className="key-input" type="text" placeholder="https://…/fondo.gif" value={s.bgMedia.startsWith('/media/') ? '' : s.bgMedia}
                    onChange={e => set({ bgMedia: e.target.value.trim() })} />
                  <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Icon name={uploading ? 'clock' : 'download'} size={14} /> {uploading ? 'Subiendo…' : 'Subir archivo'}
                  </button>
                  <input ref={fileRef} type="file" hidden accept=".png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,image/*,video/mp4,video/webm" onChange={pickFile} />
                </div>
                {s.bgMedia && (
                  <span className="win-media-current">
                    <Icon name="image" size={14} /> <span className="ellipsis" title={s.bgMedia}>{mediaName}</span>
                    <button className="icon-btn danger" title="Quitar el fondo" aria-label="Quitar el fondo" onClick={() => set({ bgMedia: '' })}><Icon name="x" size={14} /></button>
                  </span>
                )}
                {mediaError && <span className="prof-error"><Icon name="alert" size={13} /> {mediaError}</span>}
                {!s.bgMedia && <span className="win-media-hint">Sin archivo: se usa el color de fondo.</span>}
              </Field>
              <Color label="Color de respaldo" value={s.bgColor} onChange={v => set({ bgColor: v })} />
            </>
          )}
        </div>
      </section>

      <section className="pz-group">
        <h4>Texto</h4>
        <div className="pz-grid">
          <Field label="Texto Win Game">
            <input className="key-input" type="text" maxLength={30} value={s.text} onChange={e => set({ text: e.target.value })} />
          </Field>
          <Field label="Fuente">
            <Select className="modifier-select" value={s.font} onChange={e => set({ font: e.target.value })}>
              {fonts.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Tamaño de fuente">
            <input className="key-input" type="number" min="10" max="200" value={s.fontSize} onChange={num('fontSize', 10, 200)} />
          </Field>
          <Field label="Espaciado de letras">
            <input className="key-input" type="number" min="-5" max="50" value={s.letterSpacing} onChange={num('letterSpacing', -5, 50)} />
          </Field>
          <Field label="Estilo del texto">
            <Select className="modifier-select" value={s.textStyle} onChange={e => set({ textStyle: e.target.value })}>{optionsOf(TEXT_STYLES)}</Select>
          </Field>
          {s.textStyle === 'color' && <Color label="Color del texto" value={s.textColor} onChange={v => set({ textColor: v })} />}
        </div>
      </section>

      <section className="pz-group">
        <h4>Imagen Win</h4>
        <div className="pz-grid">
          <Field label="Imagen Win Game">
            <Select className="modifier-select" value={s.iconMode} onChange={e => set({ iconMode: e.target.value })}>{optionsOf(ICON_MODES)}</Select>
          </Field>
          {s.iconMode === 'icon' && (
            <Field label="Icono">
              <Select className="modifier-select" value={s.icon} onChange={e => set({ icon: e.target.value })}>{optionsOf(ICONS)}</Select>
            </Field>
          )}
        </div>
      </section>

      <section className="pz-group">
        <h4>Contadores</h4>
        <div className="pz-grid">
          <Field label="Tamaño de los números y el slash" wide hint="Cambia el tamaño de los dos números y de la barra que los separa; el texto Win se ajusta arriba.">
            <input className="key-input" type="number" min="10" max="300" value={s.counterFontSize} onChange={num('counterFontSize', 10, 300)} />
          </Field>
          <Color label="Contador, color de fondo" value={s.counterBg} onChange={v => set({ counterBg: v })} />
          <Color label="Meta, color de fondo" value={s.goalBg} onChange={v => set({ goalBg: v })} />
          <Color label="Color del contador" value={s.counterColor} onChange={v => set({ counterColor: v })} />
          <Color label="Color del contador negativo" value={s.negativeColor} onChange={v => set({ negativeColor: v })} />
          <Color label="Color de la barra separadora" value={s.separatorColor} onChange={v => set({ separatorColor: v })} />
        </div>
      </section>
    </ModalShell>
  );
}
