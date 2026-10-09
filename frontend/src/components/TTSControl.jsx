import React, { useState, useEffect } from 'react';
import Select from './Select';
import Icon from './Icon';
import TTSAntispamModal from './TTSAntispamModal';
import TTSShortcutsModal from './TTSShortcutsModal';
import { apiFetch } from '../services/api';
import { enqueueTTS, setPlaybackRate, setVolume, RANDOM_SPEED_RANGE, RANDOM_PITCH_RANGE } from '../services/ttsPlayer';
import { TIKTOK_VOICES } from '../services/ttsVoices';

export default function TTSControl({ config, onUpdateConfig, ttsEvents, license }) {
  const tts = config.tts || {};

  const canUse = (id) => !license?.limits || license.limits.ttsEngines === null || license.limits.ttsEngines.includes(id);

  const [browserVoices, setBrowserVoices] = useState([]);
  const [elevenVoices, setElevenVoices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [piperVoices, setPiperVoices] = useState([]);
  const [edgeVoices, setEdgeVoices] = useState([]);

  // Estado local para la velocidad visual
  const [speed, setSpeed] = useState(tts.speed || 1.0);
  // Tono en semitonos (-12 a +12, 0 = normal); se guarda al soltar el control
  const [pitch, setPitch] = useState(tts.pitch ?? 0);
  const pitchLabel = pitch === 0 ? 'Normal' : pitch > 0 ? `+${pitch} (más agudo)` : `${pitch} (más grave)`;

  const [volume, setVolumeUI] = useState(tts.volume ?? 100);
  const updateTTS = (updates) => {
    onUpdateConfig({ tts: { ...tts, ...updates } });
  };

  // Modal abierto ('antispam' | 'shortcuts' | null) y resumen para los botones
  const [modal, setModal] = useState(null);
  const activeFilters = [tts.onlyLatin, tts.blockDuplicates, tts.slowModeEnabled, tts.profanityFilter].filter(Boolean).length;
  const assignedShortcuts = [tts.keySkipCurrent, tts.keySkipAll, tts.keyToggleBot].filter(Boolean).length;

  // Sincronizar la velocidad con el reproductor nativo
  useEffect(() => {
    if (tts.speed) {
      setPlaybackRate(tts.speed);
    }
  }, [tts.speed]);

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

  useEffect(() => {
    apiFetch('/api/tts/piper/voices')
      .then(voices => setPiperVoices(Array.isArray(voices) ? voices : []))
      .catch(() => setPiperVoices([]));
  }, []);

  useEffect(() => {
    apiFetch('/api/tts/edge/voices').then(v => setEdgeVoices(Array.isArray(v) ? v : []));
  }, []);

  const testAudio = () => enqueueTTS('Prueba de sonido. Bot activado.');

  return (
    <div className="tts-layout">
      <div className="tts-settings">
        <div className="tts-section-title"><Icon name="settings" size={15} /> Configuración General</div>

        <div className="tts-row">
          <label>Activar bot TTS</label>
          <label className="switch">
            <input type="checkbox" checked={tts.enabled || false} onChange={e => updateTTS({ enabled: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>

        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <label>¿A quién leemos? <Icon name="eye" size={15} /></label>
          <Select 
            className="modifier-select" 
            style={{ width: '100%' }} 
            value={tts.filterMode || 'all'} 
            onChange={e => updateTTS({ filterMode: e.target.value })}
          >
            <option value="all">A Todos</option>
            <option value="followers">Solo Seguidores y Fans</option>
            <option value="fans">Solo Club de Fans</option>
          </Select>
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
            <label style={{ color: '#ff4d6e', fontWeight: 'bold' }}><Icon name="heart" size={15} /> Nivel Mínimo Exigido:</label>
            <Select 
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
            </Select>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>
              Los fans con nivel inferior a este serán ignorados por el bot.
            </div>
          </div>
        )}

        {/* 🌟 NUEVOS INTERRUPTORES DE FILTRO Y LECTURA 🌟 */}
        <div className="tts-row" style={{ marginTop: '8px' }}>
          <label><Icon name="mic" size={15} /> Leer el nombre de usuario</label>
          <label className="switch">
            <input type="checkbox" checked={tts.sayUsername || false} onChange={e => updateTTS({ sayUsername: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>

        {/* 🌟 NUEVO: CONTROL DE VELOCIDAD */}
        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px', marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <label><Icon name="bolt" size={15} /> Velocidad del Bot</label>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{tts.randomSpeed ? 'Aleatoria' : `${speed}x`}</span>
          </div>
          <input 
            type="range" min="0.5" max="2.0" step="0.1" 
            value={speed} 
            onChange={e => setSpeed(parseFloat(e.target.value))}
            onMouseUp={() => updateTTS({ speed: speed })} // Guarda en disco al soltar
            disabled={!!tts.randomSpeed}
            style={{ width: '100%', cursor: tts.randomSpeed ? 'not-allowed' : 'pointer', opacity: tts.randomSpeed ? 0.4 : 1 }}
          />
          <label className="tts-check">
            <input type="checkbox" className="check" checked={!!tts.randomSpeed} onChange={e => updateTTS({ randomSpeed: e.target.checked })} />
            <span>Velocidad aleatoria <small>Cada mensaje se lee entre {RANDOM_SPEED_RANGE[0]}x y {RANDOM_SPEED_RANGE[1]}x</small></span>
          </label>
        </div>

        {/* Tono de la voz: más grave o más agudo, sin cambiar la velocidad */}
        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px', marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <label><Icon name="music" size={15} /> Tono de la voz</label>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{tts.randomPitch ? 'Aleatorio' : pitchLabel}</span>
          </div>
          <input
            type="range" min="-12" max="12" step="1" value={pitch}
            onChange={e => setPitch(parseInt(e.target.value, 10))}
            onMouseUp={() => updateTTS({ pitch })}
            onKeyUp={() => updateTTS({ pitch })}
            onTouchEnd={() => updateTTS({ pitch })}
            disabled={!!tts.randomPitch}
            style={{ width: '100%', cursor: tts.randomPitch ? 'not-allowed' : 'pointer', opacity: tts.randomPitch ? 0.4 : 1 }}
            aria-label="Tono de la voz en semitonos"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text2)' }}>
            <span>Más grave</span>
            {pitch !== 0 && !tts.randomPitch && <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => { setPitch(0); updateTTS({ pitch: 0 }); }}>Restablecer</button>}
            <span>Más agudo</span>
          </div>
          <label className="tts-check">
            <input type="checkbox" className="check" checked={!!tts.randomPitch} onChange={e => updateTTS({ randomPitch: e.target.checked })} />
            <span>Tono aleatorio <small>Cada mensaje se lee entre {RANDOM_PITCH_RANGE[0]} y +{RANDOM_PITCH_RANGE[1]} semitonos</small></span>
          </label>
        </div>

        {/* 🌟 NUEVO: FILTRO DE VOLUMEN */}
        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px', marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <label><Icon name="volume" size={15} /> Volumen del Bot</label>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{volume}%</span>
          </div>
          <input
            type="range" min="0" max="100" step="5" value={volume}
            onChange={e => { const v = parseInt(e.target.value, 10); setVolumeUI(v); setVolume(v); }}
            onMouseUp={() => updateTTS({ volume })}
            onKeyUp={() => updateTTS({ volume })}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        {/* 🌟 NUEVO: FILTRO DE PREFIJO EXCLUSIVO */}
        <div className="tts-row" style={{ marginTop: '8px' }}>
          <label><Icon name="lock" size={15} /> Requerir Prefijo obligatorio</label>
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

        <div className="tts-section-title" style={{ marginTop: '16px' }}><Icon name="shield" size={15} /> Filtros y atajos</div>
        <div className="tts-modal-buttons">
          <button className="btn btn-secondary" onClick={() => setModal('antispam')}>
            <Icon name="shield" size={15} /> Anti spam
            {activeFilters > 0 && <span className="tts-count" title="Filtros activos">{activeFilters}</span>}
          </button>
          <button className="btn btn-secondary" onClick={() => setModal('shortcuts')}>
            <Icon name="keyboard" size={15} /> Atajos de teclado
            {assignedShortcuts > 0 && <span className="tts-count" title="Atajos asignados">{assignedShortcuts}</span>}
          </button>
        </div>

        <div className="tts-section-title" style={{ marginTop: '16px' }}><Icon name="mic" size={15} /> Motor de voz</div>
        
        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <label>Motor</label>
          <Select className="modifier-select" style={{ width: '100%' }} value={tts.engine || 'browser'} onChange={e => updateTTS({ engine: e.target.value })}>
            <option value="browser">Voces del sistema (offline)</option>
            <option value="elevenlabs" disabled={!canUse('elevenlabs')}>ElevenLabs (IA Premium){canUse('elevenlabs') ? '' : ' (Pro)'}</option>
            <option value="tiktok" disabled={!canUse('tiktok')}>TikTok (Voces virales){canUse('tiktok') ? '' : ' (Pro)'}</option>
            <option value="piper" disabled={!canUse('piper')}>Piper (IA local, sin internet){canUse('piper') ? '' : ' (Pro)'}</option>
            <option value="edge" disabled={!canUse('edge')}>Edge TTS (Microsoft, gratis){canUse('edge') ? '' : ' (Pro)'}</option>
          </Select>
        </div>

        <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <label>Dispositivo de salida</label>
          <Select 
            className="modifier-select" 
            style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} 
            value={tts.audioDeviceId || ''} 
            onChange={e => updateTTS({ audioDeviceId: e.target.value })}
          >
            <option value="">Por defecto (Principal)</option>
            {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
          </Select>
        </div>

        {tts.engine === 'elevenlabs' ? (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>API Key</label>
              <input type="password" className="key-input" placeholder="sk-..." value={tts.elevenLabsKey || ''} onChange={e => updateTTS({ elevenLabsKey: e.target.value })} />
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', margin: '8px 0', fontSize: '12px' }} onClick={fetchElevenVoices}><Icon name="refresh" size={15} /> Cargar voces ElevenLabs</button>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz</label>
              <Select className="modifier-select" style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} value={tts.elevenLabsVoiceId || ''} disabled={!!tts.randomVoice} onChange={e => updateTTS({ elevenLabsVoiceId: e.target.value })}>
                <option value="">{elevenVoices.length ? 'Selecciona una voz' : '— carga primero las voces —'}</option>
                {elevenVoices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
              </Select>
            </div>
          </div>
        ) : tts.engine === 'tiktok' ? (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz Viral</label>
              <Select className="modifier-select" style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} value={tts.tiktokVoice || 'es_mx_002'} disabled={!!tts.randomVoice} onChange={e => updateTTS({ tiktokVoice: e.target.value })}>
                {TIKTOK_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            </div>
          </div>
        ) : tts.engine === 'piper' ? (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz de Piper (local)</label>
              {piperVoices.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#ff9800' }}>
                  No hay voces instaladas. Coloca un modelo (.onnx + .onnx.json) en <code>backend/bin/piper/voices/</code> y reinicia la app.
                </div>
              ) : (
                <Select
                  className="modifier-select"
                  style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                  value={tts.piperVoice || ''}
                  disabled={!!tts.randomVoice}
                  onChange={e => updateTTS({ piperVoice: e.target.value })}
                >
                  <option value="">Selecciona una voz</option>
                  {piperVoices.map(v => <option key={v} value={v}>{v}</option>)}
                </Select>
              )}
            </div>
          </div>
        ) : tts.engine === 'edge' ? (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz de Edge TTS</label>
              <Select
                className="modifier-select"
                style={{ width: '100%' }}
                value={tts.edgeVoice || ''}
                disabled={!!tts.randomVoice}
                onChange={e => updateTTS({ edgeVoice: e.target.value })}
              >
                <option value="">Selecciona una voz</option>
                {Object.entries(
                  edgeVoices.reduce((groups, v) => {
                    (groups[v.lang] = groups[v.lang] || []).push(v);
                    return groups;
                  }, {})
                ).map(([lang, voices]) => (
                  <optgroup key={lang} label={lang}>
                    {voices.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                  </optgroup>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div className="tts-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <label>Voz del sistema</label>
              <Select 
                className="modifier-select" 
                style={{ width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} 
                value={tts.browserVoiceName || ''} 
                disabled={!!tts.randomVoice}
                onChange={e => updateTTS({ browserVoiceName: e.target.value })}
              >
                {browserVoices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </Select>
            </div>
          </div>
        )}

        <label className="tts-check" style={{ marginTop: '10px' }}>
          <input type="checkbox" className="check" checked={!!tts.randomVoice} onChange={e => updateTTS({ randomVoice: e.target.checked })} />
          <span>
            Aleatorización de voz
            <small>
              {tts.engine === 'browser' || tts.engine === 'edge' || !tts.engine
                ? 'Cada mensaje usa una voz distinta de este motor, del mismo idioma que la voz elegida'
                : tts.engine === 'elevenlabs' ? 'Cada mensaje usa una voz distinta de tu cuenta de ElevenLabs (necesita la API Key)'
                : 'Cada mensaje usa una voz distinta de este motor'}
            </small>
          </span>
        </label>

        <button className="btn btn-test" style={{ marginTop: '12px', width: '100%' }} onClick={testAudio}><Icon name="play" size={15} /> Probar Audio</button>
      </div>

      <div className="tts-log-panel">
        <div className="tts-section-title"><Icon name="message" size={15} /> Comentarios leídos</div>
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
                      <Icon name="gem" size={13} /> Nvl {ev.donatorLevel}
                    </span>
                  )}

                  {/* ❤️ ACTUALIZADO: Badge de Fan con su nivel */}
                  {ev.isFanClub && (
                    <span className="tts-badge fan" style={{ marginLeft: '6px' }}>
                      <Icon name="heart" size={13} /> Fan {ev.fanLevel > 0 ? ev.fanLevel : ''}
                    </span>
                  )}

                  {/* 🛡️ Badge de Mod */}
                  {ev.isMod && (
                    <span className="tts-badge mod" style={{ marginLeft: '6px' }}>
                      <Icon name="shield" size={13} /> Mod
                    </span>
                  )}
                </div>
                <div className="tts-comment">{ev.comment}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {modal === 'antispam' && <TTSAntispamModal tts={tts} onChange={updateTTS} onClose={() => setModal(null)} />}
      {modal === 'shortcuts' && <TTSShortcutsModal tts={tts} onChange={updateTTS} onClose={() => setModal(null)} />}
    </div>
  );
}