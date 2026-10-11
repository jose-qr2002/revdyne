import React from 'react';
import Icon from './Icon';
import ModalShell from './ModalShell';

// Identificador de la imagen: el hash del archivo, sin ruta, sin sufijo de CDN (~tplv...) y SIN extensión. Dos IDs con el mismo hash tienen
// exactamente la misma foto (TikTok a veces la sirve con ".png" y a veces sin extensión: eso no es otra foto).
const iconFile = (url) => String(url || '').split('/').pop().split('~')[0].replace(/\.[a-z0-9]+$/i, '');

const SOURCES = { general: 'Lista general', sala: 'Sala de un directo' };

// Detalle de un regalo: todos sus IDs con foto, nombre y origen, y la opción de tratar un ID como regalo distinto.
// `ids` son los IDs del grupo; `catalog` el catálogo completo (cada ID guarda su propio nombre, monedas e ícono).
export default function GiftDetailModal({ ids, catalog, busyId, onSplit, onClose }) {
  const rows = ids.map(id => ({ id, ...catalog[id] })).filter(r => r.name);
  if (!rows.length) return null;

  const head = rows[0];
  const distinctPhotos = new Set(rows.map(r => iconFile(r.icon)).filter(Boolean)).size;
  const differentPhotos = distinctPhotos > 1;
  const reviewed = differentPhotos && rows.every(r => r.same); // una persona ya comprobó que es el mismo regalo con otro diseño
  const canSplit = rows.length > 1;
  const splitRows = rows.filter(r => r.split);

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      width="640px"
      title={<><Icon name="gift" size={18} /> <span className="ellipsis">{head.name}</span></>}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}
    >
      <div className="gd-summary">
        <span className="gd-coins">{head.coins} <Icon name="gem" size={14} /></span>
        <span>{rows.length === 1 ? '1 ID' : `${rows.length} IDs`} en el catálogo</span>
      </div>

      {rows.length > 1 && (
        <p className="gd-note">
          TikTok usa IDs distintos para un mismo regalo (según región o época). Una regla de este regalo se dispara con cualquiera de ellos.
        </p>
      )}

      {reviewed && (
        <div className="gd-ok">
          <Icon name="check" size={16} />
          <span>Revisado: las fotos son distintas pero es <strong>el mismo regalo</strong> con otro diseño. Si no lo es, usa <strong>Tratar como distinto</strong> en ese ID.</span>
        </div>
      )}

      {differentPhotos && !reviewed && (
        <div className="gd-warn">
          <Icon name="alert" size={16} />
          <span>
            Estos IDs tienen <strong>fotos distintas</strong>. Pueden ser el mismo regalo con otro diseño, o regalos diferentes con el mismo nombre en inglés
            (TikTok solo entrega el nombre en inglés). Si por la foto ves que son distintos, usa <strong>Tratar como regalo distinto</strong> en ese ID.
          </span>
        </div>
      )}

      <div className="gd-list">
        {rows.map(r => (
          <div key={r.id} className={`gd-row${r.split ? ' split' : ''}`}>
            <div className="gd-photo">
              {r.icon
                ? <img src={r.icon} alt={r.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                : <span className="gd-nophoto"><Icon name="image" size={22} /></span>}
            </div>
            <div className="gd-info">
              <div className="gd-name ellipsis" title={r.name}>{r.name}</div>
              <div className="gd-meta">
                <span className="gd-id">ID {r.id}</span>
                <span>{r.coins} <Icon name="gem" size={12} /></span>
              </div>
              <div className="gd-tags">
                {r.seen && <span className="gd-tag seen" title="Este ID ya llegó en un directo real">Visto en directo</span>}
                {(r.src || []).map(s => <span key={s} className="gd-tag">{SOURCES[s] || s}</span>)}
                {!r.seen && !(r.src || []).length && <span className="gd-tag muted">Origen desconocido</span>}
                {r.split && <span className="gd-tag split">Tratado como distinto</span>}
              </div>
            </div>
            {(canSplit || r.split) && (
              <button
                className="btn btn-secondary btn-sm gd-split"
                disabled={busyId === r.id}
                onClick={() => onSplit(r.id, !r.split)}
                title={r.split ? 'Volver a agruparlo con los IDs del mismo nombre y precio' : 'No agruparlo con los demás: las reglas de este ID solo se dispararán con este ID'}
              >
                {r.split ? 'Volver a agrupar' : 'Tratar como distinto'}
              </button>
            )}
          </div>
        ))}
      </div>

      {splitRows.length > 0 && (
        <p className="gd-note">
          Un ID tratado como distinto se muestra como un regalo aparte en el catálogo y en Eventos. Las reglas que ya hiciste con él siguen funcionando,
          pero solo se disparan con ese ID.
        </p>
      )}
    </ModalShell>
  );
}
