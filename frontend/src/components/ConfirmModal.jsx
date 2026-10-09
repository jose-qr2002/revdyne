import React, { useState, useEffect } from 'react';

// Aviso de confirmación. `confirmDelaySeconds` > 0 deshabilita el botón de confirmar durante esos segundos (con cuenta atrás en el
// propio botón), para acciones difíciles de deshacer como eliminar un perfil.
export default function ConfirmModal({ isOpen, ...props }) {
  // El cuerpo solo existe mientras el aviso está abierto: así la cuenta atrás empieza de cero cada vez que se abre
  return isOpen ? <ConfirmBody {...props} /> : null;
}

function ConfirmBody({ title, message, onConfirm, onCancel, confirmLabel = 'Sí, Eliminar', confirmDelaySeconds = 0 }) {
  const [remaining, setRemaining] = useState(confirmDelaySeconds);

  useEffect(() => {
    if (confirmDelaySeconds <= 0) return;
    const timer = setInterval(() => setRemaining(r => (r <= 1 ? (clearInterval(timer), 0) : r - 1)), 1000);
    return () => clearInterval(timer);
  }, [confirmDelaySeconds]);

  const locked = remaining > 0;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, backdropFilter: 'blur(3px)'
    }}>
      <div role="alertdialog" aria-modal="true" style={{
        background: 'var(--card, #1e1e2e)',
        border: '1px solid var(--border, #333)',
        padding: '24px', borderRadius: '12px',
        width: '100%', maxWidth: '400px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        textAlign: 'center'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#ff4d4d' }}>{title}</h3>
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--text2, #aaa)', overflowWrap: 'anywhere' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#444', color: 'white', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={locked}
            aria-label={locked ? `${confirmLabel} (disponible en ${remaining} segundos)` : confirmLabel}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#ff4d4d', color: 'white', fontWeight: 'bold',
              cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.45 : 1, minWidth: '120px'
            }}
          >
            {confirmLabel}{locked ? ` (${remaining})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
