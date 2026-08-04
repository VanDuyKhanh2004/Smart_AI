import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const ACCESS_TOKEN_KEY = 'accessToken';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export interface ChatServiceConfig {
  onMessage: (message: ChatMessage) => void;
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

    // AI Response
    socket.on('aiResponse', (data) => {
      if (this.socket !== socket) return;
      const { sessionId, message, timestamp } = data;

      if (sessionId === this.sessionId) {
        const chatMessage: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: message,
          timestamp: new Date(timestamp),
        };

        this.config?.onMessage(chatMessage);
        this.config?.onProcessingStatus(false);
      }
    });

    // Error handling
    socket.on('error', (error) => {
      if (this.socket !== socket) return;
      console.error('Chat error:', error);
      this.config?.onError(error.message || 'Đã xảy ra lỗi khi chat');
      this.config?.onProcessingStatus(false);
    });

    // Processing status
    socket.on('messageProcessing', (data) => {
      if (this.socket !== socket) return;
      if (data.sessionId === this.sessionId) {
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

    if (!message.trim()) {
      this.config?.onError('Tin nhắn không thể để trống');
      return null;
    }

    if (message.length > 1000) {
      this.config?.onError('Tin nhắn quá dài (tối đa 1000 ký tự)');
      return null;
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date(),
    };

    // Send to server
    this.socket.emit('sendMessage', {
      sessionId: this.sessionId,
      message: message.trim(),
    });

    // Notify config about user message
    this.config?.onMessage(userMessage);
    this.config?.onProcessingStatus(true);

    return userMessage;
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
  }
}

export default new ChatService();
