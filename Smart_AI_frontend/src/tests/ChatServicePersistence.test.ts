import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getSelectedSession, getRestoreMode, SELECTED_SESSION_KEY, RESTORE_MODE_KEY } from '@/services/chatPersistence';

const VALID_SESSION = '550e8400-e29b-41d4-a716-446655440000';

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
    };
    created.push({ handlers });
    return socket;
  });
  return { created, ioMock };
});

vi.mock('socket.io-client', () => ({ io: hoisted.ioMock }));

function loadChatService() {
  return import('@/services/chat.service');
}

beforeEach(() => {
  hoisted.created.length = 0;
  hoisted.ioMock.mockClear();
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
});

afterEach(async () => {
  const chatService = (await loadChatService()).default;
  chatService.disconnect();
});

describe('ChatService session persistence (localStorage hints)', () => {
  it('mints a fresh session and sets mode "new" when no previous session exists', async () => {
    // No hints stored and restore mode defaults to 'selected' BUT no selected
    // session -> must NOT restore; starts fresh.
    const { default: chatService } = await loadChatService();
    expect(chatService.getSessionId()).toMatch(/^[0-9a-f-]{36}$/i);
    expect(getRestoreMode()).toBe('new');
  });

  it('restores the selected session when mode is "selected" and a valid id exists', async () => {
    localStorage.setItem(SELECTED_SESSION_KEY, VALID_SESSION);
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    const { default: chatService } = await loadChatService();
    expect(chatService.getSessionId()).toBe(VALID_SESSION);
    expect(getRestoreMode()).toBe('selected');
  });

  it('does NOT restore a malformed/invalid selected session id', async () => {
    localStorage.setItem(SELECTED_SESSION_KEY, 'not-a-uuid');
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    const { default: chatService } = await loadChatService();
    expect(chatService.getSessionId()).not.toBe('not-a-uuid');
    // it is normalized back to a fresh ('new') session rather than trusting it
    expect(getRestoreMode()).toBe('new');
  });

  it('resetSession (New Chat) switches to mode "new" and drops any selected hint', async () => {
    localStorage.setItem(SELECTED_SESSION_KEY, VALID_SESSION);
    localStorage.setItem(RESTORE_MODE_KEY, 'selected');
    const { default: chatService } = await loadChatService();
    expect(chatService.getSessionId()).toBe(VALID_SESSION);

    chatService.resetSession();
    expect(chatService.getSessionId()).not.toBe(VALID_SESSION);
    expect(getRestoreMode()).toBe('new');
    expect(getSelectedSession()).toBeNull();
  });

  it('restoreSession() adopts the given id and persists mode "selected"', async () => {
    const { default: chatService } = await loadChatService();
    chatService.restoreSession(VALID_SESSION);
    expect(chatService.getSessionId()).toBe(VALID_SESSION);
    expect(getSelectedSession()).toBe(VALID_SESSION);
    expect(getRestoreMode()).toBe('selected');
  });

  it('restoreSession ignores invalid ids (no restore, no hint change)', async () => {
    const { default: chatService } = await loadChatService();
    const before = chatService.getSessionId();
    chatService.restoreSession('bad-id');
    expect(chatService.getSessionId()).toBe(before);
    expect(getRestoreMode()).toBe('new');
  });

  it('getSessionRestoreMode exposes the current mode', async () => {
    const { default: chatService } = await loadChatService();
    expect(chatService.getSessionRestoreMode()).toBe('new');
    chatService.restoreSession(VALID_SESSION);
    expect(chatService.getSessionRestoreMode()).toBe('selected');
  });
});