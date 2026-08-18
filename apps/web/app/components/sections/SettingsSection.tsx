'use client';

import { useState, type FormEvent } from 'react';
import { ApiError, type Plan } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useUpdatePlan } from '@/lib/hooks/mutations';
import { useUpdateOrganization } from '@/lib/hooks/useUpdateOrganization';
import { PageHeader } from './sections';

/**
 * Settings section: subscription plan and organization rename. Member
 * management lives in its own Members & roles section.
 */
export default function SettingsSection() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? '';
  const { toast } = useToast();

  const { trigger: changePlan, isMutating: isChangingPlan } = useUpdatePlan(slug);
  const { trigger: renameOrg, isMutating: isRenaming } = useUpdateOrganization(slug);

  const [orgName, setOrgName] = useState('');
  // Reset the in-progress rename when the active org changes, so a half-typed
  // name never leaks across orgs. Adjust-state-during-render (no effect).
  const [lastSlug, setLastSlug] = useState(selectedOrg?.slug);
  if (selectedOrg?.slug !== lastSlug) {
    setLastSlug(selectedOrg?.slug);
    setOrgName('');
  }
  const nameValue = orgName || selectedOrg?.name || '';

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

  async function handleRenameSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    try {
      await renameOrg({ name: trimmed });
      setOrgName('');
      toast({ variant: 'success', title: 'Organization renamed', description: trimmed });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Could not rename organization',
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
    <div className="flex flex-col gap-[18px]">
      <PageHeader title="Settings" description="Manage this organization's plan and profile." />

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
            disabled={isChangingPlan}
            onChange={(e) => handlePlanChange(e.target.value as Plan)}
          >
            <option value="FREE">FREE</option>
            <option value="PRO">PRO</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization name</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex max-w-md items-end gap-2" onSubmit={handleRenameSubmit}>
            <FormField
              label="Name"
              containerClassName="flex-1"
              data-testid="org-rename-input"
              value={nameValue}
              disabled={isRenaming}
              onChange={(e) => setOrgName(e.target.value)}
            />
            <Button type="submit" data-testid="org-rename-submit" disabled={isRenaming}>
              {isRenaming ? <Spinner size="sm" /> : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
