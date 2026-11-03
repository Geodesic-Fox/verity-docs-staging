import { z } from "zod"

import { entries as rawEntries } from "@/data/assumptions"
import { notation } from "@/data/notation"

/*
 * The registry security claims are written in: a component's properties,
 * and the assumptions they rest on. Assumptions carry an opinionated trust
 * rating, from solid (blue) to weak (red). Validated at build time, so a
 * malformed entry, a duplicate id or an undefined symbol fails the build.
 */

export const trustLevels = ["solid", "accepted", "caution", "weak"] as const
export type Trust = (typeof trustLevels)[number]

export const trustLabels: Record<Trust, string> = {
  solid: "Solid",
  accepted: "Accepted",
  caution: "Caution",
  weak: "Weak",
}

export const trustDescriptions: Record<Trust, string> = {
  solid: "Standard and long studied. Safe to rely on.",
  accepted: "A heuristic, but relied on everywhere with no practical attack known.",
  caution: "Young or less studied. Fine with care.",
  weak: "Trusts a party to behave as specified.",
}

const symbolKey = z
  .string()
  .refine((key) => key in notation, { message: "symbol not in data/notation.ts" })

const base = {
  id: z.string().regex(/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/),
  name: z.string(),
  label: z.string(),
  summary: z.string(),
  // KaTeX; its symbols must all be listed in `symbols`.
  statement: z.string().optional(),
  symbols: z.array(symbolKey),
  where: z.record(symbolKey, z.string()).optional(),
  refs: z.array(z.object({ label: z.string(), href: z.string().url() })),
}

const entrySchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("property") }),
  z.object({
    ...base,
    kind: z.literal("template"),
    // Its parameters and what each means, shown as a small table.
    details: z.array(z.object({ label: z.string(), value: z.string() })),
    // Subcircuit ids: the template with its parameters bound.
    members: z.array(z.string()),
    note: z.string().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("subcircuit"),
    template: z.string(),
    // Bound parameters and facts, shown as a small table.
    details: z.array(z.object({ label: z.string(), value: z.string() })),
    note: z.string().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("scheme"),
    // Assumption ids the scheme's binding rests on.
    restsOn: z.array(z.string()),
  }),
  z.object({
    ...base,
    kind: z.literal("assumption"),
    trust: z.enum(trustLevels),
    // Why it has this rating, in one or two sentences.
    why: z.string(),
    // Plain text; $…$ spans are KaTeX.
    attack: z.string().optional(),
  }),
])

export type Entry = z.infer<typeof entrySchema>

export const registry: Entry[] = z.array(entrySchema).parse(rawEntries)

const byId = new Map(registry.map((entry) => [entry.id, entry]))
if (byId.size !== registry.length) {
  throw new Error("duplicate id in data/assumptions.ts")
}

export function getEntry(id: string): Entry {
  const entry = byId.get(id)
  if (!entry) throw new Error(`unknown assumption id ${id}`)
  return entry
}

for (const entry of registry) {
  if (entry.kind === "scheme") {
    for (const id of entry.restsOn) {
      if (getEntry(id).kind !== "assumption") {
        throw new Error(`${entry.id} rests on ${id}, which isn't an assumption`)
      }
    }
  }
  if (entry.kind === "template") {
    for (const id of entry.members) {
      const member = getEntry(id)
      if (member.kind !== "subcircuit" || member.template !== entry.id) {
        throw new Error(`${entry.id} lists ${id}, which isn't one of its subcircuits`)
      }
    }
  }
  if (entry.kind === "subcircuit" && getEntry(entry.template).kind !== "template") {
    throw new Error(`${entry.id}: ${entry.template} isn't a template`)
  }
}

// An entry's trust colour: its own rating, or for a scheme the weakest
// rating among the assumptions it rests on.
export function trustOf(entry: Entry): Trust | undefined {
  if (entry.kind === "assumption") return entry.trust
  if (entry.kind === "scheme") {
    const ratings = entry.restsOn.map((id) => {
      const rested = getEntry(id)
      return rested.kind === "assumption" ? rested.trust : "solid"
    })
    return ratings.reduce<Trust>(
      (worst, t) => (trustLevels.indexOf(t) > trustLevels.indexOf(worst) ? t : worst),
      "solid"
    )
  }
  return undefined
}

// A citation: an entry, optionally with a parameter (KaTeX, e.g. 2^{-128}).
export type Citation = { id: string; param?: string }
