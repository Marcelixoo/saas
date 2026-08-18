'use client';

import { Toast } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';

/**
 * Mount once near the root of the app (see `app/layout.tsx`). Trigger
 * notifications from any client component with `toast({ variant, title })`
 * from `@/components/ui/use-toast`.
 */
function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5" role="region" aria-label="Notifications">
      {toasts.map(({ id, closing, ...toastProps }) => (
        <Toast
          key={id}
          className={closing ? 'animate-toast-out' : 'animate-toast-in'}
          onClose={() => dismiss(id)}
          {...toastProps}
        />
      ))}
    </div>
  );
}

export { Toaster };
