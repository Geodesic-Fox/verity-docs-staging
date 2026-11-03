"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { ZoomControls } from "@/components/census/zoom-controls"
import type { GateBox, GateList } from "@/lib/boolean-view"

/*
 * The bottom of the drill-down: a subcircuit's AND, XOR and NOT gates, drawn
 * like every level above it. Wires flow top to bottom, from the input pill
 * to the output pill, routed orthogonally; each gate is a small node with
 * its op's color as its accent, and it sits in the lane of the bits it reads.
 * A canvas draws it: a subcircuit's gates are too many nodes for the graph layout.
 */

export const GATE_COLORS = { and: "#e5484d", xor: "#3e63dd", not: "#8b8d98" } as const
// A Boolean subcircuit's own gates, outside its parts.
export const OWN_COLOR = "oklch(0.4 0.01 260)"
const OPS = ["and", "xor", "not"] as const

const count = (n: number) => n.toLocaleString("en-US")

// A subcircuit's kind, as a color: the arithmetic it does.
const KIND_COLORS: Record<string, string> = {
  "dot-step": "oklch(0.55 0.14 255)",
  "tc-step": "oklch(0.55 0.14 255)",
  multiply: "oklch(0.68 0.14 40)",
  fma: "oklch(0.74 0.13 70)",
  add: "oklch(0.66 0.12 150)",
  align: "oklch(0.7 0.09 190)",
  normalize: "oklch(0.6 0.12 295)",
  round: "oklch(0.7 0.1 340)",
  convert: "oklch(0.75 0.03 250)",
  special: "oklch(0.8 0.12 95)",
  // A special function's table (ex2, rcp, rsq, sqrt, tanh, GELU, SiLU), built of plain gates.
  table: "oklch(0.8 0.12 95)",
  compare: "oklch(0.6 0.06 50)",
  subcircuit: "oklch(0.62 0.04 260)",
  composite: "oklch(0.72 0.02 260)",
  piece: "oklch(0.6 0.1 230)",
  "c-flock-unit": "oklch(0.5 0.06 260)",
  composed: "oklch(0.58 0.05 260)",
  "proof-unit": "oklch(0.45 0.05 260)",
}
export const kindColor = (kind: string) => KIND_COLORS[kind] ?? "oklch(0.66 0.03 260)"

// A word-level primitive or Definition in the same terms: the arithmetic it does. Special functions
// are the activations (SiLU, GELU) and the GPU's special-function ops (exp, rsqrt, tanh and the like).
export function arithKind(fn: string): string {
  const f = fn.replace(/\{.*$/, "").replace(/_v\d+$/, "")
  if (/^Dot|Dot(16|32)|Wgmma|Qgmma|Mma/.test(f)) return "dot-step"
  if (/Silu|Gelu/.test(f)) return "special"
  if (/Fma/.test(f)) return "fma"
  if (/Mul|Square|Scale/.test(f)) return "multiply"
  if (/Add|Sum|Sub/.test(f)) return "add"
  if (/F2fp|Narrow|Round/.test(f)) return "round"
  if (/To(F32|Bf16|E4m3)|Widen|Upcast/.test(f)) return "convert"
  if (/Mufu|Rsqrt|Sqrt|Exp|Tanh|Rcp|InvSum|Lg2|Log/.test(f)) return "special"
  if (/Max|Min|Gt|Lt|Le|Ge|Eq|Select|Guard|Argmax|Cmp|Sat|IsFinite|Fabs|Neg/.test(f)) return "compare"
  return "composite"
}

const KIND_LABELS: Record<string, string> = {
  "dot-step": "Tensor-core step",
  "tc-step": "Tensor-core step",
  multiply: "Multiply",
  fma: "Fused multiply-add",
  add: "Add",
  align: "Align",
  normalize: "Normalize",
  round: "Round",
  convert: "Convert",
  special: "Special function",
  table: "Special-function table",
  compare: "Compare and select",
  // The export's name for everything else: unpack, classify, select, mux, reduce, shift, decode.
  subcircuit: "Logic",
  // A word-level Definition that isn't one kind of arithmetic.
  composite: "Subcircuit",
  piece: "Primitive",
  "c-flock-unit": "C-Flock unit",
  // A primitive too wide for one circuit type: its types, counted.
  composed: "Composed",
  "proof-unit": "Proof unit",
}
export const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind

// World units are the graph's pixels at zoom 1: a gate is a small node, lanes and rows leave room for wires.
const LANE = 44
const ROW = 60
const GW = 32
const GH = 20
const PILL_H = 26
// A box is a little taller than a gate, and wider by its bits.
const BH = 30

type Layout = {
  // Each wire's center: the inputs' ports on the input pill, then each gate.
  x: Float32Array
  y: Float32Array
  op: Uint8Array
  depth: Int32Array
  // Readers of each wire, CSR.
  start: Int32Array
  readers: Int32Array
  out: Uint8Array
  outputs: number[]
  // The ports, each a pill over its wires: inputs across the top, outputs across the bottom.
  inPills: Pill[]
  outPills: Pill[]
  // With the gates tagged by part, each drawn part's outline: its gates' lanes, row by row.
  regions: Region[]
  // Each box's extent, its row and its first bit's wire.
  boxes: Map<number, { x0: number; x1: number; d: number; first: number }>
  bottom: number
  width: number
  height: number
}

type Pill = { x0: number; x1: number; y: number; name: string; bits: number }
// A run of consecutive rows a part has gates in, each [row, first gate's x, last gate's x].
type Region = { part: number; rows: [number, number, number][] }
type Ports = { in: [string, number][]; out: [string, number][] }

// A box's output bits are gates [3, box, bit]: its inputs are the box's.
const BOX = 3
const readsOf = (list: GateList, i: number): number[] => {
  const g = list.gates
  if (g[3 * i] === BOX) return list.boxes?.[g[3 * i + 1]!]?.ins ?? []
  return g[3 * i] === 2 ? [g[3 * i + 1]!] : [g[3 * i + 1]!, g[3 * i + 2]!]
}

function lay(list: GateList, ports?: Ports): Layout {
  const { inputs, gates } = list
  const n = gates.length / 3
  const W = inputs + n
  const depth = new Int32Array(W)
  const lane = new Float32Array(W)
  const op = new Uint8Array(W).fill(255)
  for (let i = 0; i < inputs; i++) lane[i] = i
  let maxDepth = 0
  const rows: number[][] = []
  const boxDepth = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const w = inputs + i
    op[w] = gates[3 * i]!
    let d: number
    if (op[w] === BOX) {
      const b = gates[3 * i + 1]!
      if (!boxDepth.has(b)) boxDepth.set(b, readsOf(list, i).reduce((m, v) => Math.max(m, v >= 0 ? depth[v]! : 0), 0) + 1)
      d = boxDepth.get(b)!
    } else d = readsOf(list, i).reduce((m, v) => Math.max(m, v >= 0 ? depth[v]! : 0), 0) + 1
    depth[w] = d
    if (d > maxDepth) maxDepth = d
    ;(rows[d] ??= []).push(w)
  }
  // Row by row, each gate in the lane of what it reads, pushed along past its neighbors. With the
  // gates tagged by part, a part's gates in a row stay together, so it's one run of lanes there.
  const part = list.part && new Set(list.part).size > 1 ? list.part : null
  const partOf = (w: number) => part![w - inputs] ?? -1
  let lanes = inputs
  for (let d = 1; d <= maxDepth; d++) {
    const row = rows[d] ?? []
    const want = new Map<number, number>()
    for (const w of row) {
      const i = w - inputs
      const ls = readsOf(list, i)
        .filter((v) => v >= 0)
        .map((v) => lane[v]!)
      // A box's bits sit side by side, in order, where its inputs are.
      const bit = gates[3 * i] === BOX ? gates[3 * i + 2]! * 1e-6 : 0
      want.set(w, (ls.length ? ls.reduce((s, v) => s + v, 0) / ls.length : 0) + bit)
    }
    if (part) {
      const mean = new Map<number, [number, number]>()
      for (const w of row) {
        const m = mean.get(partOf(w)) ?? [0, 0]
        m[0] += want.get(w)!
        m[1] += 1
        mean.set(partOf(w), m)
      }
      const at = (w: number) => mean.get(partOf(w))![0] / mean.get(partOf(w))![1]
      row.sort((p, q) => at(p) - at(q) || partOf(p) - partOf(q) || want.get(p)! - want.get(q)!)
    } else row.sort((p, q) => want.get(p)! - want.get(q)!)
    let last = -Infinity
    for (const w of row) {
      const i = w - inputs
      // A box leaves a lane clear on each side, for its outline and name.
      const box = gates[3 * i] === BOX
      const first = box && gates[3 * i + 2] === 0
      const v = Math.max(want.get(w)!, last + (first ? 2 : 1))
      lane[w] = v
      last = box && gates[3 * i + 2] === (list.boxes?.[gates[3 * i + 1]!]?.outs ?? 1) - 1 ? v + 1 : v
    }
    if (last + 1 > lanes) lanes = last + 1
  }
  // Each box's extent: from its first bit's lane to its last's, at its row.
  const boxAt = new Map<number, { x0: number; x1: number; d: number; first: number }>()
  for (let i = 0; i < n; i++) {
    if (gates[3 * i] !== BOX) continue
    const w = inputs + i
    const b = gates[3 * i + 1]!
    const e = boxAt.get(b)
    const gx = lane[w]! * LANE
    if (e) {
      e.x0 = Math.min(e.x0, gx)
      e.x1 = Math.max(e.x1, gx)
    } else boxAt.set(b, { x0: gx, x1: gx, d: depth[w]!, first: w })
  }
  // Each part's outline, around its gates' runs of lanes in consecutive rows. The subcircuit's own
  // gates, which join its parts up, aren't outlined.
  const regions: Region[] = []
  if (part) {
    const spans = new Map<number, Map<number, [number, number]>>()
    for (let w = inputs; w < W; w++) {
      const p = partOf(w)
      if (p < 0) continue
      const byRow = spans.get(p) ?? spans.set(p, new Map()).get(p)!
      const s = byRow.get(depth[w]!)
      const gx = lane[w]! * LANE
      if (s) {
        s[0] = Math.min(s[0], gx)
        s[1] = Math.max(s[1], gx)
      } else byRow.set(depth[w]!, [gx, gx])
    }
    for (const [p, byRow] of spans) {
      let run: [number, number, number][] = []
      for (const d of [...byRow.keys()].sort((a, b) => a - b)) {
        if (run.length && d !== run[run.length - 1]![0] + 1) {
          regions.push({ part: p, rows: run })
          run = []
        }
        run.push([d, ...byRow.get(d)!])
      }
      if (run.length) regions.push({ part: p, rows: run })
    }
  }
  const x = new Float32Array(W)
  const y = new Float32Array(W)
  for (let w = 0; w < W; w++) {
    x[w] = lane[w]! * LANE
    y[w] = depth[w]! * ROW
  }
  // A box reads its inputs once, at its first bit.
  const reads = (i: number) => (gates[3 * i] === BOX && gates[3 * i + 2] !== 0 ? [] : readsOf(list, i))
  const deg = new Int32Array(W + 1)
  for (let i = 0; i < n; i++) {
    for (const v of reads(i)) if (v >= 0) deg[v + 1] = deg[v + 1]! + 1
  }
  for (let w = 0; w < W; w++) deg[w + 1] = deg[w + 1]! + deg[w]!
  const readers = new Int32Array(deg[W]!)
  const fill = deg.slice(0, W)
  for (let i = 0; i < n; i++) {
    for (const v of reads(i)) {
      if (v < 0) continue
      const k = fill[v]!
      readers[k] = inputs + i
      fill[v] = k + 1
    }
  }
  const out = new Uint8Array(W)
  const outputs = list.outputs.filter((o) => o >= 0)
  for (const o of outputs) out[o] = 1
  const bottom = (maxDepth + 1) * ROW
  // A port's wires are consecutive bits; ports that don't add up to the wires are one pill.
  const named = (p: [string, number][] | undefined, total: number, fallback: string): [string, number][] =>
    p?.length && p.reduce((a, [, b]) => a + b, 0) === total ? p : [[fallback, total]]
  const inPills: Pill[] = []
  let at = 0
  for (const [name, bits] of named(ports?.in, inputs, "in")) {
    inPills.push({ x0: at * LANE - LANE / 2, x1: (at + bits - 1) * LANE + LANE / 2, y: 0, name, bits })
    at += bits
  }
  const outPills: Pill[] = []
  at = 0
  for (const [name, bits] of named(ports?.out, list.outputs.length, "out")) {
    const xs = list.outputs
      .slice(at, at + bits)
      .filter((o) => o >= 0)
      .map((o) => x[o]!)
    if (xs.length) outPills.push({ x0: Math.min(...xs) - LANE / 2, x1: Math.max(...xs) + LANE / 2, y: bottom, name, bits })
    at += bits
  }
  return {
    x,
    y,
    op,
    depth,
    start: deg,
    readers,
    out,
    outputs,
    inPills,
    outPills,
    regions,
    boxes: boxAt,
    bottom,
    width: (lanes - 1) * LANE + LANE,
    height: bottom + PILL_H,
  }
}

type View = { s: number; tx: number; ty: number }

// The graph's own colors, read from the page so the canvas matches it in either theme.
function palette(el: HTMLElement) {
  const css = getComputedStyle(el)
  const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    background: pick("--background", "#ffffff"),
    foreground: pick("--foreground", "#0a0a0a"),
    muted: pick("--muted-foreground", "#737373"),
    border: pick("--border", "#e5e5e5"),
  }
}

export function GateCanvas({
  list,
  pad,
  parts,
  partColors,
  pick = null,
  ports,
  widths = false,
  outlines = false,
  boxInfo,
  onOpenBox,
}: {
  list: GateList
  // The canvas the legend and cards leave free.
  pad: { top: number; right: number; bottom: number; left: number }
  // The subcircuit's drawn parts by index, to say which one made a gate, and their colors.
  parts?: string[]
  partColors?: string[]
  // A drawn part whose gates stand out (−1: the subcircuit's own).
  pick?: number | null
  // Its named ports, each drawn over its wires; with widths on, labeled with its size.
  ports?: Ports
  widths?: boolean
  // Outline every part, faintly, not only the one under the pointer and the one picked out.
  outlines?: boolean
  // A box's name, what it is, its color, and whether clicking opens it in place.
  boxInfo?: (box: GateBox) => { name: string; detail: string; color: string; opens: boolean }
  onOpenBox?: (box: GateBox) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View | null>(null)
  const [hover, setHover] = useState<{ wire: number; px: number; py: number } | null>(null)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null)
  const layout = useMemo(() => lay(list, ports), [list, ports])
  // A new drawing (a part opened in place) numbers its wires anew.
  const [drawn, setDrawn] = useState(list)
  if (drawn !== list) {
    setDrawn(list)
    setHover(null)
  }

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const inner = { w: Math.max(1, size.w - pad.left - pad.right), h: Math.max(1, size.h - pad.top - pad.bottom) }
  const fit = () => {
    const w = layout.width + LANE
    const h = layout.height + ROW
    const s = Math.min(1.25, inner.w / w, inner.h / h)
    setView({ s, tx: pad.left + (inner.w - layout.width * s) / 2, ty: pad.top + (inner.h - (layout.height - PILL_H / 2) * s) / 2 + (PILL_H / 2) * s })
  }
  useEffect(() => {
    if (size.w && size.h) fit()
    // A new list, or a canvas that first has a size, starts fitted.
  }, [layout, size.w > 0 && size.h > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom about a point on the canvas.
  const zoomAt = (px: number, py: number, factor: number) =>
    setView((v) => {
      if (!v) return v
      const s = Math.min(4, Math.max(0.01, v.s * factor))
      return { s, tx: px - ((px - v.tx) * s) / v.s, ty: py - ((py - v.ty) * s) / v.s }
    })

  // The wheel zooms and doesn't scroll the page, so it can't be a passive listener.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // A grid of gates, for finding the one under the pointer.
  const grid = useMemo(() => {
    const cells = new Map<string, number[]>()
    for (let w = list.inputs; w < layout.x.length; w++) {
      const k = `${Math.floor(layout.x[w]! / LANE)}:${layout.depth[w]}`
      const c = cells.get(k)
      if (c) c.push(w)
      else cells.set(k, [w])
    }
    return cells
  }, [layout, list.inputs])

  useEffect(() => {
    const c = canvas.current
    if (!c || !view || !size.w) return
    const colors = palette(c)
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
    const ctx = c.getContext("2d")!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    const { s, tx, ty } = view
    // The graph's dotted background, in step with the zoom.
    const gap = 16 * s
    if (gap >= 6) {
      ctx.fillStyle = colors.border
      const r = Math.max(0.6, 0.5 * s)
      for (let gx = ((tx % gap) + gap) % gap; gx < size.w; gx += gap) {
        for (let gy = ((ty % gap) + gap) % gap; gy < size.h; gy += gap) ctx.fillRect(gx - r, gy - r, 2 * r, 2 * r)
      }
    }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty)
    const { x, y, op, depth, start, readers, bottom } = layout
    const { inputs, gates } = list
    const n = gates.length / 3
    const px = 1 / s
    // A wire, routed like the graph's edges: down from its source, across between rows, down into its reader.
    const bottomOf = (w: number) => (w < inputs ? y[w]! + PILL_H / 2 : y[w]! + (op[w] === BOX ? BH : GH) / 2)
    const boxOf = (w: number) => (op[w] === BOX ? layout.boxes.get(gates[3 * (w - inputs) + 1]!) : undefined)
    // Into a gate at one of its two ports; into a box where the wire comes from, along its top.
    const route = (v: number, w: number, port: number) => {
      const b = boxOf(w)
      const tx2 = b ? Math.min(Math.max(x[v]!, b.x0 - GW / 2 + 6), b.x1 + GW / 2 - 6) : x[w]! + port
      const top = y[w]! - (b ? BH : GH) / 2
      const mid = top - (ROW - (b ? BH : GH)) / 2
      ctx.moveTo(x[v]!, bottomOf(v))
      ctx.lineTo(x[v]!, mid)
      ctx.lineTo(tx2, mid)
      ctx.lineTo(tx2, top)
    }
    const portOf = (i: number, k: number) => (gates[3 * i] === 2 || gates[3 * i] === BOX ? 0 : k === 0 ? -GW / 4 : GW / 4)
    // What a gate reads, and a box once, at its first bit.
    const readsAt = (i: number) => (gates[3 * i] === BOX && gates[3 * i + 2] !== 0 ? [] : readsOf(list, i))
    // The part of the gate under the pointer, and the one picked out, outlined around their gates row
    // by row and named where they start; with every part outlined, the rest faintly.
    ctx.font = "500 10.5px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.lineJoin = "round"
    const padX = GW / 2 + 5
    const under = hover && list.part ? (list.part[hover.wire - inputs] ?? -1) : -1
    for (const r of layout.regions) {
      const strong = r.part === under || r.part === pick
      if (!strong && !outlines) continue
      const color = partColors?.[r.part] ?? colors.muted
      const [d0, x0] = r.rows[0]!
      ctx.beginPath()
      ctx.moveTo(x0 - padX, d0 * ROW - ROW / 2)
      for (const [d, , x1] of r.rows) {
        ctx.lineTo(x1 + padX, d * ROW - ROW / 2)
        ctx.lineTo(x1 + padX, d * ROW + ROW / 2)
      }
      for (let k = r.rows.length - 1; k >= 0; k--) {
        const [d, xl] = r.rows[k]!
        ctx.lineTo(xl - padX, d * ROW + ROW / 2)
        ctx.lineTo(xl - padX, d * ROW - ROW / 2)
      }
      ctx.closePath()
      ctx.fillStyle = color
      ctx.globalAlpha = strong ? 0.1 : 0.04
      ctx.fill()
      ctx.strokeStyle = color
      ctx.globalAlpha = strong ? 0.85 : 0.35
      ctx.lineWidth = strong ? Math.max(1.5 * px, 1.2) : Math.max(px, 0.8)
      ctx.stroke()
      const name = parts?.[r.part] ?? ""
      if (10.5 * s >= 7 && ctx.measureText(name).width <= r.rows[0]![2] - x0 + 2 * padX - 12) {
        ctx.globalAlpha = 1
        ctx.fillStyle = colors.foreground
        ctx.fillText(name, x0 - padX + 6, d0 * ROW - ROW / 2 + 10)
      }
    }
    ctx.globalAlpha = 1
    ctx.lineWidth = Math.max(px * 0.8, 1.1)
    ctx.lineJoin = "round"
    for (const far of [true, false]) {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const w = inputs + i
        readsAt(i).forEach((v, k) => {
          if (v < 0 || depth[w]! - depth[v]! > 2 !== far) return
          route(v, w, portOf(i, k))
        })
      }
      // Outputs run straight down to their port.
      if (!far) {
        for (const o of layout.outputs) {
          ctx.moveTo(x[o]!, bottomOf(o))
          ctx.lineTo(x[o]!, bottom - PILL_H / 2)
        }
      }
      ctx.strokeStyle = colors.muted
      ctx.globalAlpha = far ? 0.12 : 0.45
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // Gates: small nodes with their op's accent, or at a distance, dots of its color.
    const card = GW * s >= 12
    // Every gate is named, AND, XOR or NOT where the name fits at a legible size and by its initial
    // where only that does.
    const labels = card
    const words = GW * s >= 18
    const faded = (w: number) => pick !== null && list.part !== undefined && list.part[w - inputs] !== pick
    // Boxes: a part left closed or a table read, over its output bits, named where the name fits.
    for (const [b, e] of layout.boxes) {
      const box = list.boxes![b]!
      const info = boxInfo?.(box) ?? { name: box.ref, detail: "", color: colors.muted, opens: false }
      const bx = e.x0 - GW / 2 - 4
      const bw = e.x1 - e.x0 + GW + 8
      const by = e.d * ROW - BH / 2
      ctx.globalAlpha = faded(e.first) ? 0.14 : 1
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, BH, 6)
      ctx.fillStyle = colors.background
      ctx.fill()
      ctx.strokeStyle = info.color
      ctx.lineWidth = Math.max(1.2 * px, 1)
      ctx.stroke()
      ctx.fillStyle = info.color
      ctx.beginPath()
      ctx.roundRect(bx, by, 4, BH, [6, 0, 0, 6])
      ctx.fill()
      if (card) {
        ctx.font = `500 ${Math.max(9, 7 / s)}px ui-sans-serif, system-ui, sans-serif`
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.fillStyle = colors.foreground
        const room = bw - 14
        let text = info.name
        if (ctx.measureText(text).width > room) {
          while (text.length > 1 && ctx.measureText(`${text}…`).width > room) text = text.slice(0, -1)
          text = text.length > 1 ? `${text}…` : ""
        }
        if (text) ctx.fillText(text, bx + 10, e.d * ROW)
      }
    }
    ctx.globalAlpha = 1
    for (let w = inputs; w < x.length; w++) {
      const k = op[w]!
      if (k === BOX) continue
      const color = GATE_COLORS[OPS[k]!]
      const gx = x[w]! - GW / 2
      const gy = y[w]! - GH / 2
      ctx.globalAlpha = faded(w) ? 0.14 : 1
      if (card) {
        ctx.fillStyle = colors.background
        ctx.strokeStyle = colors.border
        ctx.lineWidth = px
        ctx.beginPath()
        ctx.roundRect(gx, gy, GW, GH, 4)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(gx, gy, 3, GH, [4, 0, 0, 4])
        ctx.fill()
      } else {
        ctx.fillStyle = color
        ctx.fillRect(gx, gy, GW, GH)
      }
    }
    if (labels) {
      ctx.fillStyle = colors.foreground
      // About 7px on screen, but never taller than the card.
      ctx.font = `600 ${Math.min(GH * 0.75, Math.max(9, 7 / s))}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const x0 = -tx / s - GW
      const x1 = (size.w - tx) / s + GW
      const y0 = -ty / s - GH
      const y1 = (size.h - ty) / s + GH
      for (let w = inputs; w < x.length; w++) {
        if (op[w] === BOX || x[w]! < x0 || x[w]! > x1 || y[w]! < y0 || y[w]! > y1) continue
        ctx.globalAlpha = faded(w) ? 0.14 : 1
        const name = OPS[op[w]!]!.toUpperCase()
        ctx.fillText(words ? name : name[0]!, x[w]! + 1.5, y[w]!)
      }
    }
    ctx.globalAlpha = 1
    // The ports: what comes in across the top, what goes out across the bottom, as at every level.
    const pill = (p: Pill, dashed: boolean) => {
      const text = widths ? `${p.name} · ${count(p.bits)} bits` : p.name
      ctx.beginPath()
      ctx.roundRect(p.x0, p.y - PILL_H / 2, p.x1 - p.x0, PILL_H, PILL_H / 2)
      ctx.fillStyle = colors.background
      ctx.fill()
      ctx.setLineDash(dashed ? [4, 3] : [])
      ctx.strokeStyle = dashed ? colors.muted : colors.border
      ctx.lineWidth = Math.max(px, 1)
      ctx.stroke()
      ctx.setLineDash([])
      if (PILL_H * s >= 10 && ctx.measureText(text).width <= p.x1 - p.x0) {
        ctx.fillStyle = colors.foreground
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(text, (p.x0 + p.x1) / 2, p.y)
      }
    }
    ctx.font = "11.5px ui-sans-serif, system-ui, sans-serif"
    for (const p of layout.inPills) pill(p, false)
    for (const p of layout.outPills) pill(p, true)
    if (hover) {
      const w = hover.wire
      ctx.strokeStyle = colors.foreground
      ctx.lineWidth = Math.max(2 * px, 1.6)
      ctx.beginPath()
      const b = boxOf(w)
      // A box under the pointer lights up everything it reads and every reader of its bits.
      const bits = b ? Array.from({ length: list.boxes![gates[3 * (w - inputs) + 1]!]!.outs }, (_, j) => w + j) : [w]
      const i = w - inputs
      readsAt(i).forEach((v, k) => {
        if (v >= 0) route(v, w, portOf(i, k))
      })
      for (const u of bits) {
        for (let r = start[u]!; r < start[u + 1]!; r++) {
          const reader = readers[r]!
          const j = reader - inputs
          route(u, reader, portOf(j, gates[3 * j + 1] === u ? 0 : 1))
        }
        if (layout.out[u]) {
          ctx.moveTo(x[u]!, bottomOf(u))
          ctx.lineTo(x[u]!, bottom - PILL_H / 2)
        }
      }
      ctx.stroke()
      ctx.lineWidth = Math.max(1.5 * px, 1.2)
      ctx.beginPath()
      if (b) ctx.roundRect(b.x0 - GW / 2 - 4, b.d * ROW - BH / 2, b.x1 - b.x0 + GW + 8, BH, 6)
      else ctx.roundRect(x[w]! - GW / 2, y[w]! - GH / 2, GW, GH, 4)
      ctx.stroke()
    }
  }, [layout, list, view, size, hover, pick, widths, parts, partColors, outlines, boxInfo])

  // The gate under the pointer, or a box's first bit.
  const gateAt = (px: number, py: number) => {
    if (!view) return null
    const wx = (px - view.tx) / view.s
    const wy = (py - view.ty) / view.s
    for (const e of layout.boxes.values()) {
      if (wx >= e.x0 - GW / 2 - 4 && wx <= e.x1 + GW / 2 + 4 && Math.abs(e.d * ROW - wy) <= BH / 2 + 2) return e.first
    }
    const d = Math.round(wy / ROW)
    const lane = Math.floor(wx / LANE)
    for (const l of [lane - 1, lane, lane + 1]) {
      for (const w of grid.get(`${l}:${d}`) ?? []) {
        if (Math.abs(layout.x[w]! - wx) <= GW / 2 + 2 && Math.abs(layout.y[w]! - wy) <= GH / 2 + 2) return w
      }
    }
    return null
  }

  const boxAt = (w: number) => (layout.op[w] === BOX ? list.boxes?.[list.gates[3 * (w - list.inputs) + 1]!] : undefined)
  const describe = (w: number) => {
    if (w < list.inputs || w >= layout.op.length || (layout.op[w]! > 2 && !boxAt(w))) return null
    const p = list.part?.[w - list.inputs]
    const made = p === undefined ? null : p < 0 ? "Its own gates" : parts?.[p] ? `In ${parts[p]}` : null
    const box = boxAt(w)
    if (box) {
      const info = boxInfo?.(box)
      return { name: info?.name ?? box.ref, rest: info?.detail ?? "", made, opens: Boolean(info?.opens) }
    }
    const name = `${OPS[layout.op[w]!]!.toUpperCase()} gate`
    const fan = layout.start[w + 1]! - layout.start[w]!
    const tail = [`depth ${count(layout.depth[w]!)}`, fan ? `read by ${count(fan)}` : null, layout.out[w] ? "an output" : null]
    return { name, rest: tail.filter(Boolean).join(" · "), made, opens: false }
  }

  return (
    <div
      className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
      data-gates={list.gates.length / 3}
      onPointerDown={(e) => {
        if (!view) return
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, view, moved: false }
      }}
      onPointerLeave={() => setHover(null)}
      onPointerMove={(e) => {
        const rect = wrap.current!.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        if (drag.current) {
          const d = drag.current
          d.moved = true
          setView({ s: d.view.s, tx: d.view.tx + e.clientX - d.x, ty: d.view.ty + e.clientY - d.y })
          return
        }
        const w = gateAt(px, py)
        setHover(w === null || w < list.inputs ? null : { wire: w, px, py })
      }}
      onPointerUp={() => {
        const moved = drag.current?.moved
        drag.current = null
        const box = hover && !moved ? boxAt(hover.wire) : undefined
        if (box && onOpenBox && boxInfo?.(box).opens) onOpenBox(box)
      }}
      ref={wrap}
      style={hover && boxAt(hover.wire) && boxInfo?.(boxAt(hover.wire)!).opens ? { cursor: "pointer" } : undefined}
    >
      <canvas className="absolute inset-0 h-full w-full" ref={canvas} />
      {hover
        ? (() => {
            const d = describe(hover.wire)
            if (!d) return null
            return (
              <div
                className="pointer-events-none absolute z-20 w-max max-w-[260px] rounded-md border bg-background p-2.5 text-[11.5px] shadow-lg"
                style={{ left: hover.px + 14, top: hover.py + 14 }}
              >
                <div className="text-[12px] font-medium">{d.name}</div>
                {d.made ? <div className="mt-0.5">{d.made}</div> : null}
                {d.rest ? <div className="mt-0.5 text-muted-foreground">{d.rest}</div> : null}
                {d.opens ? <div className="mt-0.5 text-muted-foreground">Click to open it in place</div> : null}
              </div>
            )
          })()
        : null}
      <ZoomControls
        fitLabel="Fit the circuit"
        onFit={fit}
        onIn={() => zoomAt(size.w / 2, size.h / 2, 1.25)}
        onOut={() => zoomAt(size.w / 2, size.h / 2, 0.8)}
      />
    </div>
  )
}
