import React, { useState, useEffect } from 'react';
import ModalShell from './ModalShell';

export default function StickerSettingsModal({ isOpen, sticker, assignment, actionType, onClose, onSave }) {
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const [repeatMode, setRepeatMode] = useState('once');
    const [repeatLimit, setRepeatLimit] = useState(1);
    const [playbackStyle, setPlaybackStyle] = useState('sequential');

    useEffect(() => {
        if (isOpen) {
            setCooldownSeconds(assignment?.cooldownSeconds || 0);
            setRepeatMode(assignment?.repeatMode || 'once');
            setRepeatLimit(assignment?.repeatLimit || 1);
            setPlaybackStyle(assignment?.playbackStyle || 'sequential');
        }
    }, [assignment, isOpen]);

    if (!isOpen || !sticker) return null;

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={`⚙️ Ajustes de "${sticker.name}"`}
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button
                        className="btn"
                        style={{ background: '#00bcd4', color: '#000', fontWeight: 'bold' }}
                        onClick={() => onSave({
                            cooldownSeconds: Math.max(0, parseInt(cooldownSeconds, 10) || 0),
                            repeatMode,
                            repeatLimit: Math.max(1, parseInt(repeatLimit, 10) || 1),
                            playbackStyle
                        })}
                    >
                        Guardar
                    </button>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                {actionType !== 'sound' && (
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>⏳ Enfriamiento por usuario</label>
                        <p style={{ fontSize: '12px', color: 'var(--text2)', margin: '0 0 8px' }}>
                            El mismo usuario no podrá volver a activar esto con este sticker hasta que pase este tiempo. 0 = sin enfriamiento.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="number" min="0" className="key-input" value={cooldownSeconds} onChange={e => setCooldownSeconds(e.target.value)} style={{ width: '100px' }} />
                            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>segundos</span>
                        </div>
                    </div>
                )}

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>🔁 Si mandan el mismo sticker varias veces en un solo comentario</label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input type="radio" checked={repeatMode === 'once'} onChange={() => setRepeatMode('once')} />
                            <span>Solo una vez, sin importar cuántas manden (recomendado)</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input type="radio" checked={repeatMode === 'all'} onChange={() => setRepeatMode('all')} />
                            <span>Reproducir todas, una tras otra</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input type="radio" checked={repeatMode === 'limited'} onChange={() => setRepeatMode('limited')} />
                            <span>Como máximo</span>
                            <input type="number" min="1" className="key-input" value={repeatLimit} disabled={repeatMode !== 'limited'} onChange={e => setRepeatLimit(e.target.value)} style={{ width: '70px' }} />
                            <span>veces</span>
                        </label>

                        {repeatMode === 'limited' && (
                            <div style={{ marginLeft: '26px', display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                    <input type="radio" checked={playbackStyle !== 'simultaneous'} onChange={() => setPlaybackStyle('sequential')} />
                                    <span>Una tras otra (recomendado)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                    <input type="radio" checked={playbackStyle === 'simultaneous'} onChange={() => setPlaybackStyle('simultaneous')} />
                                    <span>🎉 Todas a la vez (caótico, a propósito)</span>
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ModalShell>
    );
}