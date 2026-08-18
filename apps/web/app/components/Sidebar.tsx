'use client';

import { FormEvent, useState } from 'react';
import {
  ChartColumn,
  List,
  LogOut,
  Plus,
  Search,
  Settings as SettingsIcon,
  Shield,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useActiveOrg } from '@/lib/hooks/useActiveOrg';
import { useCreateOrganization } from '@/lib/hooks/mutations';
import { useMe } from '@/lib/hooks/useMe';
import type { SectionId } from './sections/sections';

type NavEntry = { id: SectionId; label: string; icon: LucideIcon };

const MAIN_NAV: NavEntry[] = [
  { id: 'metrics', label: 'Metrics', icon: ChartColumn },
  { id: 'search', label: 'Search preview', icon: Search },
  { id: 'catalog', label: 'Catalog data', icon: List },
];

const ADMIN_NAV: NavEntry[] = [
  { id: 'members', label: 'Members & roles', icon: Shield },
  { id: 'upgrade', label: 'Upgrade requests', icon: TrendingUp },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

function NavButton({
  entry,
  active,
  onSelect,
}: {
  entry: NavEntry;
  active: boolean;
  onSelect: (id: SectionId) => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      data-testid={`nav-${entry.id}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(entry.id)}
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13.5px] font-medium',
        active ? 'bg-primary-tint font-semibold text-primary-press' : 'text-ink hover:bg-surface',
      )}
    >
      {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-sm bg-primary" /> : null}
      <Icon className={cn('size-4', active ? 'text-primary-press' : 'text-ink-muted')} aria-hidden="true" />
      <span>{entry.label}</span>
    </button>
  );
}

export default function Sidebar({
  section,
  onSelect,
  onLogout,
}: {
  section: SectionId;
  onSelect: (id: SectionId) => void;
  onLogout: () => void;
}) {
  const { organizations, selectedSlug, selectedOrg, setSelectedSlug } = useActiveOrg();
  const { trigger: createOrg, isMutating } = useCreateOrganization();
  const { user } = useMe();
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
    <aside className="flex h-screen w-[232px] shrink-0 flex-col justify-between border-r border-line bg-ground">
      <div className="flex flex-col">
        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-line-soft p-4">
          <span className="flex size-[26px] items-center justify-center rounded-sm bg-primary text-white">
            <Search className="size-[15px]" aria-hidden="true" />
          </span>
          <span className="flex items-end gap-1">
            <span className="text-[15px] font-bold text-ink">Search SaaS</span>
            <span className="font-mono text-xs font-medium text-ink-faint">/console</span>
          </span>
        </div>

        {/* Org picker */}
        <div className="flex flex-col gap-1.5 border-b border-line-soft p-3">
          <Label
            htmlFor="organization-select"
            className="font-mono text-[10px] font-normal uppercase tracking-[1px] text-ink-faint"
          >
            Organization
          </Label>
          {hasOrgs ? (
            <Select
              id="organization-select"
              data-testid="organization-select"
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.slug}>
                  {org.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-[12px] text-ink-muted">No organizations yet.</p>
          )}

          {showCreate ? (
            <form className="mt-1 flex flex-col gap-1.5" onSubmit={handleCreate}>
              <Input
                id="organization-name"
                data-testid="organization-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New organization name"
                required
              />
              <div className="flex gap-1.5">
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  data-testid="organization-submit"
                  disabled={isMutating}
                >
                  Create
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              data-testid="organization-create"
              className="mt-0.5 justify-start px-1.5 text-ink-muted"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New organization
            </Button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 p-2">
          {MAIN_NAV.map((entry) => (
            <NavButton key={entry.id} entry={entry} active={section === entry.id} onSelect={onSelect} />
          ))}
          <div className="px-2.5 pb-1 pt-3">
            <span className="font-mono text-[10px] font-normal uppercase tracking-[1px] text-ink-faint">
              Admin
            </span>
          </div>
          {ADMIN_NAV.map((entry) => (
            <NavButton key={entry.id} entry={entry} active={section === entry.id} onSelect={onSelect} />
          ))}
        </nav>
      </div>

      {/* Footer: current user */}
      <div className="flex items-center gap-2.5 border-t border-line-soft p-3">
        <Avatar name={user?.name ?? 'User'} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-bold text-ink">{user?.name ?? '—'}</span>
          <span className="font-mono text-[11px] text-ink-faint">{selectedOrg?.role ?? 'MEMBER'}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={onLogout}
          aria-label="Log out"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
