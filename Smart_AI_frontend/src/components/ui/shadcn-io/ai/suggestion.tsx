'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ComponentProps, HTMLAttributes } from 'react';

export type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <div className={cn('w-full overflow-x-auto whitespace-nowrap', className)} {...(props as any)}>
    <div className={cn('flex w-max flex-nowrap items-center gap-2')}>
      {children}
    </div>
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = 'outline',
  size = 'sm',
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = () => {
    onClick?.(suggestion);
  };

  return (
    <Button
      className={cn('cursor-pointer rounded-full px-4', className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...(props as any)}
    >
      {children || suggestion}
    </Button>
  );
};
