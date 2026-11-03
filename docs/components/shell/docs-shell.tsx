"use client"

import type { ComponentType, CSSProperties, ReactNode, SVGAttributes } from "react"
import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  Cpu,
  FlaskConical,
  Gauge,
  Gavel,
  LayoutGrid,
  Plug,
  Rocket,
  Scale,
  ScrollText,
  Sigma,
  Workflow,
} from "lucide-react"

import { BoundaryMark } from "@/components/boundary-mark"
import { VllmIcon } from "@/components/shell/vllm-icon"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  SidebarDrill,
  SidebarDrillChevron,
  SidebarDrillPanel,
} from "@/components/ui/sidebar-drill"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  firstHref,
  groupId,
  groupsForPath,
  isGroup,
  panelForPath,
  tree,
  treePages,
  treePanels,
  type TreeEntry,
  type TreeGroup,
  type TreeIcon,
  type TreePage,
} from "@/lib/tree"

/*
 * The Vercel-dashboard shell: a fixed, full-height sidebar of drill panels
 * (the root panel, then a group's pages) and a top bar with breadcrumbs.
 * The panel follows the URL; a click drills eagerly and the URL confirms it
 * on navigation.
 */

const icons: Record<TreeIcon, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  overview: LayoutGrid,
  protocols: Workflow,
  accounting: Gauge,
  policies: Gavel,
  "proof-systems": Sigma,
  "getting-started": Rocket,
  integrations: Plug,
  vllm: VllmIcon,
  guidelines: ScrollText,
  autoresearch: FlaskConical,
  hardware: Cpu,
  workloads: BrainCircuit,
  assumptions: Scale,
  glossary: BookOpen,
}

function breadcrumbs(pathname: string): string[] {
  const page = treePages().find((entry) => entry.page.href === pathname)?.page
  if (!page) return ["Documentation"]
  return [...groupsForPath(pathname).map((group) => group.label!), page.label]
}

function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label={`Back from ${label}`}
              className="font-medium"
              onClick={onBack}
            >
              <ChevronLeft aria-hidden />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function PageRow({ page, pathname }: { page: TreePage; pathname: string }) {
  const Icon = page.icon ? icons[page.icon] : null
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={pathname === page.href}>
        <Link href={page.href}>
          {Icon ? <Icon aria-hidden /> : null}
          <span className="truncate">{page.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function DrillRow({
  href,
  icon,
  label,
  onDrill,
}: {
  href: string
  icon?: TreeIcon
  label: string
  onDrill: () => void
}) {
  const Icon = icon ? icons[icon] : null
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <Link href={href} onNavigate={onDrill}>
          {Icon ? <Icon aria-hidden /> : null}
          <span>{label}</span>
          <SidebarDrillChevron />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// The root panel's items, in tree order: unlabelled groups list their pages,
// labelled groups become drill rows. A run is consecutive groups of one
// section, with a divider between runs.
function RootItems({
  pathname,
  drillTo,
}: {
  pathname: string
  drillTo: (panel: string) => void
}) {
  const runs: { section?: string; groups: TreeGroup[] }[] = []
  for (const group of tree) {
    const last = runs[runs.length - 1]
    if (last && last.section === group.section) last.groups.push(group)
    else runs.push({ section: group.section, groups: [group] })
  }
  return (
    <>
      {runs.map((run, i) => (
        <Fragment key={i}>
          {i > 0 ? <SidebarSeparator /> : null}
          <SidebarGroup>
            {run.section ? <SidebarGroupLabel>{run.section}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {run.groups.flatMap((group) =>
                  group.label !== null
                    ? [
                        <DrillRow
                          href={firstHref(group)}
                          icon={group.icon}
                          key={group.label}
                          label={group.label}
                          onDrill={() => drillTo(groupId(group))}
                        />,
                      ]
                    : group.pages.filter((entry): entry is TreePage => !isGroup(entry)).map((page) => (
                        <PageRow key={page.href} page={page} pathname={pathname} />
                      ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}
    </>
  )
}

// Splits a group's entries into runs at each `dividerBefore`.
function chunks(entries: TreeEntry[]): TreeEntry[][] {
  const runs: TreeEntry[][] = []
  for (const entry of entries) {
    if (entry.dividerBefore || runs.length === 0) runs.push([entry])
    else runs[runs.length - 1]!.push(entry)
  }
  return runs
}

function GroupPanel({
  group,
  parent,
  pathname,
  drillTo,
}: {
  group: TreeGroup
  parent: string
  pathname: string
  drillTo: (panel: string) => void
}) {
  return (
    <SidebarContent>
      <BackRow label={group.label ?? ""} onBack={() => drillTo(parent)} />
      {chunks(group.pages).map((run, i) => (
        <Fragment key={i}>
          {i > 0 ? <SidebarSeparator /> : null}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {run.map((entry) =>
                  isGroup(entry) ? (
                    <DrillRow
                      href={firstHref(entry)}
                      icon={entry.icon}
                      key={entry.label}
                      label={entry.label ?? ""}
                      onDrill={() => drillTo(groupId(entry))}
                    />
                  ) : (
                    <PageRow key={entry.href} page={entry} pathname={pathname} />
                  )
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}
    </SidebarContent>
  )
}

export function DocsShell({
  banner,
  children,
}: {
  banner?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const crumbs = breadcrumbs(pathname)

  // The sidebar drills eagerly on click; the URL only confirms it later.
  // `fromPath` scopes the eager choice to the page it was made on, so any
  // committed navigation clears it and the pathname takes back over.
  const [eagerDrill, setEagerDrill] = useState<{
    panel: string
    fromPath: string
  } | null>(null)
  if (eagerDrill && eagerDrill.fromPath !== pathname) {
    setEagerDrill(null)
  }
  const panel = eagerDrill?.panel ?? panelForPath(pathname)
  const drillTo = (target: string) =>
    setEagerDrill({ panel: target, fromPath: pathname })

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "14.58rem",
            "--header-height": "3rem",
          } as CSSProperties
        }
      >
        <Sidebar
          className="sticky top-0 h-svh shrink-0 border-r border-sidebar-border"
          collapsible="none"
        >
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="h-auto text-sidebar-foreground data-[slot=sidebar-menu-button]:!p-1.5"
                >
                  <Link aria-label="Documentation home" href="/">
                    <BoundaryMark
                      className="!h-[22px] !w-[26px]"
                      strokeWidth={4.25}
                      variant="asymmetric"
                    />
                    <span className="text-base font-semibold tracking-[-0.03em]">
                      Documentation
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarDrill active={panel}>
            <SidebarDrillPanel depth={0} name="root">
              <SidebarContent>
                <RootItems drillTo={drillTo} pathname={pathname} />
              </SidebarContent>
            </SidebarDrillPanel>
            {treePanels().map(({ group, parent, depth }) => (
              <SidebarDrillPanel depth={depth} key={groupId(group)} name={groupId(group)}>
                <GroupPanel drillTo={drillTo} group={group} parent={parent} pathname={pathname} />
              </SidebarDrillPanel>
            ))}
          </SidebarDrill>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header
            className="sticky top-0 z-50 flex h-(--header-height) shrink-0 items-center border-b bg-background text-foreground"
            data-slot="app-header"
          >
            <nav
              aria-label="Breadcrumb"
              className="flex h-8 min-w-0 items-center gap-2 px-6 text-sm lg:px-10"
            >
              {crumbs.map((crumb, index) => (
                <span
                  className={
                    index === 0
                      ? "flex min-w-0 items-center gap-2"
                      : "hidden min-w-0 items-center gap-2 sm:flex"
                  }
                  key={`${index}-${crumb}`}
                >
                  {index > 0 ? (
                    <span aria-hidden className="text-muted-foreground">
                      /
                    </span>
                  ) : null}
                  <span
                    className={
                      index === crumbs.length - 1
                        ? "truncate font-medium"
                        : "truncate text-muted-foreground"
                    }
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </nav>
          </header>
          <div className="@container/main flex min-h-[calc(100svh-var(--header-height))] flex-1 flex-col bg-background">
            {children}
          </div>
          {banner}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
