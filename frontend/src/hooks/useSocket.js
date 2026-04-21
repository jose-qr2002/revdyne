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
      setEvents(prev => [data, ...prev].slice(0, 100));
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