import React from 'react';
import Select from './Select';
import Icon from './Icon';
import KeyListEditor from './KeyListEditor';
import { STEP_TYPES, MAX_WAIT_MS } from '../services/actionSteps';

const SCREENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function Field({ label, children, grow = 1, min = 120 }) {
  return (
    <div className="step-field" style={{ flex: grow, minWidth: min }}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Volume({ value, onChange }) {
  return (
    <Field label={<><Icon name="volume" size={13} /> Volumen: <strong>{value ?? 100}%</strong></>} grow={2} min={180}>
      <input type="range" min="0" max="100" value={value ?? 100} onChange={e => onChange(parseInt(e.target.value, 10))} style={{ width: '100%' }} />
    </Field>
  );
}

// Selector de archivo de la biblioteca (sonidos o videos) con botón de subir
function FilePicker({ value, files, placeholder, onChange, onUpload, uploading, uploadTitle, onOpenFolder }) {
  return (
    <div className="step-file">
      <Select className="modifier-select" value={value || ''} onChange={e => onChange(e.target.value || null)} style={{ flex: 1, minWidth: 0 }}>
        <option value="">{placeholder}</option>
        {value && !files.includes(value) && <option value={value}>{value} (no encontrado)</option>}
        {files.map(f => <option key={f} value={f}>{f}</option>)}
      </Select>
      <button className="btn btn-secondary" onClick={onUpload} disabled={uploading} title={uploadTitle} style={{ padding: '0 12px', fontWeight: 'bold' }}>
        {uploading ? <Icon name="clock" size={15} /> : <><Icon name="plus" size={15} /> Subir</>}
      </button>
      {onOpenFolder && (
        <button className="icon-btn" onClick={onOpenFolder} title="Abrir la carpeta de sonidos (para añadir audios a mano)" aria-label="Abrir la carpeta de sonidos">
          <Icon name="folder" size={16} />
        </button>
      )}
    </div>
  );
}

// Un paso de la acción: cabecera (tipo, retraso, quitar) y sus campos
// `hasMultiPress`: la acción tiene más de una pulsación de tecla (en total), así que un sonido puede sonar en cada una.
// `everyKeyTaken`: otro paso de sonido de la acción ya usa "en cada pulsación" (solo uno puede).
export default function ActionStepEditor({ step, onChange, onRemove, sounds, videos, onUploadSound, onUploadVideo, uploadingSound, uploadingVideo, onOpenSoundsFolder, hasMultiPress = false, everyKeyTaken = false }) {
  const meta = STEP_TYPES[step.type] || { label: step.type, icon: 'bolt' };
  const waitSeconds = (step.wait || 0) / 1000;
  const setWait = (v) => {
    const ms = Math.round((parseFloat(v) || 0) * 1000);
    onChange({ wait: Math.min(MAX_WAIT_MS, Math.max(0, ms)) });
  };

  return (
    <div className="step-card">
      <div className="step-head">
        <span className="step-title"><Icon name={meta.icon} size={15} /> {meta.label}</span>
        <label className="step-wait" title="Retraso de este paso desde que se dispara la acción">
          <Icon name="clock" size={13} /> Empieza a los
          <input type="number" className="key-input" min="0" max={MAX_WAIT_MS / 1000} step="0.5" value={waitSeconds} onChange={e => setWait(e.target.value)} />
          s
        </label>
        <button className="icon-btn danger" onClick={onRemove} title="Quitar este paso" aria-label={`Quitar el paso ${meta.label}`}><Icon name="trash" size={15} /></button>
      </div>

      {step.type === 'keyboard' && (
        <KeyListEditor keys={Array.isArray(step.keys) ? step.keys : []} onChange={keys => onChange({ keys })} />
      )}

      {step.type === 'sound' && (
        <div className="step-row">
          <Field label="Archivo de sonido" grow={2} min={220}>
            <FilePicker value={step.sound} files={sounds} placeholder="Selecciona un sonido..." onChange={v => onChange({ sound: v })} onUpload={onUploadSound} uploading={uploadingSound} uploadTitle="Subir audio (.mp3, .wav)" onOpenFolder={onOpenSoundsFolder} />
          </Field>
          <Volume value={step.volume} onChange={v => onChange({ volume: v })} />
        </div>
      )}

      {step.type === 'sound' && hasMultiPress && (
        <label className={`step-check${everyKeyTaken && !step.everyKey ? ' disabled' : ''}`} title={everyKeyTaken && !step.everyKey ? 'Otro sonido de esta acción ya suena en cada pulsación' : undefined}>
          <input
            type="checkbox" className="check" checked={!!step.everyKey} disabled={everyKeyTaken && !step.everyKey}
            onChange={e => onChange({ everyKey: e.target.checked })}
          />
          Reproducir el sonido en <strong>cada pulsación</strong> de tecla (cada repetición)
        </label>
      )}

      {step.type === 'video' && (
        <>
          <div className="step-row">
            <Field label="Video" grow={2} min={220}>
              <FilePicker value={step.video} files={videos} placeholder="Selecciona un video..." onChange={v => onChange({ video: v })} onUpload={onUploadVideo} uploading={uploadingVideo} uploadTitle="Subir video (.mp4, .webm)" />
            </Field>
            <Field label="Pantalla" min={130}>
              <Select className="modifier-select" value={String(step.screen || 1)} onChange={e => onChange({ screen: parseInt(e.target.value, 10) })} style={{ width: '100%' }}>
                {SCREENS.map(n => <option key={n} value={String(n)}>Pantalla {n}</option>)}
              </Select>
            </Field>
          </div>
          <div className="step-row"><Volume value={step.volume} onChange={v => onChange({ volume: v })} /></div>
          <p className="step-hint">Copia el enlace de esa pantalla desde la sección <strong>Pantallas</strong> y añádelo como fuente en Live Studio u OBS. Con un regalo de varias unidades el video se repite una vez por unidad (máximo 10).</p>
        </>
      )}

      {step.type === 'win' && (
        <>
          <div className="step-row">
            <Field label="¿Qué hace?" grow={2} min={180}>
              <Select className="modifier-select" value={step.mode === 'decrease' ? 'decrease' : 'increase'} onChange={e => onChange({ mode: e.target.value })} style={{ width: '100%' }}>
                <option value="increase">Subir wins (+)</option>
                <option value="decrease">Bajar wins (−)</option>
              </Select>
            </Field>
            <Field label="Cantidad" min={100}>
              <input type="number" className="key-input" value={step.amount ?? 1} onChange={e => onChange({ amount: e.target.value })} style={{ width: '100%', textAlign: 'center' }} min="1" max="1000" />
            </Field>
          </div>
          <p className="step-hint">Suma o resta al conteo del overlay <strong>Win Game</strong>. Con un regalo de varias unidades (5 rosas) se aplica una vez por unidad.</p>
        </>
      )}

      {!['keyboard', 'sound', 'video', 'win'].includes(step.type) && (
        <p className="step-hint">Este tipo de paso todavía no está disponible: se conserva, pero no hace nada.</p>
      )}
    </div>
  );
}
