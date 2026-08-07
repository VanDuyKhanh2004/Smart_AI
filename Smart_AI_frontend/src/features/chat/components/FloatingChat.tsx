import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle, X, Minimize2 } from 'lucide-react';
import ChatWindow from './ChatWindow';
import chatService, { type ChatMessage as ChatMessageType, type ChatServiceConfig } from '@/services/chat.service';

const FloatingChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isInitialized = useRef(false);

  // The Stop control shows for the whole processing window of an accepted
  // generation (messageProcessing 'started' -> terminal event), NOT just after
  // aiResponseStart. The client cannot know the provider type in advance
  // (intent/RAG run first, and buffered/deterministic never emit aiResponseStart),
  // so the Stop button is available from the very first processing instant.
  const isActiveGeneration = activeGenerationId !== null;

  const initializeChatService = useCallback(() => {
    if (isInitialized.current) return;

    const config: ChatServiceConfig = {
      // Compatibility path (buffered/deterministic, or completed replay): a
      // full assistant message replaces any transient loading / stream bubble.
      onMessage: (message) => {
        setMessages(prev => {
          const withoutLoading = prev.filter(msg => !msg.isLoading && !(msg.id === `stream:${message.clientMessageId}`));
          return [...withoutLoading, message];
        });
        setError(null);
      },
      // Live stream: create the ONE assistant placeholder for this id and drop
      // the generic loading bubble.
      onStreamStart: (message) => {
        // Fallback: the cancellable id is normally set from messageProcessing
        // 'started' via onProcessingStatus; here we keep the SAME id through the
        // transition to the streaming placeholder so Stop stays available.
        setActiveGenerationId(message.clientMessageId ?? chatService.getActiveGenerationId() ?? null);
        setMessages(prev => {
          const withoutLoading = prev.filter(msg => !msg.isLoading);
          if (withoutLoading.some(m => m.id === message.id)) return withoutLoading;
          return [...withoutLoading, message];
        });
      },
      // Live stream: append deltas into that same assistant message.
      onMessageUpdate: (partial) => {
        setMessages(prev => {
          const found = prev.some(msg => msg.id === `stream:${partial.clientMessageId}`);
          if (!found) return [...prev, partial];
          return prev.map(msg =>
            msg.id === `stream:${partial.clientMessageId}` ? { ...msg, content: partial.content } : msg
          );
        });
      },
      // Live stream: finalize the SAME placeholder with authoritative content.
      onStreamComplete: (message) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.id === `stream:${message.clientMessageId}` ? { ...msg, content: message.content, isLoading: false } : msg
          )
        );
        setError(null);
      },
      // Correlated terminal failure for a streamed id: mark that placeholder
      // failed and stop showing its loading state.
      onStreamError: (clientMessageId) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.id === `stream:${clientMessageId}` ? { ...msg, failed: true, isLoading: false } : msg
          )
        );
      },
      // User stopped the live stream: keep the partial content, drop loading.
      onStreamCancelled: (clientMessageId) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.id === `stream:${clientMessageId}` ? { ...msg, cancelled: true, isLoading: false } : msg
          )
        );
      },
      onError: (errorMessage) => {
        setError(errorMessage);
        setIsProcessing(false);
        // Remove loading bubbles (stream placeholders are handled via onStreamError).
        setMessages(prev => prev.filter(msg => !msg.isLoading));
      },
      onConnected: () => {
        setIsConnected(true);
        setError(null);
        // Add welcome message
        const welcomeMessage: ChatMessageType = {
          id: 'welcome',
          role: 'assistant',
          content: 'Dạ điện thoại giá kho xin chào! Em là Quỳnh Như nhân viên chăm sóc khách hàng của Điện thoại giá kho. Em có thể giúp gì cho mình ạ?',
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      },
      onDisconnected: () => {
        setIsConnected(false);
        setError('Mất kết nối với server');
      },
      onProcessingStatus: (processing) => {
        setIsProcessing(processing);
        if (processing) {
          // An accepted generation started: make it cancellable. The id comes
          // from chatService (messageProcessing 'started' already recorded it).
          // Without a stream placeholder yet (thinking/intent/RAG phase) the
          // Stop control is still shown via isActiveGeneration.
          setActiveGenerationId(chatService.getActiveGenerationId());
          // Add a generic loading bubble ONLY while waiting for aiResponseStart.
          // Once a stream placeholder exists, this generic bubble is removed.
          setMessages(prev => {
            const hasLoadingMessage = prev.some(msg => msg.id === 'loading');
            if (!hasLoadingMessage) {
              const loadingMessage: ChatMessageType = {
                id: 'loading',
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                isLoading: true,
              };
              return [...prev, loadingMessage];
            }
            return prev;
          });
        } else {
          // Terminal for the current generation (completed/cancelled/error/
          // compatibility response): the Stop control disappears.
          setActiveGenerationId(null);
          // Remove only the generic 'loading' bubble, keep finalized streams.
          setMessages(prev => prev.filter(msg => msg.id !== 'loading'));
        }
      },
    };

    chatService.initialize(config);
    isInitialized.current = true;
  }, []);

  const handleToggle = () => {
    if (isMinimized) {
      setIsMinimized(false);
      setIsOpen(true);
    } else if (!isOpen) {
      setIsOpen(true);
      if (!isInitialized.current) {
        initializeChatService();
      }
    } else {
      setIsOpen(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
    // Disconnect and reset state
    chatService.disconnect();
    setMessages([]);
    setIsConnected(false);
    setIsProcessing(false);
    setActiveGenerationId(null);
    setError(null);
    isInitialized.current = false;
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    setIsOpen(false);
  };

  const handleReset = () => {
    chatService.resetSession();
    setMessages([]);
    setError(null);
    setIsProcessing(false);
    setActiveGenerationId(null);
    
    // Reconnect with new session
    chatService.disconnect();
    isInitialized.current = false;
    setTimeout(() => {
      initializeChatService();
    }, 100);
  };

  const handleSendMessage = (message: string) => {
    if (!message.trim() || isProcessing || !isConnected) return false;

    const userMessage = chatService.sendMessage(message);
    if (userMessage) {
      setError(null);
      return true;
    }
    return false;
  };

  const handleStopGeneration = () => {
    if (!activeGenerationId) return;
    chatService.stopGeneration(activeGenerationId);
  };

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-40">
        {isMinimized && (
          <div className="mb-2">
            <div className="bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2 max-w-xs">
              <MessageCircle className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate">
                Chat đang được thu nhỏ
              </span>
              <div className="flex gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggle}
                  className="h-6 w-6 p-0"
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <Button
          onClick={handleToggle}
          size="lg"
          className="rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>

        
      </div>

      {/* Chat Window */}
      <ChatWindow
        isOpen={isOpen}
        onClose={handleClose}
        onMinimize={handleMinimize}
        messages={messages}
        isConnected={isConnected}
        isProcessing={isProcessing}
        isActiveGeneration={isActiveGeneration}
        error={error}
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        onReset={handleReset}
      />
    </>
  );
};

export default FloatingChat;
