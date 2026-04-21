import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { enqueueTTS } from '../services/ttsPlayer';

export default function TTSControl({ config, onUpdateConfig, ttsEvents }) {
  const tts = config.tts || {};
  const [browserVoices, setBrowserVoices] = useState([]);
  const [elevenVoices, setElevenVoices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);

  const updateTTS = (updates) => {
    onUpdateConfig({ tts: { ...tts, ...updates } });
  };

  // Cargar dispositivos y voces del sistema al iniciar
  useEffect(() => {
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter(d => d.kind === 'audiooutput'));
      } catch (e) { console.warn("No se pudieron cargar dispositivos de audio"); }
    };

    const loadBrowserV = () => setBrowserVoices(window.speechSynthesis.getVoices());

    loadDevices();
    loadBrowserV();
    window.speechSynthesis.onvoiceschanged = loadBrowserV;
  }, []);

  // Cargar voces de ElevenLabs
  const fetchElevenVoices = async () => {
    if (!tts.elevenLabsKey) return alert('Ingresa tu API Key de ElevenLabs primero');
    const voices = await apiFetch(`/api/tts/elevenlabs/voices?key=${tts.elevenLabsKey}`);
    if (voices.error) alert('Error: ' + voices.error);
    else setElevenVoices(voices);
  };

  const testAudio = () => enqueueTTS('Prueba de sonido. Bot activado.');

  return (
    <div className="tts-layout">
      {/* IZQUIERDA: Ajustes */}
      <div className="tts-settings">
        <div className="tts-section-title">⚙️ Configuración General</div>

        <div className="tts-row">
          <label>Activar bot TTS</label>
          <label className="switch">
            <input type="checkbox" checked={tts.enabled || false} onChange={e => updateTTS({ enabled: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>

        <div className="tts-row">
          <label>Solo fans del club ❤️</label>
          <label className="switch">
            <input type="checkbox" checked={tts.onlyFanClub ?? true} onChange={e => updateTTS({ onlyFanClub: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>

        <div className="tts-section-title" style={{ marginTop: '16px' }}>🎙️ Motor de voz</div>
        
        <div className="tts-row">
          <label>Motor</label>
          <select className="modifier-select" style={{ flex: 1 }} value={tts.engine || 'browser'} onChange={e => updateTTS({ engine: e.target.value })}>
            <option value="browser">Voces del sistema (offline)</option>
            <option value="elevenlabs">ElevenLabs (IA Premium)</option>
            <option value="tiktok">TikTok (Voces virales)</option> {/* NUEVA OPCIÓN */}
          </select>
        </div>

        <div className="tts-row">
          <label>Dispositivo de salida 🔊</label>
          <select className="modifier-select" style={{ flex: 1 }} value={tts.audioDeviceId || ''} onChange={e => updateTTS({ audioDeviceId: e.target.value })}>
            <option value="">Por defecto (Principal)</option>
            {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
          </select>
        </div>

        {/* DEPENDIENDO DEL MOTOR ELEGIDO, MOSTRAMOS UN MENÚ U OTRO */}
        {tts.engine === 'elevenlabs' ? (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row">
              <label>API Key</label>
              <input type="password" className="key-input" placeholder="sk-..." value={tts.elevenLabsKey || ''} onChange={e => updateTTS({ elevenLabsKey: e.target.value })} />
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', margin: '8px 0', fontSize: '12px' }} onClick={fetchElevenVoices}>🔄 Cargar voces ElevenLabs</button>
            <div className="tts-row">
              <label>Voz</label>
              <select className="modifier-select" style={{ flex: 1 }} value={tts.elevenLabsVoiceId || ''} onChange={e => updateTTS({ elevenLabsVoiceId: e.target.value })}>
                <option value="">{elevenVoices.length ? 'Selecciona una voz' : '— carga primero las voces —'}</option>
                {elevenVoices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
              </select>
            </div>
          </div>
        ) : tts.engine === 'tiktok' ? (
          /* NUEVO BLOQUE: CONFIGURACIÓN PARA TIKTOK */
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row">
              <label>Voz Viral</label>
              <select className="modifier-select" style={{ flex: 1 }} value={tts.tiktokVoice || 'es_mx_002'} onChange={e => updateTTS({ tiktokVoice: e.target.value })}>
                <option value="es_mx_002">🇲🇽 Hombre (Loquendo)</option>
                <option value="es_female_f6">🇲🇽 Mujer (Graciosa)</option>
                <option value="es_female_fp1">🇪🇸 Mujer (España)</option>
                <option value="es_male_m3">🇪🇸 Hombre (España)</option>
                <option value="en_us_ghostface">👻 Ghostface (Scream)</option>
                <option value="en_us_chewbacca">🐻 Chewbacca</option>
                <option value="en_us_stitch">👽 Stitch</option>
                <option value="en_us_001">🇺🇸 Mujer (Siri Inglés)</option>
              </select>
            </div>
          </div>
        ) : (
          /* BLOQUE ORIGINAL DE BROWSER */
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row">
              <label>Voz del sistema</label>
              <select className="modifier-select" style={{ flex: 1 }} value={tts.browserVoiceName || ''} onChange={e => updateTTS({ browserVoiceName: e.target.value })}>
                {browserVoices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
          </div>
        )}

        <button className="btn btn-test" style={{ marginTop: '12px', width: '100%' }} onClick={testAudio}>▶ Probar Audio</button>
      </div>

      {/* DERECHA: Log en vivo */}
      <div className="tts-log-panel">
        <div className="tts-section-title">💬 Comentarios leídos</div>
        <div className="tts-log">
          {ttsEvents.length === 0 ? (
            <div className="log-empty">Los comentarios aparecerán aquí cuando el bot esté activo.</div>
          ) : (
            ttsEvents.map((ev, i) => (
              <div key={i} className={`tts-entry ${ev.isMod ? 'mod' : ev.isFanClub ? 'fan' : ''}`}>
                <div className="tts-user">
                  @{ev.username}
                  {ev.isFanClub && <span className="tts-badge fan">❤️ Fan</span>}
                  {ev.isMod && <span className="tts-badge mod">🛡️ Mod</span>}
                </div>
                <div className="tts-comment">{ev.comment}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}