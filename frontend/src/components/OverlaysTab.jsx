import React, { useState } from 'react';
import GoalCard from './GoalCard';

const GOALS = [
  { kind: 'likes', label: 'Meta de likes' },
  { kind: 'followers', label: 'Meta de seguidores' },
  { kind: 'shares', label: 'Meta de compartidas' },
  { kind: 'viewers', label: 'Meta de espectadores' },
];

export default function OverlaysTab({ socket, profiles }) {
  const [kind, setKind] = useState('likes');

  return (
    <div className="lk-wrap">
      <div className="lk-kinds" role="tablist" aria-label="Tipo de meta">
        {GOALS.map(g => (
          <button key={g.kind} className={kind === g.kind ? 'active' : ''} onClick={() => setKind(g.kind)}>{g.label}</button>
        ))}
      </div>
      <GoalCard key={kind} kind={kind} socket={socket} profiles={profiles} />
    </div>
  );
}
