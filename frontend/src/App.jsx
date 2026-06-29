import React, { useState, useEffect } from 'react';
import TTSControl from './components/TTSControl';
import { updateTTSConfig, enqueueTTS } from './services/ttsPlayer';
import Sidebar from './components/Sidebar';
import EventLog from './components/EventLog';
// 👇 IMPORTACIONES FUTURAS (Aún no existen, pero las dejaremos listas)
import CatalogTab from './components/CatalogTab'; 
import ActionsTab from './components/ActionsTab';
import EventsTab from './components/EventsTab';
import StickersTab from './components/StickersTab';
import { useSocket } from './hooks/useSocket';
import { apiFetch } from './services/api';
import './index.css';

function App() {
  const { socket, status, events: liveEvents, ttsEvents, clearEvents } = useSocket();
  
  // 🌟 NUEVO SISTEMA DE PESTAÑAS TIPO TIKFINITY
  const [activeTab, setActiveTab] = useState('events'); 
  
  const [config, setConfig] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [systemError, setSystemError] = useState(null);
  const [availableSounds, setAvailableSounds] = useState([]);

  // 🎵 Función de sonido (Se mantiene igual)
  function playAlertSound(filename) {
    if (!filename) return;
    const urlCompleta = `/api/alerts/play/${filename}`;
    const audio = new Audio(urlCompleta);
    if (config && config.tts && config.tts.audioDeviceId && audio.setSinkId) {
      audio.setSinkId(config.tts.audioDeviceId).catch(console.warn);
    }
    audio.play().catch(e => console.error("❌ Error reproduciendo alerta:", e));
  }

  useEffect(() => {
    if (ttsEvents && ttsEvents.length > 0) {
      enqueueTTS(ttsEvents[0].text); 
    }
  }, [ttsEvents]);

  // 📡 Carga Inicial de Datos (Sonidos y Configuración Nueva)
  useEffect(() => {
    fetch('/api/alerts/list')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setAvailableSounds(data); })
      .catch(console.error);

    apiFetch('/api/config').then(data => {
      if (data) {
        setConfig(data);
        if (data.tts) updateTTSConfig(data.tts); 
      }
    });
  }, []);

  // 📡 Manejo de Sockets (Errores y Sonidos)
  useEffect(() => {
    if (!socket) return;
    
    socket.on('systemError', (errorData) => {
      setSystemError(errorData);
      setTimeout(() => setSystemError(null), 10000); 
    });

    socket.on('play-macro-sound', (soundFilename) => {
      playAlertSound(soundFilename);
    });

    return () => {
      socket.off('systemError');
      socket.off('play-macro-sound');
    };
  }, [socket, config]);

  // 📡 Conexión de TikTok
  useEffect(() => {
    if (status.connected || (status.message && (status.message.includes('Error') || status.message.includes('Desconectado')))) {
      setIsConnecting(false);
    }
  }, [status]);

  const handleConnect = async (username) => {
    if (isConnecting) return; 
    setIsConnecting(true); 
    const cleanUsername = username.replace('@', '').trim();
    try {
      if (status.connected) {
        await apiFetch('/api/disconnect', 'POST');
      } else {
        await apiFetch('/api/connect', 'POST', { username: cleanUsername });
      }
    } catch (error) {
      console.error("Error al conectar:", error);
      setIsConnecting(false); 
    }
  };

  const handleUpdateConfig = async (updates) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      if (updates.tts) updateTTSConfig(newConfig.tts); 
      return newConfig;
    });
    await apiFetch('/api/config', 'POST', updates);
  };

  // Pantalla de carga
  if (!config || !config.catalog) {
    return (
      <div style={{ color: 'white', padding: '40px', textAlign: 'center' }}>
        <h2>⏳ Conectando con el motor principal...</h2>
      </div>
    );
  }

  return (
    <>
      <Sidebar 
        status={status} 
        config={config} 
        onConnect={handleConnect} 
        onUpdateConfig={handleUpdateConfig} 
        isConnecting={isConnecting}
      />

      <main className="main">
        <div className="main-header">
          <h2>🎮 Panel de Control Avanzado</h2>
          <div className="header-actions">
            <button className="btn btn-sm" onClick={clearEvents}>Limpiar log</button>
          </div>
        </div>

        {/* 🌟 LA NUEVA NAVEGACIÓN MODULAR */}
        <div className="tabs">
          <button className={`tab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>🔗 Mis Eventos</button>
          <button className={`tab ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')}>⚙️ Mis Acciones</button>
          <button className={`tab ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>🎁 Catálogo TikTok</button>
          <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>📋 Log en vivo</button>
          <button className={`tab ${activeTab === 'tts' ? 'active' : ''}`} onClick={() => setActiveTab('tts')}>🔊 Bot TTS</button>
          <button className={`tab ${activeTab === 'stickers' ? 'active' : ''}`} onClick={() => setActiveTab('stickers')}>🖼️ Stickers</button>
        </div>

        <div className="tab-content">
          {/* Aquí inyectaremos los nuevos componentes en los próximos pasos */}
          {activeTab === 'events' && (
            <EventsTab 
              events={config.events} 
              actions={config.actions} 
              catalog={config.catalog} 
              onUpdateConfig={handleUpdateConfig} 
            />
          )}
          
          {activeTab === 'actions' && (
            <ActionsTab 
              actions={config.actions} 
              //availableSounds={availableSounds} 
              onUpdateConfig={handleUpdateConfig} 
            />
          )}
          
          {activeTab === 'catalog' && <CatalogTab catalog={config.catalog} />}
          
          {activeTab === 'log' && <EventLog events={liveEvents} />}
          
          {activeTab === 'tts' && <TTSControl config={config} onUpdateConfig={handleUpdateConfig} ttsEvents={ttsEvents} />}
        
          {activeTab === 'stickers' && (
            <StickersTab 
              actions={config.actions} 
              availableSounds={availableSounds} // 👈 AÑADE ESTA LÍNEA
              ioSocket={socket}
            />
          )}
        </div>

        {systemError && (
          <div style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#ff4d4d', color: 'white', padding: '16px', borderRadius: '8px', zIndex: 9999 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>⚠️ Error: {systemError.type}</h4>
            <div style={{ fontSize: '13px' }}>{systemError.message}</div>
          </div>
        )}
      </main>
    </>
  );
}

export default App;