import React, { useState, useEffect, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';
import StickerSettingsModal from './StickerSettingsModal';

const CATEGORY_LABELS = {
  tiktok: '🌐 Emotes de TikTok',
  fanclub: '❤️ Club de Fans',
  superfan: '⭐ Super Fan',
  unknown: '❓ Sin clasificar'
};
const CATEGORY_ORDER = { tiktok: 0, fanclub: 1, superfan: 2, unknown: 3 };
const ITEMS_PER_PAGE = 10;

export default function StickersTab({ profiles, onUpdateProfiles, activeProfileId, ioSocket }) {
  const [catalog, setCatalog] = useState({});
  const [notification, setNotification] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [stickerToDelete, setStickerToDelete] = useState(null);

  const [settingsSticker, setSettingsSticker] = useState(null);

  const isElectron = typeof window.require === 'function';
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

  useEffect(() => { fetchCatalog(); }, []);

  useEffect(() => {
    if (!ioSocket) return;
    ioSocket.on('catalog:newSticker', (newCatalog) => setCatalog(newCatalog));
    return () => ioSocket.off('catalog:newSticker');
  }, [ioSocket]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, categoryFilter]);

  const flatFiltered = useMemo(() => {
    return Object.entries(catalog)
      .map(([id, data]) => ({ id, ...data, category: data.category || 'unknown' }))
      .filter(item => categoryFilter === 'all' || item.category === categoryFilter)
      .filter(item => !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.id.includes(searchTerm))
      .sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.name.localeCompare(b.name));
  }, [catalog, categoryFilter, searchTerm]);

  // 🌟 Ya no hay estado local de "profiles" ni fetchProfiles(): todo viene de la prop,
  // que App.jsx mantiene sincronizada como única fuente de verdad.
  const scopeProfileId = activeProfileId;
  const scopeProfile = profiles.list[scopeProfileId] || { actions: {}, events: [] };
  const scopeActions = scopeProfile.actions || {};
  const scopeEvents = scopeProfile.events || [];
  const activeProfileName = profiles.list[activeProfileId]?.name || 'ninguno';

  const findAssignment = (stickerId) => scopeEvents.find(e => e.trigger === 'sticker' && e.condition === stickerId);

  const totalPages = Math.max(1, Math.ceil(flatFiltered.length / ITEMS_PER_PAGE));
  const paginated = flatFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // 🌟 Reescribe SOLO events[] del perfil actual, dentro de una copia completa de `profiles`,
  // y la manda por el mismo canal único que usa EventsTab. Nunca hace fetch directo al backend.
  const updateScopeEvents = (updatedEvents) => {
    const newProfiles = JSON.parse(JSON.stringify(profiles));
    newProfiles.list[scopeProfileId] = {
      ...newProfiles.list[scopeProfileId],
      events: updatedEvents
    };
    onUpdateProfiles(newProfiles);
  };

  const syncStickers = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/stickers/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) { setCatalog(data.catalog); showToast('success', `${data.added} stickers nuevos`); }
      else showToast('error', data.error);
    } catch {
      showToast('error', 'Error de red al sincronizar');
    }
    setIsSyncing(false);
  };

  const handleTikTokLogin = () => {
    if (!isElectron) return showToast('error', 'Solo disponible en la app de escritorio');
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('open-tiktok-login');
    ipcRenderer.once('tiktok-login-success', () => showToast('success', '✅ Sesión de TikTok vinculada'));
  };

  const handleAssignAction = (stickerId, actionId) => {
    if (!actionId) {
      updateScopeEvents(scopeEvents.filter(e => !(e.trigger === 'sticker' && e.condition === stickerId)));
      return;
    }
    const existing = findAssignment(stickerId);
    const updatedEvents = existing
      ? scopeEvents.map(e => (e.trigger === 'sticker' && e.condition === stickerId) ? { ...e, actionId, enabled: true } : e)
      : [...scopeEvents, {
          id: `evt_${Date.now()}`,
          trigger: 'sticker',
          condition: stickerId,
          actionId,
          enabled: true,
          cooldownSeconds: 0,
          repeatMode: 'once',
          repeatLimit: 1,
          playbackStyle: 'sequential'
        }];
    updateScopeEvents(updatedEvents);
  };

  const handleToggleSticker = (stickerId) => {
    const current = findAssignment(stickerId);
    if (!current) return;
    updateScopeEvents(scopeEvents.map(e =>
      (e.trigger === 'sticker' && e.condition === stickerId) ? { ...e, enabled: !e.enabled } : e
    ));
  };

  const handleSaveSettings = (updates) => {
    const stickerId = settingsSticker.id;
    updateScopeEvents(scopeEvents.map(e =>
      (e.trigger === 'sticker' && e.condition === stickerId) ? { ...e, ...updates } : e
    ));
    showToast('success', 'Ajustes guardados');
    setSettingsSticker(null);
  };

  const requestDelete = (stickerId, data) => { setStickerToDelete({ id: stickerId, name: data.name }); setModalOpen(true); };

  const confirmDelete = async () => {
    if (!stickerToDelete) return;
    try {
      const res = await fetch(`/api/stickers/${stickerToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const newCatalog = { ...catalog };
        delete newCatalog[stickerToDelete.id];
        setCatalog(newCatalog);

        // El backend ya borró en cascada los eventos de este sticker en TODOS los perfiles.
        // Reflejamos lo mismo en nuestra copia local para no quedar desincronizados.
        const newProfiles = JSON.parse(JSON.stringify(profiles));
        Object.keys(newProfiles.list).forEach(pid => {
          newProfiles.list[pid].events = (newProfiles.list[pid].events || [])
            .filter(e => !(e.trigger === 'sticker' && e.condition === stickerToDelete.id));
        });
        onUpdateProfiles(newProfiles);
      }
    } catch (e) { console.error('Error al eliminar sticker', e); }
    setModalOpen(false);
    setStickerToDelete(null);
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px', position: 'relative' }}>

      <ConfirmModal
        isOpen={modalOpen}
        title="⚠️ Eliminar Sticker"
        message={`¿Eliminar "${stickerToDelete?.name}"? Se quitará de TODOS los perfiles donde esté asignado.`}
        onConfirm={confirmDelete}
        onCancel={() => setModalOpen(false)}
      />

      <StickerSettingsModal
        isOpen={!!settingsSticker}
        sticker={settingsSticker}
        assignment={settingsSticker ? findAssignment(settingsSticker.id) : null}
        actionType={settingsSticker ? scopeActions[findAssignment(settingsSticker.id)?.actionId]?.type : null}
        onClose={() => setSettingsSticker(null)}
        onSave={handleSaveSettings}
      />

      {notification && (
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: notification.type === 'error' ? '#f44336' : '#4caf50', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', zIndex: 1000 }}>
          {notification.text}
        </div>
      )}

      <div>
        <h3 style={{ margin: 0 }}>🎴 Radar de Stickers de Suscriptores</h3>
        <p style={{ fontSize: '12px', color: 'var(--text2)', margin: '4px 0 0' }}>
          Editando para el perfil activo: <strong>{activeProfileName}</strong> (cámbialo desde el panel izquierdo)
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <input
          type="text" className="key-input" placeholder="🔍 Buscar por nombre o ID..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: '180px' }}
        />
        <select className="modifier-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ minWidth: '160px' }}>
          <option value="all">Todas las categorías</option>
          <option value="tiktok">🌐 Emotes de TikTok</option>
          <option value="fanclub">❤️ Club de Fans</option>
          <option value="superfan">⭐ Super Fan</option>
          <option value="unknown">❓ Sin clasificar</option>
        </select>
        <button className="btn btn-sm" onClick={syncStickers} disabled={isSyncing}>
          {isSyncing ? '⏳ Sincronizando...' : '🔄 Sincronizar Stickers'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleTikTokLogin}>
          🔐 Vincular sesión
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {flatFiltered.length === 0 ? (
          <div className="log-empty">
            {Object.keys(catalog).length === 0
              ? 'Ningún sticker detectado aún. Envía uno en tu chat de TikTok o sincroniza.'
              : 'Ningún sticker coincide con tu búsqueda.'}
          </div>
        ) : (
          paginated.map((item, idx) => {
            const showHeader = idx === 0 || paginated[idx - 1].category !== item.category;
            const assignment = findAssignment(item.id);

            return (
              <React.Fragment key={item.id}>
                {showHeader && (
                  <h4 style={{ margin: idx === 0 ? 0 : '10px 0 0', color: 'var(--text2)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {CATEGORY_LABELS[item.category]}
                  </h4>
                )}

                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                    {item.icon ? (
                      <img src={item.icon} alt={item.name} style={{ width: '48px', height: '48px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '48px', height: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>✨</div>
                    )}
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div title={item.name} style={{ fontWeight: 'bold', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      <div title={item.id} style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ID: {item.id}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <select
                      className="modifier-select"
                      value={assignment?.actionId || ''}
                      onChange={(e) => handleAssignAction(item.id, e.target.value)}
                      style={{ minWidth: '160px', maxWidth: '200px' }}
                    >
                      <option value="">🚫 Ninguna</option>
                      {Object.entries(scopeActions).map(([actId, act]) => (
                        <option key={actId} value={actId}>{act.type === 'sound' ? '🎵' : '⌨️'} {act.name}</option>
                      ))}
                    </select>

                    {assignment && (
                      <button onClick={() => setSettingsSticker(item)} title="Enfriamiento y repeticiones" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>
                        ⚙️
                      </button>
                    )}

                    <label className="switch">
                      <input type="checkbox" disabled={!assignment} checked={!!assignment?.enabled} onChange={() => handleToggleSticker(item.id)} />
                      <span className="slider"></span>
                    </label>

                    <button onClick={() => requestDelete(item.id, item)} title="Eliminar Sticker" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>
                      🗑️
                    </button>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>◀ Anterior</button>
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Página {currentPage} de {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Siguiente ▶</button>
        </div>
      )}
    </div>
  );
}