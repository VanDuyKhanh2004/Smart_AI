
const initializeSocketHandlers = (io) => {
  console.log('Initializing Socket.IO handlers...');

  io.on('connection', (socket) => {
    const clientIP = socket.handshake.address;
    const userAgent = socket.handshake.headers['user-agent'];
    
    console.log(`New client connected: ${socket.id} from ${clientIP}`);
    
    const clientCount = io.sockets.sockets.size;
    console.log(`Total connected clients: ${clientCount}`);

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

    socket.on('sendMessage', async (data) => {
      await handleSendMessage(socket, data);
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
    console.error('Socket.IO connection error:', error);
  });

  console.log('Socket.IO handlers initialized successfully');
};


const handleSendMessage = async (socket, data) => {
  try {
    console.log(`Received message from ${socket.id}:`, {
      sessionId: data?.sessionId,
      messageLength: data?.message?.length || 0,
      timestamp: new Date().toISOString()
    });

    // Validation
    if (!data || !data.sessionId || !data.message) {
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ. Cần sessionId và message.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(data.sessionId)) {
      socket.emit('error', {
        type: 'INVALID_SESSION',
        message: 'Session ID không hợp lệ.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (data.message.trim().length === 0) {
      socket.emit('error', {
        type: 'EMPTY_MESSAGE',
        message: 'Tin nhắn không thể để trống.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (data.message.length > 1000) {
      socket.emit('error', {
        type: 'MESSAGE_TOO_LONG',
        message: 'Tin nhắn quá dài (tối đa 1000 ký tự).',
        timestamp: new Date().toISOString()
      });
      return;
    }

    socket.emit('messageProcessing', {
      sessionId: data.sessionId,
      status: 'started',
      timestamp: new Date().toISOString()
    });

    // Import và sử dụng ChatController
    const chatController = require('../controllers/chatController');
    
    // Process message through full RAG pipeline
    const result = await chatController.processMessage(socket, data);
    
    // Emit processing completed
    socket.emit('messageProcessing', {
      sessionId: data.sessionId,
      status: 'completed',
      processingTime: result.processingTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing message:', error);
    
    socket.emit('error', {
      type: 'PROCESSING_ERROR',
      message: 'Lỗi khi xử lý tin nhắn. Vui lòng thử lại sau.',
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const handleJoinRoom = (socket, roomId) => {
  try {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error', {
        type: 'INVALID_ROOM',
        message: 'Room ID không hợp lệ.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
    
    socket.emit('roomJoined', {
      roomId: roomId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error joining room:', error);
    socket.emit('error', {
      type: 'ROOM_JOIN_ERROR',
      message: 'Không thể tham gia room.',
      timestamp: new Date().toISOString()
    });
  }
};


const handleLeaveRoom = (socket, roomId) => {
  try {
    if (roomId) {
      socket.leave(roomId);
      console.log(`Socket ${socket.id} left room: ${roomId}`);
      
      socket.emit('roomLeft', {
        roomId: roomId,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error leaving room:', error);
  }
};


const handleTyping = (socket, data) => {
  if (data && data.sessionId) {
    socket.broadcast.emit('userTyping', {
      sessionId: data.sessionId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  }
};


const handleStopTyping = (socket, data) => {
  if (data && data.sessionId) {
    socket.broadcast.emit('userStoppedTyping', {
      sessionId: data.sessionId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  }
};


const handleDisconnect = (socket, reason) => {
  console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`Disconnect details:`, {
      socketId: socket.id,
      reason: reason,
      timestamp: new Date().toISOString(),
      connectionDuration: Date.now() - (socket.connectedAt || Date.now())
    });
  }

  const clientCount = socket.server.sockets.sockets.size;
  socket.broadcast.emit('userCount', { count: clientCount });
};


const handleSocketError = (socket, error) => {
  console.error(`Socket error for ${socket.id}:`, error);
  
  if (process.env.NODE_ENV === 'development') {
    console.error('Socket error details:', {
      socketId: socket.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
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


const shutdownSocketIO = (io) => {
  console.log('Shutting down Socket.IO connections...');
  
  io.emit('serverShutdown', {
    message: 'Server đang bảo trì. Vui lòng kết nối lại sau.',
    timestamp: new Date().toISOString()
  });

  io.sockets.sockets.forEach(socket => {
    socket.disconnect(true);
  });

  io.close(() => {
    console.log('Socket.IO server closed');
  });
};

module.exports = {
  initializeSocketHandlers,
  getSocketStats,
  shutdownSocketIO
};
