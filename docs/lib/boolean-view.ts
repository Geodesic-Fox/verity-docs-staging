/*
 * A Call's primitives lowered to AND, XOR and NOT gates. The input is
 * data/boolean/<row>.json from scripts/import-boolean-circuits.mjs: C-Flock's
 * IR lowering, per template, its proof units and the gates outside them,
 * each a tree of circuit types (named subcircuits) wired part to part, whose
 * content lib/circuit-modules.ts expands to gates on demand.
 *
 *   - A subcircuit's size is its gates, AND, XOR and NOT alike.
 *   - What isn't lowered yet says so: nothing evaluates it.
 */

export type BoolCounts = { and: number; xor: number; not: number }

// One drawn part of a subcircuit: its parts with one name that read the same kinds of sources
// (parallel lanes, or variants that differ in constants), drawn by the first.
export type BoolPart = { ref: string; count: number; variants?: number }

// A bundle of wires, in bits, between drawn parts ("p3"), the subcircuit's input and output ports
// ("i0", "o0") and its own gates ("own").
export type BoolWire = [string, string, number]

export type BoolNode = BoolCounts & {
  name: string
  kind: string
  fn: string
  in: number
  out: number
  children: BoolPart[]
  // Named ports, in bits: [name, width].
  ports?: { in: [string, number][]; out: [string, number][] }
  wires?: BoolWire[]
  // The gates it has outside its parts.
  own?: BoolCounts
  // It has a circuit type, its own gates and its parts' calls, expanded to gates on demand.
  module?: true
}

export type TemplateChild =
  | { ref: string; count: number }
  | { notLowered: string; count: number; in: number; out: number; reason: string }

export type BoolTemplate = {
  name: string
  kind: "template" | "constant" | "not-yet-lowered"
  reason?: string | null
  and?: number
  xor?: number
  not?: number
  in?: number
  out?: number
  children?: TemplateChild[]
  // A template whose circuit depends on T is given at T's maximum, with its totals per T.
  at?: { T: number }
  perT?: [number, number | null, number | null, number | null][]
  // Each primitive the template lowers, by the unit or tail it's lowered in.
  primitives?: Record<string, string>
  notLowered?: Record<string, string>
  // Primitives lowered as a composed Definition (too large for one circuit), with the export's note.
  composed?: Record<string, string>
  // Its circuit roots, counted, as a level: where a Call whose Definition is too large to draw steps in.
  level?: string
}

export type BooleanRow = {
  schema: "verity-docs/boolean/v2"
  row: string
  source: { export: string; verification: string | null }
  groups: Record<string, string>
  // Each group's size in the run, in gates; null for a template not lowered at all.
  size: Record<string, number | null>
  // What each parameter of a group's Calls holds ("activations", "weights", "prompt", "seed",
  // "splits", "constant", "peers"), null where the program graph doesn't say yet.
  roles: Record<string, { complete: boolean; params: (string[] | null)[] }>
  templates: Record<string, BoolTemplate>
  nodes: Record<string, BoolNode>
}

// Wires 0 .. inputs − 1 are the inputs, each gate appends one; −1 and −2 are the constants 0 and 1.
// `gates` is flat [op, a, b], op 0 AND, 1 XOR, 2 NOT (b = −1). `part` is the drawn part each gate
// is in, −1 for the subcircuit's own gates.
export type GateList = {
  inputs: number
  outputs: number[]
  gates: number[]
  counts: BoolCounts
  part?: number[]
  origin?: unknown[]
  // Each gate's innermost scope, and the scope tree: [subcircuit, parent scope, part index], preorder.
  tags?: number[]
  scopes?: [string, number, number][]
  // Drawn as boxes, not gates: the parts left closed and the table reads. A box's output bits are
  // gates [3, box, bit].
  boxes?: GateBox[]
}

export type GateBox = {
  kind: "part" | "table"
  // The part's subcircuit, or the table's name; and a part's module, name, kind and gates.
  ref: string
  module?: string
  name?: string
  of?: string
  size?: number
  // Where it is: the part indices from the drawn subcircuit down, "2.0.5".
  path: string
  ins: number[]
  outs: number
  // Its drawn part in the drawn subcircuit (−1: in its own gates).
  part: number
}

// How an op's primitive stands in the Boolean circuit: lowered in a unit or tail, or not yet.
export type Lowering = { root: string } | { notLowered: string } | { composed: string }

export function loweringOf(b: BooleanRow | null, group: string | undefined, fn: string): Lowering | null {
  if (!b || !group) return null
  const t = b.templates[b.groups[group] ?? ""]
  if (!t) return null
  if (t.kind === "not-yet-lowered") return { notLowered: t.reason ?? "No Boolean lowering yet." }
  const root = t.primitives?.[fn]
  if (root) return { root }
  const composed = t.composed?.[fn]
  if (composed) return { composed }
  const reason = t.notLowered?.[fn]
  return reason ? { notLowered: reason } : null
}

export const templateOfGroup = (b: BooleanRow | null, group: string | undefined) =>
  b && group ? (b.templates[b.groups[group] ?? ""] ?? null) : null

// A unit's root and a tail's wrap one piece, with no gates of their own; stepping in lands on what's
// inside.
export function landing(b: BooleanRow, id: string): string[] {
  const path = [id]
  for (let n = b.nodes[id]; n && !n.own && n.children.length === 1 && n.children[0]!.count === 1; ) {
    const next = n.children[0]!.ref
    path.push(next)
    n = b.nodes[next]
  }
  return path
}