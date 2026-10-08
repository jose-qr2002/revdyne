import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import ConfirmModal from './ConfirmModal';
import { apiFetch } from '../services/api';

export default function EngineManagerTab() {
  const [engines, setEngines] = useState([]);
  const [loadingKey, setLoadingKey] = useState(null);
  const [voicesByEngine, setVoicesByEngine] = useState({});
  const [expandedEngine, setExpandedEngine] = useState(null);
  const [voiceUrlInputs, setVoiceUrlInputs] = useState({});
  const [notification, setNotification] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [voiceCatalog, setVoiceCatalog] = useState({});

  const showToast = (type, text) => setNotification({ type, text });

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  const fetchEngines = () => apiFetch('/api/tts/engines').then(d => setEngines(Array.isArray(d) ? d : []));
  const fetchVoices = (engineId) =>
    apiFetch(`/api/tts/engines/${engineId}/voices`).then(v =>
      setVoicesByEngine(prev => ({ ...prev, [engineId]: Array.isArray(v) ? v : [] }))
    );
  useEffect(() => { fetchEngines(); }, []);

  const fetchVoiceCatalog = (engineId) =>
  apiFetch(`/api/tts/engines/${engineId}/voices/catalog`).then(list =>
    setVoiceCatalog(prev => ({ ...prev, [engineId]: Array.isArray(list) ? list : [] }))
  );

  const handleInstallEngine = async (engineId) => {
    setLoadingKey(engineId);
    try {
      const res = await fetch(`/api/tts/engines/${engineId}/install`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      showToast('success', 'Motor instalado correctamente');
      fetchEngines();
    } catch (e) {
      showToast('error', `Error al instalar: ${e.message}`);
    }
    setLoadingKey(null);
  };

  const confirmUninstall = async () => {
    if (!confirmTarget) return;
    const { type, engineId, voiceId } = confirmTarget;
    setLoadingKey(engineId);
    try {
      if (type === 'engine') {
        await fetch(`/api/tts/engines/${engineId}`, { method: 'DELETE' });
        showToast('success', 'Motor desinstalado');
        fetchEngines();
      } else {
        await fetch(`/api/tts/engines/${engineId}/voices/${voiceId}`, { method: 'DELETE' });
        showToast('success', 'Voz eliminada');
        fetchVoices(engineId);
      }
    } catch {
      showToast('error', 'Error al desinstalar');
    }
    setLoadingKey(null);
    setConfirmTarget(null);
  };

  const toggleExpanded = (engineId) => {
    if (expandedEngine === engineId) return setExpandedEngine(null);
    setExpandedEngine(engineId);
    fetchVoices(engineId);
    fetchVoiceCatalog(engineId);
  };
  

  const handleInstallVoice = async (engineId, onnxUrl, voiceLabel) => {
    setLoadingKey(`${engineId}-${onnxUrl}`);
    try {
      const res = await fetch(`/api/tts/engines/${engineId}/voices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onnxUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      showToast('success', `"${voiceLabel}" instalada`);
      fetchVoices(engineId);
      fetchVoiceCatalog(engineId);
    } catch (e) {
      showToast('error', `Error al instalar voz: ${e.message}`);
    }
    setLoadingKey(null);
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
      <ConfirmModal
        isOpen={!!confirmTarget}
        title={<><Icon name="alert" size={18} /> {confirmTarget?.type === 'engine' ? 'Desinstalar motor' : 'Eliminar voz'}</>}
        message={confirmTarget?.type === 'engine'
          ? 'Se borrarán todos sus archivos y voces instaladas. ¿Continuar?'
          : 'Esta voz dejará de estar disponible en el selector de TTS. ¿Continuar?'}
        onConfirm={confirmUninstall}
        onCancel={() => setConfirmTarget(null)}
      />

      {notification && (
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: notification.type === 'error' ? '#f44336' : '#4caf50', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', zIndex: 1000 }}>
          {notification.text}
        </div>
      )}

      <div>
        <h3 style={{ margin: 0 }}><Icon name="mic" size={20} /> Voces y motores</h3>
        <p style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>
          Motores de voz que corren localmente en tu PC, sin depender de servicios externos.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {engines.map(engine => (
          <div key={engine.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{engine.label}</span>
                  {engine.requiresGPU ? (
                    <span style={{ background: 'rgba(255,152,0,0.15)', color: '#ff9800', fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>Requiere GPU</span>
                  ) : (
                    <span style={{ background: 'rgba(76,175,80,0.15)', color: '#4caf50', fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>Solo CPU</span>
                  )}
                  {engine.installed && (
                    <span style={{ background: 'rgba(0,188,212,0.15)', color: '#00bcd4', fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>Instalado</span>
                  )}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text2)', margin: '6px 0' }}>{engine.description}</p>
                <span style={{ fontSize: '11px', color: 'var(--text2)' }}>~{engine.sizeMB} MB</span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {!engine.supportedOnThisPlatform ? (
                  <span style={{ fontSize: '12px', color: '#ff4d4d' }}>No disponible en tu sistema</span>
                ) : engine.installed ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleExpanded(engine.id)}>
                      {expandedEngine === engine.id ? 'Ocultar voces' : 'Ver voces'}
                    </button>
                    <button className="btn btn-secondary btn-sm" style={{ background: '#ff4d4d', color: 'white', border: 'none' }} onClick={() => setConfirmTarget({ type: 'engine', engineId: engine.id })}>
                      <Icon name="trash" size={14} /> Desinstalar
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => handleInstallEngine(engine.id)} disabled={loadingKey === engine.id}>
                    {loadingKey === engine.id ? <><Icon name="clock" size={14} /> Instalando...</> : <><Icon name="download" size={14} /> Instalar</>}
                  </button>
                )}
              </div>
            </div>

            {expandedEngine === engine.id && engine.installed && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text2)' }}>Voces instaladas</label>

                {(voicesByEngine[engine.id] || []).length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Ninguna voz instalada todavía.</div>
                ) : (
                  (voicesByEngine[engine.id] || []).map(voiceId => (
                    <div key={voiceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{voiceId}</span>
                      <button className="btn btn-secondary btn-sm" style={{ background: '#ff4d4d', color: 'white', border: 'none' }} onClick={() => setConfirmTarget({ type: 'voice', engineId: engine.id, voiceId })}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  ))
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '10px' }}>Voces disponibles para instalar</label>
                  {(voiceCatalog[engine.id] || []).map(voice => (
                    <div key={voice.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: '6px' }}>
                      <div>
                        <div style={{ fontSize: '13px' }}>{voice.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text2)' }}>~{voice.sizeMB} MB</div>
                      </div>
                      {voice.installed ? (
                        <span style={{ fontSize: '12px', color: '#4caf50' }}>✓ Instalada</span>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleInstallVoice(engine.id, voice.onnxUrl, voice.label)}
                          disabled={loadingKey === `${engine.id}-${voice.onnxUrl}`}
                        >
                          {loadingKey === `${engine.id}-${voice.onnxUrl}` ? <Icon name="clock" size={14} /> : <><Icon name="download" size={14} /> Instalar</>}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text2)', margin: 0 }}>
                  Copia el enlace directo al archivo <code>.onnx</code> — el <code>.onnx.json</code> se descarga solo.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}