const crypto = require('crypto');
const logger = require('../utils/logger');
const { authenticateSocket, SOCKET_AUTH_REQUIRED } = require('../middlewares/socketAuthMiddleware');

let _io = null;

const requireSocketAuth = (socket) => {
  if (socket.data && socket.data.user) {
    return true;
  }

  socket.emit('error', {
    type: SOCKET_AUTH_REQUIRED,
    message: 'Vui lòng đăng nhập để sử dụng chat.',
    timestamp: new Date().toISOString(),
  });
  return false;
};

const initializeSocketHandlers = (io) => {
  _io = io;
  logger.info('Initializing Socket.IO handlers...');

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const clientIP = socket.handshake.address;
    const userAgent = socket.handshake.headers['user-agent'];

    logger.info({ socketId: socket.id, clientIP }, 'New client connected');

    const clientCount = io.sockets.sockets.size;
    logger.info({ socketId: socket.id, clientCount }, 'Total connected clients');

    socket.emit('welcome', {
      message: 'Connected to Smart AI Backend',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      serverInfo: {
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    });

    socket.broadcast.emit('userCount', { count: clientCount });

    socket.on('sendMessage', async (data, ack) => {
      await handleSendMessage(socket, data, ack);
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    socket.on('joinRoom', (roomId) => {
      handleJoinRoom(socket, roomId);
    });

    socket.on('leaveRoom', (roomId) => {
      handleLeaveRoom(socket, roomId);
    });

    socket.on('disconnect', (reason) => {
      handleDisconnect(socket, reason);
    });

    socket.on('error', (error) => {
      handleSocketError(socket, error);
    });

    socket.on('typing', (data) => {
      handleTyping(socket, data);
    });

    socket.on('stopTyping', (data) => {
      handleStopTyping(socket, data);
    });
  });

  io.on('connect_error', (error) => {
    logger.error({ err: error }, 'Socket.IO connection error');
  });

  logger.info('Socket.IO handlers initialized successfully');
};


const handleSendMessage = async (socket, data, ack) => {
  // One submission, one correlation id, one ack, one terminal error.
  let clientMessageId = null;
  let userId = null;
  let sessionId = null;

  const emitAck = (payload) => {
    if (typeof ack === 'function') {
      ack(payload);
    }
  };

  try {
    if (!requireSocketAuth(socket)) {
      return;
    }

    // Trusted identity comes exclusively from socket.data.user (set by the
    // socket auth middleware). Never from the client payload.
    userId = socket.data.user.id;
    sessionId = data?.sessionId;

    logger.info({
      socketId: socket.id,
      sessionId,
      messageLength: data?.message?.length || 0,
      hasClientMessageId: !!data?.clientMessageId,
      timestamp: new Date().toISOString()
    }, 'Received message');

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Resolve the correlation id. A well-formed client UUID is used as-is; a
    // legacy client that omits it gets a server-generated UUID (structured
    // warning, never a hard reject) so it keeps working; an explicitly supplied
    // but malformed id is rejected.
    const rawClientMessageId = data?.clientMessageId;
    if (rawClientMessageId === undefined || rawClientMessageId === null) {
      clientMessageId = crypto.randomUUID();
      logger.warn({
        socketId: socket.id,
        sessionId,
        clientMessageId
      }, 'Client did not send clientMessageId; server generated one');
    } else if (typeof rawClientMessageId === 'string' && uuidRegex.test(rawClientMessageId)) {
      clientMessageId = rawClientMessageId;
    } else {
      emitAck({
        accepted: false,
        duplicate: false,
        status: 'invalid',
        clientMessageId: typeof rawClientMessageId === 'string' ? rawClientMessageId : null
      });
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'clientMessageId không hợp lệ. Cần UUID.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Validation (existing behavior preserved, ack sent where practical)
    if (!data || !sessionId || !data.message) {
      emitAck({ accepted: false, duplicate: false, status: 'invalid', clientMessageId });
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ. Cần sessionId và message.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!uuidRegex.test(sessionId)) {
      emitAck({ accepted: false, duplicate: false, status: 'invalid', clientMessageId });
      socket.emit('error', {
        type: 'INVALID_SESSION',
        message: 'Session ID không hợp lệ.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (data.message.trim().length === 0) {
      emitAck({ accepted: false, duplicate: false, status: 'invalid', clientMessageId });
      socket.emit('error', {
        type: 'EMPTY_MESSAGE',
        message: 'Tin nhắn không thể để trống.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (data.message.length > 1000) {
      emitAck({ accepted: false, duplicate: false, status: 'invalid', clientMessageId });
      socket.emit('error', {
        type: 'MESSAGE_TOO_LONG',
        message: 'Tin nhắn quá dài (tối đa 1000 ký tự).',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Deduplicate: only the first submitter of a given clientMessageId (scoped
    // to this trusted user + session) is accepted. Duplicates are answered with
    // the stored result (replayed aiResponse) or a processing status — never
    // reprocessed and never emitted twice.
    const chatMessageDedup = require('../services/chatMessageDedupService');
    const claim = await chatMessageDedup.claim(userId, sessionId, clientMessageId);

    if (claim && claim.claimed === false) {
      // Completed duplicate: acknowledge FIRST (one ack), then replay the cached
      // aiResponse exactly once. Pipeline is never run and nothing is persisted.
      const isCompleted = claim.duplicate && claim.state === 'completed';
      emitAck({
        accepted: false,
        duplicate: true,
        status: isCompleted ? 'completed' : 'processing',
        clientMessageId
      });
      if (isCompleted && claim.payload) {
        const aiPayload = chatMessageDedup.revivePayload(claim.payload);
        if (aiPayload) {
          socket.emit('aiResponse', aiPayload);
        }
      }
      return;
    }

    // The ack is a DELIVERY/DEDUP acknowledgement, not a completion signal.
    // Deliver it FIRST (once, exactly once) after a successful claim, then the
    // 'started' progress signal, then run the AI pipeline — so the ack never
    // waits for generation and never follows the started event.
    emitAck({ accepted: true, duplicate: false, status: 'accepted', clientMessageId });

    socket.emit('messageProcessing', {
      sessionId,
      clientMessageId,
      status: 'started',
      timestamp: new Date().toISOString()
    });

    // Import và sử dụng ChatController
    const chatController = require('../controllers/chatController');

    // Process message through full RAG pipeline
    const result = await chatController.processMessage(socket, {
      ...data,
      clientMessageId
    });

    // Emit processing completed
    socket.emit('messageProcessing', {
      sessionId,
      clientMessageId,
      status: 'completed',
      processingTime: result.processingTime,
      timestamp: new Date().toISOString()
    });

    // Remember the emitted aiResponse payload keyed by clientMessageId so a
    // duplicate resubmission of the same id replays the exact same response
    // instead of reprocessing. If no payload was produced, release the claim.
    if (result && result.aiPayload) {
      try {
        await chatMessageDedup.markCompleted(userId, sessionId, clientMessageId, result.aiPayload);
      } catch (_storeErr) {
        // a dedup-store failure must not turn a successful generation into an error
      }
    } else {
      try {
        await chatMessageDedup.release(userId, sessionId, clientMessageId);
      } catch (_storeErr) {
        // same: ignore store failure after a successful response
      }
    }

    // NO second ack here: the 'accepted' ack was already delivered and the final
    // success is signaled via aiResponse + messageProcessing 'completed'.

  } catch (error) {
    logger.error({ err: error, sessionId }, 'Error processing message');

    // One failed generation -> exactly one correlated terminal error event, and
    // the claim is released so a legitimate retry can reprocess later.
    const chatMessageDedup = require('../services/chatMessageDedupService');
    if (userId && sessionId && clientMessageId) {
      try {
        await chatMessageDedup.release(userId, sessionId, clientMessageId);
      } catch (_err) {
        // releasing a claim must never mask the original failure
      }
    }

    const errorPayload = {
      type: 'PROCESSING_ERROR',
      message: 'Lỗi khi xử lý tin nhắn. Vui lòng thử lại sau.',
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
    if (clientMessageId) {
      errorPayload.clientMessageId = clientMessageId;
    }
    // The 'accepted' ack was already delivered — do NOT ack again. Terminal
    // failure is signaled by exactly one correlated error event plus a
    // messageProcessing 'error' progress signal.
    socket.emit('error', errorPayload);
    socket.emit('messageProcessing', {
      sessionId,
      clientMessageId,
      status: 'error',
      timestamp: new Date().toISOString()
    });
  }
};

const handleJoinRoom = (socket, roomId) => {
  try {
    if (!requireSocketAuth(socket)) {
      return;
    }

    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error', {
        type: 'INVALID_ROOM',
        message: 'Room ID không hợp lệ.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    socket.join(roomId);
    logger.info({ socketId: socket.id, roomId }, 'Socket joined room');

    socket.emit('roomJoined', {
      roomId: roomId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ err: error }, 'Error joining room');
    socket.emit('error', {
      type: 'ROOM_JOIN_ERROR',
      message: 'Không thể tham gia room.',
      timestamp: new Date().toISOString()
    });
  }
};


const handleLeaveRoom = (socket, roomId) => {
  try {
    if (!requireSocketAuth(socket)) {
      return;
    }

    if (roomId) {
      socket.leave(roomId);
      logger.info({ socketId: socket.id, roomId }, 'Socket left room');

      socket.emit('roomLeft', {
        roomId: roomId,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error leaving room');
  }
};


const handleTyping = (socket, data) => {
  if (!requireSocketAuth(socket)) {
    return;
  }

  if (data && data.sessionId) {
    socket.broadcast.emit('userTyping', {
      sessionId: data.sessionId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  }
};


const handleStopTyping = (socket, data) => {
  if (!requireSocketAuth(socket)) {
    return;
  }

  if (data && data.sessionId) {
    socket.broadcast.emit('userStoppedTyping', {
      sessionId: data.sessionId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  }
};


const handleDisconnect = (socket, reason) => {
  logger.info({ socketId: socket.id, reason }, 'Client disconnected');

  if (process.env.NODE_ENV === 'development') {
    logger.info({
      socketId: socket.id,
      reason: reason,
      timestamp: new Date().toISOString(),
      connectionDuration: Date.now() - (socket.connectedAt || Date.now())
    }, 'Disconnect details');
  }

  const clientCount = socket.server.sockets.sockets.size;
  socket.broadcast.emit('userCount', { count: clientCount });
};


const handleSocketError = (socket, error) => {
  logger.error({ err: error }, 'Socket error');

  if (process.env.NODE_ENV === 'development') {
    logger.error({
      socketId: socket.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, 'Socket error details');
  }

  socket.emit('error', {
    type: 'SOCKET_ERROR',
    message: 'Đã xảy ra lỗi kết nối.',
    timestamp: new Date().toISOString()
  });
};

const getSocketStats = (io) => {
  const sockets = io.sockets.sockets;
  const connectedClients = sockets.size;

  const rooms = {};
  for (const [socketId, socket] of sockets) {
    socket.rooms.forEach(room => {
      if (room !== socketId) { // Exclude default room (socket's own room)
        rooms[room] = (rooms[room] || 0) + 1;
      }
    });
  }

  return {
    connectedClients,
    totalRooms: Object.keys(rooms).length,
    rooms: rooms,
    serverUptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
};


const shutdownSocketIO = () => {
  return new Promise((resolve) => {
    const io = _io;
    if (!io) {
      logger.warn('Socket.IO not initialized, skipping shutdown');
      resolve();
      return;
    }

    logger.info('Shutting down Socket.IO connections...');

    io.emit('serverShutdown', {
      message: 'Server đang bảo trì. Vui lòng kết nối lại sau.',
      timestamp: new Date().toISOString()
    });

    io.sockets.sockets.forEach(socket => {
      socket.disconnect(true);
    });

    io.close(() => {
      logger.info('Socket.IO server closed');
      resolve();
    });
  });
};

module.exports = {
  initializeSocketHandlers,
  getSocketStats,
  shutdownSocketIO
};
