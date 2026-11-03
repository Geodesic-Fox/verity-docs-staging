"use client"

import type { ComponentType, CSSProperties, ReactNode, SVGAttributes } from "react"
import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, ChevronDown, Gauge, Globe, LayoutGrid, Sigma, Tags } from "lucide-react"

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
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tree, treePages, type TreeIcon, type TreeNode } from "@/lib/tree"

/*
 * The Vercel-dashboard shell: a fixed, full-height sidebar of sections, each
 * under its heading with a divider between them, and a top bar with
 * breadcrumbs. A row with children is a dropdown: the chevron on its right
 * opens and closes it, and its label opens its page (or toggles it, when it
 * has none). Every dropdown starts open.
 */

const icons: Record<TreeIcon, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  overview: LayoutGrid,
  remote: Globe,
  onsite: Building2,
  "proof-systems": Sigma,
  accounting: Gauge,
  classification: Tags,
  vllm: VllmIcon,
}

function breadcrumbs(pathname: string): string[] {
  const entry = treePages().find(({ page }) => page.href === pathname)
  return entry ? [...entry.parents, entry.page.label] : ["Docs"]
}

const rowClass =
  "flex w-full min-w-0 items-center gap-2 rounded-(--sidebar-row-radius) text-left text-sm font-medium tracking-(--sidebar-label-tracking) text-sidebar-muted outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"

function Row({
  node,
  path,
  depth,
  pathname,
  closed,
  toggle,
}: {
  node: TreeNode
  path: string
  depth: number
  pathname: string
  closed: Set<string>
  toggle: (path: string) => void
}) {
  const children = (node.children ?? []).filter((child) => !child.hidden)
  const open = !closed.has(path)
  const Icon = node.icon ? icons[node.icon] : null
  const label = (
    <>
      {Icon ? <Icon aria-hidden /> : null}
      <span className="truncate">{node.label}</span>
    </>
  )
  const rowStyle = cn(
    rowClass,
    depth === 0 ? "h-(--sidebar-row-height) px-2" : "h-8 pr-2",
    children.length ? "pr-9" : null
  )
  const indent = depth === 0 ? undefined : { paddingLeft: `${8 + 24 + (depth - 1) * 12}px` }

  return (
    <li className="relative">
      {node.href ? (
        <Link
          className={rowStyle}
          data-active={pathname === node.href ? "" : undefined}
          href={node.href}
          style={indent}
        >
          {label}
        </Link>
      ) : (
        <button
          aria-expanded={open}
          className={rowStyle}
          onClick={() => toggle(path)}
          style={indent}
          type="button"
        >
          {label}
        </button>
      )}
      {children.length ? (
        <button
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Open"} ${node.label}`}
          className={cn(
            "absolute right-1.5 flex size-6 items-center justify-center rounded-(--sidebar-chip-radius) text-sidebar-muted hover:bg-(--sidebar-chip-accent) hover:text-sidebar-accent-foreground",
            depth === 0 ? "top-1.5" : "top-1"
          )}
          onClick={() => toggle(path)}
          type="button"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-150", open ? null : "-rotate-90")}
          />
        </button>
      ) : null}
      {children.length && open ? (
        <ul className="mt-px flex flex-col gap-px">
          {children.map((child) => (
            <Row
              closed={closed}
              depth={depth + 1}
              key={child.href ?? child.label}
              node={child}
              path={`${path}/${child.label}`}
              pathname={pathname}
              toggle={toggle}
            />
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
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const toggle = (path: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "17rem",
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
          <SidebarContent>
            {tree.map((section, i) => (
              <Fragment key={section.label ?? i}>
                {i > 0 ? <SidebarSeparator /> : null}
                <SidebarGroup>
                  {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
                  <SidebarGroupContent>
                    <ul className="flex flex-col gap-(--sidebar-row-gap)">
                      {section.nodes.map((node) => (
                        <Row
                          closed={closed}
                          depth={0}
                          key={node.href ?? node.label}
                          node={node}
                          path={node.label}
                          pathname={pathname}
                          toggle={toggle}
                        />
                      ))}
                    </ul>
                  </SidebarGroupContent>
                </SidebarGroup>
              </Fragment>
            ))}
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
