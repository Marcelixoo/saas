'use client';

import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { ApiError, type Role } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useInviteMember, useMembers, useRemoveMember } from '@/lib/hooks/useMembers';
import { PageHeader } from './sections';

const ROLE_BADGE_VARIANT: Record<Role, 'primary' | 'default'> = {
  OWNER: 'primary',
  ADMIN: 'default',
  MEMBER: 'default',
};

/**
 * Members & roles section: invite teammates by email and manage their roles.
 * Split out of Settings per the .pen console structure.
 */
export default function MembersSection() {
  const { selectedOrg } = useActiveOrg();
  const slug = selectedOrg?.slug ?? '';
  const { toast } = useToast();

  const { members, isLoading } = useMembers(slug);
  const { trigger: invite, isMutating: isInviting } = useInviteMember(slug);
  const { trigger: remove, isMutating: isRemoving } = useRemoveMember(slug);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  async function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    try {
      await invite({ email: trimmed, role: inviteRole });
      setInviteEmail('');
      setInviteRole('MEMBER');
      setShowInvite(false);
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
        description="Select an organization to manage its members."
      />
    );
  }

  const sortedMembers = members.toSorted((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title="Members & roles"
        description="Manage who can access this organization's console and what they can do."
        actions={
          <Button size="sm" onClick={() => setShowInvite((v) => !v)}>
            <UserPlus className="size-4" aria-hidden="true" />
            Invite member
          </Button>
        }
      />

      {showInvite ? (
        <Card>
          <CardContent className="pt-4">
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
                {isInviting ? <Spinner size="sm" /> : 'Send invite'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <Table aria-busy="true" aria-label="Loading members">
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="size-[30px] shrink-0 rounded-full" />
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-7 w-16" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                        {isRemoving && removingUserId === member.userId ? <Spinner size="sm" /> : 'Remove'}
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
