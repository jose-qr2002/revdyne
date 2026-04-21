import React, { useState, useEffect } from 'react';

export default function GiftConfigModal({ giftId, giftData, onClose, onSave }) {
  const [macroText, setMacroText] = useState('');

  // Cargar la macro actual cuando se abre el modal
  useEffect(() => {
    if (giftData) {
      setMacroText(giftData.key || '');
    }
  }, [giftData]);

  if (!giftData) return null;

  const handleSave = () => {
    onSave(giftId, { key: macroText });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: '420px' }}> {/* Un poco más ancho para comodidad */}
        <h3>⚙️ Configurar: {giftData.name}</h3>
        <p className="modal-sub">ID del regalo: {giftId} · {giftData.coins} 💎</p>

        <div className="form-group" style={{ marginTop: '12px' }}>
          <label>Secuencia de Teclas (Macro)</label>
          <textarea 
            className="key-input" 
            rows="3"
            placeholder="Ej: {t}hola{enter} o secuencias largas..."
            value={macroText}
            onChange={(e) => setMacroText(e.target.value)}
            style={{ resize: 'vertical', width: '100%', fontFamily: 'monospace', fontSize: '14px' }}
          ></textarea>
          <small style={{ color: 'var(--text3)', fontSize: '11px', marginTop: '6px', lineHeight: '1.4' }}>
            * Tecla simple: <strong>h</strong><br/>
            * Combinaciones: <strong>{'{ctrl+c}'}</strong><br/>
            * Secuencias: <strong>{'{w}{a}{shift+s}'}</strong>
          </small>
        </div>

        {/* ESPACIO PARA FUTURAS CONFIGURACIONES */}
        <div className="form-group" style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <label style={{ color: 'var(--text3)' }}>🔧 Próximamente: Comandos de consola, animaciones extra, etc...</label>
        </div>

        <div className="modal-actions" style={{ marginTop: '24px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-connect" onClick={handleSave}>Guardar Ajustes</button>
        </div>
      </div>
    </div>
  );
}