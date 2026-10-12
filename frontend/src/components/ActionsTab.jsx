import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import ConfirmModal from './ConfirmModal';
import ModalShell from './ModalShell';
import ActionStepEditor from './ActionStepEditor';
import ListToolbar from './ListToolbar';
import Pagination from './Pagination';
import { useListView, searchKey } from '../hooks/useListView';
import { STEP_TYPES, ALWAYS_AVAILABLE, getSteps, newStep, totalPresses, comboLabel, MAX_WAIT_MS, MAX_REPEAT, MIN_KEY_DELAY_MS, IMAGE_MIN_SECONDS, IMAGE_MAX_SECONDS, IMAGE_DEFAULT_SECONDS, ALERT_DEFAULT_SECONDS } from '../services/actionSteps';

const TEST_DELAY_MS = 5000;

// ID de una acción nueva (fuera del componente: es un valor que cambia en cada llamada)
const newActionId = () => `act_${Date.now()}`;

const toVolume = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100; // 0 es un valor válido (silencio)
};
const toWait = (v) => Math.min(MAX_WAIT_MS, Math.max(0, parseInt(v, 10) || 0));

// Paso tal como se guarda (sin el `uid` de la UI y con los valores normalizados)
function cleanStep(step) {
  // eslint-disable-next-line no-unused-vars
  const { uid, ...rest } = step;
  const wait = toWait(rest.wait);
  switch (rest.type) {
    case 'keyboard':
      return {
        type: 'keyboard', wait,
        keys: (rest.keys || []).filter(k => k && k.key).map(k => ({
          key: String(k.key).toLowerCase(),
          modifiers: Array.isArray(k.modifiers) ? k.modifiers : [],
          delay: Math.min(MAX_WAIT_MS, Math.max(MIN_KEY_DELAY_MS, parseInt(k.delay, 10) || MIN_KEY_DELAY_MS)),
          repeat: Math.min(MAX_REPEAT, Math.max(1, parseInt(k.repeat, 10) || 1)),
        })),
      };
    case 'sound':
      return { type: 'sound', sound: rest.sound, volume: toVolume(rest.volume), everyKey: !!rest.everyKey, wait };
    case 'video':
      return { type: 'video', video: rest.video, screen: Math.min(9, Math.max(1, parseInt(rest.screen, 10) || 1)), volume: toVolume(rest.volume), wait };
    case 'image':
      return { type: 'image', image: rest.image, screen: Math.min(9, Math.max(1, parseInt(rest.screen, 10) || 1)), duration: Math.min(IMAGE_MAX_SECONDS, Math.max(IMAGE_MIN_SECONDS, parseFloat(rest.duration) || IMAGE_DEFAULT_SECONDS)), wait };
    case 'alert':
      return {
        type: 'alert', text: String(rest.text || '').slice(0, 200), screen: Math.min(9, Math.max(1, parseInt(rest.screen, 10) || 1)),
        duration: Math.min(60, Math.max(1, parseFloat(rest.duration) || ALERT_DEFAULT_SECONDS)),
        showAvatar: rest.showAvatar !== false, showGift: !!rest.showGift, singleLine: !!rest.singleLine, style: rest.style && typeof rest.style === 'object' ? rest.style : {}, wait,
      };
    case 'win':
      return { type: 'win', mode: rest.mode === 'decrease' ? 'decrease' : 'increase', amount: Math.min(1000, Math.max(1, parseInt(rest.amount, 10) || 1)), wait };
    default:
      return { ...rest, wait }; // tipo que todavía no existe: se conserva
  }
}

function stepError(step) {
  if (step.type === 'keyboard' && !(step.keys || []).some(k => k && k.key)) return 'Añade al menos una tecla al paso de teclas (botón "Añadir tecla")';
  if (step.type === 'sound' && !step.sound) return 'Elige el archivo del paso de sonido';
  if (step.type === 'video' && !step.video) return 'Elige el video del paso de video';
  if (step.type === 'image' && !step.image) return 'Elige la imagen o GIF del paso de imagen';
  if (step.type === 'alert' && !String(step.text || '').trim()) return 'Escribe el texto de la alerta';
  if (step.type === 'win' && !(parseInt(step.amount, 10) >= 1)) return 'La cantidad de wins debe ser 1 o más';
  return null;
}

const CHIP = { padding: '4px 8px', borderRadius: '4px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' };
const waitChip = (s) => (s.wait > 0 ? <span style={{ ...CHIP, background: 'rgba(255,152,0,0.2)', color: '#ff9800' }}><Icon name="clock" size={12} /> a los {(s.wait / 1000).toString()}s</span> : null);

// Resumen de los pasos en la lista de acciones
function StepChips({ steps }) {
  if (!steps.length) return <div className="step-chips"><span style={{ ...CHIP, color: 'var(--text3)' }}>Sin pasos</span></div>;
  return (
    <div className="step-chips">
      {steps.map((s, i) => (
        <span key={i} className="step-chip-group">
          {i > 0 && <span className="step-plus">+</span>}
          {s.type === 'keyboard' && (s.keys || []).map((k, j) => (
            <span key={j} style={{ ...CHIP, background: 'rgba(255,255,255,0.1)', fontFamily: 'monospace', fontSize: '13px' }} title={`Espera ${k.delay ?? 80} ms tras cada pulsación`}>
              <Icon name="keyboard" size={13} /> {comboLabel(k)}{(k.repeat || 1) > 1 ? ` x${k.repeat}` : ''}
            </span>
          ))}
          {s.type === 'sound' && <span style={{ ...CHIP, background: 'rgba(76,175,80,0.15)', color: s.everyKey ? '#ffeb3b' : '#4caf50' }}><Icon name="music" size={13} /> {s.sound} · {s.volume ?? 100}%{s.everyKey ? ' (en cada tecla)' : ''}</span>}
          {s.type === 'video' && <span style={{ ...CHIP, background: 'rgba(76,175,80,0.15)', color: '#4caf50' }}><Icon name="film" size={13} /> {s.video} · P{s.screen || 1} · {s.volume ?? 100}%</span>}
          {s.type === 'image' && <span style={{ ...CHIP, background: 'rgba(76,175,80,0.15)', color: '#4caf50' }}><Icon name="image" size={13} /> {s.image} · P{s.screen || 1} · {s.duration ?? 5}s</span>}
          {s.type === 'alert' && <span style={{ ...CHIP, background: 'rgba(76,175,80,0.15)', color: '#4caf50', maxWidth: '320px' }} title={s.text}><Icon name="sparkles" size={13} /> <span className="ellipsis">{s.text}</span> · P{s.screen || 1} · {s.duration ?? 6}s</span>}
          {s.type === 'win' && (
            <span style={{ ...CHIP, fontWeight: 'bold', background: s.mode === 'decrease' ? 'rgba(255,0,80,0.15)' : 'rgba(76,175,80,0.15)', color: s.mode === 'decrease' ? 'var(--accent2)' : '#4caf50' }}>
              <Icon name="trophy" size={13} /> {s.mode === 'decrease' ? '−' : '+'}{s.amount ?? 1} {(s.amount ?? 1) == 1 ? 'win' : 'wins'}
            </span>
          )}
          {!['keyboard', 'sound', 'video', 'image', 'alert', 'win'].includes(s.type) && <span style={{ ...CHIP, color: 'var(--text3)' }}>{STEP_TYPES[s.type]?.label || s.type} (no disponible)</span>}
          {waitChip(s)}
        </span>
      ))}
    </div>
  );
}

// Clave de la búsqueda y los filtros actuales (al cambiar, la lista vuelve a la página 1) y la de "sin filtros"
const listKey = (query, type, state) => [query, type, state].join('|');
const CLEARED_KEY = listKey('', 'all', 'all');

export default function ActionsTab({ actions, allowedActionTypes = ['keyboard'], onUpdateConfig }) {
  const [showForm, setShowForm] = useState(false);
  const [editingActionId, setEditingActionId] = useState(null);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState([]); // [{ uid, type, ... }]
  const uidRef = useRef(0);

  const [countdowns, setCountdowns] = useState({}); // actionId -> { testId, left }
  const countdownIntervals = useRef({});

  const [localSounds, setLocalSounds] = useState([]);
  const [videoList, setVideoList] = useState([]);
  const [imageList, setImageList] = useState([]);
  // Búsqueda y filtros de la lista de acciones
  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('all');   // acciones que tienen un paso de este tipo
  const [fState, setFState] = useState('all'); // activas | desactivadas
  const [alertInfo, setAlertInfo] = useState(null); // fuentes, valores por defecto y límites del diseño de alertas (los da el servidor)
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);
  const [uploadingSound, setUploadingSound] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const soundInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const uploadTargetRef = useRef(null); // uid del paso que recibe el archivo subido

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [actionToDelete, setActionToDelete] = useState(null);
  const [notification, setNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Tipos de paso que se pueden añadir: los del juego del perfil + los que valen en cualquier juego, en el orden de STEP_TYPES
  const allowed = new Set([...(allowedActionTypes || ['keyboard']), ...ALWAYS_AVAILABLE]);
  const addableTypes = Object.keys(STEP_TYPES).filter(t => allowed.has(t));

  useEffect(() => {
    const refreshSounds = () => fetch('/api/sounds/list').then(r => (r.ok ? r.json() : [])).then(setLocalSounds).catch(() => console.error('Error al obtener sonidos'));
    refreshSounds();
    // Al volver a la app (p. ej. tras copiar audios a la carpeta desde el Explorador) se relee la lista
    window.addEventListener('focus', refreshSounds);
    fetch('/api/overlays/video').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.alert) setAlertInfo(d.alert); }).catch(() => console.error('Error al obtener los datos de las alertas'));
    fetch('/api/images/list').then(r => (r.ok ? r.json() : [])).then(list => setImageList(list.map(v => v.name))).catch(() => console.error('Error al obtener imágenes'));
    fetch('/api/videos/list').then(r => (r.ok ? r.json() : [])).then(list => setVideoList(list.map(v => v.name))).catch(() => console.error('Error al obtener videos'));
    return () => window.removeEventListener('focus', refreshSounds);
  }, []);

  useEffect(() => () => Object.values(countdownIntervals.current).forEach(clearInterval), []);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const showToast = (type, text) => setNotification({ type, text });

  // ---- Probar ----
  const stopCountdown = (actionId) => {
    clearInterval(countdownIntervals.current[actionId]);
    delete countdownIntervals.current[actionId];
    setCountdowns(prev => { const next = { ...prev }; delete next[actionId]; return next; });
  };

  const testAction = async (id, delayMs = 0) => {
    try {
      const res = await fetch('/api/actions/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: id, delayMs })
      });
      const data = await res.json();
      if (!res.ok) return showToast('error', data.error || 'No se pudo probar la acción');

      if (delayMs === 0) {
        if (!data.ok) return showToast('error', 'La acción no se ejecutó');
        return showToast('success', data.simulated ? 'Ejecutada en modo simulación (sin motor de teclado)' : 'Acción ejecutada');
      }

      const seconds = Math.round(delayMs / 1000);
      showToast('success', `Se ejecutará en ${seconds} s: cambia a tu juego`);
      setCountdowns(prev => ({ ...prev, [id]: { testId: data.testId, left: seconds } }));

      let left = seconds;
      countdownIntervals.current[id] = setInterval(() => {
        left -= 1;
        if (left <= 0) stopCountdown(id);
        else setCountdowns(prev => prev[id] ? { ...prev, [id]: { ...prev[id], left } } : prev);
      }, 1000);
    } catch {
      showToast('error', 'Error de red al probar la acción');
    }
  };

  const cancelTest = async (id) => {
    const cd = countdowns[id];
    if (!cd) return;
    stopCountdown(id);
    try {
      await fetch(`/api/actions/test/${cd.testId}`, { method: 'DELETE' });
      showToast('success', 'Prueba cancelada');
    } catch {
      showToast('error', 'No se pudo cancelar, la acción puede ejecutarse igual');
    }
  };

  // ---- Pasos ----
  const withUid = (step) => ({ ...step, uid: ++uidRef.current });
  const updateStep = (uid, patch) => setSteps(prev => prev.map(s => (s.uid === uid ? { ...s, ...patch } : s)));
  const removeStep = (uid) => setSteps(prev => prev.filter(s => s.uid !== uid));
  const addStep = (type) => setSteps(prev => [...prev, withUid(newStep(type))]);

  // ---- Subidas ----
  const pickSound = (uid) => { uploadTargetRef.current = uid; soundInputRef.current.click(); };
  const pickVideo = (uid) => { uploadTargetRef.current = uid; videoInputRef.current.click(); };
  const pickImage = (uid) => { uploadTargetRef.current = uid; imageInputRef.current.click(); };

  const handleSoundFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const target = uploadTargetRef.current;
    if (!file.type.startsWith('audio/')) return showToast('error', 'Solo se permiten archivos de audio (.mp3, .wav).');

    const tempUrl = URL.createObjectURL(file);
    const audio = new Audio(tempUrl);
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(tempUrl);
      if (audio.duration > 10) setConfirmDialog({ file, duration: audio.duration, target });
      else uploadSound(file, target);
    };
  };

  const uploadSound = async (file, target) => {
    setUploadingSound(true);
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
        updateStep(target, { sound: data.filename });
      }
    } catch {
      showToast('error', 'Error de red al intentar subir el archivo.');
    }
    setUploadingSound(false);
  };

  const handleImageFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const target = uploadTargetRef.current;
    setUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/images/upload', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        showToast('error', data.error || 'No se pudo subir la imagen');
      } else {
        showToast('success', '¡Imagen subida con éxito!');
        setImageList(prev => prev.includes(data.filename) ? prev : [data.filename, ...prev]);
        updateStep(target, { image: data.filename });
      }
    } catch {
      showToast('error', 'Error de red al intentar subir la imagen.');
    }
    setUploadingImage(false);
  };

  const handleVideoFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const target = uploadTargetRef.current;
    setUploadingVideo(true);
    const formData = new FormData();
    formData.append('video', file);
    try {
      const res = await fetch('/api/videos/upload', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        showToast('error', data.error || 'No se pudo subir el video');
      } else {
        showToast('success', '¡Video subido con éxito!');
        setVideoList(prev => prev.includes(data.filename) ? prev : [data.filename, ...prev]);
        updateStep(target, { video: data.filename });
      }
    } catch {
      showToast('error', 'Error de red al intentar subir el video.');
    }
    setUploadingVideo(false);
  };

  const openSoundsFolder = async () => {
    try {
      const res = await fetch('/api/sounds/open-folder', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) showToast('error', `No se pudo abrir la carpeta: ${data.dir || ''}`);
    } catch {
      showToast('error', 'Error de red al abrir la carpeta de sonidos');
    }
  };

  // ---- Crear / editar ----
  const openNew = () => {
    setEditingActionId(null);
    setName('');
    setSteps([]);
    setShowForm(true);
  };

  const handleEditAction = (id, act) => {
    setEditingActionId(id);
    setName(act.name);
    setSteps(getSteps(act).map(s => withUid({ wait: 0, ...s })));
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingActionId(null);
    setName('');
    setSteps([]);
    setShowForm(false);
  };

  const handleSaveAction = () => {
    if (!name.trim()) return showToast('error', 'Ponle un nombre a la acción');
    if (!steps.length) return showToast('error', 'Añade al menos un paso (tecla, sonido, video...)');
    const error = steps.map(stepError).find(Boolean);
    if (error) return showToast('error', error);

    const actionId = editingActionId || newActionId();
    const isCurrentlyEnabled = editingActionId && actions[editingActionId] ? actions[editingActionId].enabled : true;
    // "en cada pulsación" solo vale con varias pulsaciones; si se quitaron las teclas, se guarda desmarcado
    const multi = totalPresses(steps) > 1;
    const newAction = { name, enabled: isCurrentlyEnabled, steps: steps.map(cleanStep).map(st => (st.type === 'sound' ? { ...st, everyKey: st.everyKey && multi } : st)) };

    onUpdateConfig({ actions: { ...actions, [actionId]: newAction } });
    if (!editingActionId) { clearFilters(); view.jumpTo(view.lastPageFor(Object.keys(actions || {}).length + 1), CLEARED_KEY); } // la nueva queda al final: se muestra (con los filtros ya limpios)
    resetForm();
  };

  // Sonido "en cada pulsación": solo si la acción tiene más de una pulsación en total, y solo un paso de sonido puede usarlo
  const presses = totalPresses(steps);
  const everyKeyOwner = steps.find(s => s.type === 'sound' && s.everyKey)?.uid ?? null;

  // ---- Búsqueda, filtros y paginación de la lista ----
  // Texto donde busca la barra: nombre, ID y el contenido de cada paso (teclas, archivos de sonido/video/imagen, texto de la alerta...)
  const actionSearchText = (id, act) => searchKey([
    act.name, id,
    ...getSteps(act).flatMap(st => [
      STEP_TYPES[st.type]?.label, st.sound, st.video, st.image, st.text,
      ...(st.keys || []).map(k => comboLabel(k)),
      st.type === 'win' ? (st.mode === 'decrease' ? 'bajar wins' : 'subir wins') : '',
    ]),
  ].join(' '));
  const query = searchKey(search.trim());
  const allActionEntries = Object.entries(actions || {});
  const filteredActions = allActionEntries.filter(([id, act]) => {
    if (fType !== 'all' && !getSteps(act).some(st => st.type === fType)) return false;
    if (fState === 'enabled' && !act.enabled) return false;
    if (fState === 'disabled' && act.enabled) return false;
    return !query || actionSearchText(id, act).includes(query);
  });
  const view = useListView(filteredActions, listKey(query, fType, fState));
  const filtersActive = !!query || fType !== 'all' || fState !== 'all';
  const clearFilters = () => { setSearch(''); setFType('all'); setFState('all'); };

  // ---- Lista ----
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

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title={<><Icon name="alert" size={18} /> Eliminar acción</>}
        message="¿Estás seguro de que deseas eliminar esta acción del arsenal? Cualquier evento de TikTok o Sticker vinculado a ella dejará de funcionar."
        onConfirm={confirmDeleteAction}
        onCancel={() => { setIsDeleteModalOpen(false); setActionToDelete(null); }}
      />

      {notification && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: notification.type === 'error' ? '#f44336' : '#4caf50',
          color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10001, display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'fadeInDown 0.3s ease-out'
        }}>
          <span><Icon name={notification.type === 'error' ? 'x' : 'check'} size={16} /></span>
          <span>{notification.text}</span>
        </div>
      )}

      {confirmDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card)', border: '2px solid #ff9800', borderRadius: '12px', width: '100%', maxWidth: '450px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--yellow)' }}><Icon name="alert" size={40} /></div>
            <h3 style={{ margin: 0, color: '#ff9800' }}>ADVERTENCIA DE DURACIÓN</h3>
            <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
              El audio <strong>"{confirmDialog.file.name}"</strong> dura <strong>{confirmDialog.duration.toFixed(1)} segundos</strong>.
              <br /><br />
              Si te envían muchos regalos seguidos, estos audios largos se solaparán y causarán un caos de ruido en tu directo.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDialog(null)}>Cancelar</button>
              <button className="btn" style={{ flex: 1, background: '#ff9800', color: 'white' }} onClick={() => uploadSound(confirmDialog.file, confirmDialog.target)}>Subir de todos modos</button>
            </div>
          </div>
        </div>
      )}

      <input type="file" accept="audio/*" ref={soundInputRef} style={{ display: 'none' }} onChange={handleSoundFile} />
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp" ref={imageInputRef} style={{ display: 'none' }} onChange={handleImageFile} />
      <input type="file" accept="video/mp4,video/webm,.mp4,.webm" ref={videoInputRef} style={{ display: 'none' }} onChange={handleVideoFile} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Arsenal de Acciones Disponibles</h3>
        <button className="btn" onClick={openNew}>+ Crear Nueva Acción</button>
      </div>

      <ModalShell
        isOpen={showForm}
        onClose={resetForm}
        title={editingActionId ? <><Icon name="edit" size={16} /> Editando acción</> : <><Icon name="sparkles" size={16} /> Nueva acción</>}
        width="640px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSaveAction}>
              {editingActionId ? 'Actualizar Acción' : 'Guardar Acción'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Nombre de la Acción</label>
            <input type="text" className="key-input" placeholder="Ej: Combo Sanación..." value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div className="step-section-head">
            <span>Qué hace</span>
            <small>Todos los pasos se disparan a la vez; usa "Empieza a los" para escalonarlos.</small>
          </div>

          {steps.length === 0 && (
            <div className="step-empty">Añade uno o varios pasos: por ejemplo un video con su sonido, o una tecla junto a un Win.</div>
          )}

          {steps.map(step => (
            <ActionStepEditor
              key={step.uid}
              step={step}
              onChange={patch => updateStep(step.uid, patch)}
              onRemove={() => removeStep(step.uid)}
              sounds={localSounds}
              videos={videoList}
              images={imageList}
              alertInfo={alertInfo}
              onUploadSound={() => pickSound(step.uid)}
              onUploadVideo={() => pickVideo(step.uid)}
              onUploadImage={() => pickImage(step.uid)}
              uploadingSound={uploadingSound}
              uploadingVideo={uploadingVideo}
              uploadingImage={uploadingImage}
              onOpenSoundsFolder={openSoundsFolder}
              hasMultiPress={presses > 1}
              everyKeyTaken={everyKeyOwner !== null && everyKeyOwner !== step.uid}
            />
          ))}

          <div className="step-add">
            {addableTypes.map(t => {
              const meta = STEP_TYPES[t];
              return (
                <button key={t} className="btn btn-secondary btn-sm" onClick={() => addStep(t)} disabled={meta.soon} title={meta.soon ? 'Próximamente' : `Añadir: ${meta.label}`}>
                  <Icon name="plus" size={13} /> {meta.label}{meta.soon ? ' (pronto)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      </ModalShell>

      {allActionEntries.length > 0 && (
        <ListToolbar
          search={search} onSearch={setSearch} placeholder="Buscar acción (nombre, tecla, archivo...)"
          active={filtersActive} onClear={clearFilters}
          filters={[
            { id: 'type', label: 'Contiene', value: fType, onChange: setFType, options: [{ value: 'all', label: 'Cualquier paso' }, ...Object.entries(STEP_TYPES).filter(([, m]) => !m.soon).map(([value, m]) => ({ value, label: m.label }))] },
            { id: 'state', label: 'Estado', value: fState, onChange: setFState, options: [{ value: 'all', label: 'Todas' }, { value: 'enabled', label: 'Activas' }, { value: 'disabled', label: 'Desactivadas' }] },
          ]}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {allActionEntries.length === 0 ? (
          <div className="log-empty">No has creado ninguna acción todavía. ¡Crea una arriba!</div>
        ) : view.total === 0 ? (
          <div className="log-empty">Ninguna acción coincide con la búsqueda o los filtros. <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Limpiar</button></div>
        ) : (
          view.pageItems.map(([id, act]) => (
            <div key={id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{act.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ID: {id}</div>
                <StepChips steps={getSteps(act)} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {countdowns[id] ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => cancelTest(id)}
                    title="Cancelar la prueba programada"
                    style={{ minWidth: '84px', borderColor: '#ff9800', color: '#ff9800' }}
                  >
                    <Icon name="x" size={13} /> {countdowns[id].left}s
                  </button>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => testAction(id, 0)} title="Probar ahora" aria-label="Probar ahora"><Icon name="play" size={14} /></button>
                    <button className="btn btn-secondary btn-sm" onClick={() => testAction(id, TEST_DELAY_MS)} title="Probar en 5 segundos, para darte tiempo de pasar al juego"><Icon name="clock" size={14} /> 5s</button>
                  </>
                )}
                <label className="switch" style={{ marginRight: '8px' }}>
                  <input type="checkbox" checked={act.enabled} onChange={() => handleToggleAction(id, act.enabled)} />
                  <span className="slider"></span>
                </label>
                <button className="btn btn-secondary btn-sm" onClick={() => handleEditAction(id, act)} title="Editar" aria-label="Editar"><Icon name="edit" size={14} /></button>
                <button className="btn btn-secondary btn-sm" style={{ background: '#ff4d4d', color: 'white', border: 'none' }} onClick={() => requestDeleteAction(id)} title="Eliminar" aria-label="Eliminar"><Icon name="trash" size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination view={view} noun={view.total === 1 ? 'acción' : 'acciones'} />

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
