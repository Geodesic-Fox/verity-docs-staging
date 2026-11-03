import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { subcircuits as registrySubcircuits, type Subcircuit } from "@/data/subcircuits"
import { tokenData, type TokenData } from "@/lib/assumption-index"
import { landing, type BooleanRow, type BoolNode } from "@/lib/boolean-view"
import { stemOf } from "@/lib/annotations"
import { DEFINITION_GROUP, type CircuitDefinition, type CircuitIndex } from "@/lib/circuits"
import { shortFn, statics, type Definitions } from "@/lib/definition-view"
import type { ProgramGraph, ProgramIndex } from "@/lib/program-view"

// The integration's template names, by the site registry's template ids.
const TEMPLATE_IDS: Record<string, string> = {
  GemmCoordinate: "gemm-coordinate",
  AttentionHead: "attention-head",
  RoPEHead: "rope",
  RMSNormFusedCuda_v2: "rmsnorm",
  RMSNormTriton_v1: "rmsnorm",
  SiluMul_v1: "silu-mul",
  GumbelTopPTokenSelect_v1: "top-p-sampling",
}

// A registry subcircuit's parameters, by the Definition binding each one is.
const BINDINGS: Record<string, string> = { K: "K", headDim: "D", block: "BN", hidden: "N", intermediate: "I", vocab: "V" }

// The stem a registry subcircuit binds: its template's, but RMSNorm's kernel picks one, and a GEMM
// coordinate has a Definition on record only on Ampere's BF16 mma.
function subcircuitStem(s: Subcircuit, registry: Record<string, string>): string | null {
  if (s.template === "rmsnorm") return s.params.kernel === "Triton" ? "RMSNormTriton_v1" : "RMSNormFusedCuda_v2"
  if (s.template === "gemm-coordinate" && s.instruction !== "sm80.mma.m16n8k16.bf16") return null
  return registry[s.template] ?? null
}

/*
 * The circuit viewer's index, read from data/ at build time. A Definition
 * opens on its own, without a Program around it: its primitives take the
 * Boolean lowering of a template that applies it, and templates are shared
 * across rows, so no row is named.
 *
 *   - A primitive opens on its own subcircuit: the piece of the unit it's
 *     lowered in whose function it is, the largest of them where units fold
 *     different constants in; a unit that's only the primitive opens on what
 *     it wraps.
 *   - A Definition too large to draw opens on its template's level: its
 *     circuit roots, counted.
 */

const data = (...p: string[]) => path.join(process.cwd(), "data", ...p)
const json = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T

function booleanRows(): Map<string, BooleanRow> {
  const dir = data("boolean")
  const rows = new Map<string, BooleanRow>()
  if (!existsSync(dir)) return rows
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue
    rows.set(f.replace(/\.json$/, ""), json<BooleanRow>(path.join(dir, f)))
  }
  return rows
}

// The nodes below `roots`, every one a Boolean subcircuit's part reaches.
function reachable(nodes: Record<string, BoolNode>, roots: string[]): Record<string, BoolNode> {
  const out: Record<string, BoolNode> = {}
  const todo = roots.filter((r) => nodes[r])
  while (todo.length) {
    const id = todo.pop()!
    if (out[id]) continue
    const n = nodes[id]
    if (!n) continue
    out[id] = n
    for (const c of n.children) if (!out[c.ref]) todo.push(c.ref)
  }
  return out
}

const gatesOf = (n: BoolNode) => n.and + n.xor + n.not

// What the schematic's legend totals at the Program: each op's group over the run, once per layer
// a module stands for. Null if a template isn't lowered.
function programGates(graph: ProgramGraph, b: BooleanRow): number | null {
  const modules = new Map(graph.modules.map((m) => [m.path, m]))
  let total = 0
  for (const op of graph.ops) {
    const size = b.size[op.group]
    if (size === null || size === undefined) return null
    let repeat = 1
    for (let p: string | null = op.module; p; p = modules.get(p)?.parent ?? null) repeat *= modules.get(p)?.repeat?.count ?? 1
    total += size * repeat
  }
  return total
}

let cached: { index: CircuitIndex; templates: Map<string, BooleanRow> } | null = null

function build() {
  if (cached) return cached
  const programs = json<ProgramIndex>(data("programs", "index.json")).rows
  const defs = json<Definitions>(data("definitions.json"))
  const bools = booleanRows()
  const serving = existsSync(data("serving", "index.json"))
    ? json<{ rows: { key: string }[] }>(data("serving", "index.json")).rows.map((r) => r.key)
    : []

  // Every Definition a served Call applies, at any depth, with the templates that lower it; and the
  // Call roots.
  const tpls = new Map<string, Set<string>>()
  const callRoots = new Set<string>()
  const templates = new Map<string, BooleanRow>()
  const gates: Record<string, number | null> = {}
  for (const row of programs) {
    const b = bools.get(row.key)
    const file = data("programs", `${row.key}.json`)
    if (!existsSync(file)) continue
    const graph = json<ProgramGraph>(file)
    if (b) gates[row.key] = programGates(graph, b)
    for (const op of graph.ops) {
      const spec = defs.ops[row.key]?.[op.source ?? op.id]?.spec
      if (!spec) continue
      callRoots.add(spec)
      const tpl = b?.groups[op.group] ?? null
      if (tpl && b && !templates.has(tpl)) templates.set(tpl, b)
      const visit = (id: string) => {
        const seen = tpls.get(id) ?? new Set<string>()
        if (tpl && seen.has(tpl)) return
        if (tpl) seen.add(tpl)
        tpls.set(id, seen)
        for (const g of defs.definitions[id]?.groups ?? []) visit(g.fn)
      }
      visit(spec)
    }
  }

  const covering = new Map<string, string>()
  for (const [call, cut] of Object.entries(defs.partition)) {
    for (const id of Object.keys(cut?.prims ?? {})) if (!covering.has(id) || id === call) covering.set(id, call)
  }
  const definitions: Record<string, CircuitDefinition> = {}
  for (const [id, d] of Object.entries(defs.definitions)) {
    const candidates = [...(tpls.get(id) ?? [])].sort()
    let best: { tpl: string; land: string; gates: number } | null = null
    for (const tpl of candidates) {
      const b = templates.get(tpl)!
      const t = b.templates[tpl]
      if (!t) continue
      if (d.form === "primitive") {
        const root = t.primitives?.[id]
        if (!root || !b.nodes[root]) continue
        const below = reachable(b.nodes, [root])
        const pieces = Object.entries(below).filter(([, n]) => n.fn === id)
        const [land, node] = pieces.length
          ? pieces.reduce((a, x) => (gatesOf(x[1]) > gatesOf(a[1]) ? x : a))
          : [landing(b, root).pop()!, null]
        const gates = gatesOf(node ?? b.nodes[land]!)
        if (!best || gates > best.gates) best = { tpl, land, gates }
      } else if (d.summary && !d.groups?.length && t.level) {
        best ??= { tpl, land: t.level, gates: 0 }
      } else {
        best ??= { tpl, land: "", gates: 0 }
      }
    }
    definitions[id] = { tpl: best?.tpl ?? candidates[0] ?? null, land: best?.land || null, call: covering.get(id) ?? null, statics: statics(d) }
  }

  const stems: Record<string, string> = {}
  for (const id of Object.keys(defs.definitions)) {
    const s = stemOf(id)
    if (!stems[s] || (!callRoots.has(stems[s]!) && callRoots.has(id))) stems[s] = id
  }

  // A registry template opens on the first stem of its name, by the integration's names.
  const registry: Record<string, string> = {}
  for (const [name, id] of Object.entries(TEMPLATE_IDS)) {
    const stem = Object.keys(stems).find((s) => s === name || shortFn(s) === shortFn(name))
    if (stem && !registry[id]) registry[id] = stem
  }
  const subcircuits: Record<string, string> = {}
  for (const s of registrySubcircuits) {
    const stem = subcircuitStem(s, registry)
    if (!stem) continue
    const want = Object.entries(s.params).flatMap(([k, v]) => (BINDINGS[k] ? [[BINDINGS[k]!, Number(v.replace(/,/g, ""))] as const] : []))
    const spec = Object.keys(defs.definitions).find((id) => stemOf(id) === stem && want.every(([name, v]) => defs.definitions[id]!.bindings?.[name] === v))
    if (spec) subcircuits[s.id] = spec
  }
  const tokens: Record<string, TokenData> = Object.fromEntries(Object.entries(TEMPLATE_IDS).map(([name, id]) => [name, tokenData(id)]))

  cached = {
    index: {
      schema: "verity-docs/circuits/v1",
      programs,
      gates,
      boolean: [...bools.keys()],
      serving,
      definitions,
      stems,
      templates: registry,
      subcircuits,
      tokens,
    },
    templates,
  }
  return cached
}

export const circuitIndex = (): CircuitIndex => build().index

// The registry's templates and subcircuits that open a circuit, by entry id.
export const viewableEntries = (): string[] => {
  const { templates, subcircuits } = build().index
  return [...Object.keys(templates), ...Object.keys(subcircuits)]
}

export const loweringTemplates = (): string[] => [...build().templates.keys()]

// One template's Boolean circuits, as a row whose one group is the Definition opened: what a
// Definition's primitives lower to, outside any Program.
export function templateLowering(tpl: string): BooleanRow | null {
  const b = build().templates.get(tpl)
  const t = b?.templates[tpl]
  if (!b || !t) return null
  const roots = [
    ...Object.values(t.primitives ?? {}),
    ...(t.level ? [t.level] : []),
    ...(t.children ?? []).flatMap((c) => ("ref" in c ? [c.ref] : [])),
  ]
  return {
    schema: "verity-docs/boolean/v2",
    row: tpl,
    source: b.source,
    groups: { [DEFINITION_GROUP]: tpl },
    size: {},
    roles: {},
    templates: { [tpl]: t },
    nodes: reachable(b.nodes, roots),
  }
}
