import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../services/api';
import Icon from './Icon';
import ModalShell from './ModalShell';
import ConfirmModal from './ConfirmModal';

// Tamaño del lienzo (el mismo que calcula backend/overlays/ranking.html)
const WIDTH = { 1: 340, 2: 360 };
const ROW = 64, GAP = 8, TITLE = 46, CROWN_PAD = 18;
const canvasSize = (cfg) => ({
  w: WIDTH[cfg.activeStyle] || 340,
  h: (cfg.showTitle ? TITLE : 0) + cfg.rows * ROW + (cfg.rows - 1) * GAP + (cfg.activeStyle === 2 ? CROWN_PAD : 0),
});

const METRIC_HELP = {
  gifters: 'Suma las monedas de los regalos de cada persona (un regalo en ráfaga cuenta cada unidad nueva una sola vez).',
  likes: 'Suma los likes que da cada persona.',
  comments: 'Cuenta los comentarios de cada persona.',
  shares: 'Cuenta las veces que cada persona comparte el directo.',
};
const COLORS = [
  ['cardColor', 'Fondo de las filas'], ['titleColor', 'Color del título'], ['nameColor', 'Color de los nombres'], ['valueColor', 'Color del valor'],
];
const PERIOD_LABEL = { live: 'del directo', day: 'del día', month: 'del mes' };
const SAVE_DEBOUNCE_MS = 350;
const TARGET_KEY = 'overlayTarget';

const readTarget = () => {
  try { return localStorage.getItem(TARGET_KEY) === 'obs' ? 'obs' : 'studio'; } catch { return 'studio'; }
};

function Toggle({ label, checked, onChange }) {
  return (
    <label className={`pz-toggle ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {checked ? '●' : '○'} {label}
    </label>
  );
}

export default function RankingCard({ board, metricLabel, socket }) {
  const { kind, slug, metric, period } = board;
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState(0);
  const [owner, setOwner] = useState(''); // cuenta cuyos tops se muestran
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState(false);
  const [target, setTarget] = useState(readTarget);
  const [showCustomize, setShowCustomize] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: 'reset' } | { type: 'remove', row }
  const [boxW, setBoxW] = useState(0); // ancho del recuadro de la vista previa (para centrarla)

  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const previewRef = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length) apiFetch(`/api/overlays/ranking/${kind}`, 'POST', patch);
  }, [kind]);

  useEffect(() => {
    apiFetch('/api/overlays/ranking').then(res => {
      if (!res?.configs?.[kind]) return;
      setData({ config: res.configs[kind], defaults: res.defaults[kind], fonts: res.fonts, publicBaseUrl: res.publicBaseUrl });
      setRows(res.state?.[kind]?.rows || []);
      setOwner(res.state?.[kind]?.owner || '');
      setClients(res.clients?.[kind] || 0);
    });
    return flush; // no perder el último cambio al cambiar de sección
  }, [flush, kind]);

  // La vista previa abierta hace que el servidor emita el estado: la lista de abajo se actualiza con él
  useEffect(() => {
    if (!socket) return;
    const onClients = (n) => setClients(n);
    const onState = (st) => { setRows(st?.rows || []); setOwner(st?.owner || ''); };
    socket.on(`overlay:${kind}:clients`, onClients);
    socket.on(`overlay:${kind}:state`, onState);
    return () => { socket.off(`overlay:${kind}:clients`, onClients); socket.off(`overlay:${kind}:state`, onState); };
  }, [socket, kind]);

  const size = data ? canvasSize(data.config) : { w: 340, h: 300 };

  // La vista previa es la propia página del overlay, escalada al ancho disponible
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setScale(Math.min(1, el.clientWidth / size.w)); setBoxW(el.clientWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, size.w]);

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
  const obsUrl = `${host}/overlays/ranking/${slug}`;
  const studioUrl = `${publicBaseUrl}/ranking/${slug}?port=${appPort}`;
  const overlayUrl = target === 'studio' ? studioUrl : obsUrl;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin permiso de portapapeles: el campo es seleccionable a mano */ }
  };

  const remove = async (key) => {
    setRows(r => r.filter(x => x.key !== key)); // el servidor confirma con el estado nuevo
    await apiFetch(`/api/overlays/ranking/${kind}/entries/${encodeURIComponent(key)}`, 'DELETE');
  };
  const doConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (c?.type === 'remove') await remove(c.row.key);
    else if (c?.type === 'reset') { setRows([]); await apiFetch(`/api/overlays/ranking/${kind}/reset`, 'POST'); }
  };

  const connected = clients > 0;
  const previewLeft = Math.max(0, (boxW - size.w * scale) / 2); // centrada en el recuadro

  return (
    <section className="lk">
      <header className="lk-head">
        <h3>{cfg.title || metricLabel} <small className="rk-period">{PERIOD_LABEL[period]}</small>{owner && <small className="rk-period">@{owner}</small>}</h3>
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
        <button className="lk-icon" onClick={() => apiFetch(`/api/overlays/ranking/${kind}/test`, 'POST')} title="Probar con datos de ejemplo" aria-label="Probar"><Icon name="play" size={16} /></button>
        <button className="lk-icon" onClick={() => setConfirm({ type: 'reset' })} title="Borrar este top" aria-label="Reiniciar"><Icon name="refresh" size={16} /></button>
        <button className="btn btn-sm btn-secondary rk-custom" onClick={() => setShowCustomize(true)}><Icon name="settings" size={15} /> Personalizar</button>
      </div>

      <div className="rk-grid">
        <div className="lk-stage" ref={previewRef} style={{ height: size.h * scale }}>
          <iframe
            key={`${kind}-${cfg.activeStyle}-${cfg.rows}-${cfg.showTitle}`}
            title="Vista previa del overlay"
            src={`/overlays/ranking/${slug}?preview=1`}
            width={size.w} height={size.h}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left', marginLeft: previewLeft }}
          />
          <span className="lk-size">{size.w}×{size.h}</span>
        </div>

        <div className="rk-list">
          <div className="rk-list-head">Puestos actuales</div>
          {rows.length === 0 && <div className="rk-empty">Aún no hay datos. Aparecerán cuando lleguen eventos del directo.</div>}
          {rows.map(r => (
            <div className="rk-item" key={r.key}>
              <span className="rk-pos">{r.rank}</span>
              {r.avatar ? <img src={r.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="rk-av"><Icon name="user" size={16} /></span>}
              <span className="rk-name" title={r.username ? `@${r.username}` : ''}>{r.name}</span>
              <b className="rk-val">{Number(r.value).toLocaleString('es')}</b>
              <button className="lk-icon" onClick={() => setConfirm({ type: 'remove', row: r })} title="Quitar de este top" aria-label={`Quitar a ${r.name}`}><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
      </div>

      <p className="lk-hint">
        {METRIC_HELP[metric]}{' '}
        {period === 'day' && 'Es el top del día: se conserva al cerrar la app y entre directos del mismo día, y se reinicia a medianoche.'}
        {period === 'month' && 'Es el top del mes: se conserva al cerrar la app y entre directos, y se reinicia al empezar el mes.'}
        {period === 'live' && 'Es el top del directo: una caída de conexión no lo borra; se reinicia al cerrar la app, al conectarte a otro usuario o con el botón de reiniciar.'}{' '}
        El propio streamer no aparece en los tops.{' '}
        {target === 'studio'
          ? <>En Live Studio añade una fuente <strong>Enlace</strong> con esa URL; con <strong>Resolución personalizada</strong> pon el tamaño de la vista previa ({size.w}×{size.h}) y el overlay se ajusta al recuadro.</>
          : <>En OBS añade una fuente <strong>Navegador</strong> con esa URL y tamaño {size.w}×{size.h}.</>}
        {' '}Solo trabaja mientras el enlace esté en uso.
      </p>

      <ConfirmModal
        isOpen={!!confirm}
        title={confirm?.type === 'reset' ? 'Reiniciar este top' : 'Quitar del top'}
        message={confirm?.type === 'reset'
          ? `Se borrarán todos los puestos de "${cfg.title || metricLabel}" (${PERIOD_LABEL[period]}). ${period === 'live' ? '' : 'También se borra lo guardado. '}No se puede deshacer.`
          : `¿Quitar a ${confirm?.row?.name} de este top? Su puntaje se borra y volverá a sumar desde cero si participa de nuevo.`}
        confirmLabel={confirm?.type === 'reset' ? 'Sí, reiniciar' : 'Sí, quitar'}
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />

      <ModalShell
        isOpen={showCustomize}
        title={<><Icon name="settings" size={16} /> Personalizar {(cfg.title || metricLabel).toLowerCase()}</>}
        onClose={() => setShowCustomize(false)}
        width="760px"
        footer={<>
          <button className="btn btn-secondary" onClick={() => save(defaults)}>Restablecer</button>
          <button className="btn btn-primary" onClick={() => setShowCustomize(false)}>Listo</button>
        </>}
      >
        <div className="rk-modal">
          <div className="lk-form">
            <label>Título
              <input className="key-input" type="text" maxLength={40} value={cfg.title} onChange={e => save({ title: e.target.value })} />
            </label>
            <label>Estilo
              <select className="modifier-select" value={cfg.activeStyle} onChange={e => save({ activeStyle: Number(e.target.value) })}>
                <option value={1}>1. Clásico</option>
                <option value={2}>2. Numerado</option>
              </select>
            </label>
            <label>Fuente
              <select className="modifier-select" value={cfg.font} onChange={e => save({ font: e.target.value })}>
                {fonts.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label>Puestos a mostrar: {cfg.rows}
              <input type="range" className="pz-range" min="3" max="10" value={cfg.rows} onChange={e => save({ rows: Number(e.target.value) })} />
            </label>
            <label>Tamaño del título y nombres: {cfg.fontScale}%
              <input type="range" className="pz-range" min="60" max="160" value={cfg.fontScale} onChange={e => save({ fontScale: Number(e.target.value) })} />
            </label>
            <label>Tamaño del valor: {cfg.valueScale}%
              <input type="range" className="pz-range" min="50" max="150" value={cfg.valueScale} onChange={e => save({ valueScale: Number(e.target.value) })} />
            </label>
            <label>Opacidad del fondo de las filas: {cfg.cardOpacity}%
              <input type="range" className="pz-range" min="0" max="100" value={cfg.cardOpacity} onChange={e => save({ cardOpacity: Number(e.target.value) })} />
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
            <Toggle label="Avatares" checked={cfg.showAvatar} onChange={v => save({ showAvatar: v })} />
            <Toggle label="Rectángulos de fondo" checked={cfg.showCards} onChange={v => save({ showCards: v })} />
            <Toggle label="Nombres arcoíris" checked={cfg.rainbowNames} onChange={v => save({ rainbowNames: v })} />
            <Toggle label="Puestos vacíos" checked={cfg.showEmpty} onChange={v => save({ showEmpty: v })} />
            <Toggle label="Animación" checked={cfg.animate} onChange={v => save({ animate: v })} />
          </div>
        </div>
      </ModalShell>
    </section>
  );
}
