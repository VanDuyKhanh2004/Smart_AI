import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle, X, Minimize2 } from 'lucide-react';
import ChatWindow from './ChatWindow';
import chatService, { type ChatMessage as ChatMessageType, type ChatServiceConfig } from '@/services/chat.service';
import { getSelectedSession, getRestoreMode } from '@/services/chatPersistence';
import { getConversation, hydrateMessages } from '@/services/chatHistory.service';

const FloatingChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const isInitialized = useRef(false);
  // The previous completed assistant content per logical clientMessageId, so a
  // failed/cancelled regenerate can restore it.
  const previousContentRef = useRef<Record<string, string>>({});
  // Mirror of `messages` for callback use (setMessages is async). Used by the
  // connected handler so the welcome message is only ever added when the chat is
  // otherwise empty (hydration content, if any, is never overwritten).
  const messagesRef = useRef<ChatMessageType[]>([]);
  const hydrationStartedRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // The Stop control shows for the whole processing window of an accepted
  // generation (messageProcessing 'started' -> terminal event), NOT just after
  // aiResponseStart. The client cannot know the provider type in advance
  // (intent/RAG run first, and buffered/deterministic never emit aiResponseStart),
  // so the Stop button is available from the very first processing instant.
  const isActiveGeneration = activeGenerationId !== null;

  const addWelcomeMessage = useCallback(() => {
    // A welcome greeting is added only when the chat is otherwise empty — never
    // over content that was already rendered (hydrated history or prior turns).
    if (messagesRef.current.length > 0) return;
    const welcomeMessage: ChatMessageType = {
      id: 'welcome',
      role: 'assistant',
      content: 'Dạ điện thoại giá kho xin chào! Em là Quỳnh Như nhân viên chăm sóc khách hàng của Điện thoại giá kho. Em có thể giúp gì cho mình ạ?',
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  }, []);

  // Trigger history hydration exactly once per mount when there is a selected
  // session to resume. Guard against user A / user B cross-contamination: the
  // selected-session hint is only honored while the current restore mode is
  // 'selected'; after logout or a New Chat the mode is 'new' and hydration is
  // skipped (and the same browser can never hydrate a previous user's chat).
  const handleConnected = useCallback(() => {
    if (hydrationStartedRef.current) return;
    if (getRestoreMode() !== 'selected') {
      addWelcomeMessage();
      return;
    }
    const selected = getSelectedSession();
    if (!selected) {
      addWelcomeMessage();
      return;
    }

    hydrationStartedRef.current = true;
    setIsHydrating(true);
    setHistoryError(null);

    getConversation(selected)
      .then((detail) => {
        const hydrated = hydrateMessages(detail?.messages);
        // Adopt the restored session into the socket service so subsequent
        // sends/turns continue the resumed conversation.
        chatService.restoreSession(detail.sessionId);
        if (hydrated.length > 0) {
          setMessages(hydrated);
        } else {
          addWelcomeMessage();
        }
      })
      .catch(() => {
        // Hydration failed (e.g. foreign/404, network). Fall back to a fresh
        // session rather than blocking the chat; the session is never pushed
        // as selected (the previous session hint is cleared so future reloads
        // do not retry the unresolvable session).
        chatService.resetSession();
        addWelcomeMessage();
        setHistoryError('Không thể tải lại cuộc trò chuyện trước đó.');
      })
      .finally(() => {
        setIsHydrating(false);
      });
  }, [addWelcomeMessage]);

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
      // Retry: no new bubble — reuse an existing loading placeholder or the
      // stream placeholder so exactly one assistant response is rendered.
      onRetryStarted: (clientMessageId) => {
        setMessages(prev => {
          const withoutLoading = prev.filter(msg => !msg.isLoading && msg.id !== 'loading');
          const alreadyHasStream = withoutLoading.some(msg => msg.id === `stream:${clientMessageId}`);
          if (alreadyHasStream) return withoutLoading;
          const loadingMessage: ChatMessageType = {
            id: `stream:${clientMessageId}`,
            clientMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isLoading: true,
          };
          return [...withoutLoading, loadingMessage];
        });
      },
      // A logical turn ended terminally BEFORE any assistant placeholder was
      // created (early cancel/failure). Mark the USER bubble retryable so the
      // feature is reachable for exactly the early-cancelled/failed case it is
      // meant to serve. No empty assistant bubble is created.
      onTurnRetryable: (clientMessageId, status) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.clientMessageId === clientMessageId && msg.role === 'user'
              ? {
                  ...msg,
                  retryable: true,
                  generationStatus: status,
                  cancelled: status === 'cancelled' ? true : msg.cancelled,
                  failed: status === 'failed' ? true : msg.failed,
                  isLoading: false,
                }
              : msg
          )
        );
      },
      // Regenerate accepted: nothing visibly changes yet — the old completed
      // response stays until the new attempt actually begins (onRegenerateStarted).
      onRegenerateAccepted: () => {},
      // Regenerate stream begins: mark the logical bubble as regenerating. The
      // old content remains visible until the first chunk arrives.
      onRegenerateStarted: (clientMessageId) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.clientMessageId === clientMessageId && msg.role === 'assistant'
              ? { ...msg, regenerating: true, isLoading: false }
              : msg
          )
        );
      },
      // Regenerate stream deltas: replace content in the SAME logical bubble.
      onRegenerateUpdate: (clientMessageId, _generationId, content) => {
        setMessages(prev =>
          prev.map(msg =>
            msg.clientMessageId === clientMessageId && msg.role === 'assistant'
              ? { ...msg, content }
              : msg
          )
        );
      },
      // Regenerate success: replace the same logical bubble with the new content.
      onRegenerateComplete: (clientMessageId, _generationId, content, timestamp) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.clientMessageId === clientMessageId && msg.role === 'assistant'
              ? { ...msg, content, timestamp, regenerating: false, isLoading: false, failed: false, cancelled: false }
              : msg
          )
        );
        setError(null);
        delete previousContentRef.current[clientMessageId];
      },
      // Regenerate failed/cancelled: preserve (restore) the old completed
      // response captured when the regenerate was clicked.
      onRegenerateFailed: (clientMessageId) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.clientMessageId === clientMessageId && msg.role === 'assistant'
              ? { ...msg, regenerating: false, isLoading: false, content: previousContentRef.current[clientMessageId] ?? msg.content }
              : msg
          )
        );
      },
      onRegenerateCancelled: (clientMessageId) => {
        setActiveGenerationId(null);
        setMessages(prev =>
          prev.map(msg =>
            msg.clientMessageId === clientMessageId && msg.role === 'assistant'
              ? { ...msg, regenerating: false, isLoading: false, content: previousContentRef.current[clientMessageId] ?? msg.content }
              : msg
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
        // On load, if this is a NEW chat (no selected session to resume), show
        // the welcome greeting. Otherwise the very first connected handler
        // triggers history hydration, which loads real content instead.
        handleConnected();
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
  }, [handleConnected]);

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
    setHistoryError(null);
    isInitialized.current = false;
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    setIsOpen(false);
  };

  // "New Chat": fresh session, never resumed on reload until the next send.
  // resetSession() switches the persistence hint to 'new' and clears any
  // selected session, so hydration is skipped on the reconnect below.
  const handleReset = () => {
    chatService.resetSession();
    setMessages([]);
    setError(null);
    setHistoryError(null);
    setIsProcessing(false);
    setActiveGenerationId(null);
    hydrationStartedRef.current = false;
    addWelcomeMessage();

    // Reconnect with new session
    chatService.disconnect();
    isInitialized.current = false;
    setTimeout(() => {
      initializeChatService();
    }, 100);
  };

  const handleSendMessage = (message: string) => {
    // Block sending while history hydration is in flight so a premature send in
    // the restored session is never raced against the content that is loading.
    if (isHydrating) return false;
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
    // The active generation identity: for ordinary send/retry it is the logical
    // clientMessageId; for a regenerate attempt it is the fresh generationId.
    chatService.stopGenerationAttempt(activeGenerationId);
  };

  const handleRetryMessage = (message: ChatMessageType) => {
    if (!message.clientMessageId) return;
    // Spec G: remove/disable the Retry affordance immediately and mark the
    // logical turn processing. The user bubble is NOT re-appended (the server
    // loads the original content and re-runs generation).
    setMessages(prev =>
      prev.map(msg =>
        msg.clientMessageId === message.clientMessageId
          ? { ...msg, retryable: false, generationStatus: undefined, failed: false, cancelled: false, isLoading: false }
          : msg
      )
    );
    chatService.retryMessage(message.clientMessageId);
  };

  const handleRegenerateMessage = (message: ChatMessageType) => {
    if (!message.clientMessageId) return;
    previousContentRef.current[message.clientMessageId] = message.content;
    chatService.regenerateMessage(message.clientMessageId, message.content);
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
        error={error || historyError}
        isHydrating={isHydrating}
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        onReset={handleReset}
        onRetryMessage={handleRetryMessage}
        onRegenerateMessage={handleRegenerateMessage}
      />
    </>
  );
};

export default FloatingChat;
