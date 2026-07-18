import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initGoogleIdentity,
  setGoogleCallback,
  renderGoogleButton,
  __resetGoogleIdentity,
} from '@/lib/googleIdentity';

const mockInitialize = vi.fn();
const mockRenderButton = vi.fn();

function setupGIS() {
  (window as any).google = {
    accounts: {
      id: {
        initialize: mockInitialize,
        renderButton: mockRenderButton,
      },
    },
  };
}

const TEST_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

describe('initGoogleIdentity', () => {
  beforeEach(() => {
    __resetGoogleIdentity();
    vi.clearAllMocks();
    delete (window as any).google;
  });

  it('returns false for empty client ID', () => {
    const result = initGoogleIdentity('');
    expect(result).toBe(false);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('returns false for whitespace-only client ID', () => {
    const result = initGoogleIdentity('   ');
    expect(result).toBe(false);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('returns false for undefined client ID', () => {
    const result = initGoogleIdentity(undefined as unknown as string);
    expect(result).toBe(false);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('calls window.google.accounts.id.initialize once', () => {
    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledWith({
      client_id: TEST_CLIENT_ID,
      callback: expect.any(Function),
    });
  });

  it('does not call initialize a second time (singleton guard)', () => {
    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    initGoogleIdentity(TEST_CLIENT_ID + '.different');
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('returns true on first call and true on subsequent calls', () => {
    setupGIS();
    expect(initGoogleIdentity(TEST_CLIENT_ID)).toBe(true);
    expect(initGoogleIdentity('other-id')).toBe(true);
  });

  it('polls until window.google is available', async () => {
    vi.useFakeTimers();
    __resetGoogleIdentity();

    const result = initGoogleIdentity(TEST_CLIENT_ID);
    expect(result).toBe(true);
    expect(mockInitialize).not.toHaveBeenCalled();

    setupGIS();
    vi.advanceTimersByTime(200);
    await vi.waitFor(() => {
      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    vi.useRealTimers();
  });
});

describe('setGoogleCallback', () => {
  beforeEach(() => {
    __resetGoogleIdentity();
    vi.clearAllMocks();
    delete (window as any).google;
  });

  it('updates the callback used by the GIS dispatcher', () => {
    setupGIS();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    initGoogleIdentity(TEST_CLIENT_ID);

    const initializeCall = mockInitialize.mock.calls[0][0];
    const dispatcher = initializeCall.callback;

    setGoogleCallback(cb1);
    dispatcher({ credential: 'tok1' });
    expect(cb1).toHaveBeenCalledWith('tok1');
    expect(cb2).not.toHaveBeenCalled();

    setGoogleCallback(cb2);
    dispatcher({ credential: 'tok2' });
    expect(cb2).toHaveBeenCalledWith('tok2');
  });

  it('does not crash when called with null', () => {
    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    expect(() => setGoogleCallback(null)).not.toThrow();
  });

  it('does not fire callback when set to null', () => {
    setupGIS();
    const cb = vi.fn();
    initGoogleIdentity(TEST_CLIENT_ID);
    const initializeCall = mockInitialize.mock.calls[0][0];
    const dispatcher = initializeCall.callback;

    setGoogleCallback(cb);
    setGoogleCallback(null);
    dispatcher({ credential: 'tok' });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('renderGoogleButton', () => {
  beforeEach(() => {
    __resetGoogleIdentity();
    vi.clearAllMocks();
    delete (window as any).google;
  });

  it('renders the button when GIS is ready', () => {
    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    const container = document.createElement('div');

    renderGoogleButton(container);

    expect(mockRenderButton).toHaveBeenCalledTimes(1);
    expect(mockRenderButton).toHaveBeenCalledWith(container, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 350,
      shape: 'rectangular',
    });
  });

  it('does nothing when container is null', () => {
    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    renderGoogleButton(null);
    expect(mockRenderButton).not.toHaveBeenCalled();
  });

  it('queues render when GIS is not yet ready, then renders when ready', () => {
    const container = document.createElement('div');
    renderGoogleButton(container);
    expect(mockRenderButton).not.toHaveBeenCalled();

    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    expect(mockRenderButton).toHaveBeenCalledTimes(1);
    expect(mockRenderButton).toHaveBeenCalledWith(container, expect.any(Object));
  });

  it('queues multiple renders and processes all when GIS becomes ready', () => {
    const c1 = document.createElement('div');
    const c2 = document.createElement('div');

    renderGoogleButton(c1);
    renderGoogleButton(c2);
    expect(mockRenderButton).not.toHaveBeenCalled();

    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    expect(mockRenderButton).toHaveBeenCalledTimes(2);
  });
});

describe('full integration: login then linking flow', () => {
  beforeEach(() => {
    __resetGoogleIdentity();
    vi.clearAllMocks();
    delete (window as any).google;
  });

  it('supports switching callback from login to linking', () => {
    setupGIS();
    const loginCb = vi.fn();
    const linkCb = vi.fn();

    // Simulate LoginPage mount
    initGoogleIdentity(TEST_CLIENT_ID);
    setGoogleCallback(loginCb);

    const initializeCall = mockInitialize.mock.calls[0][0];
    const dispatcher = initializeCall.callback;

    // Login receives credential
    dispatcher({ credential: 'login-token' });
    expect(loginCb).toHaveBeenCalledWith('login-token');

    // Simulate navigating to ProfilePage → GoogleLinkSection mounts
    setGoogleCallback(linkCb);
    dispatcher({ credential: 'link-token' });
    expect(linkCb).toHaveBeenCalledWith('link-token');
    expect(loginCb).toHaveBeenCalledTimes(1);
  });

  it('does not re-initialize GIS when navigating between pages', () => {
    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);
    expect(mockInitialize).toHaveBeenCalledTimes(1);

    // Navigate away and back
    initGoogleIdentity(TEST_CLIENT_ID);
    initGoogleIdentity(TEST_CLIENT_ID);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });
});

describe('stale callback after unmount', () => {
  beforeEach(() => {
    __resetGoogleIdentity();
    vi.clearAllMocks();
    delete (window as any).google;
  });

  it('fires callback after setGoogleCallback was called with a new function', () => {
    setupGIS();
    initGoogleIdentity(TEST_CLIENT_ID);

    const firstCb = vi.fn();
    const secondCb = vi.fn();

    setGoogleCallback(firstCb);
    setGoogleCallback(secondCb);

    const initializeCall = mockInitialize.mock.calls[0][0];
    initializeCall.callback({ credential: 'tok' });

    expect(secondCb).toHaveBeenCalledWith('tok');
    expect(firstCb).not.toHaveBeenCalled();
  });
});
