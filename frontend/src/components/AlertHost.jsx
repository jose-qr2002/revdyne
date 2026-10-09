import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { subscribe, showAlert } from '../services/dialog';

const ICONS = { warning: 'alert', error: 'x', info: 'info' };
const DEFAULT_TITLES = { warning: 'Aviso', error: 'Error', info: 'Información' };

// Muestra los avisos de showAlert() como modal. Se monta una sola vez, en App.jsx. Además redirige window.alert (por si algún día
// alguien lo vuelve a usar) para que NUNCA salga el cuadro nativo del sistema.
export default function AlertHost() {
  const [queue, setQueue] = useState([]);
  const returnFocusTo = useRef(null);
  const okRef = useRef(null);
  const current = queue[0];

  useEffect(() => subscribe((item) => setQueue(q => [...q, item])), []);

  useEffect(() => {
    const native = window.alert;
    window.alert = (message) => { showAlert(message); };
    return () => { window.alert = native; };
  }, []);

  // Al abrirse, el foco pasa al botón (Enter cierra); al cerrarse vuelve al campo donde se estaba escribiendo
  const opened = !!current;
  useEffect(() => {
    if (!opened) return;
    returnFocusTo.current = document.activeElement;
    okRef.current?.focus();
    return () => {
      const el = returnFocusTo.current;
      if (el && el !== document.body && document.contains(el) && typeof el.focus === 'function') el.focus();
    };
  }, [opened]);

  const close = () => {
    current?.resolve();
    setQueue(q => q.slice(1));
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!current) return null;
  const type = ICONS[current.type] ? current.type : 'warning';

  return createPortal(
    <div className="anim-backdrop alert-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="anim-panel alert-panel" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-text">
        <div className={`alert-icon ${type}`}><Icon name={ICONS[type]} size={22} /></div>
        <div className="alert-body">
          <h3 id="alert-title">{current.title || DEFAULT_TITLES[type]}</h3>
          <p id="alert-text">{current.message}</p>
        </div>
        <div className="alert-actions">
          <button ref={okRef} className="btn btn-primary" onClick={close}>Entendido</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
