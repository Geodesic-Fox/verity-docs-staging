"use client"

import { Minus, Plus, Scan } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Zoom in, zoom out and fit, in the canvas's bottom left: the graph's and the gates' alike.
export function ZoomControls({
  onIn,
  onOut,
  onFit,
  fitLabel = "Fit the view",
}: {
  onIn: () => void
  onOut: () => void
  onFit: () => void
  fitLabel?: string
}) {
  const items = [
    ["Zoom in", Plus, onIn],
    ["Zoom out", Minus, onOut],
    [fitLabel, Scan, onFit],
  ] as const
  return (
    <div
      className="absolute bottom-3 left-3 z-10 flex flex-col gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-xs"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map(([label, Icon, on]) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <Button aria-label={label} onClick={on} size="icon-xs" variant="ghost">
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
