import React, { useState, useEffect } from 'react';
import { useProfilePreview } from '../hooks/useProfilePreview';
import Icon from './Icon';
import { apiFetch } from '../services/api';
import { NAV_GROUPS } from './navItems';

const SUBLINES = {
  loading: 'Buscando perfil…',
  notfound: 'No encontramos ese usuario',
  invalid: 'Solo letras, números, _ y .',
  unavailable: 'Vista previa no disponible',
};

// El servidor antepone un emoji a algunos mensajes de estado ("✅ Conectado a @x", "🔌 Desconectado"): se muestra sin él
const plainMessage = (msg) => String(msg || '').replace(/^[\p{Extended_Pictographic}️\s]+/u, '');

export default function Sidebar({
  status, config, onConnect, onUpdateConfig, isConnecting,
  activeProfileId, profilesList, onChangeProfile, onCreateProfile,
  license, onOpenLicense, activeTab, onSelectTab
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

  // Al terminar de escribir otro usuario (sin conectar) los tops del panel pasan a los de esa cuenta si tiene datos guardados
  useEffect(() => {
    if (status.connected || isConnecting || !cleanDraft) return;
    const t = setTimeout(() => apiFetch('/api/overlays/ranking/owner', 'POST', { username: cleanDraft }), 700);
    return () => clearTimeout(t);
  }, [cleanDraft, status.connected, isConnecting]);

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
        <img className="logo-mark" src="/icon.png" alt="" />
        <div>
          <h1>REVDYNE</h1>
          <p>Interacción para TikTok LIVE</p>
        </div>
      </div>

      {/* Conexión: siempre visible arriba */}
      <div className="conn">
        <div className={`status-card ${status.connected ? 'connected' : ''}`}>
          <div className={`status-dot ${status.connected ? 'on' : ''}`}></div>
          <div className="status-text">
            <div className="status-label">{status.connected ? 'Conectado al directo' : 'Desconectado'}</div>
            <div className="status-sub" title={plainMessage(status.message)}>{plainMessage(status.message) || 'Esperando conexión…'}</div>
          </div>
        </div>

        <div className="profile-card">
          <div className={`avatar ${preview.status}`}>
            {showImg
              ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
              : <span className="avatar-fallback">{(cleanDraft[0] || '?').toUpperCase()}</span>}
            {preview.status === 'loading' && <span className="avatar-spinner" />}
          </div>
          <div className="profile-info">
            <div className="profile-name" title={displayName}>
              {displayName}{found && profile.verified ? <Icon name="check" size={12} className="verified" /> : null}
            </div>
            <div className={`profile-handle ${preview.status === 'notfound' || preview.status === 'invalid' ? 'error' : ''}`}>
              {subline || ' '}
            </div>
          </div>
        </div>

        <div className="input-row">
          <span className="at">@</span>
          <input
            type="text"
            aria-label="Usuario de TikTok"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitUsername}
            onKeyDown={(e) => { if (e.key === 'Enter' && !locked) handleConnectClick(); }}
            placeholder="usuario de TikTok"
            disabled={locked}
          />
        </div>

        <button
          className={btnClass}
          onClick={handleConnectClick}
          disabled={isConnecting && !status.connected}
        >
          {isConnecting && !status.connected && <Icon name="clock" size={15} />}
          {isConnecting ? 'Conectando…' : (status.connected ? 'Desconectar' : 'Conectar')}
        </button>
      </div>

      {/* Navegación: crece con las secciones y hace scroll por su cuenta */}
      <nav className="nav" aria-label="Secciones">
        {NAV_GROUPS.map((group, gi) => (
          <div className="nav-group" key={group.label || gi}>
            {group.label && <div className="nav-label">{group.label}</div>}
            {group.items.map(item => (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => onSelectTab(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Pie fijo: perfil activo, plan y versión */}
      <div className="side-foot">
        {config.robotAvailable === false && (
          <div className="robot-warn" title="RobotJS no se pudo cargar: las teclas solo se simulan y no llegan al juego.">
            <Icon name="alert" size={14} /> Teclado en simulación
          </div>
        )}

        {profilesList && (
          <div className="profile-box">
            <label className="section-title" htmlFor="active-profile">Perfil activo</label>
            <div className="profile-row">
              <select id="active-profile" className="modifier-select" value={activeProfileId || ''} onChange={(e) => onChangeProfile(e.target.value)}>
                {Object.entries(profilesList).map(([id, prof]) => (
                  <option key={id} value={id}>{prof.isGlobal ? 'Global · ' : ''}{prof.name}</option>
                ))}
              </select>
              <button className="icon-btn" onClick={onCreateProfile} title="Nuevo juego" aria-label="Nuevo juego">
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
        )}

        <button className={`plan-badge ${license?.tier === 'pro' ? 'pro' : ''}`} onClick={onOpenLicense}>
          <Icon name={license?.tier === 'pro' ? 'star' : 'lock'} size={14} />
          {license?.tier === 'pro'
            ? 'Plan Pro'
            : `Plan Gratis · ${license?.usage?.actions ?? 0}/${license?.limits?.maxActions ?? 5} acciones`}
        </button>

        {config.appVersion && <div className="app-version">REVDYNE v{config.appVersion}</div>}
      </div>
    </aside>
  );
}
