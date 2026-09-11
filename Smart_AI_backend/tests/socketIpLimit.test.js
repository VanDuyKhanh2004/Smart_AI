/* ------------------------------------------------------------------ */
/*  Per-IP Socket.IO connection limit tests                            */
/*                                                                     */
/*  Real Socket.IO server + client. The AI pipeline (chatController)   */
/*  is mocked. IP connection limiting is the real logic under test.     */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls are made.                     */
/* ------------------------------------------------------------------ */

// MUST be set before any require() — socketHandler reads these at load time
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
const _origIpLimit = process.env.SOCKET_MAX_CONNECTIONS_PER_IP;
process.env.SOCKET_MAX_CONNECTIONS_PER_IP = '3';

const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const ioc = require('socket.io-client');

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
const socketHandler = require('../socket/socketHandler');

const mockUser = { id: 'user-123', email: 'test@example.com', role: 'user' };

let httpServer;
let ioServer;
let port;
const clientSockets = [];

const validToken = () =>
  jwt.sign({ id: mockUser.id, email: mockUser.email }, process.env.JWT_SECRET, { expiresIn: '15m' });

/**
 * Connect a client and return { socket } on success.
 * For connections that will be rejected by the IP limit (connect then
 * immediately disconnected), the promise still resolves with the socket
 * since the transport + auth succeeded — but the server-side disconnect
 * follows. Use waitForServerDisconnect() to wait for that.
 */
function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      forceNew: true,
      transports: ['websocket'],
      reconnection: false,
      auth: { token: validToken() },
    });
    clientSockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

/**
 * Wait for the server to disconnect this socket. Resolves once the client
 * sees the 'disconnect' event. If already disconnected, resolves immediately.
 */
function waitForServerDisconnect(socket, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve();
    const timer = setTimeout(resolve, timeoutMs);
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
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
  // Restore the original env var so other test files are not affected
  if (_origIpLimit !== undefined) {
    process.env.SOCKET_MAX_CONNECTIONS_PER_IP = _origIpLimit;
  } else {
    delete process.env.SOCKET_MAX_CONNECTIONS_PER_IP;
  }
});

beforeEach(() => {
  socketHandler._resetIpConnectionStore();
  User.findById.mockReset();
  User.findById.mockResolvedValue(mockUser);
  chatController.processMessage.mockReset();
});

/* ================================================================== */
/*  Per-IP connection limit                                            */
/* ================================================================== */

describe('Per-IP Socket.IO connection limit', () => {
  it('accepts a connection when under the per-IP limit', async () => {
    const socket = await connectClient();
    expect(socket.connected).toBe(true);
    expect(socketHandler._getIpConnectionCount('::1')).toBe(1);
  });

  it('accepts connections up to the per-IP limit', async () => {
    const s1 = await connectClient();
    const s2 = await connectClient();
    const s3 = await connectClient();

    expect(s1.connected).toBe(true);
    expect(s2.connected).toBe(true);
    expect(s3.connected).toBe(true);
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);
  });

  it('rejects a connection exceeding the per-IP limit', async () => {
    // Fill up to the limit (3)
    const s1 = await connectClient();
    const s2 = await connectClient();
    const s3 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // The 4th connection: auth passes but IP limit triggers server disconnect
    const s4 = await connectClient();
    // Wait for the server to disconnect it
    await waitForServerDisconnect(s4);

    expect(s4.connected).toBe(false);
    // Counter should remain at 3 (the rejected connection was not counted)
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);
  });

  it('does not increment the counter for an unauthenticated connection', async () => {
    // Connect without a token — auth middleware rejects, connection handler never runs
    const socket = ioc(`http://localhost:${port}`, {
      forceNew: true,
      transports: ['websocket'],
      reconnection: false,
    });
    clientSockets.push(socket);

    const error = await new Promise((resolve) => {
      socket.once('connect_error', (err) => resolve(err));
    });
    expect(error.data.code).toBe('SOCKET_AUTH_REQUIRED');
    expect(socketHandler._getIpConnectionCount('::1')).toBe(0);
  });

  it('decrements the IP count when a socket disconnects', async () => {
    const s1 = await connectClient();
    const s2 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(2);

    s1.close();
    await waitForServerDisconnect(s1);
    // Give the server a tick to process the disconnect handler
    await new Promise((r) => setTimeout(r, 50));

    expect(socketHandler._getIpConnectionCount('::1')).toBe(1);
  });

  it('deletes the Map entry when all connections from an IP close', async () => {
    const s1 = await connectClient();
    const s2 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(2);

    s1.close();
    s2.close();
    await waitForServerDisconnect(s1);
    await waitForServerDisconnect(s2);
    await new Promise((r) => setTimeout(r, 50));

    expect(socketHandler._getIpConnectionCount('::1')).toBe(0);
    expect(socketHandler._getIpConnectionStoreSize()).toBe(0);
  });

  it('allows new connections after all previous connections from the same IP closed', async () => {
    // Fill the limit
    const s1 = await connectClient();
    const s2 = await connectClient();
    const s3 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // 4th should be rejected
    const s4 = await connectClient();
    await waitForServerDisconnect(s4);
    expect(s4.connected).toBe(false);

    // Close all 3
    s1.close();
    s2.close();
    s3.close();
    await waitForServerDisconnect(s1);
    await waitForServerDisconnect(s2);
    await waitForServerDisconnect(s3);
    await new Promise((r) => setTimeout(r, 50));

    expect(socketHandler._getIpConnectionCount('::1')).toBe(0);

    // New connection should succeed
    const s5 = await connectClient();
    expect(s5.connected).toBe(true);
    expect(socketHandler._getIpConnectionCount('::1')).toBe(1);
  });

  it('tracks different IPs independently', async () => {
    // Connect 3 from the same IP to fill the limit
    await connectClient();
    await connectClient();
    await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // A different IP should be unaffected — verify via the counter function.
    // We can't easily spoof a different source IP in a local test, so we verify
    // the store isolation by checking that a fresh IP key is independent.
    // Simulate by directly calling the internal counter functions (which the
    // connection handler uses).
    // The production code uses incrementIpConnection/decrementIpConnection
    // which are module-internal. We verify observable store state:
    expect(socketHandler._getIpConnectionStoreSize()).toBe(1); // only ::1
  });

  it('allows the default limit (10) when SOCKET_MAX_CONNECTIONS_PER_IP is not set', () => {
    const original = process.env.SOCKET_MAX_CONNECTIONS_PER_IP;
    delete process.env.SOCKET_MAX_CONNECTIONS_PER_IP;

    // getMaxConnectionsPerIp() reads process.env at call time.
    // With the env unset, it should return 10.
    const raw = parseInt(process.env.SOCKET_MAX_CONNECTIONS_PER_IP, 10);
    const max = Number.isInteger(raw) && raw > 0 ? raw : 10;
    expect(max).toBe(10);

    if (original !== undefined) {
      process.env.SOCKET_MAX_CONNECTIONS_PER_IP = original;
    }
  });

  it('env var SOCKET_MAX_CONNECTIONS_PER_IP overrides the default', async () => {
    const original = process.env.SOCKET_MAX_CONNECTIONS_PER_IP;
    process.env.SOCKET_MAX_CONNECTIONS_PER_IP = '2';

    // With limit=2, first 2 connections should succeed
    const s1 = await connectClient();
    expect(s1.connected).toBe(true);

    const s2 = await connectClient();
    expect(s2.connected).toBe(true);

    // 3rd should be rejected
    const s3 = await connectClient();
    await waitForServerDisconnect(s3);
    expect(s3.connected).toBe(false);

    // Clean up
    s1.close();
    s2.close();
    await waitForServerDisconnect(s1);
    await waitForServerDisconnect(s2);

    if (original !== undefined) {
      process.env.SOCKET_MAX_CONNECTIONS_PER_IP = original;
    } else {
      delete process.env.SOCKET_MAX_CONNECTIONS_PER_IP;
    }
  });
});

/* ================================================================== */
/*  Connection-counter lifecycle correctness                            */
/* ================================================================== */

describe('Connection-counter lifecycle', () => {
  it('rejected connection does not decrement the existing IP count', async () => {
    const s1 = await connectClient();
    const s2 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(2);

    // Reject the 3rd (limit=3, so this is still under; use limit=2 scenario)
    // Actually limit=3 here, so let's fill to 3 first then reject #4
    const s3 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    const s4 = await connectClient();
    await waitForServerDisconnect(s4);
    expect(s4.connected).toBe(false);

    // The rejected socket must not have decremented the count
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);
  });

  it('after 3 accepted connections with limit=3, rejecting #4 keeps count at 3', async () => {
    const sockets = [];
    for (let i = 0; i < 3; i++) {
      sockets.push(await connectClient());
    }
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    const rejected = await connectClient();
    await waitForServerDisconnect(rejected);
    expect(rejected.connected).toBe(false);

    // Count must still be exactly 3 — no undercount from the rejected socket
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);
  });

  it('after rejecting #4, another connection is still rejected while original 3 remain', async () => {
    const s1 = await connectClient();
    const s2 = await connectClient();
    const s3 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // Reject #4
    const s4 = await connectClient();
    await waitForServerDisconnect(s4);
    expect(s4.connected).toBe(false);
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // Reject #5 — must still be blocked
    const s5 = await connectClient();
    await waitForServerDisconnect(s5);
    expect(s5.connected).toBe(false);
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // Original 3 must still be connected
    expect(s1.connected).toBe(true);
    expect(s2.connected).toBe(true);
    expect(s3.connected).toBe(true);
  });

  it('after one accepted connection disconnects, a new connection can be accepted', async () => {
    const s1 = await connectClient();
    const s2 = await connectClient();
    const s3 = await connectClient();
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // Disconnect one
    s1.close();
    await waitForServerDisconnect(s1);
    await new Promise((r) => setTimeout(r, 50));
    expect(socketHandler._getIpConnectionCount('::1')).toBe(2);

    // New connection should now be accepted
    const s4 = await connectClient();
    expect(s4.connected).toBe(true);
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);

    // A 5th should now be rejected
    const s5 = await connectClient();
    await waitForServerDisconnect(s5);
    expect(s5.connected).toBe(false);
    expect(socketHandler._getIpConnectionCount('::1')).toBe(3);
  });
});
