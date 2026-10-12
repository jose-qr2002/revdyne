import React, { useState, useMemo, useEffect } from 'react';
import Icon from './Icon';
import Select from './Select';
import { showAlert } from '../services/dialog';
import ConfirmModal from './ConfirmModal';
import ModalShell from './ModalShell';
import { stepsSummary } from '../services/actionSteps';
import { groupGifts } from './giftUtils';
import { WHO_OPTIONS, TRIGGER_GROUPS, TRIGGER_ITEMS, triggerLabel, FREQUENCY_TRIGGERS, defaultFrequency, CHAT_MATCHES, frequencyLabel, whoLabel } from '../services/eventTriggers';
import ListToolbar from './ListToolbar';
import Pagination from './Pagination';
import { useListView, searchKey } from '../hooks/useListView';

// Acciones de un evento: `actionIds` (todas a la vez) y `randomActionIds` (una al azar). Los antiguos con un solo `actionId` ya
// llegan migrados del servidor (backend/data/migrations.js).
const eventActionIds = (evt) => ({
  all: Array.isArray(evt.actionIds) ? evt.actionIds : [],
  random: Array.isArray(evt.randomActionIds) ? evt.randomActionIds : [],
});

// Lista de acciones con casillas. `blocked` = las elegidas en la otra lista (una acción no puede estar en las dos)
function ActionChecklist({ actions, selected, blocked, onToggle, blockedHint }) {
  return (
    <div className="evt-checklist">
      {actions.map(([id, act]) => {
        const isBlocked = blocked.includes(id);
        return (
          <label key={id} className={`evt-check${isBlocked ? ' blocked' : ''}`} title={isBlocked ? blockedHint : undefined}>
            <input type="checkbox" className="check" checked={selected.includes(id)} disabled={isBlocked} onChange={() => onToggle(id)} />
            <span className="evt-check-name ellipsis">{act.name}</span>
            <span className="evt-check-sub">{act.enabled === false ? 'desactivada' : stepsSummary(act)}</span>
          </label>
        );
      })}
    </div>
  );
}

// Ficha seleccionable (un radio con aspecto de botón). El radio sigue ahí para teclado y lectores de pantalla.
function Pill({ name, checked, onSelect, label, icon }) {
  return (
    <label className={`ev-pill${checked ? ' on' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} />
      {icon && <Icon name={icon} size={14} />}
      <span>{label}</span>
    </label>
  );
}

// Frecuencia por usuario para los disparadores que se repiten mucho
function FrequencyPicker({ frequency, setFrequency, cooldownSeconds, setCooldownSeconds, what }) {
  return (
    <div className="ev-freq">
      <span className="ev-freq-title">¿Cuándo se ejecuta?</span>
      <label className="ev-opt small">
        <input type="radio" name="ev-frequency" checked={frequency === 'once'} onChange={() => setFrequency('once')} />
        <span>Una sola vez por usuario (en este directo)</span>
      </label>
      <label className="ev-opt small">
        <input type="radio" name="ev-frequency" checked={frequency === 'always'} onChange={() => setFrequency('always')} />
        <span>Todas las veces que {what}</span>
      </label>
      <label className="ev-opt small">
        <input type="radio" name="ev-frequency" checked={frequency === 'cooldown'} onChange={() => setFrequency('cooldown')} />
        <span>Con enfriamiento por usuario:</span>
        <input type="number" min="1" className="key-input ev-num" value={cooldownSeconds} disabled={frequency !== 'cooldown'} onChange={e => setCooldownSeconds(e.target.value)} />
        <span>seg</span>
      </label>
    </div>
  );
}

const FREQUENCY_WHAT = {
  join: 'entre al directo', share: 'comparta', superfan: 'se haga Super Fan', chat: 'comente', chattext: 'escriba ese comentario',
};

// Clave de la búsqueda y los filtros actuales (al cambiar, la lista vuelve a la página 1) y la de "sin filtros"
const listKey = (query, trigger, who, state) => [query, trigger, who, state].join('|');
const CLEARED_KEY = listKey('', 'all', 'any', 'all');

export default function EventsTab({ profiles, catalog, onUpdateProfiles }) {
  const [showForm, setShowForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);

  const [trigger, setTrigger] = useState('gift');
  const [condition, setCondition] = useState('');
  const [match, setMatch] = useState('equals');            // Chat (comentario): es exactamente | contiene
  const [whoMode, setWhoMode] = useState('all');
  const [whoUser, setWhoUser] = useState('');
  const [selectedActionIds, setSelectedActionIds] = useState([]); // se ejecutan todas
  const [randomActionIds, setRandomActionIds] = useState([]); // se ejecuta una al azar
  const [frequency, setFrequency] = useState('once');
  const [cooldownSeconds, setCooldownSeconds] = useState(30);

  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [giftSearch, setGiftSearch] = useState('');
  const [giftCurrentPage, setGiftCurrentPage] = useState(1);
  const GIFTS_PER_PAGE = 30;

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);

  // Búsqueda y filtros de la lista de reglas
  const [search, setSearch] = useState('');
  const [fTrigger, setFTrigger] = useState('all');
  const [fWho, setFWho] = useState('any');
  const [fState, setFState] = useState('all');

  const activeProfileId = profiles.activeProfileId;

  const scopeProfileId = activeProfileId;
  const scopeProfile = profiles.list[scopeProfileId] || { actions: {}, events: [] };
  const scopeActionsArray = Object.entries(scopeProfile.actions || {});
  const allScopeEvents = scopeProfile.events || [];

  const displayEvents = allScopeEvents.filter(e => e.trigger !== 'sticker');

  // Texto donde busca la barra: disparador, condición (nombre del regalo, comentario...), quién y los nombres de sus acciones
  const missingActions = (evt) => { const ids = eventActionIds(evt); return [...ids.all, ...ids.random].filter(id => !scopeProfile.actions?.[id]).length; };
  const eventSearchText = (evt) => {
    const ids = eventActionIds(evt);
    const gift = evt.trigger === 'gift' ? catalog[evt.condition] : null;
    return searchKey([
      triggerLabel(evt.trigger), evt.condition === 'any' ? '' : evt.condition, gift?.name, whoLabel(evt), evt.who?.username,
      ...[...ids.all, ...ids.random].map(id => scopeProfile.actions?.[id]?.name),
    ].join(' '));
  };
  const query = searchKey(search.trim());
  const filteredEvents = displayEvents.filter(evt => {
    if (fTrigger !== 'all' && evt.trigger !== fTrigger) return false;
    if (fWho !== 'any' && (evt.who?.mode || 'all') !== fWho) return false;
    if (fState === 'enabled' && !evt.enabled) return false;
    if (fState === 'disabled' && evt.enabled) return false;
    if (fState === 'broken' && missingActions(evt) === 0) return false;
    return !query || eventSearchText(evt).includes(query);
  });
  const view = useListView(filteredEvents, listKey(query, fTrigger, fWho, fState));
  const filtersActive = !!query || fTrigger !== 'all' || fWho !== 'any' || fState !== 'all';
  const clearFilters = () => { setSearch(''); setFTrigger('all'); setFWho('any'); setFState('all'); };

  const catalogArray = useMemo(() => {
    return groupGifts(catalog).sort((a, b) =>
      (a[1].coins || 0) - (b[1].coins || 0) ||
      String(a[1].name).localeCompare(String(b[1].name))
    );
  }, [catalog]);

  const filteredGifts = useMemo(() => {
    if (!giftSearch) return catalogArray;
    const searchLower = giftSearch.toLowerCase();
    return catalogArray.filter(([, data]) => {
      const matchName = data.name.toLowerCase().includes(searchLower);
      const matchId = data.ids.some(i => i.includes(searchLower));
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

  // Al cambiar de disparador se limpia la condición y se pone la frecuencia por defecto de ese disparador
  const selectTrigger = (id) => {
    setTrigger(id);
    setCondition('');
    setFrequency(defaultFrequency(id));
    setCooldownSeconds(30);
  };

  const handleEditEvent = (evt) => {
    setEditingEventId(evt.id);
    setTrigger(evt.trigger);
    setCondition(evt.condition === 'any' ? '' : String(evt.condition));
    setMatch(evt.match === 'contains' ? 'contains' : 'equals');
    setWhoMode(evt.who?.mode || 'all');
    setWhoUser(evt.who?.username || '');
    const ids = eventActionIds(evt);
    setSelectedActionIds(ids.all);
    setRandomActionIds(ids.random);
    setFrequency(evt.frequency || defaultFrequency(evt.trigger));
    setCooldownSeconds(evt.cooldownSeconds ?? 30);
    setShowForm(true);
  };

  // Validación de la condición según el disparador; devuelve { title, text } o null
  const conditionError = () => {
    const n = Number(condition);
    switch (trigger) {
      case 'gift': return condition ? null : { title: 'Falta el regalo', text: 'Debes seleccionar un regalo del catálogo.' };
      case 'giftcoins': return Number.isInteger(n) && n >= 1 ? null : { title: 'Monedas no válidas', text: 'Escribe cuántas monedas vale el regalo (un número entero de 1 en adelante).' };
      case 'like': return Number.isInteger(n) && n >= 1 ? null : { title: 'Cantidad no válida', text: 'Debes ingresar una cantidad válida de likes.' };
      case 'chattext': return condition.trim() ? null : { title: 'Falta el comentario', text: 'Escribe el comentario que activará el evento.' };
      case 'fanlevel':
      case 'fanlevelmin': return Number.isInteger(n) && n >= 1 && n <= 100 ? null : { title: 'Nivel no válido', text: 'Escribe un nivel de fan válido (un número entero de 1 a 100).' };
      default: return null;
    }
  };

  const handleSaveEvent = () => {
    // Solo cuentan las acciones que siguen existiendo
    const all = selectedActionIds.filter(id => scopeProfile.actions?.[id]);
    const random = randomActionIds.filter(id => scopeProfile.actions?.[id] && !all.includes(id));
    if (!all.length && !random.length) return void showAlert('Elige al menos una acción de tu arsenal.', { title: 'Falta la acción' });
    if (random.length === 1) return void showAlert('Para elegir una al azar marca al menos 2 acciones en "Y una al azar de estas" (con una sola, ponla en "Todas estas a la vez").', { title: 'Acciones al azar' });
    const condErr = conditionError();
    if (condErr) return void showAlert(condErr.text, { title: condErr.title });
    if (whoMode === 'user' && !whoUser.trim().replace(/^@+/, '')) return void showAlert('Escribe el @ del usuario que puede activar el evento.', { title: 'Falta el usuario' });
    const usesFrequency = FREQUENCY_TRIGGERS.includes(trigger);
    if (usesFrequency && frequency === 'cooldown' && !(parseInt(cooldownSeconds, 10) > 0)) return void showAlert('Ingresa un enfriamiento mayor a 0 segundos.', { title: 'Enfriamiento no válido' });

    const isCurrentlyEnabled = editingEventId ? allScopeEvents.find(e => e.id === editingEventId)?.enabled : true;
    const numeric = ['giftcoins', 'like', 'fanlevel', 'fanlevelmin'].includes(trigger);

    const newEvent = {
      id: editingEventId || `evt_${Date.now()}`,
      trigger,
      condition: trigger === 'gift' ? condition : trigger === 'chattext' ? condition.trim() : numeric ? String(parseInt(condition, 10)) : 'any',
      actionIds: all,
      randomActionIds: random,
      enabled: isCurrentlyEnabled !== undefined ? isCurrentlyEnabled : true,
      ...(trigger === 'chattext' && { match }),
      ...(whoMode !== 'all' && { who: { mode: whoMode, ...(whoMode === 'user' && { username: whoUser.trim().replace(/^@+/, '') }) } }),
      ...(usesFrequency && { frequency, cooldownSeconds: Math.max(0, parseInt(cooldownSeconds, 10) || 0) }),
    };

    const updatedEvents = editingEventId
      ? allScopeEvents.map(e => e.id === editingEventId ? newEvent : e)
      : [...allScopeEvents, newEvent];

    updateScopeEvents(updatedEvents);
    if (!editingEventId) { clearFilters(); view.jumpTo(view.lastPageFor(displayEvents.length + 1), CLEARED_KEY); } // la nueva queda al final: se muestra (con los filtros ya limpios)
    resetForm();
  };

  const resetForm = () => {
    setEditingEventId(null);
    setTrigger('gift');
    setCondition('');
    setMatch('equals');
    setWhoMode('all');
    setWhoUser('');
    setSelectedActionIds([]);
    setRandomActionIds([]);
    setShowForm(false);
    setIsGiftModalOpen(false);
    setGiftSearch('');
    setFrequency(defaultFrequency('gift'));
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

  const chip = (text) => <span className="ev-chip">{text}</span>;

  // Qué dispara la regla, para la lista
  const renderTriggerName = (evt) => {
    const who = whoLabel(evt);
    const withExtras = (icon, text, showFrequency) => (
      <span className="ev-trigger-name">
        <Icon name={icon} size={15} /> {text}
        {showFrequency && chip(frequencyLabel(evt))}
        {who && chip(who)}
      </span>
    );
    switch (evt.trigger) {
      case 'follow': return withExtras('user', 'Alguien te sigue');
      case 'share': return withExtras('share', 'Alguien comparte el directo', true);
      case 'join': return withExtras('eye', 'Alguien entra al directo', true);
      case 'superfan': return withExtras('crown', 'Alguien se hace Super Fan', true);
      case 'like': return withExtras('heart', `Al llegar a ${evt.condition} Likes`);
      case 'chat': return withExtras('message', 'Cualquier comentario', true);
      case 'chattext': return withExtras('message', evt.match === 'contains' ? `Comentario que contiene "${evt.condition}"` : `Comentario "${evt.condition}"`, true);
      case 'fanlevel': return withExtras('star', `Sube al nivel de fan ${evt.condition}`);
      case 'fanlevelmin': return withExtras('star', `Sube a nivel de fan ${evt.condition} o más`);
      case 'giftcoins': return withExtras('coin', `Llega un regalo de ${evt.condition} ${Number(evt.condition) === 1 ? 'moneda' : 'monedas'}`);
      case 'gift': {
        const gift = catalog[evt.condition];
        if (gift) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {gift.icon ? (
                <img src={gift.icon} alt={gift.name} style={{ width: '28px', height: '28px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '2px' }} onError={(e) => e.target.style.display = 'none'} />
              ) : <span><Icon name="gift" size={20} /></span>}
              <span>Envían: {gift.name} <span style={{ color: '#ffd700' }}>({gift.coins} <Icon name="gem" size={13} />)</span></span>
              {who && chip(who)}
            </div>
          );
        }
        return withExtras('gift', `Regalo desconocido (ID: ${evt.condition})`);
      }
      default: return <span>{evt.trigger}</span>;
    }
  };

  // Detalle que aparece bajo el disparador elegido
  const renderTriggerDetail = (id) => {
    switch (id) {
      case 'like':
        return (
          <label className="ev-inline">Cada <input type="number" min="1" className="key-input ev-num" placeholder="500" value={condition} onChange={e => setCondition(e.target.value)} /> likes se activa el evento</label>
        );
      case 'chattext':
        return (
          <>
            <input type="text" className="key-input" style={{ width: '100%' }} placeholder="Ej: !hola" maxLength={100} value={condition} onChange={e => setCondition(e.target.value)} />
            <Select className="modifier-select" value={match} onChange={e => setMatch(e.target.value)} style={{ width: '100%' }}>
              {Object.entries(CHAT_MATCHES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <small className="ev-hint">No importan las mayúsculas ni los espacios de más.</small>
          </>
        );
      case 'fanlevel':
        return <label className="ev-inline">Cuando alguien llegue exactamente al nivel <input type="number" min="1" max="100" className="key-input ev-num" placeholder="5" value={condition} onChange={e => setCondition(e.target.value)} /></label>;
      case 'fanlevelmin':
        return <label className="ev-inline">Cuando alguien llegue al nivel <input type="number" min="1" max="100" className="key-input ev-num" placeholder="5" value={condition} onChange={e => setCondition(e.target.value)} /> o a uno mayor</label>;
      case 'giftcoins':
        return (
          <>
            <label className="ev-inline">Regalos que valen <input type="number" min="1" className="key-input ev-num" placeholder="1" value={condition} onChange={e => setCondition(e.target.value)} /> monedas cada uno</label>
            <small className="ev-hint">Sirve cualquier regalo de ese valor (el precio de una unidad).</small>
          </>
        );
      case 'gift':
        return (
          <div
            onClick={() => setIsGiftModalOpen(true)}
            className="ev-gift-pick"
          >
            {condition && catalog[condition] ? (
              <>
                {catalog[condition].icon ? (
                  <img src={catalog[condition].icon} alt="Icon" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                ) : <span style={{ fontSize: '20px' }}><Icon name="gift" size={22} /></span>}
                <span style={{ fontWeight: 'bold' }}>{catalog[condition].name} <span style={{ color: '#ffd700', marginLeft: '4px' }}>({catalog[condition].coins} <Icon name="gem" size={13} />)</span></span>
              </>
            ) : (
              <span className="ev-gift-empty"><Icon name="search" size={15} /> Clic aquí para elegir un regalo...</span>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const triggerDetail = (id) => {
    const base = renderTriggerDetail(id);
    const freq = FREQUENCY_TRIGGERS.includes(id)
      ? <FrequencyPicker frequency={frequency} setFrequency={setFrequency} cooldownSeconds={cooldownSeconds} setCooldownSeconds={setCooldownSeconds} what={FREQUENCY_WHAT[id]} />
      : null;
    return base || freq ? <>{base}{freq}</> : null;
  };

  const currentItem = TRIGGER_GROUPS.flatMap(g => g.items).find(i => i.id === trigger) || TRIGGER_GROUPS[0].items[0];
  const currentDetail = triggerDetail(trigger);

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title={<><Icon name="alert" size={18} /> Eliminar regla</>}
        message="¿Estás seguro de que deseas eliminar este vínculo? Esta acción dejará de ejecutarse en tus directos."
        onConfirm={confirmDeleteEvent}
        onCancel={() => { setIsDeleteModalOpen(false); setEventToDelete(null); }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Vínculos: Eventos de TikTok → Acciones</h3>
        <button className="btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Crear Nuevo Vínculo</button>
      </div>

      <ModalShell
        isOpen={showForm}
        onClose={resetForm}
        title={editingEventId ? <><Icon name="edit" size={16} /> Editando regla</> : <><Icon name="sparkles" size={16} /> Diseñar regla</>}
        width="900px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSaveEvent}>
              {editingEventId ? 'Actualizar Regla' : 'Guardar Regla'}
            </button>
          </>
        }
      >
        <div className="ev-form">
          <section className="ev-step">
            <div className="ev-step-head"><span className="ev-n">1</span> ¿Quién puede activar el evento?</div>
            <div className="ev-pills">
              {WHO_OPTIONS.map(o => (
                <Pill key={o.id} name="ev-who" checked={whoMode === o.id} onSelect={() => setWhoMode(o.id)} label={o.label} />
              ))}
            </div>
            {whoMode === 'user' && (
              <input type="text" className="key-input ev-user" placeholder="@usuario" maxLength={60} value={whoUser} onChange={e => setWhoUser(e.target.value)} />
            )}
            {whoMode !== 'all' && whoMode !== 'user' && (
              <small className="ev-hint">
                TikTok informa si alguien es seguidor, suscriptor o moderador en sus comentarios y regalos. En los demás eventos (entrar, likes...) se usa lo que ya se vio de esa persona
                durante este directo; si todavía no se sabe, no se activa.
              </small>
            )}
          </section>

          <section className="ev-step">
            <div className="ev-step-head"><span className="ev-n">2</span> ¿Por qué se activará el evento?</div>
            <div className="ev-groups">
              {TRIGGER_GROUPS.map(group => (
                <div key={group.label} className={`ev-gcard${group.label === 'General' ? ' wide' : ''}`}>
                  <div className="ev-group-title">{group.label}</div>
                  <div className="ev-pills">
                    {group.items.map(item => (
                      <Pill key={item.id} name="ev-trigger" checked={trigger === item.id} onSelect={() => selectTrigger(item.id)} label={item.label} icon={item.icon} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {currentDetail && (
              <div className="ev-panel">
                <div className="ev-panel-title"><Icon name={currentItem.icon} size={14} /> {currentItem.label}</div>
                {currentDetail}
              </div>
            )}
          </section>

          <section className="ev-step">
            <div className="ev-step-head"><span className="ev-n">3</span> ¿Qué se ejecutará?</div>
            {scopeActionsArray.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#ff4d4d' }}>
                No tienes acciones creadas en este perfil. Ve a la pestaña "Acciones" primero.
              </div>
            ) : (
              <>
                <div className="ev-actions">
                  <div>
                    <div className="evt-list-head"><Icon name="layers" size={14} /> Todas estas a la vez <span>{selectedActionIds.length || ''}</span></div>
                    <ActionChecklist
                      actions={scopeActionsArray} selected={selectedActionIds} blocked={randomActionIds}
                      blockedHint="Ya está en Y una al azar de estas"
                      onToggle={id => setSelectedActionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                    />
                  </div>
                  <div>
                    <div className="evt-list-head"><Icon name="repeat" size={14} /> Y una al azar de estas <span>{randomActionIds.length || ''}</span></div>
                    <ActionChecklist
                      actions={scopeActionsArray} selected={randomActionIds} blocked={selectedActionIds}
                      blockedHint="Ya está en Todas estas a la vez"
                      onToggle={id => setRandomActionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                    />
                  </div>
                </div>
                <p className="evt-hint">La lista de la derecha es opcional: cada vez que ocurra se elige una (con un regalo de varias unidades, una por unidad). Las desactivadas no entran al sorteo.</p>
              </>
            )}
          </section>
        </div>
      </ModalShell>

      {isGiftModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--accent)' }}>Seleccionar Regalo</h3>
              <button onClick={() => setIsGiftModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', display: 'inline-flex' }} aria-label="Cerrar selector de regalos"><Icon name="x" size={18} /></button>
            </div>

            <div style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.2)' }}>
              <input
                type="text" className="key-input"
                placeholder="Busca por nombre o valor de monedas (ej. 1, 99, rosa...)"
                value={giftSearch} onChange={e => setGiftSearch(e.target.value)}
                style={{ width: '100%', fontSize: '15px', padding: '12px' }} autoFocus
              />
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {paginatedGifts.map(([id, data]) => (
                  <div
                    key={id}
                    title={data.ids.length > 1 ? `Este regalo tiene ${data.ids.length} IDs en TikTok (${data.ids.join(', ')}). La regla vale para todos.` : undefined}
                    onClick={() => { setCondition(id); setIsGiftModalOpen(false); setGiftSearch(''); }}
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}
                  >
                    {data.icon ? (
                      <img src={data.icon} loading="lazy" alt={data.name} style={{ width: '40px', height: '40px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }} onError={(e) => e.target.style.display = 'none'} />
                    ) : <span style={{ fontSize: '24px' }}><Icon name="gift" size={26} /></span>}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
                      <div style={{ color: '#ffd700', fontSize: '12px', fontWeight: 'bold', marginTop: '2px' }}>{data.coins} <Icon name="gem" size={13} />{data.ids.length > 1 && <span className="gift-variants" style={{ fontWeight: 600 }}> · {data.ids.length} IDs</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
              {filteredGifts.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text2)' }}>No se encontraron regalos con esa búsqueda.</div>}
            </div>

            {totalGiftPages > 1 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', background: 'rgba(0,0,0,0.1)' }}>
                <button className="btn btn-secondary btn-sm" disabled={giftCurrentPage === 1} onClick={() => setGiftCurrentPage(prev => prev - 1)}><Icon name="chevronLeft" size={14} /> Ant</button>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Pág {giftCurrentPage} de {totalGiftPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={giftCurrentPage === totalGiftPages} onClick={() => setGiftCurrentPage(prev => prev + 1)}>Sig <Icon name="chevronRight" size={14} /></button>
              </div>
            )}
          </div>
        </div>
      )}

      {displayEvents.length > 0 && (
        <ListToolbar
          search={search} onSearch={setSearch} placeholder="Buscar regla (disparador, regalo, acción...)"
          active={filtersActive} onClear={clearFilters}
          filters={[
            { id: 'trigger', label: 'Disparador', value: fTrigger, onChange: setFTrigger, options: [{ value: 'all', label: 'Todos' }, ...TRIGGER_ITEMS.map(i => ({ value: i.id, label: i.label }))] },
            { id: 'who', label: 'Quién', value: fWho, onChange: setFWho, options: [{ value: 'any', label: 'Cualquiera' }, ...WHO_OPTIONS.map(o => ({ value: o.id, label: o.id === 'all' ? 'Abiertas a todos' : o.label }))] },
            { id: 'state', label: 'Estado', value: fState, onChange: setFState, options: [{ value: 'all', label: 'Todos' }, { value: 'enabled', label: 'Activas' }, { value: 'disabled', label: 'Desactivadas' }, { value: 'broken', label: 'Con acciones eliminadas' }] },
          ]}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {displayEvents.length === 0 ? (
          <div className="log-empty">No has vinculado ningún evento en este alcance. ¡Crea tu primera regla arriba!</div>
        ) : view.total === 0 ? (
          <div className="log-empty">Ninguna regla coincide con la búsqueda o los filtros. <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Limpiar</button></div>
        ) : (
          view.pageItems.map(evt => {
            const ids = eventActionIds(evt);
            const nameOf = id => scopeProfile.actions?.[id]?.name;
            const missing = [...ids.all, ...ids.random].filter(id => !nameOf(id)).length;
            return (
              <div key={evt.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(255,235,59,0.1)', borderLeft: '3px solid #ffeb3b', borderRadius: '0 4px 4px 0' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center' }}>{renderTriggerName(evt)}</div>
                  </div>
                  <span style={{ fontSize: '18px' }}><Icon name="bolt" size={18} /></span>
                  <div style={{ padding: '8px 12px', background: 'rgba(76,175,80,0.1)', borderLeft: '3px solid #4caf50', borderRadius: '0 4px 4px 0' }}>
                    {ids.all.some(nameOf) && <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{ids.all.map(nameOf).filter(Boolean).join(' + ')}</div>}
                    {ids.random.some(nameOf) && (
                      <div style={{ fontSize: '13px', marginTop: ids.all.some(nameOf) ? '4px' : 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon name="repeat" size={13} /> <span style={{ color: 'var(--text2)' }}>Al azar:</span> <strong>{ids.random.map(nameOf).filter(Boolean).join(' / ')}</strong>
                      </div>
                    )}
                    {missing > 0 && <div style={{ color: 'red', fontSize: '12px', marginTop: '2px' }}>{missing === 1 ? '1 acción eliminada' : `${missing} acciones eliminadas`}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label className="switch" style={{ marginRight: '8px' }}>
                    <input type="checkbox" checked={evt.enabled} onChange={() => handleToggleEvent(evt.id, evt.enabled)} />
                    <span className="slider"></span>
                  </label>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleEditEvent(evt)} title="Editar" aria-label="Editar"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-secondary btn-sm" style={{ background: '#ff4d4d', color: 'white', border: 'none' }} onClick={() => requestDeleteEvent(evt)} title="Eliminar" aria-label="Eliminar"><Icon name="trash" size={14} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Pagination view={view} noun={view.total === 1 ? 'regla' : 'reglas'} />
    </div>
  );
}
