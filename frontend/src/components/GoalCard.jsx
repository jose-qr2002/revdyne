import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../services/api';
import OverlayCustomizeModal from './OverlayCustomizeModal';

const ON_REACH_OPTIONS = [
  { value: 'keep', label: 'Mantener meta' },
  { value: 'increase', label: 'Aumentar meta' },
  { value: 'double', label: 'Duplicar meta' },
  { value: 'hide', label: 'Ocultar barra' },
];

const OVERLAY_W = 900;
const OVERLAY_H = 120;
const SAVE_DEBOUNCE_MS = 350;

const svg = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
  copy: svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7" />),
  play: svg(<path d="M7 4.5v15l12-7.5z" />),
  reset: svg(<><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></>),
  gear: svg(<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>),
};

// Combina un parche con la config, mezclando cada estilo por separado
function mergeStyles(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, partial] of Object.entries(b)) out[id] = { ...out[id], ...partial };
  return out;
}
function mergeLikes(likes, patch) {
  return { ...likes, ...patch, styles: mergeStyles(likes.styles, patch.styles) };
}

const COPY = {
  likes: {
    head: 'Meta de likes', unit: 'likes',
    modes: { total: 'Likes totales del directo', live: 'Solo likes desde que conecto' },
  },
  followers: {
    head: 'Meta de seguidores', unit: 'seguidores',
    modes: { total: 'Seguidores que ya tengo', live: 'Solo seguidores nuevos del directo' },
  },
  shares: { head: 'Meta de compartidas', unit: 'compartidas', modes: null },
};

const TARGET_KEY = 'overlayTarget';
function readTarget() {
  try { return localStorage.getItem(TARGET_KEY) === 'obs' ? 'obs' : 'studio'; } catch { return 'studio'; }
}

export default function GoalCard({ kind, socket, profiles }) {
  const copy = COPY[kind];
  const [data, setData] = useState(null);
  const [clients, setClients] = useState(0);
  const [live, setLive] = useState({ current: 0, goal: 0 });
  const [goalDraft, setGoalDraft] = useState('');
  const [showCustomize, setShowCustomize] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const [target, setTarget] = useState(readTarget); // 'studio' | 'obs'

  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const previewRef = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length) apiFetch(`/api/overlays/${kind}`, 'POST', patch);
  }, [kind]);

  useEffect(() => {
    apiFetch('/api/overlays').then(res => {
      if (!res?.[kind]) return;
      setData({ config: res[kind], fonts: res.fonts, defaultStyles: res.defaultStyles[kind], publicBaseUrl: res.publicBaseUrl });
      setClients(res.clients?.[kind] || 0);
      setLive({ current: res.state?.[kind]?.current || 0, goal: res.state?.[kind]?.goal || res[kind].goal });
      setGoalDraft(String(res[kind].goal));
    });
    return flush; // no perder el último cambio al cambiar de pestaña
  }, [flush, kind]);

  useEffect(() => {
    if (!socket) return;
    const onClients = (n) => setClients(n);
    const onState = (st) => setLive({ current: st.current, goal: st.goal });
    socket.on(`overlay:${kind}:clients`, onClients);
    socket.on(`overlay:${kind}:state`, onState);
    return () => {
      socket.off(`overlay:${kind}:clients`, onClients);
      socket.off(`overlay:${kind}:state`, onState);
    };
  }, [socket, kind]);

  // La vista previa es la propia página del overlay a 900x120, escalada al ancho disponible
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / OVERLAY_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const save = (patch) => {
    setData(d => ({ ...d, config: mergeLikes(d.config, patch) }));
    const p = pendingRef.current;
    pendingRef.current = { ...p, ...patch, ...(patch.styles && { styles: mergeStyles(p.styles, patch.styles) }) };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  if (!data) return <div className="empty-state"><p>Cargando overlays…</p></div>;

  const { config: likes, fonts, defaultStyles, publicBaseUrl } = data;
  const chooseTarget = (t) => {
    setTarget(t);
    try { localStorage.setItem(TARGET_KEY, t); } catch { /* sin almacenamiento: solo no se recuerda */ }
  };
  // TikTok LIVE Studio rechaza 'localhost' como URL inválida; la IP 127.0.0.1 apunta al mismo servidor.
  // En desarrollo (Vite) se deja el origen tal cual porque Vite no escucha en IPv4.
  const host = import.meta.env.DEV ? window.location.origin : window.location.origin.replace('//localhost', '//127.0.0.1');
  const obsUrl = `${host}/overlays/goal/${kind}`;
  // Live Studio: la página vive en el dominio propio y se conecta a esta app por el puerto indicado.
  const appPort = import.meta.env.DEV ? 3000 : (window.location.port || 3000);
  const studioUrl = `${publicBaseUrl}/goal/${kind}?port=${appPort}`;
  const overlayUrl = target === 'studio' ? studioUrl : obsUrl;

  // Acciones disponibles: las globales y las del perfil activo
  const list = profiles?.list || {};
  const activeId = profiles?.activeProfileId;
  const actionEntries = [
    ...Object.entries(list.prof_global?.actions || {}),
    ...(activeId && activeId !== 'prof_global' ? Object.entries(list[activeId]?.actions || {}) : []),
  ];

  const commitGoal = () => {
    const n = parseInt(goalDraft, 10);
    if (n > 0) save({ goal: n });
    else setGoalDraft(String(likes.goal));
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin permiso de portapapeles: el campo es seleccionable a mano */ }
  };

  const connected = clients > 0;
  const pct = live.goal > 0 ? Math.min(100, Math.floor((live.current / live.goal) * 100)) : 0;
  const fmt = (n) => Number(n).toLocaleString('es');

  return (
    <section className="lk">
      <header className="lk-head">
        <h3>{copy.head}</h3>
        <span className={`lk-chip ${connected ? 'on' : ''}`} title="Estado del Browser Source en OBS">
          <i /> OBS {connected ? 'enlazado' : 'sin enlazar'}
        </span>
      </header>

      <div className="lk-stage" ref={previewRef} style={{ height: OVERLAY_H * scale }}>
        <iframe
          title="Vista previa del overlay"
          src={`/overlays/goal/${kind}?preview=1`}
          width={OVERLAY_W} height={OVERLAY_H}
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
        <span className="lk-size">{OVERLAY_W}×{OVERLAY_H}</span>
      </div>

      <div className="lk-readout">
        <strong>{fmt(live.current)}</strong> de {fmt(live.goal)} {copy.unit}
        <em>{pct}%</em>
      </div>

      <div className="lk-target" role="tablist" aria-label="Destino">
        <button className={target === 'studio' ? 'active' : ''} onClick={() => chooseTarget('studio')}>TikTok LIVE Studio</button>
        <button className={target === 'obs' ? 'active' : ''} onClick={() => chooseTarget('obs')}>OBS</button>
      </div>

      <div className="lk-bar">
        <div className="lk-url">
          <input readOnly value={overlayUrl} onFocus={e => e.target.select()} aria-label="URL del overlay" />
          <button className={`lk-icon ${copied ? 'done' : ''}`} onClick={copyUrl} title={copied ? 'Copiado' : 'Copiar URL'} aria-label="Copiar URL">
            {copied ? ICONS.check : ICONS.copy}
          </button>
        </div>
        <button className="lk-icon" onClick={() => apiFetch(`/api/overlays/${kind}/test`, 'POST')} title="Probar: suma el 10% de la meta" aria-label="Probar">{ICONS.play}</button>
        <button className="lk-icon" onClick={() => apiFetch(`/api/overlays/${kind}/reset`, 'POST')} title="Reiniciar a 0" aria-label="Reiniciar">{ICONS.reset}</button>
        <button className="lk-icon" onClick={() => setShowCustomize(true)} title="Personalizar" aria-label="Personalizar">{ICONS.gear}</button>
      </div>

      <div className="lk-form">
        <label>Meta
          <input
            className="key-input" type="number" min="1"
            value={goalDraft}
            onChange={e => setGoalDraft(e.target.value)}
            onBlur={commitGoal}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </label>
        <label>Título
          <input className="key-input" type="text" maxLength={60} value={likes.title} onChange={e => save({ title: e.target.value })} />
        </label>
        {copy.modes && (
          <label>Empezar desde
            <select className="modifier-select" value={likes.countMode} onChange={e => save({ countMode: e.target.value })}>
              <option value="total">{copy.modes.total}</option>
              <option value="live">{copy.modes.live}</option>
            </select>
          </label>
        )}
        {kind === 'shares' && (
          <label>Compartidas por usuario
            <select className="modifier-select" value={likes.allowMultiple ? 'many' : 'one'} onChange={e => save({ allowMultiple: e.target.value === 'many' })}>
              <option value="one">Solo una por usuario</option>
              <option value="many">Todas (cada vez que comparte)</option>
            </select>
          </label>
        )}
        <label>Al alcanzar la meta
          <select className="modifier-select" value={likes.onReach} onChange={e => save({ onReach: e.target.value })}>
            {ON_REACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>Acción al finalizar
          <select className="modifier-select" value={likes.actionId} onChange={e => save({ actionId: e.target.value })}>
            <option value="">Ninguna</option>
            {actionEntries.map(([id, a]) => <option key={id} value={id}>{a.name || id}</option>)}
          </select>
        </label>
      </div>

      <p className="lk-hint">
        {target === 'studio'
          ? <>
              En Live Studio añade una fuente <strong>Enlace</strong> con esa URL. La página se carga desde internet y se conecta a esta app, que debe estar abierta en el mismo equipo.
              <br /><strong>Tamaño de la fuente:</strong> activa <strong>Resolución personalizada</strong> y pon una <strong>altura de 120</strong>; en el <strong>ancho</strong>, 900 es la medida base y cuanto mayor sea el valor, más larga será la barra.
            </>
          : <>En OBS añade una fuente <strong>Navegador</strong> con esa URL, tamaño {OVERLAY_W}×{OVERLAY_H}.</>}
        {' '}La meta solo funciona mientras el enlace esté en uso: al enlazarla empieza a contar y a disparar acciones.
      </p>

      <OverlayCustomizeModal
        isOpen={showCustomize}
        title={`Personalizar ${copy.head.toLowerCase()}`}
        onClose={() => { setShowCustomize(false); flush(); }}
        activeStyle={likes.activeStyle}
        styles={likes.styles}
        fonts={fonts}
        defaultStyles={defaultStyles}
        onSelectStyle={(id) => save({ activeStyle: id })}
        onChangeStyle={(id, partial) => save({ styles: { [id]: partial } })}
      />
    </section>
  );
}
