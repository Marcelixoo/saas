import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-primary-tint font-bold text-primary-press',
  {
    variants: {
      size: {
        sm: 'size-6 text-[10px]',
        default: 'size-[30px] text-xs',
        lg: 'size-10 text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  /** Full name to derive initials from, e.g. "Ada Lovelace" -> "AL". */
  name?: string;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, name, children, ...props }, ref) => {
    return (
      <span ref={ref} className={cn(avatarVariants({ size, className }))} {...props}>
        {children ?? (name ? initialsFromName(name) : null)}
      </span>
    );
  },
);
Avatar.displayName = 'Avatar';

export { Avatar, avatarVariants };
