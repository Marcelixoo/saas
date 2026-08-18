'use client';

import { ApiError, type Plan } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useUpdatePlan } from '@/lib/hooks/mutations';

/**
 * Foundation Settings tab: plan selection. Agent D extends this with org rename
 * and full members CRUD (`useMembers`, `useUpdateOrganization`).
 */
export default function SettingsTab() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? '';
  const { trigger: changePlan, isMutating } = useUpdatePlan(slug);
  const { toast } = useToast();

  async function handlePlanChange(plan: Plan) {
    try {
      await changePlan({ plan });
      toast({ variant: 'success', title: 'Plan updated', description: `Now on ${plan}.` });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Could not update plan',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  if (!selectedOrg) {
    return (
      <EmptyState
        title="No organization selected"
        description="Select an organization to manage its settings."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
      </CardHeader>
      <CardContent className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="plan-select">Subscription plan</Label>
        <Select
          id="plan-select"
          data-testid="plan-select"
          value={selectedOrg.plan}
          disabled={isMutating}
          onChange={(e) => handlePlanChange(e.target.value as Plan)}
        >
          <option value="FREE">FREE</option>
          <option value="PRO">PRO</option>
        </Select>
      </CardContent>
    </Card>
  );
}
