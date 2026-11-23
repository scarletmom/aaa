import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface MediaProps {
  image: string;
  alt?: string;
  /** Load first (above-the-fold images). */
  eager?: boolean;
  /** Aspect ratio and spacing; defaults to 3:2. */
  className?: string;
  children?: ReactNode;
}

/** A cropped image box with a placeholder colour while it loads. */
export default function Media({ image, alt = '', eager = false, className, children }: MediaProps) {
  return (
    <div className={cn('relative overflow-hidden bg-img', className ?? 'aspect-[3/2]')}>
      {/* Plain <img>: sized by the box above, and the images come from outside hosts. */}
      <img
        src={image}
        alt={alt}
        className="block size-full object-cover"
        {...(eager ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
        decoding="async"
      />
      {children}
    </div>
  );
}
