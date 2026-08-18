import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.02em]',
  {
    variants: {
      variant: {
        default: 'border-line bg-surface text-ink',
        primary: 'border-primary-press bg-primary text-white',
        good: 'border-good bg-good-tint text-good',
        warn: 'border-warn bg-warn-tint text-warn',
        crit: 'border-crit bg-crit-tint text-crit',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
