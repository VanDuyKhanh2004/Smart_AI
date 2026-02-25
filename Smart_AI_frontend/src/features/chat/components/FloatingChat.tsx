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
  const [error, setError] = useState<string | null>(null);
  const isInitialized = useRef(false);

  const initializeChatService = useCallback(() => {
    if (isInitialized.current) return;

    const config: ChatServiceConfig = {
      onMessage: (message) => {
        setMessages(prev => {
          // Remove loading message if exists
          const withoutLoading = prev.filter(msg => !msg.isLoading);
          return [...withoutLoading, message];
        });
        setError(null);
      },
      onError: (errorMessage) => {
        setError(errorMessage);
        setIsProcessing(false);
        // Remove loading message
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
          // Add loading message only if not already present
          setMessages(prev => {
            const hasLoadingMessage = prev.some(msg => msg.isLoading);
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
          // Remove loading message when processing is done
          setMessages(prev => prev.filter(msg => !msg.isLoading));
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
        error={error}
        onSendMessage={handleSendMessage}
        onReset={handleReset}
      />
    </>
  );
};

export default FloatingChat;
