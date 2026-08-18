import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItemProps extends Omit<React.ComponentPropsWithoutRef<typeof Link>, 'href'> {
  href: string;
  icon: LucideIcon;
  active?: boolean;
}

/**
 * Sidebar navigation link. `active` is left as an explicit prop (rather
 * than derived from `usePathname`) so this stays a plain server-renderable
 * component — callers that need route-based active state can compute it
 * with `usePathname()` in a thin client wrapper.
 */
const NavItem = React.forwardRef<HTMLAnchorElement, NavItemProps>(
  ({ href, icon: Icon, active = false, className, children, ...props }, ref) => {
    return (
      <Link
        ref={ref}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13.5px] font-medium text-ink no-underline',
          active ? 'bg-primary-tint text-primary-press' : 'hover:bg-surface',
          className,
        )}
        {...props}
      >
        {active ? (
          <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-sm bg-primary" />
        ) : null}
        <Icon className={cn('size-4', active ? 'text-primary-press' : 'text-ink-muted')} />
        <span>{children}</span>
      </Link>
    );
  },
);
NavItem.displayName = 'NavItem';

export { NavItem };
