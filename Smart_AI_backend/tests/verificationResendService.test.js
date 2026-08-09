const { getRedisClient } = require('../configs/redis');

jest.mock('../configs/redis', () => ({
  getRedisClient: jest.fn(),
}));

const service = require('../services/verificationResendService');

describe('verificationResendService', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = {
      isOpen: true,
      isReady: true,
      set: jest.fn(),
      get: jest.fn(),
      pTTL: jest.fn(),
      ttl: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
    };
    getRedisClient.mockReturnValue(client);
  });

  describe('claimResendCooldown', () => {
    it('returns allowed when SET NX EX succeeds', async () => {
      client.set.mockResolvedValue('OK');

      const result = await service.claimResendCooldown('u1');

      expect(result.allowed).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(client.set).toHaveBeenCalledWith(
        'auth:email-verification:resend:cooldown:u1',
        '1',
        expect.objectContaining({ NX: true, EX: expect.any(Number) })
      );
    });

    it('returns rejected with remaining seconds when key already exists', async () => {
      client.set.mockResolvedValue(null);
      client.pTTL.mockResolvedValue(45000);

      const result = await service.claimResendCooldown('u1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(45);
      expect(client.pTTL).toHaveBeenCalledWith('auth:email-verification:resend:cooldown:u1');
    });

    it('returns rejected with full TTL when the key exists but TTL probe fails', async () => {
      client.set.mockResolvedValue(null);
      client.pTTL.mockRejectedValue(new Error('probe failed'));

      const result = await service.claimResendCooldown('u1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(service.getCooldownSeconds());
    });

    it('is atomic: never uses GET-then-SET (only a single SET NX EX call)', async () => {
      client.set.mockResolvedValue('OK');

      await service.claimResendCooldown('u1');

      expect(client.get).not.toHaveBeenCalled();
      expect(client.set).toHaveBeenCalledTimes(1);
    });

    it('throws VERIFICATION_THROTTLE_UNAVAILABLE when Redis is not open', async () => {
      getRedisClient.mockReturnValue({ isOpen: false });
      client.set.mockResolvedValue('OK');

      await expect(service.claimResendCooldown('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
      });
    });

    it('throws VERIFICATION_THROTTLE_UNAVAILABLE when no client exists', async () => {
      getRedisClient.mockReturnValue(null);

      await expect(service.claimResendCooldown('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
      });
    });
  });

  describe('Redis unavailable (fail-closed) / recovery', () => {
    it('rejects with 503 when the client is open but not ready (reconnecting)', async () => {
      client.isReady = false;

      await expect(service.claimResendCooldown('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
      });
      expect(client.set).not.toHaveBeenCalled();
    });

    it('wraps a raw socket error from the SET command into a deterministic 503', async () => {
      client.set.mockRejectedValue(new Error('Connection lost and command not written to the stream ECONNRESET'));

      await expect(service.claimResendCooldown('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
        message: 'Hệ thống chưa sẵn sàng xử lý gửi lại email. Vui lòng thử lại sau.',
      });
    });

    it('long-window reads fail closed when Redis is not ready', async () => {
      client.isReady = false;

      await expect(service.checkLongWindow('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
      });
    });

    it('long-window reads fail closed when the GET command rejects', async () => {
      client.get.mockRejectedValue(new Error('socket closed'));

      await expect(service.checkLongWindow('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
      });
    });

    it('window increment and expiry bootstrap fail closed when Redis is not ready', async () => {
      client.isReady = false;

      await expect(service.incrementLongWindow('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
      });
      expect(client.incr).not.toHaveBeenCalled();
    });

    it('recovers on a subsequent call after Redis becomes ready without recreating the client', async () => {
      client.isReady = false;
      await expect(service.claimResendCooldown('u1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'VERIFICATION_THROTTLE_UNAVAILABLE',
      });

      client.isReady = true;
      client.set.mockResolvedValue('OK');

      const result = await service.claimResendCooldown('u1');
      expect(result).toEqual({ allowed: true, retryAfterSeconds: expect.any(Number) });
      expect(client.set).toHaveBeenCalledTimes(1);
    });

    it('startResendCooldown stays best-effort and returns false when Redis is not ready', async () => {
      client.isReady = false;

      await expect(service.startResendCooldown('u1')).resolves.toBe(false);
      expect(client.set).not.toHaveBeenCalled();
    });

    it('releaseResendCooldown stays best-effort and returns false when Redis is not ready', async () => {
      client.isReady = false;

      await expect(service.releaseResendCooldown('u1')).resolves.toBe(false);
      expect(client.del).not.toHaveBeenCalled();
    });
  });

  describe('startResendCooldown', () => {
    it('starts the cooldown best-effort when Redis is available', async () => {
      client.set.mockResolvedValue('OK');

      const started = await service.startResendCooldown('u1');

      expect(started).toBe(true);
      expect(client.set).toHaveBeenCalledWith(
        'auth:email-verification:resend:cooldown:u1',
        '1',
        expect.objectContaining({ NX: true })
      );
    });

    it('returns false without throwing when Redis is unavailable', async () => {
      getRedisClient.mockReturnValue({ isOpen: false });

      await expect(service.startResendCooldown('u1')).resolves.toBe(false);
    });

    it('returns false without throwing when Redis write fails', async () => {
      client.set.mockRejectedValue(new Error('redis down'));

      await expect(service.startResendCooldown('u1')).resolves.toBe(false);
    });
  });

  describe('releaseResendCooldown', () => {
    it('deletes the claimed cooldown key when Redis is available', async () => {
      client.del = jest.fn().mockResolvedValue(1);

      const released = await service.releaseResendCooldown('u1');

      expect(released).toBe(true);
      expect(client.del).toHaveBeenCalledWith('auth:email-verification:resend:cooldown:u1');
    });

    it('returns false without throwing when Redis is unavailable', async () => {
      getRedisClient.mockReturnValue({ isOpen: false });

      await expect(service.releaseResendCooldown('u1')).resolves.toBe(false);
    });

    it('returns false without throwing when the delete fails', async () => {
      client.del = jest.fn().mockRejectedValue(new Error('redis down'));

      await expect(service.releaseResendCooldown('u1')).resolves.toBe(false);
    });
  });

  describe('long window (5 / 15 min)', () => {
    it('allows a resend while the count is below the cap', async () => {
      client.get.mockResolvedValue('3');

      const result = await service.checkLongWindow('u1');

      expect(result.allowed).toBe(true);
      expect(client.get).toHaveBeenCalledWith('auth:email-verification:resend:window:u1');
    });

    it('rejects a resend when the count is at the cap', async () => {
      client.get.mockResolvedValue('5');
      client.ttl.mockResolvedValue(500);

      const result = await service.checkLongWindow('u1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(500);
    });

    it('falls back to the full window TTL when the window has no TTL left', async () => {
      client.get.mockResolvedValue('6');
      client.ttl.mockResolvedValue(-1);

      const result = await service.checkLongWindow('u1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('treats a missing window key as zero', async () => {
      client.get.mockResolvedValue(null);

      const result = await service.checkLongWindow('u1');

      expect(result.allowed).toBe(true);
    });

    it('increments the window and bootstraps its expiration on first success', async () => {
      client.incr.mockResolvedValue(1);

      const result = await service.incrementLongWindow('u1');

      expect(result.count).toBe(1);
      expect(client.incr).toHaveBeenCalledWith('auth:email-verification:resend:window:u1');
      expect(client.expire).toHaveBeenCalledWith(
        'auth:email-verification:resend:window:u1',
        expect.any(Number)
      );
    });

    it('does not re-apply expiry on subsequent increments', async () => {
      client.incr.mockResolvedValue(4);

      await service.incrementLongWindow('u1');

      expect(client.expire).not.toHaveBeenCalled();
      expect(client.incr).toHaveBeenCalledTimes(1);
    });
  });
});