import React, { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';

export default function StickersTab({ actions, availableSounds, ioSocket }) {
  const [catalog, setCatalog] = useState({});
  const [assignments, setAssignments] = useState({});
  const [notification, showToast] = useState(null);

  // 🌟 Estados para el Modal de Confirmación
  const [modalOpen, setModalOpen] = useState(false);
  const [stickerToDelete, setStickerToDelete] = useState(null);

  // Carga inicial desde la API
  useEffect(() => {
    fetch('/api/stickers/config')
      .then(res => res.json())
      .then(data => {
        console.log("🔍 [FRONTEND DEBUG] Datos recibidos de la API:", data); // ¡MIRA ESTO!
        setCatalog(data.catalog || {});
        setAssignments(data.assignments || {});
      })
      .catch((e) => console.error("Error cargando:", e));
  }, []);

  // Escuchar en tiempo real si aparece un sticker nuevo mientras juegas
  useEffect(() => {
    if (!ioSocket) return;
    ioSocket.on('catalog:newSticker', (newCatalog) => {
      setCatalog(newCatalog);
    });
    return () => ioSocket.off('catalog:newSticker');
  }, [ioSocket]);

  const handleAssignAction = async (emoteId, actionId) => {
    try {
      const res = await fetch('/api/stickers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoteId, actionId, enabled: assignments[emoteId]?.enabled ?? true })
      });
      const data = await res.json();
      if (data.success) {
        setAssignments(data.assignments);
        // showToast('¡Sticker vinculado con éxito!');
      }
    } catch {
      showToast('Error al guardar vinculación');
    }
  };

  const handleToggleSticker = async (emoteId) => {
    const current = assignments[emoteId] || { actionId: '', enabled: true };
    try {
      const res = await fetch('/api/stickers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoteId, actionId: current.actionId, enabled: !current.enabled })
      });
      const data = await res.json();
      if (data.success) setAssignments(data.assignments);
    } catch {
      showToast('Error al cambiar estado');
    }
  };

  // 🗑️ Preparar eliminación (Abre el modal)
  const requestDelete = (emoteId, data) => {
    setStickerToDelete({ id: emoteId, name: data.name });
    setModalOpen(true);
  };

  // 🗑️ Ejecutar eliminación real
  const confirmDelete = async () => {
    if (!stickerToDelete) return;
    
    try {
      const res = await fetch(`/api/stickers/${stickerToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        // Actualizar el estado local para que desaparezca al instante sin recargar
        const newCatalog = { ...catalog };
        delete newCatalog[stickerToDelete.id];
        setCatalog(newCatalog);
        
        const newAssignments = { ...assignments };
        delete newAssignments[stickerToDelete.id];
        setAssignments(newAssignments);
      }
    } catch (e) {
      console.error('Error al eliminar sticker', e);
    }
    
    // Cerrar modal y limpiar
    setModalOpen(false);
    setStickerToDelete(null);
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* 🌟 Invocamos el Modal (está oculto hasta que modalOpen sea true) */}
      <ConfirmModal 
        isOpen={modalOpen}
        title="⚠️ Eliminar Sticker"
        message={`¿Estás seguro que deseas eliminar el sticker "${stickerToDelete?.name}"? Dejará de funcionar en tus alertas.`}
        onConfirm={confirmDelete}
        onCancel={() => setModalOpen(false)}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🎴 Radar de Stickers de Suscriptores</h3>
        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
          Los stickers se agregan aquí automáticamente cuando alguien los usa en tu chat en vivo.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Object.keys(catalog).length === 0 ? (
          <div className="log-empty">Ningún sticker detectado aún. Envía un sticker en tu chat de TikTok para probarlo.</div>
        ) : (
          Object.entries(catalog).map(([emoteId, data]) => {
            const currentAssign = assignments[emoteId] || { actionId: '', enabled: false };
            return (
              <div key={emoteId} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {data.icon ? (
                    <img src={data.icon} alt={data.name} style={{ width: '48px', height: '48px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} />
                  ) : (
                    <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>✨</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{data.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ID: {emoteId}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Disparar Acción:</label>
                    <select 
                      className="modifier-select"
                      value={currentAssign.actionId}
                      onChange={(e) => handleAssignAction(emoteId, e.target.value)}
                      style={{ minWidth: '180px' }}
                    >
                      <option value="">🚫 Ninguna (Ignorar)</option>
                      
                      <optgroup label="⌨️ ACCIONES Y MACROS">
                        {Object.entries(actions || {}).map(([actId, act]) => (
                          <option key={actId} value={`action:${actId}`}>⌨️ {act.name}</option>
                        ))}
                      </optgroup>
                      
                      <optgroup label="🎵 SONIDOS DIRECTOS">
                        {(availableSounds || []).map(sound => (
                          <option key={sound} value={`sound:${sound}`}>🎵 {sound}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <label className="switch" style={{ marginTop: '16px' }}>
                    <input 
                      type="checkbox" 
                      disabled={!currentAssign.actionId}
                      checked={currentAssign.enabled && !!currentAssign.actionId} 
                      onChange={() => handleToggleSticker(emoteId)} 
                    />
                    <span className="slider"></span>
                  </label>
                  {/* 🗑️ BOTÓN DE ELIMINAR */}
                  <button 
                    onClick={() => requestDelete(emoteId, data)}
                    style={{ 
                      marginTop: '16px', background: 'transparent', border: 'none', 
                      cursor: 'pointer', fontSize: '18px', padding: '4px 8px', 
                      borderRadius: '4px', transition: '0.2s' 
                    }}
                    title="Eliminar Sticker"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}