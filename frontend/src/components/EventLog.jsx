import React from 'react';

// Reutilizamos tu función de emojis
const getGiftEmoji = (coins, giftId) => {
  if (giftId === 'action_follow') return '👤';
  if (giftId === 'action_share') return '📢'; // NUEVO: Icono para compartir
  if (!coins || coins < 5) return '🌹';
  if (coins < 20) return '🍪';
  if (coins < 50) return '🎁';
  if (coins < 100) return '✨';
  if (coins < 500) return '💎';
  if (coins < 1000) return '🚀';
  return '👑';
};

export default function EventLog({ events }) {
  if (events.length === 0) {
    return (
      <div className="event-log">
        <div className="log-empty">El log de eventos aparecerá aquí cuando lleguen regalos.</div>
      </div>
    );
  }

  return (
    <div className="event-log">
      {events.map((ev, i) => {
        const time = new Date(ev.timestamp || Date.now()).toLocaleTimeString('es', { 
          hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
        
        return (
          <div key={i} className={`log-entry ${ev.pressed ? 'pressed' : 'no-key'}`}>
            <div className="log-time">{time}</div>
            <div className="log-body">
              <span className="log-gift">{getGiftEmoji(ev.coins, ev.giftId)} {ev.giftName}</span>
              <span className="log-sender"> de @{ev.sender}</span>
              {ev.newCount > 1 && <span className="log-count">×{ev.newCount}</span>}
              
              {ev.key ? (
                <span className="log-key">
                  {ev.modifier !== 'none' ? `${ev.modifier}+` : ''}{ev.key}
                </span>
              ) : (
                <span className="log-no-key">sin tecla asignada</span>
              )}
              {ev.pressed ? ' ✅' : ' ❌'}
            </div>
          </div>
        );
      })}
    </div>
  );
}