/*
 * What the Program visualizer draws for a given set of expanded modules.
 * The input is a Program graph from scripts/import-program-graphs.mjs: the
 * Program's modules, its ops (the Calls of one Definition in one module)
 * and the values read between them.
 *
 *   - A module with child modules is a group when expanded, and a single
 *     node showing only its boundary ports when folded. So is a leaf module
 *     with three or more ops (a norm the kernel runs as a chain of
 *     elementwise Calls).
 *   - A leaf module with one op is drawn as that op; one with two opens in
 *     place.
 *   - A run of layers whose structure repeats exactly arrives as its first
 *     member; reads from one member into the next run back into it.
 *   - Program inputs other than the weights (prompt, seed, splits) are
 *     input nodes. Weights, constants and peer ranks are listed on the op.
 */

// An op's Calls under the integration's port-width cut: units and words committed inside, per Call (a
// varying op's as [fewest, most] over its range), and at the top of the range, its units by kind.
export type OpCut = {
  units: number | [number, number]
  interior: number | [number, number]
  kinds: Partial<Record<"output" | "committed" | "recompute" | "literal" | "dead", number>>
  at: number | null
  interpolated: boolean
}

export type ProgramOp = {
  id: string
  group: string
  module: string
  definition: string
  // The subcircuit template its Calls lower to, in the integration's names.
  template: string | null
  templateParams: Record<string, number | string>
  params: Record<string, number | string>
  varying: Record<string, [number, number]>
  calls: number
  instances: number
  units: number | null
  cut: OpCut | null
  weights: string[]
  constants: string[]
  // Values read from the other TP rank.
  peers: number
  order: number
  // In a serving view, where the op is one step's Calls: the Program graph's op it is (for its
  // Definition, labels and size), that op's Calls over the run, the groups it takes Calls from, and
  // its TP rank when there are several.
  source?: string
  runCalls?: number
  groups?: string[]
  rank?: number
}

export type ProgramModule = {
  path: string
  name: string
  parent: string | null
  children: string[]
  ops: string[]
  // Sibling modules merged into this one (a collective's module per Call).
  launches?: number
  repeat?: { count: number; first: string; last: string }
  // In a serving view: a name of its own (an engine step, a request), or the Program graph's module
  // it is.
  label?: string
  source?: string
}

// `bits`: what one read carries, when the export has its words.
// `role` labels a read in a serving view: the next token, or the KV cache, read across steps.
export type ProgramEdge = { from: string; to: string; reads: number; bits?: number | null; back?: boolean; role?: string }

export type ProgramRow = {
  key: string
  model: string
  dtype: string
  gpu: string
  tp: number
  batch: number
  context: string
  workload: string | null
  sampling: { variant: string; temperature: number; top_p: number }
  execution: string
  requests: number
  prompts: number[]
  maxTokens: number[]
  shard: string | null
}

export type ProgramGraph = {
  schema: "verity-docs/program-graph/v2" | "verity-docs/serving-graph/v1"
  row: ProgramRow
  calls: number
  units: number | null
  // The cut ops' cuts are under, and whether edges say what a read carries.
  query: string | null
  edgeBits: boolean
  inputs: string[]
  modules: ProgramModule[]
  ops: ProgramOp[]
  edges: ProgramEdge[]
  // A serving view (scripts/import-serving-view.mjs): the row's run laid out by engine step, then
  // request, then model runner, with the same shape.
  serving?: ServingInfo
}

// What a serving view is of: the record Build of its row, or an example of one level; its steps,
// requests and TP ranks.
export type ServingInfo = { kind: string; note: string | null; record: boolean; steps: number; requests: string[]; ranks: number[] }
export type ServingIndex = { schema: "verity-docs/serving-index/v1"; rows: { key: string; kind: string; record: boolean; steps: number }[] }

export type ProgramIndexRow = Pick<
  ProgramRow,
  "key" | "model" | "dtype" | "gpu" | "tp" | "batch" | "context" | "workload" | "sampling" | "requests" | "shard"
> & { calls: number; ops: number }

export type ProgramIndex = { schema: "verity-docs/program-index/v1"; rows: ProgramIndexRow[] }

const samplingShort = (s: ProgramRow["sampling"]) => (s.temperature === 0 ? "greedy" : `top-p ${s.top_p}, T ${s.temperature}`)

// "I1024-O128" reads as "1,024 in, 128 out".
function contextShort(context: string) {
  const m = /^I(\d+)-O(\d+)$/.exec(context)
  return m ? `${Number(m[1]).toLocaleString("en-US")} in, ${Number(m[2]).toLocaleString("en-US")} out` : context
}

// "L40S · BF16 · batch 1 · 256 in, 32 out · top-p 0.95, T 0.8".
export function rowConfig(r: ProgramIndexRow) {
  return [
    r.gpu.toUpperCase(),
    r.dtype.toUpperCase(),
    r.tp > 1 ? `TP${r.tp}` : null,
    `batch ${r.batch}`,
    contextShort(r.context),
    samplingShort(r.sampling),
    r.workload && r.workload !== "mixed" ? r.workload : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/*
 * Annotations: a separate layer of readable names, keyed by the same
 * module paths and op ids the Program's query API partitions by, so an
 * agent can write them from queries without touching the Program. `match`
 * is a module path, op id or input (`in:prompt`), where `*` stands for
 * part of one path segment and `**` for anything. Later matches override
 * earlier ones. `ports` names an op's inputs by where they come from;
 * `edges` gives the reads from a source a role ("residual") or label, and
 * `out` labels reads out of the op that run back.
 */
export type Annotation = {
  match: string
  label?: string
  note?: string
  ports?: Record<string, string>
  edges?: Record<string, string>
}

export type Annotations = { schema: "verity-docs/program-annotations/v2"; annotations: Annotation[] }

const globRe = (glob: string) =>
  new RegExp(
    `^${glob
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^./]*")
      .replace(/\u0000/g, ".*")}$`
  )

// The first key of `map` whose glob matches `id`, scanning from the last.
function lookup(map: Record<string, string> | undefined, id: string): { value: string; rank: number } | null {
  if (!map) return null
  const keys = Object.keys(map)
  for (let i = keys.length - 1; i >= 0; i--) if (globRe(keys[i]!).test(id)) return { value: map[keys[i]!]!, rank: i }
  return null
}

export function matcher(annotations: Annotation[]) {
  const compiled = annotations.map((a) => ({ a, re: globRe(a.match) }))
  const cache = new Map<string, Annotation | undefined>()
  return (id: string): Annotation | undefined => {
    if (cache.has(id)) return cache.get(id)
    let found: Annotation | undefined
    for (const { a, re } of compiled) {
      if (!re.test(id)) continue
      found = { ...found, ...a, ports: { ...found?.ports, ...a.ports }, edges: { ...found?.edges, ...a.edges } }
    }
    cache.set(id, found)
    return found
  }
}

// An input port: every source that reads into the op the same way. Reads
// from layer 0 and from the previous repeated layer share one.
export type PortLabel = { key: string; name: string | null; sources: string[]; reads: number }

// "model.layers.3.mlp.down_proj/Gemm_v1" and "model.layers.0.…" share a port.
export const portKey = (source: string) => source.replace(/^.*\.\d+\./, "")

export type ViewNode =
  | {
      kind: "group"
      id: string
      parent: string | null
      path: string
      name: string
      label: string | null
      note: string | null
      repeat: number | null
      // A repeated run's first and last: "1–15".
      range: string | null
    }
  | {
      kind: "module"
      id: string
      parent: string | null
      path: string
      name: string
      label: string | null
      note: string | null
      repeat: number | null
      range: string | null
      ops: number
      calls: number
      // Its ops by subcircuit template, for the mix bar.
      mix: { template: string; count: number }[]
      inputs: string[]
      outputs: number
    }
  | {
      kind: "op"
      id: string
      parent: string | null
      name: string
      label: string | null
      note: string | null
      op: ProgramOp
      launches: number | null
      ports: PortLabel[]
    }
  // The Program's own inputs, with the ops that read them and how often; and its outputs, the values
  // of ops nothing reads on the way forward (they may run back, as a sampled token does).
  | { kind: "input"; id: string; parent: null; name: string; label: string | null; note: string | null; readers: string[]; reads: number }
  | { kind: "output"; id: string; parent: null; name: string; label: string | null; note: string | null; reads: number; bits: number | null }
  // Outside a drilled-into module: where its inputs come from, where its
  // outputs go. `context` names the module it sits in, when that isn't
  // obvious from the view; `goto` is the module to open to see it.
  | {
      kind: "boundary"
      id: string
      parent: null
      name: string
      label: string | null
      context: string | null
      goto: string | null
      direction: "in" | "out"
    }

export type ViewEdge = {
  id: string
  source: string
  target: string
  targetHandle: string
  reads: number
  recurrence: boolean
  // From annotations: "residual" styles the edge; any other text labels it.
  role: string | null
  // The op (or input) the value comes from, what one read carries, and when widths are on, that size.
  from?: string | null
  bits?: number | null
  width?: string | null
}

export const templateOf = (op: ProgramOp) => op.template ?? op.definition

const num = (v: number | string | undefined) => (v === undefined ? "?" : Number(v).toLocaleString("en-US"))

// What an op computes, in a few words: "GEMM · 2,048 → 3,072".
export function opSummary(op: ProgramOp, row: ProgramRow): string {
  const p = op.params
  const base = op.definition.replace(/_v\d+$/, "")
  switch (base) {
    case "Gemm":
      return `GEMM · ${num(p.K)} → ${num(p.N)}`
    case "ScaledMmFp8Block":
      return `FP8 GEMM · ${num(p.K)} → ${num(p.N)}`
    case "Fp8GroupQuant":
      return `FP8 quantize · ${num(p.K)}`
    case "MoeExpertGemm":
      return `Expert GEMM · ${num(p.K)} → ${num(p.N)}`
    case "MoeExpertGemmW":
      return `Weighted GEMM · ${num(p.K)} → ${num(p.N)}`
    case "MoeRouterTopK":
    case "MoeRouterTopKNorm":
      return `Top ${p.TOPK} of ${p.E} experts`
    case "MoeSum":
      return `Sum ${p.TOPK} experts · ${num(p.H)}`
    case "Attention":
      return `Attention · ${p.NH} heads over ${p.KVH} KV`
    case "AttentionSoftcap":
      return `Attention · ${p.NH} heads over ${p.KVH} KV, cap ${p.CAP}`
    case "RoPE":
      return `RoPE · ${p.NHEADS} heads`
    case "RMSNormTriton":
      return `RMSNorm · ${num(p.N)}`
    case "RMSNormFusedCuda":
      return `Add + RMSNorm · ${num(p.N)}`
    case "SiluMul":
      return `SiLU · mul · ${num(p.I)}`
    case "GeluTanhMul":
      return `GELU · mul · ${num(p.I)}`
    case "BiasAdd":
      return `Bias add · ${num(p.N)}`
    case "AllReduce2":
      return `All-reduce, 2 ranks · ${num(p.N)}`
    case "AllGather2":
      return `All-gather, 2 ranks · ${num(p.N)}`
    case "Embedding":
      return `Embedding · a row of ${num(p.H)}`
    case "EmbeddingShard":
      return `Embedding · ${num(p.VS)} of the rows`
    case "GumbelTopPTokenSelect":
      return `Top-p · p ${row.sampling.top_p}, T ${row.sampling.temperature}`
    case "TokenSelect":
      return `Argmax over ${num(p.V)} tokens`
    case "Bf16MulScalarTensor":
      return `× scalar · ${num(p.N)}`
    case "Bf16DivScalar":
      return `÷ ${p.C} · ${num(p.N)}`
    case "Bf16MulScalar":
      return `× ${p.C} · ${num(p.N)}`
    case "Bf16Tanh":
      return `tanh · ${num(p.N)}`
    case "AddScalarBf16":
    case "AddScalarF32":
      return `+ ${p.C} · ${num(p.N)}`
    case "SquareBf16":
    case "SquareF32":
      return `x² · ${num(p.N)}`
    case "MeanTriton":
      return `Mean · ${num(p.N)}`
    case "RsqrtF32":
      return `1/√x · ${num(p.N)}`
    case "ScaleRowBf16":
    case "ScaleRowF32":
      return `Scale rows · ${num(p.N)}`
    case "MulVecF32":
      return `Multiply · ${num(p.N)}`
    case "NarrowF32ToBf16":
      return `F32 → BF16 · ${num(p.N)}`
    case "AddWidenedBf16":
      return `Add in F32 · ${num(p.N)}`
    default: {
      // "AddScalarF32" reads as "Add scalar F32 · 1".
      const words = base
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(" ")
        .map((w, i) => (i === 0 ? w : /^(Bf16|F32|F16)$/.test(w) ? w.toUpperCase() : w.toLowerCase()))
        .join(" ")
      return p.N !== undefined ? `${words} · ${num(p.N)}` : words
    }
  }
}

const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)
const singular = (s: string) => s.replace(/s$/, "")
const isLeafOp = (m: ProgramModule | undefined) => Boolean(m && m.children.length === 0 && m.ops.length === 1)

/*
 * Readable names for modules and ops. A repeated run reads "Layers 1–15"
 * and a numbered module "Layer 0" unless annotated; an op that is its
 * module's only one takes the module's name.
 */
// `defName` names an op by its Definition, from the annotation layer, where nothing more specific does.
export function labeler(graph: ProgramGraph, annotations: Annotation[], defName?: (definition: string) => string | null) {
  const annotate = matcher(annotations)
  const modules = new Map(graph.modules.map((m) => [m.path, m]))
  const ops = new Map(graph.ops.map((o) => [o.id, o]))
  // A serving view's modules and ops are named as the Program graph's they stand for.
  const src = (id: string) => ops.get(id)?.source ?? id
  const moduleLabel = (path: string): string | null => {
    const m = modules.get(path)
    const a = m?.label ?? annotate(m?.source ?? path)?.label
    if (a) return a
    if (!m) return null
    const parent = m.parent ? capital(modules.get(m.parent)?.name ?? "") : ""
    if (m.repeat) return `${parent} ${m.repeat.first}–${m.repeat.last}`.trim()
    if (/^\d+$/.test(m.name)) return `${singular(parent)} ${m.name}`.trim()
    return null
  }
  const opLabel = (opId: string): string | null => {
    const o = ops.get(opId)
    if (!o) return annotate(opId)?.label ?? null
    const m = modules.get(o.module)
    const label = (isLeafOp(m) ? moduleLabel(o.module) : null) ?? annotate(src(opId))?.label ?? defName?.(o.definition) ?? null
    return label && o.rank !== undefined ? `${label} · rank ${o.rank}` : label
  }
  // Named where it's read from: "Down projection", "Final norm · Round to
  // BF16" for an op that shares its module, "TokenSelect" without labels.
  const nameOf = (id: string) => {
    if (id.startsWith("in:")) return annotate(id)?.label ?? id.slice(3)
    const slash = id.indexOf("/")
    const local = (slash < 0 ? id : id.slice(slash + 1)).replace(/_v\d+(#(\d+))?$/, (_, __, k) => (k ? ` ${k}` : ""))
    if (slash < 0) return opLabel(id) ?? local
    const module = id.slice(0, slash)
    const m = modules.get(module)
    const own = moduleLabel(module) ?? module.split(".").pop()!
    if (isLeafOp(m)) return opLabel(id) ?? own
    return `${own} · ${annotate(src(id))?.label ?? local}`
  }
  return { annotate, moduleLabel, opLabel, nameOf, src }
}

/*
 * Only the `scope` module's inside is drawn (the whole Program's without
 * one): its ops, its child modules, folded unless they're in `expanded`, in
 * which case they open in place, and a boundary node for each outside op it
 * reads from or writes to.
 */
export function buildView(
  graph: ProgramGraph,
  expanded: Set<string>,
  annotations: Annotation[] = [],
  scope: string | null = null
) {
  const { annotate, moduleLabel, opLabel, src } = labeler(graph, annotations)
  const modules = new Map(graph.modules.map((m) => [m.path, m]))
  const ops = new Map(graph.ops.map((o) => [o.id, o]))
  const at = scope ?? ""
  const inScope = (path: string) => at === "" || path === at || path.startsWith(`${at}.`)
  if (scope) {
    expanded = new Set(expanded)
    for (let p: string | null = scope; p; p = modules.get(p)?.parent ?? null) expanded.add(p)
  }

  const isLeaf = (m: ProgramModule) => m.children.length === 0
  // Every module folds but a leaf with one op, which is drawn as that op.
  const folds = (m: ProgramModule) => !isLeaf(m) || m.ops.length >= 2
  const open = (path: string) => {
    const m = modules.get(path)
    return !m || !folds(m) || expanded.has(path)
  }

  // The node an op is drawn in: itself, or its outermost folded ancestor,
  // or (outside the scope) a boundary.
  const endpoint = (opId: string): string => {
    const op = ops.get(opId)!
    if (!inScope(op.module)) return `ext:${opId}`
    if (op.module === at) return `op:${opId}`
    const rest = at ? op.module.slice(at.length + 1) : op.module
    const parts = rest.split(".")
    for (let i = 1; i <= parts.length; i++) {
      const path = [at, ...parts.slice(0, i)].filter(Boolean).join(".")
      if (modules.has(path) && !open(path)) return `mod:${path}`
    }
    return `op:${opId}`
  }

  const nodes: ViewNode[] = []

  // The weights are inputs of the Program like the request's: every op that reads a weight tensor
  // reads the weights input. The export lists them per op rather than as an input.
  const weighted = graph.ops.filter((o) => o.weights.length)
  const inputs = weighted.length ? [...graph.inputs.slice(0, 1), "weights", ...graph.inputs.slice(1)] : graph.inputs
  const allEdges: ProgramEdge[] = [...graph.edges, ...weighted.map((o) => ({ from: "in:weights", to: o.id, reads: o.calls }))]

  const edgesInto = new Map<string, ProgramEdge[]>()
  for (const e of allEdges) edgesInto.set(e.to, [...(edgesInto.get(e.to) ?? []), e])

  const portLabels = (o: ProgramOp): PortLabel[] => {
    const names = annotate(src(o.id))?.ports
    const byKey = new Map<string, PortLabel & { rank: number; order: number }>()
    for (const e of edgesInto.get(o.id) ?? []) {
      const key = portKey(e.from)
      const named = lookup(names, src(e.from))
      const port = byKey.get(key)
      if (port) {
        port.sources.push(e.from)
        port.reads = Math.max(port.reads, e.reads)
        continue
      }
      byKey.set(key, {
        key,
        name: named?.value ?? (e.from === "in:weights" ? "weights" : null),
        sources: [e.from],
        reads: e.reads,
        rank: named?.rank ?? Number.MAX_SAFE_INTEGER,
        order: e.from.startsWith("in:") ? Number.MAX_SAFE_INTEGER - 1 : (ops.get(e.from)?.order ?? 0),
      })
    }
    // Named ports in the annotation's order, then the rest as the Program runs.
    return [...byKey.values()]
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
      .map(({ key, name, sources, reads }) => ({ key, name, sources, reads }))
  }

  const countOps = (m: ProgramModule) => {
    let count = 0
    let calls = 0
    const mix = new Map<string, number>()
    const walk = (x: ProgramModule) => {
      for (const id of x.ops) {
        const o = ops.get(id)!
        count += 1
        calls += o.calls
        mix.set(templateOf(o), (mix.get(templateOf(o)) ?? 0) + 1)
      }
      for (const c of x.children) walk(modules.get(c)!)
    }
    walk(m)
    return { ops: count, calls, mix: [...mix].map(([template, c]) => ({ template, count: c })) }
  }

  const opNode = (o: ProgramOp, name: string, parentId: string | null, standsFor: ProgramModule | null): ViewNode => {
    const oa = annotate(src(o.id))
    return {
      kind: "op",
      id: `op:${o.id}`,
      parent: parentId,
      name,
      label: opLabel(o.id),
      note: oa?.note ?? (standsFor ? (annotate(standsFor.source ?? standsFor.path)?.note ?? null) : null),
      op: o,
      launches: standsFor?.launches ?? null,
      ports: portLabels(o),
    }
  }
  const localName = (o: ProgramOp) => o.id.split("/").pop()!.replace(/_v\d+(#(\d+))?$/, (_, __, k) => (k ? ` ${k}` : ""))

  const visit = (path: string, parent: string | null) => {
    const m = modules.get(path)!
    const repeat = m.repeat?.count ?? null
    const range = m.repeat ? `${m.repeat.first}–${m.repeat.last}` : null
    const name = m.repeat ? `${m.repeat.first} … ${m.repeat.last}` : m.name
    const note = annotate(m.source ?? path)?.note ?? (m.repeat ? "Structurally identical: the same Calls, Definitions and wiring." : null)
    if (isLeafOp(m)) {
      nodes.push(opNode(ops.get(m.ops[0]!)!, m.name, parent, m))
      return
    }
    if (!open(path)) {
      const { ops: count, calls, mix } = countOps(m)
      nodes.push({
        kind: "module",
        id: `mod:${path}`,
        parent,
        path,
        name,
        label: moduleLabel(path),
        note,
        repeat,
        range,
        ops: count,
        calls,
        mix,
        inputs: [],
        outputs: 0,
      })
      return
    }
    const id = `grp:${path}`
    nodes.push({ kind: "group", id, parent, path, name, label: moduleLabel(path), note, repeat, range })
    for (const opId of m.ops) nodes.push(opNode(ops.get(opId)!, localName(ops.get(opId)!), id, null))
    for (const c of m.children) visit(c, id)
  }

  for (const input of inputs) {
    const from = allEdges.filter((e) => e.from === `in:${input}`)
    nodes.push({
      kind: "input",
      id: `in:${input}`,
      parent: null,
      name: input,
      label: annotate(`in:${input}`)?.label ?? null,
      note: annotate(`in:${input}`)?.note ?? null,
      readers: [...new Set(from.map((e) => e.to))],
      reads: from.reduce((a, e) => a + e.reads, 0),
    })
  }
  const top = modules.get(at)!
  for (const opId of top.ops) nodes.push(opNode(ops.get(opId)!, localName(ops.get(opId)!), null, null))
  for (const c of top.children) visit(c, null)
  // The Program's outputs, where the ops that make them are in view.
  const forward = new Set(graph.edges.filter((e) => !e.back).map((e) => e.from))
  for (const o of graph.ops) {
    if (forward.has(o.id) || endpoint(o.id).startsWith("ext:")) continue
    const back = graph.edges.filter((e) => e.from === o.id)
    nodes.push({
      kind: "output",
      id: `out:${o.id}`,
      parent: null,
      name: o.id,
      label: annotate(`out:${src(o.id)}`)?.label ?? null,
      note: annotate(`out:${src(o.id)}`)?.note ?? null,
      reads: o.calls,
      bits: back.find((e) => e.bits)?.bits ?? null,
    })
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = new Map<string, ViewEdge>()
  // One boundary node per outside op, on the side the data crosses.
  const boundary = (ext: string, direction: "in" | "out") => {
    const opId = ext.slice("ext:".length)
    const id = `${direction === "in" ? "bin" : "bout"}:${opId}`
    if (!byId.has(id)) {
      const opModule = ops.get(opId)!.module
      const parts = opModule ? opModule.split(".") : []
      let context: string | null = null
      for (let i = 1; i <= parts.length; i++) {
        const p = parts.slice(0, i).join(".")
        if (at === p || at.startsWith(`${p}.`)) continue
        if (p !== opModule) context = moduleLabel(p) ?? modules.get(p)?.name ?? p
        break
      }
      const m = modules.get(opModule)
      const goto = isLeafOp(m) ? m!.parent || null : opModule || null
      // Named as you'd find it: a folded module by its name, an op that
      // shares its module by both.
      const own = m ? (moduleLabel(m.path) ?? m.name) : null
      const label =
        !m || isLeafOp(m) || !opModule
          ? opLabel(opId)
          : folds(m)
            ? own
            : `${own} · ${opLabel(opId) ?? localName(ops.get(opId)!)}`
      const node: ViewNode = {
        kind: "boundary",
        id,
        parent: null,
        name: opId,
        label,
        context,
        goto,
        direction,
      }
      nodes.push(node)
      byId.set(id, node)
    }
    return id
  }

  for (const e of allEdges) {
    let source = e.from.startsWith("in:") ? e.from : endpoint(e.from)
    let target = endpoint(e.to)
    if (target.startsWith("ext:") && (source.startsWith("ext:") || source.startsWith("in:"))) continue
    if (source.startsWith("ext:")) source = boundary(source, "in")
    if (target.startsWith("ext:")) target = boundary(target, "out")
    if (source === target || !byId.has(source) || !byId.has(target)) continue
    const recurrence = Boolean(e.back)
    const role =
      e.role ?? lookup(annotate(src(e.to))?.edges, src(e.from))?.value ?? (recurrence ? (annotate(src(e.from))?.edges?.out ?? null) : null)
    const t = byId.get(target)!
    let targetHandle = t.kind === "boundary" ? "in" : `in-${portKey(e.from)}`
    if (t.kind === "module") {
      if (!t.inputs.includes(source)) t.inputs.push(source)
      targetHandle = `in-${source}`
    }
    const s = byId.get(source)!
    if (s.kind === "module") s.outputs += 1
    // A read that runs back is its own wire, beside one between the same nodes on the way forward.
    const key = `${source}->${target}#${targetHandle}${recurrence ? "#back" : ""}`
    const x = edges.get(key)
    if (x) {
      x.reads = Math.max(x.reads, e.reads)
      x.role ??= role
      x.recurrence ||= recurrence
      if (e.bits) x.bits = Math.max(x.bits ?? 0, e.bits)
    } else edges.set(key, { id: key, source, target, targetHandle, reads: e.reads, recurrence, role, from: e.from, bits: e.bits ?? null })
  }
  // Each output, from the op (or the folded module) that makes it.
  for (const n of nodes) {
    if (n.kind !== "output") continue
    const source = endpoint(n.name)
    const id = `${source}->${n.id}`
    edges.set(id, { id, source, target: n.id, targetHandle: "in", reads: n.reads, recurrence: false, role: null, from: n.name, bits: n.bits })
  }

  // Program inputs nothing in view reads are left out.
  const used = new Set([...edges.values()].map((e) => e.source))
  return { nodes: nodes.filter((n) => n.kind !== "input" || used.has(n.id)), edges: [...edges.values()] }
}
