import React, { useState, useEffect } from 'react';
import TTSControl from './components/TTSControl';
import { updateTTSConfig, enqueueTTS } from './services/ttsPlayer';
import Sidebar from './components/Sidebar';
import EventLog from './components/EventLog';
import CatalogTab from './components/CatalogTab'; 
import ActionsTab from './components/ActionsTab';
import EventsTab from './components/EventsTab';
import StickersTab from './components/StickersTab';
import { useSocket } from './hooks/useSocket';
import { apiFetch } from './services/api';
import './index.css';
import { SUPPORTED_ENGINES } from '../../src/utils/supportedEngines';

function App() {
  const { socket, status, events: liveEvents, ttsEvents, clearEvents } = useSocket();
  
  // Estados para el Modal de Nuevo Perfil
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileType, setNewProfileType] = useState(SUPPORTED_ENGINES[0].id);

  // 🌟 NUEVO SISTEMA DE PESTAÑAS TIPO TIKFINITY
  const [activeTab, setActiveTab] = useState('events'); 
  
  const [config, setConfig] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [systemError, setSystemError] = useState(null);
  const [availableSounds, setAvailableSounds] = useState([]);

  // 🎵 Función de sonido
  function playAlertSound(filename) {
    if (!filename) return;
    
    const safeFilename = encodeURIComponent(filename);
    const urlCompleta = `/api/alerts/play/${safeFilename}`; 
    
    console.log("🔊 Intentando reproducir por API:", urlCompleta);

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

  // 📡 Carga Inicial de Datos
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

  // 📡 Manejo de Sockets
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

  // Escuchador GLOBAL de Atajos de Teclado
  useEffect(() => {
    if (!config || !config.tts) return;

    const handleToggleBot = () => {
      handleUpdateConfig({ 
        tts: { ...config.tts, enabled: !config.tts.enabled } 
      });
    };

    window.addEventListener('tts-action-toggle-bot', handleToggleBot);
    return () => {
      window.removeEventListener('tts-action-toggle-bot', handleToggleBot);
    };
  }, [config]); 

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

  // ==========================================
  // 🌟 LÓGICA DE PERFILES CORREGIDA Y LIBERADA
  // ==========================================
  const profilesData = config?.profiles || { list: {}, activeProfileId: 'prof_default' };
  const activeProfileId = profilesData.activeProfileId;
  const currentProfile = profilesData.list[activeProfileId] || { actions: {}, events: [] };

  const handleProfileUpdate = (updates) => {
    const newProfiles = JSON.parse(JSON.stringify(profilesData));
    newProfiles.list[activeProfileId] = {
      ...newProfiles.list[activeProfileId],
      ...updates 
    };
    handleUpdateConfig({ profiles: newProfiles });
  };

  const changeProfile = (newId) => {
    handleUpdateConfig({ profiles: { ...profilesData, activeProfileId: newId } });
  };

  // 👇 ESTAS DOS FUNCIONES AHORA ESTÁN SUELTAS Y ACCESIBLES
  const openNewProfileModal = () => {
    setNewProfileName('');
    setNewProfileType('keyboard_universal');
    setShowProfileModal(true);
  };

  const saveNewProfile = () => {
    if (!newProfileName.trim()) {
      alert("Por favor, ingresa un nombre para el juego.");
      return;
    }

    const newId = 'prof_' + Date.now();
    const newProfiles = JSON.parse(JSON.stringify(profilesData));
    
    newProfiles.list[newId] = { 
      name: newProfileName, 
      type: newProfileType, 
      actions: {}, 
      events: [] 
    };
    newProfiles.activeProfileId = newId;
    
    handleUpdateConfig({ profiles: newProfiles });
    setShowProfileModal(false); 
  };

  return (
    <>
      <Sidebar 
        status={status} 
        config={config} 
        onConnect={handleConnect} 
        onUpdateConfig={handleUpdateConfig} 
        isConnecting={isConnecting}
        activeProfileId={activeProfileId}
        profilesList={profilesData.list}
        onChangeProfile={changeProfile}
        onCreateProfile={openNewProfileModal} // 👈 Conectado a la función liberada
      />

      <main className="main">
        <div className="main-header">
          <h2>🎮 Panel de Control Avanzado</h2>
          <div className="header-actions">
            <button className="btn btn-sm" onClick={clearEvents}>Limpiar log</button>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>🔗 Mis Eventos</button>
          <button className={`tab ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')}>⚙️ Mis Acciones</button>
          <button className={`tab ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>🎁 Catálogo TikTok</button>
          <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>📋 Log en vivo</button>
          <button className={`tab ${activeTab === 'tts' ? 'active' : ''}`} onClick={() => setActiveTab('tts')}>🔊 Bot TTS</button>
          <button className={`tab ${activeTab === 'stickers' ? 'active' : ''}`} onClick={() => setActiveTab('stickers')}>🖼️ Stickers</button>
        </div>

        <div className="tab-content">
          {activeTab === 'events' && (
            <EventsTab 
              events={currentProfile.events || []} 
              actions={currentProfile.actions || {}} 
              catalog={config.catalog || {}} 
              onUpdateConfig={handleProfileUpdate} 
            />
          )}

          {activeTab === 'actions' && (
            <ActionsTab 
              actions={currentProfile.actions || {}} 
              onUpdateConfig={handleProfileUpdate} 
            />
          )}
          
          {activeTab === 'catalog' && <CatalogTab catalog={config.catalog} />}
          
          {activeTab === 'log' && <EventLog events={liveEvents} />}
          
          {activeTab === 'tts' && <TTSControl config={config} onUpdateConfig={handleUpdateConfig} ttsEvents={ttsEvents} />}
        
          {activeTab === 'stickers' && (
            <StickersTab 
              actions={config.actions} 
              availableSounds={availableSounds} 
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

      {/* 🌟 LA VENTANA MODAL FLOTANTE */}
      {showProfileModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg2)', padding: '24px', borderRadius: '12px',
            width: '400px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'white' }}>➕ Agregar Nuevo Juego</h3>
            
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text2)' }}>
              Nombre del Juego / Perfil
            </label>
            <input 
              type="text" 
              className="key-input" 
              placeholder="Ej: Minecraft, The Forest..." 
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              style={{ width: '100%', marginBottom: '16px' }}
              autoFocus
            />

            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text2)' }}>
              Motor de Conexión
            </label>
            <select 
              className="modifier-select" 
              value={newProfileType}
              onChange={e => setNewProfileType(e.target.value)}
              style={{ width: '100%', marginBottom: '24px' }}
            >
              {/* 🌟 REACT DIBUJA LAS OPCIONES SOLITO */}
              {SUPPORTED_ENGINES.map(engine => (
                <option key={engine.id} value={engine.id}>
                  {engine.icon} {engine.name}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowProfileModal(false)}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                style={{ background: '#00bcd4', color: '#000', fontWeight: 'bold' }}
                onClick={saveNewProfile}
              >
                Crear Perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;