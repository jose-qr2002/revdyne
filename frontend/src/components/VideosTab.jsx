import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import Select from './Select';
import ConfirmModal from './ConfirmModal';
import { apiFetch } from '../services/api';
import { showAlert } from '../services/dialog';
import { portQuery, currentAppPort } from './portUtils';
import { IMAGE_MIN_SECONDS, IMAGE_MAX_SECONDS, IMAGE_DEFAULT_SECONDS } from '../services/actionSteps';

const TARGET_KEY = 'overlayTarget';
const SCREENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PREVIEW = { w: 640, h: 360 };

// Bibliotecas: videos (/api/videos) e imágenes/GIF (/api/images). Los dos van a las mismas pantallas.
const LIBS = {
  video: { api: '/api/videos', field: 'video', accept: 'video/mp4,video/webm,.mp4,.webm', tab: 'Videos', one: 'video', icon: 'film', empty: 'Aún no hay videos. Sube un MP4 o WEBM (hasta 300 MB).', upload: 'Subir video' },
  image: { api: '/api/images', field: 'image', accept: 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp', tab: 'Imágenes y GIF', one: 'imagen', icon: 'image', empty: 'Aún no hay imágenes. Sube un PNG, JPG, GIF o WEBP (hasta 50 MB).', upload: 'Subir imagen o GIF' },
};

const readTarget = () => {
  try { return localStorage.getItem(TARGET_KEY) === 'obs' ? 'obs' : 'studio'; } catch { return 'studio'; }
};
const formatSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function VideosTab({ socket }) {
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [files, setFiles] = useState({ video: [], image: [] });
  const [libTab, setLibTab] = useState('video');
  const [screen, setScreen] = useState(1);
  const [target, setTarget] = useState(readTarget);
  const [copied, setCopied] = useState(false);
  const [testItem, setTestItem] = useState(''); // "video:archivo.mp4" | "image:archivo.gif"
  const [imageSeconds, setImageSeconds] = useState(IMAGE_DEFAULT_SECONDS);
  const [uploading, setUploading] = useState(null); // 'video' | 'image' | null
  const [toDelete, setToDelete] = useState(null); // { kind, name }
  const [scale, setScale] = useState(1);

  const fileRef = useRef(null);
  const previewRef = useRef(null);

  const loadFiles = async (kind) => {
    try {
      const res = await fetch(`${LIBS[kind].api}/list`);
      if (res.ok) { const list = await res.json(); setFiles(f => ({ ...f, [kind]: list })); }
    } catch { /* sin conexión con el servidor: la lista queda como estaba */ }
  };

  useEffect(() => {
    apiFetch('/api/overlays/video').then(res => {
      if (!res?.screens) return;
      setData({ screens: res.screens, options: res.options, publicBaseUrl: res.publicBaseUrl });
      setCounts(res.counts || {});
    });
    for (const kind of Object.keys(LIBS)) {
      fetch(`${LIBS[kind].api}/list`).then(r => (r.ok ? r.json() : [])).then(list => setFiles(f => ({ ...f, [kind]: list }))).catch(() => {});
    }
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

  // Elemento elegido para probar (si se borró, no queda seleccionado)
  const [testKind, testFile] = testItem.split(/:(.+)/);
  const selectedKind = LIBS[testKind] && files[testKind].some(f => f.name === testFile) ? testKind : '';
  const selectedFile = selectedKind ? testFile : '';
  const totalFiles = files.video.length + files.image.length;

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
    const kind = libTab;
    const lib = LIBS[kind];
    setUploading(kind);
    const form = new FormData();
    form.append(lib.field, file);
    try {
      const res = await fetch(`${lib.api}/upload`, { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) showAlert(json.error || `No se pudo subir la ${lib.one}.`, { title: `Subir ${lib.one}`, type: 'error' });
      else { await loadFiles(kind); setTestItem(`${kind}:${json.filename}`); }
    } catch {
      showAlert(`Error de red al subir la ${lib.one}.`, { title: `Subir ${lib.one}`, type: 'error' });
    }
    setUploading(null);
  };

  const test = async () => {
    const body = selectedKind === 'image'
      ? { kind: 'image', file: selectedFile, duration: Math.min(IMAGE_MAX_SECONDS, Math.max(IMAGE_MIN_SECONDS, parseFloat(imageSeconds) || IMAGE_DEFAULT_SECONDS)) }
      : { kind: 'video', file: selectedFile, volume: 100 };
    const res = await apiFetch(`/api/overlays/video/${screen}/test`, 'POST', body);
    if (res?.error) showAlert(res.error, { title: 'Probar en la pantalla', type: 'error' });
  };
  const stop = () => apiFetch(`/api/overlays/video/${screen}/stop`, 'POST');

  const remove = async () => {
    const { kind, name } = toDelete;
    setToDelete(null);
    await apiFetch(`${LIBS[kind].api}/${encodeURIComponent(name)}`, 'DELETE');
    loadFiles(kind);
  };

  const linked = (counts[screen] || 0) > 0;
  const lib = LIBS[libTab];
  const list = files[libTab];

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
            <span>Ajuste dentro del recuadro</span>
            <Select className="modifier-select" value={cfg.fit} onChange={e => saveScreen({ fit: e.target.value })}>
              <option value="contain">Entero dentro del recuadro</option>
              <option value="cover">Llenar el recuadro (recorta)</option>
            </Select>
          </label>
          <label className="vid-field">
            <span>Si llega otro contenido mientras hay uno</span>
            <Select className="modifier-select" value={cfg.onBusy} onChange={e => saveScreen({ onBusy: e.target.value })}>
              <option value="queue">Esperar su turno</option>
              <option value="replace">Cortar el actual</option>
            </Select>
          </label>

          <div className="win-keys">
            <div className="rk-list-head"><Icon name="play" size={14} /> Probar en esta pantalla</div>
            <Select className="modifier-select" value={selectedKind ? testItem : ''} onChange={e => setTestItem(e.target.value)} disabled={!totalFiles}>
              <option value="">{totalFiles ? 'Elige un video, imagen o GIF…' : 'Sube un video o una imagen primero'}</option>
              {files.video.map(f => <option key={`v${f.name}`} value={`video:${f.name}`}>Video · {f.name}</option>)}
              {files.image.map(f => <option key={`i${f.name}`} value={`image:${f.name}`}>Imagen · {f.name}</option>)}
            </Select>
            {selectedKind === 'image' && (
              <label className="vid-secs">
                Mostrar durante
                <input type="number" className="key-input" min={IMAGE_MIN_SECONDS} max={IMAGE_MAX_SECONDS} step="0.5" value={imageSeconds} onChange={e => setImageSeconds(e.target.value)} /> s
              </label>
            )}
            <div className="vid-actions">
              <button className="btn btn-sm btn-primary" onClick={test} disabled={!selectedFile}><Icon name="play" size={14} /> {selectedKind === 'image' ? 'Mostrar' : 'Reproducir'}</button>
              <button className="btn btn-sm btn-secondary" onClick={stop}><Icon name="stop" size={14} /> Detener</button>
            </div>
          </div>
        </div>
      </div>

      <div className="vid-lib">
        <div className="lk-kinds" role="tablist" aria-label="Biblioteca">
          {Object.entries(LIBS).map(([kind, l]) => (
            <button key={kind} className={libTab === kind ? 'active' : ''} onClick={() => setLibTab(kind)} role="tab" aria-selected={libTab === kind}>
              <Icon name={l.icon} size={14} /> {l.tab} ({files[kind].length})
            </button>
          ))}
        </div>
        <div className="vid-lib-head">
          <div className="rk-list-head"><Icon name={lib.icon} size={14} /> Biblioteca de {lib.tab.toLowerCase()} ({list.length})</div>
          <input type="file" accept={lib.accept} ref={fileRef} style={{ display: 'none' }} onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} />
          <button className="btn btn-sm btn-secondary" onClick={() => fileRef.current.click()} disabled={!!uploading}>
            {uploading === libTab ? <><Icon name="clock" size={14} /> Subiendo…</> : <><Icon name="plus" size={14} /> {lib.upload}</>}
          </button>
        </div>
        {list.length === 0 ? (
          <div className="log-empty">{lib.empty}</div>
        ) : (
          <ul className="vid-list">
            {list.map(f => (
              <li key={f.name}>
                {libTab === 'image' && <span className="vid-thumb"><img src={`/images/${encodeURIComponent(f.name)}`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /></span>}
                <span className="vid-name ellipsis" title={f.name}>{f.name}</span>
                <span className="vid-size">{formatSize(f.size)}</span>
                <button className="icon-btn danger" aria-label={`Eliminar ${f.name}`} title="Eliminar" onClick={() => setToDelete({ kind: libTab, name: f.name })}><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="lk-hint">
        Cada pantalla es un enlace distinto: añade el de la pantalla que quieras como fuente y, en <strong>Acciones</strong>, crea una acción con un paso de
        Video o de Imagen / GIF eligiendo esa pantalla (así puedes poner varios contenidos en distintos lugares de tu directo; videos e imágenes de una misma
        pantalla comparten su cola). Todo se guarda en la carpeta de datos de Revdyne (AppData), no en Documentos. Videos: MP4 (H.264) o WEBM. Imágenes: PNG, JPG, GIF o WEBP.{' '}
        {target === 'studio'
          ? <>En Live Studio añade una fuente <strong>Enlace</strong> con esa URL y el tamaño que quieras para la pantalla.</>
          : <>En OBS añade una fuente <strong>Navegador</strong> con esa URL y activa "Controlar audio mediante OBS".</>}
        {' '}Está invisible hasta que aparezca algo.
      </p>

      <ConfirmModal
        isOpen={!!toDelete}
        title={<><Icon name="trash" size={18} /> Eliminar {toDelete ? LIBS[toDelete.kind].one : ''}</>}
        message={`Se borrará "${toDelete?.name}" de la biblioteca. Las acciones que lo usen dejarán de mostrar nada.`}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
