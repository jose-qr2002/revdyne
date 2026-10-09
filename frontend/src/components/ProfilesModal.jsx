import React, { useState } from 'react';
import Icon from './Icon';
import ModalShell from './ModalShell';
import ConfirmModal from './ConfirmModal';

const NAME_MAX = 40;
const DELETE_DELAY_SECONDS = 5;

// Gestión de perfiles: cambiar el nombre y eliminar. El perfil Global (comandos globales) no se puede renombrar ni eliminar porque
// siempre se procesa. Se monta solo mientras está abierto, así la edición en curso no sobrevive al cierre.
export default function ProfilesModal({ profiles, games, onRename, onDelete, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, actions, events, isActive }

  const entries = Object.entries(profiles.list || {});
  const countOf = (p) => ({ actions: Object.keys(p.actions || {}).length, events: (p.events || []).length });

  const startEdit = (id, name) => { setEditingId(id); setDraft(name); setError(''); };
  const cancelEdit = () => { setEditingId(null); setError(''); };

  const saveEdit = () => {
    const name = draft.trim();
    if (!name) { setError('Escribe un nombre.'); return; }
    const clash = entries.some(([id, p]) => id !== editingId && String(p.name).trim().toLowerCase() === name.toLowerCase());
    if (clash) { setError('Ya existe un perfil con ese nombre.'); return; }
    if (name !== profiles.list[editingId].name) onRename(editingId, name);
    cancelEdit();
  };

  const askDelete = (id, p) => setDeleteTarget({ id, name: p.name, ...countOf(p), isActive: profiles.activeProfileId === id });

  const confirmDelete = () => {
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
      <ModalShell
        isOpen
        onClose={onClose}
        title={<><Icon name="layers" size={16} /> Gestionar perfiles</>}
        width="600px"
        footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}
      >
        <div className="prof-list">
          {entries.map(([id, p]) => {
            const n = countOf(p);
            const editing = editingId === id;
            const locked = !!p.isGlobal;
            return (
              <div className={`prof-item${profiles.activeProfileId === id ? ' active' : ''}`} key={id}>
                <div className="prof-main">
                  {editing ? (
                    <>
                      <input
                        className="key-input" type="text" value={draft} maxLength={NAME_MAX} autoFocus
                        aria-label="Nuevo nombre del perfil"
                        onChange={e => { setDraft(e.target.value); setError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); else if (e.key === 'Escape') { e.stopPropagation(); cancelEdit(); } }}
                      />
                      {error && <span className="prof-error"><Icon name="alert" size={13} /> {error}</span>}
                    </>
                  ) : (
                    <span className="prof-name ellipsis" title={p.name}>
                      {locked && <Icon name="lock" size={13} />} {p.isGlobal ? 'Global · ' : ''}{p.name}
                    </span>
                  )}
                  <span className="prof-meta">
                    {p.isGlobal ? 'Siempre activo' : (games?.[p.game]?.label || p.game || 'Sin juego')} · {n.actions} {n.actions === 1 ? 'acción' : 'acciones'} · {n.events} {n.events === 1 ? 'evento' : 'eventos'}
                    {profiles.activeProfileId === id && <b className="prof-chip">Activo</b>}
                  </span>
                </div>

                <div className="prof-actions">
                  {editing ? (
                    <>
                      <button className="icon-btn" onClick={saveEdit} title="Guardar nombre" aria-label="Guardar nombre"><Icon name="check" size={16} /></button>
                      <button className="icon-btn" onClick={cancelEdit} title="Cancelar" aria-label="Cancelar edición"><Icon name="x" size={16} /></button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-btn" disabled={locked} onClick={() => startEdit(id, p.name)}
                        title={locked ? 'El perfil Global no se puede renombrar' : 'Cambiar nombre'} aria-label={`Cambiar el nombre de ${p.name}`}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        className="icon-btn danger" disabled={locked} onClick={() => askDelete(id, p)}
                        title={locked ? 'El perfil Global no se puede eliminar' : 'Eliminar perfil'} aria-label={`Eliminar ${p.name}`}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ModalShell>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={<><Icon name="alert" size={18} /> Eliminar perfil</>}
        message={deleteTarget && (
          `¿Eliminar "${deleteTarget.name}"? Se borrarán sus ${deleteTarget.actions} ${deleteTarget.actions === 1 ? 'acción' : 'acciones'} y sus ${deleteTarget.events} ${deleteTarget.events === 1 ? 'evento' : 'eventos'}. ` +
          `Esto no se puede deshacer.${deleteTarget.isActive ? ' Es el perfil activo: pasarás al perfil Global.' : ''}`
        )}
        confirmDelaySeconds={DELETE_DELAY_SECONDS}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
