import React from 'react';

export default function Sidebar({ status, config, onConnect, onUpdateConfig, isConnecting }) {
  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', padding: '20px' }}>
      
      {/* 🌟 LOGO Y TÍTULO */}
      <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        <span className="logo-icon" style={{ fontSize: '32px' }}>🎁</span>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: '#00bcd4', letterSpacing: '1px' }}>Gift Keys</h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text2)' }}>TikTok Live → Teclado</p>
        </div>
      </div>

      {/* 📡 TARJETA DE ESTADO */}
      <div 
        className={`status-card ${status.connected ? 'connected' : ''}`} 
        style={{
          background: 'var(--card)', 
          padding: '16px', 
          borderRadius: '10px', 
          border: `1px solid ${status.connected ? '#4caf50' : 'var(--border)'}`,
          display: 'flex', 
          alignItems: 'center', 
          gap: '14px',
          transition: 'all 0.3s ease'
        }}
      >
        <div 
          className="status-dot" 
          style={{
            width: '14px', 
            height: '14px', 
            borderRadius: '50%', 
            background: status.connected ? '#4caf50' : '#ff4d4d',
            boxShadow: status.connected ? '0 0 10px #4caf50' : 'none',
            transition: 'background 0.3s ease'
          }}
        ></div>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px', color: status.connected ? '#4caf50' : 'white' }}>
            {status.connected ? 'Conectado al Directo' : 'Desconectado'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>
            {status.message || 'Esperando conexión...'}
          </div>
        </div>
      </div>

      {/* 🔌 SECCIÓN DE CONEXIÓN */}
      <div className="connect-section" style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '10px' }}>
        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px', fontWeight: 'bold' }}>
          Usuario de TikTok
        </label>
        
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <span style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.05)', color: 'var(--text2)', borderRight: '1px solid var(--border)', fontWeight: 'bold' }}>
            @
          </span>
          <input 
            type="text" 
            value={config.username || ''} 
            onChange={(e) => onUpdateConfig({ username: e.target.value })} 
            placeholder="ej: tu_canal"
            style={{ flex: 1, padding: '12px', border: 'none', background: 'transparent', color: 'white', outline: 'none', fontSize: '14px' }}
            disabled={status.connected || isConnecting} // Se bloquea si ya conectó
          />
        </div>

        <button 
          className="btn" 
          style={{ 
            width: '100%', 
            padding: '14px', 
            fontSize: '15px', 
            fontWeight: 'bold',
            marginTop: '16px',
            // 🎨 Color rojo si ya está conectado, sino el azul estándar
            backgroundColor: status.connected ? '#e74c3c' : (isConnecting ? '#f39c12' : '#00bcd4'),
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isConnecting ? 'not-allowed' : 'pointer'
          }}
          onClick={() => {
            // Si ya está conectado, al hacer clic llamamos a la función de desconexión
            // Si no lo está, intentamos conectar
            onConnect(config.username);
          }}
          // 🛡️ BLOQUEO INTELIGENTE:
          // Se bloquea si está en medio de una conexión (isConnecting)
          // PERO si ya está conectado, SIEMPRE está disponible para que puedas "Detener"
          disabled={isConnecting && !status.connected} 
        >
          {isConnecting ? '⏳ Conectando...' : (status.connected ? '❌ Desconectar' : '🔌 Conectar')}
        </button>
      </div>

      {/* 🚀 ESPACIADOR FLEXIBLE: Empuja lo de abajo hacia el final de la pantalla */}
      <div style={{ flex: 1 }}></div>

      {/* 🤖 ESTADO DEL ROBOT */}
      <div 
        className="robot-status" 
        style={{
          background: config.robotAvailable ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)',
          border: `1px solid ${config.robotAvailable ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
          padding: '12px 16px', 
          borderRadius: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          fontSize: '14px',
          fontWeight: 'bold'
        }}
      >
        <span style={{ fontSize: '18px' }}>{config.robotAvailable ? '✅' : '⚠️'}</span>
        <span style={{ color: config.robotAvailable ? '#4caf50' : '#ff9800' }}>
          {config.robotAvailable ? 'Motor de Teclado Activo' : 'Modo Simulación'}
        </span>
      </div>
    </aside>
  );
}