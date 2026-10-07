import React from 'react';
import Icon from './Icon';

export default function ModalShell({ isOpen, title, onClose, children, footer, width = '440px' }) {
  if (!isOpen) return null;
  return (
    <div className="anim-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="anim-panel" style={{ background: 'var(--bg2)', border: '1px solid #333', borderRadius: '12px', width: '100%', maxWidth: width, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', lineHeight: 1, display: 'inline-flex' }} aria-label="Cerrar"><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}