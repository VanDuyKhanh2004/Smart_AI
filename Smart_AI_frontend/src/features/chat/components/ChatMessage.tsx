import React from "react";
import { Badge } from "@/components/ui/badge";
import { User, RotateCw, RefreshCw } from "lucide-react";
import type { ChatMessage } from "@/services/chat.service";
import {
  Message,
  MessageContent,
  MessageAvatar,
} from "@/components/ui/shadcn-io/ai";
import { Response } from "@/components/ui/shadcn-io/ai/response";
import { Loader } from "@/components/ui/shadcn-io/ai/loader";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
  onRegenerate?: (message: ChatMessage) => void;
  canRetry?: boolean;
  canRegenerate?: boolean;
  disabled?: boolean;
}

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  onRetry,
  onRegenerate,
  canRetry,
  canRegenerate,
  disabled,
}) => {
  const isUser = message.role === "user";
  const isLoading = message.isLoading;

  const formatTime = (timestamp: Date) => {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp);
  };

  return (
    <Message from={isUser ? "user" : "assistant"} className="mb-4">
      <MessageAvatar
        src={
          isUser
            ? ""
            : "https://images.pexels.com/photos/1391498/pexels-photo-1391498.jpeg"
        }
        name={isUser ? "Bạn" : "Quỳnh Như"}
        className={isUser ? "bg-secondary" : ""}
      />
      <div className="flex flex-col gap-1">
        <MessageContent>
          {isLoading && !message.content ? (
            <div className="flex items-center gap-2">
              <Loader size={16} />
              <span className="text-sm">Quỳnh Như đang trả lời...</span>
            </div>
          ) : (
            <Response className={`text-sm ${isLoading ? 'streaming' : ''}`}>
              {`${message.content}${isLoading ? '▍' : ''}`}
            </Response>
          )}
        </MessageContent>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
          {isUser && (
            <Badge variant="outline" className="text-xs">
              <User className="w-3 h-3 mr-1" />
              Bạn
            </Badge>
          )}
          {isUser && canRetry && (
            <Badge variant="secondary" className="text-xs">
              {message.generationStatus === 'cancelled' ? 'Đã dừng' : 'Thất bại'}
            </Badge>
          )}
          {!isUser && !isLoading && message.cancelled && (
            <Badge variant="secondary" className="text-xs">
              Đã dừng
            </Badge>
          )}
          {!isUser && !isLoading && message.regenerating && (
            <Badge variant="secondary" className="text-xs">
              Đang tạo lại...
            </Badge>
          )}
          {!isUser && !isLoading && !message.cancelled && !message.regenerating && (
            <Badge variant="outline" className="text-xs">
              Quỳnh Như
            </Badge>
          )}
          {!isLoading && canRetry && onRetry && !message.regenerating && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(message)}
              disabled={disabled}
              title="Thử lại"
              className="h-6 px-2 text-xs"
            >
              <RotateCw className="w-3 h-3 mr-1" />
              Thử lại
            </Button>
          )}
          {!isUser && !isLoading && canRegenerate && onRegenerate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRegenerate(message)}
              disabled={disabled}
              title="Tạo lại câu trả lời"
              className="h-6 px-2 text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Tạo lại
            </Button>
          )}
        </div>
      </div>
    </Message>
  );
};

export default ChatMessageComponent;
