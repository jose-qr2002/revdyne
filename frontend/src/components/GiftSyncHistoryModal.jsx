import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import ModalShell from './ModalShell';
import { apiFetch } from '../services/api';

const SHOW_STEP = 60; // regalos que se dibujan de una vez por sección (la primera descarga trae cientos)

const sourceLabel = (run) => {
  if (run.source === 'general') return 'Lista general (sin sala)';
  if (run.source === 'sala') return `Sala de @${run.username || 'desconocido'}`;
  return 'Regalos nuevos vistos en un directo';
};

const formatDate = (at) => new Date(at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function GiftMini({ id, gift }) {
  return (
    <div className="gh-gift" title={`ID ${id}`}>
      <div className="gh-photo">
        {gift?.icon ? <img src={gift.icon} alt={gift.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Icon name="gift" size={18} />}
      </div>
      <div className="gh-gift-info">
        <div className="gh-gift-name ellipsis">{gift?.name || `Regalo ${id}`}</div>
        <div className="gh-gift-meta">ID {id}{gift ? <> · {gift.coins} <Icon name="gem" size={11} /></> : ' · ya no está en el catálogo'}</div>
      </div>
    </div>
  );
}

function ChangeRow({ change, gift }) {
  const parts = [];
  if (change.name) parts.push(<span key="n" className="gh-change">nombre: <s>{change.name[0]}</s> → <strong>{change.name[1]}</strong></span>);
  if (change.coins) parts.push(<span key="c" className="gh-change">monedas: <s>{change.coins[0]}</s> → <strong>{change.coins[1]}</strong></span>);
  if (change.icon) {
    const [before, after] = Array.isArray(change.icon) ? change.icon : ['', ''];
    const thumb = (url) => (url ? <img src={url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <em>sin foto</em>);
    parts.push(<span key="i" className="gh-change gh-photos">foto: <span className="gh-thumb">{thumb(before)}</span> → <span className="gh-thumb">{thumb(after)}</span></span>);
  }
  return (
    <div className="gh-changerow">
      <GiftMini id={change.id} gift={gift} />
      <div className="gh-changes">{parts}</div>
    </div>
  );
}

// Una sección con límite de elementos dibujados y botón para ver más
function Section({ title, count, children }) {
  const [shown, setShown] = useState(SHOW_STEP);
  const items = React.Children.toArray(children);
  if (!items.length) return null;
  return (
    <div className="gh-section">
      <div className="gh-section-title">{title} <span>{count}</span></div>
      <div className="gh-grid">{items.slice(0, shown)}</div>
      {items.length > shown && (
        <button className="btn btn-secondary btn-sm gh-more" onClick={() => setShown(n => n + SHOW_STEP)}>Mostrar más ({items.length - shown} restantes)</button>
      )}
    </div>
  );
}

function RunCard({ run, catalog }) {
  const nuevos = run.nuevos || [];
  const cambios = run.cambios || [];
  const empty = !nuevos.length && !cambios.length;
  return (
    <details className={`gh-run${empty ? ' empty' : ''}`}>
      <summary>
        <span className="gh-when">{formatDate(run.at)}</span>
        <span className="gh-source">{sourceLabel(run)}</span>
        <span className="gh-chips">
          {run.idioma && <span className="gh-chip lang" title="Idioma del perfil del streamer">idioma: {run.idioma}</span>}
          {nuevos.length > 0 && <span className="gh-chip new">+{nuevos.length} nuevos</span>}
          {cambios.length > 0 && <span className="gh-chip upd">{cambios.length} cambiados</span>}
          {empty && <span className="gh-chip">sin cambios</span>}
          {run.listSize != null && <span className="gh-chip">lista de {run.listSize}</span>}
        </span>
      </summary>
      <div className="gh-body">
        {run.roomId && <div className="gh-room">Sala {run.roomId}</div>}
        {empty && <p className="gh-none">Todo lo que trajo esta descarga ya estaba en el catálogo, igual que antes.</p>}
        <Section title="Nuevos" count={nuevos.length}>
          {nuevos.map(id => <GiftMini key={id} id={id} gift={catalog[id]} />)}
        </Section>
        <Section title="Cambiados" count={cambios.length}>
          {cambios.map(c => <ChangeRow key={c.id} change={c} gift={catalog[c.id]} />)}
        </Section>
      </div>
    </details>
  );
}

// Historial TEMPORAL de obtenciones de regalos (lista general, listas de salas y regalos vistos en directo): qué trajo de nuevo y qué cambió cada una.
export default function GiftSyncHistoryModal({ catalog, onClose }) {
  const [runs, setRuns] = useState(null);
  const [onlyNews, setOnlyNews] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/catalog/history').then(res => { if (alive) setRuns(Array.isArray(res?.runs) ? res.runs : []); });
    return () => { alive = false; };
  }, [catalog]); // si el catálogo cambia mientras está abierto (p. ej. otra descarga), se vuelve a pedir

  const visible = (runs || []).filter(r => !onlyNews || (r.nuevos?.length || r.cambios?.length));

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      width="760px"
      title={<><Icon name="clock" size={18} /> Últimas descargas de regalos</>}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}
    >
      <p className="gd-note">
        Herramienta temporal para completar el catálogo probando directos de distintas regiones: cada descarga (lista general, sala de un directo o
        regalos nuevos que llegan en vivo) con lo que trajo de nuevo y lo que cambió. Se guardan las últimas 60.
      </p>
      <label className="gh-filter">
        <input type="checkbox" className="check" checked={onlyNews} onChange={e => setOnlyNews(e.target.checked)} />
        Ocultar las descargas sin novedades
      </label>

      {runs === null && <div className="log-empty">Cargando…</div>}
      {runs !== null && !visible.length && (
        <div className="log-empty">{runs.length ? 'Ninguna descarga trajo novedades.' : 'Todavía no hay descargas registradas. Pulsa "Actualizar / Descargar regalos" o conéctate a un directo.'}</div>
      )}
      <div className="gh-runs">
        {visible.map(run => <RunCard key={`${run.at}-${run.source}-${run.roomId || ''}`} run={run} catalog={catalog} />)}
      </div>
    </ModalShell>
  );
}
