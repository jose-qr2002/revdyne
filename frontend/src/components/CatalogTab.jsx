import React, { useState, useEffect } from 'react';
import GiftTierIcon from './GiftTier';
import Icon from './Icon';
import { apiFetch } from '../services/api';

export default function CatalogTab({ catalog, onCatalogSynced }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('coinsDesc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState(null);

  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSyncGifts = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setNotification(null);

    try {
      const res = await apiFetch('/api/catalog/sync', 'POST');
      if (res.error) {
        setNotification({ type: 'error', text: 'Error al descargar: ' + res.error });
      } else {
        onCatalogSynced(res.catalog); // actualiza el estado en App.jsx, sin reiniciar nada
        setNotification({ type: 'success', text: `${res.nuevos} nuevos, ${res.actualizados} actualizados` });
      }
    } catch (e) {
      setNotification({ type: 'error', text: 'Error de red al intentar sincronizar.' });
    }
    setIsSyncing(false);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', position: 'relative' }}>

      {notification && (
        <div style={{
          position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
          background: notification.type === 'error' ? '#f44336' : '#4caf50', color: 'white', padding: '10px 20px', borderRadius: '8px',
          fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '10px', animation: 'fadeInDown 0.3s ease-out'
        }}>
          <span><Icon name={notification.type === 'error' ? 'x' : 'check'} size={16} /></span><span>{notification.text}</span>
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
          disabled={isSyncing}
          style={{
            background: isSyncing ? 'gray' : '#00bcd4',
            color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px',
            cursor: isSyncing ? 'not-allowed' : 'pointer', fontWeight: 'bold'
          }}
        >
          {isSyncing ? <><Icon name="clock" size={15} /> Conectando con TikTok...</> : <><Icon name="refresh" size={15} /> Actualizar / Descargar regalos</>}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', background: 'var(--card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <input
          type="text" className="key-input" placeholder="Buscar por nombre o ID del regalo..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ flex: 1 }}
        />
        <select className="modifier-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: '180px' }}>
          <option value="coinsDesc">Mayor a menor</option>
          <option value="coinsAsc">Menor a mayor</option>
          <option value="nameAsc">A - Z</option>
          <option value="nameDesc">Z - A</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
        {paginatedGifts.map(([id, data]) => (
          <div key={id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              {data.icon ? (
                <img src={data.icon} alt={data.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
              ) : (
                <span style={{ fontSize: '24px' }}><GiftTierIcon coins={data.coins} size={28} /></span>
              )}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ID: {id}</div>
              <div style={{ fontSize: '13px', color: '#ffd700', marginTop: '4px', fontWeight: 'bold' }}>{data.coins} <Icon name="gem" size={13} /></div>
            </div>
          </div>
        ))}
      </div>

      {allFilteredGifts.length === 0 && (
        <div className="log-empty">No se encontraron regalos en el catálogo.</div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ opacity: currentPage === 1 ? 0.5 : 1 }}><Icon name="chevronLeft" size={14} /> Anterior</button>
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Página {currentPage} de {totalPages}</span>
          <button className="btn btn-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}>Siguiente <Icon name="chevronRight" size={14} /></button>
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