import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import RankingCard from './RankingCard';
import PortNotice from './PortNotice';

// Sección "Top 10": 4 métricas × (directo | del día | del mes) = 12 overlays
const METRICS = [
  { id: 'gifters', label: 'Donadores' },
  { id: 'likes', label: 'Likes' },
  { id: 'comments', label: 'Comentarios' },
  { id: 'shares', label: 'Compartidas' },
];

const PERIODS = [
  { id: 'live', label: 'Del directo' },
  { id: 'day', label: 'Del día' },
  { id: 'month', label: 'Del mes' },
];

export default function RankingsTab({ socket }) {
  const [boards, setBoards] = useState([]);
  const [metric, setMetric] = useState('gifters');
  const [period, setPeriod] = useState('live');

  useEffect(() => {
    apiFetch('/api/overlays/ranking').then(res => { if (res?.boards) setBoards(res.boards); });
  }, []);

  const board = boards.find(b => b.metric === metric && b.period === period);

  return (
    <div className="lk-wrap">
      <PortNotice />
      <div className="lk-kinds" role="tablist" aria-label="Métrica del top">
        {METRICS.map(m => (
          <button key={m.id} className={metric === m.id ? 'active' : ''} onClick={() => setMetric(m.id)}>{m.label}</button>
        ))}
      </div>
      <div className="lk-kinds" role="tablist" aria-label="Periodo del top">
        {PERIODS.map(p => (
          <button key={p.id} className={period === p.id ? 'active' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>
      {board
        ? <RankingCard key={board.kind} board={board} metricLabel={METRICS.find(m => m.id === metric).label} socket={socket} />
        : <div className="empty-state"><p>Cargando…</p></div>}
    </div>
  );
}
