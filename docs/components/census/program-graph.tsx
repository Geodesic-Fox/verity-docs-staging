"use client"

import "@xyflow/react/dist/style.css"

import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import ELK, { type ElkExtendedEdge, type ElkNode, type ElkPoint } from "elkjs/lib/elk.bundled.js"
import { ArrowLeft, ArrowRight, Binary, ChevronDown, ChevronRight, Info, Workflow, X } from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"

import { TokenButton } from "@/components/assumptions/token-button"
import { GATE_COLORS, GateCanvas, kindColor, kindLabel, OWN_COLOR } from "@/components/census/boolean"
import { CircuitParts } from "@/components/census/circuit-parts"
import { count, fmtSize, partKind } from "@/components/census/circuit-format"
import {
  byLabel,
  groupMix,
  kindText,
  Legend,
  MixBar,
  SizeList,
  unitColor,
  unitDetail,
  type LegendItem,
  type VuView,
} from "@/components/census/vu"
import { ZoomControls } from "@/components/census/zoom-controls"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { TokenData } from "@/lib/assumption-index"
import {
  landing,
  loweringOf,
  templateOfGroup,
  type BoolCounts,
  type BooleanRow,
  type BoolNode,
  type GateBox,
  type GateList,
  type Lowering,
} from "@/lib/boolean-view"
import { expandModule, ModuleStore, TooManyGates } from "@/lib/circuit-modules"
import {
  buildBodyView,
  elementLabel,
  shortFn,
  statics,
  typeLabel,
  type BodyNode,
  type Definition,
  type Definitions,
  type Partition,
  type UnitKind,
  type UnitType,
} from "@/lib/definition-view"
import {
  buildView,
  labeler,
  opSummary,
  templateOf,
  type Annotation,
  type ProgramGraph as Graph,
  type ProgramOp,
  type ProgramRow,
  type ViewEdge,
  type ViewNode,
} from "@/lib/program-view"
import { lookupOf, merge, overlay, stemOf, upstreamEntries, type Lookup } from "@/lib/annotations"
import { DEFINITION_GROUP, formatPlace, parsePlace, type Place } from "@/lib/circuits"
import { gateless, type Gateless } from "@/lib/gateless"
import { defName, subcircuitName, templateName } from "@/lib/names"
import { mixTemplate } from "@/lib/vllm"
import { cn } from "@/lib/utils"

/*
 * A circuit flowing top to bottom, drawn the same way at every level:
 * subcircuits you can open (a module, a Call, a Definition's part, a Boolean
 * subcircuit's part), gates, and the ports a level reads and writes, wired
 * together. The circuit is a served config's Program, or one Definition on
 * its own. A subcircuit's bar says what's inside it: the templates its Calls
 * lower to, the arithmetic it does, or with proof units on, the units it
 * computes. The legend says what the colors mean; everything else waits for
 * a hover or a click. ELK lays out the nodes and routes the wires around
 * them; the parts tree beside it lists the same levels, and goes to any.
 */

// The names, descriptions and formats of record, from the annotation layer.
const LOOKUP: Lookup = lookupOf(merge(upstreamEntries(), overlay.entries))

// What the canvas draws: a Program, with its ops' Calls to step into, or one Definition, which opens
// on its body, or for a primitive or a Definition too large to draw, on the subcircuit `land`.
// `call` is a Call whose cut covers the Definition: what sizes its parts and outlines its units.
export type CircuitRoot = { kind: "program"; graph: Graph } | { kind: "definition"; spec: string; land: string | null; call: string | null }

// A Definition on its own has no Program around it.
const NO_PROGRAM: Graph = {
  schema: "verity-docs/program-graph/v2",
  row: {
    key: "",
    model: "",
    dtype: "",
    gpu: "",
    tp: 1,
    batch: 0,
    context: "",
    workload: null,
    sampling: { variant: "", temperature: 0, top_p: 1 },
    execution: "",
    requests: 0,
    prompts: [],
    maxTokens: [],
    shard: null,
  },
  calls: 0,
  units: null,
  query: null,
  edgeBits: false,
  inputs: [],
  modules: [{ path: "", name: "", parent: null, children: [], ops: [] }],
  ops: [],
  edges: [],
}

const elk = new ELK()

const SUB_W = 240
const SUB_H = 52
const PILL_H = 28
const PILL_W = 110
const BOUND_W = 240

const RESIDUAL = "oklch(0.58 0.13 250)"
const RECURRENCE = "oklch(0.6 0.14 300)"
// Values the input unit certifies (weights, the request's inputs, randomness) are hatched.
const HATCH = "repeating-linear-gradient(135deg, color-mix(in oklch, var(--foreground) 16%, transparent) 0 1.5px, transparent 1.5px 5px)"
// The smallest zoom a view opens at: node text stays legible.
const READABLE = 0.7

type OpView = Extract<ViewNode, { kind: "op" }>
type ModView = Extract<ViewNode, { kind: "module" }>
type PartView = Extract<BodyNode, { kind: "part" }>
// Below a primitive: one drawn part of a Boolean subcircuit, standing for `count` parts (and
// `variants` that differ in constants); `mark` is the part the primitive you came from is lowered in.
type BoolView = {
  kind: "bool"
  id: string
  parent: null
  ref: string
  node: BoolNode
  count: number
  variants: number
  mark: boolean
  inputs: string[]
}
// A Boolean subcircuit's own gates, outside its parts, and its ports.
type OwnView = { kind: "own"; id: string; parent: null; counts: BoolCounts; inputs: string[] }
type BoolPortView = { kind: "bport"; id: string; parent: null; name: string; bits: number; direction: "in" | "out" }
// With proof units on, inside a Call: an outline around the parts whose gates go to units of one
// kind, with how many units they compute, their size, and the parts holding several kinds of unit
// that also take some of these units' gates.
type UnitOutlineView = { kind: "unit"; id: string; parent: null; type: UnitType; units: number; size: number; groups: string[]; also: string[] }
// A Program view's nodes, one Definition body's, or one Boolean subcircuit's.
type CanvasNode = ViewNode | BodyNode | BoolView | OwnView | BoolPortView | UnitOutlineView

type CanvasEdge = ViewEdge

type Ctx = {
  toggle: (path: string) => void
  select: (op: OpView) => void
  // Whether a card is open; hover cards stay out of its way.
  inspecting: boolean
  nameOf: (id: string) => string
  // Step inside a module (null is the whole Program).
  go: (path: string | null) => void
  row: ProgramRow | null
  // Step inside an op's Call, and within it into a part's Definition.
  enter: (op: OpView) => void
  open: (part: PartView) => void
  vu: VuView | null
  moduleMix: (path: string) => { label: string; count: number }[] | null
  widths: boolean
  // Inside a Call of a row with Boolean circuits: how a primitive is lowered, and stepping below it.
  lowering: (fn: string) => Lowering | null
  boolean: BooleanRow | null
  stepBool: (v: BoolView) => void
  // With proof units on, the pills in view whose values the input unit certifies.
  inputs: Set<string>
  // At a Boolean subcircuit: its gates, its own ones picked out.
  showOwn: (() => void) | null
  // A subcircuit's size, by what's inside it.
  sizesOf: (n: CanvasNode) => LegendItem[]
  // The level drawn ("the Program", a module, a Call, a Definition, a Boolean subcircuit), and the
  // nodes each node is wired to in it, by name.
  level: string
  linked: (id: string) => { from: string[]; to: string[] }
  // At a Call's top level, what each of its parameters holds, where the program graph says.
  roleOf: (id: string) => string[] | null
  // One element of what an op or a Program input makes.
  elementOf: (from: string | null | undefined) => { format: string | null; bits: number } | null
  // Inside a Call, why a primitive has no gates, when it has none.
  gatelessOf: (fn: string) => Gateless | null
  variants: Variants
  // A key's name, description or format from the annotation layer, and the Definition whose body is in view.
  ann: Lookup
  levelDef: string | null
}

// Designs still being chosen between, each set from the URL: ?repeat=badge|deck|range draws
// repetition one way (unset, a run's range is in its name and its count in a badge);
// ?residual=off draws the residual stream like any other wire; ?partial=ge marks a size that
// leaves out what isn't lowered yet with "≥"; ?outlines=all outlines every part over a subcircuit's gates, not
// only the one under the pointer; ?widths=stroke also draws a wire's width as its thickness.
export type Variants = { repeat: "both" | "badge" | "deck" | "range"; residual: boolean; partial: boolean; outlines: boolean; strokes: boolean }
export const DEFAULT_VARIANTS: Variants = { repeat: "both", residual: true, partial: false, outlines: false, strokes: false }

export function variantsFrom(params: URLSearchParams): Variants {
  const r = params.get("repeat")
  return {
    repeat: r === "badge" || r === "deck" || r === "range" ? r : "both",
    residual: params.get("residual") !== "off",
    partial: params.get("partial") === "ge",
    outlines: params.get("outlines") === "all",
    strokes: params.get("widths") === "stroke",
  }
}

// How a repeated subcircuit shows its repetition, by variant: its name, a badge, or a deck of
// outlines behind it with its count. A repetition with no range (parts side by side) keeps its
// badge under "range".
function repeatFace(style: Variants["repeat"], label: string, range: string | null, count: string | null) {
  if (!count) return { name: label, badge: null, deck: null }
  const bare = range ? label.replace(` ${range}`, "").replace(range, "").trim() : label
  const named = range && !label.includes(range) ? `${label} ${range}` : label
  if (style === "badge") return { name: bare, badge: count, deck: null }
  if (style === "deck") return { name: bare, badge: null, deck: count }
  if (style === "range") return range ? { name: named, badge: null, deck: null } : { name: label, badge: count, deck: null }
  return { name: label, badge: count, deck: null }
}
const GraphContext = createContext<Ctx>({
  toggle: () => {},
  select: () => {},
  inspecting: false,
  nameOf: (id) => id,
  go: () => {},
  row: null,
  enter: () => {},
  open: () => {},
  vu: null,
  moduleMix: () => null,
  widths: false,
  lowering: () => null,
  boolean: null,
  stepBool: () => {},
  inputs: new Set(),
  showOwn: null,
  sizesOf: () => [],
  level: "the Program",
  linked: () => ({ from: [], to: [] }),
  roleOf: () => null,
  elementOf: () => null,
  gatelessOf: () => null,
  variants: DEFAULT_VARIANTS,
  ann: () => null,
  levelDef: null,
})

// The most gates a drawing expanded from modules holds; past it, parts stay closed.
const GATE_DRAW_LIMIT = 150_000

// What a box in a subcircuit's gates is: a part left closed, which opens in place, or a table read.
function boxInfo(box: GateBox, b: BooleanRow) {
  if (box.kind === "table") {
    return { name: `${box.ref} table read`, detail: "Its gates are generated from the table: one box, not drawn gate by gate", color: kindColor("table"), opens: false }
  }
  const n = b.nodes[box.ref]
  const kind = n?.kind ?? box.of ?? "subcircuit"
  return {
    name: n ? subcircuitName(box.ref, n) : (box.name ?? box.ref),
    detail: [kindLabel(kind), `${count(box.size ?? 0)} gates`, n ? `${count(n.in)} → ${count(n.out)} bits` : null].filter(Boolean).join(" · "),
    color: kindColor(kind),
    opens: Boolean(box.module),
  }
}
// "4,097", or over a varying op's range "2,240–30,112".
const fmtRange = (v: number | [number, number]) => (typeof v === "number" ? count(v) : v[0] === v[1] ? count(v[0]) : `${count(v[0])}–${count(v[1])}`)

// A weight field reads relative to the op's module: "weight", or in full
// when it belongs elsewhere (a tied or shared table).
const field = (op: ProgramOp, f: string) => (op.module && f.startsWith(`${op.module}.`) ? f.slice(op.module.length + 1) : f)

// A port pill fits its name, and with widths on its size.
function pillLabel(n: CanvasNode, widths: boolean): string {
  if (n.kind === "param" || n.kind === "ret") return widths ? `${n.name} · ${typeLabel(n.type)}` : n.name
  if (n.kind === "bport") return widths ? `${n.name} · ${fmtBits(n.bits)}` : n.name
  if (n.kind === "input") return n.label ?? n.name
  if (n.kind === "output") return n.label ?? "Output"
  return ""
}

function size(n: CanvasNode, widths = false) {
  if (n.kind === "op" || n.kind === "part" || n.kind === "module" || n.kind === "bool" || n.kind === "own") return { width: SUB_W, height: SUB_H }
  if (n.kind === "param" || n.kind === "ret" || n.kind === "bport" || n.kind === "input" || n.kind === "output") {
    return { width: Math.max(PILL_W, Math.ceil(pillLabel(n, widths).length * 6.4) + 36), height: PILL_H }
  }
  if (n.kind === "boundary") return { width: BOUND_W, height: PILL_H }
  return { width: 0, height: 0 }
}

// Where a level's values leave it: its outputs, and the pills that say where they go; and where they
// come in. A level's inputs all sit in its top row and its outputs in its bottom one.
const isSink = (n: CanvasNode) =>
  n.kind === "ret" || n.kind === "output" || ((n.kind === "boundary" || n.kind === "bport") && n.direction === "out")
const isSource = (n: CanvasNode) =>
  n.kind === "param" || n.kind === "input" || ((n.kind === "boundary" || n.kind === "bport") && n.direction === "in")

function inputIds(n: CanvasNode): string[] {
  if (n.kind === "op" || n.kind === "part") return n.ports.map((p) => `in-${p.key}`)
  if (n.kind === "module" || n.kind === "bool" || n.kind === "own") return n.inputs.map((s) => `in-${s}`)
  if (isSink(n)) return ["in"]
  return []
}

const spread = (n: number, width: number) => Array.from({ length: n }, (_, k) => Math.round(((k + 0.5) / n) * width))

// Inputs along the top edge, the output at the bottom center.
function ports(n: CanvasNode, widths = false) {
  const { width, height } = size(n, widths)
  const ins = inputIds(n)
  const xs = spread(ins.length, width)
  const out = isSink(n) ? [] : [{ id: `${n.id}::out`, x: Math.round(width / 2), y: height, side: "SOUTH" }]
  return [...ins.map((id, k) => ({ id: `${n.id}::${id}`, x: xs[k]!, y: 0, side: "NORTH" })), ...out]
}

// "16 bits", "32,768 bits", "4.1M bits": what an edge carries, always in bits.
function fmtBits(bits: number | null | undefined): string | null {
  if (!bits) return null
  if (bits < 1e5) return `${count(bits)} bits`
  if (bits < 1e8) return `${Number((bits / 1e3).toPrecision(3))}K bits`
  if (bits < 1e11) return `${Number((bits / 1e6).toPrecision(3))}M bits`
  return `${Number((bits / 1e9).toPrecision(3))}B bits`
}

// What a wire carries, by its elements: "2,048 × BF16", "1 × int32".
const fmtElems = (elems: number, element: string) => `${count(elems)} × ${element}`

// The Program's own inputs, by element: token ids are int32, as vLLM holds them.
const INPUT_TYPES: Record<string, { format: string; bits: number }> = {
  prompt: { format: "int32", bits: 32 },
  seed: { format: "uint64", bits: 64 },
  splits: { format: "int32", bits: 32 },
}

// Recurrences carry their role as a label, and with widths on every edge carries its size; the residual
// stream is its color.
const edgeLabel = (e: ViewEdge) =>
  [e.recurrence && e.role && e.role !== "residual" ? e.role : null, e.width ?? null].filter(Boolean).join(" · ") || null

type Route = { points: ElkPoint[]; label: ElkPoint | null }

// A subcircuit whose parts the export doesn't wire has them as a grid, in the export's order; so
// does a level the layout fails on, rather than keep the last one.
function grid(nodes: CanvasNode[], widths: boolean, ns: string) {
  const cols = nodes.length <= 4 ? nodes.length : nodes.length <= 9 ? 3 : 4
  return {
    nodes: nodes.map((n, i): Node => {
      const { width, height } = size(n, widths)
      return {
        id: ns + n.id,
        type: `program-${n.kind}`,
        position: { x: (i % cols) * (SUB_W + 24), y: Math.floor(i / cols) * (SUB_H + 24) },
        data: { view: n },
        style: { width, height, pointerEvents: "all" },
      }
    }),
    routes: new Map<string, Route>(),
  }
}

// A Boolean subcircuit's level: its drawn parts, its own gates and its ports, wired in bundles.
// `primitive` is the one you came from, marked in the part it's lowered in.
function boolLevel(b: BooleanRow, node: BoolNode, primitive: string | null, widths: boolean) {
  const step = primitive ? `(${shortFn(primitive)}, total)` : null
  const idOf = (k: string) => (k === "own" ? "b:own" : `b:${k}`)
  const wires = node.wires ?? []
  const inputs = new Map<string, string[]>()
  for (const [s, d] of wires) inputs.set(idOf(d), [...(inputs.get(idOf(d)) ?? []), idOf(s)])
  const nodes: CanvasNode[] = []
  if (node.wires) node.ports?.in.forEach(([name, bits], k) => nodes.push({ kind: "bport", id: `b:i${k}`, parent: null, name, bits, direction: "in" }))
  node.children.forEach((c, i) => {
    const n = b.nodes[c.ref]!
    const mark = Boolean(primitive) && (n.fn === primitive || Boolean(step && n.name.includes(step)))
    nodes.push({ kind: "bool", id: `b:p${i}`, parent: null, ref: c.ref, node: n, count: c.count, variants: c.variants ?? 1, mark, inputs: inputs.get(`b:p${i}`) ?? [] })
  })
  if (node.wires && node.own) nodes.push({ kind: "own", id: "b:own", parent: null, counts: node.own, inputs: inputs.get("b:own") ?? [] })
  if (node.wires) node.ports?.out.forEach(([name, bits], k) => nodes.push({ kind: "bport", id: `b:o${k}`, parent: null, name, bits, direction: "out" }))
  const edges = wires.map(
    ([s, d, bits]): CanvasEdge => ({
      id: `${s}>${d}`,
      source: idOf(s),
      target: idOf(d),
      targetHandle: /^o\d/.test(d) ? "in" : `in-${idOf(s)}`,
      reads: 0,
      recurrence: false,
      role: null,
      bits,
      width: widths ? fmtBits(bits) : null,
    })
  )
  return { nodes, edges }
}

async function layout(nodes: CanvasNode[], edges: CanvasEdge[], widths: boolean, ns: string) {
  if (nodes.length && !edges.length && nodes.every((n) => n.kind === "bool")) return grid(nodes, widths, ns)
  const children = new Map<string | null, CanvasNode[]>()
  for (const n of nodes) children.set(n.parent, [...(children.get(n.parent) ?? []), n])

  const toElk = (n: CanvasNode): ElkNode => {
    if (n.kind === "group" || n.kind === "unit") {
      return {
        id: n.id,
        layoutOptions: {
          "elk.padding": n.kind === "unit" ? "[top=34,left=14,bottom=14,right=14]" : "[top=40,left=20,bottom=20,right=20]",
          "elk.direction": "DOWN",
        },
        children: (children.get(n.id) ?? []).map(toElk),
      }
    }
    const row = isSource(n) ? "FIRST_SEPARATE" : isSink(n) ? "LAST_SEPARATE" : null
    return {
      id: n.id,
      ...size(n, widths),
      layoutOptions: { "elk.portConstraints": "FIXED_POS", ...(row ? { "elk.layered.layering.layerConstraint": row } : {}) },
      ports: ports(n, widths).map((p) => ({ id: p.id, x: p.x, y: p.y, width: 0, height: 0, layoutOptions: { "elk.port.side": p.side } })),
    }
  }

  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.json.edgeCoords": "ROOT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "46",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.spacing.nodeNode": "34",
      "elk.spacing.edgeNode": "18",
      "elk.spacing.edgeEdge": "10",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: (children.get(null) ?? []).map(toElk),
    // Reads that run back go to ELK reversed, so it lays out the Program
    // in the order it runs and routes them around; ELK also places each
    // label on its edge and keeps nodes clear of it.
    edges: edges.map((e) => {
      const text = edgeLabel(e)
      const ends = [`${e.source}::out`, `${e.target}::${e.targetHandle}`]
      if (e.recurrence) ends.reverse()
      return {
        id: e.id,
        sources: [ends[0]!],
        targets: [ends[1]!],
        labels: text
          ? [
              {
                id: `${e.id}::label`,
                text,
                width: Math.ceil(text.length * 5.4) + 10,
                height: 15,
                layoutOptions: { "elk.edgeLabels.placement": "CENTER", "elk.edgeLabels.inline": "true" },
              },
            ]
          : undefined,
      }
    }),
  }
  let laid: ElkNode
  try {
    laid = await elk.layout(root)
  } catch (e) {
    console.error("layout failed", e)
    return grid(nodes.filter((n) => n.kind !== "group" && n.kind !== "unit"), widths, ns)
  }

  const rf: Node[] = []
  const routes = new Map<string, Route>()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const back = new Set(edges.filter((e) => e.recurrence).map((e) => e.id))
  const collect = (list: ElkExtendedEdge[] | undefined) => {
    for (const e of list ?? []) {
      const s = e.sections?.[0]
      const l = e.labels?.[0]
      if (s) {
        const points = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]
        routes.set(e.id, {
          points: back.has(e.id) ? points.reverse() : points,
          label: l ? { x: (l.x ?? 0) + (l.width ?? 0) / 2, y: (l.y ?? 0) + (l.height ?? 0) / 2 } : null,
        })
      }
    }
  }
  const walk = (en: ElkNode, parent: string | null) => {
    collect(en.edges)
    for (const c of en.children ?? []) {
      const n = byId.get(c.id)!
      rf.push({
        id: ns + c.id,
        type: `program-${n.kind}`,
        position: { x: c.x ?? 0, y: c.y ?? 0 },
        data: { view: n },
        style: { width: c.width, height: c.height, pointerEvents: "all" },
        ...(parent ? { parentId: ns + parent, extent: "parent" as const } : {}),
      })
      walk(c, c.id)
    }
  }
  walk(laid, null)
  // A level's inputs and outputs, each row labeled where it starts.
  const top = rf.filter((r) => !r.parentId)
  for (const [text, inRow] of [
    ["Inputs", isSource],
    ["Outputs", isSink],
  ] as const) {
    const row = top.filter((r) => inRow((r.data as ViewData).view))
    if (!row.length) continue
    rf.push({
      id: `${ns}::${text}`,
      type: "program-rowlabel",
      position: { x: Math.min(...row.map((r) => r.position.x)) - 76, y: Math.min(...row.map((r) => r.position.y)) },
      data: { text },
      draggable: false,
      selectable: false,
      style: { width: 64, height: PILL_H, pointerEvents: "none" },
    })
  }
  return { nodes: rf, routes }
}

// With proof units on, inside a Call: the parts whose gates all go to units of one kind, wired to
// each other, share an outline. A part with gates in units of several kinds has unit boundaries
// inside it, and stays outside every outline.
function outlineUnits(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  cells: Record<string, Record<string, [number, number, number, number]>>,
  types: Record<string, UnitType>
): CanvasNode[] {
  const kindOf = new Map<string, string>()
  for (const n of nodes) {
    if (n.kind !== "part") continue
    const keys = Object.entries(cells[n.group.id] ?? {}).filter(([k, x]) => x[1] > 0 && types[k])
    if (keys.length === 1) kindOf.set(n.id, keys[0]![0])
  }
  const up = new Map<string, string>()
  const find = (x: string): string => {
    const p = up.get(x)
    if (!p || p === x) return x
    const r = find(p)
    up.set(x, r)
    return r
  }
  for (const e of edges) {
    const k = kindOf.get(e.source)
    if (!k || k !== kindOf.get(e.target)) continue
    const [a, b] = [find(e.source), find(e.target)]
    if (a !== b) up.set(a, b)
  }
  const outlines = new Map<string, UnitOutlineView>()
  for (const n of nodes) {
    const key = kindOf.get(n.id)
    if (!key || n.kind !== "part") continue
    const root = find(n.id)
    let o = outlines.get(root)
    if (!o) {
      o = { kind: "unit", id: `u:${outlines.size}`, parent: null, type: types[key]!, units: 0, size: 0, groups: [], also: [] }
      outlines.set(root, o)
    }
    if (o.groups.includes(n.group.id)) continue
    o.groups.push(n.group.id)
    const [units, , size] = cells[n.group.id]![key]!
    o.units += units
    o.size += size
  }
  // An outline is one proof unit. Parts that are many units, side by side or lane by lane, say how
  // many in their badges and hover cards instead.
  for (const [root, o] of outlines) if (o.units !== 1) outlines.delete(root)
  for (const [root, o] of outlines) {
    const key = kindOf.get(root)!
    for (const n of nodes) {
      if (n.kind === "part" && !kindOf.has(n.id) && (cells[n.group.id]?.[key]?.[1] ?? 0) > 0) o.also.push(defName(n.group.fn))
    }
  }
  const out: CanvasNode[] = []
  const placed = new Set<string>()
  for (const n of nodes) {
    const o = kindOf.has(n.id) ? outlines.get(find(n.id)) : undefined
    if (!o || n.kind !== "part") {
      out.push(n)
      continue
    }
    if (!placed.has(o.id)) {
      placed.add(o.id)
      out.push(o)
    }
    out.push({ ...n, parent: o.id })
  }
  return out
}

// A path through ELK's route, with rounded corners.
function roundedPath(points: ElkPoint[], radius = 7) {
  if (points.length < 2) return ""
  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1]!, points[i]!, points[i + 1]!]
    const d1 = Math.hypot(b.x - a.x, b.y - a.y)
    const d2 = Math.hypot(c.x - b.x, c.y - b.y)
    const r = Math.min(radius, d1 / 2, d2 / 2)
    if (r <= 0) {
      d += ` L ${b.x} ${b.y}`
      continue
    }
    const p = { x: b.x - ((b.x - a.x) / d1) * r, y: b.y - ((b.y - a.y) / d1) * r }
    const q = { x: b.x + ((c.x - b.x) / d2) * r, y: b.y + ((c.y - b.y) / d2) * r }
    d += ` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`
  }
  const last = points[points.length - 1]!
  return `${d} L ${last.x} ${last.y}`
}

function ElkEdge({ sourceX, sourceY, targetX, targetY, data, style, markerEnd }: EdgeProps) {
  const d = data as { route?: Route; label?: string } | undefined
  const points = d?.route?.points ?? [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ]
  const at = d?.label ? d.route?.label : null
  // The layout ends a wire at its ports' centers, on the nodes' edges; it's drawn from the source
  // dot's bottom to the target dot's top, the arrow's tip on the dot.
  const drawn = points.length > 1 ? [{ ...points[0]!, y: points[0]!.y + HANDLE_R }, ...points.slice(1, -1), { ...points.at(-1)!, y: points.at(-1)!.y - HANDLE_R }] : points
  return (
    <>
      <BaseEdge markerEnd={markerEnd} path={roundedPath(drawn)} style={style} />
      {at ? (
        <EdgeLabelRenderer>
          <span
            className="pointer-events-none absolute rounded bg-background px-1 text-[10px] whitespace-nowrap"
            // Above the edges of nodes inside groups, which React Flow raises.
            style={{
              transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)`,
              color: style?.stroke as string,
              zIndex: 1001,
            }}
          >
            {d!.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

const edgeTypes = { elk: ElkEdge }

// `ns` scopes a level's ids for React Flow: a Definition body's or a subcircuit's are generic
// ("bp:0", "b:p0"), and a node carried over from the level before would keep its old measurements.
// With widths drawn as thickness, a wire's stroke grows with the log of the bits one read carries;
// its arrow keeps its size.
const strokeFor = (bits: number) => Math.min(5, Math.max(1, 0.5 + 0.75 * Math.log10(bits)))

function toEdges(edges: CanvasEdge[], routes: Map<string, Route>, ns: string, residualOn: boolean, strokes: boolean): Edge[] {
  return edges.map((e) => {
    const residual = residualOn && e.role === "residual"
    const scaled = strokes && Boolean(e.bits)
    const width = scaled ? strokeFor(e.bits!) : residual ? 2 : 1.25
    const arrow = scaled ? (12 * 1.25) / width : 12
    // The residual stream keeps its color when it runs back to the next layer.
    const color = residual ? RESIDUAL : e.recurrence ? RECURRENCE : "var(--muted-foreground)"
    return {
      id: ns + e.id,
      source: ns + e.source,
      sourceHandle: "out",
      target: ns + e.target,
      targetHandle: e.targetHandle,
      type: "elk",
      data: { route: routes.get(e.id), label: edgeLabel(e) ?? undefined },
      style: {
        stroke: color,
        strokeWidth: width,
        strokeOpacity: e.recurrence || residual ? 0.85 : 0.5,
        strokeDasharray: e.recurrence ? "5 4" : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: arrow, height: arrow, color },
    }
  })
}


type ViewData = { view: CanvasNode }

// A port's dot, centered on the node's edge, HANDLE_R across. Wires meet a dot at its outer edge.
const HANDLE_R = 3
const handleClass = "!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-foreground/35"

// A node's ports, placed on its own box (not inside its border), where the layout routes the wires.
function Ports({ n, width }: { n: CanvasNode; width: number }) {
  const ids = inputIds(n)
  const xs = spread(ids.length, width)
  return (
    <>
      {ids.map((id, k) => (
        <Handle className={handleClass} id={id} isConnectable={false} key={id} position={Position.Top} style={{ left: xs[k] }} type="target" />
      ))}
      <Handle className={handleClass} id="out" isConnectable={false} position={Position.Bottom} type="source" />
    </>
  )
}

type BarPart = { label: string; count: number; color?: string }

// How a subcircuit looks, whatever level it's at: its name, how many it stands for, whether it
// opens, and a bar of what's inside it.
type Face = {
  name: string
  badge?: string | null
  // Drawn as a deck of outlines behind it, with this count: "× 15".
  deck?: string | null
  open: boolean
  bar: BarPart[] | null
  // Not lowered to gates yet: nothing evaluates it.
  dashed?: boolean
  mark?: boolean
  dim?: boolean
}

// A subcircuit: a folder you can open. Everything else about it waits in its hover card.
function SubcircuitFace({
  n,
  face,
  hover,
  onClick,
  data,
}: {
  n: CanvasNode
  face: Face
  hover: ReactNode
  onClick: () => void
  data: Record<string, string | undefined>
}) {
  return (
    <>
    {face.deck ? (
      <>
        <span aria-hidden className="pointer-events-none absolute inset-0 translate-x-[8px] translate-y-[8px] rounded-md border border-foreground/12 bg-background" />
        <span aria-hidden className="pointer-events-none absolute inset-0 translate-x-[4px] translate-y-[4px] rounded-md border border-foreground/18 bg-background" />
      </>
    ) : null}
    <NodeHover
      n={n}
      trigger={
      <button
        className={cn(
          "nodrag nopan relative flex h-full w-full flex-col justify-center gap-1.5 rounded-md border px-3 text-left transition-colors",
          face.dashed ? "border-dashed border-foreground/35 bg-background hover:bg-muted/40" : "border-foreground/20 bg-muted/50 hover:bg-muted",
          face.mark && "ring-2 ring-foreground/20 ring-offset-2 ring-offset-background"
        )}
        onClick={onClick}
        style={{ opacity: face.dim ? 0.35 : undefined }}
        type="button"
        {...data}
      >
        <span className="flex items-center gap-1.5">
          {face.open ? (
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate text-[12.5px] font-medium">{face.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {face.badge ? (
              <span className="rounded border bg-background px-1 text-[10px] text-muted-foreground tabular-nums">{face.badge}</span>
            ) : null}
            {face.deck ? <span className="text-[11px] text-muted-foreground tabular-nums">{face.deck}</span> : null}
          </span>
        </span>
        {face.bar?.length ? (
          <MixBar parts={face.bar} />
        ) : (
          <span aria-hidden className="h-1.5 w-full rounded-full bg-foreground/[0.07]" />
        )}
      </button>
      }
    >
      {hover}
    </NodeHover>
    <Ports n={n} width={SUB_W} />
    </>
  )
}

// A level's port: what it reads across the top, what it writes across the bottom. With
// proof units on, a value the input unit certifies is hatched.
function PortPill({
  children,
  sink,
  input,
  onClick,
  title,
  ...rest
}: {
  children: ReactNode
  sink: boolean
  input?: boolean
  onClick?: () => void
  title?: string
} & Omit<ComponentProps<"div">, "children" | "onClick" | "title">) {
  const className = cn(
    "nodrag nopan flex h-full w-full items-center justify-center gap-1 rounded-full border bg-background px-3 text-[11.5px] whitespace-nowrap",
    onClick && "text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground"
  )
  const handle = sink ? (
    <Handle className={handleClass} id="in" isConnectable={false} position={Position.Top} type="target" />
  ) : (
    <Handle className={handleClass} id="out" isConnectable={false} position={Position.Bottom} type="source" />
  )
  const style = input ? { backgroundImage: HATCH } : undefined
  return onClick ? (
    <button
      {...(rest as ComponentProps<"button">)}
      className={className}
      data-input-unit={input ? "" : undefined}
      onClick={onClick}
      style={style}
      title={title}
      type="button"
    >
      {children}
      {handle}
    </button>
  ) : (
    <div {...rest} className={className} data-input-unit={input ? "" : undefined} style={style} title={title}>
      {children}
      {handle}
    </div>
  )
}

// "3.4B gates": a subcircuit's size.
// A node's hover card, over everything on the canvas and out of the way while a card is open. It
// ends with the node's size, by what's inside it.
function NodeHover({ n, trigger, children }: { n: CanvasNode; trigger: ReactNode; children: ReactNode }) {
  const { inspecting, sizesOf, variants } = useContext(GraphContext)
  const [open, setOpen] = useState(false)
  const sizes = open ? sizesOf(n) : []
  const total = sizes.reduce((a, it) => a + (it.size ?? 0), 0)
  return (
    <HoverCard closeDelay={60} onOpenChange={setOpen} open={open && !inspecting} openDelay={450}>
      <HoverCardTrigger asChild onClickCapture={() => setOpen(false)}>
        {trigger}
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[280px] p-3 font-sans text-[11.5px]" side="right" sideOffset={10}>
        {children}
        {sizes.length ? (
          <div className="mt-2.5 border-t pt-2">
            <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
              <span className="font-medium">Size</span>
              {total ? (
                <span className="font-mono tabular-nums">
                  {variants.partial && sizes.some((it) => it.partial) ? "≥ " : ""}
                  {fmtSize(total)}
                </span>
              ) : null}
            </div>
            <SizeList items={sizes} markPartial={variants.partial} />
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}

function HoverShell({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className="text-[12px] font-medium">{title}</div>
      {children}
    </>
  )
}

const Rows = ({ rows }: { rows: [string, ReactNode][] }) =>
  rows.length ? (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.map(([k, v]) => (
        <div className="contents" key={k}>
          <dt className="font-mono text-muted-foreground">{k}</dt>
          <dd className="min-w-0 truncate">{v}</dd>
        </div>
      ))}
    </dl>
  ) : null

// A hover card answers, in order: what it is, what it reads (its interface), how often it repeats
// and, below, how big it is. Ids, constants and the rest of the export's detail are in the About card.
function Repeats({ times, units }: { times: string | null; units?: string | null }) {
  const line = [times, units].filter(Boolean).join(" · ")
  return line ? <div className="mt-2 text-muted-foreground">{line}</div> : null
}

function OpHover({ n }: { n: OpView }) {
  const { nameOf, vu, row, ann } = useContext(GraphContext)
  const o = n.op
  const described = ann(`def:${stemOf(o.definition)}`, "description")
  const units = vu && o.cut ? o.cut.units : null
  const rows: [string, ReactNode][] = n.ports
    .filter((p) => p.key !== "in:weights")
    .map((p) => [p.name ?? "in", `← ${[...new Set(p.sources.map(nameOf))].join(", ")}`])
  if (o.weights.length) rows.push(["weights", o.weights.map((f) => field(o, f)).join(", ")])
  return (
    <HoverShell title={n.label ?? ann(`def:${stemOf(o.definition)}`, "name") ?? n.name}>
      <p className="mt-1 leading-snug text-muted-foreground">{described ?? (row ? opSummary(o, row) : o.definition)}</p>
      <Rows rows={rows} />
      <Repeats
        times={o.calls > 1 ? `${count(o.calls)} Calls` : null}
        units={units !== null ? `${fmtRange(units)} proof block${units === 1 ? "" : "s"} each` : null}
      />
    </HoverShell>
  )
}

// A part's hover card, by the same rule as an op's. A primitive with no gates says why, since that's
// why it has no size.
function PartHover({ n }: { n: PartView }) {
  const { vu, gatelessOf, lowering, ann } = useContext(GraphContext)
  const g = n.group
  const mix = groupMix(vu, g.id)
  const key = `def:${stemOf(g.fn)}`
  const rows: [string, ReactNode][] = n.ports.map((p) => [p.name, p.format ? fmtElems(p.words, p.format) : `${count(p.words)} element${p.words === 1 ? "" : "s"}`])
  const gl = n.def?.form === "primitive" ? gatelessOf(g.fn) : null
  const low = n.def?.form === "primitive" ? lowering(g.fn) : null
  return (
    <HoverShell title={ann(key, "name") ?? defName(g.fn)}>
      {ann(key, "description") ? <p className="mt-1 leading-snug text-muted-foreground">{ann(key, "description")}</p> : null}
      {gl ? <p className="mt-1 leading-snug text-muted-foreground">{gl.headline}</p> : null}
      {low && "composed" in low ? (
        <p className="mt-1 leading-snug text-muted-foreground">
          Lowered as a composed Definition, down to pieces counted by instance. It&apos;s too large to hold as one circuit, so
          its gates aren&apos;t drawn.
        </p>
      ) : null}
      <Rows rows={rows} />
      <Repeats times={partBadge(n)} />
      {mix?.length ? (
        <ul className="mt-2 flex flex-col gap-0.5">
          {mix.map((m) => (
            <li className="flex items-center gap-2" key={m.label}>
              <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ background: unitColor(m.label) }} />
              <span className="min-w-0 flex-1 truncate">{m.label}</span>
              {m.units ? <span className="text-muted-foreground tabular-nums">{count(m.units)} units</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </HoverShell>
  )
}

// With proof units on, a subcircuit's bar is the units it computes; otherwise what it is.
const unitBar = (mix: BarPart[] | null | undefined, own: BarPart): BarPart[] => (mix?.length ? mix : [own])

// One op: its Calls of one Definition, a subcircuit whose inside is the Call's body.
function OpNode({ data }: NodeProps<Node<ViewData>>) {
  const { enter: step, vu, ann } = useContext(GraphContext)
  const n = data.view as OpView
  const cut = vu?.partitionOf(n.op.id)
  const mix = cut ? [...byLabel(cut.types)].map(([label, t]) => ({ label, count: t.units })).sort((a, b) => b.count - a.count) : null
  const t = mixTemplate(templateOf(n.op))
  return (
    <SubcircuitFace
      data={{ "data-op": n.op.id }}
      face={{
        name: n.label ?? ann(`def:${stemOf(n.op.definition)}`, "name") ?? n.name,
        open: true,
        bar: unitBar(mix, { label: t.label, count: 1, color: t.color }),
        dim: Boolean(vu?.selected && mix && !mix.some((m) => m.label === vu.selected)),
      }}
      hover={<OpHover n={n} />}
      n={n}
      onClick={() => step(n)}
    />
  )
}

// A module: a grouping of Calls with ports, so a subcircuit like any other.
function ModuleNode({ data }: NodeProps<Node<ViewData>>) {
  const { toggle, vu, moduleMix, variants } = useContext(GraphContext)
  const n = data.view as ModView
  const units = vu ? moduleMix(n.path) : null
  const templates = n.mix.map((m) => {
    const t = mixTemplate(m.template)
    return { label: t.label, count: m.count, color: t.color }
  })
  return (
    <SubcircuitFace
      data={{ "data-path": n.path }}
      face={{
        ...repeatFace(variants.repeat, n.label ?? n.name, n.range, n.repeat ? `× ${count(n.repeat)}` : null),
        open: true,
        bar: units?.length ? units : templates,
        dim: Boolean(vu?.selected && units && !units.some((u) => u.label === vu.selected)),
      }}
      hover={
        <HoverShell title={n.label ?? n.name}>
          {n.note ? <p className="mt-1 leading-snug text-muted-foreground">{n.note}</p> : null}
          <Repeats times={n.repeat ? `× ${count(n.repeat)}, drawn once` : null} />
        </HoverShell>
      }
      n={n}
      onClick={() => toggle(n.path)}
    />
  )
}

function GroupNode({ data }: NodeProps<Node<ViewData>>) {
  const { toggle, variants } = useContext(GraphContext)
  const n = data.view as Extract<ViewNode, { kind: "group" }>
  const face = repeatFace(variants.repeat, n.label ?? n.name, n.range, n.repeat ? `× ${count(n.repeat)}` : null)
  return (
    <div className="relative h-full w-full">
      {face.deck ? (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-0 translate-x-[8px] translate-y-[8px] rounded-lg border border-foreground/10 bg-background" />
          <span aria-hidden className="pointer-events-none absolute inset-0 translate-x-[4px] translate-y-[4px] rounded-lg border border-foreground/15 bg-background" />
        </>
      ) : null}
    <div className="relative h-full w-full rounded-lg border border-foreground/15 bg-muted/15">
      <button
        className="nodrag nopan flex h-9 max-w-full items-center gap-1.5 px-3 text-left text-muted-foreground hover:text-foreground"
        data-path={n.path}
        onClick={() => toggle(n.path)}
        title={n.note ?? undefined}
        type="button"
      >
        <ChevronDown aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate text-[12.5px] font-medium text-foreground">{face.name}</span>
        {face.badge ? <span className="shrink-0 rounded border bg-background px-1 text-[10px]">{face.badge}</span> : null}
        {face.deck ? <span className="shrink-0 text-[11px] tabular-nums">{face.deck}</span> : null}
      </button>
    </div>
    </div>
  )
}

// A level's input or output, with the same card at every level: what it's an input or output of,
// what it holds, and what it's wired to.
function PortCard({ title, role, note, rows }: { title: ReactNode; role: string; note?: ReactNode; rows: [string, ReactNode][] }) {
  return (
    <HoverShell title={title}>
      <p className="mt-1 leading-snug text-muted-foreground">{role}</p>
      {note ? <p className="mt-1.5 leading-snug">{note}</p> : null}
      <Rows rows={rows} />
    </HoverShell>
  )
}

// What a Call's parameter holds, as the program graph says it.
const ROLE_TEXT: Record<string, string> = {
  activations: "activations another Call computes",
  weights: "weights",
  prompt: "the request's prompt",
  seed: "the sampling seed",
  splits: "the top-p split count",
  constant: "a constant",
  peers: "the other rank's values",
}

const listed = (names: string[]) => [...new Set(names)].join(", ")

// The Program's inputs (the request's tokens, the sampler's seed), which the input unit certifies,
// each saying what it is and what reads it.
function InputNode({ data }: NodeProps<Node<ViewData>>) {
  const { vu, nameOf } = useContext(GraphContext)
  const n = data.view as Extract<ViewNode, { kind: "input" }>
  return (
    <NodeHover
      n={n}
      trigger={
        <PortPill data-port="in" data-program-input={n.name} input={Boolean(vu)} sink={false}>
          {n.label ?? n.name}
        </PortPill>
      }
    >
      <PortCard
        note={n.note}
        role={vu ? "An input of the Program, which the input unit certifies." : "An input of the Program."}
        rows={[
          ...(INPUT_TYPES[n.name] ? [["format", INPUT_TYPES[n.name]!.format] as [string, ReactNode]] : []),
          ["read by", listed(n.readers.map(nameOf))],
        ]}
        title={n.label ?? n.name}
      />
    </NodeHover>
  )
}

// The Program's outputs: what it makes that nothing after it reads.
function OutputNode({ data }: NodeProps<Node<ViewData>>) {
  const { nameOf, elementOf } = useContext(GraphContext)
  const n = data.view as Extract<ViewNode, { kind: "output" }>
  const element = elementLabel(elementOf(n.name)?.format, n.bits)
  return (
    <NodeHover
      n={n}
      trigger={
        <PortPill data-port="out" data-program-output="" sink>
          {n.label ?? "Output"}
        </PortPill>
      }
    >
      <PortCard
        note={n.note}
        role="An output of the Program."
        rows={[
          ["from", nameOf(n.name)],
          ["values", fmtElems(n.reads, element)],
        ]}
        title={n.label ?? "Output"}
      />
    </NodeHover>
  )
}

// A module's input from outside it, or its output read outside it; clicking it goes there.
function BoundaryNode({ data }: NodeProps<Node<ViewData>>) {
  const { nameOf, go, level } = useContext(GraphContext)
  const n = data.view as Extract<ViewNode, { kind: "boundary" }>
  const name = n.label ?? nameOf(n.name)
  const into = n.direction === "in"
  return (
    <NodeHover
      n={n}
      trigger={
        <PortPill data-port={n.direction} onClick={() => go(n.goto)} sink={!into}>
          <span className="shrink-0">{into ? "from" : "to"}</span>
          <span className="truncate text-foreground">
            {n.context ? <span className="text-muted-foreground">{n.context} · </span> : null}
            {name}
          </span>
        </PortPill>
      }
    >
      <PortCard
        note="Click to go there."
        role={into ? `An input of ${level}, from outside it.` : `An output of ${level}, read outside it.`}
        rows={[[into ? "from" : "to", n.context ? `${name}, in ${n.context}` : name]]}
        title={name}
      />
    </NodeHover>
  )
}

// How many parts one drawn part stands for: "× 1,024", "16 steps", a chain's "2 of 31".
function partBadge(n: PartView): string | null {
  const s = n.step
  if (s) return "skipped" in s ? `${count(s.skipped)} more` : `${count(s.index)} of ${count(s.of)}`
  const g = n.group
  if (g.form === "batch") return `× ${count(g.n)}${g.chain ? ` · ${count(g.chain)} steps` : ""}`
  if (g.form === "scan") return `${count(g.n)} steps`
  if (g.chain) return `${g.count > 1 ? `× ${count(g.count)} · ` : ""}${count(g.chain)} steps`
  return g.count > 1 ? `× ${count(g.count)}` : null
}

// One group of a Definition's body: a composite you can step into, or a primitive, which opens onto
// its Boolean circuit when it's lowered and is dashed when it isn't.
function PartNode({ data }: NodeProps<Node<ViewData>>) {
  const { open, vu, lowering, gatelessOf, variants, ann } = useContext(GraphContext)
  const n = data.view as PartView
  const g = n.group
  const primitive = n.def?.form === "primitive"
  const low = primitive ? lowering(g.fn) : null
  const lowered = Boolean(low && "root" in low)
  const gl = primitive ? gatelessOf(g.fn) : null
  const mix = groupMix(vu, g.id)
  const kind = partKind(g.fn)
  // "× 3,072" is repetition, drawn by variant; a chain's "2 of 31" stays a badge.
  const badge = partBadge(n)
  const many = Boolean(badge?.startsWith("×"))
  const rep = repeatFace(variants.repeat, ann(`def:${stemOf(g.fn)}`, "name") ?? defName(g.fn), null, many ? badge : null)
  return (
    <SubcircuitFace
      data={{
        "data-fn": g.fn,
        "data-primitive": primitive ? "" : undefined,
        "data-lowering": low ? (lowered ? "lowered" : "composed" in low ? "composed" : (gl?.kind ?? "not-lowered")) : undefined,
        "data-part": n.step ? `${g.id}#${"skipped" in n.step ? "fold" : n.step.index}` : g.id,
      }}
      face={{
        ...rep,
        badge: rep.badge ?? (many ? null : badge),
        open: Boolean(n.def?.form === "composite" && n.def.groups) || lowered,
        bar: unitBar(mix, { label: kind.label, count: 1, color: kind.color }),
        dashed: gl?.kind === "not-lowered",
        dim: Boolean(vu?.selected && mix && !mix.some((m) => m.label === vu.selected)),
      }}
      hover={<PartHover n={n} />}
      n={n}
      onClick={() => open(n)}
    />
  )
}

// A lowered template's size: all its gates, per instance.
const templateSize = (t: { and?: number; xor?: number; not?: number }) => (t.and ?? 0) + (t.xor ?? 0) + (t.not ?? 0)

// One drawn part of a Boolean subcircuit: you can step into it, down to its gates, unless it's a table.
function BoolPartNode({ data }: NodeProps<Node<ViewData>>) {
  const { stepBool, variants } = useContext(GraphContext)
  const v = data.view as BoolView
  const n = v.node
  return (
    <SubcircuitFace
      data={{ "data-bool": v.ref }}
      face={{
        ...repeatFace(variants.repeat, subcircuitName(v.ref, n), null, v.count > 1 ? `× ${count(v.count)}` : null),
        open: n.children.length > 0 || Boolean(n.module),
        bar: [{ label: kindLabel(n.kind), count: 1, color: kindColor(n.kind) }],
        mark: v.mark,
      }}
      hover={
        <HoverShell title={subcircuitName(v.ref, n)}>
          <p className="mt-1 leading-snug text-muted-foreground">{kindLabel(n.kind)}</p>
          <Rows rows={[["bits", `${count(n.in)} in → ${count(n.out)} out`]]} />
          <Repeats times={v.count > 1 ? `× ${count(v.count)}` : null} />
        </HoverShell>
      }
      n={v}
      onClick={() => stepBool(v)}
    />
  )
}

// A Boolean subcircuit's own gates, outside its parts: files beside its folders. Clicking them
// picks them out among its gates.
function OwnNode({ data }: NodeProps<Node<ViewData>>) {
  const { showOwn } = useContext(GraphContext)
  const v = data.view as OwnView
  const c = v.counts
  const size = c.and + c.xor + c.not
  return (
    <>
    <NodeHover
      n={v}
      trigger={
        <button
          className={cn(
            "nodrag nopan relative flex h-full w-full flex-col justify-center gap-1.5 rounded-md border bg-background px-3 text-left shadow-xs transition-shadow",
            showOwn ? "hover:shadow-md" : "cursor-default"
          )}
          data-own=""
          onClick={() => showOwn?.()}
          type="button"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate text-[12.5px] font-medium">Own gates</span>
            <span className="ml-auto shrink-0 rounded border bg-background px-1 text-[10px] text-muted-foreground tabular-nums">
              {fmtSize(size)}
            </span>
          </span>
          <MixBar parts={[{ label: "Own gates", count: 1, color: OWN_COLOR }]} />
        </button>
      }
    >
      <HoverShell title="Own gates">
        <p className="mt-1 leading-snug text-muted-foreground">The gates it has outside its components, which join them up.</p>
        {!size ? (
          <p className="mt-2 leading-snug text-muted-foreground">None is live in the unit: the bits routed here come from gates it never uses.</p>
        ) : null}
      </HoverShell>
    </NodeHover>
    <Ports n={v} width={SUB_W} />
    </>
  )
}

// A Definition's parameter coming in, or its return going out.
function ParamNode({ data }: NodeProps<Node<ViewData>>) {
  const { widths, inputs, level, linked, roleOf, ann, levelDef } = useContext(GraphContext)
  const n = data.view as Extract<BodyNode, { kind: "param" | "ret" }>
  const out = n.kind === "ret"
  const key = levelDef ? `port:${stemOf(levelDef)}/${out ? "out" : `in/${n.name}`}` : null
  const name = (key && ann(key, "name")) ?? n.name
  const format = key ? ann(key, "format") : null
  const roles = out ? null : roleOf(n.id)
  const { from, to } = linked(n.id)
  const rows: [string, ReactNode][] = []
  if (roles?.length) rows.push(["holds", roles.map((r) => ROLE_TEXT[r] ?? r).join(", or ")])
  rows.push(["type", typeLabel(n.type)])
  if (format) rows.push(["format", format])
  if (name !== n.name) rows.push(["parameter", n.name])
  if (out && from.length) rows.push(["from", listed(from)])
  if (!out && to.length) rows.push(["read by", listed(to)])
  return (
    <NodeHover
      n={n}
      trigger={
        <PortPill data-port={out ? "out" : "in"} input={inputs.has(n.id)} sink={out}>
          {name}
          {widths ? <span className="text-muted-foreground">· {typeLabel(n.type)}</span> : null}
        </PortPill>
      }
    >
      <PortCard
        note={inputs.has(n.id) ? "The input unit certifies it: it's checked against its anchor, never sampled." : null}
        role={`${out ? "An output" : "An input"} of ${level}.`}
        rows={rows}
        title={name}
      />
    </NodeHover>
  )
}

// A Boolean subcircuit's port, one bundle of its wires.
function BoolPortNode({ data }: NodeProps<Node<ViewData>>) {
  const { widths, level, linked } = useContext(GraphContext)
  const n = data.view as BoolPortView
  const out = n.direction === "out"
  const { from, to } = linked(n.id)
  const rows: [string, ReactNode][] = [["width", fmtBits(n.bits) ?? "0 bits"]]
  if (out && from.length) rows.push(["from", listed(from)])
  if (!out && to.length) rows.push(["read by", listed(to)])
  return (
    <NodeHover
      n={n}
      trigger={
        <PortPill data-port={n.direction} sink={out}>
          {n.name}
          {widths ? <span className="text-muted-foreground">· {fmtBits(n.bits)}</span> : null}
        </PortPill>
      }
    >
      <PortCard role={`${out ? "An output" : "An input"} of ${level}.`} rows={rows} title={n.name} />
    </NodeHover>
  )
}

// The label at the start of a level's row of inputs, or of outputs.
function RowLabel({ data }: NodeProps<Node<{ text: string }>>) {
  return (
    <div className="flex h-full w-full items-center justify-end text-[10.5px] font-medium tracking-wide text-muted-foreground/80 uppercase">
      {data.text}
    </div>
  )
}

// With proof units on: one proof unit, outlined around the parts whose gates it checks together.
function UnitOutlineNode({ data }: NodeProps<Node<ViewData>>) {
  const { vu } = useContext(GraphContext)
  const n = data.view as UnitOutlineView
  const t = n.type
  const color = unitColor(t.label)
  const recompute = t.kind === "recompute"
  // Output units pack several narrow values into one element's width.
  const element = t.format && t.format !== "bit" ? `one ${t.format} element` : `${t.bits} bit${t.bits === 1 ? "" : "s"}`
  return (
    <div
      className={cn("h-full w-full rounded-xl border-[1.5px]", recompute && "border-dashed")}
      data-unit-outline={t.label}
      style={{
        borderColor: `color-mix(in oklch, ${color} 75%, transparent)`,
        background: `color-mix(in oklch, ${color} 7%, transparent)`,
        opacity: vu?.selected && vu.selected !== t.label ? 0.35 : undefined,
      }}
    >
      <HoverCard closeDelay={60} openDelay={250}>
        <HoverCardTrigger asChild>
          <div className="nodrag nopan flex h-8 w-fit max-w-full cursor-default items-center gap-1.5 px-3 text-[11.5px]">
            <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ background: color }} />
            <span className="truncate font-medium">{t.label}</span>
            <span className="shrink-0 text-muted-foreground">proof block</span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-[290px] p-3 font-sans text-[11.5px]" side="right" sideOffset={10}>
          <HoverShell title={t.label}>
            <p className="mt-1 leading-snug text-muted-foreground">
              One proof unit: the gates in this outline are checked together, and every gate is in exactly one unit.
            </p>
            <p className="mt-1.5 leading-snug">
              {recompute
                ? `It computes ${element}, which isn't committed yet: the units that read it compute it.`
                : `It computes ${element}, ${kindText([t.kind])}. Values are committed where they cross the outline.`}
            </p>
            <Rows
              rows={[
                ...(n.size ? [["size", fmtSize(n.size)] as [string, ReactNode]] : []),
                ...(n.also.length ? [["also inside", listed(n.also)] as [string, ReactNode]] : []),
              ]}
            />
          </HoverShell>
        </HoverCardContent>
      </HoverCard>
    </div>
  )
}

const nodeTypes = {
  "program-op": OpNode,
  "program-module": ModuleNode,
  "program-group": GroupNode,
  "program-input": InputNode,
  "program-output": OutputNode,
  "program-boundary": BoundaryNode,
  "program-part": PartNode,
  "program-param": ParamNode,
  "program-ret": ParamNode,
  "program-bool": BoolPartNode,
  "program-own": OwnNode,
  "program-bport": BoolPortNode,
  "program-unit": UnitOutlineNode,
  "program-rowlabel": RowLabel,
}

const conformanceLabel: Record<string, string> = {
  "exact-model-tested": "Exact model, tested against production",
  "model-untested": "Model not yet tested against production",
  "not-yet-established": "Not yet established",
  superseded: "Superseded",
}

function Card({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children?: ReactNode }) {
  return (
    <section aria-label="Datasheet" className="pointer-events-auto flex min-h-0 w-[300px] flex-col gap-2.5 overflow-y-auto rounded-lg border bg-background p-3.5 text-[12px] shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{title}</div>
          {sub ? <div className="font-mono text-[11px] break-all text-muted-foreground">{sub}</div> : null}
        </div>
        <button aria-label="Close" className="text-muted-foreground hover:text-foreground" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      {children}
    </section>
  )
}

const Facts = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
    {rows.map(([k, v]) => (
      <div className="contents" key={k}>
        <dt className="text-muted-foreground">{k}</dt>
        <dd className="min-w-0">{v}</dd>
      </div>
    ))}
  </dl>
)

// An op in "Open in place", which has no Call to step into: what it computes and reads.
function Inspector({ op, onClose }: { op: OpView; onClose: () => void }) {
  const { nameOf, row, boolean } = useContext(GraphContext)
  const o: ProgramOp = op.op
  const spec = Object.entries(o.params)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")
  const lowered = templateOfGroup(boolean, o.group)
  const gl = lowered?.kind === "not-yet-lowered" ? gateless({ template: templateOf(o), reason: lowered.reason }) : null
  const gates: [string, ReactNode][] = gl
    ? [["Size", gl.sizeRow]]
    : lowered?.kind === "template" && lowered.and !== undefined
      ? [["Size", `${fmtSize(templateSize(lowered))} per ${templateName(lowered)}`]]
      : []
  return (
    <Card onClose={onClose} sub={`${o.definition}${spec ? `{${spec}}` : ""}`} title={op.label ?? op.name}>
      {op.note ? <p className="leading-snug text-muted-foreground">{op.note}</p> : null}
      <Facts
        rows={[
          ["Computes", row ? opSummary(o, row) : o.definition],
          ...op.ports.map((p): [string, ReactNode] => [p.name ?? "in", `← ${[...new Set(p.sources.map(nameOf))].join(", ")}`]),
          ...gates,
        ]}
      />
      {gl ? <GatelessNote g={gl} /> : null}
    </Card>
  )
}

// Why there are no gates below something: it's wiring, or it isn't lowered yet, and what it is.
function GatelessNote({ g }: { g: Gateless }) {
  return (
    <p
      className={cn("rounded-md border px-2.5 py-2 leading-snug", g.kind === "not-lowered" ? "border-dashed border-foreground/30" : "border-foreground/25")}
      data-gateless={g.kind}
    >
      <span className="font-medium">{g.headline}</span> <span className="text-muted-foreground">{g.detail}</span>
    </p>
  )
}

// A registry docstring, with its inline code set as code.
function Doc({ text }: { text: string }) {
  const [more, setMore] = useState(false)
  const parts = text.replace(/\*\*/g, "").replace(/``/g, "`").split("`")
  return (
    <div>
      <p className={cn("text-[11.5px] leading-snug text-muted-foreground", !more && "line-clamp-3")}>
        {parts.map((p, i) =>
          i % 2 ? (
            <code className="font-mono text-[10.5px] text-foreground/80" key={i}>
              {p}
            </code>
          ) : (
            p
          )
        )}
      </p>
      {text.length > 160 ? (
        <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setMore((m) => !m)} type="button">
          {more ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  )
}

// A Call's units under the committed cut, and the words it commits inside.
function CutList({ vu }: { vu: VuView }) {
  const p = vu.cut!
  const types = [...byLabel(p.types)].sort((a, b) => b[1].units - a[1].units)
  const committed = Object.values(p.types).reduce((a, t) => a + (t.kind === "committed" ? t.units : 0), 0)
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-muted-foreground">Proof blocks per Call</div>
      <ul className="flex flex-col gap-0.5">
        {types.map(([label, t]) => (
          <li key={label}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: unitColor(label) }} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="tabular-nums">{count(t.units)}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">{unitDetail(t)}</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
      {committed ? (
        <div className="text-[11px] text-muted-foreground" data-committed={committed}>
          Commits {count(committed)} value{committed === 1 ? "" : "s"} inside the Call
        </div>
      ) : null}
    </div>
  )
}

// The Definition whose body is drawn, or a gate you clicked.
function DefCard({
  def,
  call,
  varying,
  part,
  onClose,
  tokens,
}: {
  def: Definition
  call: OpView | null
  varying: Record<string, number> | null
  part: PartView | null
  onClose: () => void
  tokens: Record<string, TokenData>
}) {
  const { vu, boolean, gatelessOf, ann } = useContext(GraphContext)
  const annKey = `def:${stemOf(def.id)}`
  const token = tokens[call ? templateOf(call.op) : shortFn(def.id)]
  const lowered = call ? templateOfGroup(boolean, call.op.group) : null
  // Why there are no gates below it: a primitive you clicked, or the Call's whole template.
  const gl =
    part && def.form === "primitive"
      ? gatelessOf(part.group.fn)
      : call && lowered?.kind === "not-yet-lowered"
        ? gateless({ template: templateOf(call.op), reason: lowered.reason })
        : null
  const sub = [statics(def), varying ? Object.entries(varying).map(([k, v]) => `drawn at ${k} = ${count(v)}`).join(", ") : null]
    .filter(Boolean)
    .join(" · ")
  const rows: [string, ReactNode][] = []
  if (token) rows.push(["Template", <TokenButton {...token} key="t" />])
  if (def.form === "primitive") {
    rows.push(["Reads", <span className="font-mono text-[11px]" key="r">{(def.params ?? []).map((p) => `${p.name}: ${typeLabel(p)}`).join(", ")}</span>])
    rows.push(["Returns", <span className="font-mono text-[11px]" key="o">{def.ret ? typeLabel(def.ret) : "?"}</span>])
  } else rows.push(["Primitives", count(def.gates)])
  if (part) rows.push(["Here", count(part.group.count * (part.group.chain ?? 1) * part.group.n)])
  if (part?.consts.length) rows.push(["Constants", part.consts.join("; ")])
  if (def.conformance) rows.push(["Status", conformanceLabel[def.conformance] ?? def.conformance])
  if (lowered?.kind === "template" && lowered.and !== undefined) {
    const at = lowered.at ? ` at T = ${count(lowered.at.T)}` : ""
    rows.push(["Size", `${fmtSize(templateSize(lowered))} per ${templateName(lowered)}${at}`])
    const missing = Object.keys(lowered.notLowered ?? {}).map(defName)
    if (missing.length) rows.push(["Not lowered", missing.join(", ")])
  } else if (gl) rows.push(["Size", gl.sizeRow])
  return (
    <Card
      onClose={onClose}
      sub={sub || undefined}
      title={ann(annKey, "name") ?? defName(def.id)}
    >
      {ann(annKey, "description") ? <p className="leading-snug">{ann(annKey, "description")}</p> : null}
      {gl ? <GatelessNote g={gl} /> : null}
      {def.doc ? <Doc key={def.id} text={def.doc} /> : null}
      {vu?.cut && call && !part ? <CutList vu={vu} /> : null}
      <Facts rows={rows} />
      {def.summary ? (
        <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
          {def.summary.slice(0, 8).map((x) => (
            <li key={x.fn}>
              {defName(x.fn)} × {count(x.count)}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

// A Boolean subcircuit you've stepped into, or one of its parts you clicked. The first level below a
// primitive also carries the primitive's own card.
function BoolCard({
  id,
  node,
  variants,
  primitive,
  onClose,
}: {
  id: string
  node: BoolNode
  variants: number
  primitive: Definition | null
  onClose: () => void
}) {
  const rows: [string, ReactNode][] = [
    ["Size", fmtSize(templateSize(node))],
    ["AND", count(node.and)],
    ["XOR", count(node.xor)],
    ["NOT", count(node.not)],
    ["Bits", `${count(node.in)} in → ${count(node.out)} out`],
  ]
  if (variants > 1) rows.push(["Variants", `${count(variants)}, differing in constants; this is one`])
  return (
    <Card onClose={onClose} sub={node.fn === "root" ? kindLabel(node.kind) : `${kindLabel(node.kind)} · ${node.fn}`} title={subcircuitName(id, node)}>
      {primitive?.doc ? <Doc key={primitive.id} text={primitive.doc} /> : null}
      <Facts rows={rows} />
      {node.module ? null : node.kind === "composed" ? (
        <p className="leading-snug text-muted-foreground" data-gates-where="components">
          Too wide for one circuit type, it&apos;s composed of its parts, counted by instance. Each part opens down to its gates.
        </p>
      ) : (
        <p className="leading-snug text-muted-foreground" data-gates-where="none">
          The export has no circuit type for it, so its gates are counted but not drawn.
        </p>
      )}
    </Card>
  )
}

// How many levels of modules the graph opens at once: 1 is only what's in the module you're in.
export const LEVELS = [1, 2, 3, Infinity] as const

// Inside a Call (or a Definition opened on its own, with no op), the Definitions stepped through
// from `spec`, by group; and below a primitive, the Boolean subcircuits stepped through, with the
// primitive they started from and the part it is.
type Inside = {
  op: OpView | null
  spec: string
  path: string[]
  part: string | null
  bool: { id: string; variants: number }[]
  primitive: string | null
}

const rootInside = (spec: string, land: string | null): Inside => ({
  op: null,
  spec,
  path: [],
  part: null,
  bool: land ? [{ id: land, variants: 1 }] : [],
  primitive: land ? spec : null,
})

// The parameters of the Definition drawn at a level that hold values the input unit certifies (weights,
// the request's inputs, randomness): in the Call, the ones whose roles say so, or where the program
// graph doesn't say yet, its weights (its last parameters) and what it reads of the Program's own
// inputs; below, the parameters that read only those.
const INPUT_ROLES = new Set(["weights", "prompt", "seed", "splits"])
function inputParamsAt(
  defs: Definitions,
  trail: string[],
  inside: Inside,
  graph: Graph,
  roles: { complete: boolean; params: (string[] | null)[] } | undefined
): Set<number> {
  const params = defs.definitions[trail[0]!]?.params ?? []
  const weights = inside.op?.op.weights.length ?? 0
  const fromInputs = Boolean(inside.op?.ports.length && inside.op.ports.every((p) => p.sources.every((s) => s.startsWith("in:"))))
  let held = new Set<number>()
  params.forEach((p, i) => {
    const known = roles?.params[i]
    if (known) {
      if (known.some((r) => INPUT_ROLES.has(r))) held.add(i)
    } else if (!roles?.complete && (i >= params.length - weights || graph.inputs.includes(p.name) || fromInputs)) held.add(i)
  })
  for (let k = 1; k < trail.length; k++) {
    const g = defs.definitions[trail[k - 1]!]?.groups?.find((x) => x.id === inside.path[k - 1])
    const next = new Set<number>()
    defs.definitions[trail[k]!]?.params?.forEach((p, i) => {
      const reads = g?.reads.filter((r) => r.arg === p.name && r.from) ?? []
      if (reads.length && reads.every((r) => r.from!.startsWith("p") && held.has(Number(r.from!.slice(1))))) next.add(i)
    })
    held = next
  }
  return held
}

// Back and forward through the places you've been in the graph, as a browser's buttons are.
function History({ back, forward }: { back: (() => void) | null; forward: (() => void) | null }) {
  return (
    <ButtonGroup aria-label="History" className="absolute top-3 left-3 z-10 bg-background">
      <Button aria-label="Back" data-history="back" disabled={!back} onClick={back ?? undefined} size="icon-sm" variant="outline">
        <ArrowLeft />
      </Button>
      <Button aria-label="Forward" data-history="forward" disabled={!forward} onClick={forward ?? undefined} size="icon-sm" variant="outline">
        <ArrowRight />
      </Button>
    </ButtonGroup>
  )
}

function Crumbs({
  graph,
  program,
  scope,
  annotations,
  onGo,
  inner,
  onBottom,
}: {
  graph: Graph
  // A Definition opened on its own starts its trail at itself.
  program: boolean
  scope: string | null
  annotations: Annotation[]
  onGo: (path: string | null) => void
  inner: { label: string; go: () => void }[]
  // Where the trail ends, as it wraps: the canvas keeps its content below it.
  onBottom: (y: number) => void
}) {
  const { moduleLabel } = useMemo(() => labeler(graph, annotations), [graph, annotations])
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = nav.current
    if (!el) return
    const ro = new ResizeObserver(() => onBottom(el.offsetTop + el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [onBottom])
  const modules = new Map(graph.modules.map((m) => [m.path, m]))
  const chain: string[] = []
  for (let p = scope; p; p = modules.get(p)?.parent || null) chain.unshift(p)
  const items = [
    ...chain.map((p) => ({ key: p, label: moduleLabel(p) ?? modules.get(p)?.name ?? p, go: () => onGo(p) })),
    ...inner.map((x, i) => ({ key: `inner-${i}`, ...x })),
  ]
  return (
    <nav
      aria-label="Where you are in the circuit"
      className="absolute top-3 left-[76px] z-10 flex max-w-[calc(100%-344px)] flex-wrap items-center gap-1 rounded-md border bg-background/95 px-2.5 py-1.5 text-[12px] shadow-xs max-sm:max-w-[calc(100%-88px)]"
      ref={nav}
    >
      {program ? (
        <button className={cn("hover:text-foreground", items.length ? "text-muted-foreground" : "font-medium")} onClick={() => onGo(null)} type="button">
          Program
        </button>
      ) : null}
      {items.map((x, i) => (
        <span className="flex items-center gap-1" key={x.key}>
          {program || i > 0 ? <ChevronRight aria-hidden className="size-3 text-muted-foreground" /> : null}
          <button
            className={cn("hover:text-foreground", i === items.length - 1 ? "font-medium" : "text-muted-foreground")}
            onClick={x.go}
            type="button"
          >
            {x.label}
          </button>
        </span>
      ))}
    </nav>
  )
}

export function Canvas({
  root,
  annotations,
  tokens,
  levels,
  loadDefs,
  loadBool,
  vuOn,
  widths,
  variants,
  start,
  onPlace,
  parts,
  onParts,
}: {
  root: CircuitRoot
  annotations: Annotation[]
  tokens: Record<string, TokenData>
  levels: number
  loadDefs: () => Promise<Definitions>
  // The circuit's Boolean circuits, when it has them: a row's, or a Definition's template's.
  loadBool: (() => Promise<BooleanRow>) | null
  vuOn: boolean
  widths: boolean
  variants: Variants
  // The place to open at (lib/circuits.ts), and where you are as you go.
  start: string | null
  onPlace: (place: string) => void
  // The parts tree: beside the canvas, over it (on a narrow screen), or closed.
  parts: "side" | "over" | null
  onParts: (open: boolean) => void
}) {
  const graph = root.kind === "program" ? root.graph : NO_PROGRAM
  const home = useMemo((): Inside | null => (root.kind === "definition" ? rootInside(root.spec, root.land) : null), [root])
  const [scope, setScope] = useState<string | null>(null)
  // A serving view's op is found in the Definitions as the Program graph's op it stands for.
  const srcId = useMemo(() => {
    const m = new Map(graph.ops.map((o) => [o.id, o.source ?? o.id]))
    return (id: string) => m.get(id) ?? id
  }, [graph])
  const [selected, setSelected] = useState<OpView | null>(null)
  const [inside, setInside] = useState<Inside | null>(home)
  const [picked, setPicked] = useState<PartView | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [pickedType, setPickedType] = useState<string | null>(null)
  const [defs, setDefs] = useState<Definitions | null>(null)
  const [boolData, setBoolData] = useState<BooleanRow | null>(null)
  const [pickedBool, setPickedBool] = useState<BoolView | null>(null)
  // At a subcircuit with parts: its parts, or its gates, with one part's
  // picked out (−1 for its own gates).
  const [gatesOn, setGatesOn] = useState(false)
  const [pickPart, setPickPart] = useState<number | null>(null)
  const partsView = () => {
    setGatesOn(false)
    setPickPart(null)
  }
  const [gateList, setGateList] = useState<{ id: string; list: GateList } | null>(null)
  // The circuit types fetched so far, the parts opened in place (by path) at the subcircuit drawn,
  // or all of them, and a drawing that would have too many gates.
  const moduleStore = useRef(new ModuleStore())
  const [openParts, setOpenParts] = useState<{ id: string; paths: Set<string>; all: boolean }>({ id: "", paths: new Set(), all: false })
  const [tooMany, setTooMany] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [nodes, setNodes] = useState<Node[]>([])
  const [routes, setRoutes] = useState<Map<string, Route>>(new Map())
  // Back and forward through the places you've been: the module you're in, and inside an op's Call,
  // where you've stepped to. Another circuit starts a new history.
  const history = useRef<{ scope: string | null; inside: Inside | null }[]>([{ scope: null, inside: home }])
  const [at, setAt] = useState(0)
  // Another row keeps the module you're in, when it has one by that path.
  const [shown, setShown] = useState(root)
  if (shown !== root) {
    setShown(root)
    setSelected(null)
    setInside(home)
    setPicked(null)
    setPickedBool(null)
    setBoolData(null)
    const keep = scope && graph.modules.some((m) => m.path === scope)
    if (!keep) setScope(null)
    history.current = [{ scope: keep ? scope : null, inside: home }]
    setAt(0)
  }
  useEffect(() => {
    const here = history.current[at]
    if (here && here.scope === scope && here.inside === inside) return
    history.current = [...history.current.slice(0, at + 1), { scope, inside }]
    setAt(history.current.length - 1)
  }, [scope, inside, at])
  const travel = (i: number) => {
    const place = history.current[i]
    if (!place) return
    setSelected(null)
    setPicked(null)
    setPickedBool(null)
    setPickedType(null)
    partsView()
    setAt(i)
    setScope(place.scope)
    setInside(place.inside)
  }
  // The modules below the one you're in that open in place: those within `levels` of it.
  const opened = useMemo(() => {
    const byPath = new Map(graph.modules.map((m) => [m.path, m]))
    const out = new Set<string>()
    const walk = (path: string, depth: number) => {
      if (depth >= levels) return
      for (const c of byPath.get(path)?.children ?? []) {
        out.add(c)
        walk(c, depth + 1)
      }
    }
    walk(scope ?? "", 1)
    return out
  }, [graph, scope, levels])
  // Where an op is drawn from: its module, or for a module that's only that op, the one it's in.
  const homeOf = (o: ProgramOp) => {
    const m = graph.modules.find((x) => x.path === o.module)
    return m && m.children.length === 0 && m.ops.length === 1 ? m.parent || null : o.module || null
  }

  // The Definitions stepped through inside the Call, the Call's first.
  const trail = useMemo(() => {
    if (!inside || !defs) return []
    const specs = [inside.spec]
    for (const gid of inside.path) {
      const g = defs.definitions[specs[specs.length - 1]!]?.groups?.find((x) => x.id === gid)
      if (!g) break
      specs.push(g.fn)
    }
    return specs
  }, [inside, defs])
  const spec = trail[trail.length - 1] ?? null

  // Below a primitive: the Boolean subcircuit you're in, and whether it's drawn gate by gate.
  const level = inside?.bool.length ? inside.bool[inside.bool.length - 1]! : null
  const boolNode = level && boolData ? (boolData.nodes[level.id] ?? null) : null
  // Its gates are expanded from its circuit type.
  const fromModule = Boolean(boolNode?.module)
  const showGates = fromModule && (gatesOn || !boolNode!.children.length)
  // The template group a primitive's lowering is found under: its op's, or the Definition's own.
  const groupOf = (x: Inside | null) => (x?.op ? x.op.op.group : DEFINITION_GROUP)
  const lowering = (fn: string) => (inside && boolData ? loweringOf(boolData, groupOf(inside), fn) : null)
  // A primitive the export says isn't lowered, or one with no circuit that's only wiring.
  const gatelessOf = (fn: string): Gateless | null => {
    const low = lowering(fn)
    if (low && "notLowered" in low) return gateless({ template: inside?.op ? templateOf(inside.op.op) : null, fn, reason: low.notLowered })
    const g = low ? null : gateless({ fn })
    return g?.kind === "wiring" ? g : null
  }

  // One element of what an op or a Program input makes: its format and width.
  const elementOf = (from: string | null | undefined): { format: string | null; bits: number } | null => {
    if (!from) return null
    if (from.startsWith("in:")) return INPUT_TYPES[from.slice(3)] ?? null
    const sp = defs?.ops[graph.row.key]?.[srcId(from)]?.spec
    const r = sp ? defs!.definitions[sp]?.ret : null
    return r?.bits ? { format: r.format ?? null, bits: r.bits } : null
  }

  // A level's nodes and wires; `ns` scopes the generic ids of a body or a subcircuit to it.
  const view = useMemo((): { nodes: CanvasNode[]; edges: CanvasEdge[]; ns: string } => {
    if (boolNode && boolData && level) {
      if (showGates) return { nodes: [], edges: [], ns: "" }
      return { ...boolLevel(boolData, boolNode, inside?.bool.length === 1 ? inside.primitive : null, widths), ns: `${level.id}/` }
    }
    if (spec && defs) {
      const body = buildBodyView(defs, spec)
      return {
        nodes: body.nodes as CanvasNode[],
        edges: body.edges.map(
          (e): CanvasEdge => ({
            ...e,
            reads: 0,
            recurrence: false,
            role: null,
            width: widths ? fmtElems(e.elems, elementLabel(e.format, e.elems ? e.bits / e.elems : null)) : null,
          })
        ),
        ns: `${trail.join(">")}/`,
      }
    }
    const v = buildView(graph, opened, annotations, scope)
    const width = (e: ViewEdge) => {
      const t = elementOf(e.from)
      const elems = t && e.bits ? e.bits / t.bits : 1
      return t && Number.isInteger(elems) ? fmtElems(elems, elementLabel(t.format, t.bits)) : fmtBits(e.bits)
    }
    return { ...v, edges: widths ? v.edges.map((e) => ({ ...e, width: width(e) })) : v.edges, ns: "" }
  }, [boolNode, boolData, level, showGates, inside, spec, defs, trail, graph, opened, annotations, scope, widths])
  const lookup = LOOKUP
  const { nameOf, moduleLabel } = useMemo(() => labeler(graph, annotations, (d) => LOOKUP(`def:${d}`, "name")), [graph, annotations])
  const flow = useReactFlow()
  const store = useStoreApi()
  const run = useRef(0)
  // The legend and any card take the right of the canvas; on a phone, they sit over it.
  const [crumbsBottom, setCrumbsBottom] = useState(48)
  const narrow = useStore((s) => s.width > 0 && s.width < 640)
  const pad = useRef({ top: 64, right: 264, bottom: 40, left: 40 })
  pad.current = {
    top: Math.max(64, crumbsBottom + 20),
    right: narrow ? 24 : (inside && cardOpen) || selected || pickedBool ? 340 : 264,
    bottom: narrow ? 72 : 40,
    left: narrow ? 24 : 40,
  }

  // The level drawn, by name, for its inputs' and outputs' cards; and what each node is wired to.
  const levelName = boolNode && level
    ? subcircuitName(level.id, boolNode)
    : spec && inside
      ? trail.length === 1 && inside.op
        ? (inside.op.label ?? inside.op.name)
        : defName(spec)
      : scope
        ? (moduleLabel(scope) ?? scope.split(".").pop()!)
        : "the Program"
  const linked = useMemo(() => {
    const nameOfNode = (n: CanvasNode): string => {
      if (n.kind === "op" || n.kind === "module" || n.kind === "group" || n.kind === "input" || n.kind === "output") return n.label ?? n.name
      if (n.kind === "boundary") return n.label ?? nameOf(n.name)
      if (n.kind === "part") return defName(n.group.fn)
      if (n.kind === "bool") return subcircuitName(n.ref, n.node)
      if (n.kind === "own") return "Own gates"
      if (n.kind === "unit") return n.type.label
      return n.name
    }
    const names = new Map(view.nodes.map((n) => [n.id, nameOfNode(n)]))
    const from = new Map<string, string[]>()
    const to = new Map<string, string[]>()
    for (const e of view.edges) {
      to.set(e.source, [...(to.get(e.source) ?? []), names.get(e.target) ?? e.target])
      from.set(e.target, [...(from.get(e.target) ?? []), names.get(e.source) ?? e.source])
    }
    return (id: string) => ({ from: from.get(id) ?? [], to: to.get(id) ?? [] })
  }, [view, nameOf])

  // Step inside a module.
  const toggle = (path: string) => {
    setSelected(null)
    setPickedType(null)
    setScope(path)
  }

  // Step inside an op's Call, from the module it's drawn in so the trail runs through it. A Call with
  // no parts (one that only moves values, such as an all-gather) opens its card instead.
  const enter = (op: OpView, keepPick = false) => {
    setSelected(null)
    if (!keepPick) setPickedType(null)
    setLoading(true)
    void Promise.all([loadDefs(), loadBool ? loadBool() : null]).then(([d, b]) => {
      setLoading(false)
      setDefs(d)
      if (b) setBoolData(b)
      const entry = d.ops[graph.row.key]?.[srcId(op.op.id)]
      const def = entry ? d.definitions[entry.spec] : null
      // A Definition too large to draw steps straight to its template's circuits, counted.
      const level = def?.summary ? templateOfGroup(b, op.op.group)?.level : null
      if (entry && (def?.groups?.length || level)) {
        setScope(homeOf(op.op))
        setPicked(null)
        setInside({ op, spec: entry.spec, path: [], part: null, bool: level ? [{ id: level, variants: 1 }] : [], primitive: null })
      } else setSelected(op)
    })
  }
  const open = (part: PartView) => {
    if (!inside) return
    setPickedBool(null)
    if (part.def?.form === "composite" && part.def.groups) {
      setPicked(null)
      setPickedType(null)
      setInside({ ...inside, path: [...inside.path, part.group.id], part: null, bool: [], primitive: null })
      return
    }
    // A lowered primitive steps below, to the unit or tail it's lowered in.
    const low = part.def?.form === "primitive" ? lowering(part.group.fn) : null
    if (low && "root" in low && boolData) {
      setPicked(null)
      setCardOpen(false)
      partsView()
      setInside({ ...inside, part: part.group.id, bool: [{ id: landing(boolData, low.root).pop()!, variants: 1 }], primitive: part.group.fn })
    } else setPicked(part)
  }
  const stepBool = (v: BoolView) => {
    if (!inside || !boolData) return
    // A part with no circuit type opens only its card.
    if (!v.node.children.length && !v.node.module) {
      setPickedBool(v)
      return
    }
    setPickedBool(null)
    setCardOpen(false)
    partsView()
    setInside({ ...inside, bool: [...inside.bool, { id: landing(boolData, v.ref).pop()!, variants: v.variants }] })
  }
  // Back out to the Program, or for a Definition on its own, to the Definition.
  const exit = () => {
    setInside(home)
    setPicked(null)
    setPickedBool(null)
    setPickedType(null)
  }

  // A row's Boolean circuits load with it, for what its ops cost and to step below its primitives; a
  // subcircuit's circuit types load when its gates are drawn.
  // A new graph clears them in the render it arrives in, which a load that lands in the same render
  // would otherwise leave cleared.
  useEffect(() => {
    if (loadBool && !boolData) void loadBool().then(setBoolData)
  }, [inside, selected, loadBool, boolData, graph])
  // From circuit types: its own gates, the parts opened in place expanded, the rest boxes.
  useEffect(() => {
    if (!showGates || !level || !boolData) return
    const id = level.id
    const mid = id
    const here = openParts.id === id ? openParts : { id, paths: new Set<string>(), all: false }
    let live = true
    const store = moduleStore.current
    void (here.all ? store.loadTree(mid) : store.load([mid])).then(() => {
      if (!live) return
      try {
        const list = expandModule(
          store.get,
          mid,
          (path) => here.all || here.paths.has(path),
          GATE_DRAW_LIMIT
        )
        setTooMany(null)
        if (list) setGateList({ id, list })
      } catch (e) {
        if (!(e instanceof TooManyGates)) throw e
        setTooMany(id)
        if (here.all) setOpenParts({ id, paths: here.paths, all: false })
      }
    })
    return () => {
      live = false
    }
  }, [showGates, level, boolData, openParts])
  const openBox = (box: GateBox) => {
    if (!level || box.kind !== "part" || !box.module) return
    const id = level.id
    void moduleStore.current.load([box.module]).then(() =>
      setOpenParts((o) => ({ id, paths: new Set([...(o.id === id ? o.paths : []), box.path]), all: false }))
    )
  }

  const entry = inside?.op && defs ? defs.ops[graph.row.key]?.[srcId(inside.op.op.id)] : null
  const current = spec && defs ? defs.definitions[spec] : null
  // The Call's cut (or for a Definition on its own, the cut of a Call that applies it), which says
  // how big each of its parts is, with proof units on or off.
  const cutOf = inside ? (inside.op || root.kind !== "definition" ? inside.spec : (root.call ?? inside.spec)) : null
  const callCut = cutOf && defs ? (defs.partition[cutOf] ?? null) : null
  // The Definitions load with the graph: hover cards give what's inside an op before you step in.
  useEffect(() => {
    if (!defs) void loadDefs().then(setDefs)
  }, [defs, loadDefs])
  const vu = useMemo((): VuView | null => {
    if (!vuOn || !defs) return null
    const partitionOf = (opId: string) => {
      const sp = defs.ops[graph.row.key]?.[srcId(opId)]?.spec
      return (sp && defs.partition[sp]) || null
    }
    const cut = cutOf ? (defs.partition[cutOf] ?? null) : null
    return { partitionOf, cut, groups: (spec && cut?.groups?.[spec]) || null, selected: pickedType }
  }, [vuOn, defs, graph.row.key, cutOf, spec, pickedType])

  // With proof units on inside a Call, the pills holding values the input unit certifies. Proof units
  // change what's outlined and colored, never how wires or ports are drawn.
  const unitInputs = useMemo((): Set<string> => {
    if (!vu || boolNode || !inside || !spec || !defs) return new Set()
    const held = inputParamsAt(defs, trail, inside, graph, inside.op ? boolData?.roles[inside.op.op.group] : undefined)
    return new Set([...held].map((i) => `bp:${i}`))
  }, [vu, boolNode, inside, spec, defs, trail, graph, boolData])
  const edges = useMemo(() => toEdges(view.edges, routes, view.ns, variants.residual, widths && variants.strokes), [view.edges, routes, view.ns, variants.residual, widths, variants.strokes])

  // What's laid out: the level, and with proof units on inside a Call, its units outlined.
  const cells = vu?.groups ?? null
  const cutTypes = vu?.cut?.types ?? null
  const drawn = useMemo(
    () => (cells && cutTypes && spec && !boolNode ? { ...view, nodes: outlineUnits(view.nodes, view.edges, cells, cutTypes) } : view),
    [view, cells, cutTypes, spec, boolNode]
  )
  useEffect(() => {
    const id = ++run.current
    void layout(drawn.nodes, drawn.edges, widths, drawn.ns).then((laid) => {
      if (id !== run.current) return
      setNodes(laid.nodes)
      setRoutes(laid.routes)
      // After React Flow has measured the new nodes.
      setTimeout(() => {
        const p = pad.current
        const { width, height } = store.getState()
        const b = flow.getNodesBounds(laid.nodes)
        const w = width - p.left - p.right
        const h = height - p.top - p.bottom
        if (!b.width || !b.height || Math.min(w / b.width, h / b.height) >= READABLE) {
          const padding = { top: `${p.top}px`, right: `${p.right}px`, bottom: `${p.bottom}px`, left: `${p.left}px` } as const
          void flow.fitView({ duration: 450, padding, maxZoom: 1.25 })
          return
        }
        // Too tall to read when fitted: open at the top, at a zoom you can read, the width centered.
        const zoom = Math.min(READABLE, w / b.width)
        void flow.setViewport({ x: p.left + (w - b.width * zoom) / 2 - b.x * zoom, y: p.top - b.y * zoom, zoom }, { duration: 450 })
      }, 60)
    })
  }, [drawn, flow, store, widths])

  // Ops in view, each with the layers it stands for.
  const opsInView = useMemo(() => {
    const modules = new Map(graph.modules.map((m) => [m.path, m]))
    const within = (path: string, root: string | null) => !root || path === root || path.startsWith(`${root}.`)
    return (root: string | null) =>
      graph.ops
        .filter((o) => within(o.module, root))
        .map((o) => {
          let repeat = 1
          for (let p: string | null = o.module; p; p = modules.get(p)?.parent ?? null) repeat *= modules.get(p)?.repeat?.count ?? 1
          return { op: o, repeat }
        })
  }, [graph])
  // Unit types among ops, by the units in one Call of each (once per layer a module stands for).
  const tally = (list: { op: ProgramOp; repeat: number }[]) => {
    const rows = new Map<string, { label: string; count: number; bits: number; format: string | null; kinds: UnitKind[]; each: [number, number] }>()
    for (const { op, repeat } of list) {
      const p = vu?.partitionOf(op.id)
      if (!p) continue
      for (const [label, t] of byLabel(p.types)) {
        const x = rows.get(label) ?? { label, count: 0, bits: t.bits, format: t.format ?? null, kinds: [], each: t.each }
        x.count += t.units * repeat
        x.each = [Math.min(x.each[0], t.each[0]), Math.max(x.each[1], t.each[1])]
        for (const k of t.kinds) if (!x.kinds.includes(k)) x.kinds.push(k)
        rows.set(label, x)
      }
    }
    return [...rows.values()].sort((a, b) => b.count - a.count)
  }
  const moduleMix = (path: string) => (vu ? tally(opsInView(path)) : null)

  // Sizes, in gates (AND, XOR and NOT): a Boolean subcircuit by its parts' kinds and its own gates, a
  // subcircuit's gates by kind of gate, a Call or a part by the kinds of primitive it's made of (with proof
  // units on, by its units' types), and ops by template (or units' types) over the run, once per
  // layer a module stands for. What isn't lowered yet has no size.
  const sizes = useMemo(() => {
    // An op's size over the run: its group's, or in a serving view, where it's one step's Calls, its
    // groups' by its share of their Calls. What isn't lowered has none.
    const runSize = (op: ProgramOp): number | null | undefined => {
      if (!boolData) return undefined
      const each = (op.groups ?? [op.group]).map((g) => boolData.size[g])
      if (each.some((s) => s === undefined)) return undefined
      if (each.some((s) => s === null)) return null
      const total = each.reduce<number>((a, s) => a + (s ?? 0), 0)
      return op.runCalls ? (total * op.calls) / op.runCalls : total
    }
    type Tally = LegendItem & { unlowered: number }
    const tallied = () => {
      const m = new Map<string, Tally>()
      return {
        add: (label: string, color: string, size: number | undefined, unlowered = 0, detail?: ReactNode, extra?: Partial<LegendItem>) => {
          const x = m.get(label) ?? { label, color, size: size === undefined ? undefined : 0, unlowered: 0, detail, ...extra }
          if (typeof x.size === "number" && size !== undefined) x.size += size
          x.unlowered += unlowered
          m.set(label, x)
        },
        items: (): LegendItem[] =>
          [...m.values()].map(({ unlowered, ...it }) => ({
            ...it,
            size: it.size === undefined ? undefined : it.size || !unlowered ? it.size : null,
            partial: Boolean(it.size && unlowered),
          })),
      }
    }
    const gatesOf = (c: BoolCounts) => c.and + c.xor + c.not
    const byGate = (c: BoolCounts): LegendItem[] => [
      { label: "AND", color: GATE_COLORS.and, size: c.and },
      { label: "XOR", color: GATE_COLORS.xor, size: c.xor },
      { label: "NOT", color: GATE_COLORS.not, size: c.not },
    ]
    const boolParts = (node: BoolNode): LegendItem[] => {
      if (!boolData || !node.children.length) return byGate(node)
      const t = tallied()
      for (const c of node.children) {
        const child = boolData.nodes[c.ref]
        if (child) t.add(kindLabel(child.kind), kindColor(child.kind), gatesOf(child) * c.count)
      }
      if (node.own) t.add("Own gates", OWN_COLOR, gatesOf(node.own))
      return t.items()
    }
    const primitives = (cells: Record<string, [number, number, number]>[], template: string | null): LegendItem[] => {
      const t = tallied()
      for (const g of cells) {
        for (const [fn, [size, , unlowered]] of Object.entries(g)) {
          const k = partKind(fn)
          t.add(k.label, k.color, size, unlowered)
        }
      }
      return t.items()
    }
    const unitTypes = (types: Record<string, UnitType>): LegendItem[] => {
      const t = tallied()
      for (const [label, x] of byLabel(types)) t.add(label, unitColor(label), x.size, x.unlowered, unitDetail(x))
      return t.items()
    }
    const cellTypes = (cells: Record<string, [number, number, number, number]>[], cut: Partition): LegendItem[] => {
      const t = tallied()
      const types = byLabel(cut.types)
      for (const g of cells) {
        for (const [key, [, , size, unlowered]] of Object.entries(g)) {
          const label = cut.types[key]?.label ?? key
          const x = types.get(label)
          t.add(label, unitColor(label), size, unlowered, x ? unitDetail(x) : undefined)
        }
      }
      return t.items()
    }
    // How many primitives in one of an op's Calls aren't lowered yet: its size leaves them out.
    const unloweredIn = (op: ProgramOp): number => {
      const sp = defs?.ops[graph.row.key]?.[srcId(op.id)]?.spec
      const cells = sp && defs ? defs.partition[sp]?.prims?.[sp] : null
      if (!cells) return 0
      return Object.values(cells).reduce((a, g) => a + Object.values(g).reduce((b, x) => b + x[2], 0), 0)
    }
    const ops = (list: { op: ProgramOp; repeat: number }[]): LegendItem[] => {
      const t = tallied()
      for (const { op, repeat } of list) {
        const run = runSize(op)
        const s = run === undefined ? undefined : (run ?? 0) * repeat
        if (vu) {
          const p = vu.partitionOf(op.id)
          if (!p) continue
          const types = byLabel(p.types)
          const whole = [...types.values()].reduce((a, x) => a + x.size, 0)
          for (const [label, x] of types) {
            t.add(label, unitColor(label), s === undefined ? undefined : whole ? (s * x.size) / whole : 0, x.unlowered || (run === null ? 1 : 0), unitDetail(x))
          }
        } else {
          const m = mixTemplate(templateOf(op))
          t.add(m.label, m.color, s, run === null ? 1 : unloweredIn(op))
        }
      }
      return t.items()
    }
    // A node's size by what's inside it.
    const of = (n: CanvasNode): LegendItem[] => {
      if (n.kind === "bool") return boolParts(n.node)
      if (n.kind === "own") return byGate(n.counts)
      if (n.kind === "module") return ops(opsInView(n.path))
      if (n.kind === "op") {
        const sp = defs?.ops[graph.row.key]?.[srcId(n.op.id)]?.spec
        const cut = sp && defs ? defs.partition[sp] : null
        if (!sp || !cut) return []
        const call = vu ? unitTypes(cut.types) : primitives(Object.values(cut.prims?.[sp] ?? {}), templateOf(n.op))
        // One Call's make-up, at the size of all of them in the run, once per layer it stands for.
        const run = runSize(n.op)
        const once = call.reduce((a, it) => a + (it.size ?? 0), 0)
        if (!run || !once) return call
        const scale = (run * (opsInView(null).find((x) => x.op.id === n.op.id)?.repeat ?? 1)) / once
        return call.map((it) => (it.size ? { ...it, size: it.size * scale } : it))
      }
      if (n.kind === "part" && callCut && spec) {
        return vu
          ? cellTypes([callCut.groups[spec]?.[n.group.id] ?? {}], callCut)
          : primitives([callCut.prims?.[spec]?.[n.group.id] ?? {}], inside?.op ? templateOf(inside.op.op) : null)
      }
      return []
    }
    return { tallied, byGate, boolParts, cellTypes, ops, of }
  }, [boolData, defs, graph.row.key, vu, callCut, spec, opsInView, inside])

  // What the colors in view mean, each with its share of the size in view; with proof units on, the
  // wires too.
  const legend = useMemo((): { title: string; note: string; items: LegendItem[] } => {
    const head =
      vu && !boolNode
        ? {
            title: "Proof block size",
            note: "The gates (AND, XOR and NOT) in each kind of proof block, in its Boolean circuit. What isn't lowered yet has no size counted.",
          }
        : {
            title: "Subcircuit size",
            note: "A subcircuit's size is its gates (AND, XOR and NOT) in its Boolean circuit. What isn't lowered yet has no size counted.",
          }
    if (boolNode) {
      if (showGates) {
        const list = gateList && gateList.id === level?.id ? gateList.list : null
        if (!list) return { ...head, items: [] }
        // Drawn from a module: its gates, and the parts still closed, by kind.
        const closed = (list.boxes ?? []).filter((b) => b.kind === "part")
        if (!closed.length) return { ...head, items: sizes.byGate(list.counts) }
        const t = sizes.tallied()
        for (const it of sizes.byGate(list.counts)) if (it.size) t.add(it.label, it.color, it.size)
        for (const b of closed) {
          const kind = boolData?.nodes[b.ref]?.kind ?? b.of ?? "subcircuit"
          t.add(`${kindLabel(kind)} (closed)`, kindColor(kind), b.size ?? 0)
        }
        return { ...head, items: t.items() }
      }
      return { ...head, items: sizes.boolParts(boolNode) }
    }
    const wired: LegendItem[] = []
    if (vu) {
      const stroke = "var(--muted-foreground)"
      if (drawn.nodes.some((n) => n.kind === "unit")) {
        wired.push({
          label: "Proof block",
          color: stroke,
          frame: true,
          detail:
            "An outline is one proof block: the gates in it are checked together, and every gate is in exactly one. Values are committed where they cross its boundary. A part that is many proof blocks says how many in its hover card.",
        })
      }
      if (view.nodes.some((n) => n.kind === "input") || unitInputs.size) {
        wired.push({ label: "Input unit", color: "transparent", hatch: true, detail: "Weights, the request's inputs and randomness: checked against their anchors, never sampled" })
      }
    }
    // A primitive with no Boolean lowering is drawn dashed.
    const unlowered = view.nodes.some((n) => {
      if (n.kind !== "part" || n.def?.form !== "primitive") return false
      const gl = gatelessOf(n.group.fn)
      return gl?.kind === "not-lowered"
    })
    const extra: LegendItem[] = unlowered
      ? [{ label: "Not lowered", color: "transparent", outline: true, detail: "No Boolean lowering yet: nothing evaluates it" }]
      : []
    // Inside a Call, the parts in view by kind (or with proof units on, by their units' types).
    if (inside && callCut) {
      const cells = callCut.groups?.[spec!] ?? {}
      if (vu) return { ...head, items: [...sizes.cellTypes(Object.values(cells), callCut), ...wired, ...extra] }
      const t = sizes.tallied()
      for (const g of current?.groups ?? []) {
        const k = partKind(g.fn)
        const c = Object.values(cells[g.id] ?? {})
        t.add(k.label, k.color, c.reduce((s, x) => s + x[2], 0), c.reduce((s, x) => s + x[3], 0))
      }
      return { ...head, items: [...t.items(), ...wired, ...extra] }
    }
    const keys: LegendItem[] = [...wired]
    if (variants.residual && view.edges.some((e) => e.role === "residual")) keys.push({ label: "Residual stream", color: RESIDUAL, line: "solid" })
    if (view.edges.some((e) => e.recurrence)) keys.push({ label: "Runs back", color: RECURRENCE, line: "dashed", detail: "To the next token or the next layer" })
    return { ...head, items: [...sizes.ops(opsInView(scope)), ...keys, ...extra] }
    // `lowering` follows `inside` and `boolData`.
  }, [vu, inside, callCut, spec, current, view, drawn, scope, boolNode, showGates, gateList, level, unitInputs, sizes, opsInView, variants.residual])

  // Open one unit of a type: step into a Call that has it, or deeper into the part that computes it.
  const openType = (label: string) => {
    if (!vu) return
    if (inside) {
      const g = Object.entries(vu.groups ?? {}).find(([, types]) =>
        Object.entries(types).some(([key, [units]]) => units > 0 && vu.cut?.types[key]?.label === label)
      )
      const gid = g?.[0]
      const group = gid && defs ? defs.definitions[spec!]?.groups?.find((x) => x.id === gid) : null
      if (group && defs?.definitions[group.fn]?.groups) setInside({ ...inside, path: [...inside.path, group.id], part: null, bool: [], primitive: null })
      return
    }
    const hit = opsInView(scope).find(({ op }) => {
      const p = vu.partitionOf(op.id)
      return p && Object.values(p.types).some((t) => t.label === label)
    })
    if (!hit) return
    const o = hit.op
    const view: OpView = { kind: "op", id: `op:${o.id}`, parent: null, name: o.id.split("/").pop()!, label: nameOf(o.id), note: null, op: o, launches: null, ports: [] }
    enter(view, true)
  }
  // A Definition on its own that opens below its body (a primitive, or one too large to draw) has
  // no body to step back to: its trail's first step goes home.
  const toTrail = (x: Inside, i: number): Inside =>
    i === 0 && home && !x.op && home.bool.length ? home : { ...x, path: x.path.slice(0, i), part: null, bool: [], primitive: null }
  const inner = inside
    ? [
        ...trail.map((sp, i) => ({
          label: i === 0 && inside.op ? (inside.op.label ?? inside.op.name) : defName(sp),
          go: () => {
            setPicked(null)
            setPickedBool(null)
            setPickedType(null)
            setInside(toTrail(inside, i))
          },
        })),
        ...inside.bool.map((b, i) => ({
          label: boolData?.nodes[b.id] ? subcircuitName(b.id, boolData.nodes[b.id]!) : b.id,
          go: () => {
            setPickedBool(null)
            partsView()
            setInside({ ...inside, bool: inside.bool.slice(0, i + 1) })
          },
        })),
      ]
    : []

  // Where you are, as a place (lib/circuits.ts): below a subcircuit, each step by its part's index.
  const placeOf = useCallback(
    (s: string | null, x: Inside | null): string => {
      if (!x) return formatPlace({ module: s, call: null, definition: false, path: [], part: null, below: null })
      const below = x.bool.length
        ? x.bool.slice(1).map((b, k) => {
            const parent = boolData?.nodes[x.bool[k]!.id]
            return Math.max(0, parent?.children.findIndex((c) => boolData && landing(boolData, c.ref).pop() === b.id) ?? 0)
          })
        : null
      const p: Place = { module: null, call: x.op ? x.op.op.id : null, definition: !x.op, path: x.path, part: x.part, below }
      return formatPlace(p)
    },
    [boolData]
  )
  const placeNow = placeOf(scope, inside)
  const reported = useRef<string | null>(null)
  // Until the place it opened at is reached, the URL keeps it.
  const [ready, setReady] = useState(!start)
  useEffect(() => {
    if (!ready || reported.current === placeNow) return
    reported.current = placeNow
    onPlace(placeNow)
  }, [ready, placeNow, onPlace])

  // Go to a place: from the URL when the circuit opens, or from the parts tree.
  const goto = useCallback(
    async (s: string) => {
      const p = parsePlace(s)
      if (!p) return
      const [d, b] = await Promise.all([loadDefs(), loadBool ? loadBool() : null])
      setDefs(d)
      if (b) setBoolData(b)
      let x: Inside | null
      let to: string | null = scope
      if (!p.call && !p.definition) {
        if (root.kind !== "program") return
        x = null
        to = p.module && graph.modules.some((m) => m.path === p.module) ? p.module : null
      } else if (p.definition) {
        if (!home) return
        x = { ...home, bool: [], primitive: null }
      } else {
        if (root.kind !== "program") return
        const o = graph.ops.find((op) => op.id === p.call)
        const entry = o ? d.ops[graph.row.key]?.[srcId(o.id)] : null
        if (!o || !entry) return
        to = homeOf(o)
        const drawn = buildView(graph, new Set(), annotations, to).nodes.find((n): n is OpView => n.kind === "op" && n.op.id === o.id)
        const op: OpView = drawn ?? { kind: "op", id: `op:${o.id}`, parent: null, name: o.id.split("/").pop()!, label: nameOf(o.id), note: null, op: o, launches: null, ports: [] }
        x = { op, spec: entry.spec, path: [], part: null, bool: [], primitive: null }
      }
      if (x) {
        let at = x.spec
        for (const gid of p.path) {
          const g = d.definitions[at]?.groups?.find((y) => y.id === gid)
          if (!g || !d.definitions[g.fn]?.groups?.length) break
          x.path = [...x.path, gid]
          at = g.fn
        }
        if (p.below && b) {
          let first: string | null = null
          const g = p.part ? d.definitions[at]?.groups?.find((y) => y.id === p.part) : null
          if (g) {
            const low = loweringOf(b, groupOf(x), g.fn)
            if (low && "root" in low && b.nodes[low.root]) {
              first = landing(b, low.root).pop()!
              x.part = g.id
              x.primitive = g.fn
            }
          } else if (!p.part && x.op) {
            first = d.definitions[x.spec]?.summary ? (templateOfGroup(b, x.op.op.group)?.level ?? null) : null
          } else if (!p.part && home?.bool.length) {
            first = home.bool[0]!.id
            x.primitive = home.primitive
          }
          if (first && b.nodes[first]) {
            const bool = [{ id: first, variants: 1 }]
            for (const i of p.below) {
              const c = b.nodes[bool[bool.length - 1]!.id]?.children[i]
              if (!c || !b.nodes[c.ref]) break
              bool.push({ id: landing(b, c.ref).pop()!, variants: c.variants ?? 1 })
            }
            x.bool = bool
          }
        } else if (!p.below && home?.bool.length && !x.op && !x.path.length) {
          x = home
        } else if (!p.below && x.op && !x.path.length && b && d.definitions[x.spec]?.summary) {
          // A Call too large to draw opens on its template's circuits, as stepping in does.
          const level = templateOfGroup(b, x.op.op.group)?.level
          if (level) x.bool = [{ id: level, variants: 1 }]
        }
      }
      setSelected(null)
      setPicked(null)
      setPickedBool(null)
      setPickedType(null)
      setCardOpen(false)
      partsView()
      setScope(to)
      setInside(x)
    },
    // `homeOf` and `nameOf` follow `graph` and `annotations`.
    [loadDefs, loadBool, scope, root, graph, home, srcId, annotations, nameOf]
  )
  // A place in the URL opens once, when the circuit does.
  const started = useRef<CircuitRoot | null>(null)
  useEffect(() => {
    if (started.current === root) return
    started.current = root
    if (start) void goto(start).finally(() => setReady(true))
    else setReady(true)
  }, [root, start, goto])

  // Below a primitive: the card of a part you clicked, or of the subcircuit you're in. The first level
  // says where the primitive is lowered and carries the primitive's own card.
  const boolCard = (() => {
    if (!boolNode || !boolData || !inside || !level) return null
    if (pickedBool) {
      return (
        <BoolCard
          id={pickedBool.ref}
          node={pickedBool.node}
          onClose={() => setPickedBool(null)}
          primitive={null}
          variants={pickedBool.variants}
        />
      )
    }
    if (!cardOpen) return null
    const top = inside.bool.length === 1
    return (
      <BoolCard
        id={level.id}
        node={boolNode}
        onClose={() => setCardOpen(false)}
        primitive={top && inside.primitive && defs ? (defs.definitions[inside.primitive] ?? null) : null}
        variants={level.variants}
      />
    )
  })()

  return (
    <GraphContext.Provider
      value={{
        toggle,
        select: setSelected,
        inspecting: selected !== null || picked !== null || pickedBool !== null || (Boolean(inside) && cardOpen),
        nameOf,
        go: (p) => {
          setSelected(null)
          exit()
          setScope(p)
        },
        row: graph.row,
        enter,
        open,
        vu,
        moduleMix,
        widths,
        lowering,
        boolean: boolData,
        stepBool,
        inputs: unitInputs,
        showOwn: boolNode?.module
          ? () => {
              setGatesOn(true)
              setPickPart(-1)
            }
          : null,
        sizesOf: sizes.of,
        level: levelName,
        linked,
        roleOf: (id) => {
          if (!inside?.op || trail.length !== 1 || !boolData || !id.startsWith("bp:")) return null
          return boolData.roles[inside.op.op.group]?.params[Number(id.slice(3))] ?? null
        },
        elementOf,
        gatelessOf,
        variants,
        ann: lookup,
        levelDef: spec,
      }}
    >
      <div className="relative flex h-full w-full">
      {parts ? (
        <CircuitParts
          annotations={annotations}
          boolean={boolData}
          className={parts === "over" ? "absolute inset-y-0 left-0 z-30 w-[min(320px,88%)] shadow-xl" : "w-[288px] shrink-0"}
          defs={defs}
          graph={root.kind === "program" ? graph : null}
          definition={root.kind === "definition" ? root : null}
          nameOf={nameOf}
          onClose={() => onParts(false)}
          onGo={(place) => {
            void goto(place)
            if (parts === "over") onParts(false)
          }}
          place={placeNow}
        />
      ) : null}
      <div aria-label="Schematic" className="relative h-full min-w-0 flex-1" role="region">
      <ReactFlow
        edgeTypes={edgeTypes}
        edges={edges}
        elementsSelectable={false}
        maxZoom={2.5}
        minZoom={0.05}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        onPaneClick={() => {
          setSelected(null)
          setPicked(null)
          setPickedBool(null)
        }}
      >
        <Background gap={16} size={1} />
      </ReactFlow>
      {showGates ? null : (
        <ZoomControls
          onFit={() => {
            const p = pad.current
            void flow.fitView({ duration: 300, maxZoom: 1.25, padding: { top: `${p.top}px`, right: `${p.right}px`, bottom: `${p.bottom}px`, left: `${p.left}px` } })
          }}
          onIn={() => void flow.zoomIn({ duration: 200 })}
          onOut={() => void flow.zoomOut({ duration: 200 })}
        />
      )}
      {showGates && gateList?.id === level?.id && boolNode && boolData ? (
        <div className="absolute inset-0 z-[5] bg-background">
          <GateCanvas
            list={gateList!.list}
            pad={pad.current}
            parts={boolNode.children.map((c) => subcircuitName(c.ref, boolData.nodes[c.ref]!) + (c.count > 1 ? ` × ${count(c.count)}` : ""))}
            partColors={boolNode.children.map((c) => kindColor(boolData.nodes[c.ref]!.kind))}
            pick={pickPart}
            ports={boolNode.ports}
            outlines={variants.outlines}
            widths={widths}
            boxInfo={fromModule ? (box) => boxInfo(box, boolData) : undefined}
            onOpenBox={fromModule ? openBox : undefined}
          />
        </div>
      ) : null}
      {showGates && fromModule && tooMany === level?.id ? (
        <div className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-md border bg-background px-2.5 py-1 text-[12px] text-muted-foreground shadow-xs">
          Opening every component would draw more than {count(GATE_DRAW_LIMIT)} gates. Open components one at a time, or step into one.
        </div>
      ) : null}
      {showGates && fromModule && boolNode?.children.length && gateList?.id === level?.id ? (
        <div className="absolute bottom-14 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-background shadow-xs">
          <ButtonGroup aria-label="Open or close its parts">
            <Button
              data-open-parts="all"
              disabled={openParts.id === level!.id && openParts.all}
              onClick={() => setOpenParts({ id: level!.id, paths: new Set(), all: true })}
              size="sm"
              variant="outline"
            >
              Open every component
            </Button>
            <Button
              data-open-parts="none"
              disabled={!(openParts.id === level!.id && (openParts.all || openParts.paths.size))}
              onClick={() => setOpenParts({ id: level!.id, paths: new Set(), all: false })}
              size="sm"
              variant="outline"
            >
              Close them
            </Button>
          </ButtonGroup>
        </div>
      ) : null}
      {boolNode && !showGates && boolNode.children.length && !boolNode.wires ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-[11.5px] text-muted-foreground" data-unwired="">
          {boolNode.kind === "composed" ? "Composed of its parts by count: each opens down to its gates" : "Not wired in the export"}
        </div>
      ) : null}
      {fromModule && boolNode?.children.length ? (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-background shadow-xs">
          <ToggleGroup
            aria-label="Show its parts or its gates"
            onValueChange={(v) => {
              if (!v) return
              setGatesOn(v === "gates")
              setPickPart(null)
            }}
            size="sm"
            type="single"
            value={gatesOn ? "gates" : "components"}
            variant="outline"
          >
            <ToggleGroupItem data-bool-view="components" value="components">
              <Workflow />
              Parts
            </ToggleGroupItem>
            <ToggleGroupItem data-bool-view="gates" value="gates">
              <Binary />
              Gates
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}
      <History
        back={at > 0 ? () => travel(at - 1) : null}
        forward={at < history.current.length - 1 ? () => travel(at + 1) : null}
      />
      <Crumbs
        annotations={annotations}
        graph={graph}
        inner={inner}
        program={root.kind === "program"}
        onBottom={setCrumbsBottom}
        onGo={(p) => {
          setSelected(null)
          exit()
          setScope(p)
        }}
        scope={scope}
      />
      <div className="pointer-events-none absolute top-3 right-3 bottom-3 z-10 flex flex-col items-end gap-2">
        <Legend
          folded={narrow}
          items={legend.items}
          markPartial={variants.partial}
          note={legend.note}
          onOpen={vu && !boolNode ? openType : null}
          onSelect={vu && !boolNode ? setPickedType : null}
          selected={boolNode ? null : pickedType}
          title={legend.title}
        />
        {selected ? <Inspector onClose={() => setSelected(null)} op={selected} /> : null}
        {inside && boolNode ? (
          (boolCard ?? (
            <button
              className="pointer-events-auto flex items-center gap-1.5 rounded-md border bg-background/95 px-2.5 py-1.5 text-[12px] shadow-xs hover:bg-muted"
              data-about=""
              onClick={() => setCardOpen(true)}
              type="button"
            >
              <Info aria-hidden className="size-3.5 text-muted-foreground" />
              {subcircuitName(level!.id, boolNode)}
            </button>
          ))
        ) : inside && current ? (
          picked?.def ? (
            <DefCard call={null} def={picked.def} onClose={() => setPicked(null)} part={picked} tokens={tokens} varying={null} />
          ) : cardOpen ? (
            <DefCard
              call={inside.path.length === 0 ? inside.op : null}
              def={current}
              onClose={() => setCardOpen(false)}
              part={null}
              tokens={tokens}
              varying={inside.path.length === 0 ? (entry?.varying ?? null) : null}
            />
          ) : (
            <button
              className="pointer-events-auto flex items-center gap-1.5 rounded-md border bg-background/95 px-2.5 py-1.5 text-[12px] shadow-xs hover:bg-muted"
              data-about=""
              onClick={() => setCardOpen(true)}
              type="button"
            >
              <Info aria-hidden className="size-3.5 text-muted-foreground" />
              {defName(current.id)}
            </button>
          )
        ) : null}
      </div>
      {loading || (showGates && gateList?.id !== level?.id) ? (
        <div className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-md border bg-background px-2.5 py-1 text-[12px] text-muted-foreground shadow-xs">
          Loading…
        </div>
      ) : null}
      </div>
      </div>
    </GraphContext.Provider>
  )
}
