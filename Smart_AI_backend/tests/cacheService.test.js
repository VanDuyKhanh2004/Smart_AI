/* ------------------------------------------------------------------ */
/*  cacheService Redis readiness gate tests                            */
/*                                                                     */
/*  node-redis keeps `isOpen` true across reconnect attempts; commands */
/*  against a not-ready client would buffer and hang the request. All  */
/*  cacheService operations fail open immediately when the client is   */
/*  not usable right now, without issuing any Redis command.           */
/*  No real Redis server is used.                                      */
/* ------------------------------------------------------------------ */

jest.mock('../configs/redis', () => ({
  getRedisClient: jest.fn(),
}));

const { getRedisClient } = require('../configs/redis');
const cache = require('../services/cacheService');

const makeReadyClient = (overrides = {}) => ({
  isOpen: true,
  isReady: true,
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  scan: jest.fn(),
  ...overrides,
});

const makeNotReadyClient = () => ({
  isOpen: true,
  isReady: false,
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  scan: jest.fn(),
});

describe('cacheService — Redis readiness gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('get fails open immediately (no Redis call) when client is open but not ready', async () => {
    const client = makeNotReadyClient();
    getRedisClient.mockReturnValue(client);

    const value = await cache.get('foo');
    expect(value).toBeNull();
    expect(client.get).not.toHaveBeenCalled();
  });

  it('does not hang on a null client', async () => {
    getRedisClient.mockReturnValue(null);
    await expect(cache.get('foo')).resolves.toBeNull();
    await expect(cache.set('foo', { a: 1 })).resolves.toBeUndefined();
  });

  it('get returns parsed JSON when the client is ready', async () => {
    const client = makeReadyClient({ get: jest.fn().mockResolvedValue('{"a":1}') });
    getRedisClient.mockReturnValue(client);
    await expect(cache.get('foo')).resolves.toEqual({ a: 1 });
    expect(client.get).toHaveBeenCalledWith('foo');
  });

  it('get treats an unparseable value as a cache miss', async () => {
    const client = makeReadyClient({ get: jest.fn().mockResolvedValue('not-json') });
    getRedisClient.mockReturnValue(client);
    await expect(cache.get('foo')).resolves.toBeNull();
  });

  it('set uses setEx with the provided TTL when ready', async () => {
    const client = makeReadyClient();
    getRedisClient.mockReturnValue(client);
    await cache.set('k', { v: 1 }, 60);
    expect(client.setEx).toHaveBeenCalledWith('k', 60, '{"v":1}');
  });

  it('set no-ops (no Redis call) when the client is not ready', async () => {
    const client = makeNotReadyClient();
    getRedisClient.mockReturnValue(client);
    await cache.set('k', { v: 1 }, 60);
    expect(client.setEx).not.toHaveBeenCalled();
  });

  it('del skips the client when not ready', async () => {
    const client = makeNotReadyClient();
    getRedisClient.mockReturnValue(client);
    await cache.del('k');
    expect(client.del).not.toHaveBeenCalled();
  });

  it('exists returns false when not ready', async () => {
    const client = makeNotReadyClient();
    getRedisClient.mockReturnValue(client);
    await expect(cache.exists('k')).resolves.toBe(false);
    expect(client.exists).not.toHaveBeenCalled();
  });

  it('exists returns true when ready and present', async () => {
    const client = makeReadyClient({ exists: jest.fn().mockResolvedValue(1) });
    getRedisClient.mockReturnValue(client);
    await expect(cache.exists('k')).resolves.toBe(true);
  });

  it('invalidatePattern scans and deletes only when ready', async () => {
    const client = makeReadyClient({
      scan: jest
        .fn()
        .mockResolvedValueOnce({ cursor: '2', keys: ['a', 'b'] })
        .mockResolvedValueOnce({ cursor: '0', keys: [] }),
      del: jest.fn().mockResolvedValue(1),
    });
    getRedisClient.mockReturnValue(client);

    const deleted = await cache.invalidatePattern('products:*');
    expect(deleted).toBe(2);
    expect(client.scan).toHaveBeenCalledWith('0', { MATCH: 'products:*', COUNT: 100 });
    expect(client.del).toHaveBeenCalledWith(['a', 'b']);
  });

  it('invalidatePattern returns 0 when not ready', async () => {
    const client = makeNotReadyClient();
    getRedisClient.mockReturnValue(client);
    await expect(cache.invalidatePattern('products:*')).resolves.toBe(0);
    expect(client.scan).not.toHaveBeenCalled();
  });
});