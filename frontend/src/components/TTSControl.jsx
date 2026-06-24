import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { enqueueTTS } from '../services/ttsPlayer';

export default function TTSControl({ config, onUpdateConfig, ttsEvents }) {
  const tts = config.tts || {};
  const [browserVoices, setBrowserVoices] = useState([]);
  const [elevenVoices, setElevenVoices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);

  // 🎮 NUEVO: Estado para saber qué botón está "escuchando" tu teclado
  const [listeningFor, setListeningFor] = useState(null);

  const updateTTS = (updates) => {
    onUpdateConfig({ tts: { ...tts, ...updates } });
  };

  useEffect(() => {
    const handleToggle = () => {
      console.log("🚨 [REACT] ¡Señal de apagar/encender recibida desde Electron!");
      console.log("🚨 [REACT] El estado actual de tts.enabled es:", tts.enabled);

      // Invertimos el estado actual
      updateTTS({ enabled: !tts.enabled });

      console.log("🚨 [REACT] Orden de cambio enviada a la configuración.");
    };
    window.addEventListener('tts-action-toggle-bot', handleToggle);
    return () => window.removeEventListener('tts-action-toggle-bot', handleToggle);
  }, [tts.enabled]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Si no hay ningún botón esperando, ignoramos
      if (!listeningFor) return;

      e.preventDefault(); // Evita que Windows haga cosas raras (como F5 para recargar)
      let key = e.key;

      // Formateo para que Electron lo entienda perfecto
      if (key === ' ') key = 'Space';
      if (key.length === 1) key = key.toUpperCase(); // Convierte 'a' en 'A'

      // Guardamos la tecla en la configuración que estabas escuchando
      updateTTS({ [listeningFor]: key });
      
      // Apagamos el modo escucha
      setListeningFor(null); 
    };

    if (listeningFor) {
      window.addEventListener('keydown', handleGlobalKeyDown);
    }
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [listeningFor, tts]);

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

        {/* 👇 NUEVO FILTRO DE LECTURA 👇 */}
        <div className="tts-row">
          <label>¿A quién leemos? 🕵️</label>
          <select 
            className="modifier-select" 
            style={{ flex: 1, marginLeft: '10px' }} 
            value={tts.filterMode || 'all'} 
            onChange={e => updateTTS({ filterMode: e.target.value, onlyFanClub: false })}
          >
            <option value="all">🌎 A Todos</option>
            <option value="followers">❤️ Solo Seguidores y Fans</option>
            <option value="fans">⭐ Solo Club de Fans</option>
          </select>
          
        </div>
        {/* 👆 FIN DEL NUEVO FILTRO 👆 */}

        {/* 👇 NUEVO BOTÓN DE PÁNICO 👇 */}
        <div className="tts-section-title" style={{ marginTop: '16px' }}>⌨️ Atajos de Teclado (Globales)</div>
      
        <div className="tts-row">
          <label>⏭️ Omitir actual</label>
          <button 
            className="btn"
            style={{ flex: 1, marginLeft: '10px', background: listeningFor === 'keySkipCurrent' ? '#ff9800' : 'var(--bg3)' }}
            onClick={() => setListeningFor('keySkipCurrent')}
          >
            {listeningFor === 'keySkipCurrent' ? '⏳ Presiona una tecla...' : (tts.keySkipCurrent || 'F9')}
          </button>
        </div>

        <div className="tts-row">
          <label>🧹 Limpiar cola</label>
          <button 
            className="btn"
            style={{ flex: 1, marginLeft: '10px', background: listeningFor === 'keySkipAll' ? '#ff9800' : 'var(--bg3)' }}
            onClick={() => setListeningFor('keySkipAll')}
          >
            {listeningFor === 'keySkipAll' ? '⏳ Presiona una tecla...' : (tts.keySkipAll || 'F10')}
          </button>
        </div>

        <div className="tts-row">
          <label>🛑 Apagar Bot</label>
          <button 
            className="btn"
            style={{ flex: 1, marginLeft: '10px', background: listeningFor === 'keyToggleBot' ? '#ff9800' : 'var(--bg3)' }}
            onClick={() => setListeningFor('keyToggleBot')}
          >
            {listeningFor === 'keyToggleBot' ? '⏳ Presiona una tecla...' : (tts.keyToggleBot || 'F11')}
          </button>
        </div>
        {/* 👆 FIN DEL BOTÓN DE PÁNICO 👆 */}

        <div className="tts-section-title" style={{ marginTop: '16px' }}>🎙️ Motor de voz</div>
        
        <div className="tts-row">
          <label>Motor</label>
          <select className="modifier-select" style={{ flex: 1 }} value={tts.engine || 'browser'} onChange={e => updateTTS({ engine: e.target.value })}>
            <option value="browser">Voces del sistema (offline)</option>
            <option value="elevenlabs">ElevenLabs (IA Premium)</option>
            <option value="tiktok">TikTok (Voces virales)</option>
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