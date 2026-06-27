import React, { useState, useMemo } from 'react';

export default function EventsTab({ events, actions, catalog, onUpdateConfig }) {
  const [showForm, setShowForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null); // 🌟 NUEVO
  
  const [trigger, setTrigger] = useState('gift');
  const [condition, setCondition] = useState('');
  const [selectedActionId, setSelectedActionId] = useState('');

  const [isGiftDropdownOpen, setIsGiftDropdownOpen] = useState(false);
  const [giftSearch, setGiftSearch] = useState('');

  const safeEvents = Array.isArray(events) ? events : (events?.likeEvents || []);
  const actionsArray = Object.entries(actions || {});

  const catalogArray = useMemo(() => {
    return Object.entries(catalog || {}).sort((a, b) => (a[1].coins || 0) - (b[1].coins || 0));
  }, [catalog]);

  const filteredGifts = useMemo(() => {
    let filtered = catalogArray;
    if (giftSearch) {
      const searchLower = giftSearch.toLowerCase();
      filtered = catalogArray.filter(([id, data]) => 
        data.name.toLowerCase().includes(searchLower) || id.includes(searchLower)
      );
    }
    return filtered.slice(0, 50);
  }, [catalogArray, giftSearch]);

  // 🌟 NUEVO: Función para editar regla
  const handleEditEvent = (evt) => {
    setEditingEventId(evt.id);
    setTrigger(evt.trigger);
    setCondition(evt.condition === 'any' ? '' : evt.condition);
    setSelectedActionId(evt.actionId);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveEvent = () => {
    if (!selectedActionId) return alert('Debes seleccionar una acción de tu arsenal.');
    if (trigger === 'gift' && !condition) return alert('Debes seleccionar un regalo del catálogo.');
    if (trigger === 'like' && (!condition || isNaN(condition) || condition <= 0)) return alert('Debes ingresar una cantidad válida de likes.');

    const isCurrentlyEnabled = editingEventId ? safeEvents.find(e => e.id === editingEventId)?.enabled : true;

    const newEvent = {
      id: editingEventId || `evt_${Date.now()}`,
      trigger,
      condition: (trigger === 'gift' || trigger === 'like') ? condition : 'any',
      actionId: selectedActionId,
      enabled: isCurrentlyEnabled !== undefined ? isCurrentlyEnabled : true
    };

    let updatedEvents;
    if (editingEventId) {
      // Reemplazamos el evento existente
      updatedEvents = safeEvents.map(e => e.id === editingEventId ? newEvent : e);
    } else {
      // Agregamos uno nuevo
      updatedEvents = [...safeEvents, newEvent];
    }
    
    onUpdateConfig({ events: updatedEvents });
    resetForm();
  };

  const resetForm = () => {
    setEditingEventId(null);
    setCondition('');
    setSelectedActionId('');
    setShowForm(false);
    setIsGiftDropdownOpen(false);
  };

  const handleDeleteEvent = (eventId) => {
    const updatedEvents = safeEvents.filter(e => e.id !== eventId);
    onUpdateConfig({ events: updatedEvents });
  };

  const handleToggleEvent = (eventId, currentStatus) => {
    const updatedEvents = safeEvents.map(e =>
      e.id === eventId ? { ...e, enabled: !currentStatus } : e
    );
    onUpdateConfig({ events: updatedEvents });
  };

  const renderTriggerName = (evt) => {
    if (evt.trigger === 'follow') return <span>👤 Alguien te sigue</span>;
    if (evt.trigger === 'share') return <span>📢 Alguien comparte el directo</span>;
    if (evt.trigger === 'like') return <span>❤️ Al llegar a {evt.condition} Likes</span>;
    
    if (evt.trigger === 'gift') {
      const gift = catalog[evt.condition];
      if (gift) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {gift.icon ? (
              <img src={gift.icon} alt={gift.name} style={{ width: '28px', height: '28px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '2px' }} onError={(e) => e.target.style.display = 'none'} />
            ) : <span>🎁</span>}
            <span>Envían: {gift.name} <span style={{ color: '#ffd700' }}>({gift.coins} 💎)</span></span>
          </div>
        );
      }
      return <span>🎁 Regalo Desconocido (ID: {evt.condition})</span>;
    }
    return <span>{evt.trigger}</span>;
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Vínculos: Eventos de TikTok → Acciones</h3>
        <button className="btn" onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? 'Cancelar' : '+ Crear Nuevo Vínculo'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--card)', border: editingEventId ? '1px solid #ffeb3b' : '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ color: editingEventId ? '#ffeb3b' : 'white' }}>
            {editingEventId ? '✏️ Editando Regla' : '✨ Diseñar Regla'}
          </h4>
          
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            
            <div style={{ flex: 1, minWidth: '250px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#ffeb3b', marginBottom: '8px', fontWeight: 'bold' }}>1. CUANDO OCURRA ESTO...</label>
              <select className="modifier-select" value={trigger} onChange={e => { setTrigger(e.target.value); setCondition(''); setIsGiftDropdownOpen(false); }} style={{ width: '100%', marginBottom: '10px' }}>
                <option value="gift">🎁 Recibir un Regalo específico</option>
                <option value="like">❤️ Alcanzar meta de Likes</option>
                <option value="follow">👤 Nuevo Seguidor</option>
                <option value="share">📢 Compartir Directo</option>
              </select>

              {trigger === 'gift' && (
                <div style={{ position: 'relative', width: '100%' }}>
                  <div 
                    onClick={() => setIsGiftDropdownOpen(!isGiftDropdownOpen)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    {condition && catalog[condition] ? (
                      <>
                        {catalog[condition].icon ? (
                          <img src={catalog[condition].icon} alt="Icon" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                        ) : <span>🎁</span>}
                        <span>{catalog[condition].name} <span style={{ color: '#ffd700' }}>({catalog[condition].coins} 💎)</span></span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text2)' }}>🔍 Clic para buscar un regalo...</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '12px' }}>▼</span>
                  </div>

                  {isGiftDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 10, maxHeight: '300px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                      <input 
                        type="text" placeholder="Escribe el nombre del regalo..." value={giftSearch} onChange={e => setGiftSearch(e.target.value)}
                        style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: 'none', borderBottom: '1px solid var(--border)', color: 'white', outline: 'none' }} autoFocus
                      />
                      <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filteredGifts.map(([id, data]) => (
                            <div 
                              key={id}
                              onClick={() => { setCondition(id); setIsGiftDropdownOpen(false); setGiftSearch(''); }}
                              style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              {data.icon ? (
                                <img src={data.icon} alt={data.name} loading="lazy" style={{ width: '28px', height: '28px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }} onError={(e) => e.target.style.display = 'none'} />
                              ) : <span>🎁</span>}
                              <span>{data.name} <span style={{ color: '#ffd700', fontSize: '12px' }}>({data.coins} 💎)</span></span>
                            </div>
                        ))}
                        {filteredGifts.length === 0 && <div style={{ padding: '15px', textAlign: 'center', color: 'var(--text2)' }}>No se encontraron regalos.</div>}
                        {filteredGifts.length === 50 && <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text2)', fontSize: '12px', background: 'rgba(0,0,0,0.2)' }}>Mostrando los primeros 50. Usa el buscador.</div>}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {trigger === 'like' && (
                <input type="number" className="key-input" placeholder="Ej: 500" value={condition} onChange={e => setCondition(e.target.value)} style={{ width: '100%' }} />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
              <span style={{ fontSize: '24px' }}>➡️</span>
            </div>

            <div style={{ flex: 1, minWidth: '250px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#4caf50', marginBottom: '8px', fontWeight: 'bold' }}>2. EJECUTAR ESTA ACCIÓN...</label>
              {actionsArray.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#ff4d4d' }}>No tienes acciones creadas. Ve a la pestaña "Mis Acciones" primero.</div>
              ) : (
                <select className="modifier-select" value={selectedActionId} onChange={e => setSelectedActionId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">-- Selecciona una acción --</option>
                  {actionsArray.map(([id, act]) => (
                    <option key={id} value={id}>{act.name} (Tipo: {act.type})</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" style={{ background: editingEventId ? '#ffb300' : '' }} onClick={handleSaveEvent}>
              {editingEventId ? 'Actualizar Regla' : 'Guardar Regla'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {safeEvents.length === 0 ? (
          <div className="log-empty">No has vinculado ningún evento. ¡Crea tu primera regla arriba!</div>
        ) : (
          safeEvents.map(evt => {
            const actionData = actions?.[evt.actionId];
            return (
              <div key={evt.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(255,235,59,0.1)', borderLeft: '3px solid #ffeb3b', borderRadius: '0 4px 4px 0' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center' }}>{renderTriggerName(evt)}</div>
                  </div>
                  <span style={{ fontSize: '18px' }}>⚡</span>
                  <div style={{ padding: '8px 12px', background: 'rgba(76,175,80,0.1)', borderLeft: '3px solid #4caf50', borderRadius: '0 4px 4px 0' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                      {actionData ? actionData.name : <span style={{ color: 'red' }}>Acción eliminada</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label className="switch" style={{ marginRight: '8px' }}>
                    <input type="checkbox" checked={evt.enabled} onChange={() => handleToggleEvent(evt.id, evt.enabled)} />
                    <span className="slider"></span>
                  </label>
                  
                  {/* 🌟 NUEVO: Botón Editar */}
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => handleEditEvent(evt)}
                  >
                    ✏️
                  </button>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    style={{ background: '#ff4d4d', color: 'white', border: 'none' }} 
                    onClick={() => handleDeleteEvent(evt.id)}
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