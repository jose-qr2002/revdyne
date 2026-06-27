import React, { useState, useEffect } from 'react';

export default function ActionsTab({ actions, availableSounds, onUpdateConfig }) {
  const [showForm, setShowForm] = useState(false);
  const [editingActionId, setEditingActionId] = useState(null);
  
  const [name, setName] = useState('');
  const [type, setType] = useState('keyboard');
  const [key, setKey] = useState('');
  const [sound, setSound] = useState('');
  const [delay, setDelay] = useState(80);
  const [soundEveryKey, setSoundEveryKey] = useState(false); // 🌟 NUEVO: Estado del interruptor

  // 🧠 FUNCIÓN INTELIGENTE: Detecta si la macro tiene más de una tecla
  const isMultiKeyMacro = (macroStr) => {
    if (!macroStr) return false;
    if (!macroStr.includes('{')) return macroStr.length > 1; // Ej: "rr" o "wasd" (múltiples teclas)
    const matches = macroStr.match(/\{[^}]+\}/g);
    return matches && matches.length > 1; // Ej: "{q}{w}" (múltiples teclas)
  };

  const isMultiKey = isMultiKeyMacro(key);

  // Si el usuario borra teclas y deja solo una, apagamos el interruptor automáticamente
  useEffect(() => {
    if (!isMultiKey && soundEveryKey) {
      setSoundEveryKey(false);
    }
  }, [isMultiKey, soundEveryKey]);

  const handleEditAction = (id, act) => {
    setEditingActionId(id);
    setName(act.name);
    setType(act.type);
    setKey(act.key || '');
    setSound(act.sound || '');
    setDelay(act.delay || 80);
    setSoundEveryKey(act.soundEveryKey || false); // 🌟 Cargar preferencia
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAction = () => {
    if (!name.trim()) return alert('Por favor, ponle un nombre a la acción');
    if (type === 'keyboard' && !key.trim()) return alert('Por favor, ingresa la tecla o macro');

    const actionId = editingActionId || `act_${Date.now()}`;
    const isCurrentlyEnabled = editingActionId && actions[editingActionId] ? actions[editingActionId].enabled : true;

    const newAction = {
      name,
      type,
      enabled: isCurrentlyEnabled,
      ...(type === 'keyboard' && { 
        key: key.toLowerCase(), 
        sound: sound || null,
        delay: parseInt(delay) || 80,
        soundEveryKey: isMultiKey ? soundEveryKey : false // 🌟 Guardar preferencia real
      })
    };

    const updatedActions = { ...actions, [actionId]: newAction };
    onUpdateConfig({ actions: updatedActions });
    resetForm();
  };

  const resetForm = () => {
    setEditingActionId(null);
    setName('');
    setKey('');
    setSound('');
    setDelay(80);
    setSoundEveryKey(false);
    setShowForm(false);
  };

  const handleDeleteAction = (id) => {
    const updatedActions = { ...actions };
    delete updatedActions[id];
    onUpdateConfig({ actions: updatedActions });
  };

  const handleToggleAction = (id, currentStatus) => {
    const updatedActions = {
      ...actions,
      [id]: { ...actions[id], enabled: !currentStatus }
    };
    onUpdateConfig({ actions: updatedActions });
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Arsenal de Acciones Disponibles</h3>
        <button className="btn" onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? 'Cancelar' : '+ Crear Nueva Acción'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--card)', border: editingActionId ? '1px solid #00bcd4' : '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ color: editingActionId ? '#00bcd4' : 'white', margin: 0 }}>
            {editingActionId ? '✏️ Editando Acción' : '✨ Nueva Acción'}
          </h4>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Nombre de la Acción</label>
              <input type="text" className="key-input" placeholder="Ej: Combo Sanación..." value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div style={{ minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Tipo de Acción</label>
              <select className="modifier-select" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }} disabled={editingActionId !== null}>
                <option value="keyboard">⌨️ Macro de Teclado</option>
              </select>
            </div>
          </div>

          {type === 'keyboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                
                <div style={{ flex: 2, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Secuencia / Tecla</label>
                  <input type="text" className="key-input" placeholder="Ej: r, o {shift+w}{space}" value={key} onChange={e => setKey(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontSize: '14px' }} />
                </div>

                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Retraso (ms) ⏳</label>
                  <input type="number" className="key-input" value={delay} onChange={e => setDelay(e.target.value)} style={{ width: '100%', textAlign: 'center' }} min="10" max="5000" />
                </div>

                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Sonido de Alerta</label>
                  <select className="modifier-select" value={sound} onChange={e => setSound(e.target.value)} style={{ width: '100%' }}>
                    <option value="">Sin sonido</option>
                    {availableSounds.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* 🌟 NUEVO: OPCIONES AVANZADAS DE SONIDO (Solo visible si hay sonido y macro múltiple) */}
              {sound && isMultiKey && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '4px', padding: '8px', background: 'rgba(255, 152, 0, 0.1)', borderRadius: '6px', borderLeft: '3px solid #ff9800' }}>
                  <label style={{ fontSize: '12px', color: '#ffeb3b', margin: 0, cursor: 'pointer' }}>
                    🔊 ¿Reproducir sonido en <strong>cada</strong> tecla del combo?
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={soundEveryKey} onChange={e => setSoundEveryKey(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn btn-sm" style={{ background: editingActionId ? '#00bcd4' : '', color: 'white' }} onClick={handleSaveAction}>
              {editingActionId ? 'Actualizar Acción' : 'Guardar Acción'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Object.entries(actions || {}).length === 0 ? (
          <div className="log-empty">No has creado ninguna acción todavía. ¡Crea una arriba!</div>
        ) : (
          Object.entries(actions).map(([id, act]) => (
            <div key={id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{act.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ID: {id}</div>
                {act.type === 'keyboard' && (
                  <div style={{ fontSize: '13px', marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>{act.key}</span>
                    <span style={{ background: 'rgba(255,152,0,0.2)', color: '#ff9800', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>⏳ {act.delay || 80}ms</span>
                    
                    {/* 🌟 Mostrar insignia visual si configuró ametralladora de sonido */}
                    {act.sound && !act.soundEveryKey && <span style={{ color: '#4caf50', fontSize: '12px' }}>🔊 {act.sound} (1 vez)</span>}
                    {act.sound && act.soundEveryKey && <span style={{ color: '#ffeb3b', fontSize: '12px' }}>🔊 {act.sound} (En cada tecla)</span>}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="switch" style={{ marginRight: '8px' }}>
                  <input type="checkbox" checked={act.enabled} onChange={() => handleToggleAction(id, act.enabled)} />
                  <span className="slider"></span>
                </label>
                <button className="btn btn-secondary btn-sm" onClick={() => handleEditAction(id, act)}>✏️</button>
                <button className="btn btn-secondary btn-sm" style={{ background: '#ff4d4d', color: 'white', border: 'none' }} onClick={() => handleDeleteAction(id)}>🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}