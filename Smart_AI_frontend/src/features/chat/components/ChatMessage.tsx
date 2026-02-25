import React from "react";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";
import type { ChatMessage } from "@/services/chat.service";
import {
  Message,
  MessageContent,
  MessageAvatar,
} from "@/components/ui/shadcn-io/ai";
import { Response } from "@/components/ui/shadcn-io/ai/response";
import { Loader } from "@/components/ui/shadcn-io/ai/loader";

interface ChatMessageProps {
  message: ChatMessage;
}

const ChatMessageComponent: React.FC<ChatMessageProps> = ({ message }) => {
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
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader size={16} />
              <span className="text-sm">Quỳnh Như đang trả lời...</span>
            </div>
          ) : (
            <Response className="text-sm">
              {message.content}
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
          {!isUser && !isLoading && (
            <Badge variant="outline" className="text-xs">
              Quỳnh Như
            </Badge>
          )}
        </div>
      </div>
    </Message>
  );
};

export default ChatMessageComponent;
