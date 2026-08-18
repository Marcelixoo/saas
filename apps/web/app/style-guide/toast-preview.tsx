'use client';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

export function ToastPreview() {
  return (
    <>
      <Button
        onClick={() =>
          toast({ variant: 'success', title: 'Changes saved', description: 'Your settings were updated successfully.' })
        }
      >
        Trigger success
      </Button>
      <Button
        onClick={() =>
          toast({ variant: 'error', title: 'Sign in failed', description: 'The email or password you entered is incorrect.' })
        }
      >
        Trigger error
      </Button>
      <Button
        onClick={() =>
          toast({ variant: 'warning', title: 'Pending approval', description: 'This change needs an owner to approve it.' })
        }
      >
        Trigger warning
      </Button>
      <Button
        onClick={() => toast({ variant: 'info', title: 'Heads up', description: 'Your session will refresh automatically.' })}
      >
        Trigger info
      </Button>
    </>
  );
}
