import React, { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';

export default function StickersTab({ activeProfileId, ioSocket }) {
  const [catalog, setCatalog] = useState({});
  const [profiles, setProfiles] = useState(null); // { activeProfileId, list } completo, desde /api/profiles
  const [scope, setScope] = useState('global'); // 'global' | 'current'
  const [notification, setNotification] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [stickerToDelete, setStickerToDelete] = useState(null);
  const isElectron = typeof window.require === 'function';

  const CATEGORY_LABELS = {
    tiktok: '🌐 Emotes de TikTok',
    fanclub: '❤️ Club de Fans',
    superfan: '⭐ Super Fan',
    unknown: '❓ Sin clasificar (detectados en vivo)'
  };

  const groupedCatalog = Object.entries(catalog).reduce((groups, [id, data]) => {
    const cat = data.category || 'unknown';
    (groups[cat] = groups[cat] || []).push([id, data]);
    return groups;
  }, {});

  const categoryOrder = ['tiktok', 'fanclub', 'superfan', 'unknown'];

  const showToast = (type, text) => setNotification({ type, text });

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  const fetchCatalog = () => {
    fetch('/api/stickers/config')
      .then(res => res.json())
      .then(data => setCatalog(data.catalog || {}))
      .catch(e => console.error("Error cargando catálogo de stickers:", e));
  };

  const fetchProfiles = () => {
    fetch('/api/profiles')
      .then(res => res.json())
      .then(setProfiles)
      .catch(e => console.error("Error cargando perfiles:", e));
  };

  useEffect(() => {
    fetchCatalog();
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (!ioSocket) return;
    ioSocket.on('catalog:newSticker', (newCatalog) => setCatalog(newCatalog));
    return () => ioSocket.off('catalog:newSticker');
  }, [ioSocket]);

  if (!profiles) {
    return <div style={{ padding: '20px' }}>⏳ Cargando perfiles...</div>;
  }

  const scopeProfileId = scope === 'global' ? 'prof_global' : activeProfileId;
  const scopeProfile = profiles.list[scopeProfileId] || { actions: {}, events: [] };
  const scopeActions = scopeProfile.actions || {};
  const scopeEvents = scopeProfile.events || [];
  const canUseCurrentScope = activeProfileId && activeProfileId !== 'prof_global';

  const findAssignment = (stickerId) =>
    scopeEvents.find(e => e.trigger === 'sticker' && e.condition === stickerId);

  const syncStickers = async () => {
    const res = await fetch('/api/stickers/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) { setCatalog(data.catalog); showToast('success', `${data.added} stickers nuevos`); }
    else showToast('error', data.error);
  }

  const handleAssignAction = async (stickerId, actionId) => {
    try {
      if (!actionId) {
        await fetch(`/api/stickers/${stickerId}/assign/${scopeProfileId}`, { method: 'DELETE' });
      } else {
        await fetch('/api/stickers/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: scopeProfileId, stickerId, actionId, enabled: true })
        });
      }
      fetchProfiles();
    } catch {
      showToast('error', 'Error al guardar la vinculación');
    }
  };

  const handleTikTokLogin = () => {
    if (!isElectron) return showToast('error', 'Esta función solo está disponible en la app de escritorio');
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('open-tiktok-login');
    ipcRenderer.once('tiktok-login-success', () => {
      showToast('success', '✅ Sesión de TikTok vinculada. Ya puedes sincronizar stickers.');
    });
  };

  const handleToggleSticker = async (stickerId) => {
    const current = findAssignment(stickerId);
    if (!current) return;
    try {
      await fetch('/api/stickers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: scopeProfileId, stickerId, actionId: current.actionId, enabled: !current.enabled })
      });
      fetchProfiles();
    } catch {
      showToast('error', 'Error al cambiar el estado');
    }
  };

  const requestDelete = (stickerId, data) => {
    setStickerToDelete({ id: stickerId, name: data.name });
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!stickerToDelete) return;
    try {
      const res = await fetch(`/api/stickers/${stickerToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const newCatalog = { ...catalog };
        delete newCatalog[stickerToDelete.id];
        setCatalog(newCatalog);
        fetchProfiles(); // el borrado elimina en cascada los eventos en todos los perfiles
      }
    } catch (e) {
      console.error('Error al eliminar sticker', e);
    }
    setModalOpen(false);
    setStickerToDelete(null);
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>

      <ConfirmModal
        isOpen={modalOpen}
        title="⚠️ Eliminar Sticker"
        message={`¿Estás seguro que deseas eliminar el sticker "${stickerToDelete?.name}"? Se quitará de TODOS los perfiles donde esté asignado.`}
        onConfirm={confirmDelete}
        onCancel={() => setModalOpen(false)}
      />

      {notification && (
        <div style={{
          position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
          background: notification.type === 'error' ? '#f44336' : '#4caf50',
          color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', zIndex: 1000
        }}>
          {notification.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🎴 Radar de Stickers de Suscriptores</h3>
        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
          Se agregan solos al detectarse en tu chat en vivo.
        </span>
      </div>
      <button className="btn btn-sm" onClick={syncStickers}>🔄 Sincronizar Stickers</button>
      <button className="btn btn-secondary btn-sm" onClick={handleTikTokLogin}>
        🔐 Vincular sesión de TikTok
      </button>
      <p style={{ fontSize: '11px', color: 'var(--text2)', margin: '4px 0 0' }}>
        Se abrirá la página oficial de TikTok en una ventana aparte. Puedes iniciar sesión con
        cualquier cuenta (no tiene que ser la tuya) — solo se usa para consultar el catálogo
        público de stickers.
      </p>
      {/* Selector de alcance: dónde vive la asignación que estás editando */}
      <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '8px', width: 'fit-content' }}>
        <button
          className={`btn btn-sm ${scope === 'global' ? '' : 'btn-secondary'}`}
          onClick={() => setScope('global')}
        >
          🌐 Global (siempre activo)
        </button>
        <button
          className={`btn btn-sm ${scope === 'current' ? '' : 'btn-secondary'}`}
          onClick={() => setScope('current')}
          disabled={!canUseCurrentScope}
          title={!canUseCurrentScope ? 'El perfil global ya está activo' : ''}
        >
          🎮 {canUseCurrentScope ? profiles.list[activeProfileId]?.name : 'Perfil actual'}
        </button>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text2)', margin: '-12px 0 0' }}>
        {scope === 'global'
          ? 'Estas asignaciones suenan sin importar qué perfil de juego esté activo.'
          : `Estas asignaciones solo funcionan mientras "${profiles.list[activeProfileId]?.name}" esté activo.`}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Object.keys(catalog).length === 0 ? (
          <div className="log-empty">Ningún sticker detectado aún. Envía un sticker en tu chat de TikTok para probarlo.</div>
        ) : (
          categoryOrder.map(cat => {
            const items = groupedCatalog[cat];
            if (!items || items.length === 0) return null;

            return (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <h4 style={{ margin: 0, color: 'var(--text2)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {CATEGORY_LABELS[cat]} ({items.length})
                </h4>

                {items.map(([stickerId, data]) => {
                  const assignment = findAssignment(stickerId);
                  return (
                    <div key={stickerId} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {data.icon ? (
                          <img src={data.icon} alt={data.name} style={{ width: '48px', height: '48px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} />
                        ) : (
                          <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>✨</div>
                        )}
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{data.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ID: {stickerId}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Disparar Acción:</label>
                          <select
                            className="modifier-select"
                            value={assignment?.actionId || ''}
                            onChange={(e) => handleAssignAction(stickerId, e.target.value)}
                            style={{ minWidth: '180px', maxWidth: '220px' }}
                          >
                            <option value="">🚫 Ninguna (Ignorar)</option>
                            {Object.entries(scopeActions).map(([actId, act]) => (
                              <option key={actId} value={actId}>
                                {act.type === 'sound' ? '🎵' : '⌨️'} {act.name}
                              </option>
                            ))}
                          </select>
                          {Object.keys(scopeActions).length === 0 && (
                            <span style={{ fontSize: '11px', color: '#ff9800' }}>
                              Este perfil no tiene acciones. Crea una en "Mis Acciones".
                            </span>
                          )}
                        </div>

                        <label className="switch" style={{ marginTop: '16px' }}>
                          <input
                            type="checkbox"
                            disabled={!assignment}
                            checked={!!assignment?.enabled}
                            onChange={() => handleToggleSticker(stickerId)}
                          />
                          <span className="slider"></span>
                        </label>

                        <button
                          onClick={() => requestDelete(stickerId, data)}
                          style={{ marginTop: '16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', borderRadius: '4px' }}
                          title="Eliminar Sticker"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}