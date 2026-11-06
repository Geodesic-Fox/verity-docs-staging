"use client"

import type { ComponentType, CSSProperties, ReactNode, SVGAttributes } from "react"
import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Brain,
  Building2,
  ChevronDown,
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
import { cn } from "@/lib/utils"

/*
 * The Vercel-dashboard shell: a fixed, full-height sidebar and a top bar with
 * breadcrumbs. The sidebar is one list of the tree's pages, each section under
 * its heading. Every row has an icon; none is bold. A page with constructions
 * beneath it has a chevron, which alone shows or hides them; its label opens
 * the page and shows them. They start shown on the page or one of them.
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

const rowClass =
  "flex h-9 w-full min-w-0 items-center rounded-[6px] pl-0.5 text-sm font-medium tracking-(--sidebar-label-tracking) text-sidebar-muted outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground"

function Row({
  node,
  pathname,
  open,
  setOpen,
}: {
  node: TreeNode
  pathname: string
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const Icon = node.icon ? icons[node.icon] : null
  const children = (node.children ?? []).filter((child) => !child.hidden)
  return (
    <li className="relative">
      <Link
        className={cn(rowClass, children.length ? "pr-9" : null)}
        data-active={pathname === node.href ? "" : undefined}
        href={node.href ?? "/"}
        onClick={() => setOpen(true)}
      >
        <span className="grid size-9 flex-none place-content-center">
          {Icon ? <Icon aria-hidden className="size-4" /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
      </Link>
      {children.length ? (
        <button
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} ${node.label}'s pages`}
          className="absolute top-1.5 right-1.5 grid size-6 place-content-center rounded-[6px] text-sidebar-muted hover:bg-(--sidebar-chip-accent) hover:text-sidebar-accent-foreground"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", open ? null : "-rotate-90")} />
        </button>
      ) : null}
      {children.length && open ? (
        <ul className="mt-(--sidebar-row-gap) flex flex-col gap-(--sidebar-row-gap)">
          {children.map((child) => (
            <li key={child.href}>
              <Link
                className={cn(rowClass, "pl-[38px]")}
                data-active={pathname === child.href ? "" : undefined}
                href={child.href ?? "/"}
              >
                <span className="min-w-0 flex-1 truncate">{child.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
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
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

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
                    {section.nodes.map((node) => {
                      const key = node.href ?? node.label
                      const within = [node, ...(node.children ?? [])].some((n) => n.href === pathname)
                      return (
                        <Row
                          key={key}
                          node={node}
                          open={toggled[key] ?? within}
                          pathname={pathname}
                          setOpen={(open) => setToggled((prev) => ({ ...prev, [key]: open }))}
                        />
                      )
                    })}
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
