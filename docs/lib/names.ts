import type { BoolNode, BoolTemplate } from "@/lib/boolean-view"

/*
 * What the visualizer calls a subcircuit, keyed on its stable id: a
 * Definition's id ("GemmCoordinate_v1") or a Boolean subcircuit's content id
 * ("sc-…"). Names are metadata outside the content digest, and the
 * integration doesn't export them yet, so the site shows today's names
 * without their versions. Renaming one is an entry here.
 */
const NAMES: Record<string, string> = {}

const unversioned = (s: string) => s.replace(/_v\d+(?=\b|$)/g, "")

// A Definition, a primitive or a template: "GemmCoordinate_v1{K=2048}" is "GemmCoordinate".
export function defName(id: string): string {
  const base = id.replace(/\{.*$/, "")
  return NAMES[base] ?? unversioned(base)
}

// A Boolean subcircuit, or else the export's name for it: "f32→bf16 (round)", "F2fpBf16".
export function subcircuitName(ref: string, n: BoolNode): string {
  return NAMES[ref] ?? unversioned(n.name).replace(/\s*\(outside the units\)$/, "")
}

// A lowered template, its parameters dropped: "GemmCoordinate", "AttentionHead".
export const templateName = (t: BoolTemplate) => defName(t.name.replace(/\s+T∈.*$/, ""))
