import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [status, setStatus] = useState({ connected: false, message: 'Desconectado', username: '' });
  const [events, setEvents] = useState([]);
  const [ttsEvents, setTtsEvents] = useState([]); // NUEVO: Estado para el chat
  // NUEVO: Estado para atrapar regalos nuevos
  const [newGift, setNewGift] = useState(null);

  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io('/');

    socketRef.current.on('status', (data) => setStatus(prev => ({ ...prev, ...data })));

    socketRef.current.on('giftReceived', (data) => {
      setEvents(prev => {
        // Una racha de regalos llega en varios eventos con el mismo groupId: se muestra UNA línea que va subiendo
        // (Rose ×24) en vez de una por incremento (x2, x6, x8...).
        const total = data.streakTotal ?? data.newCount;
        if (data.groupId && data.groupId !== '0') {
          const i = prev.findIndex(e => e.groupId === data.groupId && e.giftId === data.giftId && e.sender === data.sender);
          if (i !== -1) {
            const old = prev[i];
            const merged = { ...old, ...data, newCount: total, pressed: old.pressed || data.pressed, key: data.key !== 'Ninguna' ? data.key : old.key, timestamp: old.timestamp };
            const copy = [...prev]; copy[i] = merged; return copy;
          }
        }
        return [{ ...data, newCount: total }, ...prev].slice(0, 100);
      });
    });

    // NUEVO: Escuchar los comentarios del TTS
    socketRef.current.on('ttsComment', (data) => {
      setTtsEvents(prev => [data, ...prev].slice(0, 80)); // Guardamos los últimos 80
    });

    // NUEVO: Escuchar cuando el backend avisa de un regalo que no tenías mapeado
    socketRef.current.on('newGift', (data) => {
      setNewGift(data);
    });

    return () => socketRef.current.disconnect();
  }, []);

  const clearEvents = () => setEvents([]);

  // Retornamos también ttsEvents
  return { socket: socketRef.current, status, events, ttsEvents, newGift, clearEvents };
}