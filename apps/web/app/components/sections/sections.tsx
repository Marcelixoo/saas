import type { ReactNode } from 'react';

/** The console's navigable sections, one per sidebar entry. */
export type SectionId = 'metrics' | 'search' | 'catalog' | 'members' | 'upgrade' | 'settings';

/** Human-readable label per section, used in the sidebar and topbar breadcrumb. */
export const SECTION_LABELS: Record<SectionId, string> = {
  metrics: 'Metrics',
  search: 'Search preview',
  catalog: 'Catalog data',
  members: 'Members & roles',
  upgrade: 'Upgrade requests',
  settings: 'Settings',
};

/** Standard page header (title + description) shown at the top of every section. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold tracking-tight text-ink">{title}</h1>
        <p className="max-w-2xl text-[13px] text-ink-muted">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
