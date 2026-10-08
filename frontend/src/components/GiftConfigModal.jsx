import React, { useState, useEffect } from 'react';
import Icon from './Icon';

// 🎵 NUEVO 1: Agregamos "availableSounds" a las propiedades que recibe el modal
export default function GiftConfigModal({ giftId, giftData, availableSounds = [], onClose, onSave }) {
  const [macroText, setMacroText] = useState('');
  const [selectedSound, setSelectedSound] = useState(''); // 🎵 NUEVO 2: Estado para guardar el mp3 elegido

  // Cargar la macro y el sonido actual cuando se abre el modal
  useEffect(() => {
    if (giftData) {
      setMacroText(giftData.key || '');
      setSelectedSound(giftData.sound || ''); // 🎵 NUEVO 3: Cargar si ya tenía un sonido guardado
    }
  }, [giftData]);

  if (!giftData) return null;

  const handleSave = () => {
    // 🎵 NUEVO 4: Guardamos tanto la macro como el sonido en el config.json
    onSave(giftId, { key: macroText, sound: selectedSound });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: '420px' }}>
        <h3><Icon name="settings" size={18} /> Configurar: {giftData.name}</h3>
        <p className="modal-sub">ID del regalo: {giftId} · {giftData.coins} <Icon name="gem" size={13} /></p>

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
          <small style={{ color: 'var(--text3)', fontSize: '11px', marginTop: '6px', display: 'block', lineHeight: '1.4' }}>
            * Tecla simple: <strong>h</strong><br/>
            * Combinaciones: <strong>{'{ctrl+c}'}</strong><br/>
            * Secuencias: <strong>{'{w}{a}{shift+s}'}</strong>
          </small>
        </div>

        {/* 🎵 NUEVO 5: El Selector de Sonidos */}
        <div className="form-group" style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <label><Icon name="music" size={15} /> Sonido de alerta (opcional)</label>
          <select 
            className="modifier-select" 
            value={selectedSound} 
            onChange={(e) => setSelectedSound(e.target.value)}
            style={{ width: '100%', marginTop: '8px', padding: '10px', background: 'var(--bg3)', color: 'white', border: '1px solid var(--border)' }}
          >
            <option value="">— Ninguno —</option>
            {availableSounds.map((soundFile) => (
              <option key={soundFile} value={soundFile}>
                {soundFile}
              </option>
            ))}
          </select>
          <small style={{ color: 'var(--text3)', fontSize: '11px', marginTop: '6px', display: 'block' }}>
            * Coloca tus archivos .mp3 o .wav en la carpeta "sounds" del proyecto.
          </small>
        </div>

        <div className="modal-actions" style={{ marginTop: '24px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-connect" onClick={handleSave}>Guardar Ajustes</button>
        </div>
      </div>
    </div>
  );
}