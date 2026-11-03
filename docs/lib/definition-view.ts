/*
 * One Call's Definition, drawn down to its gates. The input is
 * data/definitions.json from scripts/import-definitions.mjs: each Definition
 * specialization the served rows call, from the vLLM integration's export,
 * with its body folded into groups.
 *
 *   - A group is nodes of one Definition with the same structure: one
 *     node, several in parallel ("× 1,024"), a batch ("× 3,072"), or a
 *     chain that carries a value from each to the next ("128 steps").
 *   - A composite group can be stepped into; a primitive group is a gate,
 *     one instruction's exact model.
 *   - Parameters come in at the top, returns leave at the bottom, and a
 *     group's inputs are ports, one per source.
 */

// `format`: how each element's bits encode a number (BF16, FP32, E4M3, int32), derived for the site
// from the primitives; null where it isn't known or its elements differ.
export type DefType = { words: number; bits: number | null; shape?: number[]; format?: string | null }

export type DefRead = { arg: string; words: number; from?: string; const?: number | string | null; shared?: boolean }

export type DefGroup = {
  id: string
  fn: string
  form: "call" | "batch" | "primitive" | "scan"
  count: number
  n: number
  chain: number | null
  carry?: string[]
  gates: number
  reads: DefRead[]
  out: DefType
}

export type Definition = {
  id: string
  form: "primitive" | "composite"
  base?: string
  bindings?: Record<string, number | string | boolean>
  params?: ({ name: string } & DefType)[]
  ret?: DefType
  doc: string
  conformance: string
  gates: number
  nodes?: number
  groups?: DefGroup[] | null
  returns?: { from?: string; const?: number | string | null; words: number }[] | null
  summary?: { fn: string; count: number }[]
}

// What a unit's word is: one of the Call's outputs, a word committed inside the Call, a cheap
// function of committed words that the units reading it recompute, a constant, or a value nothing
// reads.
export type UnitKind = "output" | "committed" | "recompute" | "literal" | "dead"

// The committed cut, as the integration's port-width cut draws it: the Call partitioned into units,
// every gate in one, each unit one word (16 bits where the word is, up to 32 for a single gate).
// `size`: its gates' size, each primitive at its Boolean circuit's gates (AND, XOR and NOT);
// `unlowered`: its gates with no Boolean circuit yet, whose size isn't counted.
export type UnitType = {
  label: string
  kind: UnitKind
  bits: number
  format?: string | null
  units: number
  gates: number
  size: number
  unlowered: number
}

// Of the values a drawn group returns (`g`), a chain's links carry to the next (`carry`) and a
// parameter holds (`p`), by id or index: [committed, all].
export type Wires = {
  g: Record<string, [number, number]>
  carry: Record<string, [number, number]>
  p: Record<string, [number, number]>
}

export type Partition = {
  types: Record<string, UnitType>
  // Per body, per drawn group: unit type -> [units whose word it computes, and the gates, size and
  // gates not lowered yet it spends on them].
  groups: Record<string, Record<string, Record<string, [number, number, number, number]>>>
  // Per body, per drawn group: primitive -> [size, calls, calls not lowered yet].
  prims?: Record<string, Record<string, Record<string, [number, number, number]>>>
  // Per body, its first instance's wires.
  wires?: Record<string, Wires>
  callGates: number
}

export type Definitions = {
  schema: "verity-docs/definitions/v1"
  source: Record<string, unknown>
  definitions: Record<string, Definition>
  ops: Record<string, Record<string, { spec: string; varying?: Record<string, number> }>>
  partition: Record<string, Partition | null>
}

// "GemmCoordinate_v1{K=2048}" reads as "GemmCoordinate".
export const shortFn = (id: string) => id.replace(/\{.*$/, "").replace(/_v\d+$/, "")

// "K=2048, DOT=HopperBF16WgmmaDot16_v1" without the long float encodings.
export function statics(d: Definition): string {
  return Object.entries(d.bindings ?? {})
    .map(([k, v]) => `${k} = ${typeof v === "number" ? fmtNumber(v) : typeof v === "string" ? fmtStatic(v) : String(v)}`)
    .join(", ")
}

const fmtNumber = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : String(Number(v.toPrecision(6))))

function fmtStatic(v: string): string {
  const m = /^\{"f64":"(.+)"\}$/.exec(v)
  if (m) return String(Number(parseHexFloat(m[1]!).toPrecision(6)))
  return v.replace(/_v\d+$/, "")
}

// "0x1.4f8b588e368f1p-17" is 1e-05.
function parseHexFloat(s: string): number {
  const m = /^(-?)0x([0-9a-f])\.([0-9a-f]*)p([+-]\d+)$/i.exec(s)
  if (!m) return Number.NaN
  const mant = parseInt(m[2]!, 16) + (m[3] ? parseInt(m[3], 16) / 16 ** m[3].length : 0)
  return (m[1] ? -1 : 1) * mant * 2 ** Number(m[4])
}

// One element: its format, or else its width. "BF16", "FP32", "16-bit".
export const elementLabel = (format: string | null | undefined, bits: number | null | undefined) =>
  format ?? (bits ? `${bits}-bit` : "?")

// A value as its elements: "3,072 × 2,048 × BF16", "2,048 × FP32", "1 × int32".
export const typeLabel = (t: DefType) =>
  `${(t.shape ?? [t.words]).map((d) => d.toLocaleString("en-US")).join(" × ")} × ${elementLabel(t.format, t.bits)}`

// A port per source: the arguments one source feeds, named together ("a, b").
export type BodyPort = { key: string; name: string; words: number; shared: boolean; format?: string | null }

// A chain is drawn as its steps: all of a short one, and the first two, a
// fold and the last of a long one.
export type ChainStep = { index: number; of: number } | { skipped: number; of: number }

// `parent` is the outline a part is drawn in, with proof units on.
export type BodyNode =
  | { kind: "param"; id: string; parent: null; name: string; type: DefType }
  | {
      kind: "part"
      id: string
      parent: string | null
      group: DefGroup
      def: Definition | null
      ports: BodyPort[]
      consts: string[]
      step: ChainStep | null
    }
  | { kind: "ret"; id: string; parent: null; name: string; type: DefType }

// `bits`: the value the edge carries into one node of the group (all of it for a batch), and as
// `elems` elements in `format`.
export type BodyEdge = {
  id: string
  source: string
  target: string
  targetHandle: string
  shared: boolean
  bits: number
  elems: number
  format: string | null
}

const n = (x: number) => x.toLocaleString("en-US")

// What a group is, in a few words: "× 3,072", "128 steps, chained through acc".
export function groupSummary(g: DefGroup, def: Definition | null): string | null {
  if (g.form === "batch") return `× ${n(g.n)}${g.chain ? `, ${n(g.chain)} steps each` : ""}`
  if (g.form === "scan") return `scan of ${n(g.n)} steps`
  if (g.chain) {
    const carry = g.carry?.length ? ` through ${g.carry.join(", ")}` : ""
    return `${g.count > 1 ? `${n(g.count)} chains of ` : ""}${n(g.chain)} steps, chained${carry}`
  }
  if (g.count > 1) return `× ${n(g.count)} in parallel`
  if (def?.form === "composite" && def.bindings && Object.keys(def.bindings).length) return statics(def)
  return null
}

const constLabel = (r: DefRead) =>
  r.const === null || r.const === undefined
    ? `${r.arg} = 0 (padding)`
    : `${r.arg} = ${typeof r.const === "number" ? Number(r.const.toPrecision(6)) : r.const.replace("inf", "∞")}`

export function buildBodyView(defs: Definitions, spec: string) {
  const d = defs.definitions[spec]
  const nodes: BodyNode[] = []
  const edges: BodyEdge[] = []
  if (!d || d.form !== "composite" || !d.groups) return { def: d ?? null, nodes, edges }
  const read = new Set<string>()
  for (const g of d.groups) for (const r of g.reads) if (r.from) read.add(r.from)
  for (const r of d.returns ?? []) if (r.from) read.add(r.from)
  d.params?.forEach((p, i) => {
    if (read.has(`p${i}`)) nodes.push({ kind: "param", id: `bp:${i}`, parent: null, name: p.name, type: p })
  })
  // A chain's readers read its last step.
  const last = new Map<string, string>()
  const nodeOf = (from: string) => (from.startsWith("p") ? `bp:${from.slice(1)}` : (last.get(from) ?? `bg:${from}`))
  for (const g of d.groups) {
    const bySource = new Map<string, BodyPort>()
    const consts: string[] = []
    for (const r of g.reads) {
      if (!r.from) {
        consts.push(constLabel(r))
        continue
      }
      const port = bySource.get(r.from)
      if (port) {
        if (!port.name.split(", ").includes(r.arg)) port.name += `, ${r.arg}`
        port.words += r.words
      } else bySource.set(r.from, { key: r.from, name: r.arg, words: r.words, shared: Boolean(r.shared) })
    }
    const typeOf = (from: string) => (from.startsWith("p") ? d.params?.[Number(from.slice(1))] : d.groups!.find((x) => x.id === from)?.out)
    const bitsOf = (from: string) => typeOf(from)?.bits ?? 32
    const formatOf = (from: string) => typeOf(from)?.format ?? null
    const ports = [...bySource.values()].map((p) => ({ ...p, format: formatOf(p.key) }))
    const def = defs.definitions[g.fn] ?? null
    const steps: ChainStep[] =
      g.chain && g.count === 1
        ? g.chain <= 4
          ? Array.from({ length: g.chain }, (_, i) => ({ index: i + 1, of: g.chain! }))
          : [{ index: 1, of: g.chain }, { index: 2, of: g.chain }, { skipped: g.chain - 3, of: g.chain }, { index: g.chain, of: g.chain }]
        : []
    if (!steps.length) {
      nodes.push({ kind: "part", id: `bg:${g.id}`, parent: null, group: g, def, ports, consts, step: null })
      for (const p of ports) {
        edges.push({
          id: `${p.key}->${g.id}`,
          source: nodeOf(p.key),
          target: `bg:${g.id}`,
          targetHandle: `in-${p.key}`,
          shared: p.shared,
          bits: p.words * bitsOf(p.key) * g.count,
          elems: p.words * g.count,
          format: formatOf(p.key),
        })
      }
      continue
    }
    const carry = g.carry?.join(", ") ?? "carry"
    let prev: string | null = null
    steps.forEach((step, k) => {
      const id = `bg:${g.id}#${k}`
      const stepPorts = prev ? [{ key: "prev", name: carry, words: 1, shared: false }, ...ports] : ports
      nodes.push({ kind: "part", id, parent: null, group: g, def, ports: stepPorts, consts: prev ? [] : consts, step })
      if (prev) {
        edges.push({
          id: `${prev}->${id}`,
          source: prev,
          target: id,
          targetHandle: "in-prev",
          shared: false,
          bits: g.out.words * (g.out.bits ?? 32),
          elems: g.out.words,
          format: g.out.format ?? null,
        })
      }
      for (const p of ports) {
        edges.push({
          id: `${p.key}->${id}`,
          source: nodeOf(p.key),
          target: id,
          targetHandle: `in-${p.key}`,
          shared: p.shared,
          bits: p.words * bitsOf(p.key),
          elems: p.words,
          format: formatOf(p.key),
        })
      }
      prev = id
    })
    last.set(g.id, prev!)
  }
  const returns = d.returns ?? []
  returns.forEach((r, i) => {
    const id = `br:${i}`
    const name = returns.length > 1 ? `out ${i}` : "out"
    nodes.push({ kind: "ret", id, parent: null, name, type: { words: r.words, bits: d.ret?.bits ?? null, format: d.ret?.format ?? null } })
    if (r.from) {
      edges.push({
        id: `${r.from}->${id}`,
        source: nodeOf(r.from),
        target: id,
        targetHandle: "in",
        shared: false,
        bits: r.words * (d.ret?.bits ?? 32),
        elems: r.words,
        format: d.ret?.format ?? null,
      })
    }
  })
  return { def: d, nodes, edges }
}
