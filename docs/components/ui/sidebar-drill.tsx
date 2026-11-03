"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

type DrillDirection = "forward" | "back"

type DrillContextValue = {
  current: string
  previous: string | null
  direction: DrillDirection
  settle: () => void
}

const DrillContext = React.createContext<DrillContextValue | null>(null)

type SidebarDrillPanelProps = React.ComponentProps<"div"> & {
  name: string
  /** Moving to a deeper panel animates forward, to a shallower one back. */
  depth?: number
}

/**
 * Swaps sidebar panels with a layered slide: the incoming panel slides in
 * from a small offset on top of the outgoing one, which recedes behind it
 * (drift, scale-down, blur). Selection is driven by `active`, which should
 * derive from the URL. Motion is tuned via the --sidebar-drill-* custom
 * properties in globals.css.
 *
 * Panels must be direct children (not wrapped in fragments).
 */
function SidebarDrill({
  active,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { active: string }) {
  const depths = new Map<string, number>()
  for (const child of React.Children.toArray(children)) {
    if (
      React.isValidElement<SidebarDrillPanelProps>(child) &&
      child.type === SidebarDrillPanel
    ) {
      depths.set(child.props.name, child.props.depth ?? 0)
    }
  }

  const [drill, setDrill] = React.useState<{
    current: string
    previous: string | null
    direction: DrillDirection
  }>({ current: active, previous: null, direction: "forward" })

  if (drill.current !== active) {
    setDrill({
      current: active,
      previous: drill.current,
      direction:
        (depths.get(active) ?? 0) >= (depths.get(drill.current) ?? 0)
          ? "forward"
          : "back",
    })
  }

  const settle = React.useCallback(() => {
    setDrill((state) =>
      state.previous === null ? state : { ...state, previous: null }
    )
  }, [])

  // Fallback in case animationend never fires (e.g. tab hidden mid-swap).
  React.useEffect(() => {
    if (drill.previous === null) return
    const timer = window.setTimeout(settle, 1200)
    return () => window.clearTimeout(timer)
  }, [drill, settle])

  const value = React.useMemo<DrillContextValue>(
    () => ({
      current: drill.current,
      previous: drill.previous,
      direction: drill.direction,
      settle,
    }),
    [drill, settle]
  )

  return (
    <DrillContext.Provider value={value}>
      <div
        data-slot="sidebar-drill"
        className={cn("relative min-h-0 flex-1 overflow-hidden", className)}
        {...props}
      >
        {children}
      </div>
    </DrillContext.Provider>
  )
}

function SidebarDrillPanel({
  name,
  depth = 0,
  className,
  style,
  onAnimationEnd,
  children,
  ...props
}: SidebarDrillPanelProps) {
  const drill = React.useContext(DrillContext)
  if (!drill) {
    throw new Error("SidebarDrillPanel must be used within a SidebarDrill.")
  }

  const isCurrent = name === drill.current
  const isPrevious = name === drill.previous
  if (!isCurrent && !isPrevious) return null

  const animating = drill.previous !== null
  // Going back, the deeper panel exits across the top of the re-emerging one.
  const exitOnTop = drill.direction === "back"

  return (
    <div
      data-slot="sidebar-drill-panel"
      data-panel={name}
      data-depth={depth}
      data-motion={
        animating
          ? `${isCurrent ? "enter" : "exit"}-${drill.direction}`
          : undefined
      }
      inert={isPrevious ? true : undefined}
      className={cn(
        "no-scrollbar absolute inset-0 flex flex-col overflow-x-hidden overflow-y-auto bg-sidebar",
        className
      )}
      style={{
        zIndex: animating
          ? isCurrent
            ? exitOnTop
              ? 1
              : 2
            : exitOnTop
              ? 2
              : 1
          : undefined,
        ...style,
      }}
      onAnimationEnd={(event) => {
        onAnimationEnd?.(event)
        if (isPrevious && event.animationName.startsWith("sidebar-drill")) {
          drill.settle()
        }
      }}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Trailing affordance for rows that drill into a submenu. On row hover the
 * chevron zone highlights darker than the row itself (dual highlight).
 */
function SidebarDrillChevron({
  reveal = "always",
  className,
  ...props
}: React.ComponentProps<"span"> & { reveal?: "hover" | "always" }) {
  return (
    <span
      data-slot="sidebar-drill-chevron"
      data-reveal={reveal}
      className={cn(
        // The chip is the only part of the row that fades — Vercel rows snap,
        // the chevron zone transitions colors over --sidebar-chip-duration.
        "pointer-events-none ml-auto flex size-(--sidebar-chip-size) shrink-0 items-center justify-center rounded-(--sidebar-chip-radius) text-sidebar-muted transition-colors duration-(--sidebar-chip-duration) ease-(--sidebar-ease)",
        "group-hover/menu-button:bg-sidebar-chip-accent group-hover/menu-button:text-sidebar-accent-foreground",
        reveal === "hover" &&
          "opacity-0 group-hover/menu-button:opacity-100 group-focus-visible/menu-button:opacity-100",
        className
      )}
      {...props}
    >
      <ChevronRight className="size-3.5" />
    </span>
  )
}

export { SidebarDrill, SidebarDrillPanel, SidebarDrillChevron }
