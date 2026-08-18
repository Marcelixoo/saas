'use client';

import { FormEvent, useState } from 'react';
import { LogOut, Plus, Search } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useCreateOrganization } from '@/lib/hooks/mutations';

export default function AppHeader({ onLogout }: { onLogout: () => void }) {
  const { organizations, selectedSlug, selectedOrg, setSelectedSlug } = useActiveOrg();
  const { trigger: createOrg, isMutating } = useCreateOrganization();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const hasOrgs = organizations.length > 0;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const org = await createOrg({ name });
      setName('');
      setShowCreate(false);
      setSelectedSlug(org.slug);
      toast({ variant: 'success', title: 'Organization created', description: org.name });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Could not create organization',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  return (
    <header className="border-b border-line bg-ground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-white">
            <Search className="size-4" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">Search Console</span>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
          {hasOrgs ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="organization-select" className="sr-only">
                Organization
              </Label>
              <Select
                id="organization-select"
                data-testid="organization-select"
                className="w-[200px]"
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.slug}>
                    {org.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {selectedOrg ? (
            <Badge
              data-testid="plan-badge"
              variant={selectedOrg.plan === 'PRO' ? 'primary' : 'default'}
            >
              {selectedOrg.plan}
            </Badge>
          ) : null}

          {!showCreate ? (
            <Button
              size="sm"
              data-testid="organization-create"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              New org
            </Button>
          ) : null}

          <Button variant="ghost" size="sm" onClick={onLogout} aria-label="Log out">
            <LogOut className="size-4" aria-hidden="true" />
            Log out
          </Button>
        </div>
      </div>

      {showCreate ? (
        <div className="border-t border-line-soft bg-surface">
          <form
            className="mx-auto flex max-w-6xl flex-wrap items-end gap-2.5 px-5 py-3"
            onSubmit={handleCreate}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="organization-name">New organization name</Label>
              <Input
                id="organization-name"
                data-testid="organization-name"
                className="w-[260px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Store"
                required
              />
            </div>
            <Button
              variant="primary"
              type="submit"
              data-testid="organization-submit"
              disabled={isMutating}
            >
              Create
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </form>
        </div>
      ) : null}
    </header>
  );
}
