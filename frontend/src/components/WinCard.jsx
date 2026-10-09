import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon';
import ConfirmModal from './ConfirmModal';
import WinCustomizeModal from './WinCustomizeModal';
import { apiFetch } from '../services/api';
import { getElectronKey, displayShortcut } from '../services/shortcuts';
import { portQuery, currentAppPort } from './portUtils';

const TARGET_KEY = 'overlayTarget';
const SAVE_DEBOUNCE_MS = 300;
const SHORTCUTS = [
  { id: 'keyIncrease', label: 'Sumar 1 al conteo', icon: 'plus' },
  { id: 'keyDecrease', label: 'Restar 1 al conteo', icon: 'minus' },
];
// Tamaño del recuadro de la vista previa según el diseño (la página del overlay se ajusta sola a cualquier tamaño)
const PREVIEW_SIZE = { horizontal: { w: 720, h: 240 }, vertical: { w: 360, h: 520 } };

const readTarget = () => {
  try { return localStorage.getItem(TARGET_KEY) === 'obs' ? 'obs' : 'studio'; } catch { return 'studio'; }
};

// Fila "META" / "CONTEO": menos, número editable y más
function CounterRow({ label, value, onCommit, onStep }) {
  const [draft, setDraft] = useState(null); // null = se muestra el valor guardado; texto = se está escribiendo
  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <div className="win-row">
      <span className="win-row-label">{label}</span>
      <button className="icon-btn win-step" onClick={() => onStep(-1)} aria-label={`Restar 1 a ${label.toLowerCase()}`}><Icon name="minus" size={18} /></button>
      <input
        className="key-input win-input" type="number" value={draft ?? value}
        onFocus={e => { setDraft(String(value)); e.target.select(); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); } }}
        aria-label={label}
      />
      <button className="icon-btn win-step" onClick={() => onStep(1)} aria-label={`Sumar 1 a ${label.toLowerCase()}`}><Icon name="plus" size={18} /></button>
    </div>
  );
}

export default function WinCard({ socket }) {
  const [data, setData] = useState(null);
  const [clients, setClients] = useState(0);
  const [target, setTarget] = useState(readTarget);
  const [copied, setCopied] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [listeningFor, setListeningFor] = useState(null);
  const [warning, setWarning] = useState('');
  const [scale, setScale] = useState(1);

  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const previewRef = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length) apiFetch('/api/overlays/win/config', 'POST', patch);
  }, []);

  useEffect(() => {
    apiFetch('/api/overlays/win').then(res => {
      if (!res?.config) return;
      setData({ config: res.config, fonts: res.fonts, publicBaseUrl: res.publicBaseUrl });
      setClients(res.clients || 0);
    });
    return flush; // no perder el último cambio al cambiar de sección
  }, [flush]);

  // Con la vista previa abierta el servidor emite el estado: el conteo cambia aquí también cuando se usan los atajos
  useEffect(() => {
    if (!socket) return;
    const onState = (st) => setData(d => (d ? { ...d, config: { ...d.config, goal: st.goal, count: st.count } } : d));
    const onClients = (n) => setClients(n);
    socket.on('overlay:win:state', onState);
    socket.on('overlay:win:clients', onClients);
    return () => { socket.off('overlay:win:state', onState); socket.off('overlay:win:clients', onClients); };
  }, [socket]);

  const cfg = data?.config;
  const previewSize = PREVIEW_SIZE[cfg?.styles[cfg.activeStyle].layout] || PREVIEW_SIZE.horizontal;

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / previewSize.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, previewSize.w]);

  // ---- Conteo y meta ----
  const setValues = (patch) => {
    setData(d => ({ ...d, config: { ...d.config, ...patch } }));
    apiFetch('/api/overlays/win/state', 'POST', patch);
  };
  const step = (field, delta) => {
    setData(d => ({ ...d, config: { ...d.config, [field]: Math.max(field === 'goal' ? 0 : -999999, d.config[field] + delta) } }));
    apiFetch('/api/overlays/win/adjust', 'POST', { field, delta });
  };

  // ---- Diseño ----
  const saveStyle = (id, patch) => {
    setData(d => ({ ...d, config: { ...d.config, styles: { ...d.config.styles, [id]: { ...d.config.styles[id], ...patch } } } }));
    const pending = pendingRef.current;
    pendingRef.current = { ...pending, styles: { ...(pending.styles || {}), [id]: { ...(pending.styles?.[id] || {}), ...patch } } };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };
  const selectStyle = (id) => {
    flush();
    setData(d => ({ ...d, config: { ...d.config, activeStyle: id } }));
    apiFetch('/api/overlays/win/config', 'POST', { activeStyle: id });
  };
  const resetStyle = async (id) => {
    flush();
    const res = await apiFetch(`/api/overlays/win/styles/${id}/reset`, 'POST');
    if (res?.config) setData(d => ({ ...d, config: { ...d.config, styles: res.config.styles } }));
  };
  const uploadMedia = async (file) => {
    const form = new FormData();
    form.append('media', file);
    try {
      const res = await fetch('/api/overlays/win/media', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      return res.ok && json.url ? { url: json.url } : { error: json.error || 'No se pudo subir el archivo.' };
    } catch {
      return { error: 'Error de red al subir el archivo.' };
    }
  };

  // ---- Atajos de teclado ----
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
      const key = getElectronKey(e);
      if (!key) return; // solo un modificador o una tecla que Electron no admite: se sigue esperando
      const other = SHORTCUTS.find(s => s.id !== listeningFor);
      if (cfg[other.id] === key) { setWarning(`"${displayShortcut(key)}" ya está asignado a "${other.label}". Elige otra combinación.`); return; }
      setWarning('');
      setData(d => ({ ...d, config: { ...d.config, [listeningFor]: key } }));
      apiFetch('/api/overlays/win/config', 'POST', { [listeningFor]: key });
      setListeningFor(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [listeningFor, cfg]);

  const clearShortcut = (id) => {
    setWarning('');
    setData(d => ({ ...d, config: { ...d.config, [id]: '' } }));
    apiFetch('/api/overlays/win/config', 'POST', { [id]: '' });
  };

  if (!data) return <div className="empty-state"><p>Cargando overlay…</p></div>;

  // ---- URL del overlay ----
  const chooseTarget = (t) => {
    setTarget(t);
    try { localStorage.setItem(TARGET_KEY, t); } catch { /* sin almacenamiento: solo no se recuerda */ }
  };
  // TikTok LIVE Studio rechaza 'localhost'; la IP apunta al mismo servidor. En desarrollo (Vite) se deja el origen.
  const host = import.meta.env.DEV ? window.location.origin : window.location.origin.replace('//localhost', '//127.0.0.1');
  const obsUrl = `${host}/overlays/win`;
  const studioUrl = `${data.publicBaseUrl}/win${portQuery(currentAppPort())}`;
  const overlayUrl = target === 'studio' ? studioUrl : obsUrl;
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin permiso de portapapeles: el campo es seleccionable a mano */ }
  };

  const connected = clients > 0;

  return (
    <section className="lk win-card">
      <header className="lk-head">
        <h3><Icon name="trophy" size={18} /> Win Game</h3>
        <span className={`lk-chip ${connected ? 'on' : ''}`} title="Estado del Browser Source en OBS / Live Studio">
          <i /> OBS {connected ? 'enlazado' : 'sin enlazar'}
        </span>
      </header>

      <div className="lk-target" role="tablist" aria-label="Destino">
        <button className={target === 'studio' ? 'active' : ''} onClick={() => chooseTarget('studio')}>TikTok LIVE Studio</button>
        <button className={target === 'obs' ? 'active' : ''} onClick={() => chooseTarget('obs')}>OBS</button>
      </div>

      <div className="lk-bar">
        <div className="lk-url">
          <input readOnly value={overlayUrl} onFocus={e => e.target.select()} aria-label="URL del overlay" />
          <button className={`lk-icon ${copied ? 'done' : ''}`} onClick={copyUrl} title={copied ? 'Copiado' : 'Copiar URL'} aria-label="Copiar URL">
            <Icon name={copied ? 'check' : 'copy'} size={16} />
          </button>
        </div>
        <button className="btn btn-sm btn-secondary rk-custom" onClick={() => setShowCustomize(true)}><Icon name="settings" size={15} /> Personalizar</button>
      </div>

      <div className="rk-grid">
        <div className="lk-stage" ref={previewRef} style={{ height: previewSize.h * scale }}>
          <iframe
            key={cfg.styles[cfg.activeStyle].layout}
            title="Vista previa del overlay"
            src="/overlays/win?preview=1"
            width={previewSize.w} height={previewSize.h}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
          <span className="lk-size">{previewSize.w}×{previewSize.h}</span>
        </div>

        <div className="win-panel">
          <CounterRow label="Meta" value={cfg.goal} onCommit={n => setValues({ goal: Math.max(0, n) })} onStep={d => step('goal', d)} />
          <CounterRow label="Conteo" value={cfg.count} onCommit={n => setValues({ count: n })} onStep={d => step('count', d)} />
          <button className="btn btn-sm btn-secondary win-reset" onClick={() => setConfirmReset(true)} disabled={cfg.count === 0}>
            <Icon name="refresh" size={14} /> Reiniciar conteo
          </button>

          <div className="win-keys">
            <div className="rk-list-head"><Icon name="keyboard" size={14} /> Atajos de teclado</div>
            {SHORTCUTS.map(s => (
              <div className="tts-key-row" key={s.id}>
                <span className="tts-key-label"><Icon name={s.icon} size={15} /> {s.label}</span>
                <button
                  className={`tts-key-btn${listeningFor === s.id ? ' listening' : ''}${cfg[s.id] ? '' : ' empty'}`}
                  onClick={(e) => { e.stopPropagation(); setWarning(''); setListeningFor(listeningFor === s.id ? null : s.id); }}
                >
                  {listeningFor === s.id ? <><Icon name="clock" size={15} /> Presiona la combinación…</> : displayShortcut(cfg[s.id])}
                </button>
                <button className="icon-btn danger" title="Quitar atajo" aria-label={`Quitar el atajo de ${s.label}`} disabled={!cfg[s.id]} onClick={() => clearShortcut(s.id)}>
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
            {warning && <div className="tts-key-warn"><Icon name="alert" size={15} /> {warning}</div>}
          </div>
        </div>
      </div>

      <p className="lk-hint">
        Contador de victorias que manejas tú: usa los botones o los atajos de teclado (globales, funcionan aunque Revdyne no esté en primer plano; mejor con Ctrl o Alt + una tecla).
        La meta y el conteo se guardan al cerrar la app.{' '}
        {target === 'studio'
          ? <>En Live Studio añade una fuente <strong>Enlace</strong> con esa URL; con <strong>Resolución personalizada</strong> el overlay se ajusta al recuadro.</>
          : <>En OBS añade una fuente <strong>Navegador</strong> con esa URL.</>}
        {' '}Solo trabaja mientras el enlace esté en uso.
      </p>

      {showCustomize && (
        <WinCustomizeModal
          config={cfg} fonts={data.fonts}
          onSelectStyle={selectStyle} onChangeStyle={saveStyle} onResetStyle={resetStyle} onUploadMedia={uploadMedia}
          onClose={() => { flush(); setShowCustomize(false); }}
        />
      )}

      <ConfirmModal
        isOpen={confirmReset}
        title={<><Icon name="alert" size={18} /> Reiniciar conteo</>}
        message={`El conteo (${cfg.count}) volverá a 0. La meta se queda en ${cfg.goal}.`}
        confirmLabel="Sí, reiniciar"
        onConfirm={() => { setConfirmReset(false); apiFetch('/api/overlays/win/reset-count', 'POST'); setData(d => ({ ...d, config: { ...d.config, count: 0 } })); }}
        onCancel={() => setConfirmReset(false)}
      />
    </section>
  );
}
