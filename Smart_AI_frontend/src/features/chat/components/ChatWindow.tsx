import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, Minimize2, RotateCcw, Square } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/services/chat.service';
import { useCompareStore } from '@/stores/compareStore';
import { cn } from '@/lib/utils';
import ChatMessage from './ChatMessage';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputSubmit,
} from '@/components/ui/shadcn-io/ai';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  messages: ChatMessageType[];
  isConnected: boolean;
  isProcessing: boolean;
  isActiveGeneration: boolean;
  isHydrating?: boolean;
  error: string | null;
  onSendMessage: (message: string) => boolean;
  onStopGeneration: () => void;
  onReset: () => void;
  onRetryMessage?: (message: ChatMessageType) => void;
  onRegenerateMessage?: (message: ChatMessageType) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  isOpen, 
  onClose, 
  onMinimize, 
  messages, 
  isConnected, 
  isProcessing, 
  isActiveGeneration,
  isHydrating = false,
  error, 
  onSendMessage, 
  onStopGeneration,
  onReset,
  onRetryMessage,
  onRegenerateMessage,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [status, setStatus] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // W3-01: true from the moment a generation starts until its completion
  // (or failure) has been announced through the status region.
  const wasProcessingRef = useRef(false);
  // W3-06: keep the window clear of the floating CompareBar when visible.
  const hasCompareItems = useCompareStore((state) => state.items.length > 0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [isOpen, messages.length]);

  // W3-01: the transcript is no longer a live region (streaming tokens must
  // not be announced), so processing / error / completion are announced once
  // through this single polite status region instead.
  useEffect(() => {
    if (isProcessing) {
      wasProcessingRef.current = true;
      setStatus('Đang trả lời...');
      return;
    }
    if (error) {
      wasProcessingRef.current = false;
      setStatus(error);
      return;
    }
    if (wasProcessingRef.current) {
      const lastAssistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && !message.isLoading);
      if (lastAssistant?.content) {
        wasProcessingRef.current = false;
        setStatus(`Hoàn tất. ${lastAssistant.content}`);
      } else {
        // The final content has not been rendered yet; announce the completion
        // now and keep waiting so the full answer is announced when it lands.
        setStatus('Hoàn tất');
      }
    }
  }, [isProcessing, error, messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isHydrating) return;
    if (!inputMessage.trim() || isProcessing || !isConnected) return;

    const success = onSendMessage(inputMessage);
    if (success) {
      setInputMessage('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed right-4 left-4 sm:left-auto sm:w-96 h-[600px] z-50 shadow-2xl',
        hasCompareItems
          ? 'bottom-20 max-h-[calc(100dvh_-_8rem)]'
          : 'bottom-4 max-h-[calc(100dvh_-_4rem)]'
      )}
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Chat với CSKH ĐTGK</h3>
            <Badge variant={isConnected ? "default" : "destructive"} className="text-xs">
              {isConnected ? "Đã kết nối" : "Mất kết nối"}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={!isConnected}
              title="Bắt đầu cuộc trò chuyện mới"
              aria-label="Bắt đầu cuộc trò chuyện mới"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onMinimize}
              aria-label="Thu nhỏ cửa sổ chat"
            >
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Đóng cửa sổ chat"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>

        {/* W3-01: single polite status region for processing / error / completion */}
        <div role="status" aria-live="polite" className="sr-only">
          {status}
        </div>

        {/* Transcript: history only — not a live region, so streaming tokens
            are never announced (W3-01) */}
        <CardContent
          className="flex-1 overflow-y-auto p-4 space-y-4"
          role="log"
          aria-live="off"
          aria-label="Lịch sử trò chuyện với CSKH"
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {isHydrating && messages.length === 0 && (
            <div className="flex items-center justify-center text-sm text-muted-foreground py-4">
              Đang tải cuộc trò chuyện trước đó...
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onRetry={onRetryMessage}
              onRegenerate={onRegenerateMessage}
              canRetry={
                ((
                  // Partial assistant that was cancelled/failed keeps its partial
                  // content and hosts Retry.
                  message.role === 'assistant' &&
                  !message.isLoading &&
                  (message.failed === true || message.cancelled === true) &&
                  !!message.clientMessageId
                ) || (
                  // An early-cancelled/failed logical turn (no assistant
                  // placeholder was ever created) hosts Retry on the USER bubble.
                  message.role === 'user' &&
                  message.retryable === true &&
                  !!message.clientMessageId
                )) && !message.regenerating
              }
              canRegenerate={
                message.role === 'assistant' &&
                !message.isLoading &&
                message.failed !== true &&
                message.cancelled !== true &&
                !!message.clientMessageId
              }
              disabled={isProcessing}
            />
          ))}
          
          <div ref={messagesEndRef} />
        </CardContent>

        <CardFooter className="border-t p-2">
          <PromptInput onSubmit={handleSubmit} className="w-full">
            <PromptInputTextarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                isHydrating
                  ? "Đang tải cuộc trò chuyện..."
                  : isConnected
                    ? "Nhập tin nhắn..."
                    : "Đang kết nối..."
              }
              disabled={!isConnected || isProcessing || isHydrating}
              className="min-h-[40px] max-h-[120px]"
            />
            <PromptInputToolbar>
              <PromptInputTools />
              {isActiveGeneration ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={onStopGeneration}
                  disabled={!isConnected}
                  title="Dừng trả lời"
                  aria-label="Dừng trả lời"
                  className="rounded-full shrink-0"
                >
                  <Square className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <PromptInputSubmit
                  disabled={!inputMessage.trim() || !isConnected || isProcessing || isHydrating}
                  status={isProcessing ? 'streaming' : undefined}
                  className="rounded-full"
                />
              )}
            </PromptInputToolbar>
          </PromptInput>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ChatWindow;
