/**
 * REST wrapper for owned chat history (reload restoration).
 *
 * The backend exposes two read-only, authenticated endpoints:
 *   GET /api/chat/conversations           -> summaries (cursor paginated)
 *   GET /api/chat/conversations/:sessionId -> full detail
 *
 * Live chat messaging is Socket.IO-only; there is deliberately no POST /api/chat.
 * Authorization (Bearer token + auto-refresh) is handled centrally by the shared
 * axios client (https://github.com/…/lib/axios.ts), so this service never
 * duplicates token logic.
 */

import apiClient from '@/lib/axios';
import type { ChatMessage as ChatMessageType } from '@/services/chat.service';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationSummary {
  id: string;
  sessionId: string;
  status: 'active' | 'ended' | 'archived';
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

export interface ConversationSummaryList {
  success: boolean;
  data: {
    items: ConversationSummary[];
    nextCursor?: string;
  };
}

export interface HistoryMessageMetadata {
  [key: string]: unknown;
  modelUsed?: string;
  responseType?: string;
  skipRAG?: boolean;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  clientMessageId?: string;
  generationId?: string;
  metadata?: HistoryMessageMetadata;
}

export interface ConversationDetail {
  sessionId: string;
  status: 'active' | 'ended' | 'archived';
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages: HistoryMessage[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * Fetch the authenticated user's conversation summaries (newest first).
 * Pass `limit` and `cursor` from a prior response to paginate.
 */
export async function listConversations(limit = 20, cursor?: string): Promise<ConversationSummaryList> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);

  const response = await apiClient.get<ApiEnvelope<{ items: ConversationSummary[]; nextCursor?: string }>>(
    '/chat/conversations',
    { params }
  );
  const { items, nextCursor } = response.data.data;
  return { success: true, data: { items, nextCursor } };
}

/**
 * Fetch a single owned conversation by sessionId. The returned messages are
 * already DTO-whitelisted server-side (sensitive metadata removed).
 */
export async function getConversation(sessionId: string): Promise<ConversationDetail> {
  const response = await apiClient.get<ApiEnvelope<ConversationDetail>>(
    `/chat/conversations/${encodeURIComponent(sessionId)}`
  );
  return response.data.data;
}

/**
 * Map hydrated history messages into ChatMessage objects the UI renders.
 *
 * Rules (PR1):
 *  - Each rendered row gets a stable `id` (clientMessageId when present, else a
 *    UI-only fallback) so React keys are unique.
 *  - Completed hydrated messages are NEVER marked retryable/failed/cancelled/
 *    loading; they are idle, finished content.
 *  - Hydrated assistant rows keep `clientMessageId` + `generationId` so the
 *    Regenerate affordance works; user rows never become Retry.
 *  - Legacy rows render defensively with a fallback id.
 */
export function hydrateMessages(raw: HistoryMessage[] | undefined): ChatMessageType[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => {
      const id = m.clientMessageId || m.generationId || `hydrated:${uuidv4()}`;
      return {
        id,
        clientMessageId: m.clientMessageId,
        generationId: m.generationId,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      } satisfies ChatMessageType;
    });
}