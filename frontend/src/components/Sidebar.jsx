import React, { useState, useEffect } from 'react';
import { useProfilePreview } from '../hooks/useProfilePreview';

const SUBLINES = {
  loading: 'Buscando perfil…',
  notfound: 'No encontramos ese usuario',
  invalid: 'Solo letras, números, _ y .',
  unavailable: 'Vista previa no disponible',
};

export default function Sidebar({
  status, config, onConnect, onUpdateConfig, isConnecting,
  activeProfileId, profilesList, onChangeProfile, onCreateProfile
}) {
  // Borrador local: escribir ya no guarda en disco en cada tecla
  const [draft, setDraft] = useState(config.username || '');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => { setDraft(config.username || ''); }, [config.username]);

  const cleanDraft = draft.replace(/^@/, '').trim();
  const preview = useProfilePreview(cleanDraft);
  const profile = preview.profile;

  useEffect(() => { setImgFailed(false); }, [profile?.avatar]);

  const commitUsername = () => {
    if (cleanDraft !== (config.username || '')) onUpdateConfig({ username: cleanDraft });
  };

  const handleConnectClick = () => { commitUsername(); onConnect(cleanDraft); };

  const found = preview.status === 'found';
  const showImg = found && profile?.avatar && !imgFailed;
  const displayName = found
    ? (profile.nickname || `@${profile.uniqueId}`)
    : (cleanDraft ? `@${cleanDraft}` : 'Sin usuario');
  const subline = found
    ? `@${profile.uniqueId}`
    : (SUBLINES[preview.status] || (cleanDraft ? '' : 'Escribe un usuario de TikTok'));

  const locked = status.connected || isConnecting;
  const btnClass = `btn btn-connect ${status.connected ? 'disconnect' : ''} ${isConnecting && !status.connected ? 'busy' : ''}`;

  return (
    <aside className="sidebar">

      <div className="logo">
        <div className="logo-mark">R</div>
        <div>
          <h1>REVINITY</h1>
          <p>Interacción para TikTok LIVE</p>
        </div>
      </div>

      <div className={`status-card ${status.connected ? 'connected' : ''}`}>
        <div className={`status-dot ${status.connected ? 'on' : ''}`}></div>
        <div>
          <div className="status-label">{status.connected ? 'Conectado al Directo' : 'Desconectado'}</div>
          <div className="status-sub">{status.message || 'Esperando conexión...'}</div>
        </div>
      </div>

      <div className="connect-section">
        <div className="profile-card">
          <div className={`avatar ${preview.status}`}>
            {showImg
              ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
              : <span className="avatar-fallback">{(cleanDraft[0] || '?').toUpperCase()}</span>}
            {preview.status === 'loading' && <span className="avatar-spinner" />}
          </div>
          <div className="profile-info">
            <div className="profile-name" title={displayName}>{displayName}{found && profile.verified ? ' ✔' : ''}</div>
            <div className={`profile-handle ${preview.status === 'notfound' || preview.status === 'invalid' ? 'error' : ''}`}>
              {subline || '\u00A0'}
            </div>
          </div>
        </div>

        <label>Usuario de TikTok</label>
        <div className="input-row">
          <span className="at">@</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitUsername}
            onKeyDown={(e) => { if (e.key === 'Enter' && !locked) handleConnectClick(); }}
            placeholder="ej: tu_canal"
            disabled={locked}
          />
        </div>

        <button
          className={btnClass}
          onClick={handleConnectClick}
          disabled={isConnecting && !status.connected}
        >
          {isConnecting ? '⏳ Conectando...' : (status.connected ? 'Desconectar' : 'Conectar')}
        </button>
      </div>

      {profilesList && (
        <div className="profile-box">
          <div className="section-title">🕹️ Perfil activo</div>
          <select className="modifier-select" value={activeProfileId || ''} onChange={(e) => onChangeProfile(e.target.value)}>
            {Object.entries(profilesList).map(([id, prof]) => (
              <option key={id} value={id}>{prof.isGlobal ? '🌐 ' : '🎮 '} {prof.name}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={onCreateProfile}>➕ Nuevo juego</button>
        </div>
      )}

      <div className={`robot-status ${config.robotAvailable ? 'ok' : 'warn'}`}>
        <span>{config.robotAvailable ? '✅' : '⚠️'}</span>
        <span>{config.robotAvailable ? 'Motor de teclado activo' : 'Modo simulación'}</span>
      </div>

      {config.appVersion && <div className="app-version">REVINITY v{config.appVersion}</div>}
    </aside>
  );
}