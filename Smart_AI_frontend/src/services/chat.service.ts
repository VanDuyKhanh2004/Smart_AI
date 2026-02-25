import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

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

class ChatService {
  private socket: Socket | null = null;
  private sessionId: string;
  private config: ChatServiceConfig | null = null;
  private isConnected = false;

  constructor() {
    this.sessionId = uuidv4();
  }

  initialize(config: ChatServiceConfig) {
    this.config = config;
    this.connect();
  }

  private connect() {
    const serverUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000';
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true,
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.socket || !this.config) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to chat server:', this.socket?.id);
      this.isConnected = true;
      this.config?.onConnected();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from chat server:', reason);
      this.isConnected = false;
      this.config?.onDisconnected();
    });

    // Welcome message
    this.socket.on('welcome', (data) => {
      console.log('Welcome message:', data);
    });

    // AI Response
    this.socket.on('aiResponse', (data) => {
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
    this.socket.on('error', (error) => {
      console.error('Chat error:', error);
      this.config?.onError(error.message || 'Đã xảy ra lỗi khi chat');
      this.config?.onProcessingStatus(false);
    });

    // Processing status
    this.socket.on('messageProcessing', (data) => {
      if (data.sessionId === this.sessionId) {
        const isProcessing = data.status === 'started';
        this.config?.onProcessingStatus(isProcessing);
      }
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
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

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
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
