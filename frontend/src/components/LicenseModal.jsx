import React, { useState } from 'react';
import ModalShell from './ModalShell';

const fmt = (n) => (n === null || n === undefined ? '∞' : n);

export default function LicenseModal({ isOpen, license, onClose, onChanged }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  if (!isOpen || !license) return null;
  const isPro = license.tier === 'pro';
  const limits = license.limits || {};
  const usage = license.usage || {};

  const call = async (path, body) => {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/license/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setMessage({ type: 'error', text: data.error || 'No se pudo completar la acción.' });
      } else {
        setCode('');
        setMessage({ type: 'success', text: path === 'activate' ? '✅ Licencia activada' : 'Licencia desactivada en este equipo' });
        onChanged();
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de red.' });
    }
    setBusy(false);
  };

  const rows = [
    ['Acciones', usage.actions, limits.maxActions],
    ['Eventos', usage.events, limits.maxEvents],
    ['Stickers asignados', usage.stickers, limits.maxStickerBindings],
  ];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={isPro ? '⭐ Plan Pro' : '🔓 Plan Gratis'}
      width="460px"
      footer={<button className="btn btn-secondary" onClick={onClose}>Cerrar</button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(([label, used, max]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text2)' }}>{label}</span>
              <strong style={{ color: max !== null && used >= max ? 'var(--accent2)' : 'inherit' }}>
                {used ?? 0} / {fmt(max)}
              </strong>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text2)' }}>Motores de voz</span>
            <strong>{limits.ttsEngines ? 'Solo voces del sistema' : 'Todos'}</strong>
          </div>
        </div>

        {isPro ? (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
              {license.expiresAt
                ? `Vence el ${new Date(license.expiresAt * 1000).toLocaleDateString()}`
                : 'Sin fecha de vencimiento'}
              {' · '}Equipo {license.device}
            </div>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => call('deactivate')}>
              Desactivar en este equipo
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text2)' }}>Código de activación</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="key-input" placeholder="RVD-XXXX-XXXX-XXXX-XXXX" value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter' && code.trim() && !busy) call('activate', { code }); }}
                style={{ flex: 1 }}
              />
              <button
                className="btn" style={{ background: 'var(--accent)', color: '#fff' }}
                disabled={busy || !code.trim()} onClick={() => call('activate', { code })}
              >
                {busy ? '⏳' : 'Activar'}
              </button>
            </div>
          </div>
        )}

        {message && (
          <div style={{ fontSize: '12px', color: message.type === 'error' ? 'var(--accent2)' : 'var(--green)' }}>
            {message.text}
          </div>
        )}
      </div>
    </ModalShell>
  );
}