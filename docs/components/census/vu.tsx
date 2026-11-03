"use client"

import { ArrowRight, ChevronDown, Info } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Partition, UnitKind, UnitType } from "@/lib/definition-view"
import { cn } from "@/lib/utils"
import { mixTemplate } from "@/lib/vllm"

/*
 * Proof units under the integration's port-width cut: each Call partitioned
 * into units, every gate in one, each unit one word (16 bits where the word
 * is, up to 32 for a single gate). Unit types have colors; the legend says
 * what they are, and how much of the work each is.
 */

export type VuView = {
  partitionOf: (opId: string) => Partition | null
  // Inside a Call: its cut, and the body on the canvas per drawn group: type -> [units it computes,
  // gates, size, gates not lowered yet].
  cut: Partition | null
  groups: Record<string, Record<string, [number, number, number, number]>> | null
  // The unit type the legend has picked out.
  selected: string | null
}

const count = (n: number) => n.toLocaleString("en-US")

// Unit types keep the colors of the templates they come from.
const UNIT_COLORS: Record<string, string> = {
  "GEMM coordinate": mixTemplate("GemmCoordinate").color,
  "FP8 GEMM coordinate": mixTemplate("ScaledMmFp8Block_v1").color,
  "FP8 quantized word": mixTemplate("Fp8GroupQuant_v1").color,
  "FP8 group scale": "oklch(0.62 0.07 225)",
  "MoE expert coordinate": mixTemplate("MoeExpertGemm_v1").color,
  "MoE expert coordinate, weighted": mixTemplate("MoeExpertGemmW_v1").color,
  "MoE sum word": mixTemplate("MoeSum_v1").color,
  "Attention element": mixTemplate("AttentionHead").color,
  "Attention score": "oklch(0.5 0.14 285)",
  "Softcapped score": "oklch(0.45 0.12 310)",
  "Softmax exponent": "oklch(0.72 0.1 300)",
  "Probability, BF16": "oklch(0.8 0.07 310)",
  "Softmax max": "oklch(0.55 0.12 330)",
  "Scaled max": "oklch(0.66 0.09 335)",
  "Inverse sum": "oklch(0.42 0.1 295)",
  "Norm element": mixTemplate("RMSNormFusedCuda_v2").color,
  "Norm scale": "oklch(0.5 0.16 30)",
  "Residual word": "oklch(0.72 0.08 235)",
  "Mean": "oklch(0.6 0.08 60)",
  "Elementwise word": mixTemplate("MulVecF32_v1").color,
  "RoPE word": mixTemplate("RoPEHead").color,
  "SiLU · mul word": mixTemplate("SiluMul_v1").color,
  "GELU · mul word": mixTemplate("GeluTanhMul_v1").color,
  "Bias add word": mixTemplate("BiasAdd_v1").color,
  "Guarded max": "oklch(0.6 0.1 345)",
  "Rescale factor": "oklch(0.62 0.08 320)",
  "Upcast": "oklch(0.86 0.05 60)",
  "Embedding word": "oklch(0.72 0.03 260)",
  "Shard index": "oklch(0.78 0.02 260)",
  "Shard test": "oklch(0.85 0.02 260)",
  "Token selection": mixTemplate("GumbelTopPTokenSelect_v1").color,
  "All-reduce word": mixTemplate("AllReduce2_v1").color,
  "Expert index": mixTemplate("MoeRouterTopK_v1").color,
  "Expert weight": "oklch(0.75 0.08 345)",
  "Running max": "oklch(0.55 0.1 350)",
  "Router comparison": "oklch(0.85 0.05 340)",
  "Masked score": "oklch(0.7 0.06 5)",
  "Router max": "oklch(0.5 0.12 355)",
  "Router exponent": "oklch(0.78 0.06 355)",
  "Router normalizer": "oklch(0.45 0.1 345)",
  "Constant": "oklch(0.86 0.03 95)",
  "Unused value": "oklch(0.8 0 0)",
}

export function unitColor(label: string): string {
  if (UNIT_COLORS[label]) return UNIT_COLORS[label]
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `oklch(0.66 0.1 ${h})`
}

// A unit type by label: types with one label merge, and may differ in kind (a value committed in one
// block and recomputed in another), so the gates one unit takes are a range.
export type LabelType = Omit<UnitType, "kind"> & { kinds: UnitKind[]; each: [number, number] }

// One partition's units by label.
export function byLabel(types: Record<string, UnitType>): Map<string, LabelType> {
  const out = new Map<string, LabelType>()
  for (const { kind, ...t } of Object.values(types)) {
    const e = Math.max(1, Math.round(t.gates / Math.max(1, t.units)))
    const x = out.get(t.label)
    if (x) {
      x.units += t.units
      x.gates += t.gates
      x.size += t.size
      x.unlowered += t.unlowered
      x.each = [Math.min(x.each[0], e), Math.max(x.each[1], e)]
      if (!x.kinds.includes(kind)) x.kinds.push(kind)
    } else out.set(t.label, { ...t, kinds: [kind], each: [e, e] })
  }
  return out
}

// A group of the body on the canvas: the unit types it spends gates on, largest first.
export function groupMix(vu: VuView | null, gid: string): { label: string; count: number; units: number }[] | null {
  if (!vu?.cut) return null
  const g = vu.groups?.[gid]
  if (!g) return []
  const merged = new Map<string, { label: string; count: number; units: number }>()
  for (const [key, [units, gates]] of Object.entries(g)) {
    const label = vu.cut.types[key]?.label ?? key
    const x = merged.get(label) ?? { label, count: 0, units: 0 }
    x.count += gates
    x.units += units
    merged.set(label, x)
  }
  return [...merged.values()].sort((a, b) => b.count - a.count)
}

// A thin bar of unit types (or templates, with their colors), by share.
export function MixBar({ parts, className }: { parts: { label: string; count: number; color?: string }[]; className?: string }) {
  const total = parts.reduce((a, p) => a + p.count, 0)
  if (!total) return null
  return (
    <span aria-hidden className={cn("flex h-1.5 w-full overflow-hidden rounded-full", className)}>
      {parts.map((p, i) => (
        <span key={i} style={{ width: `${(p.count / total) * 100}%`, background: p.color ?? unitColor(p.label) }} />
      ))}
    </span>
  )
}

export type LegendItem = {
  label: string
  color: string
  // Its size: the gates it's made of (AND, XOR and NOT), which the legend shows as a share of what's
  // in view; null for what isn't lowered yet, whose size isn't counted. An item without one is a key: a
  // wire's style, a dashed outline (what isn't lowered), or hatching (what the input unit certifies).
  size?: number | null
  line?: "solid" | "dashed"
  outline?: boolean
  // A proof unit's outline.
  frame?: boolean
  hatch?: boolean
  // Its size leaves out parts that aren't lowered yet, so it's at least that.
  partial?: boolean
  // Shown on hover.
  detail?: ReactNode
}

const HATCH = "repeating-linear-gradient(135deg, color-mix(in oklch, var(--foreground) 30%, transparent) 0 1.5px, transparent 1.5px 4px)"
const OTHER = "oklch(0.82 0 0)"

// "51.7%", "<0.1%": a share of the size in view.
function pct(part: number, total: number): string {
  if (part >= total) return "100%"
  const p = (100 * part) / total
  if (p > 99.9) return ">99.9%"
  return p < 0.1 ? "<0.1%" : `${p.toFixed(1)}%`
}

function Swatch({ it }: { it: LegendItem }) {
  if (it.line) {
    return (
      <svg aria-hidden className="shrink-0" height="10" width="14">
        <line stroke={it.color} strokeDasharray={it.line === "dashed" ? "3 2.5" : undefined} strokeWidth="2" x1="0" x2="14" y1="5" y2="5" />
      </svg>
    )
  }
  if (it.hatch) return <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-foreground/45" style={{ backgroundImage: HATCH }} />
  if (it.frame) return <span aria-hidden className="h-2.5 w-3.5 shrink-0 rounded-[3px] border-[1.5px] border-foreground/55" />
  if (it.outline) return <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-dashed border-foreground/50" />
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
}

const WithDetail = ({ detail, children }: { detail?: ReactNode; children: ReactNode }) =>
  detail ? (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[260px] flex-col items-start gap-0.5 text-left leading-snug" side="left">
        {detail}
      </TooltipContent>
    </Tooltip>
  ) : (
    children
  )

type Row = { it: LegendItem; share: string | null; pick: boolean }

// A breakdown by size, as a leaderboard: what's 0.1% of it or more, largest first, and everything
// smaller as Other. What isn't lowered has no size to rank; it's named below the ranking.
function sizeRows(items: LegendItem[], markPartial = false): Row[] {
  const known = items.filter((it) => it.size != null).sort((a, b) => b.size! - a.size!)
  const total = known.reduce((a, it) => a + it.size!, 0)
  const share = (s: number) => (s ? pct(s, total) : "0%")
  const big = known.filter((it) => total > 0 && it.size! / total >= 0.001)
  const small = known.filter((it) => !big.includes(it))
  const at = (partial: boolean | undefined, s: string) => (markPartial && partial && !s.startsWith("<") ? `≥${s}` : s)
  const rows: Row[] = big.map((it) => ({ it, share: at(it.partial, share(it.size!)), pick: true }))
  if (small.length) {
    rows.push({
      it: {
        label: "Other",
        color: OTHER,
        detail: (
          <>
            {small.map((it) => (
              <span key={it.label}>
                {it.label} · {at(it.partial, share(it.size!))}
              </span>
            ))}
          </>
        ),
      },
      share: at(small.some((it) => it.partial), share(small.reduce((a, it) => a + it.size!, 0))),
      pick: false,
    })
  }
  return rows
}

// What has no size yet, named in one line under a ranking.
function Unsized({ items, markPartial = false }: { items: LegendItem[]; markPartial?: boolean }) {
  const names = items.filter((it) => it.size === null).map((it) => it.label)
  const partial = markPartial && items.some((it) => it.partial)
  if (!names.length && !partial) return null
  return (
    <>
      {partial ? <p className="px-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">≥: part of it isn't lowered to gates yet, so its size is at least this.</p> : null}
      {names.length ? <p className="px-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">Not lowered to gates yet, so no size: {names.join(", ")}</p> : null}
    </>
  )
}

// A subcircuit's size by what's inside it, in its hover card.
export function SizeList({ items, markPartial = false }: { items: LegendItem[]; markPartial?: boolean }) {
  const rows = sizeRows(items, markPartial)
  if (!rows.length && !items.some((it) => it.size === null)) return null
  return (
    <>
      <ul className="mt-2 flex flex-col">
        {rows.map(({ it, share }) => (
          <li className="flex h-5 items-center gap-2" key={it.label}>
            <Swatch it={it} />
            <span className="min-w-0 flex-1 truncate text-foreground/70">{it.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-foreground tabular-nums">{share}</span>
          </li>
        ))}
      </ul>
      <Unsized items={items} markPartial={markPartial} />
    </>
  )
}

// What the colors mean, as a leaderboard of size, then the keys for wires and marks. Rows can be
// picked out, and a picked unit type opened.
export function Legend({
  title,
  note,
  items,
  selected,
  onSelect,
  onOpen,
  markPartial = false,
  folded = false,
}: {
  // What the shares are of: "Subcircuit size".
  title: string
  // Starts folded, as on a phone, where it sits over the circuit; until it's opened or folded by hand.
  folded?: boolean
  // Mark a size that leaves out what isn't lowered yet with "≥".
  markPartial?: boolean
  note?: string
  items: LegendItem[]
  selected: string | null
  onSelect: ((label: string | null) => void) | null
  onOpen: ((label: string) => void) | null
}) {
  const [toggled, setOpen] = useState<boolean | null>(null)
  const open = toggled ?? !folded
  if (!items.length) return null
  const ranked = sizeRows(items, markPartial)
  const keys = items.filter((it) => it.size === undefined)

  const row = ({ it, share, pick }: Row) => {
    const pickable = Boolean(onSelect) && share !== null && pick
    return (
      <li key={it.label}>
        <WithDetail detail={it.detail}>
          <span
            className={cn(
              "flex h-[26px] w-full items-center gap-2 rounded px-1.5 text-left",
              pickable && "cursor-pointer hover:bg-muted",
              selected === it.label && "bg-muted"
            )}
            data-unit-type={pickable ? it.label : undefined}
            onClick={pickable ? () => onSelect!(selected === it.label ? null : it.label) : undefined}
          >
            <Swatch it={it} />
            <span className={cn("min-w-0 flex-1 truncate", share === null ? "text-muted-foreground" : "text-foreground/70")}>{it.label}</span>
            {share !== null ? <span className="shrink-0 font-mono text-[12px] text-foreground tabular-nums">{share}</span> : null}
            {onOpen && selected === it.label && pickable ? (
              <button
                aria-label={`Open one ${it.label}`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(it.label)
                }}
                type="button"
              >
                <ArrowRight className="size-3.5" />
              </button>
            ) : null}
          </span>
        </WithDetail>
      </li>
    )
  }

  return (
    <Card className="pointer-events-auto w-[264px] gap-1 py-2 text-[12.5px]" size="sm">
      <CardHeader className="flex items-center gap-1 px-2.5">
        <CardTitle className="flex items-center gap-1 text-xs text-muted-foreground">
          {title}
          {note ? (
            <WithDetail detail={note}>
              <Info aria-label="What the shares are of" className="size-3 text-muted-foreground/70" />
            </WithDetail>
          ) : null}
        </CardTitle>
        <Button
          aria-expanded={open}
          aria-label={open ? "Fold the legend" : "Open the legend"}
          className="ml-auto text-muted-foreground"
          onClick={() => setOpen(!open)}
          size="icon-xs"
          variant="ghost"
        >
          <ChevronDown className={cn("transition-transform", !open && "-rotate-90")} />
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="max-h-[440px] overflow-y-auto px-1">
          {ranked.length ? <ul>{ranked.map(row)}</ul> : null}
          <Unsized items={items} markPartial={markPartial} />
          {keys.length ? (
            <ul className={cn(ranked.length && "mt-1 border-t pt-1")}>{keys.map((it) => row({ it, share: null, pick: false }))}</ul>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}

const KIND_TEXT: Record<UnitKind, string> = {
  output: "a Call output",
  committed: "committed inside the Call",
  recompute: "not committed yet: its readers compute it",
  literal: "a constant",
  dead: "read by nothing",
}

export const kindText = (kinds: UnitKind[]) => kinds.map((k) => KIND_TEXT[k]).join(", or ")

export const unitDetail = (t: { bits: number; format?: string | null; kinds: UnitKind[]; each: [number, number] }) => {
  const [lo, hi] = t.each
  const gates = lo === hi ? `${count(lo)} gate${lo === 1 ? "" : "s"}` : `${count(lo)}–${count(hi)} gates`
  const element = t.format && t.format !== "bit" ? t.format : `${t.bits}-bit`
  return `${element} · ${gates} each · ${kindText(t.kinds)}`
}
