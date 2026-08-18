import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { enqueueTTS, setPlaybackRate } from '../services/ttsPlayer';

export default function TTSControl({ config, onUpdateConfig, ttsEvents }) {
  const tts = config.tts || {};
  const [browserVoices, setBrowserVoices] = useState([]);
  const [elevenVoices, setElevenVoices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [listeningFor, setListeningFor] = useState(null);

  // Estado local para la velocidad visual
  const [speed, setSpeed] = useState(tts.speed || 1.0);

  const updateTTS = (updates) => {
    onUpdateConfig({ tts: { ...tts, ...updates } });
  };

  // Sincronizar la velocidad con el reproductor nativo
  useEffect(() => {
    if (tts.speed) {
      setPlaybackRate(tts.speed);
    }
  }, [tts.speed]);

  useEffect(() => {
    const handleToggle = () => {
      updateTTS({ enabled: !tts.enabled });
    };
    window.addEventListener('tts-action-toggle-bot', handleToggle);
    return () => window.removeEventListener('tts-action-toggle-bot', handleToggle);
  }, [tts]); 

  // 🛡️ BLINDAJE MEJORADO: Soporte para combinaciones seguras (Ctrl+Tecla, Shift+Tecla)
  const getElectronKey = (e) => {
    const code = e.code;
    const key = e.key;

    // 1. Ignorar si el usuario solo presionó el modificador (esperamos a que presione la tecla final)
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return null;

    // 2. Construir la cadena de modificadores
    const modifiers = [];
    if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl'); // MetaKey es 'Cmd' en Mac
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');

    // 3. Obtener la tecla principal presionada
    let mainKey = null;

    if (code.startsWith('Numpad')) {
      const num = code.replace('Numpad', '');
      if (!isNaN(num)) {
        mainKey = `num${num}`; 
      } else {
        const numMap = { 'Add': 'numadd', 'Subtract': 'numsub', 'Multiply': 'nummult', 'Divide': 'numdiv', 'Decimal': 'numdec', 'Enter': 'Enter' };
        mainKey = numMap[num] || key;
      }
    } else {
      const specialMap = {
        ' ': 'Space', 'Tab': 'Tab', 'CapsLock': 'Capslock', 
        'PageUp': 'PageUp', 'PageDown': 'PageDown', 
        'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
        'Escape': 'Esc', 'Enter': 'Enter', 'Backspace': 'Backspace', 
        'Delete': 'Delete', 'Insert': 'Insert', 'Home': 'Home', 'End': 'End',
        '+': 'Plus', '-': 'Minus'
      };

      if (specialMap[key]) {
        mainKey = specialMap[key];
      } else if (/^[a-zA-Z0-9]$/.test(key)) {
        mainKey = key.toUpperCase();
      } else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
        mainKey = key;
      }
    }

    // 4. Si la tecla principal no es válida, abortamos
    if (!mainKey) return null;

    // 5. Unir los modificadores con la tecla principal usando el formato de Electron (Ej: "CommandOrControl+Shift+A")
    if (modifiers.length > 0) {
      return `${modifiers.join('+')}+${mainKey}`;
    }

    
    // Si no hay modificadores, devuelve solo la tecla (aunque ahora tú como usuario presionarás combinaciones)
    return mainKey;
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      if (listeningFor) setListeningFor(null);
    };

    if (listeningFor) {
      setTimeout(() => window.addEventListener('click', handleGlobalClick), 50);
    }
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [listeningFor]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!listeningFor) return;
      e.preventDefault();
      
      if (e.repeat) return; 

      const electronKey = getElectronKey(e);
      if (!electronKey) {
        console.warn("Esta tecla no está soportada por Electron para atajos globales.");
        return; // Ignora teclas inválidas
      }

      updateTTS({ [listeningFor]: electronKey });
      setListeningFor(null); 
    };

    if (listeningFor) {
      window.addEventListener('keydown', handleGlobalKeyDown);
    }
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [listeningFor, tts]); 

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

  const fetchElevenVoices = async () => {
    if (!tts.elevenLabsKey) return alert('Ingresa tu API Key de ElevenLabs primero');
    const voices = await apiFetch(`/api/tts/elevenlabs/voices?key=${tts.elevenLabsKey}`);
    if (voices.error) alert('Error: ' + voices.error);
    else setElevenVoices(voices);
  };

  const testAudio = () => enqueueTTS('Prueba de sonido. Bot activado.');

  const formatShortcutDisplay = (shortcutString) => {
    if (!shortcutString) return 'Clic para asignar atajo';
    return shortcutString.replace(/CommandOrControl/g, 'Ctrl');
  };

  return (
    <div className="tts-layout">
      <div className="tts-settings">
        <div className="tts-section-title">⚙️ Configuración General</div>

        <div className="tts-row">
          <label>Activar bot TTS</label>
          <label className="switch">
            <input type="checkbox" checked={tts.enabled || false} onChange={e => updateTTS({ enabled: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>

        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <label>¿A quién leemos? 🕵️</label>
          <select 
            className="modifier-select" 
            style={{ width: '100%' }} 
            value={tts.filterMode || 'all'} 
            onChange={e => updateTTS({ filterMode: e.target.value })}
          >
            <option value="all">🌎 A Todos</option>
            <option value="followers">❤️ Solo Seguidores y Fans</option>
            <option value="fans">⭐ Solo Club de Fans</option>
          </select>
        </div>

        {/* 🌟 NUEVO: Sub-menú de Nivel Mínimo (Solo visible si elige 'fans') */}
        {config?.tts?.filterMode === 'fans' && (
          <div style={{ 
            marginTop: '12px', 
            padding: '12px', 
            background: 'rgba(255, 77, 110, 0.05)', 
            borderLeft: '4px solid #ff4d6e',
            borderRadius: '0 4px 4px 0'
          }}>
            <label style={{ color: '#ff4d6e', fontWeight: 'bold' }}>❤️ Nivel Mínimo Exigido:</label>
            <select 
              value={config?.tts?.minFanLevel || 1} 
              onChange={(e) => onUpdateConfig({ tts: { ...config.tts, minFanLevel: parseInt(e.target.value, 10) } })}
              className='modifier-select'
              style={{ marginTop: '8px', width: '100%' }}
            >
              <option value={1}>Cualquier Nivel (1+)</option>
              
              {/* Truco ninja de React para generar los 49 <option> restantes sin escribirlos a mano */}
              {Array.from({ length: 49 }, (_, i) => i + 2).map(nivel => (
                <option key={nivel} value={nivel}>
                  Nivel {nivel} o superior
                </option>
              ))}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>
              Los fans con nivel inferior a este serán ignorados por el bot.
            </div>
          </div>
        )}

        {/* 🌟 NUEVOS INTERRUPTORES DE FILTRO Y LECTURA 🌟 */}
        <div className="tts-row" style={{ marginTop: '8px' }}>
          <label>🗣️ Leer el nombre de usuario</label>
          <label className="switch">
            <input type="checkbox" checked={tts.sayUsername || false} onChange={e => updateTTS({ sayUsername: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>

        <div className="tts-row" style={{ marginTop: '8px' }}>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span>🛡️ Filtro Anti-Spam (Idiomas)</span>
            <span style={{ fontSize: '10px', color: 'var(--text2)' }}>Bloquea ruso, georgiano, árabe, etc.</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={tts.onlyLatin || false} onChange={e => updateTTS({ onlyLatin: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>
        {/* 🌟 NUEVO: CONTROL DE VELOCIDAD */}
        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px', marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <label>⚡ Velocidad del Bot</label>
            <span style={{ color: '#00bcd4', fontWeight: 'bold' }}>{speed}x</span>
          </div>
          <input 
            type="range" min="0.5" max="2.0" step="0.1" 
            value={speed} 
            onChange={e => setSpeed(parseFloat(e.target.value))}
            onMouseUp={() => updateTTS({ speed: speed })} // Guarda en disco al soltar
            style={{ width: '100%', accentColor: '#00bcd4', cursor: 'pointer' }}
          />
        </div>

        {/* 🌟 NUEVO: FILTRO DE PREFIJO EXCLUSIVO */}
        <div className="tts-row" style={{ marginTop: '8px' }}>
          <label>🔒 Requerir Prefijo obligatorio</label>
          <label className="switch">
            <input type="checkbox" checked={tts.usePrefix || false} onChange={e => updateTTS({ usePrefix: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>

        {tts.usePrefix && (
          <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text2)' }}>Texto del Prefijo (Minúsculas)</label>
            <input 
              type="text" className="key-input" placeholder="Ej: !bot, /leer, l4d2" 
              value={tts.prefixText || ''} 
              onChange={e => updateTTS({ prefixText: e.target.value.toLowerCase() })}
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div className="tts-section-title" style={{ marginTop: '16px' }}>⌨️ Atajos de Teclado (Globales)</div>
        
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '12px' }}>
          💡 <strong>Recomendación:</strong> Usa combinaciones con <strong>Ctrl</strong> o <strong>Alt</strong> + Tecla (Ej: Ctrl+S). Evita usar teclas sueltas para no apagar el bot accidentalmente mientras juegas.
        </div>

        <div className="tts-row">
          <label>⏭️ Omitir actual</label>
          <button 
            className="btn"
            style={{ flex: 1, marginLeft: '10px', background: listeningFor === 'keySkipCurrent' ? '#ff9800' : 'var(--bg3)', color: 'white' }}
            onClick={(e) => { e.stopPropagation(); listeningFor === 'keySkipCurrent' ? setListeningFor(null) : setListeningFor('keySkipCurrent'); }}
          >
            {listeningFor === 'keySkipCurrent' ? '⏳ Presiona atajo...' : formatShortcutDisplay(tts.keySkipCurrent)}
          </button>
        </div>

        <div className="tts-row">
          <label>🧹 Limpiar cola</label>
          <button 
            className="btn"
            style={{ flex: 1, marginLeft: '10px', background: listeningFor === 'keySkipAll' ? '#ff9800' : 'var(--bg3)', color: 'white' }}
            onClick={(e) => { e.stopPropagation(); listeningFor === 'keySkipAll' ? setListeningFor(null) : setListeningFor('keySkipAll'); }}
          >
            {listeningFor === 'keySkipAll' ? '⏳ Presiona atajo...' : formatShortcutDisplay(tts.keySkipAll)}
          </button>
        </div>

        <div className="tts-row">
          <label>🛑 Apagar Bot</label>
          <button 
            className="btn"
            style={{ flex: 1, marginLeft: '10px', background: listeningFor === 'keyToggleBot' ? '#ff9800' : 'var(--bg3)', color: 'white' }}
            onClick={(e) => { e.stopPropagation(); listeningFor === 'keyToggleBot' ? setListeningFor(null) : setListeningFor('keyToggleBot'); }}
          >
            {listeningFor === 'keyToggleBot' ? '⏳ Presiona atajo...' : formatShortcutDisplay(tts.keyToggleBot)}
          </button>
        </div>

        <div className="tts-section-title" style={{ marginTop: '16px' }}>🎙️ Motor de voz</div>
        
        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <label>Motor</label>
          <select className="modifier-select" style={{ width: '100%' }} value={tts.engine || 'browser'} onChange={e => updateTTS({ engine: e.target.value })}>
            <option value="browser">Voces del sistema (offline)</option>
            <option value="elevenlabs">ElevenLabs (IA Premium)</option>
            <option value="tiktok">TikTok (Voces virales)</option>
          </select>
        </div>

        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <label>Dispositivo de salida 🔊</label>
          <select 
            className="modifier-select" 
            style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} 
            value={tts.audioDeviceId || ''} 
            onChange={e => updateTTS({ audioDeviceId: e.target.value })}
          >
            <option value="">Por defecto (Principal)</option>
            {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
          </select>
        </div>

        {tts.engine === 'elevenlabs' ? (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>API Key</label>
              <input type="password" className="key-input" placeholder="sk-..." value={tts.elevenLabsKey || ''} onChange={e => updateTTS({ elevenLabsKey: e.target.value })} />
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', margin: '8px 0', fontSize: '12px' }} onClick={fetchElevenVoices}>🔄 Cargar voces ElevenLabs</button>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz</label>
              <select className="modifier-select" style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} value={tts.elevenLabsVoiceId || ''} onChange={e => updateTTS({ elevenLabsVoiceId: e.target.value })}>
                <option value="">{elevenVoices.length ? 'Selecciona una voz' : '— carga primero las voces —'}</option>
                {elevenVoices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
              </select>
            </div>
          </div>
        ) : tts.engine === 'tiktok' ? (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz Viral</label>
              <select className="modifier-select" style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} value={tts.tiktokVoice || 'es_mx_002'} onChange={e => updateTTS({ tiktokVoice: e.target.value })}>
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
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz del sistema</label>
              <select 
                className="modifier-select" 
                style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} 
                value={tts.browserVoiceName || ''} 
                onChange={e => updateTTS({ browserVoiceName: e.target.value })}
              >
                {browserVoices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
          </div>
        )}

        <button className="btn btn-test" style={{ marginTop: '12px', width: '100%' }} onClick={testAudio}>▶ Probar Audio</button>
      </div>

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

                  {/* 💎 NUEVO: Badge de Donador (Team/Level) con CSS puro */}
                  {ev.isDonator && (
                    <span className="tts-badge donator" style={{ background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                      💎 Nvl {ev.donatorLevel}
                    </span>
                  )}

                  {/* ❤️ ACTUALIZADO: Badge de Fan con su nivel */}
                  {ev.isFanClub && (
                    <span className="tts-badge fan" style={{ marginLeft: '6px' }}>
                      ❤️ Fan {ev.fanLevel > 0 ? ev.fanLevel : ''}
                    </span>
                  )}

                  {/* 🛡️ Badge de Mod */}
                  {ev.isMod && (
                    <span className="tts-badge mod" style={{ marginLeft: '6px' }}>
                      🛡️ Mod
                    </span>
                  )}
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