/**
 * Socket.IO server – room-based, scalable.
 * Clients join rooms only on relevant pages (e.g. event page, event management).
 * Use getIO() in routes to emit to specific rooms.
 */

const { Server } = require('socket.io');

const ROOM_PREFIX_EVENT = 'event:';
const PING_INTERVAL_MS = 25000;

let io = null;

/**
 * Initialize Socket.IO and attach to HTTP server.
 * @param {import('http').Server} server - HTTP server from createServer(app)
 * @param {object} corsOptions - CORS config for Socket.IO
 */
function initSocket(server, corsOptions = {}) {
    if (io) {
        return io;
    }

    io = new Server(server, {
        transports: ['websocket', 'polling'],
        cors: corsOptions.origin
            ? { origin: corsOptions.origin, credentials: true, methods: ['GET', 'POST'] }
            : {
                origin: process.env.NODE_ENV === 'production'
                    ? ['https://www.meridian.study', 'https://meridian.study']
                    : 'http://localhost:3000',
                credentials: true,
                methods: ['GET', 'POST'],
            },
    });

    io.on('connection', (socket) => {
        console.log('[WebSocket] client connected', { socketId: socket.id });

        let heartbeatInterval = null;

        const startHeartbeat = () => {
            heartbeatInterval = setInterval(() => {
                socket.emit('ping');
            }, PING_INTERVAL_MS);
        };

        const stopHeartbeat = () => {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
        };

        startHeartbeat();

        socket.on('pong', () => {
            // Heartbeat ack – connection alive
        });

        /** Join a room for a specific event (event page or event management). */
        socket.on('join-event', (payload) => {
            const eventId = payload?.eventId;
            if (!eventId || typeof eventId !== 'string') return;
            const room = ROOM_PREFIX_EVENT + eventId;
            socket.join(room);
        });

        /** Leave an event room. */
        socket.on('leave-event', (payload) => {
            const eventId = payload?.eventId;
            if (!eventId || typeof eventId !== 'string') return;
            const room = ROOM_PREFIX_EVENT + eventId;
            socket.leave(room);
        });

        socket.on('disconnect', (reason) => {
            console.log('[WebSocket] client disconnected', { socketId: socket.id, reason });
            stopHeartbeat();
        });
    });

    return io;
}

/**
 * Get the Socket.IO server instance. Call only after initSocket(server).
 * Use this in routes to emit to rooms, e.g. getIO().to('event:' + eventId).emit('event:update', data).
 */
function getIO() {
    return io;
}

/**
 * Emit an event to all clients in an event room (e.g. after check-in).
 * @param {string} eventId - Event ID
 * @param {string} eventName - Socket event name (e.g. 'event:check-in')
 * @param {object} payload - Data to send
 */
function emitToEventRoom(eventId, eventName, payload) {
    if (!io) return;
    const room = ROOM_PREFIX_EVENT + eventId;
    io.to(room).emit(eventName, payload);
}

module.exports = {
    initSocket,
    getIO,
    emitToEventRoom,
    ROOM_PREFIX_EVENT,
};
