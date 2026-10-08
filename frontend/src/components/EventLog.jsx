import React from 'react';
import GiftTierIcon from './GiftTier';
import { plainText } from './giftUtils';
import Icon from './Icon';
import ErrorLogPanel from './ErrorLogPanel';

// Ícono de cada línea del log: seguidores/compartidas/metas tienen el suyo; un regalo usa su nivel por monedas
const eventIcon = (ev) => {
  const id = String(ev.giftId || '');
  if (id === 'action_follow') return <Icon name="user" size={16} />;
  if (id === 'action_share') return <Icon name="share" size={16} />;
  if (id.startsWith('like_')) return <Icon name="heart" size={16} />;
  if (id.startsWith('overlay_')) return <Icon name="target" size={16} />;
  return <GiftTierIcon coins={ev.coins} size={16} />;
};

export default function EventLog({ events }) {
  if (events.length === 0) {
    return (
      <>
        <ErrorLogPanel />
        <div className="event-log">
          <div className="log-empty">El log de eventos aparecerá aquí cuando lleguen regalos.</div>
        </div>
      </>
    );
  }

  return (
    <>
    <ErrorLogPanel />
    <div className="event-log">
      {events.map((ev, i) => {
        const time = new Date(ev.timestamp || Date.now()).toLocaleTimeString('es', { 
          hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
        
        return (
          <div key={i} className={`log-entry ${ev.pressed ? 'pressed' : 'no-key'}`}>
            <div className="log-time">{time}</div>
            <div className="log-body">
              <span className="log-gift">{eventIcon(ev)} {plainText(ev.giftName)}</span>
              <span className="log-sender"> de @{ev.sender}</span>
              {ev.newCount > 1 && <span className="log-count">×{ev.newCount}</span>}
              
              {ev.key ? (
                <span className="log-key">
                  {ev.modifier && ev.modifier !== 'none' ? `${ev.modifier}+` : ''}{ev.key}
                </span>
              ) : (
                <span className="log-no-key">sin tecla asignada</span>
              )}
              {' '}<Icon name={ev.pressed ? 'check' : 'x'} size={14} className={ev.pressed ? 'log-ok' : 'log-fail'} />
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}