import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import Select from './Select';
import ConfirmModal from './ConfirmModal';
import { apiFetch } from '../services/api';
import { showAlert } from '../services/dialog';
import { portQuery, currentAppPort } from './portUtils';

const TARGET_KEY = 'overlayTarget';
const SCREENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PREVIEW = { w: 640, h: 360 };

const readTarget = () => {
  try { return localStorage.getItem(TARGET_KEY) === 'obs' ? 'obs' : 'studio'; } catch { return 'studio'; }
};
const formatSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function VideosTab({ socket }) {
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [videos, setVideos] = useState([]);
  const [screen, setScreen] = useState(1);
  const [target, setTarget] = useState(readTarget);
  const [copied, setCopied] = useState(false);
  const [testVideo, setTestVideo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [scale, setScale] = useState(1);

  const fileRef = useRef(null);
  const previewRef = useRef(null);

  const loadVideos = async () => {
    try {
      const res = await fetch('/api/videos/list');
      if (res.ok) setVideos(await res.json());
    } catch { /* sin conexión con el servidor: la lista queda como estaba */ }
  };

  useEffect(() => {
    apiFetch('/api/overlays/video').then(res => {
      if (!res?.screens) return;
      setData({ screens: res.screens, options: res.options, publicBaseUrl: res.publicBaseUrl });
      setCounts(res.counts || {});
    });
    fetch('/api/videos/list').then(r => (r.ok ? r.json() : [])).then(setVideos).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onClients = (c) => setCounts(c || {});
    socket.on('overlay:video:clients', onClients);
    return () => socket.off('overlay:video:clients', onClients);
  }, [socket]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / PREVIEW.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const selectedVideo = videos.some(v => v.name === testVideo) ? testVideo : ''; // si se borró el elegido, no queda seleccionado

  if (!data) return <div className="empty-state"><p>Cargando pantallas…</p></div>;

  const cfg = data.screens[screen];
  const saveScreen = (patch) => {
    setData(d => ({ ...d, screens: { ...d.screens, [screen]: { ...d.screens[screen], ...patch } } }));
    apiFetch(`/api/overlays/video/${screen}`, 'POST', patch);
  };

  const chooseTarget = (t) => {
    setTarget(t);
    try { localStorage.setItem(TARGET_KEY, t); } catch { /* sin almacenamiento: solo no se recuerda */ }
  };
  // TikTok LIVE Studio rechaza 'localhost'; la IP apunta al mismo servidor. En desarrollo (Vite) se deja el origen.
  const host = import.meta.env.DEV ? window.location.origin : window.location.origin.replace('//localhost', '//127.0.0.1');
  const obsUrl = `${host}/overlays/screen/${screen}`;
  const studioUrl = `${data.publicBaseUrl}/screen/${screen}${portQuery(currentAppPort())}`;
  const overlayUrl = target === 'studio' ? studioUrl : obsUrl;
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin permiso de portapapeles: el campo es seleccionable a mano */ }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('video', file);
    try {
      const res = await fetch('/api/videos/upload', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) showAlert(json.error || 'No se pudo subir el video.', { title: 'Subir video', type: 'error' });
      else { await loadVideos(); setTestVideo(json.filename); }
    } catch {
      showAlert('Error de red al subir el video.', { title: 'Subir video', type: 'error' });
    }
    setUploading(false);
  };

  const test = async () => {
    const res = await apiFetch(`/api/overlays/video/${screen}/test`, 'POST', { file: selectedVideo, volume: 100 });
    if (res?.error) showAlert(res.error, { title: 'Probar video', type: 'error' });
  };
  const stop = () => apiFetch(`/api/overlays/video/${screen}/stop`, 'POST');

  const remove = async () => {
    const name = toDelete;
    setToDelete(null);
    await apiFetch(`/api/videos/${encodeURIComponent(name)}`, 'DELETE');
    loadVideos();
  };

  const linked = (counts[screen] || 0) > 0;

  return (
    <section className="lk vid-card">
      <header className="lk-head">
        <h3><Icon name="film" size={18} /> Pantallas</h3>
        <span className={`lk-chip ${linked ? 'on' : ''}`} title="Estado del Browser Source de esta pantalla en OBS / Live Studio">
          <i /> Pantalla {screen} {linked ? 'enlazada' : 'sin enlazar'}
        </span>
      </header>

      <div className="lk-kinds" role="tablist" aria-label="Pantalla">
        {SCREENS.map(n => (
          <button key={n} className={`${screen === n ? 'active' : ''} ${(counts[n] || 0) > 0 ? 'vid-linked' : ''}`} onClick={() => setScreen(n)} role="tab" aria-selected={screen === n}>
            {n}
          </button>
        ))}
      </div>

      <div className="lk-target" role="tablist" aria-label="Destino">
        <button className={target === 'studio' ? 'active' : ''} onClick={() => chooseTarget('studio')}>TikTok LIVE Studio</button>
        <button className={target === 'obs' ? 'active' : ''} onClick={() => chooseTarget('obs')}>OBS</button>
      </div>

      <div className="lk-bar">
        <div className="lk-url">
          <input readOnly value={overlayUrl} onFocus={e => e.target.select()} aria-label="URL de la pantalla" />
          <button className={`lk-icon ${copied ? 'done' : ''}`} onClick={copyUrl} title={copied ? 'Copiado' : 'Copiar URL'} aria-label="Copiar URL">
            <Icon name={copied ? 'check' : 'copy'} size={16} />
          </button>
        </div>
      </div>

      <div className="rk-grid">
        <div className="lk-stage" ref={previewRef} style={{ height: PREVIEW.h * scale }}>
          <iframe
            key={screen}
            title="Vista previa de la pantalla"
            src={`/overlays/screen/${screen}?preview=1`}
            width={PREVIEW.w} height={PREVIEW.h}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
          <span className="lk-size">Pantalla {screen}</span>
        </div>

        <div className="win-panel">
          <label className="vid-field">
            <span>Ajuste del video</span>
            <Select className="modifier-select" value={cfg.fit} onChange={e => saveScreen({ fit: e.target.value })}>
              <option value="contain">Entero dentro del recuadro</option>
              <option value="cover">Llenar el recuadro (recorta)</option>
            </Select>
          </label>
          <label className="vid-field">
            <span>Si llega otro video mientras suena uno</span>
            <Select className="modifier-select" value={cfg.onBusy} onChange={e => saveScreen({ onBusy: e.target.value })}>
              <option value="queue">Esperar su turno</option>
              <option value="replace">Cortar el actual</option>
            </Select>
          </label>

          <div className="win-keys">
            <div className="rk-list-head"><Icon name="play" size={14} /> Probar en esta pantalla</div>
            <Select className="modifier-select" value={selectedVideo} onChange={e => setTestVideo(e.target.value)} disabled={!videos.length}>
              <option value="">{videos.length ? 'Elige un video…' : 'Sube un video primero'}</option>
              {videos.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </Select>
            <div className="vid-actions">
              <button className="btn btn-sm btn-primary" onClick={test} disabled={!selectedVideo}><Icon name="play" size={14} /> Reproducir</button>
              <button className="btn btn-sm btn-secondary" onClick={stop}><Icon name="stop" size={14} /> Detener</button>
            </div>
          </div>
        </div>
      </div>

      <div className="vid-lib">
        <div className="vid-lib-head">
          <div className="rk-list-head"><Icon name="film" size={14} /> Biblioteca de videos ({videos.length})</div>
          <input type="file" accept="video/mp4,video/webm,.mp4,.webm" ref={fileRef} style={{ display: 'none' }} onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} />
          <button className="btn btn-sm btn-secondary" onClick={() => fileRef.current.click()} disabled={uploading}>
            {uploading ? <><Icon name="clock" size={14} /> Subiendo…</> : <><Icon name="plus" size={14} /> Subir video</>}
          </button>
        </div>
        {videos.length === 0 ? (
          <div className="log-empty">Aún no hay videos. Sube un MP4 o WEBM (hasta 300 MB).</div>
        ) : (
          <ul className="vid-list">
            {videos.map(v => (
              <li key={v.name}>
                <span className="vid-name ellipsis" title={v.name}>{v.name}</span>
                <span className="vid-size">{formatSize(v.size)}</span>
                <button className="icon-btn danger" aria-label={`Eliminar ${v.name}`} title="Eliminar" onClick={() => setToDelete(v.name)}><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="lk-hint">
        Cada pantalla es un enlace distinto: añade el de la pantalla que quieras como fuente y, en <strong>Acciones</strong>, crea una acción de tipo
        Video eligiendo esa pantalla (así puedes poner varios videos en distintos lugares de tu directo). Los videos se guardan en la carpeta de datos de
        Revdyne (AppData), no en Documentos. Formatos: MP4 (H.264) o WEBM.{' '}
        {target === 'studio'
          ? <>En Live Studio añade una fuente <strong>Enlace</strong> con esa URL y el tamaño que quieras para la pantalla.</>
          : <>En OBS añade una fuente <strong>Navegador</strong> con esa URL y activa "Controlar audio mediante OBS".</>}
        {' '}Está invisible hasta que suene un video.
      </p>

      <ConfirmModal
        isOpen={!!toDelete}
        title={<><Icon name="trash" size={18} /> Eliminar video</>}
        message={`Se borrará "${toDelete}" de la biblioteca. Las acciones que lo usen dejarán de reproducir nada.`}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
