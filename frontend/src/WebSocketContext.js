// src/WebSocketContext.js
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
  return useContext(WebSocketContext);
};

export const WebSocketProvider = ({ children }) => {
  const socketRef = useRef();

  useEffect(() => {
    // Create the socket connection
    socketRef.current = io(
      process.env.NODE_ENV === 'production'
        ? 'https://www.meridian.study'
        : 'http://localhost:5001',
      {
        transports: ['websocket'], // Force WebSocket transport
      }
    );

    // Clean up on component unmount
    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Helper functions
  const emit = (eventName, data) => {
    socketRef.current.emit(eventName, data);
  };

  const on = (eventName, callback) => {
    socketRef.current.on(eventName, callback);
  };

  const off = (eventName, callback) => {
    socketRef.current.off(eventName, callback);
  };

  return (
    <WebSocketContext.Provider value={{ emit, on, off }}>
      {children}
    </WebSocketContext.Provider>
  );
};
