import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api'; // 👈 IMPORTANTE: Necesitamos esto para llamar al backend

export default function CatalogTab({ catalog, onUpdateConfig }) { // 👈 IMPORTANTE: Agregamos onUpdateConfig
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('coinsDesc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false); // 👈 NUEVO: Estado para el botón
  const ITEMS_PER_PAGE = 50;

  // Volver a la página 1 si buscamos o filtramos algo nuevo
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  // 🌟 NUEVO: Función que llama a tu servidor para descargar/actualizar regalos
  const handleSyncGifts = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await apiFetch('/api/catalog/sync', 'POST');
      if (res.error) {
        alert('Error al descargar: ' + res.error);
      } else {
        alert(`¡Sincronización Completa!\n🎁 Nuevos: ${res.nuevos}\n🔄 Actualizados: ${res.actualizados}\n📊 Total: ${res.total}`);
        // Actualizamos el estado global de React con el nuevo catálogo al instante
        if (onUpdateConfig && res.catalog) {
          onUpdateConfig({ catalog: res.catalog });
        }
      }
    } catch (e) {
      alert('Error de red al intentar sincronizar con el backend.');
    }
    setIsSyncing(false);
  };

  // Convertimos el objeto catalog en un arreglo para poder filtrarlo
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

  // Función auxiliar para iconos por defecto si TikTok falla
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
      
      {/* 🌟 NUEVO: ENCABEZADO CON BOTÓN DE SINCRONIZACIÓN */}
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
            color: 'white', 
            border: 'none', 
            padding: '10px 16px', 
            borderRadius: '6px',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isSyncing ? '⏳ Conectando con TikTok...' : '🔄 Actualizar / Descargar Regalos'}
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div style={{ display: 'flex', gap: '10px', background: 'var(--card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <input 
          type="text" 
          className="key-input" 
          placeholder="🔍 Buscar por nombre o ID del regalo..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="modifier-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: '180px' }}>
          <option value="coinsDesc">💰 Mayor a Menor</option>
          <option value="coinsAsc">🪙 Menor a Mayor</option>
          <option value="nameAsc">🔤 A - Z</option>
          <option value="nameDesc">🔠 Z - A</option>
        </select>
      </div>

      {/* GRILLA DE REGALOS (Modo solo lectura) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
        gap: '12px' 
      }}>
        {paginatedGifts.map(([id, data]) => (
          <div key={id} style={{ 
            background: 'var(--card)', 
            border: '1px solid var(--border)', 
            borderRadius: '8px', 
            padding: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px' 
          }}>
            <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              {data.icon ? (
                <img src={data.icon} alt={data.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
              ) : (
                <span style={{ fontSize: '24px' }}>{getGiftEmoji(data.coins)}</span>
              )}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {data.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ID: {id}</div>
              <div style={{ fontSize: '13px', color: '#ffd700', marginTop: '4px', fontWeight: 'bold' }}>{data.coins} 💎</div>
            </div>
          </div>
        ))}
      </div>

      {allFilteredGifts.length === 0 && (
        <div className="log-empty">No se encontraron regalos en el catálogo.</div>
      )}

      {/* PAGINACIÓN */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ opacity: currentPage === 1 ? 0.5 : 1 }}>◀ Anterior</button>
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Página {currentPage} de {totalPages}</span>
          <button className="btn btn-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}>Siguiente ▶</button>
        </div>
      )}
    </div>
  );
}