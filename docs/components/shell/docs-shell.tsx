"use client"

import type { ComponentType, CSSProperties, ReactNode, SVGAttributes } from "react"
import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgeCheck,
  BookOpenCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Dices,
  EyeOff,
  FileCheck,
  Gauge,
  Globe,
  Grid2x2X,
  Grid3x3,
  HardDrive,
  HardDriveUpload,
  LayoutGrid,
  MemoryStick,
  Network,
  Repeat,
  Sigma,
  Tags,
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
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { tree, treePages, type TreeIcon, type TreeNode } from "@/lib/tree"

/*
 * The Vercel-dashboard shell: a fixed, full-height sidebar and a top bar with
 * breadcrumbs. The top level lists the tree's sections, divided. A row with
 * children of its own (a chevron on its right) opens its page and swaps the
 * sidebar for its section's list: a back row with the section's name, its
 * overview, then its pages, each child that has pages of its own a heading
 * over them. Every row has an icon; none is bold.
 */

const icons: Record<TreeIcon, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  overview: LayoutGrid,
  remote: Globe,
  onsite: Building2,
  "proof-systems": Sigma,
  "basic-proofs": FileCheck,
  sampling: Dices,
  "zero-knowledge": EyeOff,
  recursion: Repeat,
  accounting: Gauge,
  compute: Cpu,
  "useful-compute": Grid3x3,
  "useless-compute": Grid2x2X,
  network: Network,
  certification: BadgeCheck,
  memory: MemoryStick,
  "useful-storage": HardDrive,
  "useless-storage": HardDriveUpload,
  reads: BookOpenCheck,
  classification: Tags,
  vllm: VllmIcon,
}

const shown = (node: TreeNode) => (node.children ?? []).filter((child) => !child.hidden)

const contains = (node: TreeNode, pathname: string): boolean =>
  node.href === pathname || (node.children ?? []).some((child) => contains(child, pathname))

// A heading's pages: the node itself when it is a page, then every page below it.
const pagesOf = (node: TreeNode): TreeNode[] => [
  ...(node.href ? [node] : []),
  ...shown(node).flatMap(pagesOf),
]

function breadcrumbs(pathname: string): string[] {
  const entry = treePages().find(({ page }) => page.href === pathname)
  return entry ? [...entry.parents, entry.page.label] : ["Docs"]
}

const rowClass =
  "flex h-9 w-full min-w-0 items-center rounded-md pl-0.5 text-left text-sm font-medium tracking-(--sidebar-label-tracking) text-sidebar-muted outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground"

function RowBody({ icon, label, chevron }: { icon?: TreeIcon; label: string; chevron?: boolean }) {
  const Icon = icon ? icons[icon] : null
  return (
    <>
      <span className="grid size-9 flex-none place-content-center">
        {Icon ? <Icon aria-hidden className="size-4" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {chevron ? <ChevronRight aria-hidden className="mr-3 size-3 flex-none" /> : null}
    </>
  )
}

function Row({
  node,
  label,
  icon,
  pathname,
  onOpen,
}: {
  node: TreeNode
  label?: string
  icon?: TreeIcon
  pathname: string
  onOpen?: () => void
}) {
  const body = <RowBody chevron={Boolean(onOpen)} icon={icon ?? node.icon} label={label ?? node.label} />
  return (
    <li>
      {node.href ? (
        <Link className={rowClass} data-active={pathname === node.href ? "" : undefined} href={node.href} onClick={onOpen}>
          {body}
        </Link>
      ) : (
        <button className={rowClass} onClick={onOpen} type="button">
          {body}
        </button>
      )}
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

function TopLevel({ pathname, open }: { pathname: string; open: (node: TreeNode) => void }) {
  return (
    <>
      {tree.map((section, i) => (
        <Fragment key={section.label ?? i}>
          {i > 0 ? <SidebarSeparator className="mx-2" /> : null}
          <SidebarGroup className="py-1">
            <ul className="flex flex-col gap-(--sidebar-row-gap)">
              {section.label ? <Heading>{section.label}</Heading> : null}
              {section.nodes.map((node) => (
                <Row
                  key={node.href ?? node.label}
                  node={node}
                  onOpen={shown(node).length ? () => open(node) : undefined}
                  pathname={pathname}
                />
              ))}
            </ul>
          </SidebarGroup>
        </Fragment>
      ))}
    </>
  )
}

function SectionList({ node, pathname, back }: { node: TreeNode; pathname: string; back: () => void }) {
  return (
    <SidebarGroup className="py-1">
      <ul className="flex flex-col gap-(--sidebar-row-gap)">
        <li>
          <button className={rowClass} onClick={back} type="button">
            <span className="grid size-9 flex-none place-content-center">
              <ChevronLeft aria-hidden className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-center">{node.label}</span>
            <span aria-hidden className="size-9 flex-none" />
          </button>
        </li>
        {node.href ? <Row icon="overview" label="Overview" node={node} pathname={pathname} /> : null}
        {shown(node).map((child) =>
          shown(child).length ? (
            <Fragment key={child.label}>
              <Heading>{child.label}</Heading>
              {pagesOf(child).map((page) => (
                <Row
                  key={page.href}
                  label={page.nav ?? page.title ?? page.label}
                  node={page}
                  pathname={pathname}
                />
              ))}
            </Fragment>
          ) : (
            <Row key={child.href ?? child.label} node={child} pathname={pathname} />
          )
        )}
      </ul>
    </SidebarGroup>
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
  const sections = tree.flatMap((section) => section.nodes).filter((node) => shown(node).length)
  // Which list shows: the section holding this page, unless the reader chose
  // another (or the top level) since arriving here.
  const [choice, setChoice] = useState<{ pathname: string; label: string | null } | null>(null)
  const label =
    choice?.pathname === pathname ? choice.label : (sections.find((node) => contains(node, pathname))?.label ?? null)
  const section = sections.find((node) => node.label === label)

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
            {section ? (
              <SectionList
                back={() => setChoice({ pathname, label: null })}
                node={section}
                pathname={pathname}
              />
            ) : (
              <TopLevel open={(node) => setChoice({ pathname: node.href ?? pathname, label: node.label })} pathname={pathname} />
            )}
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
