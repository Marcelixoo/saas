'use client';

import { useState, type FormEvent } from 'react';
import { ApiError, type Plan, type Role } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useUpdatePlan } from '@/lib/hooks/mutations';
import { useInviteMember, useMembers, useRemoveMember } from '@/lib/hooks/useMembers';
import { useUpdateOrganization } from '@/lib/hooks/useUpdateOrganization';

const ROLE_BADGE_VARIANT: Record<Role, 'primary' | 'default'> = {
  OWNER: 'primary',
  ADMIN: 'default',
  MEMBER: 'default',
};

/**
 * Settings tab: plan selection, organization rename, and member management.
 */
export default function SettingsTab() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? '';
  const { toast } = useToast();

  const { trigger: changePlan, isMutating: isChangingPlan } = useUpdatePlan(slug);
  const { trigger: renameOrg, isMutating: isRenaming } = useUpdateOrganization(slug);
  const { members, isLoading: isLoadingMembers } = useMembers(slug);
  const { trigger: invite, isMutating: isInviting } = useInviteMember(slug);
  const { trigger: remove, isMutating: isRemoving } = useRemoveMember(slug);

  const [orgName, setOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

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

  async function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    try {
      await invite({ email: trimmed, role: inviteRole });
      setInviteEmail('');
      setInviteRole('MEMBER');
      toast({ variant: 'success', title: 'Member invited', description: trimmed });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Could not invite member',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  async function handleRemove(userId: string) {
    setRemovingUserId(userId);
    try {
      await remove({ userId });
      toast({ variant: 'success', title: 'Member removed' });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Could not remove member',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setRemovingUserId((current) => (current === userId ? null : current));
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

  const sortedMembers = members.toSorted((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="flex flex-col gap-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-2" onSubmit={handleInviteSubmit}>
            <FormField
              label="Invite by email"
              type="email"
              data-testid="member-invite-email"
              value={inviteEmail}
              disabled={isInviting}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-invite-role">Role</Label>
              <Select
                id="member-invite-role"
                data-testid="member-invite-role"
                value={inviteRole}
                disabled={isInviting}
                onChange={(e) => setInviteRole(e.target.value as Role)}
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </Select>
            </div>
            <Button type="submit" data-testid="member-invite-submit" disabled={isInviting}>
              {isInviting ? <Spinner size="sm" /> : 'Invite'}
            </Button>
          </form>

          {isLoadingMembers ? (
            <Spinner label="Loading members…" />
          ) : sortedMembers.length === 0 ? (
            <EmptyState title="No members yet" description="Invite a teammate to get started." />
          ) : (
            <Table data-testid="members-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMembers.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={member.name} />
                        <div className="flex flex-col">
                          <span className="font-medium text-ink">{member.name}</span>
                          <span className="text-xs text-ink-muted">{member.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE_VARIANT[member.role]}>{member.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        data-testid="member-remove"
                        disabled={isRemoving && removingUserId === member.userId}
                        onClick={() => handleRemove(member.userId)}
                      >
                        {isRemoving && removingUserId === member.userId ? (
                          <Spinner size="sm" />
                        ) : (
                          'Remove'
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
