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
import OverlaysTab from './components/OverlaysTab';
import { useSocket } from './hooks/useSocket';
import { apiFetch } from './services/api';
import LicenseModal from './components/LicenseModal';
import Icon from './components/Icon';
import { NAV_ITEMS } from './components/navItems';
import './index.css';

// audio.volume lanza un error si el valor sale de 0-1, así que se sanea siempre
const clampVolume = (v) => {
  if (v === undefined || v === null) return 1;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
};

function App() {
  const { socket, status, events: liveEvents, ttsEvents, clearEvents } = useSocket();

  const [games, setGames] = useState({});
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileGame, setNewProfileGame] = useState('');

  const [license, setLicense] = useState(null);
  const [showLicense, setShowLicense] = useState(false);
  const [limitNotice, setLimitNotice] = useState(null);

  const fetchLicense = () =>
    fetch('/api/license/status').then(r => r.json()).then(setLicense).catch(() => {});

  useEffect(() => { fetchLicense(); }, []);

  const [activeTab, setActiveTab] = useState('events');

  const [config, setConfig] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [systemError, setSystemError] = useState(null);
  const [availableSounds, setAvailableSounds] = useState([]);

  const soundQueueRef = useRef([]);
  const isPlayingBatchRef = useRef(false);

  const [update, setUpdate] = useState(null); // { status, version, percent, message }
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const configLoaded = config !== null;

  function playAlertSound(filename, volume = 1) {
    if (!filename) return;
    const audio = new Audio(`/sounds/${encodeURIComponent(filename)}`);
    audio.volume = clampVolume(volume);  
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
    audio.volume = clampVolume(next.volume);
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
    if (typeof window.require !== 'function') return;
    const { ipcRenderer } = window.require('electron');

    const onState = (_e, s) => {
      setUpdate(s);
      if (s.status === 'available') setUpdateDismissed(false);
    };
    ipcRenderer.on('update-state', onState);
    ipcRenderer.invoke('get-update-state')
      .then(s => { if (s && s.status !== 'idle') setUpdate(s); })
      .catch(() => {});

    return () => ipcRenderer.removeListener('update-state', onState);
  }, []);

  const sendUpdateAction = (channel) => window.require('electron').ipcRenderer.send(channel);

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
    if (!configLoaded) return;
    try {
      if (typeof window.require === 'function') {
        window.require('electron').ipcRenderer.send('renderer-ready');
      }
    } catch { /* corriendo en un navegador normal */ }
  }, [configLoaded]);

  useEffect(() => {
    if (!socket) return;

    socket.on('systemError', (errorData) => {
      setSystemError(errorData);
      setTimeout(() => setSystemError(null), 10000);
    });

    socket.on('play-macro-sound', (soundFilename, volume) => {
      playAlertSound(soundFilename, volume);
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
    const previous = config?.profiles;
    setConfig(prev => ({ ...prev, profiles: newProfiles }));
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newProfiles)
      });
      if (!res.ok) {
        setConfig(prev => ({ ...prev, profiles: previous }));
        const data = await res.json().catch(() => ({}));
        setLimitNotice(data.error || 'No se pudo guardar el cambio.');
        return;
      }
      fetchLicense(); // actualiza los contadores
    } catch {
      setConfig(prev => ({ ...prev, profiles: previous }));
      setLimitNotice('Error de red al guardar.');
    }
  };

  if (!config || !config.catalog) {
    return (
      <div style={{ color: 'white', padding: '40px', textAlign: 'center' }}>
        <h2><Icon name="clock" size={22} /> Conectando con el motor principal…</h2>
      </div>
    );
  }

  const currentSection = NAV_ITEMS.find(i => i.id === activeTab) || NAV_ITEMS[0];
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
        license={license} onOpenLicense={() => setShowLicense(true)}
        activeTab={activeTab} onSelectTab={setActiveTab}
      />

      <main className="main">
        {update && update.status !== 'idle' && !(update.status === 'available' && updateDismissed) && (
          <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(255,0,80,0.1)', border: '1px solid var(--accent)', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span>
                {update.status === 'available' && <><Icon name="star" size={15} /> Hay una versión nueva: <strong>v{update.version}</strong></>}
                {update.status === 'downloading' && <><Icon name="download" size={15} /> Descargando <strong>v{update.version}</strong>… {update.percent ?? 0}%</>}
                {update.status === 'ready' && <><Icon name="check" size={15} /> <strong>v{update.version}</strong> descargada. Al reiniciar se instalará.</>}
                {update.status === 'error' && <><Icon name="alert" size={15} /> {update.message}</>}
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                {update.status === 'available' && (
                  <>
                    <button className="btn btn-sm btn-secondary" onClick={() => setUpdateDismissed(true)}>Más tarde</button>
                    <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => sendUpdateAction('download-update')}>Descargar ahora</button>
                  </>
                )}
                {update.status === 'error' && (
                  <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => sendUpdateAction('download-update')}>Reintentar</button>
                )}
                {update.status === 'ready' && (
                  <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => sendUpdateAction('install-update')}>Reiniciar e instalar</button>
                )}
              </div>
            </div>

            {update.status === 'downloading' && (
              <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${update.percent ?? 0}%`, height: '100%', background: 'var(--accent)', transition: 'width .3s' }} />
              </div>
            )}
            {update.status === 'installing' && <><Icon name="clock" size={15} /> Instalando <strong>v{update.version}</strong>… La app se cerrará y volverá a abrirse. Si Windows pide permiso, acéptalo.</>}
          </div>
        )}
        {limitNotice && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(255,0,80,0.1)', border: '1px solid var(--accent)', borderRadius: '8px', fontSize: '13px' }}>
            <span><Icon name="lock" size={15} /> {limitNotice}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-sm btn-secondary" onClick={() => setLimitNotice(null)}>Cerrar</button>
              <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff' }}
                onClick={() => { setLimitNotice(null); setShowLicense(true); }}>
                Activar código
              </button>
            </div>
          </div>
        )}
        <div className="main-header">
          <h2>
            <Icon name={currentSection.icon} size={20} />
            {currentSection.label}
          </h2>
          <div className="header-actions">
            {activeTab === 'log' && <button className="btn btn-sm" onClick={clearEvents}>Limpiar log</button>}
          </div>
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

          {activeTab === 'tts' && <TTSControl config={config} onUpdateConfig={handleUpdateSettings} ttsEvents={ttsEvents} license={license}/>}

          {activeTab === 'stickers' && (
            <StickersTab
              profiles={profilesData}
              onUpdateProfiles={handleUpdateProfiles}
              activeProfileId={activeProfileId}
              availableSounds={availableSounds}
              ioSocket={socket}
              antispam={config.stickerAntispam}
              onUpdateSettings={handleUpdateSettings}
            />
          )}

          {activeTab === 'engines' && <EngineManagerTab />}

          {activeTab === 'overlays' && <OverlaysTab socket={socket} profiles={profilesData} />}
        </div>

        {systemError && (
          <div style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#ff4d4d', color: 'white', padding: '16px', borderRadius: '8px', zIndex: 9999 }}>
            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="alert" size={16} /> Error: {systemError.type}</h4>
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
            <h3 style={{ margin: '0 0 16px 0', color: 'white' }}>Agregar nuevo juego</h3>

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
      <LicenseModal
        isOpen={showLicense}
        license={license}
        onClose={() => setShowLicense(false)}
        onChanged={fetchLicense}
      />
    </>
  );
}

export default App;