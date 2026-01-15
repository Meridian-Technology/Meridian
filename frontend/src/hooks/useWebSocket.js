import { useEffect, useState, useCallback, useMemo } from 'react';
// WEBSOCKET DISABLED - Uncomment to enable WebSocket functionality
// import io from 'socket.io-client';

const useWebSocket = (events) => {
    const [socket, setSocket] = useState(null);

    // Memoize the events object to avoid unnecessary re-renders
    const memoizedEvents = useMemo(() => events, [events]);

    // WEBSOCKET DISABLED - Uncomment to enable WebSocket functionality
    // useEffect(() => {
    //     const socketIo = io(); // Using relative URL
    //     setSocket(socketIo);

    //     // // Register event handlers
    //     // Object.keys(memoizedEvents).forEach(event => {
    //     //     socketIo.on(event, memoizedEvents[event]);
    //     // });

    //     // Heartbeat mechanism
    //     const heartbeatInterval = setInterval(() => {
    //         if (socketIo) {
    //             socketIo.emit('ping');
    //         }
    //     }, 25000); // Send ping every 25 seconds

    //     // Cleanup on unmount
    //     return () => {
    //         clearInterval(heartbeatInterval);
    //         Object.keys(memoizedEvents).forEach(event => {
    //             socketIo.off(event, memoizedEvents[event]);
    //         });
    //         socketIo.disconnect();
    //     };
    // }, [memoizedEvents]);

    const sendMessage = useCallback((event, message) => {
        // WEBSOCKET DISABLED - Uncomment to enable WebSocket functionality
        // if (socket) {
        //     socket.emit(event, message);
        // }
        console.warn('WebSocket is disabled. sendMessage() called with:', event, message);
    }, [socket]);

    return { sendMessage, socket };
};

export default useWebSocket;
