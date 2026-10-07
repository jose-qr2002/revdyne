import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api';

const REFRESH_MS = 10000;
const LINES = 150;

const levelOf = (line) => (line.includes('[ERROR]') ? 'error' : line.includes('[WARN]') ? 'warn' : line.includes('[DEBUG]') ? 'debug' : 'info');

export default function ErrorLogPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [copied, setCopied] = useState(false);
  const [openMsg, setOpenMsg] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/api/logs?n=${LINES}${onlyProblems ? '&solo=problemas' : ''}`).then(res => {
      if (res?.lines) { setData(res); setUnavailable(false); } else setUnavailable(true); // un servidor anterior a esta función no responde JSON
    });
  }, [onlyProblems]);

  // Con el panel cerrado se consulta una vez (para mostrar las insignias) y se refresca solo mientras está abierto
  useEffect(() => {
    load();
    if (!open) return;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const toggleDebug = async (enabled) => {
    await apiFetch('/api/logs/debug', 'POST', { enabled });
    load();
  };

  const openFolder = async () => {
    setOpenMsg('Abriendo…');
    const res = await apiFetch('/api/logs/open', 'POST');
    if (res?.ok) setOpenMsg('Listo. Si no ves la ventana del Explorador, búscala en la barra de tareas (puede abrirse detrás de la app).');
    else if (res?.dir) setOpenMsg(`No se pudo abrir automáticamente (${res.error || 'sin detalle'}). Copia la ruta de abajo y pégala en el Explorador.`);
    else setOpenMsg('El servidor no respondió a esta función. Reinicia la app para cargar la versión nueva.');
  };

  const copyPath = async () => {
    try { await navigator.clipboard.writeText(data?.file || ''); setOpenMsg('Ruta copiada. Pégala en la barra de direcciones del Explorador.'); } catch { /* sin permiso de portapapeles */ }
  };

  const copyLines = async () => {
    try {
      await navigator.clipboard.writeText((data?.lines || []).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin permiso de portapapeles: se puede abrir la carpeta y enviar el archivo */ }
  };

  const lines = data?.lines || [];
  const errors = lines.filter(l => levelOf(l) === 'error').length;
  const warns = lines.filter(l => levelOf(l) === 'warn').length;

  return (
    <section className="elp">
      <button className="elp-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>🛠️ Registro de errores y avisos</span>
        {data && (errors > 0 || warns > 0) && (
          <span className="elp-badges">
            {errors > 0 && <b className="elp-b error">{errors} {errors === 1 ? 'error' : 'errores'}</b>}
            {warns > 0 && <b className="elp-b warn">{warns} {warns === 1 ? 'aviso' : 'avisos'}</b>}
          </span>
        )}
        <span className="elp-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="elp-body">
          <div className="elp-bar">
            <label className="elp-check">
              <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
              Solo avisos y errores
            </label>
            <label className="elp-check" title="Guarda además cada regalo recibido. Actívalo mientras pruebas y desactívalo después.">
              <input type="checkbox" checked={!!data?.debug} onChange={e => toggleDebug(e.target.checked)} />
              Registro detallado (cada regalo)
            </label>
            <span className="elp-spacer" />
            <button className="btn btn-sm btn-secondary" onClick={load}>Actualizar</button>
            <button className="btn btn-sm btn-secondary" onClick={copyLines} disabled={!lines.length}>{copied ? '✔ Copiado' : 'Copiar'}</button>
            <button className="btn btn-sm btn-secondary" onClick={openFolder}>Abrir carpeta</button>
          </div>

          {unavailable && <div className="elp-warn">No se pudo leer el registro: el servidor no tiene esta función todavía. Reinicia la app.</div>}
          {openMsg && <div className="elp-note">{openMsg}</div>}

          <div className="elp-lines" role="log">
            {lines.length === 0
              ? <div className="elp-empty">{onlyProblems ? 'Sin avisos ni errores. 👍' : 'El registro está vacío.'}</div>
              : [...lines].reverse().map((line, i) => <div key={i} className={`elp-line ${levelOf(line)}`}>{line}</div>)}
          </div>
          {data?.file && (
            <div className="elp-path">
              <span title={data.file}>Archivo: <code>{data.file}</code></span>
              <button className="btn btn-sm btn-secondary" onClick={copyPath}>Copiar ruta</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
