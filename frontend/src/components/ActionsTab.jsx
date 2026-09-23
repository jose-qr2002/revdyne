import React, { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';

const TYPE_META = {
  keyboard: { icon: '⌨️', label: 'Macro de Teclado' },
  sound: { icon: '🎵', label: 'Sonido Directo' },
  l4d2_command: { icon: '🎮', label: 'Comando L4D2' },
  minecraft_command: { icon: '⛏️', label: 'Comando Minecraft' },
};

// Tipos que el backend YA sabe ejecutar (actionDispatcher.js).
// Los demás aparecen en el selector como referencia, pero deshabilitados,
// para no dejar crear una acción que se guarda pero nunca se dispara.
const SUPPORTED_TYPES = ['keyboard', 'sound'];

export default function ActionsTab({ actions, allowedActionTypes = ['keyboard'], onUpdateConfig }) {
  const [showForm, setShowForm] = useState(false);
  const [editingActionId, setEditingActionId] = useState(null);

  const [name, setName] = useState('');
  const [type, setType] = useState('keyboard');
  const [key, setKey] = useState('');
  const [sound, setSound] = useState('');
  const [delay, setDelay] = useState(80);
  const [soundEveryKey, setSoundEveryKey] = useState(false);

  const [localSounds, setLocalSounds] = useState([]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [actionToDelete, setActionToDelete] = useState(null);

  // 'sound' siempre está disponible sin importar el juego del perfil
  const availableTypes = Array.from(new Set([...(allowedActionTypes || ['keyboard']), 'sound']));

  useEffect(() => {
    const refreshSounds = async () => {
      try {
        const res = await fetch('/api/sounds/list');
        if (!res.ok) return;
        setLocalSounds(await res.json());
      } catch (e) {
        console.error("Error al obtener sonidos");
      }
    };
    refreshSounds();
  }, []);

  // Si cambias de perfil (juego distinto) mientras el form está cerrado,
  // evita quedarte con un tipo que ya no aplica a este perfil.
  useEffect(() => {
    if (!editingActionId && !showForm && !availableTypes.includes(type)) {
      setType(availableTypes.find(t => SUPPORTED_TYPES.includes(t)) || 'keyboard');
    }
  }, [allowedActionTypes]);

  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const isMultiKeyMacro = (macroStr) => {
    if (!macroStr) return false;
    if (!macroStr.includes('{')) return macroStr.length > 1;
    const matches = macroStr.match(/\{[^}]+\}/g);
    return matches && matches.length > 1;
  };

  const isMultiKey = isMultiKeyMacro(key);

  useEffect(() => {
    if (!isMultiKey && soundEveryKey) setSoundEveryKey(false);
  }, [isMultiKey, soundEveryKey]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showToast = (type, text) => setNotification({ type, text });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      showToast('error', 'Solo se permiten archivos de audio (.mp3, .wav).');
      e.target.value = '';
      return;
    }

    const tempUrl = URL.createObjectURL(file);
    const audio = new Audio(tempUrl);

    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(tempUrl);
      if (audio.duration > 10) {
        setConfirmDialog({ file, duration: audio.duration });
        e.target.value = '';
        return;
      }
      executeUpload(file);
      e.target.value = '';
    };
  };

  const executeUpload = async (file) => {
    setIsUploading(true);
    setConfirmDialog(null);

    const formData = new FormData();
    formData.append('sound', file);

    try {
      const res = await fetch('/api/sounds/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) {
        showToast('error', 'Error del servidor: ' + data.error);
      } else {
        showToast('success', '¡Sonido subido con éxito!');
        setLocalSounds(prev => prev.includes(data.filename) ? prev : [...prev, data.filename]);
        setSound(data.filename);
      }
    } catch (err) {
      showToast('error', 'Error de red al intentar subir el archivo.');
    }
    setIsUploading(false);
  };

  const handleEditAction = (id, act) => {
    setEditingActionId(id);
    setName(act.name);
    setType(act.type);
    setKey(act.key || '');
    setSound(act.sound || '');
    setDelay(act.delay || 80);
    setSoundEveryKey(act.soundEveryKey || false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAction = () => {
    if (!name.trim()) return showToast('error', 'Ponle un nombre a la acción');
    if (type === 'keyboard' && !key.trim()) return showToast('error', 'Ingresa la tecla o macro');
    if (type === 'sound' && !sound) return showToast('error', 'Selecciona un archivo de sonido');
    if (!SUPPORTED_TYPES.includes(type)) return showToast('error', 'Este tipo de acción todavía no está disponible');

    const actionId = editingActionId || `act_${Date.now()}`;
    const isCurrentlyEnabled = editingActionId && actions[editingActionId] ? actions[editingActionId].enabled : true;

    let newAction;
    if (type === 'keyboard') {
      newAction = {
        name, type, enabled: isCurrentlyEnabled,
        key: key.toLowerCase(),
        sound: sound || null,
        delay: parseInt(delay) || 80,
        soundEveryKey: isMultiKey ? soundEveryKey : false
      };
    } else {
      // type === 'sound': el archivo ES la acción, no un extra
      newAction = {
        name, type, enabled: isCurrentlyEnabled,
        sound,
        delay: parseInt(delay) || 0
      };
    }

    onUpdateConfig({ actions: { ...actions, [actionId]: newAction } });
    resetForm();
  };

  const resetForm = () => {
    setEditingActionId(null);
    setName(''); setKey(''); setSound(''); setDelay(80); setSoundEveryKey(false);
    setType(availableTypes.find(t => SUPPORTED_TYPES.includes(t)) || 'keyboard');
    setShowForm(false);
  };

  const requestDeleteAction = (id) => {
    setActionToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteAction = () => {
    if (!actionToDelete) return;
    const updatedActions = { ...actions };
    delete updatedActions[actionToDelete];
    onUpdateConfig({ actions: updatedActions });
    setIsDeleteModalOpen(false);
    setActionToDelete(null);
  };

  const handleToggleAction = (id, currentStatus) => {
    onUpdateConfig({ actions: { ...actions, [id]: { ...actions[id], enabled: !currentStatus } } });
  };

  const renderSoundPicker = () => (
    <div style={{ display: 'flex', gap: '8px' }}>
      <select
        className="modifier-select"
        value={sound}
        onChange={e => setSound(e.target.value)}
        style={{ flex: 1, minWidth: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        <option value="">{type === 'sound' ? 'Selecciona un sonido...' : 'Sin sonido'}</option>
        {localSounds.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input type="file" accept="audio/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
      <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()} disabled={isUploading} title="Subir audio (.mp3, .wav)" style={{ padding: '0 12px', fontWeight: 'bold' }}>
        {isUploading ? '⏳' : '➕ Subir'}
      </button>
    </div>
  );

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="⚠️ Eliminar Acción"
        message="¿Estás seguro de que deseas eliminar esta acción del arsenal? Cualquier evento de TikTok o Sticker vinculado a ella dejará de funcionar."
        onConfirm={confirmDeleteAction}
        onCancel={() => { setIsDeleteModalOpen(false); setActionToDelete(null); }}
      />

      {notification && (
        <div style={{
          position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
          background: notification.type === 'error' ? '#f44336' : '#4caf50',
          color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'fadeInDown 0.3s ease-out'
        }}>
          <span>{notification.type === 'error' ? '❌' : '✅'}</span>
          <span>{notification.text}</span>
        </div>
      )}

      {confirmDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card)', border: '2px solid #ff9800', borderRadius: '12px', width: '100%', maxWidth: '450px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: '40px' }}>⚠️</div>
            <h3 style={{ margin: 0, color: '#ff9800' }}>ADVERTENCIA DE DURACIÓN</h3>
            <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
              El audio <strong>"{confirmDialog.file.name}"</strong> dura <strong>{confirmDialog.duration.toFixed(1)} segundos</strong>.
              <br /><br />
              Si te envían muchos regalos seguidos, estos audios largos se solaparán y causarán un caos de ruido en tu directo.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDialog(null)}>Cancelar</button>
              <button className="btn" style={{ flex: 1, background: '#ff9800', color: 'white' }} onClick={() => executeUpload(confirmDialog.file)}>Subir de todos modos</button>
            </div>
          </div>
        </div>
      )}

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

            <div style={{ minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Tipo de Acción</label>
              <select className="modifier-select" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }} disabled={editingActionId !== null}>
                {availableTypes.map(t => {
                  const meta = TYPE_META[t] || { icon: '❓', label: t };
                  const supported = SUPPORTED_TYPES.includes(t);
                  return (
                    <option key={t} value={t} disabled={!supported}>
                      {meta.icon} {meta.label}{!supported ? ' (próximamente)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {type === 'keyboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: 2, minWidth: '180px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Secuencia / Tecla</label>
                  <input type="text" className="key-input" placeholder="Ej: r, o {shift+w}{space}" value={key} onChange={e => setKey(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontSize: '14px' }} />
                </div>
                <div style={{ flex: 1, minWidth: '90px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Retraso (ms) ⏳</label>
                  <input type="number" className="key-input" value={delay} onChange={e => setDelay(e.target.value)} style={{ width: '100%', textAlign: 'center' }} min="10" max="5000" />
                </div>
                <div style={{ flex: 2, minWidth: '220px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Sonido de Alerta (opcional)</label>
                  {renderSoundPicker()}
                </div>
              </div>

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

          {type === 'sound' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 2, minWidth: '220px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Archivo de sonido</label>
                  {renderSoundPicker()}
                </div>
                <div style={{ flex: 1, minWidth: '90px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Retraso (ms) ⏳</label>
                  <input type="number" className="key-input" value={delay} onChange={e => setDelay(e.target.value)} style={{ width: '100%', textAlign: 'center' }} min="0" max="5000" />
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text2)', margin: 0 }}>
                Este tipo dispara solo el sonido, sin presionar ninguna tecla.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn btn-sm" style={{ background: editingActionId ? '#00bcd4' : '', color: editingActionId ? 'white' : 'black' }} onClick={handleSaveAction}>
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
                    {act.sound && !act.soundEveryKey && <span style={{ color: '#4caf50', fontSize: '12px' }}>🔊 {act.sound} (1 vez)</span>}
                    {act.sound && act.soundEveryKey && <span style={{ color: '#ffeb3b', fontSize: '12px' }}>🔊 {act.sound} (En cada tecla)</span>}
                  </div>
                )}

                {act.type === 'sound' && (
                  <div style={{ fontSize: '13px', marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(76,175,80,0.15)', color: '#4caf50', padding: '4px 8px', borderRadius: '4px' }}>🎵 {act.sound}</span>
                    <span style={{ background: 'rgba(255,152,0,0.2)', color: '#ff9800', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>⏳ {act.delay || 0}ms</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="switch" style={{ marginRight: '8px' }}>
                  <input type="checkbox" checked={act.enabled} onChange={() => handleToggleAction(id, act.enabled)} />
                  <span className="slider"></span>
                </label>
                <button className="btn btn-secondary btn-sm" onClick={() => handleEditAction(id, act)}>✏️</button>
                <button className="btn btn-secondary btn-sm" style={{ background: '#ff4d4d', color: 'white', border: 'none' }} onClick={() => requestDeleteAction(id)}>🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}