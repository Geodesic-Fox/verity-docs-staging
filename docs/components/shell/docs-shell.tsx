"use client"

import type { ComponentType, CSSProperties, ReactNode, SVGAttributes } from "react"
import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgeCheck,
  Binary,
  Blocks,
  Building2,
  Calculator,
  ChevronRight,
  Dices,
  EyeOff,
  FileCheck,
  Gauge,
  Globe,
  HardDrive,
  Layers,
  LayoutGrid,
  Microchip,
  Pickaxe,
  Repeat,
  Ruler,
  Scale,
  Server,
  ShieldCheck,
  Tags,
  Warehouse,
} from "lucide-react"

import { BoundaryMark } from "@/components/boundary-mark"
import { VllmIcon } from "@/components/shell/vllm-icon"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { tree, treePages, type TreeIcon, type TreeNode, type TreeSection } from "@/lib/tree"
import { cn } from "@/lib/utils"

/*
 * The Vercel-dashboard shell: a fixed, full-height sidebar and a top bar with
 * breadcrumbs. The sidebar is one list: the top pages, then each section as a
 * group whose whole row opens and closes it. Every row has an icon; none is
 * bold. A page with pages beneath it has a chevron button beside its link,
 * each with its own hover. Everything starts open, and each group or chevron
 * shows or hides its own until the reader toggles it again; a page's link
 * opens the page and shows what is beneath it.
 */

const icons: Record<TreeIcon, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  overview: LayoutGrid,
  architecture: Layers,
  remote: Globe,
  onsite: Building2,
  "proof-systems": ShieldCheck,
  "basic-proofs": FileCheck,
  flock: Binary,
  sampling: Dices,
  "zero-knowledge": EyeOff,
  recursion: Repeat,
  accounting: Calculator,
  physical: Ruler,
  accelerators: Microchip,
  servers: Server,
  datacenters: Warehouse,
  pouw: Pickaxe,
  pous: HardDrive,
  poub: Gauge,
  certification: BadgeCheck,
  classification: Tags,
  inference: Scale,
  integrations: Blocks,
  vllm: VllmIcon,
}

function breadcrumbs(pathname: string): string[] {
  const entry = treePages().find(({ page }) => page.href === pathname)
  return entry ? [...entry.parents, entry.page.label] : ["Docs"]
}

const rowClass =
  "flex h-9 w-full min-w-0 items-center rounded-[6px] text-sm font-medium tracking-(--sidebar-label-tracking) text-sidebar-muted outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground"

// Each level's icon sits under the label of the level above it.
const indent = ["pl-0.5", "pl-7", "pl-[54px]"]

function Row({ node, pathname, depth = 0 }: { node: TreeNode; pathname: string; depth?: number }) {
  const Icon = node.icon ? icons[node.icon] : null
  const children = (node.children ?? []).filter((child) => !child.hidden)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? true
  return (
    <li>
      <div className="flex gap-0.5">
        <Link
          className={cn(rowClass, "flex-1", indent[depth])}
          data-active={pathname === node.href ? "" : undefined}
          href={node.href ?? "/"}
          onClick={() => setToggled(true)}
        >
          <span className="grid size-9 flex-none place-content-center">
            {Icon ? <Icon aria-hidden className="size-4" /> : null}
          </span>
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
        </Link>
        {children.length ? (
          <button
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} pages under ${node.label}`}
            className="grid size-9 flex-none place-content-center rounded-[6px] text-sidebar-muted outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
            onClick={() => setToggled(!open)}
            type="button"
          >
            <ChevronRight aria-hidden className={cn("size-3 transition-transform duration-150", open ? "rotate-90" : null)} />
          </button>
        ) : null}
      </div>
      {children.length && open ? (
        <ul className="mt-(--sidebar-row-gap) flex flex-col gap-(--sidebar-row-gap)">
          {children.map((child) => (
            <Row depth={depth + 1} key={child.href} node={child} pathname={pathname} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function Group({ section, pathname }: { section: TreeSection; pathname: string }) {
  const Icon = section.icon ? icons[section.icon] : null
  const [open, setOpen] = useState(true)
  return (
    <li>
      <button aria-expanded={open} className={cn(rowClass, indent[0])} onClick={() => setOpen(!open)} type="button">
        <span className="grid size-9 flex-none place-content-center">
          {Icon ? <Icon aria-hidden className="size-4" /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
        <span className="mr-1.5 grid size-6 flex-none place-content-center">
          <ChevronRight aria-hidden className={cn("size-3 transition-transform duration-150", open ? "rotate-90" : null)} />
        </span>
      </button>
      {open ? (
        <ul className="mt-(--sidebar-row-gap) flex flex-col gap-(--sidebar-row-gap)">
          {section.nodes.map((node) => (
            <Row depth={1} key={node.href ?? node.label} node={node} pathname={pathname} />
          ))}
        </ul>
      ) : null}
    </li>
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

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "16rem",
            "--header-height": "3rem",
          } as CSSProperties
        }
      >
        <Sidebar
          className="sticky top-0 h-svh shrink-0 border-r border-sidebar-separator"
          collapsible="none"
        >
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="h-auto text-sidebar-foreground data-[slot=sidebar-menu-button]:!p-1.5"
                >
                  <Link aria-label="Docs home" href="/">
                    <BoundaryMark
                      className="!h-[22px] !w-[26px]"
                      strokeWidth={4.25}
                      variant="asymmetric"
                    />
                    <span className="text-base font-semibold tracking-[-0.03em]">Docs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="gap-0">
            <SidebarGroup className="py-1">
              <ul className="flex flex-col gap-(--sidebar-row-gap)">
                {tree.map((section, i) => (
                  <Fragment key={section.label ?? i}>
                    {section.label ? (
                      <Group pathname={pathname} section={section} />
                    ) : (
                      section.nodes.map((node) => <Row key={node.href ?? node.label} node={node} pathname={pathname} />)
                    )}
                  </Fragment>
                ))}
              </ul>
            </SidebarGroup>
          </SidebarContent>
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
