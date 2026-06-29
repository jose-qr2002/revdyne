import React from 'react';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        background: 'var(--card, #1e1e2e)', 
        border: '1px solid var(--border, #333)',
        padding: '24px', borderRadius: '12px',
        width: '100%', maxWidth: '400px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        textAlign: 'center'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#ff4d4d' }}>{title}</h3>
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--text2, #aaa)' }}>
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
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#ff4d4d', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Sí, Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}