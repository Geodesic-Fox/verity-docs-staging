"use client"

import type { ComponentType, CSSProperties, ReactNode, SVGAttributes } from "react"
import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Brain,
  Building2,
  Cpu,
  Dices,
  EyeOff,
  FileCheck,
  Globe,
  Layers,
  LayoutGrid,
  MemoryStick,
  Network,
  Repeat,
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
import { tree, treePages, type TreeIcon, type TreeNode } from "@/lib/tree"

/*
 * The Vercel-dashboard shell: a fixed, full-height sidebar and a top bar with
 * breadcrumbs. The sidebar is one list of the tree's pages, each section under
 * its heading. Every row has an icon; none is bold.
 */

const icons: Record<TreeIcon, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  overview: LayoutGrid,
  architecture: Layers,
  remote: Globe,
  onsite: Building2,
  "basic-proofs": FileCheck,
  sampling: Dices,
  "zero-knowledge": EyeOff,
  recursion: Repeat,
  compute: Cpu,
  network: Network,
  memory: MemoryStick,
  inference: Brain,
  vllm: VllmIcon,
}

function breadcrumbs(pathname: string): string[] {
  const entry = treePages().find(({ page }) => page.href === pathname)
  return entry ? [...entry.parents, entry.page.label] : ["Docs"]
}

function Row({ node, pathname }: { node: TreeNode; pathname: string }) {
  const Icon = node.icon ? icons[node.icon] : null
  return (
    <li>
      <Link
        className="flex h-9 w-full min-w-0 items-center rounded-[6px] pl-0.5 text-sm font-medium tracking-(--sidebar-label-tracking) text-sidebar-muted outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground"
        data-active={pathname === node.href ? "" : undefined}
        href={node.href ?? "/"}
      >
        <span className="grid size-9 flex-none place-content-center">
          {Icon ? <Icon aria-hidden className="size-4" /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
      </Link>
    </li>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <li className="h-[30px] px-2 pt-3 pb-0.5 text-xs leading-4 font-medium tracking-wider text-[hsla(0,0%,49%,1)] uppercase">
      {children}
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
                    {section.label ? <Heading>{section.label}</Heading> : null}
                    {section.nodes.map((node) => (
                      <Row key={node.href ?? node.label} node={node} pathname={pathname} />
                    ))}
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
