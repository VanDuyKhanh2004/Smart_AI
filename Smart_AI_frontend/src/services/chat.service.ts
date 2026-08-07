import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const ACCESS_TOKEN_KEY = 'accessToken';

export interface ChatMessage {
  id: string;
  clientMessageId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  failed?: boolean;
  // A live stream was stopped by the user; the bubble keeps whatever partial
  // content arrived before the stop.
  cancelled?: boolean;
  // Identity of the generation attempt. For an ordinary send / retry this is
  // the same as clientMessageId; Regenerate produces a fresh generationId.
  generationId?: string;
  // True while a regenerate attempt is replacing this assistant bubble (the old
  // response stays visible until the new attempt actually begins).
  regenerating?: boolean;
  // This logical turn may be Retried. A retryable USER turn is one whose
  // generation ended terminally (failed/cancelled) BEFORE any assistant
  // placeholder was created; a retryable ASSISTANT bubble is one that was
  // cancelled/failed with partial content. There is at most one Retry affordance
  // per logical turn.
  retryable?: boolean;
  // Why the logical turn became retryable (only meaningful together with
  // retryable). Drives a small badge and keeps the user bubble visually distinct.
  generationStatus?: 'cancelled' | 'failed';
}

export type StreamFinishReason = 'stop' | 'max_tokens';

export interface SendAck {
  accepted: boolean;
  duplicate: boolean;
  status: 'accepted' | 'processing' | 'completed' | 'invalid' | 'error';
  clientMessageId: string | null;
}

export type RetryAckStatus =
  | 'accepted'
  | 'already_processing'
  | 'already_completed'
  | 'not_found'
  | 'invalid'
  | 'error';

export interface RetryAck {
  accepted: boolean;
  duplicate: boolean;
  status: RetryAckStatus;
  clientMessageId: string | null;
  generationId: string | null;
}

export type RegenerateAckStatus =
  | 'accepted'
  | 'already_processing'
  | 'not_completed'
  | 'not_found'
  | 'invalid'
  | 'error';

export interface RegenerateAck {
  accepted: boolean;
  status: RegenerateAckStatus;
  clientMessageId: string | null;
  generationId: string | null;
}

export interface StopGenerationAck {
  stopped: boolean;
  status: 'stopped' | 'already_completed' | 'not_found' | 'invalid';
  clientMessageId: string | null;
}

export interface ChatServiceConfig {
  onMessage: (message: ChatMessage) => void;
  // Streaming lifecycle callbacks. All deliver the SAME assistant message
  // object (stable id = `stream:<clientMessageId>`) so the UI never appends a
  // second bubble for a stream:
  //   onStreamStart  -> creates the placeholder (isLoading: true, empty content)
  //   onMessageUpdate-> appends a delta to that same message
  //   onStreamComplete-> finalizes that same message (authoritative content)
  onStreamStart?: (message: ChatMessage) => void;
  onMessageUpdate?: (message: ChatMessage) => void;
  onStreamComplete?: (message: ChatMessage) => void;
  // A correlated terminal failure for a streaming id.
  onStreamError?: (clientMessageId: string) => void;
  // The user stopped a live stream (messageProcessing 'cancelled'). The bubble
  // keeps the partial content and is no longer loading.
  onStreamCancelled?: (clientMessageId: string) => void;
  // Retry lifecycle: an accepted Retry re-uses the logical clientMessageId as
  // its generation identity. onRetryStarted fires once the stream actually
  // begins replacing the logical bubble.
  onRetryStarted?: (clientMessageId: string) => void;
  // A logical turn ended terminally (failed/cancelled) with NO assistant
  // placeholder (an early cancellation/failure before aiResponseStart). The
  // USER bubble for that logical clientMessageId should become retryable. "No
  // assistant placeholder exists" is asserted by the service, so the UI never
  // shows a retry reconstructed from any user-only legacy row.
  onTurnRetryable?: (clientMessageId: string, status: 'cancelled' | 'failed') => void;
  // Regenerate lifecycle. The ack delivers the fresh generationId; streaming
  // events for the attempt carry BOTH clientMessageId (logical turn) and
  // generationId (attempt). The UI replaces the SAME logical assistant bubble,
  // never appends a second one, and preserves the old response until the new
  // attempt begins.
  onRegenerateAccepted?: (clientMessageId: string, generationId: string) => void;
  onRegenerateStarted?: (clientMessageId: string, generationId: string) => void;
  onRegenerateUpdate?: (clientMessageId: string, generationId: string, content: string) => void;
  onRegenerateComplete?: (clientMessageId: string, generationId: string, content: string, timestamp: Date) => void;
  onRegenerateFailed?: (clientMessageId: string, generationId: string) => void;
  onRegenerateCancelled?: (clientMessageId: string, generationId: string) => void;
  onError: (error: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onProcessingStatus: (isProcessing: boolean) => void;
}

type SocketAuthErrorCode =
  | 'SOCKET_AUTH_REQUIRED'
  | 'SOCKET_AUTH_INVALID'
  | 'SOCKET_AUTH_EXPIRED'
  | 'SOCKET_USER_NOT_FOUND';

type SocketConnectError = Error & { data?: { code?: string } };

const SOCKET_AUTH_ERROR_MESSAGES: Record<SocketAuthErrorCode, string> = {
  SOCKET_AUTH_REQUIRED: 'Vui lòng đăng nhập để sử dụng chat',
  SOCKET_AUTH_INVALID: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  SOCKET_AUTH_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  SOCKET_USER_NOT_FOUND: 'Tài khoản không tồn tại. Vui lòng đăng nhập lại.',
};

function getSocketAuthErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return SOCKET_AUTH_ERROR_MESSAGES[code as SocketAuthErrorCode];
}

function isSocketAuthErrorCode(code: string | undefined): code is SocketAuthErrorCode {
  return code !== undefined && getSocketAuthErrorMessage(code) !== undefined;
}

class ChatService {
  private socket: Socket | null = null;
  private sessionId: string;
  private config: ChatServiceConfig | null = null;
  private isConnected = false;
  private currentToken: string | null = null;

  // Submissions currently in flight keyed by clientMessageId (the correlation
  // id). Identity is the id, never the message text, so two independent
  // submissions with identical content remain distinct.
  private pendingByClientMessageId = new Map<string, ChatMessage>();
  // clientMessageIds whose assistant response was already rendered once.
  private renderedResponseIds = new Set<string>();
  // clientMessageIds finalized via aiResponseComplete (a live stream).
  private deliveredStreamIds = new Set<string>();
  // Live-stream bookkeeping per clientMessageId: the one assistant messenger
  // plus chunk-sequence tracking (index must be sequential, starting at 0).
  private streamByClientMessageId = new Map<string, {
    message: ChatMessage;
    nextChunkIndex: number;
  }>();

  // clientMessageIds whose GENERATION is active and cancellable. Every ACCEPTED
  // request becomes cancellable at `messageProcessing started` (the socket
  // boundary creates + registers one AbortController BEFORE any pipeline work),
  // so the Stop control must be available from that instant — NOT gated on
  // aiResponseStart. The set is cleared by the terminal events: completed,
  // cancelled, error, or the compatibility aiResponse.
  private cancellableGenerationIds = new Set<string>();
  // The most recent cancellable id (drives the single Stop button).
  private lastCancellableId: string | null = null;

  // Regenerate bookkeeping keyed by the fresh generationId (a regenerate attempt
  // mints a new generationId per click). Maps to the logical clientMessageId of
  // the turn it is replacing and the previous content so a failed/cancelled
  // attempt can restore the old completed response.
  private regenerateByGenerationId = new Map<string, {
    logicalClientMessageId: string;
    previousContent: string;
  }>();
  // Accumulated partial content per regenerate attempt.
  private regenerateAccumulated = new Map<string, string>();

  private streamMessageId(clientMessageId: string) {
    return `stream:${clientMessageId}`;
  }

  private createStreamMessage(clientMessageId: string): ChatMessage {
    return {
      id: this.streamMessageId(clientMessageId),
      clientMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
  }

  // Append a delta to the one assistant placeholder for this id. Ignores stale
  // (duplicate/out-of-order) chunkIndex values, matching `nextChunkIndex`.
  private appendChunk(clientMessageId: string, chunk: string, chunkIndex: number) {
    const live = this.streamByClientMessageId.get(clientMessageId);
    if (!live) return;
    if (chunkIndex !== live.nextChunkIndex) return; // stale/out-of-order -> ignore
    live.nextChunkIndex += 1;
    live.message = { ...live.message, content: live.message.content + chunk };
    this.config?.onMessageUpdate?.(live.message);
  }

  constructor() {
    this.sessionId = uuidv4();
  }

  initialize(config: ChatServiceConfig) {
    this.config = config;

    // Never create a token-less socket. If the user is logged out, show the
    // login-required state locally instead of attempting a handshake.
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      this.ensureDisconnectedState();
      return;
    }

    this.connect(token);
  }

  // Ensures no socket exists and notifies the UI (locally) that login is required.
  private ensureDisconnectedState() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.currentToken = null;
    this.config?.onDisconnected?.();
    this.config?.onError(SOCKET_AUTH_ERROR_MESSAGES.SOCKET_AUTH_REQUIRED);
    this.config?.onProcessingStatus?.(false);
  }

  private connect(explicitToken?: string | null) {
    const serverUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000';
    const token = explicitToken !== undefined ? explicitToken : localStorage.getItem(ACCESS_TOKEN_KEY);

    // Defensive: never connect an unauthenticated socket.
    if (!token) {
      this.ensureDisconnectedState();
      return;
    }

    this.currentToken = token;

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true,
      auth: { token },
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.socket || !this.config) return;

    // Events from a socket that was disconnected or replaced (e.g. during
    // logout) must be ignored, otherwise a stale handshake failure could still
    // surface as SOCKET_AUTH_REQUIRED after the user logged out.
    const socket = this.socket;

    // Connection events
    socket.on('connect', () => {
      if (this.socket !== socket) return;
      console.log('Connected to chat server:', socket.id);
      this.isConnected = true;
      this.config?.onConnected();
    });

    socket.on('disconnect', (reason) => {
      if (this.socket !== socket) return;
      console.log('Disconnected from chat server:', reason);
      this.isConnected = false;
      this.config?.onDisconnected();
    });

    // Welcome message
    socket.on('welcome', (data) => {
      console.log('Welcome message:', data);
    });

    // AI Response — compatibility path ONLY. Used for:
    //   1. buffered/deterministic branches that intentionally do not stream
    //   2. completed-duplicate replays (the dedup store re-emits a stored
    //      aiResponse-shaped payload)
    // A successful live stream uses aiResponseStart/Chunk/Complete and never
    // delivers aiResponse. Any aiResponse for an already-delivered streaming id
    // is ignored.
    socket.on('aiResponse', (data) => {
      if (this.socket !== socket) return;
      const { sessionId, message, timestamp, clientMessageId } = data;

      if (sessionId === this.sessionId) {
        // A live stream was already delivered for this id — never render a
        // second bubble from a stray/replayed aiResponse.
        if (clientMessageId && this.deliveredStreamIds.has(clientMessageId)) {
          this.config?.onProcessingStatus(false);
          return;
        }

        // Render each response once per clientMessageId. A replayed or
        // duplicated aiResponse for an already-rendered id is ignored.
        if (clientMessageId && this.renderedResponseIds.has(clientMessageId)) {
          this.config?.onProcessingStatus(false);
          return;
        }
        if (clientMessageId) {
          this.renderedResponseIds.add(clientMessageId);
        }

        // This request finished: free the pending slot keyed by the correlation
        // id so a later submission is not blocked.
        if (clientMessageId) {
          this.pendingByClientMessageId.delete(clientMessageId);
          // Buffered/completed final also retires the cancellable generation.
          this.cancellableGenerationIds.delete(clientMessageId);
          if (this.lastCancellableId === clientMessageId) {
            this.lastCancellableId = null;
          }
        }

        const chatMessage: ChatMessage = {
          id: uuidv4(),
          clientMessageId,
          role: 'assistant',
          content: message,
          timestamp: new Date(timestamp),
        };

        this.config?.onMessage(chatMessage);
        this.config?.onProcessingStatus(false);
      }
    });

    // Regenerate stream bookkeeping: when a streamed event carries a fresh
    // generationId that was registered by an accepted regenerate ack, it is a
    // REPLACEMENT attempt for the logical turn, not a new bubble. Route it to
    // the regenerate callbacks so the SAME logical assistant bubble is updated.
    const handleRegenerateStream = (data: {
      sessionId: string;
      clientMessageId?: string;
      generationId?: string;
    }) => {
      const generationId = data?.generationId;
      if (!generationId || !this.regenerateByGenerationId.has(generationId)) return null;
      const logicalClientMessageId =
        this.regenerateByGenerationId.get(generationId)!.logicalClientMessageId;
      if (data.sessionId !== this.sessionId) return null;
      if (logicalClientMessageId !== data.clientMessageId) return null;
      return generationId;
    };

    // Live stream: creates the ONE assistant placeholder per clientMessageId.
    socket.on('aiResponseStart', (data) => {
      if (this.socket !== socket) return;
      const { sessionId, clientMessageId } = data;
      if (!clientMessageId) return;
      if (sessionId !== this.sessionId) return;

      // A regenerate replacement stream — no new bubble; the logical one begins
      // being replaced (the old response stays visible until the first chunk).
      const regenId = handleRegenerateStream(data);
      if (regenId) {
        this.config?.onRegenerateStarted?.(clientMessageId, regenId);
        return;
      }

      // Exactly one placeholder per id; a duplicate start is a no-op.
      if (this.streamByClientMessageId.has(clientMessageId)) return;

      const message = this.createStreamMessage(clientMessageId);
      this.streamByClientMessageId.set(clientMessageId, { message, nextChunkIndex: 0 });
      this.config?.onStreamStart?.(message);
    });

    // Live stream: each chunk is a DELTA appended to the SAME placeholder.
    socket.on('aiResponseChunk', (data) => {
      if (this.socket !== socket) return;
      const { sessionId, clientMessageId, chunk, chunkIndex } = data;
      if (!clientMessageId || typeof chunk !== 'string' || chunk.length === 0) return;
      if (sessionId !== this.sessionId) return;

      const regenId = handleRegenerateStream(data);
      if (regenId) {
        const prev = this.regenerateAccumulated.get(regenId) || '';
        this.regenerateAccumulated.set(regenId, prev + chunk);
        this.config?.onRegenerateUpdate?.(clientMessageId, regenId, prev + chunk);
        return;
      }

      this.appendChunk(clientMessageId, chunk, chunkIndex);
    });

    // Live stream: finalizes the placeholder with authoritative content.
    socket.on('aiResponseComplete', (data) => {
      if (this.socket !== socket) return;
      const { sessionId, clientMessageId, content, timestamp } = data;
      if (!clientMessageId) return;
      if (sessionId !== this.sessionId) return;

      const regenId = handleRegenerateStream(data);
      if (regenId) {
        this.regenerateByGenerationId.delete(regenId);
        this.regenerateAccumulated.delete(regenId);
        this.cancellableGenerationIds.delete(regenId);
        if (this.lastCancellableId === regenId) {
          this.lastCancellableId = null;
        }
        this.config?.onRegenerateComplete?.(clientMessageId, regenId, content, new Date(timestamp));
        this.config?.onProcessingStatus(false);
        return;
      }

      const live = this.streamByClientMessageId.get(clientMessageId);
      if (!live) return;

      this.deliveredStreamIds.add(clientMessageId);
      this.streamByClientMessageId.delete(clientMessageId);
      this.pendingByClientMessageId.delete(clientMessageId);
      // Live success retires the cancellable generation (Stop disappears).
      this.cancellableGenerationIds.delete(clientMessageId);
      if (this.lastCancellableId === clientMessageId) {
        this.lastCancellableId = null;
      }

      // Authoritative content replaces whatever was locally accumulated.
      const finalMessage: ChatMessage = {
        ...live.message,
        content,
        timestamp: new Date(timestamp),
        isLoading: false,
      };
      this.config?.onStreamComplete?.(finalMessage);
      this.config?.onProcessingStatus(false);
    });

    // Error handling
    socket.on('error', (error) => {
      if (this.socket !== socket) return;
      console.error('Chat error:', error);

      // Regenerate attempt failed after partial/replacement: restore old.
      const regenId = error?.generationId;
      if (regenId && this.regenerateByGenerationId.has(regenId)) {
        const { logicalClientMessageId } = this.regenerateByGenerationId.get(regenId)!;
        this.regenerateByGenerationId.delete(regenId);
        this.regenerateAccumulated.delete(regenId);
        this.cancellableGenerationIds.delete(regenId);
        if (this.lastCancellableId === regenId) {
          this.lastCancellableId = null;
        }
        this.config?.onRegenerateFailed?.(logicalClientMessageId, regenId);
        this.config?.onProcessingStatus(false);
        this.config?.onError(error.message || 'Đã xảy ra lỗi khi tạo lại câu trả lời');
        return;
      }

      // Correlated terminal failure: clear (and mark) the matching pending
      // message for this clientMessageId so the user can send again.
      if (error?.clientMessageId) {
        // A streamed placeholder for this id is marked failed and removed.
        const live = this.streamByClientMessageId.get(error.clientMessageId);
        // An in-flight turn (original send OR Retry) is cancellable until its
        // terminal event; captured BEFORE deletion for the early-failure branch.
        const wasActive = this.cancellableGenerationIds.has(error.clientMessageId);
        this.cancellableGenerationIds.delete(error.clientMessageId);
        if (this.lastCancellableId === error.clientMessageId) {
          this.lastCancellableId = null;
        }
        if (live) {
          live.message = { ...live.message, failed: true, isLoading: false };
          this.config?.onStreamError?.(error.clientMessageId);
          this.streamByClientMessageId.delete(error.clientMessageId);
        }
        const pending = this.pendingByClientMessageId.get(error.clientMessageId);
        if (pending) {
          pending.failed = true;
          this.pendingByClientMessageId.delete(error.clientMessageId);
        }
        if (!live && wasActive) {
          // Early failure before any assistant placeholder: the logical USER
          // turn becomes retryable. Guarded on in-flight so legacy/unknown
          // user-only rows are never reconstructed as retryable.
          if (pending) {
            pending.retryable = true;
            pending.generationStatus = 'failed';
          }
          this.config?.onTurnRetryable?.(error.clientMessageId, 'failed');
        }
      }
      this.config?.onError(error.message || 'Đã xảy ra lỗi khi chat');
      this.config?.onProcessingStatus(false);
    });

    // Processing status
    socket.on('messageProcessing', (data) => {
      if (this.socket !== socket) return;
      if (data.sessionId === this.sessionId) {
        // A regenerate attempt terminal event: the data carries the generationId
        // of the attempt. Restore/preserve the old completed response.
        const regenId = data?.generationId;
        if (regenId && this.regenerateByGenerationId.has(regenId)) {
          const { logicalClientMessageId } = this.regenerateByGenerationId.get(regenId)!;
          if (data.status === 'cancelled') {
            this.regenerateByGenerationId.delete(regenId);
            this.regenerateAccumulated.delete(regenId);
            this.cancellableGenerationIds.delete(regenId);
            if (this.lastCancellableId === regenId) {
              this.lastCancellableId = null;
            }
            this.config?.onRegenerateCancelled?.(logicalClientMessageId, regenId);
            this.config?.onProcessingStatus(false);
            return;
          }
          if (data.status === 'error') {
            this.regenerateByGenerationId.delete(regenId);
            this.regenerateAccumulated.delete(regenId);
            this.cancellableGenerationIds.delete(regenId);
            if (this.lastCancellableId === regenId) {
              this.lastCancellableId = null;
            }
            this.config?.onRegenerateFailed?.(logicalClientMessageId, regenId);
            this.config?.onProcessingStatus(false);
            return;
          }
          if (data.status === 'completed') {
            this.cancellableGenerationIds.delete(regenId);
            if (this.lastCancellableId === regenId) {
              this.lastCancellableId = null;
            }
          }
        }

        // User stopped a live generation: finalize the placeholder as cancelled
        // (keeps partial content, not loading) and clear its bookkeeping.
        if (data.status === 'cancelled' && data.clientMessageId) {
          const clientMessageId = data.clientMessageId;
          // An in-flight turn (original send OR a Retry reusing the logical id)
          // is cancellable from 'started'/'accepted' until its terminal event.
          // Captured BEFORE deletion so an early-cancelled turn is still
          // recognized as retryable.
          const wasActive = this.cancellableGenerationIds.has(clientMessageId);
          this.cancellableGenerationIds.delete(clientMessageId);
          if (this.lastCancellableId === clientMessageId) {
            this.lastCancellableId = null;
          }
          const live = this.streamByClientMessageId.get(clientMessageId);
          if (live) {
            live.message = { ...live.message, isLoading: false };
            this.streamByClientMessageId.delete(clientMessageId);
            this.pendingByClientMessageId.delete(clientMessageId);
            this.config?.onStreamCancelled?.(clientMessageId);
          } else if (wasActive) {
            // Early cancellation: a generation was stopped BEFORE any assistant
            // placeholder was created (aiResponseStart never fired). The logical
            // USER turn becomes retryable. Guarded on in-flight so legacy/unknown
            // user-only rows are never reconstructed as retryable.
            const pending = this.pendingByClientMessageId.get(clientMessageId);
            if (pending) {
              pending.cancelled = true;
              pending.retryable = true;
              pending.generationStatus = 'cancelled';
              this.pendingByClientMessageId.delete(clientMessageId);
            }
            this.config?.onTurnRetryable?.(clientMessageId, 'cancelled');
          }
          this.config?.onProcessingStatus(false);
          return;
        }

        // Terminal completion/error also retire the cancellable generation.
        if (data.status === 'completed' && data.clientMessageId) {
          this.cancellableGenerationIds.delete(data.clientMessageId);
          if (this.lastCancellableId === data.clientMessageId) {
            this.lastCancellableId = null;
          }
        }
        if (data.status === 'error' && data.clientMessageId) {
          this.cancellableGenerationIds.delete(data.clientMessageId);
          if (this.lastCancellableId === data.clientMessageId) {
            this.lastCancellableId = null;
          }
        }

        // 'started' makes the request cancellable from its very first instant,
        // well before aiResponseStart (intent/RAG run first). The Stop control
        // is therefore available during thinking, not just while streaming.
        // A regenerate started event carries the attempt generationId as well;
        // prefer it so the Stop control targets the fresh attempt.
        if (data.status === 'started' && (data.clientMessageId || data.generationId)) {
          const cancellableId = data.generationId || data.clientMessageId;
          this.cancellableGenerationIds.add(cancellableId);
          this.lastCancellableId = cancellableId;
        }

        const isProcessing = data.status === 'started';
        this.config?.onProcessingStatus(isProcessing);
      }
    });

    // Connection error
    socket.on('connect_error', (error: SocketConnectError) => {
      if (this.socket !== socket) return;
      const code = error.data?.code;

      if (isSocketAuthErrorCode(code)) {
        const message = getSocketAuthErrorMessage(code) as string;
        console.error('Socket connect error (auth):', code);
        this.isConnected = false;
        this.config?.onError(message);
        this.config?.onProcessingStatus(false);
        // Stop auto-reconnection so invalid tokens are not retried forever.
        this.socket?.disconnect();
        return;
      }

      this.config?.onError('Không thể kết nối đến server chat');
    });
  }

  sendMessage(message: string): ChatMessage | null {
    if (!this.socket || !this.isConnected) {
      this.config?.onError('Chưa kết nối đến server');
      return null;
    }

    const content = message.trim();

    if (!content) {
      this.config?.onError('Tin nhắn không thể để trống');
      return null;
    }

    if (content.length > 1000) {
      this.config?.onError('Tin nhắn quá dài (tối đa 1000 ký tự)');
      return null;
    }

    // Each call to sendMessage is a NEW submission with a fresh correlation id.
    // Message text is never used as an idempotency key, so two independent
    // submissions with identical content remain distinct (two ids, two emits).
    const clientMessageId = uuidv4();

    // Defensive in-flight guard keyed by clientMessageId: never emit the same
    // id twice. The id is fresh per call so this only trips on an internal
    // duplicate replay, never on a re-submission with identical text.
    const inFlight = this.pendingByClientMessageId.get(clientMessageId);
    if (inFlight) {
      return inFlight;
    }

    const userMessage: ChatMessage = {
      id: clientMessageId,
      clientMessageId,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    this.pendingByClientMessageId.set(clientMessageId, userMessage);

    this.socket.emit('sendMessage', {
      sessionId: this.sessionId,
      message: content,
      clientMessageId,
    }, (ack: SendAck) => {
      this.handleSendAck(clientMessageId, ack);
    });

    // Notify config about user message
    this.config?.onMessage(userMessage);
    this.config?.onProcessingStatus(true);

    return userMessage;
  }

  // Process the delivery/dedup ack. The ack is a receipt, NOT a completion
  // signal. The final outcome for an accepted message arrives via `aiResponse`
  // (success) or the `error` event / messageProcessing 'error' (failure), both
  // of which clear the pending entry keyed by clientMessageId.
  //
  // - 'accepted' / 'processing': receipt + dedup state only — DO NOT clear the pending.
  // - 'invalid': terminal validation rejection — clear pending, surface error.
  // - 'completed' (duplicate): delivery receipt for an already-finished id; the
  //   replay arrives via aiResponse, which completes/clears the pending message.
  private handleSendAck(clientMessageId: string, ack: SendAck) {
    if (ack.clientMessageId && ack.clientMessageId !== clientMessageId) return;

    if (ack.status === 'invalid') {
      this.pendingByClientMessageId.delete(clientMessageId);
      this.config?.onError('Tin nhắn không hợp lệ');
      this.config?.onProcessingStatus(false);
    }
  }

  // Stop a live AI generation. Any ACCEPTED generation is cancellable from
  // `messageProcessing started` (before aiResponseStart — thinking phase) until
  // its terminal event. The ack is informational — the terminal outcome arrives
  // via messageProcessing 'cancelled' (keeps partial content) or the normal
  // completion if the server had already finished.
  stopGeneration(clientMessageId: string): boolean {
    const live = this.streamByClientMessageId.get(clientMessageId);
    const cancellable = this.cancellableGenerationIds.has(clientMessageId);
    if (!live && !cancellable) return false;

    this.socket?.emit('stopGeneration', {
      sessionId: this.sessionId,
      clientMessageId,
    });

    return true;
  }

  // Stop an active generation by its ATTEMPT identity. For ordinary send/retry
  // the attempt id is the logical clientMessageId (backward compatible); for a
  // regenerate attempt it is the fresh generationId returned by the accepted
  // ack. The user may still know the logical clientMessageId.
  stopGenerationAttempt(attemptId: string): boolean {
    if (this.cancellableGenerationIds.has(attemptId)) {
      this.socket?.emit('stopGeneration', {
        sessionId: this.sessionId,
        clientMessageId: attemptId,
      });
      return true;
    }
    return false;
  }

  // Retry a logical turn whose last generation failed or was cancelled. Reuses
  // the logical clientMessageId as the generation identity (the server loads
  // the original user content from the owned conversation; no text is sent).
  retryMessage(clientMessageId: string): boolean {
    if (!this.socket || !this.isConnected) {
      this.config?.onError('Chưa kết nối đến server');
      return false;
    }
    if (!clientMessageId) return false;

    this.socket.emit('retryMessage', {
      sessionId: this.sessionId,
      clientMessageId,
    }, (ack: RetryAck) => {
      if (!ack || ack.clientMessageId && ack.clientMessageId !== clientMessageId) return;

      if (ack.status === 'accepted') {
        // Generations are cancellable from the boundary; the ack carries the
        // generation identity (== logical id for retry). It becomes cancellable
        // via messageProcessing 'started' too, but record it now so Stop is
        // available immediately.
        this.cancellableGenerationIds.add(clientMessageId);
        this.lastCancellableId = clientMessageId;
      } else if (ack.status === 'already_processing') {
        this.config?.onError('Tin nhắn đang được xử lý. Vui lòng đợi.');
      } else if (ack.status === 'already_completed') {
        this.config?.onError('Câu trả lời đã hoàn tất. Hãy dùng Regenerate để tạo lại.');
      } else if (ack.status === 'not_found') {
        // Failed to find the owned turn; restore the Retry affordance so the
        // user can try again once the turn exists/loads.
        this.config?.onTurnRetryable?.(clientMessageId, 'failed');
        this.config?.onError('Không tìm thấy lượt trò chuyện cần thử lại.');
      } else if (ack.status === 'invalid') {
        // Validation rejection: nothing changed server-side; restore the affordance.
        this.config?.onTurnRetryable?.(clientMessageId, 'failed');
        this.config?.onError('Yêu cầu không hợp lệ.');
      }
    });

    return true;
  }

  // Regenerate a completed logical turn. Sends the ORIGINAL logical
  // clientMessageId; the server mints a fresh generationId and returns it in
  // the accepted ack. previousContent lets a failed/cancelled attempt restore
  // the old completed response.
  regenerateMessage(clientMessageId: string, previousContent = ''): boolean {
    if (!this.socket || !this.isConnected) {
      this.config?.onError('Chưa kết nối đến server');
      return false;
    }
    if (!clientMessageId) return false;

    this.socket.emit('regenerateMessage', {
      sessionId: this.sessionId,
      clientMessageId,
    }, (ack: RegenerateAck) => {
      if (!ack || ack.clientMessageId && ack.clientMessageId !== clientMessageId) return;

      if (ack.status === 'accepted' && ack.generationId) {
        this.regenerateByGenerationId.set(ack.generationId, {
          logicalClientMessageId: clientMessageId,
          previousContent,
        });
        this.regenerateAccumulated.set(ack.generationId, '');
        // The fresh attempt is cancellable from the boundary.
        this.cancellableGenerationIds.add(ack.generationId);
        this.lastCancellableId = ack.generationId;
        this.config?.onRegenerateAccepted?.(clientMessageId, ack.generationId);
      } else if (ack.status === 'already_processing') {
        this.config?.onError('Lượt trò chuyện này đang được xử lý.');
      } else if (ack.status === 'not_completed') {
        this.config?.onError('Chưa có câu trả lời cũ để tạo lại.');
      } else if (ack.status === 'not_found') {
        this.config?.onError('Không tìm thấy lượt trò chuyện cần tạo lại.');
      } else if (ack.status === 'invalid') {
        this.config?.onError('Yêu cầu không hợp lệ.');
      }
    });

    return true;
  }

  // True while at least one ACCEPTED generation is cancellable — from
  // messageProcessing 'started' through to its terminal event. Used by the UI
  // to show the Stop control for the whole processing window (including the
  // thinking/intent/RAG phase, since the client cannot know the provider type
  // in advance and buffered/deterministic paths never emit aiResponseStart).
  isActiveGeneration(): boolean {
    return this.cancellableGenerationIds.size > 0;
  }

  // The most recent cancellable generation id, or null when none is active.
  getActiveGenerationId(): string | null {
    return this.lastCancellableId;
  }

  // True while at least one live stream placeholder exists. Retained for
  // backward compatibility / fine-grained control; the Stop button should use
  // isActiveGeneration() so it appears before aiResponseStart.
  isLiveStreaming(): boolean {
    return this.streamByClientMessageId.size > 0;
  }

  // Reconnect with a fresh access token (call after login or token refresh).
  reconnectWithToken(token?: string | null): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.connect(token);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
    this.currentToken = null;
    // Free any in-flight slots so a manual resend after reconnect works.
    // (Automatic resend on reconnect is intentionally out of scope.)
    this.pendingByClientMessageId.clear();
    this.streamByClientMessageId.clear();
    this.deliveredStreamIds.clear();
    this.cancellableGenerationIds.clear();
    this.regenerateByGenerationId.clear();
    this.regenerateAccumulated.clear();
    this.lastCancellableId = null;
  }

  // Keep the socket in sync with the current auth token.
  // Call after password login, Google login, hydration, token refresh, or logout.
  // When the token is omitted it is re-read from localStorage; null means logged out.
  syncAuthentication(token?: string | null): void {
    const resolved = token !== undefined ? token : localStorage.getItem(ACCESS_TOKEN_KEY);
    const nextToken = resolved && resolved.length > 0 ? resolved : null;

    if (!nextToken) {
      this.ensureDisconnectedState();
      return;
    }

    if (!this.socket) {
      this.connect(nextToken);
      return;
    }

    if (this.currentToken !== nextToken) {
      this.reconnectWithToken(nextToken);
    }
  }

  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // Reset session (tạo sessionId mới)
  resetSession() {
    this.sessionId = uuidv4();
    this.pendingByClientMessageId.clear();
    this.streamByClientMessageId.clear();
    this.deliveredStreamIds.clear();
    this.renderedResponseIds.clear();
    this.cancellableGenerationIds.clear();
    this.regenerateByGenerationId.clear();
    this.regenerateAccumulated.clear();
    this.lastCancellableId = null;
  }
}

export default new ChatService();
