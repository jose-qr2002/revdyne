import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../services/api';

// Tamaño del lienzo de cada estilo (el mismo que usa backend/overlays/top.html)
const STYLES = {
  1: { label: 'Tarjeta horizontal', w: 560, h: 170 },
  2: { label: 'Etiqueta compacta', w: 480, h: 150 },
  3: { label: 'Vertical centrada', w: 320, h: 374, hOver: 314 }, // hOver: alto cuando el nombre va sobre el regalo
};
const COPY = {
  topgift: { head: 'Mejor regalo', slug: 'gift', help: 'Muestra el regalo de mayor valor del directo con la cantidad de su racha (p. ej. Capibara ×30). No es acumulativo: solo lo reemplaza un regalo de más valor (100 rosas no desplazan a un capibara); si empatan en valor, gana la racha más larga.' },
  topcombo: { head: 'Mejor combo', slug: 'combo', help: 'Muestra la racha más larga del directo (lo que TikTok muestra como "x100") y quién la hizo. Cuenta como combo desde 2 unidades.' },
};
const COLORS = [
  ['accentColor', 'Acento'], ['cardColor', 'Fondo de la tarjeta'], ['titleColor', 'Color del título'],
  ['nameColor', 'Color del usuario'], ['valueColor', 'Color del valor'],
];
const SAVE_DEBOUNCE_MS = 350;
const TARGET_KEY = 'overlayTarget';

const svg = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
  copy: svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7" />),
  play: svg(<path d="M7 4.5v15l12-7.5z" />),
  reset: svg(<><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></>),
};

function readTarget() {
  try { return localStorage.getItem(TARGET_KEY) === 'obs' ? 'obs' : 'studio'; } catch { return 'studio'; }
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className={`pz-toggle ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {checked ? '●' : '○'} {label}
    </label>
  );
}

export default function TopCard({ kind, socket }) {
  const copy = COPY[kind];
  const [data, setData] = useState(null);
  const [clients, setClients] = useState(0);
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState(false);
  const [target, setTarget] = useState(readTarget);

  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const previewRef = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length) apiFetch(`/api/overlays/top/${kind}`, 'POST', patch);
  }, [kind]);

  useEffect(() => {
    apiFetch('/api/overlays/top').then(res => {
      if (!res?.[kind]) return;
      setData({ config: res[kind], defaults: res.defaults[kind], fonts: res.fonts, publicBaseUrl: res.publicBaseUrl });
      setClients(res.clients?.[kind] || 0);
    });
    return flush; // no perder el último cambio al cambiar de pestaña
  }, [flush, kind]);

  useEffect(() => {
    if (!socket) return;
    const onClients = (n) => setClients(n);
    socket.on(`overlay:${kind}:clients`, onClients);
    return () => socket.off(`overlay:${kind}:clients`, onClients);
  }, [socket, kind]);

  const base = STYLES[data?.config?.activeStyle] || STYLES[2];
  const style = data?.config?.nameOverIcon && base.hOver ? { ...base, h: base.hOver } : base;

  // La vista previa es la propia página del overlay, escalada al ancho disponible
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / style.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, style.w]);

  const save = (patch) => {
    setData(d => ({ ...d, config: { ...d.config, ...patch } }));
    pendingRef.current = { ...pendingRef.current, ...patch };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  if (!data) return <div className="empty-state"><p>Cargando overlay…</p></div>;

  const { config: cfg, defaults, fonts, publicBaseUrl } = data;
  const chooseTarget = (t) => {
    setTarget(t);
    try { localStorage.setItem(TARGET_KEY, t); } catch { /* sin almacenamiento: solo no se recuerda */ }
  };
  // TikTok LIVE Studio rechaza 'localhost'; la IP apunta al mismo servidor. En desarrollo (Vite) se deja el origen.
  const host = import.meta.env.DEV ? window.location.origin : window.location.origin.replace('//localhost', '//127.0.0.1');
  const appPort = import.meta.env.DEV ? 3000 : (window.location.port || 3000);
  const obsUrl = `${host}/overlays/top/${copy.slug}`;
  const studioUrl = `${publicBaseUrl}/top/${copy.slug}?port=${appPort}`;
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
    <section className="lk">
      <header className="lk-head">
        <h3>{copy.head}</h3>
        <span className={`lk-chip ${connected ? 'on' : ''}`} title="Estado del Browser Source en OBS / Live Studio">
          <i /> OBS {connected ? 'enlazado' : 'sin enlazar'}
        </span>
      </header>

      <div className="lk-stage" ref={previewRef} style={{ height: style.h * scale }}>
        <iframe
          title="Vista previa del overlay"
          src={`/overlays/top/${copy.slug}?preview=1`}
          width={style.w} height={style.h}
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
        <span className="lk-size">{style.w}×{style.h}</span>
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
        <button className="lk-icon" onClick={() => apiFetch(`/api/overlays/top/${kind}/test`, 'POST')} title="Probar con datos de ejemplo" aria-label="Probar">{ICONS.play}</button>
        <button className="lk-icon" onClick={() => apiFetch(`/api/overlays/top/${kind}/reset`, 'POST')} title="Borrar el líder actual" aria-label="Reiniciar">{ICONS.reset}</button>
      </div>

      <div className="lk-form">
        <label>Título
          <input className="key-input" type="text" maxLength={40} value={cfg.title} onChange={e => save({ title: e.target.value })} />
        </label>
        <label>Estilo
          <select className="modifier-select" value={cfg.activeStyle} onChange={e => save({ activeStyle: Number(e.target.value) })}>
            {Object.entries(STYLES).map(([id, s]) => <option key={id} value={id}>{id}. {s.label}</option>)}
          </select>
        </label>
        <label>Fuente
          <select className="modifier-select" value={cfg.font} onChange={e => save({ font: e.target.value })}>
            {fonts.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        {kind === 'topgift' && (
          <label>Valor a mostrar
            <select className="modifier-select" value={cfg.valueMode} onChange={e => save({ valueMode: e.target.value })}>
              <option value="count">Cantidad (×30)</option>
              <option value="coins">Monedas totales</option>
              <option value="both">Cantidad y monedas</option>
            </select>
          </label>
        )}
        <label>Usuario
          <select className="modifier-select" value={cfg.userField} onChange={e => save({ userField: e.target.value })}>
            <option value="nickname">Nombre visible</option>
            <option value="username">@usuario</option>
          </select>
        </label>
        <label>Tamaño del texto: {cfg.fontScale}%
          <input type="range" className="pz-range" min="60" max="160" value={cfg.fontScale} onChange={e => save({ fontScale: Number(e.target.value) })} />
        </label>
        <label>Tamaño del valor (monedas / ×N): {cfg.valueScale}%
          <input type="range" className="pz-range" min="50" max="150" value={cfg.valueScale} onChange={e => save({ valueScale: Number(e.target.value) })} />
        </label>
      </div>

      <div className="lk-form">
        {COLORS.map(([key, label]) => (
          <label key={key}>{label}
            <span className="pz-color">
              <input type="color" value={cfg[key]} onChange={e => save({ [key]: e.target.value })} />
              {cfg[key]}
            </span>
          </label>
        ))}
      </div>

      <div className="pz-toggles">
        <Toggle label="Título" checked={cfg.showTitle} onChange={v => save({ showTitle: v })} />
        <Toggle label="Icono del regalo" checked={cfg.showIcon} onChange={v => save({ showIcon: v })} />
        <Toggle label="Usuario" checked={cfg.showUser} onChange={v => save({ showUser: v })} />
        <Toggle label="Animación" checked={cfg.animate} onChange={v => save({ animate: v })} />
        <Toggle label="Fondo del título transparente" checked={cfg.transparentTitle} onChange={v => save({ transparentTitle: v })} />
        <Toggle label="Fondo del valor transparente" checked={cfg.transparentValue} onChange={v => save({ transparentValue: v })} />
        {cfg.activeStyle === 3 && <Toggle label="Nombre sobre el regalo" checked={cfg.nameOverIcon} onChange={v => save({ nameOverIcon: v })} />}
        <button className="btn btn-sm btn-secondary" onClick={() => save(defaults)}>Restablecer</button>
      </div>

      <p className="lk-hint">
        {copy.help}{' '}
        {target === 'studio'
          ? <>En Live Studio añade una fuente <strong>Enlace</strong> con esa URL; con <strong>Resolución personalizada</strong> pon el tamaño de arriba ({style.w}×{style.h}) y el overlay se ajusta al recuadro.</>
          : <>En OBS añade una fuente <strong>Navegador</strong> con esa URL y tamaño {style.w}×{style.h}.</>}
        {' '}Se reinicia al conectarte a un directo y solo trabaja mientras el enlace esté en uso.
      </p>
    </section>
  );
}
