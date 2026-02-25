import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Send, AlertCircle, LogIn } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useLocation } from 'react-router-dom';

const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 500;

interface QuestionFormProps {
  onSubmit: (questionText: string) => Promise<void>;
  isSubmitting?: boolean;
  className?: string;
}

export function QuestionForm({
  onSubmit,
  isSubmitting = false,
  className,
}: QuestionFormProps) {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [questionText, setQuestionText] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  const textLength = questionText.length;
  const isTooShort = textLength > 0 && textLength < MIN_QUESTION_LENGTH;
  const isTooLong = textLength > MAX_QUESTION_LENGTH;
  const isValid = textLength >= MIN_QUESTION_LENGTH && textLength <= MAX_QUESTION_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    if (!isValid) {
      if (isTooShort || textLength === 0) {
        setError(`Câu hỏi phải có ít nhất ${MIN_QUESTION_LENGTH} ký tự`);
      } else if (isTooLong) {
        setError(`Câu hỏi không được vượt quá ${MAX_QUESTION_LENGTH} ký tự`);
      }
      return;
    }

    try {
      await onSubmit(questionText.trim());
      setQuestionText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi câu hỏi');
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestionText(e.target.value);
    if (error) setError(null);
  };

  const handleLoginClick = () => {
    navigate('/login', { state: { from: location.pathname } });
  };

  // Show login prompt for guests
  if (!isAuthenticated) {
    return (
      <Card className={cn('bg-muted/50', className)}>
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">
                Bạn cần đăng nhập để đặt câu hỏi về sản phẩm
              </p>
            </div>
            <Button onClick={handleLoginClick} variant="outline" size="sm">
              <LogIn className="h-4 w-4 mr-2" />
              Đăng nhập
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Đặt câu hỏi về sản phẩm</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Textarea
              id="question-text"
              placeholder="Nhập câu hỏi của bạn về sản phẩm này..."
              value={questionText}
              onChange={handleTextChange}
              disabled={isSubmitting}
              className={cn(
                'min-h-[100px] resize-none',
                (isTooShort || isTooLong) && 'border-destructive focus-visible:ring-destructive/50'
              )}
              aria-invalid={isTooShort || isTooLong}
              aria-describedby="question-counter"
            />
            <div
              id="question-counter"
              className={cn(
                'text-xs text-right',
                isTooShort || isTooLong ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {textLength}/{MAX_QUESTION_LENGTH}
              {isTooShort && ` (tối thiểu ${MIN_QUESTION_LENGTH})`}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Đang gửi...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Gửi câu hỏi
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export type { QuestionFormProps };
