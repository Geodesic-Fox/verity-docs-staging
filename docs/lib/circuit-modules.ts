/*
 * A Boolean subcircuit's gates, expanded from its circuit type on demand. Every sub-circuit of a
 * primitive's lowering is a circuit type (verity/circuit-type/v1, verity_flock.circuit_types): each
 * distinct one once, named by its SHA-512, as its own ANDs over linear forms, its table reads and
 * its calls of other types. Expanding a type walks its calls as far down as the parts you've opened;
 * a part you haven't opened, and every table read, is drawn as one box. Nothing is precomputed flat
 * and nothing caps the size but what's opened.
 *
 * A type: wires 0 .. in_bits − 1 are its input bits; each item appends wires:
 *   [0, A, B]           an AND of two forms            one wire
 *   [3, k, [F × n]]     a call of calls[k] on n forms  its callee's out bits
 *   [4, t, [F × n]]     a read of tables[t]            its value bits
 * A form [[w …], c] is the XOR of wires w and the constant c. Drawn as gates by the export's
 * counting rule: each distinct form a type uses (an AND's operand, a call's or a read's argument,
 * an output) is a chain of |w| − 1 XORs, and a NOT when c is 1.
 */

import type { BoolCounts, GateBox, GateList } from "@/lib/boolean-view"

type Form = [number[], number]
type Item = [0, Form, Form] | [3, number, Form[]] | [4, number, Form[]]

export type CircuitType = {
  format: string
  label: "library" | "program"
  in: [number, number][]
  out: [number, number][]
  calls: string[]
  tables: [string, number, number][]
  items: Item[]
  outputs: Form[]
  // What a closed call shows (its out bits, name, kind, gates) and a table read (its table, and the
  // read's ANDs, XORs and NOTs); and the drawn part each call (in order) is in.
  info: { calls: [number, string, string, number][]; tables: [string, number, number, number][] }
  drawn?: number[]
}

const AND = 0
const XOR = 1
const NOT = 2
const CALL = 3
const READ = 4
// A box's output bits are gates [BOX, box, bit].
const BOX = 3

export type Expansion = GateList & { boxes: GateBox[]; reads: BoolCounts }

export class TooManyGates extends Error {}

// Type `id` expanded down through the calls `open` says are open (by path, "2.0.5", and the callee),
// with every other call a box, and every table read. Throws TooManyGates when the opened calls take
// it past `limit` gates; its own gates always draw.
export function expandModule(
  get: (id: string) => CircuitType | undefined,
  id: string,
  open: (path: string, ref: string) => boolean,
  limit = Infinity
): Expansion | null {
  const top = get(id)
  if (!top) return null
  const gates: number[] = []
  const tags: number[] = []
  const scopes: [string, number, number][] = []
  const boxes: GateBox[] = []
  const counts = { and: 0, xor: 0, not: 0 }
  const reads = { and: 0, xor: 0, not: 0 }
  const inBits = top.in.reduce((a, [n, w]) => a + n * w, 0)
  let next = inBits
  let own = Infinity
  const emit = (op: number, a: number, b: number, sc: number) => {
    gates.push(op, a, b)
    tags.push(sc)
    if (op === AND) counts.and++
    else if (op === XOR) counts.xor++
    else if (op === NOT) counts.not++
    if (op !== BOX && counts.and + counts.xor + counts.not > Math.max(limit, own)) throw new TooManyGates()
    return next++
  }

  const run = (h: string, ins: number[], parent: number, part: number, path: string): number[] => {
    const t = get(h)
    if (!t) throw new Error(`no circuit type ${h}`)
    const sc = scopes.length
    scopes.push([h, parent, part])
    const local = [...ins]
    const made = new Map<string, number>()
    const form = ([ws, c]: Form): number => {
      const key = `${ws.join(",")}|${c}`
      const hit = made.get(key)
      if (hit !== undefined) return hit
      let r: number
      if (!ws.length) r = c ? -2 : -1
      else {
        r = local[ws[0]!]!
        for (let j = 1; j < ws.length; j++) r = emit(XOR, r, local[ws[j]!]!, sc)
        if (c) r = emit(NOT, r, -1, sc)
      }
      made.set(key, r)
      return r
    }
    let p = 0
    for (const it of t.items) {
      if (it[0] === AND) {
        const a = form(it[1])
        const b = form(it[2])
        local.push(emit(AND, a, b, sc))
      } else if (it[0] === CALL) {
        const m = p++
        const ref = t.calls[it[1]]!
        const args = it[2].map(form)
        const at = path ? `${path}.${m}` : `${m}`
        if (open(at, ref) && get(ref)) local.push(...run(ref, args, sc, m, at))
        else {
          const [outs, name, kind, size] = t.info.calls[it[1]]!
          const box = boxes.length
          boxes.push({ kind: "part", ref, module: ref, name, of: kind, size, path: at, ins: args.filter((a) => a >= 0), outs, part: -1 })
          for (let j = 0; j < outs; j++) local.push(emit(BOX, box, j, sc))
        }
      } else {
        const [, , width] = t.tables[it[1]]!
        const [name, a, x, n] = t.info.tables[it[1]]!
        const box = boxes.length
        boxes.push({ kind: "table", ref: name, path, ins: it[2].map(form).filter((w) => w >= 0), outs: width, part: -1, size: a + x + n })
        reads.and += a
        reads.xor += x
        reads.not += n
        for (let j = 0; j < width; j++) local.push(emit(BOX, box, j, sc))
      }
    }
    return t.outputs.map(form)
  }

  // Its own gates first, at one level, to know what always draws.
  if (limit !== Infinity) {
    const one = expandModule(get, id, () => false)
    if (one) own = one.counts.and + one.counts.xor + one.counts.not
  }
  const outputs = run(id, Array.from({ length: inBits }, (_, i) => i), -1, -1, "")
  // Each gate's and box's drawn part in the top type: the part of it that it's under.
  const topPart = new Int32Array(scopes.length).fill(-1)
  scopes.forEach(([, parent, index], s) => {
    if (s > 0) topPart[s] = parent === 0 ? (top.drawn?.[index] ?? index) : topPart[parent]!
  })
  for (const b of boxes) {
    const m = Number(b.path.split(".")[0])
    b.part = b.path === "" ? -1 : (top.drawn?.[m] ?? m)
  }
  const part = tags.map((s, g) => (gates[3 * g] === BOX ? boxes[gates[3 * g + 1]!]!.part : topPart[s]!))
  return { inputs: inBits, outputs, gates, counts, part, tags, scopes, boxes, reads }
}

// The circuit types, fetched by shard as the visualizer steps down, and kept.
export class ModuleStore {
  private shards = new Map<string, Promise<void>>()
  private types = new Map<string, CircuitType>()
  get = (id: string) => this.types.get(id)

  load(ids: string[]): Promise<void> {
    const need = [...new Set(ids.filter((id) => !this.types.has(id)).map((id) => id.slice(0, 2)))]
    return Promise.all(
      need.map((k) => {
        if (!this.shards.has(k)) {
          this.shards.set(
            k,
            fetch(`/census/modules/${k}`)
              .then((r) => r.json() as Promise<Record<string, CircuitType>>)
              .then((s) => {
                for (const [id, t] of Object.entries(s)) this.types.set(id, t)
              })
          )
        }
        return this.shards.get(k)!
      })
    ).then(() => undefined)
  }

  // A type and every type below it.
  async loadTree(id: string): Promise<void> {
    let frontier = [id]
    const seen = new Set<string>()
    while (frontier.length) {
      await this.load(frontier)
      const nextIds: string[] = []
      for (const f of frontier) {
        seen.add(f)
        for (const c of this.types.get(f)?.calls ?? []) if (!seen.has(c)) nextIds.push(c)
      }
      frontier = [...new Set(nextIds)]
    }
  }
}
