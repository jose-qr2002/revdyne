import React, { useState, useEffect, useRef } from 'react'; // 🌟 agregar useRef aquí
import TTSControl from './components/TTSControl';
import EngineManagerTab from './components/EngineManagerTab';
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

function App() {
  const { socket, status, events: liveEvents, ttsEvents, clearEvents } = useSocket();

  const [games, setGames] = useState({});
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileGame, setNewProfileGame] = useState('');

  const [activeTab, setActiveTab] = useState('events');

  const [config, setConfig] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [systemError, setSystemError] = useState(null);
  const [availableSounds, setAvailableSounds] = useState([]);

  const soundQueueRef = useRef([]);
  const isPlayingBatchRef = useRef(false);

  function playAlertSound(filename, volume = 1) {
    if (!filename) return;
    const audio = new Audio(`/sounds/${encodeURIComponent(filename)}`);
    audio.volume = volume;
    if (config?.tts?.audioDeviceId && audio.setSinkId) {
      audio.setSinkId(config.tts.audioDeviceId).catch(console.warn);
    }
    audio.play().catch(e => console.error("❌ Error reproduciendo alerta:", e));
  }

  function processSoundQueue() {
    if (isPlayingBatchRef.current) return;
    const next = soundQueueRef.current.shift();
    if (!next) return;

    isPlayingBatchRef.current = true;
    const audio = new Audio(`/sounds/${encodeURIComponent(next.filename)}`);
    audio.volume = next.volume;
    if (config?.tts?.audioDeviceId && audio.setSinkId) {
      audio.setSinkId(config.tts.audioDeviceId).catch(console.warn);
    }

    const finish = () => { isPlayingBatchRef.current = false; processSoundQueue(); };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  }

  useEffect(() => {
    if (ttsEvents && ttsEvents.length > 0) {
      enqueueTTS(ttsEvents[0].text);
    }
  }, [ttsEvents]);

  useEffect(() => {
    apiFetch('/api/sounds/list').then(data => {
      if (Array.isArray(data)) setAvailableSounds(data);
    }).catch(console.error);

    apiFetch('/api/games').then(data => {
      if (data) setGames(data);
    }).catch(console.error);

    apiFetch('/api/config').then(data => {
      if (data) {
        setConfig(data);
        if (data.tts) updateTTSConfig(data.tts);
      }
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('systemError', (errorData) => {
      setSystemError(errorData);
      setTimeout(() => setSystemError(null), 10000);
    });

    socket.on('play-macro-sound', (soundFilename) => {
      playAlertSound(soundFilename);
    });

    socket.on('play-macro-sound-batch', ({ file, times, playbackStyle, volume }) => { // 🌟 nuevo
      if (playbackStyle === 'simultaneous') {
        for (let i = 0; i < times; i++) playAlertSound(file, volume);
      } else {
        for (let i = 0; i < times; i++) soundQueueRef.current.push({ filename: file, volume });
        processSoundQueue();
      }
    });

    return () => {
      socket.off('systemError');
      socket.off('play-macro-sound');
      socket.off('play-macro-sound-batch');
    };
  }, [socket, config]);

  useEffect(() => {
    if (status.connected || (status.message && (status.message.includes('Error') || status.message.includes('Desconectado')))) {
      setIsConnecting(false);
    }
  }, [status]);

  useEffect(() => {
    if (!config || !config.tts) return;

    const handleToggleBot = () => {
      handleUpdateSettings({
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

  // Ajustes generales (username, tts) -> config.json
  const handleUpdateSettings = async (updates) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      if (updates.tts) updateTTSConfig(newConfig.tts);
      return newConfig;
    });
    await apiFetch('/api/config', 'POST', updates);
  };

  // Perfiles, acciones y eventos -> profiles.json
  const handleUpdateProfiles = async (newProfiles) => {
    setConfig(prev => ({ ...prev, profiles: newProfiles }));
    await apiFetch('/api/profiles', 'POST', newProfiles);
  };

  if (!config || !config.catalog) {
    return (
      <div style={{ color: 'white', padding: '40px', textAlign: 'center' }}>
        <h2>⏳ Conectando con el motor principal...</h2>
      </div>
    );
  }

  const profilesData = config?.profiles || { list: {}, activeProfileId: null };
  const activeProfileId = profilesData.activeProfileId;
  const currentProfile = profilesData.list[activeProfileId] || { actions: {}, events: [] };

  const handleProfileUpdate = (updates) => {
    const newProfiles = JSON.parse(JSON.stringify(profilesData));
    newProfiles.list[activeProfileId] = {
      ...newProfiles.list[activeProfileId],
      ...updates
    };
    handleUpdateProfiles(newProfiles);
  };

  const changeProfile = (newId) => {
    handleUpdateProfiles({ ...profilesData, activeProfileId: newId });
  };

  const openNewProfileModal = () => {
    setNewProfileName('');
    setNewProfileGame(Object.keys(games)[0] || '');
    setShowProfileModal(true);
  };

  const saveNewProfile = () => {
    if (!newProfileName.trim()) {
      alert("Por favor, ingresa un nombre para el juego.");
      return;
    }
    if (!newProfileGame) {
      alert("Selecciona un tipo de juego.");
      return;
    }

    const newId = 'prof_' + Date.now();
    const newProfiles = JSON.parse(JSON.stringify(profilesData));

    newProfiles.list[newId] = {
      name: newProfileName,
      game: newProfileGame,
      actions: {},
      events: []
    };
    newProfiles.activeProfileId = newId;

    handleUpdateProfiles(newProfiles);
    setShowProfileModal(false);
  };

  return (
    <>
      <Sidebar
        status={status}
        config={config}
        onConnect={handleConnect}
        onUpdateConfig={handleUpdateSettings}
        isConnecting={isConnecting}
        activeProfileId={activeProfileId}
        profilesList={profilesData.list}
        onChangeProfile={changeProfile}
        onCreateProfile={openNewProfileModal}
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
          <button className={`tab ${activeTab === 'engines' ? 'active' : ''}`} onClick={() => setActiveTab('engines')}>🎙️ Voces y Motores</button>
        </div>

        <div className="tab-content">
          {activeTab === 'events' && (
            <EventsTab
              profiles={profilesData}
              catalog={config.catalog || {}}
              onUpdateProfiles={handleUpdateProfiles}
            />
          )}

          {activeTab === 'actions' && (
            <ActionsTab
              actions={currentProfile.actions || {}}
              allowedActionTypes={games[currentProfile.game]?.allowedActionTypes || ['keyboard']}
              onUpdateConfig={handleProfileUpdate}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogTab
              catalog={config.catalog}
              onCatalogSynced={(newCatalog) => setConfig(prev => ({ ...prev, catalog: newCatalog }))}
            />
          )}

          {activeTab === 'log' && <EventLog events={liveEvents} />}

          {activeTab === 'tts' && <TTSControl config={config} onUpdateConfig={handleUpdateSettings} ttsEvents={ttsEvents} />}

          {activeTab === 'stickers' && (
            <StickersTab
              profiles={profilesData}
              onUpdateProfiles={handleUpdateProfiles}
              activeProfileId={activeProfileId}
              availableSounds={availableSounds}
              ioSocket={socket}
            />
          )}

          {activeTab === 'engines' && <EngineManagerTab />}
        </div>

        {systemError && (
          <div style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#ff4d4d', color: 'white', padding: '16px', borderRadius: '8px', zIndex: 9999 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>⚠️ Error: {systemError.type}</h4>
            <div style={{ fontSize: '13px' }}>{systemError.message}</div>
          </div>
        )}
      </main>

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
              Tipo de juego
            </label>
            <select
              className="modifier-select"
              value={newProfileGame}
              onChange={e => setNewProfileGame(e.target.value)}
              style={{ width: '100%', marginBottom: '24px' }}
            >
              {Object.entries(games).map(([id, g]) => (
                <option key={id} value={id}>{g.label}</option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowProfileModal(false)}>
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