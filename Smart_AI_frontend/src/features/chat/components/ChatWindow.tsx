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
  /** W4-M03: non-destructive hide (keeps the session alive) — used by Escape. */
  onHide?: () => void;
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

// W4-M03: Tab containment only applies on small (non-widened) viewports, where
// the chat panel behaves like an overlay dialog.
const isMobileViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 640px)').matches;

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  isOpen, 
  onClose, 
  onHide,
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

  // W4-M02/M04: panel focus management.
  const panelRef = useRef<HTMLDivElement>(null);
  const hadFocusInPanelRef = useRef(false);
  const composerDisabled = !isConnected || isProcessing || isHydrating;
  const composerDisabledRef = useRef(composerDisabled);

  useEffect(() => {
    composerDisabledRef.current = composerDisabled;
  }, [composerDisabled]);

  // Track focus inside the panel and restore focus that was destroyed when
  // the composer became disabled while it held focus (W4-M04).
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const handleFocusIn = (event: FocusEvent) => {
      hadFocusInPanelRef.current = panel.contains(event.target as Node);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget) {
        hadFocusInPanelRef.current = panel.contains(event.relatedTarget as Node);
        return;
      }
      const target = event.target as Node | null;
      if (!target || !panel.contains(target)) return;
      // Focus went to nowhere (element disabled / removed). After the browser
      // settles, pull focus back into the panel if the composer is disabled.
      hadFocusInPanelRef.current = true;
      window.setTimeout(() => {
        const active = document.activeElement;
        if (
          composerDisabledRef.current &&
          hadFocusInPanelRef.current &&
          panelRef.current &&
          (!active || active === document.body)
        ) {
          panelRef.current.focus();
        }
      }, 0);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isOpen]);

  // W4-M04: fallback for browsers that blur a focused element synchronously
  // when it becomes disabled (focus lands on <body> without a focusout to us).
  useEffect(() => {
    if (!isOpen || !composerDisabled) return;
    const active = document.activeElement;
    if (hadFocusInPanelRef.current && (!active || active === document.body)) {
      panelRef.current?.focus();
    }
  }, [composerDisabled, isOpen]);

  // W4-M02: move focus into the panel when it opens.
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const textarea = panel.querySelector<HTMLTextAreaElement>('textarea');
    if (textarea && !textarea.disabled) {
      textarea.focus();
    } else {
      panel.focus();
    }
  }, [isOpen]);

  // W4-M04: when the composer becomes usable again while focus is parked on
  // the panel root, continue in the composer.
  useEffect(() => {
    if (!isOpen || composerDisabled) return;
    const panel = panelRef.current;
    if (document.activeElement === panel) {
      panel?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }
  }, [composerDisabled, isOpen]);

  // W4-M03: Escape hides non-destructively; Tab stays inside the panel on
  // mobile viewports.
  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (onHide) {
        e.preventDefault();
        onHide();
      }
      return;
    }

    if (e.key === 'Tab' && isMobileViewport()) {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active ? panel.contains(active) : false;

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

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
      ref={panelRef}
      tabIndex={-1}
      aria-label="Chat với CSKH ĐTGK"
      onKeyDown={handlePanelKeyDown}
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
