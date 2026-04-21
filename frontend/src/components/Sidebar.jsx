import React, { useState } from 'react';


export default function Sidebar({ status, config, onConnect, onUpdateConfig, isConnecting }) {
  const [usernameInput, setUsernameInput] = useState(config?.username || '');
  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="logo-icon">🎁</span>
        <div>
          <h1>Gift Keys</h1>
          <p>TikTok Live → Teclado</p>
        </div>
      </div>

      {/* STATUS */}
      <div className={`status-card ${status.connected ? 'connected' : ''}`}>
        <div className={`status-dot ${status.connected ? 'on' : ''}`}></div>
        <div>
          <div className="status-label">{status.connected ? 'Conectado' : 'Desconectado'}</div>
          <div className="status-sub">{status.message}</div>
        </div>
      </div>

      {/* CONNECT */}
      <div className="connect-section">
        <label>Usuario TikTok</label>
        <div className="input-row">
          <span className="at">@</span>
          <input 
          type="text" 
          value={config.username || ''} 
          onChange={(e) => onUpdateConfig({ username: e.target.value })} 
          placeholder="ej: bloxipanda"
        />
        </div>
        <button 
          className="btn btn-connect" 
          style={{ 
            width: '100%', 
            padding: '12px', 
            fontSize: '16px', 
            marginTop: '16px',
            // NUEVO: Si está conectado, el botón se pone rojo
            backgroundColor: status.connected ? '#e74c3c' : 'var(--primary)',
            color: 'white',
            border: 'none'
          }}
          onClick={() => onConnect(config.username)}
          disabled={isConnecting} // CORREGIDO: Ahora SOLO se bloquea mientras dice "Conectando..."
        >
          {isConnecting ? '⏳ Conectando...' : (status.connected ? '❌ Desconectar' : '🔌 Conectar')}
        </button>
      </div>

      {/* GLOBAL SETTINGS */}
      <div className="section-title">⚙️ Configuración</div>

      {/* Uso de Tecla Global */}
      <div className="setting-row">
        <label>Tecla global (todos los regalos)</label>
        <div className="toggle-row">
          <label className="switch">
            <input 
              type="checkbox" 
              checked={config.useGlobalKey || false}
              onChange={(e) => onUpdateConfig({ useGlobalKey: e.target.checked })}
            />
            <span className="slider"></span>
          </label>
          <input 
            type="text" 
            className="key-input" 
            placeholder="ej: f13" 
            value={config.globalKey || ''}
            onChange={(e) => onUpdateConfig({ globalKey: e.target.value.toLowerCase() })}
          />
        </div>
      </div>

      {/* Delay entre teclas */}
      <div className="setting-row">
        <label>Delay entre teclas en racha (ms)</label>
        <input 
          type="number" 
          className="small-input" 
          value={config.keyDelayMs || 80} 
          min="30"
          onChange={(e) => onUpdateConfig({ keyDelayMs: parseInt(e.target.value) || 80 })}
        />
      </div>

      {/* Mínimo de monedas */}
      <div className="setting-row">
        <label>Mínimo de monedas</label>
        <input 
          type="number" 
          className="small-input" 
          value={config.minCoins || 0} 
          min="0"
          onChange={(e) => onUpdateConfig({ minCoins: parseInt(e.target.value) || 0 })}
        />
      </div>

      {/* METAS DE LIKES DINÁMICAS */}
      <div className="section-title" style={{ marginTop: '24px' }}>❤️ Metas de Likes</div>
      
      {(config.likeEvents || []).map(ev => (
        <div className="setting-row" key={ev.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ flex: 1, margin: 0 }}>Meta:</label>
          <input 
            type="number" 
            className="small-input" 
            value={ev.threshold} 
            min="1"
            style={{ width: '80px' }}
            onChange={(e) => {
              const newVal = parseInt(e.target.value) || 0;
              
              // 1. Actualiza la regla matemática
              const newEvents = config.likeEvents.map(item => 
                item.id === ev.id ? { ...item, threshold: newVal } : item
              );

              // 2. NUEVO: Actualiza el nombre en la tarjeta visual en tiempo real
              const newMappings = { ...config.giftMappings };
              if (newMappings[`action_like_${ev.id}`]) {
                newMappings[`action_like_${ev.id}`].name = `❤️ Meta de ${newVal} Likes`;
              }

              // 3. Guarda ambas cosas
              onUpdateConfig({ likeEvents: newEvents, giftMappings: newMappings });
            }} 
          />
          <button 
            className="btn btn-secondary" 
            style={{ padding: '4px 8px', minWidth: 'auto', color: '#ff4d4d', background: 'var(--bg3)' }}
            onClick={() => {
              // 1. Borramos la meta del arreglo de eventos
              const newEvents = config.likeEvents.filter(item => item.id !== ev.id);
              
              // 2. NUEVO: Borramos la tarjeta visual (el "regalo falso") de la lista principal
              const newMappings = { ...config.giftMappings };
              delete newMappings[`action_like_${ev.id}`];

              // 3. Enviamos ambas actualizaciones al backend
              onUpdateConfig({ 
                likeEvents: newEvents, 
                giftMappings: newMappings 
              });
            }}
            title="Eliminar meta"
          >✖</button>
        </div>
      ))}

      <button 
        className="btn btn-secondary" 
        style={{ width: '100%', marginTop: '4px', fontSize: '13px' }}
        onClick={() => {
          const newId = Date.now().toString();
          
          // 1. Crea la regla matemática
          const newEvents = [...(config.likeEvents || []), { id: newId, threshold: 100 }];
          
          // 2. NUEVO: Crea la tarjeta visual instantáneamente
          const newMappings = { ...config.giftMappings };
          newMappings[`action_like_${newId}`] = {
            name: "❤️ Meta de 100 Likes",
            coins: 0,
            key: "",
            modifier: "none",
            enabled: true,
            icon: "https://cdn-icons-png.flaticon.com/512/833/833472.png"
          };

          // 3. Guarda ambas cosas
          onUpdateConfig({ likeEvents: newEvents, giftMappings: newMappings });
        }}
      >
        + Añadir evento de Like
      </button>


      {/* Robot Status dinámico */}
      <div className={`robot-status ${config.robotAvailable ? 'ok' : 'warn'}`}>
        <span>{config.robotAvailable ? '✅' : '⚠️'}</span>
        <span>{config.robotAvailable ? 'RobotJS Activo' : 'Solo Simulación'}</span>
      </div>
    </aside>
  );
}