import { arithKind, kindColor, kindLabel } from "@/components/census/boolean"
import { shortFn, type DefGroup } from "@/lib/definition-view"
import { mixTemplates } from "@/lib/vllm"

export const count = (n: number) => n.toLocaleString("en-US")

export function fmtSize(gates: number): string {
  const unit = (d: number, s: string) => `${Number((gates / d).toPrecision(2))}${s}`
  if (gates < 1e4) return `${count(gates)} gate${gates === 1 ? "" : "s"}`
  // Past a thousand trillion, a power of ten: "3.6 × 10¹⁷ gates".
  if (gates >= 1e15) {
    const e = Math.floor(Math.log10(gates))
    const sup = [...String(e)].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]).join("")
    return `${Number((gates / 10 ** e).toPrecision(2))} × 10${sup} gates`
  }
  return `${gates < 1e6 ? unit(1e3, "K") : gates < 1e9 ? unit(1e6, "M") : gates < 1e12 ? unit(1e9, "B") : unit(1e12, "T")} gates`
}

// A part's color and kind: its subcircuit template's, or the arithmetic it does.
export function partKind(fn: string): { color: string; label: string } {
  const base = shortFn(fn)
  const template = mixTemplates.find((t) => t.id === base || shortFn(t.id) === base)
  if (template) return { color: template.color, label: template.label }
  const kind = arithKind(base)
  return { color: kindColor(kind), label: kindLabel(kind) }
}

// How many parts one group of a Definition's body stands for: "× 1,024", "16 steps".
export function groupBadge(g: DefGroup): string | null {
  if (g.form === "batch") return `× ${count(g.n)}${g.chain ? ` · ${count(g.chain)} steps` : ""}`
  if (g.form === "scan") return `${count(g.n)} steps`
  if (g.chain) return `${g.count > 1 ? `× ${count(g.count)} · ` : ""}${count(g.chain)} steps`
  return g.count > 1 ? `× ${count(g.count)}` : null
}
