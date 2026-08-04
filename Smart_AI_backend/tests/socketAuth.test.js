const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const ioc = require('socket.io-client');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
    flush: jest.fn(),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../controllers/chatController', () => ({
  processMessage: jest.fn(),
}));

const User = require('../models/User');
const chatController = require('../controllers/chatController');

const mockUser = { id: 'user-123', email: 'test@example.com', role: 'user' };
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

let httpServer;
let ioServer;
let port;
const clientSockets = [];

const validToken = () =>
  jwt.sign({ id: mockUser.id, email: mockUser.email }, process.env.JWT_SECRET, { expiresIn: '15m' });

const expiredToken = () =>
  jwt.sign({ id: mockUser.id, email: mockUser.email }, process.env.JWT_SECRET, { expiresIn: '-10s' });

const refreshToken = () =>
  jwt.sign({ id: mockUser.id, email: mockUser.email }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

function connectClient({ token, query, headers } = {}) {
  return new Promise((resolve) => {
    const socket = ioc(`http://localhost:${port}`, {
      forceNew: true,
      transports: ['websocket'],
      reconnection: false,
      ...(token !== undefined ? { auth: { token } } : {}),
      ...(query ? { query } : {}),
      ...(headers ? { extraHeaders: headers } : {}),
    });
    clientSockets.push(socket);

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.off('connect');
      socket.off('connect_error');
      resolve(result);
    };
    socket.once('connect', () => finish({ socket, error: null }));
    socket.once('connect_error', (error) => finish({ socket, error }));
  });
}

function emitAndWait(socket, event, payload, responseEvent, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for ${responseEvent}`)),
      timeoutMs
    );
    socket.once(responseEvent, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.emit(event, payload);
  });
}

beforeAll(async () => {
  httpServer = http.createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  const { initializeSocketHandlers } = require('../socket/socketHandler');
  initializeSocketHandlers(ioServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  for (const socket of clientSockets) {
    socket.close();
  }
  clientSockets.length = 0;
  await new Promise((resolve) => ioServer.close(resolve));
  await new Promise((resolve) => {
    try {
      httpServer.close(resolve);
    } catch {
      resolve();
    }
  });
});

beforeEach(() => {
  User.findById.mockReset();
  chatController.processMessage.mockReset();
  User.findById.mockResolvedValue(mockUser);
  chatController.processMessage.mockResolvedValue({ processingTime: 12 });
});

describe('Socket.IO handshake authentication', () => {
  it('accepts a valid access token sent via handshake auth.token', async () => {
    const { socket, error } = await connectClient({ token: validToken() });
    expect(error).toBeNull();
    expect(socket.connected).toBe(true);

    const welcome = await emitAndWait(socket, 'ping', {}, 'pong');
    expect(welcome.timestamp).toBeTruthy();
  });

  it('accepts a valid access token sent via Authorization Bearer header', async () => {
    const { socket, error } = await connectClient({ headers: { Authorization: `Bearer ${validToken()}` } });
    expect(error).toBeNull();
    expect(socket.connected).toBe(true);
  });

  it('rejects sockets without a token with SOCKET_AUTH_REQUIRED', async () => {
    const { error } = await connectClient();
    expect(error).toBeTruthy();
    expect(error.data.code).toBe('SOCKET_AUTH_REQUIRED');
  });

  it('rejects sockets with a malformed token with SOCKET_AUTH_INVALID', async () => {
    const { error } = await connectClient({ token: 'not-a-jwt' });
    expect(error).toBeTruthy();
    expect(error.data.code).toBe('SOCKET_AUTH_INVALID');
  });

  it('rejects sockets with an expired access token with SOCKET_AUTH_EXPIRED', async () => {
    const { error } = await connectClient({ token: expiredToken() });
    expect(error).toBeTruthy();
    expect(error.data.code).toBe('SOCKET_AUTH_EXPIRED');
  });

  it('rejects sockets when the user no longer exists with SOCKET_USER_NOT_FOUND', async () => {
    User.findById.mockResolvedValue(null);
    const { error } = await connectClient({ token: validToken() });
    expect(error).toBeTruthy();
    expect(error.data.code).toBe('SOCKET_USER_NOT_FOUND');
  });

  it('rejects refresh tokens with SOCKET_AUTH_INVALID', async () => {
    const { error } = await connectClient({ token: refreshToken() });
    expect(error).toBeTruthy();
    expect(error.data.code).toBe('SOCKET_AUTH_INVALID');
  });

  it('never trusts a token supplied via query string', async () => {
    const { error } = await connectClient({ query: { token: validToken() } });
    expect(error).toBeTruthy();
    expect(error.data.code).toBe('SOCKET_AUTH_REQUIRED');
  });

  it('exposes only id, email and role on socket.data.user', async () => {
    const { socket, error } = await connectClient({ token: validToken() });
    expect(error).toBeNull();

    const serverSocket = ioServer.sockets.sockets.get(socket.id);
    expect(serverSocket).toBeTruthy();
    expect(serverSocket.data.user).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
    });
    expect(Object.keys(serverSocket.data.user).sort()).toEqual(['email', 'id', 'role']);
  });
});

describe('Authenticated event handling', () => {
  it('routes sendMessage to the AI/chat pipeline for authenticated sockets', async () => {
    const { socket, error } = await connectClient({ token: validToken() });
    expect(error).toBeNull();

    const payload = { sessionId: VALID_SESSION_ID, message: 'Gợi ý điện thoại' };
    socket.emit('sendMessage', payload);

    const completed = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for completed')), 3000);
      const handler = (data) => {
        if (data.status === 'completed') {
          clearTimeout(timer);
          socket.off('messageProcessing', handler);
          resolve(data);
        }
      };
      socket.on('messageProcessing', handler);
    });

    expect(completed.processingTime).toBe(12);
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);
    expect(chatController.processMessage.mock.calls[0][1]).toEqual(payload);
  });

  it('blocks sendMessage from reaching the AI pipeline when socket.data.user is missing', async () => {
    const { socket, error } = await connectClient({ token: validToken() });
    expect(error).toBeNull();

    const serverSocket = ioServer.sockets.sockets.get(socket.id);
    serverSocket.data.user = undefined;

    const errEvent = await emitAndWait(socket, 'sendMessage', {
      sessionId: VALID_SESSION_ID,
      message: 'Gợi ý điện thoại',
    }, 'error');

    expect(errEvent.type).toBe('SOCKET_AUTH_REQUIRED');
    expect(chatController.processMessage).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied userId in the sendMessage payload (no impersonation)', async () => {
    const { socket, error } = await connectClient({ token: validToken() });
    expect(error).toBeNull();

    const payload = {
      sessionId: VALID_SESSION_ID,
      message: 'Gợi ý điện thoại',
      userId: 'attacker-user-id',
    };
    socket.emit('sendMessage', payload);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for completed')), 3000);
      const handler = (data) => {
        if (data.status === 'completed') {
          clearTimeout(timer);
          socket.off('messageProcessing', handler);
          resolve(data);
        }
      };
      socket.on('messageProcessing', handler);
    });

    expect(chatController.processMessage).toHaveBeenCalledTimes(1);
    const passedData = chatController.processMessage.mock.calls[0][1];
    expect(passedData.userId).toBe('attacker-user-id');
    expect(passedData.sessionId).toBe(VALID_SESSION_ID);
    // Server-side identity remains the authenticated user, never the payload userId.
    const serverSocket = ioServer.sockets.sockets.get(socket.id);
    expect(serverSocket.data.user.id).toBe(mockUser.id);
  });

  it('supports room join/leave and typing for authenticated sockets', async () => {
    const { socket: sender, error: senderError } = await connectClient({ token: validToken() });
    const { socket: receiver, error: receiverError } = await connectClient({ token: validToken() });
    expect(senderError).toBeNull();
    expect(receiverError).toBeNull();

    const roomJoined = await emitAndWait(sender, 'joinRoom', 'room-1', 'roomJoined');
    expect(roomJoined.roomId).toBe('room-1');

    const roomLeft = await emitAndWait(sender, 'leaveRoom', 'room-1', 'roomLeft');
    expect(roomLeft.roomId).toBe('room-1');

    const typingPromise = emitAndWait(receiver, 'typing', { sessionId: VALID_SESSION_ID }, 'userTyping');
    sender.emit('typing', { sessionId: VALID_SESSION_ID });
    const userTyping = await typingPromise;
    expect(userTyping.sessionId).toBe(VALID_SESSION_ID);

    const stoppedPromise = emitAndWait(receiver, 'stopTyping', { sessionId: VALID_SESSION_ID }, 'userStoppedTyping');
    sender.emit('stopTyping', { sessionId: VALID_SESSION_ID });
    const userStoppedTyping = await stoppedPromise;
    expect(userStoppedTyping.sessionId).toBe(VALID_SESSION_ID);
  });
});
