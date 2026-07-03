'use client';

import { cn } from '@/lib/utils';
import { BookIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';

export type SourcesProps = HTMLAttributes<HTMLDivElement>;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <div
    className={cn('not-prose mb-4 text-primary text-xs', className)}
    {...(props as any)}
  />
);

export type SourcesTriggerProps = HTMLAttributes<HTMLButtonElement> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <button className="flex items-center gap-2" type="button" {...(props as any)}>
    {children ?? (
      <>
        <p className="font-medium">Used {count} sources</p>
        <ChevronDownIcon className="h-4 w-4" />
      </>
    )}
  </button>
);

export type SourcesContentProps = HTMLAttributes<HTMLDivElement>;

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <div
    className={cn(
      'mt-3 flex w-fit flex-col gap-2',
      className
    )}
    {...(props as any)}
  />
);

export type SourceProps = ComponentProps<'a'>;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className="flex items-center gap-2"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...(props as any)}
  >
    {children ?? (
      <>
        <BookIcon className="h-4 w-4" />
        <span className="block font-medium">{title}</span>
      </>
    )}
  </a>
);
