/**
 * Socket.IO server – room-based, scalable.
 * Clients join rooms only on relevant pages (e.g. event page, event management).
 * Use getIO() in routes to emit to specific rooms.
 */

const { Server } = require('socket.io');

const ROOM_PREFIX_EVENT = 'event:';
const ROOM_PREFIX_ORG_APPROVAL = 'org-approval:';
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
        pingInterval: PING_INTERVAL_MS,
        pingTimeout: 10000, // disconnect if no pong within 10s (frees server memory for dead clients)
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
        socket.connectedAt = Date.now();
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

        /** Join room for org approval (pending orgs only – client leaves when approved). */
        socket.on('join-org-approval', (payload) => {
            const orgId = payload?.orgId;
            if (!orgId || typeof orgId !== 'string') return;
            const room = ROOM_PREFIX_ORG_APPROVAL + orgId;
            socket.join(room);
        });

        /** Leave org approval room. */
        socket.on('leave-org-approval', (payload) => {
            const orgId = payload?.orgId;
            if (!orgId || typeof orgId !== 'string') return;
            const room = ROOM_PREFIX_ORG_APPROVAL + orgId;
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

/**
 * Emit to all clients in an org-approval room (e.g. when admin manually approves an org).
 * Only unapproved orgs join this room; they leave after receiving org:approved.
 * @param {string} orgId - Org ID
 * @param {string} eventName - Socket event name (e.g. 'org:approved')
 * @param {object} payload - Data to send
 */
function emitToOrgApprovalRoom(orgId, eventName, payload) {
    if (!io) return;
    const room = ROOM_PREFIX_ORG_APPROVAL + orgId;
    io.to(room).emit(eventName, payload);
}

/**
 * Get all connected sockets for admin inspection.
 * @returns {Array<{ socketId: string, rooms: string[], connectedAt: number }>}
 */
function getConnections() {
    if (!io) return [];
    const sockets = io.sockets.sockets;
    return Array.from(sockets.values())
        .filter((s) => s.connected)
        .map((s) => ({
            socketId: s.id,
            rooms: Array.from(s.rooms).filter((r) => r !== s.id),
            connectedAt: s.connectedAt || 0,
        }));
}

/**
 * Disconnect a specific socket by ID.
 * @param {string} socketId
 * @returns {boolean} true if disconnected, false if not found
 */
function disconnectSocket(socketId) {
    if (!io) return false;
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return false;
    socket.disconnect(true);
    return true;
}

/**
 * Disconnect all connected sockets.
 * @returns {number} count of disconnected sockets
 */
function disconnectAll() {
    if (!io) return 0;
    const sockets = io.sockets.sockets;
    let count = 0;
    for (const socket of sockets.values()) {
        if (socket.connected) {
            socket.disconnect(true);
            count++;
        }
    }
    return count;
}

module.exports = {
    initSocket,
    getIO,
    emitToEventRoom,
    emitToOrgApprovalRoom,
    getConnections,
    disconnectSocket,
    disconnectAll,
    ROOM_PREFIX_EVENT,
    ROOM_PREFIX_ORG_APPROVAL,
};
