import React, { useState, useEffect } from 'react';
import GiftTierIcon from './GiftTier';
import Icon from './Icon';

export default function GiftCard({ giftId, giftData, onUpdate, onDelete, onTest, onOpenConfig }) {
  const [isListening, setIsListening] = useState(false);

  // Escuchar el teclado cuando le damos clic al botón
  useEffect(() => {
    if (!isListening) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      // Ignorar teclas modificadoras solas
      if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
      
      const newKey = e.key.toLowerCase();
      onUpdate(giftId, { key: newKey });
      setIsListening(false);
    };

    const handleClickOutside = () => setIsListening(false);

    document.addEventListener('keydown', handleKeyDown);
    // Un pequeño delay para que el clic que activa el listening no lo cancele inmediatamente
    setTimeout(() => document.addEventListener('click', handleClickOutside), 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isListening, giftId, onUpdate]);

  const getIconUrl = (iconData) => {
    if (!iconData) return null;
    if (typeof iconData === 'string') return iconData; // Si es el paquete inicial
    if (iconData.url_list && iconData.url_list.length > 0) return iconData.url_list[0]; // Si viene de TikTok
    return null;
  };

  const iconUrl = getIconUrl(giftData.icon);

  const keyDisplay = giftData.key 
    ? `${giftData.modifier !== 'none' ? giftData.modifier + '+' : ''}${giftData.key}` 
    : 'Clic para asignar';

  return (
    <div className={`gift-card ${giftData.key ? 'has-key' : ''}`}>
      <div className="gift-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {iconUrl ? (
          <img 
            src={iconUrl} 
            alt={giftData.name} 
            style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'contain' }} 
            onError={(e) => { e.target.style.display = 'none'; }} 
          />
        ) : (
          <GiftTierIcon coins={giftData.coins} size={28} />
        )}
      </div>
      
      <div className="gift-info">
        <div className="gift-name">{giftData.name}</div>
        <div className="gift-meta">
          ID: {giftId} · {giftData.coins || 0} <Icon name="gem" size={13} />
        </div>
      </div>

      <div className="gift-controls">
        <label className="switch" title="Activar/Desactivar">
          <input 
            type="checkbox" 
            checked={giftData.enabled} 
            onChange={(e) => onUpdate(giftId, { enabled: e.target.checked })}
          />
          <span className="slider"></span>
        </label>

        {/* NUEVO BOTÓN PARA ABRIR EL MODAL */}
        <button 
          className={`key-badge ${giftData.key ? 'has-value' : ''}`}
          onClick={() => onOpenConfig(giftId)}
          style={{ minWidth: '100px' }}
        >
          <Icon name="settings" size={14} /> {giftData.key ? 'Editar macro' : 'Configurar'}
        </button>

        <button className="btn btn-test" onClick={() => onTest(giftId)} title="Probar tecla">Test</button>
      </div>
    </div>
  );
}