import React, { useState, useEffect } from 'react';
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
  const [isConnecting, setIsConnecting] = useState(false); // NUEVO ESTADO

  // Arriba junto a tus otros estados
  const [systemError, setSystemError] = useState(null);

  // NUEVO: Escuchar la respuesta real de TikTok
  useEffect(() => {
    // Si ya logró conectarse, apagamos el "Cargando..."
    if (status.connected) {
      setIsConnecting(false);
    } 
    // Si TikTok nos mandó un error (como "LIVE has ended" o "Usuario no encontrado"), también lo apagamos
    else if (status.message && (status.message.includes('Error') || status.message.includes('Desconectado'))) {
      setIsConnecting(false);
    }
  }, [status]);

  // Dentro de tu useEffect que ya escucha el socket, añade la escucha del error:
  useEffect(() => {
    if (!socket) return;
    
    // ... tus otras escuchas (giftReceived, ttsComment, etc)

    socket.on('systemError', (errorData) => {
      setSystemError(errorData);
      // Ocultar el error después de 10 segundos
      setTimeout(() => setSystemError(null), 10000); 
    });
  }, [socket]);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // NUEVO: Si el usuario escribe en el buscador o cambia el orden, regresamos a la página 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  // Cargar configuración real desde Node.js al abrir la app
  useEffect(() => {
    apiFetch('/api/config').then(data => {
      if (data) {
        setConfig(data);
        updateTTSConfig(data.tts || {}); // Le pasamos la config al reproductor
      }
    });
  }, []);

  // Escuchar comentarios del socket y mandarlos a la cola de audio
  useEffect(() => {
    if (ttsEvents.length > 0) {
      // Tomamos el último comentario que llegó y lo mandamos al reproductor
      enqueueTTS(ttsEvents[0].text); 
    }
  }, [ttsEvents]);

  // 2. NUEVO: Agregar este useEffect para meter el nuevo regalo a la vista
  useEffect(() => {
    if (newGift && config) {
      setConfig(prev => {
        // Por si acaso ya existe, no hacemos nada
        if (prev.giftMappings[newGift.giftId]) return prev;

        // Si no existe, lo inyectamos a la lista de mapeos
        return {
          ...prev,
          giftMappings: {
            ...prev.giftMappings,
            [newGift.giftId]: {
              name: newGift.giftName,
              coins: newGift.coins,
              key: '',
              modifier: 'none',
              enabled: true,
              icon: newGift.icon
            }
          }
        };
      });
    }
  }, [newGift]); // Se ejecuta cada vez que llega un regalo nuevo

  // Funciones para interactuar con el backend
  const handleConnect = async (username) => {
    if (isConnecting) return; 
    
    setIsConnecting(true); // 1. Encendemos el botón rojo
    const cleanUsername = username.replace('@', '').trim();

    try {
      if (status.connected) {
        // Si estamos apagando el bot, esto es rápido
        await apiFetch('/api/disconnect', 'POST');
        setIsConnecting(false); 
      } else {
        // Si nos estamos conectando, enviamos la orden...
        await apiFetch('/api/connect', 'POST', { username: cleanUsername });
        // ❌ ¡AQUÍ NO APAGAMOS EL BOTÓN!
        // Dejaremos que el servidor trabaje en segundo plano.
      }
    } catch (error) {
      console.error("Error al conectar:", error);
      setIsConnecting(false); // Solo se apaga si se cae nuestro propio servidor
    }
  };

  const handleUpdateGift = async (id, updates) => {
    // Actualizar UI rápido (optimistic update)
    setConfig(prev => ({
      ...prev,
      giftMappings: {
        ...prev.giftMappings,
        [id]: { ...prev.giftMappings[id], ...updates }
      }
    }));
    // Enviar al server
    await apiFetch(`/api/gift/${id}`, 'PUT', updates);
  };

  const handleUpdateConfig = async (updates) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      // Si se actualizó el TTS, le avisamos al reproductor
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

  const handleTestKey = async (id) => {
    const gift = config.giftMappings[id];
    if (gift && gift.key) {
      await apiFetch('/api/test-key', 'POST', { key: gift.key, modifier: gift.modifier });
    }
  };

  const playTikTokVoice = async (textToRead) => {
    try {
      // Llamamos a la nueva ruta que acabamos de agregar
      const response = await fetch('/api/tts/tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: textToRead,
          voice: config.ttsVoice || 'es_mx_002' 
        })
      });
      
      const data = await response.json();

      if (data.success && data.audio) {
        const sound = new Audio(`data:audio/mp3;base64,${data.audio}`);
        sound.play();
      }
    } catch (error) {
      console.error("No se pudo reproducir el TTS de TikTok:", error);
    }
  };

  // 1. Primero filtramos y ordenamos TODOS los regalos
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

  // 2. Calculamos cuántas páginas hay en total
  const totalPages = Math.ceil(allFilteredGifts.length / ITEMS_PER_PAGE);

  // 3. Extraemos SOLO los 50 regalos de la página actual
  const paginatedGifts = allFilteredGifts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE, 
    currentPage * ITEMS_PER_PAGE
  );

  // POR ESTO:
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
      {/* Pasamos el estado del socket al Sidebar */}
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
                
                {/* BARRA DE FILTROS */}
                <div style={{ display: 'flex', gap: '10px', background: 'var(--card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <input 
                    type="text" 
                    className="key-input" 
                    placeholder="🔍 Buscar por nombre o ID..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <select 
                    className="modifier-select" 
                    value={sortBy} 
                    onChange={e => setSortBy(e.target.value)}
                    style={{ minWidth: '180px' }}
                  >
                    <option value="coinsDesc">💰 Mayor a Menor</option>
                    <option value="coinsAsc">🪙 Menor a Mayor</option>
                    <option value="nameAsc">🔤 A - Z</option>
                    <option value="nameDesc">🔠 Z - A</option>
                    <option value="assignedFirst">✅ Asignados primero</option>
                  </select>
                </div>

                {/* LISTA PAGINADA */}
                <div className="gift-list">
                  {paginatedGifts.map(([id, data]) => (
                    <GiftCard 
                      key={id} giftId={id} giftData={data} 
                      onUpdate={handleUpdateGift} onDelete={handleDeleteGift} onTest={handleTestKey}
                      onOpenConfig={setEditingGiftId}
                    />
                  ))}
                  {allFilteredGifts.length === 0 && (
                     <div className="log-empty">No se encontraron regalos con esa búsqueda.</div>
                  )}
                </div>
                {/* CONTROLES DE PAGINACIÓN */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
                    <button 
                      className="btn btn-secondary" 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                      style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
                    >
                      ◀ Anterior
                    </button>
                    
                    <span style={{ fontSize: '13px', color: 'var(--text2)' }}>
                      Página {currentPage} de {totalPages}
                    </span>

                    <button 
                      className="btn btn-secondary" 
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
                    >
                      Siguiente ▶
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'log' && <EventLog events={events} />}

          {activeTab === 'tts' && (
             <TTSControl 
               config={config} 
               onUpdateConfig={handleUpdateConfig} 
               ttsEvents={ttsEvents} 
             />
          )}
        </div>
        {/* CONSOLA FLOTANTE DE ERRORES */}
        {systemError && (
          <div style={{
            position: 'fixed', bottom: '20px', right: '20px', 
            background: '#ff4d4d', color: 'white', padding: '16px', 
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 9999, maxWidth: '400px', borderLeft: '6px solid #8b0000'
          }}>
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
      {/* EL MODAL DE CONFIGURACIÓN */}
      {editingGiftId && config.giftMappings?.[editingGiftId] && (
        <GiftConfigModal
          giftId={editingGiftId}
          giftData={config.giftMappings[editingGiftId]}
          onClose={() => setEditingGiftId(null)}
          onSave={handleUpdateGift}
        />
      )}
    </>
    
  );
}

export default App;