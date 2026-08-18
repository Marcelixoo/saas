import * as React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const spinnerVariants = cva('animate-spin text-primary', {
  variants: {
    size: {
      sm: 'size-4',
      default: 'size-5',
      lg: 'size-6',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface SpinnerProps
  extends React.SVGAttributes<SVGSVGElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

function Spinner({ className, size, label = 'Loading…', ...props }: SpinnerProps) {
  return (
    <span role="status">
      <LoaderCircle className={cn(spinnerVariants({ size, className }))} aria-hidden="true" {...props} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { Spinner };
