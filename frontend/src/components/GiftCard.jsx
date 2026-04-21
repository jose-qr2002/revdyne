import React, { useState, useEffect } from 'react';

export default function GiftCard({ giftId, giftData, onUpdate, onDelete, onTest, onOpenConfig }) {
  const [isListening, setIsListening] = useState(false);

  // Función para obtener el emoji según las monedas (la misma que tenías)
  const getGiftEmoji = (coins) => {
    if (!coins || coins < 5) return '🌹';
    if (coins < 20) return '🍪';
    if (coins < 50) return '🎁';
    if (coins < 100) return '✨';
    if (coins < 500) return '💎';
    if (coins < 1000) return '🚀';
    return '👑';
  };

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
          getGiftEmoji(giftData.coins)
        )}
      </div>
      
      <div className="gift-info">
        <div className="gift-name">{giftData.name}</div>
        <div className="gift-meta">
          ID: {giftId} · {giftData.coins || 0} 💎
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
          {giftData.key ? '⚙️ Editar Macro' : '⚙️ Configurar'}
        </button>

        <button className="btn btn-test" onClick={() => onTest(giftId)} title="Probar tecla">Test</button>
      </div>
    </div>
  );
}