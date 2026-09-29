import { useState, useEffect } from 'react';

const VALID = /^[a-z0-9_.]{2,24}$/i;

export function useProfilePreview(username, delayMs = 900) {
  const [state, setState] = useState({ status: 'idle', profile: null });

  useEffect(() => {
    const clean = (username || '').replace(/^@/, '').trim();

    if (clean.length < 2) { setState({ status: 'idle', profile: null }); return; }
    if (!VALID.test(clean)) { setState({ status: 'invalid', profile: null }); return; }

    setState({ status: 'waiting', profile: null });
    let cancelled = false;

    const timer = setTimeout(async () => {
      setState({ status: 'loading', profile: null });
      try {
        const res = await fetch(`/api/profile-preview?username=${encodeURIComponent(clean)}`);
        const data = await res.json();
        if (cancelled) return; // el usuario siguió escribiendo: se descarta la respuesta vieja

        if (data.found) setState({ status: 'found', profile: data.profile });
        else if (data.code === 'NOT_FOUND') setState({ status: 'notfound', profile: null });
        else if (data.code !== 'SUPERSEDED') setState({ status: 'unavailable', profile: null });
      } catch {
        if (!cancelled) setState({ status: 'unavailable', profile: null });
      }
    }, delayMs);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [username, delayMs]);

  return state;
}