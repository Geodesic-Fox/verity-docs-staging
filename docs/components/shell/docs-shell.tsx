"use client"

import type { ComponentType, CSSProperties, ReactNode, SVGAttributes } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Blocks, LayoutGrid, Plug, Tags, Workflow } from "lucide-react"

import { BoundaryMark } from "@/components/boundary-mark"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tree, treePages, type TreeIcon, type TreeNode } from "@/lib/tree"

/*
 * The Vercel-dashboard shell: a fixed, full-height sidebar holding the whole
 * tree, always open, and a top bar with breadcrumbs. Top-level entries carry
 * an icon; everything below them hangs off a guide line, with folders as
 * plain labels and pages as links. Labels wrap rather than truncate.
 */

const icons: Record<TreeIcon, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  overview: LayoutGrid,
  protocols: Workflow,
  subprotocols: Blocks,
  classification: Tags,
  integrations: Plug,
}

const rowClass =
  "flex min-h-7 w-full items-center rounded-(--sidebar-row-radius) px-2 py-1 text-left text-sm leading-snug outline-hidden ring-sidebar-ring focus-visible:ring-2"

function breadcrumbs(pathname: string): string[] {
  const entry = treePages().find(({ page }) => page.href === pathname)
  return entry ? [...entry.parents, entry.page.label] : ["Docs"]
}

function Branch({ nodes, pathname, top }: { nodes: TreeNode[]; pathname: string; top?: boolean }) {
  const visible = nodes.filter((node) => !node.hidden)
  if (!visible.length) return null
  return (
    <ul className={cn("flex flex-col gap-0.5 border-l border-sidebar-border py-0.5 pl-2", top ? "ml-4" : "ml-2")}>
      {visible.map((node) => (
        <li key={node.href ?? node.label}>
          {node.href ? (
            <Link
              className={cn(
                rowClass,
                node.children ? "text-sidebar-foreground" : "text-sidebar-muted",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-active:bg-sidebar-active data-active:font-medium data-active:text-sidebar-accent-foreground"
              )}
              data-active={pathname === node.href ? "" : undefined}
              href={node.href}
            >
              {node.label}
            </Link>
          ) : (
            <div className={cn(rowClass, "text-sidebar-foreground")}>{node.label}</div>
          )}
          {node.children ? <Branch nodes={node.children} pathname={pathname} /> : null}
        </li>
      ))}
    </ul>
  )
}

function TopRow({ node, pathname }: { node: TreeNode; pathname: string }) {
  const Icon = node.icon ? icons[node.icon] : null
  const inner = (
    <>
      {Icon ? <Icon aria-hidden /> : null}
      <span>{node.label}</span>
    </>
  )
  return (
    <SidebarMenuItem>
      {node.href ? (
        <SidebarMenuButton asChild isActive={pathname === node.href}>
          <Link href={node.href}>{inner}</Link>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton asChild className="cursor-default text-sidebar-foreground hover:bg-transparent active:bg-transparent">
          <div>{inner}</div>
        </SidebarMenuButton>
      )}
      {node.children ? <Branch nodes={node.children} pathname={pathname} top /> : null}
    </SidebarMenuItem>
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
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {tree.map((node) => (
                    <TopRow key={node.href ?? node.label} node={node} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
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
