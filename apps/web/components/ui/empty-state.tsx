import * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon = Inbox, title, description, action, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col items-center gap-2 px-5 py-11 text-center', className)}
        {...props}
      >
        <Icon className="size-[34px] text-ink-faint" aria-hidden="true" />
        <p className="text-[15px] font-bold text-ink">{title}</p>
        {description ? (
          <p className="max-w-[300px] text-[13px] text-ink-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    );
  },
);
EmptyState.displayName = 'EmptyState';

export { EmptyState };
