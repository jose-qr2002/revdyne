import React, { useState, useEffect, useRef } from 'react';
import TTSControl from './components/TTSControl';
import { updateTTSConfig, enqueueTTS } from './services/ttsPlayer';
import Sidebar from './components/Sidebar';
import GiftCard from './components/Giftcard';
import GiftConfigModal from './components/GiftConfigModal';
import EventLog from './components/EventLog';
import { useSocket } from './hooks/useSocket';
import { apiFetch } from './services/api';
import './index.css';

function App() {
  const { socket, status, events, ttsEvents, newGift, clearEvents } = useSocket();
  const [activeTab, setActiveTab] = useState('mappings');
  const [config, setConfig] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('coinsAsc'); 
  const [editingGiftId, setEditingGiftId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [systemError, setSystemError] = useState(null);

  // 🎵 NUEVO 1: Estado para guardar la lista de sonidos mp3/wav disponibles
  const [availableSounds, setAvailableSounds] = useState([]);

  // 🎵 NUEVO 2: Cargar la lista de sonidos desde tu carpeta al abrir la app
  useEffect(() => {
    fetch('/api/alerts/list')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setAvailableSounds(data);
      })
      .catch(e => console.error("Error cargando sonidos:", e));
  }, []);

  // Escuchar la respuesta real de TikTok
  useEffect(() => {
    if (status.connected) {
      setIsConnecting(false);
    } 
    else if (status.message && (status.message.includes('Error') || status.message.includes('Desconectado'))) {
      setIsConnecting(false);
    }
  }, [status]);

  useEffect(() => {
    if (!socket) return;
    
    socket.on('systemError', (errorData) => {
      setSystemError(errorData);
      setTimeout(() => setSystemError(null), 10000); 
    });

    // 🎵 NUEVO 3: Escuchar cuando llega un regalo para hacer sonar la alerta
    const handleGiftEvent = (data) => {
      if (!config || !config.giftMappings) return;

      console.log("🎁 Regalo recibido por socket:", data);
      
      // Buscamos el regalo (por si el ID viene como número o como texto)
      const mappedGift = config.giftMappings[data.giftId] || config.giftMappings[String(data.giftId)];

      // Buscamos si el regalo que acaba de llegar tiene un sonido asignado
      if (mappedGift && mappedGift.sound) {
        console.log("🎵 Reproduciendo sonido del regalo:", mappedGift.sound);
        playAlertSound(mappedGift.sound);
      }
    };

    socket.on('gift', handleGiftEvent);

    return () => {
      socket.off('gift', handleGiftEvent);
    };
  }, [socket, config]);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  useEffect(() => {
    apiFetch('/api/config').then(data => {
      if (data) {
        setConfig(data);
        updateTTSConfig(data.tts || {}); 
      }
    });
  }, []);

  useEffect(() => {
    if (ttsEvents.length > 0) {
      enqueueTTS(ttsEvents[0].text); 
    }
  }, [ttsEvents]);

  useEffect(() => {
    if (newGift && config) {
      setConfig(prev => {
        if (prev.giftMappings[newGift.giftId]) return prev;

        return {
          ...prev,
          giftMappings: {
            ...prev.giftMappings,
            [newGift.giftId]: {
              name: newGift.giftName,
              coins: newGift.coins,
              key: '',
              modifier: 'none',
              sound: '', // 🎵 NUEVO 4: Dejamos el espacio listo para el sonido
              enabled: true,
              icon: newGift.icon
            }
          }
        };
      });
    }
  }, [newGift]); 

  // NUEVO: Escuchar CADA pulsación de tecla que nos manda el backend
  useEffect(() => {
    if (!socket) return;

    const handleMacroSound = (soundFilename) => {
      console.log(`🎵 Haciendo sonar la tecla con: ${soundFilename}`);
      playAlertSound(soundFilename);
    };

    socket.on('play-macro-sound', handleMacroSound);

    return () => {
      socket.off('play-macro-sound', handleMacroSound);
    };
  }, [socket]);

  

  const handleConnect = async (username) => {
    if (isConnecting) return; 
    setIsConnecting(true); 
    const cleanUsername = username.replace('@', '').trim();

    try {
      if (status.connected) {
        await apiFetch('/api/disconnect', 'POST');
        setIsConnecting(false); 
      } else {
        await apiFetch('/api/connect', 'POST', { username: cleanUsername });
      }
    } catch (error) {
      console.error("Error al conectar:", error);
      setIsConnecting(false); 
    }
  };

  const handleUpdateGift = async (id, updates) => {
    setConfig(prev => ({
      ...prev,
      giftMappings: {
        ...prev.giftMappings,
        [id]: { ...prev.giftMappings[id], ...updates }
      }
    }));
    await apiFetch(`/api/gift/${id}`, 'PUT', updates);
  };

  const handleUpdateConfig = async (updates) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      if (updates.tts) updateTTSConfig(newConfig.tts); 
      return newConfig;
    });
    await apiFetch('/api/config', 'POST', updates);
  };

  if (!config) return <div style={{ color: 'white', padding: '20px' }}>Cargando conexión con el servidor...</div>;

  const handleDeleteGift = async (id) => {
    setConfig(prev => {
      const newMappings = { ...prev.giftMappings };
      delete newMappings[id];
      return { ...prev, giftMappings: newMappings };
    });
    await apiFetch(`/api/gift/${id}`, 'DELETE');
  };

  // BOTÓN DE PRUEBA ACTUALIZADO
  const handleTestKey = async (id) => {
    const gift = config.giftMappings[id]; 
    
    if (gift && gift.key) {
      // Le mandamos la tecla y el sonido al backend. 
      // El backend la pondrá en la cola, simulará la macro y nos mandará la señal de regreso para que suene.
      await apiFetch('/api/test-key', 'POST', { 
        key: gift.key, 
        modifier: gift.modifier,
        sound: gift.sound // 🎵 NUEVO: Le pasamos el sonido en la petición
      });
    }
  };

  // REPRODUCTOR DE ALERTAS
  const playAlertSound = (filename) => {
    if (!filename) return;
    
    // Forzamos la ruta completa (Asegúrate de que el puerto sea el tuyo, usualmente 3000)
    const urlCompleta = `http://localhost:3000/api/alerts/play/${filename}`;
    console.log("🔊 Intentando reproducir:", urlCompleta);
    
    const audio = new Audio(urlCompleta);
    
    if (config.tts && config.tts.audioDeviceId && audio.setSinkId) {
      audio.setSinkId(config.tts.audioDeviceId).catch(console.warn);
    }
    
    audio.play().catch(e => console.error("❌ Error reproduciendo alerta:", e));
  };

  const allFilteredGifts = Object.entries(config?.giftMappings || {})
    .filter(([id, data]) => 
      data.name.toLowerCase().includes(searchTerm.toLowerCase()) || id.includes(searchTerm)
    )
    .sort((a, b) => {
      const [idA, giftA] = a;
      const [idB, giftB] = b;
      
      if (sortBy === 'coinsDesc') return giftB.coins - giftA.coins;
      if (sortBy === 'coinsAsc') return giftA.coins - giftB.coins;
      if (sortBy === 'nameAsc') return giftA.name.localeCompare(giftB.name);
      if (sortBy === 'nameDesc') return giftB.name.localeCompare(giftA.name);
      if (sortBy === 'assignedFirst') {
        const aAssigned = giftA.key ? 1 : 0;
        const bAssigned = giftB.key ? 1 : 0;
        return bAssigned - aAssigned;
      }
      return 0;
    });

  const totalPages = Math.ceil(allFilteredGifts.length / ITEMS_PER_PAGE);
  const paginatedGifts = allFilteredGifts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (!config || !config.giftMappings) {
    return (
      <div style={{ color: 'white', padding: '40px', textAlign: 'center' }}>
        <h2>⏳ Conectando con el motor principal...</h2>
        <p>Si esta pantalla no desaparece, el servidor backend no está enviando la configuración correctamente.</p>
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
          <h2>🎮 Mapeo de Regalos → Teclas</h2>
          <div className="header-actions">
            <button className="btn btn-sm" onClick={clearEvents}>Limpiar log</button>
            <button className="btn btn-sm btn-secondary">+ Agregar manual</button>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => setActiveTab('mappings')}>🎁 Regalos</button>
          <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>📋 Log en vivo</button>
          <button className={`tab ${activeTab === 'tts' ? 'active' : ''}`} onClick={() => setActiveTab('tts')}>🔊 Bot TTS</button>
        </div>

        <div className="tab-content">
          {activeTab === 'mappings' && (
            Object.keys(config.giftMappings || {}).length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎁</div>
                <h3>Esperando regalos...</h3>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', background: 'var(--card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <input 
                    type="text" className="key-input" placeholder="🔍 Buscar por nombre o ID..." 
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  />
                  <select className="modifier-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: '180px' }}>
                    <option value="coinsDesc">💰 Mayor a Menor</option>
                    <option value="coinsAsc">🪙 Menor a Mayor</option>
                    <option value="nameAsc">🔤 A - Z</option>
                    <option value="nameDesc">🔠 Z - A</option>
                    <option value="assignedFirst">✅ Asignados primero</option>
                  </select>
                </div>

                <div className="gift-list">
                  {paginatedGifts.map(([id, data]) => (
                    <GiftCard 
                      key={id} giftId={id} giftData={data} 
                      onUpdate={handleUpdateGift} onDelete={handleDeleteGift} onTest={handleTestKey}
                      onOpenConfig={setEditingGiftId}
                    />
                  ))}
                  {allFilteredGifts.length === 0 && <div className="log-empty">No se encontraron regalos con esa búsqueda.</div>}
                </div>

                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ opacity: currentPage === 1 ? 0.5 : 1 }}>◀ Anterior</button>
                    <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Página {currentPage} de {totalPages}</span>
                    <button className="btn btn-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}>Siguiente ▶</button>
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'log' && <EventLog events={events} />}

          {activeTab === 'tts' && (
             <TTSControl config={config} onUpdateConfig={handleUpdateConfig} ttsEvents={ttsEvents} />
          )}
        </div>

        {systemError && (
          <div style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#ff4d4d', color: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 9999, maxWidth: '400px', borderLeft: '6px solid #8b0000' }}>
            <h4 style={{ margin: '0 0 8px 0', display: 'flex', justifyContent: 'space-between' }}>
              ⚠️ Error del Sistema
              <button onClick={() => setSystemError(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>✖</button>
            </h4>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', wordWrap: 'break-word' }}>
              <strong>{systemError.type}</strong>: {systemError.message}
            </div>
          </div>
        )}
      </main>

      {editingGiftId && config.giftMappings?.[editingGiftId] && (
        <GiftConfigModal
          giftId={editingGiftId}
          giftData={config.giftMappings[editingGiftId]}
          availableSounds={availableSounds} // 🎵 NUEVO 5: Le pasamos los sonidos al Modal
          onClose={() => setEditingGiftId(null)}
          onSave={handleUpdateGift}
        />
      )}
    </>
  );
}

export default App;