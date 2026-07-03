'use client';

import { cn } from '@/lib/utils';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { createContext, memo, useCallback, useContext, useEffect, useState } from 'react';
import { Response } from './response';

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
};

export type ReasoningProps = HTMLAttributes<HTMLDivElement> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = false,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const [isOpenInternal, setIsOpenInternal] = useState(defaultOpen);
    const isOpen = open !== undefined ? open : isOpenInternal;
    const [duration, setDuration] = useState(durationProp ?? 0);

    const [hasAutoClosedRef, setHasAutoClosedRef] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);

    const setIsOpen = useCallback((val: boolean) => {
      setIsOpenInternal(val);
      onOpenChange?.(val);
    }, [onOpenChange]);

    // Track duration when streaming starts and ends
    useEffect(() => {
      if (isStreaming) {
        if (startTime === null) {
          setStartTime(Date.now());
        }
      } else if (startTime !== null) {
        setDuration(Math.round((Date.now() - startTime) / 1000));
        setStartTime(null);
      }
    }, [isStreaming, startTime]);

    // Auto-open when streaming starts, auto-close when streaming ends (once only)
    useEffect(() => {
      if (isStreaming && !isOpen) {
        setIsOpen(true);
      } else if (!isStreaming && isOpen && !defaultOpen && !hasAutoClosedRef) {
        // Add a small delay before closing to allow user to see the content
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosedRef(true);
        }, AUTO_CLOSE_DELAY);
        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosedRef]);

    return (
      <ReasoningContext.Provider
        value={{ isStreaming, isOpen, setIsOpen, duration }}
      >
        <div
          className={cn('not-prose mb-4', className)}
          {...(props as any)}
        >
          {children}
        </div>
      </ReasoningContext.Provider>
    );
  }
);

export type ReasoningTriggerProps = HTMLAttributes<HTMLButtonElement> & {
  title?: string;
};

export const ReasoningTrigger = memo(
  ({
    className,
    title = 'Reasoning',
    children,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, setIsOpen, duration } = useReasoning();

    return (
      <button
        className={cn(
          'flex items-center gap-2 text-muted-foreground text-sm',
          className
        )}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        {...(props as any)}
      >
        {children ?? (
          <>
            <BrainIcon className="size-4" />
            {isStreaming || duration === 0 ? (
              <p>Thinking...</p>
            ) : (
              <p>Thought for {duration} seconds</p>
            )}
            <ChevronDownIcon
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0'
              )}
            />
          </>
        )}
      </button>
    );
  }
);

export type ReasoningContentProps = HTMLAttributes<HTMLDivElement> & {
  children: string;
};

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => {
    const { isOpen } = useReasoning();
    if (!isOpen) return null;
    return (
      <div
        className={cn(
          'mt-4 text-sm',
          className
        )}
        {...(props as any)}
      >
        <Response className="grid gap-2">{children}</Response>
      </div>
    );
  }
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
