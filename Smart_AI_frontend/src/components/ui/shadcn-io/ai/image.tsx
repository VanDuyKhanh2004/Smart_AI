import { cn } from '@/lib/utils';
import type { Experimental_GeneratedImage } from 'ai';
import type { ComponentProps } from 'react';

export type ImageProps = Experimental_GeneratedImage & {
  className?: string;
  alt?: string;
};

export const Image = ({
  base64,
  uint8Array,
  mediaType,
  ...props
}: ImageProps) => {
  void uint8Array;
  return (
    <img
      {...(props as ComponentProps<'img'>)}
      alt={props.alt}
      className={cn(
        'h-auto max-w-full overflow-hidden rounded-md',
        props.className
      )}
      src={`data:${mediaType};base64,${base64}`}
    />
  );
};
