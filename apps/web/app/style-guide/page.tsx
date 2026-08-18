import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ChartColumn, Search as SearchIcon, Settings } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartCard } from '@/components/ui/chart-card';
import { EmptyState } from '@/components/ui/empty-state';
import { FacetChip } from '@/components/ui/facet-chip';
import { FormField } from '@/components/ui/form-field';
import { KpiCard } from '@/components/ui/kpi-card';
import { LegendItem } from '@/components/ui/legend-item';
import { NavItem } from '@/components/ui/nav-item';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToastPreview } from './toast-preview';

export const metadata: Metadata = {
  title: 'Style Guide — Admin UI',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="size-2.5 border-[1.5px] border-ink bg-primary" />
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {title}
        </h2>
        <Separator className="flex-1" />
      </div>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Component set</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Exported from the admin-ui.pen design system — see components/ui.
        </p>
      </div>

      <Section title="Buttons">
        <Button>Secondary</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Reject</Button>
        <Button size="sm">Small</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </Section>

      <Section title="Badges">
        <Badge>FREE</Badge>
        <Badge variant="primary">PRO</Badge>
        <Badge variant="good">Active</Badge>
        <Badge variant="warn">Pending</Badge>
        <Badge variant="crit">Suspended</Badge>
      </Section>

      <Section title="Avatar">
        <Avatar name="Ada Lovelace" />
        <Avatar name="Jamal Khan" size="lg" />
        <Avatar name="Sofia Costa" size="sm" />
      </Section>

      <Section title="Form fields">
        <FormField label="Workspace name" placeholder="Acme Store" defaultValue="Meridian Store" />
        <FormField label="Password" type="password" error="Invalid email or password." />
        <div className="flex w-[280px] flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink">Organization</span>
          <Select defaultValue="meridian">
            <option value="meridian">Meridian Store</option>
            <option value="acme">Acme Corp</option>
          </Select>
        </div>
        <SearchInput className="w-[280px]" placeholder="Search products…" />
      </Section>

      <Section title="Navigation">
        <div className="flex w-[220px] flex-col gap-0.5 rounded-lg border border-line bg-ground p-2">
          <NavItem href="#" icon={ChartColumn} active>
            Metrics
          </NavItem>
          <NavItem href="#" icon={SearchIcon}>
            Search preview
          </NavItem>
          <NavItem href="#" icon={Settings}>
            Settings
          </NavItem>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="pending" className="w-full">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="handled">Handled</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="p-3 text-sm text-ink-muted">
            2 requests awaiting approval.
          </TabsContent>
          <TabsContent value="handled" className="p-3 text-sm text-ink-muted">
            No handled requests yet.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Facet chips">
        <FacetChip active>All</FacetChip>
        <FacetChip>Footwear</FacetChip>
        <FacetChip>Outerwear</FacetChip>
      </Section>

      <Section title="KPI cards">
        <KpiCard
          label="p95 latency"
          value="42.6"
          unit="ms"
          delta={{ direction: 'up', text: '8.1% vs prev' }}
          sparkline={[8, 12, 9, 15, 12, 17, 14, 19, 16, 21, 18, 24]}
          className="w-[220px]"
        />
        <KpiCard
          label="error rate"
          value="0.4"
          unit="%"
          delta={{ direction: 'down', text: '0.1pt vs prev' }}
          className="w-[220px]"
        />
      </Section>

      <Section title="Chart card">
        <ChartCard
          title="Query latency"
          now="now: 42ms"
          legend={
            <>
              <LegendItem color="var(--chart-p50)">p50</LegendItem>
              <LegendItem color="var(--chart-p95)">p95</LegendItem>
            </>
          }
          className="w-full max-w-md"
        >
          <div className="flex h-[100px] w-full items-end gap-1">
            {[40, 55, 48, 70, 60, 90, 75].map((h, i) => (
              <span key={i} className="w-full rounded-t-sm bg-primary opacity-65" style={{ height: `${h}%` }} />
            ))}
          </div>
        </ChartCard>
      </Section>

      <Section title="Table">
        <Card className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Brand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs text-ink-muted">prod-1042</TableCell>
                <TableCell className="font-semibold">Aerowave Running Shoe</TableCell>
                <TableCell>Nike</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Loading states">
        <div className="flex w-[200px] flex-col gap-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-[80px] w-full" />
        </div>
        <Spinner />
        <Spinner size="lg" />
      </Section>

      <Section title="Empty state">
        <Card className="w-full max-w-sm">
          <EmptyState title="You're all caught up" description="There are no pending upgrade requests right now." />
        </Card>
      </Section>

      <Section title="Cards">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <Badge variant="good">Active</Badge>
          </CardHeader>
          <CardContent className="text-sm text-ink-muted">Pro — $49/mo</CardContent>
        </Card>
      </Section>

      <Section title="Toasts">
        <ToastPreview />
      </Section>
    </main>
  );
}
