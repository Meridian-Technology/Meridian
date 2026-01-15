// src/WebSocketContext.js
import React, { createContext, useContext, useEffect, useRef } from 'react';
// WEBSOCKET DISABLED - Uncomment to enable WebSocket functionality
// import { io } from 'socket.io-client';

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
  return useContext(WebSocketContext);
};

export const WebSocketProvider = ({ children }) => {
  const socketRef = useRef();

  // WEBSOCKET DISABLED - Uncomment to enable WebSocket functionality
  // useEffect(() => {
  //   // Create the socket connection
  //   socketRef.current = io(
  //     process.env.NODE_ENV === 'production'
  //       ? 'https://www.meridian.study'
  //       : 'http://localhost:5001',
  //     {
  //       transports: ['websocket'], // Force WebSocket transport
  //     }
  //   );

  //   // Clean up on component unmount
  //   return () => {
  //     socketRef.current.disconnect();
  //   };
  // }, []);

  // WEBSOCKET DISABLED - Uncomment to enable WebSocket functionality
  // Helper functions
  const emit = (eventName, data) => {
    // socketRef.current.emit(eventName, data);
    console.warn('WebSocket is disabled. emit() called with:', eventName, data);
  };

  const on = (eventName, callback) => {
    // socketRef.current.on(eventName, callback);
    console.warn('WebSocket is disabled. on() called with:', eventName);
  };

  const off = (eventName, callback) => {
    // socketRef.current.off(eventName, callback);
    console.warn('WebSocket is disabled. off() called with:', eventName);
  };

  return (
    <WebSocketContext.Provider value={{ emit, on, off }}>
      {children}
    </WebSocketContext.Provider>
  );
};
