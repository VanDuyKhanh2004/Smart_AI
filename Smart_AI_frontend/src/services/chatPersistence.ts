/**
 * Chat conversation persistence hints (localStorage).
 *
 * IMPORTANT: these keys are LOCAL HINTS ONLY, never a source of truth. The
 * authoritative conversation content always comes from the backend REST history
 * endpoints, keyed by the authenticated user. Treating them as hints means a
 * cleared / tampered / stale local value can never leak another user's session
 * (ownership is still enforced server-side on every read).
 *
 * Keys:
 *   - SMART_AI_SELECTED_CHAT_SESSION: the sessionId the user was last working in.
 *   - SMART_AI_CHAT_RESTORE_MODE:      'selected' -> reload restores that session;
 *                                      'new'      -> reload starts a fresh session
 *                                      (no restore, used right after "New Chat"
 *                                       and BEFORE the first message is sent).
 *
 * These keys live in the shared browser origin, so logout MUST clear them (in
 * every auth path) while a token refresh MUST NOT (a refresh is the same user
 * on the same browser). See stores/authStore.ts.
 */

export const SELECTED_SESSION_KEY = 'SMART_AI_SELECTED_CHAT_SESSION';
export const RESTORE_MODE_KEY = 'SMART_AI_CHAT_RESTORE_MODE';

export type ChatRestoreMode = 'selected' | 'new';

export function getSelectedSession(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSelectedSession(sessionId: string): void {
  try {
    window.localStorage.setItem(SELECTED_SESSION_KEY, sessionId);
  } catch {
    /* storage unavailable — persist as a hint only */
  }
}

/** Remove the selected-session hint. Used when starting a branch-new session. */
export function clearSelectedSession(): void {
  try {
    window.localStorage.removeItem(SELECTED_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getRestoreMode(): ChatRestoreMode {
  try {
    return window.localStorage.getItem(RESTORE_MODE_KEY) === 'new' ? 'new' : 'selected';
  } catch {
    return 'selected';
  }
}

export function setRestoreMode(mode: ChatRestoreMode): void {
  try {
    window.localStorage.setItem(RESTORE_MODE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Clear every chat persistence hint. Called on logout (every auth path) so a
 * subsequent login by a DIFFERENT user on the same browser can never hydrate
 * the previous user's session.
 */
export function clearChatPersistence(): void {
  clearSelectedSession();
  // Set the mode to 'new' rather than only removing it: an unset key defaults to
  // 'selected', which is the wrong signal after logout. Explicitly marking 'new'
  // guarantees a reload/logout never attempts to hydrate a stale session.
  try {
    window.localStorage.setItem(RESTORE_MODE_KEY, 'new');
  } catch {
    /* storage unavailable */
  }
}