import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Minimize2, RotateCcw } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/services/chat.service';
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
  error: string | null;
  onSendMessage: (message: string) => boolean;
  onReset: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  isOpen, 
  onClose, 
  onMinimize, 
  messages, 
  isConnected, 
  isProcessing, 
  error, 
  onSendMessage, 
  onReset 
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isProcessing || !isConnected) return;

    const success = onSendMessage(inputMessage);
    if (success) {
      setInputMessage('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[600px] z-50 shadow-2xl">
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
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onMinimize}>
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}
          
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          
          <div ref={messagesEndRef} />
        </CardContent>

        <CardFooter className="border-t p-2">
          <PromptInput onSubmit={handleSubmit} className="w-full">
            <PromptInputTextarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={isConnected ? "Nhập tin nhắn..." : "Đang kết nối..."}
              disabled={!isConnected || isProcessing}
              className="min-h-[40px] max-h-[120px]"
            />
            <PromptInputToolbar>
              <PromptInputTools />
              <PromptInputSubmit
                disabled={!inputMessage.trim() || !isConnected || isProcessing}
                status={isProcessing ? 'streaming' : undefined}
                className="rounded-full"
              />
            </PromptInputToolbar>
          </PromptInput>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ChatWindow;
