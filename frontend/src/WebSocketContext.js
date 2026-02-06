/**
 * WebSocket (Socket.IO) context – lazy connection, room-based.
 * Clients connect only when a relevant page enrolls (e.g. event page, event management).
 * Use useEventRoom(eventId, onEvent) on those pages to join the event room and receive live updates.
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const WebSocketContext = createContext(null);

const SOCKET_URL =
  process.env.NODE_ENV === 'production'
    ? (window.location.origin || 'https://www.meridian.study')
    : 'http://localhost:5001';

const EVENT_ROOM_JOIN = 'join-event';
const EVENT_ROOM_LEAVE = 'leave-event';
const SOCKET_EVENT_CHECK_IN = 'event:check-in';

export const useWebSocket = () => useContext(WebSocketContext);

/**
 * Subscribe to an event room and receive live updates (e.g. check-ins).
 * Call only when on a relevant page (event page or event management).
 * Connects lazily on first subscribe; leaves room on unmount or when eventId changes.
 *
 * @param {string|null|undefined} eventId - Event ID to subscribe to
 * @param {(payload: object) => void} onEvent - Callback for event:check-in payloads
 */
export function useEventRoom(eventId, onEvent) {
  const ctx = useContext(WebSocketContext);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  React.useEffect(() => {
    if (!eventId || !ctx) return;
    ctx.subscribeEvent(eventId, (payload) => {
      if (onEventRef.current) onEventRef.current(payload);
    });
    return () => {
      ctx.unsubscribeEvent(eventId);
    };
  }, [eventId, ctx]);
}

export const WebSocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const eventRoomsRef = useRef(new Map());

  const ensureConnected = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('ping', () => socket.emit('pong'));

    socketRef.current = socket;
    return socket;
  }, []);

  const subscribeEvent = useCallback((eventId, onUpdate) => {
    const socket = ensureConnected();
    const room = `event:${eventId}`;
    const handler = (payload) => {
      try {
        onUpdate(payload);
      } catch (e) {
        console.error('WebSocket event handler error:', e);
      }
    };

    socket.emit(EVENT_ROOM_JOIN, { eventId });
    socket.on(SOCKET_EVENT_CHECK_IN, handler);

    const prev = eventRoomsRef.current.get(eventId);
    if (prev) {
      socket.off(SOCKET_EVENT_CHECK_IN, prev.handler);
    }
    eventRoomsRef.current.set(eventId, { handler, count: (prev?.count ?? 0) + 1 });
  }, [ensureConnected]);

  const unsubscribeEvent = useCallback((eventId) => {
    const entry = eventRoomsRef.current.get(eventId);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) {
      eventRoomsRef.current.delete(eventId);
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.off(SOCKET_EVENT_CHECK_IN, entry.handler);
        socket.emit(EVENT_ROOM_LEAVE, { eventId });
      }
    }
  }, []);

  const value = {
    connected,
    subscribeEvent,
    unsubscribeEvent,
    ensureConnected,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
