import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SearchInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, placeholder = 'Search…', ...props }, ref) => {
    return (
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-[11px] top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        />
        <input
          ref={ref}
          type="search"
          placeholder={placeholder}
          className={cn(
            'w-full rounded-sm border border-line bg-ground py-[9px] pl-[34px] pr-[11px] text-sm text-ink placeholder:text-ink-faint',
            'focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-1',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';

export { SearchInput };
