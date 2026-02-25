import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Answer } from '@/types/qa.type';
import { Bot, ShieldCheck, Info } from 'lucide-react';

interface AnswerItemProps {
  answer: Answer;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AnswerItem({ answer }: AnswerItemProps) {
  const isAI = answer.isAISuggestion;
  const isOfficial = answer.isOfficial;

  return (
    <div className="flex gap-3 pl-4 border-l-2 border-muted">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={`text-xs ${isAI ? 'bg-purple-100 text-purple-700' : isOfficial ? 'bg-blue-100 text-blue-700' : 'bg-muted'}`}>
          {isAI ? <Bot className="h-4 w-4" /> : getInitials(answer.user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-sm">
            {isAI ? 'AI Assistant' : answer.user.name}
          </span>
          {isOfficial && (
            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-xs py-0">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Official
            </Badge>
          )}
          {isAI && (
            <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200 text-xs py-0">
              <Bot className="h-3 w-3 mr-1" />
              AI Suggestion
              {answer.aiConfidence !== undefined && (
                <span className="ml-1">({Math.round(answer.aiConfidence * 100)}%)</span>
              )}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDate(answer.createdAt)}
          </span>
        </div>
        <p className="text-sm text-foreground/90 whitespace-pre-wrap">
          {answer.answerText}
        </p>
        {/* Source specs tooltip for AI answers */}
        {isAI && answer.aiSourceSpecs && answer.aiSourceSpecs.length > 0 && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Dựa trên: {answer.aiSourceSpecs.join(', ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export type { AnswerItemProps };
