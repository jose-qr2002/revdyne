import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

export default function CatalogTab({ catalog }) { 
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('coinsDesc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [notification, setNotification] = useState(null); 
  const [countdown, setCountdown] = useState(null); // ⏳ NUEVO: Estado para la cuenta regresiva

  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  // 🛡️ Ocultar notificaciones de error normales de forma automática
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // 🧠 EL TEMPORIZADOR MAESTRO: Controla la cuenta regresiva de 3, 2, 1...
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      // Cuando el contador llega a 0, le pedimos al backend el reinicio inmediato
      apiFetch('/api/system/restart', 'POST').catch(() => {
        // Fallback drástico si el servidor no responde
        window.location.reload(); 
      });
    }
  }, [countdown]);

  const handleSyncGifts = async () => {
    if (isSyncing || countdown !== null) return;
    setIsSyncing(true);
    setNotification(null);

    try {
      const res = await apiFetch('/api/catalog/sync', 'POST');
      if (res.error) {
        setNotification({ type: 'error', text: 'Error al descargar: ' + res.error });
        setIsSyncing(false);
      } else {
        // 🚀 ¡ÉXITO! En lugar de alert o mensaje fijo, iniciamos la cuenta regresiva en 3
        setCountdown(3);
      }
    } catch (e) {
      setNotification({ type: 'error', text: 'Error de red al intentar sincronizar.' });
      setIsSyncing(false);
    }
  };

  const allFilteredGifts = Object.entries(catalog || {})
    .filter(([id, data]) => 
      data.name.toLowerCase().includes(searchTerm.toLowerCase()) || id.includes(searchTerm)
    )
    .sort((a, b) => {
      const [, giftA] = a;
      const [, giftB] = b;
      if (sortBy === 'coinsDesc') return giftB.coins - giftA.coins;
      if (sortBy === 'coinsAsc') return giftA.coins - giftB.coins;
      if (sortBy === 'nameAsc') return giftA.name.localeCompare(giftB.name);
      if (sortBy === 'nameDesc') return giftB.name.localeCompare(giftA.name);
      return 0;
    });

  const totalPages = Math.ceil(allFilteredGifts.length / ITEMS_PER_PAGE);
  const paginatedGifts = allFilteredGifts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const getGiftEmoji = (coins) => {
    if (!coins || coins < 5) return '🌹';
    if (coins < 20) return '🍪';
    if (coins < 50) return '🎁';
    if (coins < 100) return '✨';
    if (coins < 500) return '💎';
    if (coins < 1000) return '🚀';
    return '👑';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', position: 'relative' }}>
      
      {/* 🛑 ALERTA DE ERROR ESTÁNDAR */}
      {notification && (
        <div style={{
          position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
          background: '#f44336', color: 'white', padding: '10px 20px', borderRadius: '8px',
          fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '10px', animation: 'fadeInDown 0.3s ease-out'
        }}>
          <span>❌</span><span>{notification.text}</span>
        </div>
      )}

      {/* 🔄 🌟 NUEVA PANTALLA VISUAL FLOTANTE: CUENTA REGRESIVA DE REINICIO */}
      {countdown !== null && (
        <div style={{
          position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
          background: '#ff9800', color: 'white', padding: '14px 28px', borderRadius: '8px',
          fontWeight: 'bold', boxShadow: '0 6px 20px rgba(0,0,0,0.4)', zIndex: 2000,
          display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px',
          border: '2px solid #ffb74d', animation: 'fadeInDown 0.3s ease-out'
        }}>
          <span>🔄</span>
          <span>¡Regalos listos! Reiniciando aplicación en <strong style={{ fontSize: '18px', color: '#fff', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '4px', marginLeft: '4px' }}>{countdown > 0 ? countdown : '¡Ya!'}</strong></span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Catálogo Oficial de TikTok</h3>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>
            Total en tu base de datos: {Object.keys(catalog || {}).length} regalos mapeados
          </div>
        </div>
        <button 
          className="btn" 
          onClick={handleSyncGifts} 
          disabled={isSyncing || countdown !== null}
          style={{ 
            background: (isSyncing || countdown !== null) ? 'gray' : '#00bcd4', 
            color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px',
            cursor: (isSyncing || countdown !== null) ? 'not-allowed' : 'pointer', fontWeight: 'bold'
          }}
        >
          {isSyncing ? '⏳ Conectando con TikTok...' : (countdown !== null ? '🔄 Reiniciando...' : '🔄 Actualizar / Descargar Regalos')}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', background: 'var(--card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <input 
          type="text" className="key-input" placeholder="🔍 Buscar por nombre o ID del regalo..." 
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ flex: 1 }}
        />
        <select className="modifier-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: '180px' }}>
          <option value="coinsDesc">💰 Mayor a Menor</option>
          <option value="coinsAsc">🪙 Menor a Mayor</option>
          <option value="nameAsc">🔤 A - Z</option>
          <option value="nameDesc">🔠 Z - A</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
        {paginatedGifts.map(([id, data]) => (
          <div key={id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              {data.icon ? (
                <img src={data.icon} alt={data.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
              ) : (
                <span style={{ fontSize: '24px' }}>{getGiftEmoji(data.coins)}</span>
              )}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ID: {id}</div>
              <div style={{ fontSize: '13px', color: '#ffd700', marginTop: '4px', fontWeight: 'bold' }}>{data.coins} 💎</div>
            </div>
          </div>
        ))}
      </div>

      {allFilteredGifts.length === 0 && (
        <div className="log-empty">No se encontraron regalos en el catálogo.</div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ opacity: currentPage === 1 ? 0.5 : 1 }}>◀ Anterior</button>
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Página {currentPage} de {totalPages}</span>
          <button className="btn btn-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}>Siguiente ▶</button>
        </div>
      )}

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}