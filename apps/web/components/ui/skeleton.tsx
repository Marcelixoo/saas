import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Generic loading placeholder. Compose with sizing classes for either use
 * case, e.g. `<Skeleton className="h-3.5 w-40" />` for a text line or
 * `<Skeleton className="h-[190px] w-full" />` for a content block.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-skeleton', className)}
      {...props}
    />
  );
}

export { Skeleton };
