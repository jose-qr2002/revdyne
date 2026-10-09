import React, { useState } from 'react';
import Icon from './Icon';
import ModalShell from './ModalShell';
import { apiFetch } from '../services/api';

// Lista inicial que ofrece el botón "Agregar lista sugerida"
const SUGGESTED_TERMS = ['puta', 'puto', 'mierda', 'maricon', 'pendejo', 'cabron', 'pinga', 'verga', 'conchatumadre', 'malparido'];

const parseTerms = (text) => [...new Set(text.split(/[\n,]/).map(t => t.trim()).filter(Boolean))];

function Row({ icon, title, hint, checked, onChange, children }) {
  return (
    <div className="tts-anti-item">
      <div className="tts-row">
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span><Icon name={icon} size={15} /> {title}</span>
          <span style={{ fontSize: '10px', color: 'var(--text2)' }}>{hint}</span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
          <span className="slider"></span>
        </label>
      </div>
      {checked && children}
    </div>
  );
}

// Modal "Anti spam" del Bot TTS. Se monta solo cuando está abierto, así sus borradores (lista de palabras, prueba de frase)
// parten siempre de lo guardado.
export default function TTSAntispamModal({ tts, onChange, onClose }) {
  const [blockedTermsText, setBlockedTermsText] = useState((tts.blockedTerms || []).join('\n'));
  const [filterTestText, setFilterTestText] = useState('');
  const [filterTestResult, setFilterTestResult] = useState(null);

  const saveBlockedTerms = (text = blockedTermsText) => onChange({ blockedTerms: parseTerms(text) });

  const addSuggestedTerms = () => {
    const merged = [...new Set([...parseTerms(blockedTermsText), ...SUGGESTED_TERMS])].join('\n');
    setBlockedTermsText(merged);
    saveBlockedTerms(merged);
  };

  const runFilterTest = async () => {
    const res = await apiFetch('/api/tts/filter-test', 'POST', { text: filterTestText, terms: parseTerms(blockedTermsText) });
    setFilterTestResult(res);
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={<><Icon name="shield" size={16} /> Anti spam</>}
      width="560px"
      footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}
    >
      <div className="tts-anti">
        <Row icon="shield" title="Filtro Anti-Spam (Idiomas)" hint="Bloquea ruso, georgiano, árabe, etc."
          checked={tts.onlyLatin || false} onChange={v => onChange({ onlyLatin: v })} />

        <Row icon="repeat" title="Ignorar mensajes repetidos" hint="Si un usuario repite lo mismo, solo se lee la primera vez"
          checked={tts.blockDuplicates || false} onChange={v => onChange({ blockDuplicates: v })}>
          <div className="tts-row tts-anti-sub">
            <label style={{ fontSize: '12px' }}>Ignorar el mismo texto durante</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="number" min="1" className="key-input" style={{ width: '80px' }}
                defaultValue={tts.duplicateWindowSec ?? 30}
                onBlur={e => onChange({ duplicateWindowSec: Math.max(1, parseInt(e.target.value, 10) || 30) })} />
              <span style={{ fontSize: '12px', color: 'var(--text2)' }}>segundos</span>
            </div>
          </div>
        </Row>

        <Row icon="clock" title="Modo lento por usuario" hint="Tiempo mínimo entre dos mensajes leídos del mismo usuario"
          checked={tts.slowModeEnabled || false} onChange={v => onChange({ slowModeEnabled: v })}>
          <div className="tts-row tts-anti-sub">
            <label style={{ fontSize: '12px' }}>Esperar</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="number" min="0" step="100" className="key-input" style={{ width: '90px' }}
                defaultValue={tts.slowModeMs ?? 3000}
                onBlur={e => onChange({ slowModeMs: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
              <span style={{ fontSize: '12px', color: 'var(--text2)' }}>ms</span>
            </div>
          </div>
        </Row>

        <Row icon="ban" title="Bloquear palabras soeces" hint="El mensaje completo se omite, no se lee"
          checked={tts.profanityFilter || false} onChange={v => onChange({ profanityFilter: v })}>
          <div className="tts-anti-sub" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text2)' }}>Palabras a bloquear (una por línea)</label>
            <textarea
              className="key-input" rows={6}
              value={blockedTermsText}
              onChange={e => setBlockedTermsText(e.target.value)}
              onBlur={() => saveBlockedTerms()}
              placeholder={'puta\npinga\nmariquicon'}
              style={{ width: '100%', fontFamily: 'monospace', resize: 'vertical' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
              <Icon name="info" size={15} /> Escribe la palabra normal. El filtro ya detecta mayúsculas, acentos, letras repetidas,
              espacios entre letras ("p u t a"), números por letras ("pu7a") y la h muda ("putha").
              Si usan sílabas partidas (ej. "mari qui con"), agrega esa variante: <code>mariquicon</code>.
            </div>
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addSuggestedTerms}>
              <Icon name="plus" size={15} /> Agregar lista sugerida
            </button>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input type="text" className="key-input" placeholder="Prueba una frase..." value={filterTestText}
                onChange={e => { setFilterTestText(e.target.value); setFilterTestResult(null); }} style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={runFilterTest}>Probar</button>
            </div>
            {filterTestResult && (
              <div style={{ fontSize: '12px', color: filterTestResult.blocked ? '#ff4d4d' : '#4caf50' }}>
                {filterTestResult.blocked ? <><Icon name="ban" size={15} /> Se bloquearía (coincide con "{filterTestResult.term}")</> : <><Icon name="check" size={15} /> Se leería normal</>}
              </div>
            )}
          </div>
        </Row>
      </div>
    </ModalShell>
  );
}
