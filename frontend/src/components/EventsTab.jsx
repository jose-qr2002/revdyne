import React, { useState, useMemo, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import ModalShell from './ModalShell';

export default function EventsTab({ profiles, catalog, onUpdateProfiles }) {
  const [showForm, setShowForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);

  const [trigger, setTrigger] = useState('gift');
  const [condition, setCondition] = useState('');
  const [selectedActionId, setSelectedActionId] = useState('');
  const [frequency, setFrequency] = useState('once');
  const [cooldownSeconds, setCooldownSeconds] = useState(30);

  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [giftSearch, setGiftSearch] = useState('');
  const [giftCurrentPage, setGiftCurrentPage] = useState(1);
  const GIFTS_PER_PAGE = 30;

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);

  const activeProfileId = profiles.activeProfileId;

  const scopeProfileId = activeProfileId;
  const scopeProfile = profiles.list[scopeProfileId] || { actions: {}, events: [] };
  const scopeActionsArray = Object.entries(scopeProfile.actions || {});
  const allScopeEvents = scopeProfile.events || [];

  const displayEvents = allScopeEvents.filter(e => e.trigger !== 'sticker');

  const catalogArray = useMemo(() => {
    return Object.entries(catalog || {}).sort((a, b) => (b[1].coins || 0) - (a[1].coins || 0));
  }, [catalog]);

  const filteredGifts = useMemo(() => {
    if (!giftSearch) return catalogArray;
    const searchLower = giftSearch.toLowerCase();
    return catalogArray.filter(([id, data]) => {
      const matchName = data.name.toLowerCase().includes(searchLower);
      const matchId = id.includes(searchLower);
      const matchCoins = data.coins && data.coins.toString().includes(searchLower);
      return matchName || matchId || matchCoins;
    });
  }, [catalogArray, giftSearch]);

  const totalGiftPages = Math.ceil(filteredGifts.length / GIFTS_PER_PAGE);
  const paginatedGifts = filteredGifts.slice((giftCurrentPage - 1) * GIFTS_PER_PAGE, giftCurrentPage * GIFTS_PER_PAGE);

  useEffect(() => {
    setGiftCurrentPage(1);
  }, [giftSearch]);

  const updateScopeEvents = (updatedEvents) => {
    const newProfiles = JSON.parse(JSON.stringify(profiles));
    newProfiles.list[scopeProfileId] = {
      ...newProfiles.list[scopeProfileId],
      events: updatedEvents
    };
    onUpdateProfiles(newProfiles);
  };

  const handleEditEvent = (evt) => {
    setEditingEventId(evt.id);
    setTrigger(evt.trigger);
    setCondition(evt.condition === 'any' ? '' : evt.condition);
    setSelectedActionId(evt.actionId);
    setShowForm(true);
    setFrequency(evt.frequency || 'once');
    setCooldownSeconds(evt.cooldownSeconds ?? 30);
  };

  const handleSaveEvent = () => {
    if (!selectedActionId) return alert('Debes seleccionar una acción de tu arsenal.');
    if (trigger === 'gift' && !condition) return alert('Debes seleccionar un regalo del catálogo.');
    if (trigger === 'like' && (!condition || isNaN(condition) || condition <= 0)) return alert('Debes ingresar una cantidad válida de likes.');
    if (trigger === 'share' && frequency === 'cooldown' && !(parseInt(cooldownSeconds, 10) > 0)) return alert('Ingresa un enfriamiento mayor a 0 segundos.');

    const isCurrentlyEnabled = editingEventId ? allScopeEvents.find(e => e.id === editingEventId)?.enabled : true;

    const newEvent = {
      id: editingEventId || `evt_${Date.now()}`,
      trigger,
      condition: (trigger === 'gift' || trigger === 'like') ? condition : 'any',
      actionId: selectedActionId,
      enabled: isCurrentlyEnabled !== undefined ? isCurrentlyEnabled : true,
      ...(trigger === 'share' && {
        frequency,
        cooldownSeconds: Math.max(0, parseInt(cooldownSeconds, 10) || 0)
      })
    };

    const updatedEvents = editingEventId
      ? allScopeEvents.map(e => e.id === editingEventId ? newEvent : e)
      : [...allScopeEvents, newEvent];

    updateScopeEvents(updatedEvents);
    resetForm();
  };

  const resetForm = () => {
    setEditingEventId(null);
    setCondition('');
    setSelectedActionId('');
    setShowForm(false);
    setIsGiftModalOpen(false);
    setGiftSearch('');
    setFrequency('once');
    setCooldownSeconds(30);
  };

  const requestDeleteEvent = (evt) => {
    setEventToDelete(evt);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteEvent = () => {
    if (!eventToDelete) return;
    updateScopeEvents(allScopeEvents.filter(e => e.id !== eventToDelete.id));
    setIsDeleteModalOpen(false);
    setEventToDelete(null);
  };

  const handleToggleEvent = (eventId, currentStatus) => {
    updateScopeEvents(allScopeEvents.map(e => e.id === eventId ? { ...e, enabled: !currentStatus } : e));
  };

  const renderTriggerName = (evt) => {
    if (evt.trigger === 'follow') return <span>👤 Alguien te sigue</span>;
    if (evt.trigger === 'share') {
      const freq = evt.frequency || 'once';
      const freqLabel = freq === 'always' ? 'siempre' : freq === 'cooldown' ? `cada ${evt.cooldownSeconds}s por usuario` : '1 vez por usuario';
      return (
        <span>
          📢 Alguien comparte el directo{' '}
          <span style={{ fontSize: '11px', color: 'var(--text2)', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px' }}>{freqLabel}</span>
        </span>
      );
    }
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

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="⚠️ Eliminar Regla"
        message="¿Estás seguro de que deseas eliminar este vínculo? Esta acción dejará de ejecutarse en tus directos."
        onConfirm={confirmDeleteEvent}
        onCancel={() => { setIsDeleteModalOpen(false); setEventToDelete(null); }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Vínculos: Eventos de TikTok → Acciones</h3>
        <button className="btn" onClick={() => setShowForm(true)}>+ Crear Nuevo Vínculo</button>
      </div>

      <ModalShell
        isOpen={showForm}
        onClose={resetForm}
        title={editingEventId ? '✏️ Editando Regla' : '✨ Diseñar Regla'}
        width="700px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
            <button className="btn" style={{ background: '#00bcd4', color: '#000', fontWeight: 'bold' }} onClick={handleSaveEvent}>
              {editingEventId ? 'Actualizar Regla' : 'Guardar Regla'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

          <div style={{ flex: 1, minWidth: '250px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#ffeb3b', marginBottom: '8px', fontWeight: 'bold' }}>1. CUANDO OCURRA ESTO...</label>
            <select className="modifier-select" value={trigger} onChange={e => { setTrigger(e.target.value); setCondition(''); }} style={{ width: '100%', marginBottom: '10px' }}>
              <option value="gift">🎁 Recibir un Regalo específico</option>
              <option value="like">❤️ Alcanzar meta de Likes</option>
              <option value="follow">👤 Nuevo Seguidor</option>
              <option value="share">📢 Compartir Directo</option>
            </select>

            {trigger === 'gift' && (
              <div
                onClick={() => setIsGiftModalOpen(true)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'border 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#00bcd4'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                {condition && catalog[condition] ? (
                  <>
                    {catalog[condition].icon ? (
                      <img src={catalog[condition].icon} alt="Icon" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                    ) : <span style={{ fontSize: '20px' }}>🎁</span>}
                    <span style={{ fontWeight: 'bold' }}>{catalog[condition].name} <span style={{ color: '#ffd700', marginLeft: '4px' }}>({catalog[condition].coins} 💎)</span></span>
                  </>
                ) : (
                  <span style={{ color: '#00bcd4', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🔍 Clic aquí para elegir un regalo...
                  </span>
                )}
              </div>
            )}

            {trigger === 'like' && (
              <input type="number" className="key-input" placeholder="Ej: 500" value={condition} onChange={e => setCondition(e.target.value)} style={{ width: '100%' }} />
            )}
            {trigger === 'share' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text2)' }}>¿Cuándo se ejecuta?</label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="radio" checked={frequency === 'once'} onChange={() => setFrequency('once')} />
                  <span>Una sola vez por usuario (en este directo)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="radio" checked={frequency === 'always'} onChange={() => setFrequency('always')} />
                  <span>Todas las veces que comparta</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="radio" checked={frequency === 'cooldown'} onChange={() => setFrequency('cooldown')} />
                  <span>Con enfriamiento por usuario:</span>
                  <input
                    type="number" min="1" className="key-input"
                    value={cooldownSeconds} disabled={frequency !== 'cooldown'}
                    onChange={e => setCooldownSeconds(e.target.value)}
                    style={{ width: '70px' }}
                  />
                  <span>seg</span>
                </label>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: '24px' }}>➡️</span>
          </div>

          <div style={{ flex: 1, minWidth: '250px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#4caf50', marginBottom: '8px', fontWeight: 'bold' }}>2. EJECUTAR ESTA ACCIÓN...</label>
            {scopeActionsArray.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#ff4d4d' }}>
                No tienes acciones creadas en este perfil. Ve a la pestaña "Mis Acciones" primero.
              </div>
            ) : (
              <select className="modifier-select" value={selectedActionId} onChange={e => setSelectedActionId(e.target.value)} style={{ width: '100%' }}>
                <option value="">-- Selecciona una acción --</option>
                {scopeActionsArray.map(([id, act]) => (
                  <option key={id} value={id}>{act.name} (Tipo: {act.type})</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </ModalShell>

      {isGiftModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#00bcd4' }}>Seleccionar Regalo</h3>
              <button onClick={() => setIsGiftModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.2)' }}>
              <input
                type="text" className="key-input"
                placeholder="🔍 Busca por nombre o valor de monedas (ej. 1, 99, rosa...)"
                value={giftSearch} onChange={e => setGiftSearch(e.target.value)}
                style={{ width: '100%', fontSize: '15px', padding: '12px' }} autoFocus
              />
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {paginatedGifts.map(([id, data]) => (
                  <div
                    key={id}
                    onClick={() => { setCondition(id); setIsGiftModalOpen(false); setGiftSearch(''); }}
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}
                  >
                    {data.icon ? (
                      <img src={data.icon} loading="lazy" alt={data.name} style={{ width: '40px', height: '40px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }} onError={(e) => e.target.style.display = 'none'} />
                    ) : <span style={{ fontSize: '24px' }}>🎁</span>}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
                      <div style={{ color: '#ffd700', fontSize: '12px', fontWeight: 'bold', marginTop: '2px' }}>{data.coins} 💎</div>
                    </div>
                  </div>
                ))}
              </div>
              {filteredGifts.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text2)' }}>No se encontraron regalos con esa búsqueda.</div>}
            </div>

            {totalGiftPages > 1 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', background: 'rgba(0,0,0,0.1)' }}>
                <button className="btn btn-secondary btn-sm" disabled={giftCurrentPage === 1} onClick={() => setGiftCurrentPage(prev => prev - 1)}>◀ Ant</button>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Pág {giftCurrentPage} de {totalGiftPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={giftCurrentPage === totalGiftPages} onClick={() => setGiftCurrentPage(prev => prev + 1)}>Sig ▶</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {displayEvents.length === 0 ? (
          <div className="log-empty">No has vinculado ningún evento en este alcance. ¡Crea tu primera regla arriba!</div>
        ) : (
          displayEvents.map(evt => {
            const actionData = scopeProfile.actions?.[evt.actionId];
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
                  <button className="btn btn-secondary btn-sm" onClick={() => handleEditEvent(evt)}>✏️</button>
                  <button className="btn btn-secondary btn-sm" style={{ background: '#ff4d4d', color: 'white', border: 'none' }} onClick={() => requestDeleteEvent(evt)}>🗑️</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}