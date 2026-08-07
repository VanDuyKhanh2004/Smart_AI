import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConversation, hydrateMessages, type ConversationDetail } from '@/services/chatHistory.service';
import { SELECTED_SESSION_KEY, RESTORE_MODE_KEY } from '@/services/chatPersistence';

const TEST_TIMEOUT = 15000;
const WAIT_TIMEOUT = 5000;
const VALID_SESSION = '550e8400-e29b-41d4-a716-446655440000';
const ACCESS_TOKEN_KEY = 'accessToken';

type EventHandler = (...args: unknown[]) => void;

const hoisted = vi.hoisted(() => {
  const created: Array<{ handlers: Map<string, EventHandler[]> }> = [];
  const ioMock = vi.fn<(url: string, options: Record<string, unknown>) => unknown>(() => {
    const handlers = new Map<string, EventHandler[]>();
    const socket = {
      connected: false,
      on: vi.fn((event: string, cb: EventHandler) => {
        const list = handlers.get(event) ?? [];
        list.push(cb);
        handlers.set(event, list);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    created.push({ handlers });
    return socket;
  });
  return { created, ioMock };
});

vi.mock('socket.io-client', () => ({ io: hoisted.ioMock }));

// Real module? We mock it so hydration content is controllable.
vi.mock('@/services/chatHistory.service', () => ({
  getConversation: vi.fn(),
  hydrateMessages: vi.fn(),
}));

function fire(handlers: Map<string, EventHandler[]>, event: string, ...args: unknown[]) {
  const list = handlers.get(event) ?? [];
  for (const cb of list) {
    cb(...args);
  }
}

beforeEach(() => {
  hoisted.created.length = 0;
  hoisted.ioMock.mockClear();
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom does not implement Element.scrollIntoView.
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      value: vi.fn(),
    });
  }
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // Unmount the FloatingChat rendered by the previous test so the socket
  // listeners / singletons do not leak into the next test (which is what made
  // these tests flaky in the full suite).
  cleanup();
});

async function openChat() {
  // A token is required for the socket to be created (initialize skips the
  // handshake when logged out).
  localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');
  const mod = await import('@/features/chat/components/FloatingChat');
  const { default: FloatingChat } = mod;
  const { container } = render(<FloatingChat />);
  const toggle = container.querySelector('button.rounded-full');
  expect(toggle).toBeDefined();
  fireEvent.click(toggle!);
  return container;
}

describe('FloatingChat reload restoration (hydration)', () => {
  it('does NOT hydrate and shows the welcome message when restore mode is "new"', async () => {
    localStorage.setItem(RESTORE_MODE_KEY, 'new');
    localStorage.setItem(SELECTED_SESSION_KEY, VALID_SESSION);
    await openChat();

    const entry = hoisted.created[0];
    expect(entry).toBeDefined();
    fire(entry.handlers, 'connect');

    expect(getConversation).not.toHaveBeenCalled();
    await screen.findByText(/xin chào/i, {}, { timeout: WAIT_TIMEOUT });
    expect(screen.getByText(/Em là Quỳnh Như/i)).toBeDefined();
  }, TEST_TIMEOUT);

  it('hydrates the selected session into rendered messages', async () => {
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    localStorage.setItem(SELECTED_SESSION_KEY, VALID_SESSION);
    vi.mocked(getConversation).mockResolvedValue({
      sessionId: VALID_SESSION,
      status: 'active',
      messageCount: 2,
      lastMessageAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      messages: [
        { role: 'user', content: 'Lịch sử cũ 1', timestamp: '2026-01-01T00:00:00.000Z', clientMessageId: 'u1' },
        { role: 'assistant', content: 'Lịch sử cũ 2', timestamp: '2026-01-01T00:00:01.000Z', clientMessageId: 'a1' },
      ],
    } as never);
    vi.mocked(hydrateMessages).mockImplementation((raw) => {
      return ((raw || []) as Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
        clientMessageId?: string;
      }>).map((m) => ({
        id: m.clientMessageId ?? `h:${m.content}`,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        clientMessageId: m.clientMessageId,
      }));
    });

    await openChat();
    const entry = hoisted.created[0];
    fire(entry.handlers, 'connect');

    await waitFor(() => expect(getConversation).toHaveBeenCalledWith(VALID_SESSION), { timeout: WAIT_TIMEOUT });
    await screen.findByText('Lịch sử cũ 1', {}, { timeout: WAIT_TIMEOUT });
    expect(screen.getByText('Lịch sử cũ 2')).toBeDefined();
    // The welcome message must NOT be shown over hydrated content.
    expect(screen.queryByText(/Em là Quỳnh Như/i)).toBeNull();
  }, TEST_TIMEOUT);

  it('falls back to welcome + fresh session when hydration fails', async () => {
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    localStorage.setItem(SELECTED_SESSION_KEY, VALID_SESSION);
    vi.mocked(getConversation).mockRejectedValue(new Error('network'));

    await openChat();
    const entry = hoisted.created[0];
    fire(entry.handlers, 'connect');

    await screen.findByText(/không thể tải lại/i);
    expect(screen.getByText(/Em là Quỳnh Như/i)).toBeDefined();
  });

  it('send is blocked while hydration is in flight', async () => {
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    localStorage.setItem(SELECTED_SESSION_KEY, VALID_SESSION);
    let resolveFetch: (v: ConversationDetail) => void = () => {};
    vi.mocked(getConversation).mockReturnValue(new Promise<ConversationDetail>((res) => { resolveFetch = res; }));

    await openChat();
    const entry = hoisted.created[0];
    expect(entry).toBeDefined();
    fire(entry.handlers, 'connect');

    // While hydration is unresolved, the composer must be disabled so a send
    // cannot race the loading content.
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeDefined();
    await waitFor(() => expect(textarea).toBeDisabled());

    // Resolve so the test terminates cleanly.
    resolveFetch({
      sessionId: VALID_SESSION,
      status: 'active',
      messageCount: 0,
      lastMessageAt: 't',
      createdAt: 't',
      updatedAt: 't',
      messages: [],
    });
  });
});