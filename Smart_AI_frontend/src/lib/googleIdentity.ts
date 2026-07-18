let initialized = false;
let activeCallback: ((credential: string) => void) | null = null;
let gisReady = false;
let renderQueue: Array<() => void> = [];

export function __resetGoogleIdentity(): void {
  initialized = false;
  activeCallback = null;
  gisReady = false;
  renderQueue = [];
}

function processRenderQueue() {
  const queue = renderQueue.slice();
  renderQueue = [];
  queue.forEach((fn) => fn());
}

export function initGoogleIdentity(clientId: string): boolean {
  const trimmed = clientId?.trim();
  if (!trimmed) {
    if (import.meta.env.DEV) {
      console.warn('[GoogleIdentity] VITE_GOOGLE_CLIENT_ID is not configured');
    }
    return false;
  }

  if (initialized) return true;
  initialized = true;

  const poll = () => {
    if (!window.google?.accounts?.id) {
      setTimeout(poll, 200);
      return;
    }

    window.google.accounts.id.initialize({
      client_id: trimmed,
      callback: (response: { credential: string }) => {
        activeCallback?.(response.credential);
      },
    });

    gisReady = true;
    processRenderQueue();
  };

  poll();
  return true;
}

export function setGoogleCallback(callback: ((credential: string) => void) | null): void {
  activeCallback = callback;
}

export function renderGoogleButton(container: HTMLElement | null): void {
  if (!container) return;

  const doRender = () => {
    container.innerHTML = '';
    window.google!.accounts!.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 350,
      shape: 'rectangular',
    });
  };

  if (gisReady) {
    doRender();
  } else {
    renderQueue.push(doRender);
  }
}
