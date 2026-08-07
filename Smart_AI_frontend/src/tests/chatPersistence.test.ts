import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSelectedSession,
  getRestoreMode,
  setSelectedSession,
  setRestoreMode,
  clearSelectedSession,
  clearChatPersistence,
  SELECTED_SESSION_KEY,
  RESTORE_MODE_KEY,
  type ChatRestoreMode,
} from '@/services/chatPersistence';
import { hydrateMessages, type HistoryMessage } from '@/services/chatHistory.service';

const VALID_SESSION = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chatPersistence hints', () => {
  it('restore mode defaults to "selected" when unset', () => {
    expect(getRestoreMode()).toBe('selected');
  });

  it('read/write the selected session hint', () => {
    setSelectedSession(VALID_SESSION);
    expect(getSelectedSession()).toBe(VALID_SESSION);
    expect(window.localStorage.getItem(SELECTED_SESSION_KEY)).toBe(VALID_SESSION);
  });

  it('read/write the restore mode hint', () => {
    setRestoreMode('new');
    expect(getRestoreMode()).toBe('new');
    setRestoreMode('selected');
    expect(getRestoreMode()).toBe('selected');
  });

  it('unknown restore-mode storage normalizes to "selected"', () => {
    window.localStorage.setItem(RESTORE_MODE_KEY, 'garbage');
    expect(getRestoreMode()).toBe('selected');
  });

  it('clearSelectedSession only removes the session id, not the mode', () => {
    setSelectedSession(VALID_SESSION);
    setRestoreMode('selected');
    clearSelectedSession();
    expect(getSelectedSession()).toBeNull();
    expect(getRestoreMode()).toBe('selected');
  });

  it('clearChatPersistence removes the session hint and forces mode to "new" (logout path)', () => {
    setSelectedSession(VALID_SESSION);
    setRestoreMode('selected');
    clearChatPersistence();
    expect(window.localStorage.getItem(SELECTED_SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(RESTORE_MODE_KEY)).toBe('new');
    expect(getRestoreMode()).toBe('new');
  });

  it('surfaces null when storage is unavailable without throwing', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    setItem.mockImplementation(() => { throw new Error('SecurityError'); });
    removeItem.mockImplementation(() => { throw new Error('SecurityError'); });

    expect(getRestoreMode()).toBe('selected');
    expect(getSelectedSession()).toBeNull();
    expect(() => setSelectedSession(VALID_SESSION)).not.toThrow();
    expect(() => clearSelectedSession()).not.toThrow();
    expect(() => clearChatPersistence()).not.toThrow();
  });
});

describe('hydrateMessages', () => {
  it('maps hydrated rows into renderable ChatMessages', () => {
    const raw: HistoryMessage[] = [
      { role: 'user', content: 'xin chao', timestamp: '2026-01-01T00:00:00.000Z', clientMessageId: 'cm-user' },
      { role: 'assistant', content: 'chao ban', timestamp: '2026-01-01T00:00:01.000Z', clientMessageId: 'cm-ass', generationId: 'gen-ass' },
    ];
    const out = hydrateMessages(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: 'user', content: 'xin chao', id: 'cm-user', clientMessageId: 'cm-user' });
    expect(out[1]).toMatchObject({ role: 'assistant', id: 'cm-ass', clientMessageId: 'cm-ass', generationId: 'gen-ass' });
  });

  it('hydrated rows are never retryable/failed/cancelled/loading', () => {
    const out = hydrateMessages([
      { role: 'assistant', content: 'fixed', timestamp: 't', clientMessageId: 'a' },
    ]);
    expect(out[0].retryable).toBeUndefined();
    expect(out[0].failed).toBeUndefined();
    expect(out[0].cancelled).toBeUndefined();
    expect(out[0].isLoading).toBeUndefined();
  });

  it('keeps clientMessageId/generationId so Regenerate works on hydrated assistant rows', () => {
    const out = hydrateMessages([
      { role: 'assistant', content: 'old', timestamp: 't', clientMessageId: 'ass', generationId: 'gen' },
    ]);
    expect(out[0].clientMessageId).toBe('ass');
    expect(out[0].generationId).toBe('gen');
  });

  it('assigns a stable UI-only fallback id for legacy rows and still parses timestamp', () => {
    const out = hydrateMessages([
      { role: 'user', content: 'legacy', timestamp: '2026-05-01T12:00:00.000Z' },
    ]);
    expect(out[0].id).toMatch(/^hydrated:/);
    expect(out[0].clientMessageId).toBeUndefined();
    expect(out[0].timestamp.toISOString()).toBe('2026-05-01T12:00:00.000Z');
  });

  it('drops non-user/assistant and content-less rows defensively', () => {
    const mixed: Array<{ role: string; content: string; timestamp: string } | null> = [
      { role: 'system', content: 'x', timestamp: 't' },
      { role: 'user', content: '', timestamp: 't' },
      null,
    ];
    const typed = mixed as unknown as Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
    }>;
    expect(hydrateMessages(typed)).toHaveLength(0);
  });

  it('returns an empty array for undefined/null input', () => {
    expect(hydrateMessages(undefined)).toEqual([]);
    expect(hydrateMessages([])).toEqual([]);
  });
});

describe('interface type sanity (compile-time guards)', () => {
  it('ChatRestoreMode is a closed union', () => {
    const m: ChatRestoreMode = getRestoreMode();
    expect(['selected', 'new']).toContain(m);
  });
});