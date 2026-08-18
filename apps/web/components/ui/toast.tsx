import * as React from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const toastVariants = cva(
  'pointer-events-auto flex w-full max-w-[340px] items-start gap-2.5 rounded-sm border border-line bg-ground p-3.5 shadow-[0_4px_16px_rgba(0,0,0,0.15)]',
  {
    variants: {
      variant: {
        success: 'border-l-4 border-l-good',
        error: 'border-l-4 border-l-crit',
        warning: 'border-l-4 border-l-warn',
        info: 'border-l-4 border-l-primary',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);

const VARIANT_ICON: Record<NonNullable<VariantProps<typeof toastVariants>['variant']>, LucideIcon> = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
};

const VARIANT_ICON_COLOR: Record<NonNullable<VariantProps<typeof toastVariants>['variant']>, string> = {
  success: 'text-good',
  error: 'text-crit',
  warning: 'text-warn',
  info: 'text-primary',
};

export interface ToastProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof toastVariants> {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, variant = 'info', title, description, onClose, ...props }, ref) => {
    const Icon = VARIANT_ICON[variant ?? 'info'];

    return (
      <div ref={ref} role="status" className={cn(toastVariants({ variant, className }))} {...props}>
        <Icon className={cn('mt-0.5 size-5 shrink-0', VARIANT_ICON_COLOR[variant ?? 'info'])} aria-hidden="true" />
        <div className="flex-1">
          <p className="text-[13px] font-bold text-ink">{title}</p>
          {description ? <p className="text-xs text-ink-muted">{description}</p> : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss notification"
            className="text-lg leading-none text-ink-faint hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  },
);
Toast.displayName = 'Toast';

export { Toast, toastVariants };
