import React, { useState } from 'react';

export default function ActionsTab({ actions, availableSounds, onUpdateConfig }) {
  const [showForm, setShowForm] = useState(false);
  const [editingActionId, setEditingActionId] = useState(null); // 🌟 NUEVO: Estado para saber si estamos editando
  const [name, setName] = useState('');
  const [type, setType] = useState('keyboard');
  const [key, setKey] = useState('');
  const [sound, setSound] = useState('');

  // 🌟 NUEVO: Función para cargar los datos en el formulario
  const handleEditAction = (id, act) => {
    setEditingActionId(id);
    setName(act.name);
    setType(act.type);
    setKey(act.key || '');
    setSound(act.sound || '');
    setShowForm(true);
  };

  const handleSaveAction = () => {
    if (!name.trim()) return alert('Por favor, ponle un nombre a la acción');
    if (type === 'keyboard' && !key.trim()) return alert('Por favor, ingresa la tecla o macro');

    // Si estamos editando, usamos el ID existente. Si no, creamos uno nuevo.
    const actionId = editingActionId || `act_${Date.now()}`;
    
    // Conservamos el estado 'enabled' si estamos editando
    const isCurrentlyEnabled = editingActionId && actions[editingActionId] ? actions[editingActionId].enabled : true;

    const newAction = {
      name,
      type,
      enabled: isCurrentlyEnabled,
      ...(type === 'keyboard' && { key: key.toLowerCase(), sound: sound || null })
    };

    const updatedActions = {
      ...actions,
      [actionId]: newAction
    };

    onUpdateConfig({ actions: updatedActions });

    // Limpiar formulario y salir del modo edición
    resetForm();
  };

  const resetForm = () => {
    setEditingActionId(null);
    setName('');
    setKey('');
    setSound('');
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
          <h4 style={{ color: editingActionId ? '#00bcd4' : 'white' }}>
            {editingActionId ? '✏️ Editando Acción' : '✨ Nueva Acción'}
          </h4>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Nombre de la Acción</label>
              <input type="text" className="key-input" placeholder="Ej: Curarse, Correr, Disparar..." value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div style={{ minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Tipo de Acción</label>
              <select className="modifier-select" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }} disabled={editingActionId !== null}>
                <option value="keyboard">⌨️ Macro de Teclado</option>
                <option value="rcon" disabled>📡 Comando RCON (Próximamente)</option>
              </select>
            </div>
          </div>

          {type === 'keyboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: '250px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Secuencia / Tecla</label>
                  <input type="text" className="key-input" placeholder="Ej: r, o {shift+w}{space}" value={key} onChange={e => setKey(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontSize: '14px' }} />
                  <div style={{ fontSize: '11px', color: '#ffeb3b', marginTop: '6px' }}>
                    <strong>Guía:</strong> Usa una letra normal (ej: <code>r</code>) o combinaciones (ej: <code>{'{shift+w}'}</code>).
                  </div>
                </div>

                <div style={{ minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Sonido de Alerta (Opcional)</label>
                  <select className="modifier-select" value={sound} onChange={e => setSound(e.target.value)} style={{ width: '100%' }}>
                    <option value="">Sin sonido</option>
                    {availableSounds.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn btn-sm" style={{ background: editingActionId ? '#00bcd4' : '' }} onClick={handleSaveAction}>
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
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
                  ID Interno: {id} · Tipo: <span style={{ color: '#00bcd4' }}>{act.type}</span>
                </div>
                {act.type === 'keyboard' && (
                  <div style={{ fontSize: '13px', marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontFamily: 'monospace', letterSpacing: '1px' }}>
                      {act.key}
                    </span>
                    {act.sound && <span style={{ color: '#4caf50', fontSize: '12px' }}>🔊 {act.sound}</span>}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="switch" style={{ marginRight: '8px' }}>
                  <input type="checkbox" checked={act.enabled} onChange={() => handleToggleAction(id, act.enabled)} />
                  <span className="slider"></span>
                </label>
                
                {/* 🌟 NUEVO: Botón Editar */}
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => handleEditAction(id, act)}
                >
                  ✏️
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  style={{ background: '#ff4d4d', color: 'white', border: 'none' }}
                  onClick={() => handleDeleteAction(id)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}