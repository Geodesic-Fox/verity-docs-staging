import overlayFile from "@/data/annotations/overlay.json"
import upstreamFile from "@/data/annotations/upstream.json"

/*
 * Names, descriptions and formats of a program's parts, in verity's `verity/annotations/v0`
 * (`verity.primitives.circuits.annotations`), keyed by ids the program already has: `def:RoPE_v1`,
 * `port:RoPE_v1/in/x`. Two layers, the later winning per (key, field):
 *   - upstream: verity's own files, core's and the vLLM registry's, as the site last imported them;
 *   - the overlay: the site's names not yet upstream (data/annotations/overlay.json).
 * Annotations never enter a program digest.
 */

type TextField = "name" | "description" | "format"

export type Entry = { key: string } & Partial<Record<TextField, string>> & { members?: string[]; callee?: string }
type Owner = "core" | "vllm"

type UpstreamFile = { path: string; exists: boolean; entries: Entry[] }
const upstream = upstreamFile as { source: { repo: string; commit: string | null }; files: Record<Owner, UpstreamFile> }
export const overlay = overlayFile as { format: "verity/annotations/v0"; entries: Entry[] }

export const upstreamEntries = (): Entry[] => [...upstream.files.core.entries, ...upstream.files.vllm.entries]

// A Definition's stem: "RoPE_v1" for "RoPE_v1{NHEADS=8,D=256}".
export const stemOf = (id: string) => id.replace(/\{.*$/, "")

// Layers merged in order, a later (key, field) replacing an earlier one; an empty text removes the field.
export function merge(...layers: Entry[][]): Entry[] {
  const by = new Map<string, Entry>()
  for (const layer of layers) {
    for (const e of layer) {
      const x = by.get(e.key) ?? { key: e.key }
      for (const [f, v] of Object.entries(e)) {
        if (f === "key") continue
        if (v === "") delete (x as Record<string, unknown>)[f]
        else (x as Record<string, unknown>)[f] = v
      }
      by.set(e.key, x)
    }
  }
  return [...by.values()].filter((e) => Object.keys(e).length > 1)
}

// What a key's field reads, after every layer.
export type Lookup = (key: string, field: TextField) => string | null

export function lookupOf(entries: Entry[]): Lookup {
  const by = new Map(entries.map((e) => [e.key, e]))
  return (key, field) => by.get(key)?.[field] ?? null
}
