import type { TokenData } from "@/lib/assumption-index"
import type { ProgramIndexRow } from "@/lib/program-view"

/*
 * What the circuit viewer opens, and where it is inside one.
 *
 * A circuit is a served config's Program (by its row key) or a Definition
 * (by id, or by stem for its default specialization). A place is a string,
 * so it can live in the URL (?circuit=<key>&at=<place>) and name a part in
 * the parts tree:
 *
 *   m:<module path>                   a module of the Program ("m:" is the Program)
 *   c:<op id>                         inside one of an op's Calls
 *   d                                 the Definition opened, outside any Program
 *   …>g3>g7                           inside its parts' Definitions, by group id
 *   …>g9~                             below a primitive part, at the subcircuit it's lowered in
 *   …~0.3                             and below that, by part index at each level
 *
 * A Call or Definition too large to draw has no parts of its own, so its
 * place goes straight to "~": its template's circuit roots, counted.
 */

// The template whose lowering a Definition opens with, where it lands, a Call whose cut covers it
// (its own, for a Call's), and its static parameters as a label ("N = 2,048, EPS = 1e-5").
export type CircuitDefinition = { tpl: string | null; land: string | null; call: string | null; statics: string }

export type CircuitIndex = {
  schema: "verity-docs/circuits/v1"
  programs: ProgramIndexRow[]
  // A Program's gates over the run, once per layer a module stands for.
  gates: Record<string, number | null>
  // The rows with Boolean circuits, and those with a serving view.
  boolean: string[]
  serving: string[]
  definitions: Record<string, CircuitDefinition>
  // A stem's default specialization: the first a served Call applies.
  stems: Record<string, string>
  // The site registry's subcircuit templates, by id ("gemm-coordinate"): the stem each opens on;
  // its subcircuits ("rmsnorm/fused-cuda-n2048"), the Definition each binds, where one is on record;
  // and the templates' tokens, by the integration's template names ("GemmCoordinate").
  templates: Record<string, string>
  subcircuits: Record<string, string>
  tokens: Record<string, TokenData>
}

// The one group of a Definition opened on its own, in the Boolean circuits it loads.
export const DEFINITION_GROUP = "definition"

// The URL's parameters that belong to the open circuit: the circuit, the place, its views and the
// design variants (program-graph.tsx). Closing it clears them.
export const CIRCUIT_PARAMS = ["circuit", "at", "units", "widths", "levels", "serving", "repeat", "residual", "partial", "outlines"]

export type Place = {
  // The module drawn, or the Call or Definition stepped into.
  module: string | null
  call: string | null
  definition: boolean
  // Group ids of composite parts, then the primitive part stepped below, then part indices.
  path: string[]
  part: string | null
  below: number[] | null
}

export const PROGRAM: Place = { module: null, call: null, definition: false, path: [], part: null, below: null }
export const DEFINITION: Place = { ...PROGRAM, definition: true }

export function formatPlace(p: Place): string {
  if (!p.call && !p.definition) return `m:${p.module ?? ""}`
  let s = p.call ? `c:${p.call}` : "d"
  for (const g of p.path) s += `>${g}`
  if (p.part) s += `>${p.part}`
  if (p.below) s += `~${p.below.join(".")}`
  return s
}

// The part is read as a primitive's when the place goes below it; otherwise it's the last group.
export function parsePlace(s: string): Place | null {
  if (s.startsWith("m:")) return { ...PROGRAM, module: s.slice(2) || null }
  const tilde = s.indexOf("~")
  const head = tilde < 0 ? s : s.slice(0, tilde)
  const below = tilde < 0 ? null : s.slice(tilde + 1) ? s.slice(tilde + 1).split(".").map(Number) : []
  if (below?.some((n) => !Number.isInteger(n) || n < 0)) return null
  const [first, ...groups] = head.split(">")
  let call: string | null = null
  if (first === "d") call = null
  else if (first?.startsWith("c:") && first.length > 2) call = first.slice(2)
  else return null
  const part = below && groups.length ? groups.pop()! : null
  return { module: null, call, definition: first === "d", path: groups, part, below }
}

// What a key opens: a Program on record, or a Definition by id, stem, subcircuit or subcircuit template.
export function resolveCircuit(index: CircuitIndex, key: string): { kind: "program"; row: ProgramIndexRow } | { kind: "definition"; spec: string } | null {
  const row = index.programs.find((r) => r.key === key)
  if (row) return { kind: "program", row }
  if (index.definitions[key]) return { kind: "definition", spec: key }
  const spec = index.subcircuits[key] ?? index.stems[key] ?? index.stems[index.templates[key] ?? ""]
  return spec ? { kind: "definition", spec } : null
}

// The circuit's home: where it opens with no place given.
export const homePlace = (index: CircuitIndex, key: string): string | null => {
  const c = resolveCircuit(index, key)
  if (!c) return null
  return c.kind === "program" ? "m:" : index.definitions[c.spec]?.land ? "d~" : "d"
}
