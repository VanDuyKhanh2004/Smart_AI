import * as React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { Question } from '@/types/qa.type';
import { ThumbsUp, Trash2, MessageCircle } from 'lucide-react';
import { AnswerItem } from './AnswerItem';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

interface QuestionItemProps {
  question: Question;
  onUpvote: (questionId: string) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
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

export function QuestionItem({ question, onUpvote, onDelete }: QuestionItemProps) {
  const { user, isAuthenticated } = useAuthStore();
  const [isUpvoting, setIsUpvoting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Handle both _id and id formats (Mongoose can return either)
  const questionId = question._id || (question as unknown as { id: string }).id;
  const questionUserId = question.user._id || (question.user as unknown as { id: string }).id;
  const isOwner = user?._id === questionUserId;

  const handleUpvote = async () => {
    if (!isAuthenticated || isUpvoting || !questionId) return;
    setIsUpvoting(true);
    try {
      await onUpvote(questionId);
    } finally {
      setIsUpvoting(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner || isDeleting || !questionId) return;
    if (!window.confirm('Bạn có chắc muốn xóa câu hỏi này?')) return;
    setIsDeleting(true);
    try {
      await onDelete(questionId);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="pb-6 border-b last:border-b-0 last:pb-0">
      {/* Question */}
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-sm">
            {getInitials(question.user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">{question.user.name}</span>
              <span className="text-sm text-muted-foreground">
                {formatDate(question.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Upvote button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUpvote}
                disabled={!isAuthenticated || isUpvoting}
                className={cn(
                  'h-8 px-2',
                  question.hasUpvoted && 'text-primary'
                )}
                title={isAuthenticated ? (question.hasUpvoted ? 'Bỏ thích' : 'Thích') : 'Đăng nhập để thích'}
              >
                <ThumbsUp className={cn('h-4 w-4 mr-1', question.hasUpvoted && 'fill-current')} />
                <span>{question.upvoteCount}</span>
              </Button>
              {/* Delete button for owner */}
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Xóa câu hỏi"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-foreground whitespace-pre-wrap">
            {question.questionText}
          </p>
        </div>
      </div>

      {/* Answers */}
      {question.answers && question.answers.length > 0 && (
        <div className="mt-4 ml-13 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <MessageCircle className="h-4 w-4" />
            <span>{question.answers.length} câu trả lời</span>
          </div>
          {question.answers.map((answer) => (
            <AnswerItem key={answer._id} answer={answer} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { QuestionItemProps };
