import katex from "katex"

import { notation, type Symbol } from "@/data/notation"
import { getEntry, registry, trustLabels, trustOf } from "@/lib/assumptions"

/*
 * Server-side views of the registry: each entry's math pre-rendered to HTML,
 * so the browser never loads KaTeX.
 */

export function tex(source: string, displayMode = false) {
  return katex.renderToString(source, {
    displayMode,
    throwOnError: true,
    strict: "warn",
  })
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Plain text with $…$ spans typeset.
export function richText(source: string) {
  return source
    .split(/\$([^$]+)\$/)
    .map((part, i) => (i % 2 ? tex(part) : escapeHtml(part)))
    .join("")
}

export type EntryKind = "property" | "assumption" | "scheme" | "template" | "subcircuit"

export type TokenData = {
  id: string
  label: string
  name: string
  kind: EntryKind
  trust?: string
}

export function tokenData(id: string): TokenData {
  const entry = getEntry(id)
  return {
    id: entry.id,
    label: entry.label,
    name: entry.name,
    kind: entry.kind,
    trust: trustOf(entry),
  }
}

export type DialogEntry = {
  id: string
  kind: EntryKind
  name: string
  summary: string
  note?: string
  statementHtml?: string
  where: { symbolHtml: string; meaningHtml: string }[]
  trust?: string
  trustLabel?: string
  whyHtml?: string
  attackHtml?: string
  refs: { label: string; href: string }[]
  // Linked entries: what a scheme rests on, a template's subcircuits, a
  // subcircuit's template.
  related: { label: string; tokens: TokenData[] }[]
  details: { label: string; value: string }[]
}

function relatedOf(entry: ReturnType<typeof getEntry>): DialogEntry["related"] {
  if (entry.kind === "scheme") return [{ label: "Rests on", tokens: entry.restsOn.map(tokenData) }]
  if (entry.kind === "template") return [{ label: "Subcircuits", tokens: entry.members.map(tokenData) }]
  if (entry.kind === "subcircuit") return [{ label: "Template", tokens: [tokenData(entry.template)] }]
  return []
}

// Everything the client-side dialog needs, keyed by id.
export function getDialogEntries(): Record<string, DialogEntry> {
  return Object.fromEntries(
    registry.map((entry) => {
      const overrides = (entry.where ?? {}) as Partial<Record<Symbol, string>>
      const dialog: DialogEntry = {
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        summary: entry.summary,
        statementHtml: entry.statement ? tex(entry.statement, true) : undefined,
        where: (entry.symbols as Symbol[]).map((key) => ({
          symbolHtml: tex(notation[key].tex),
          meaningHtml: richText(overrides[key] ?? notation[key].meaning),
        })),
        refs: entry.refs,
        related: relatedOf(entry),
        details: entry.kind === "subcircuit" || entry.kind === "template" ? entry.details : [],
        note: entry.kind === "subcircuit" || entry.kind === "template" ? entry.note : undefined,
      }
      if (entry.kind === "assumption") {
        dialog.trust = entry.trust
        dialog.trustLabel = trustLabels[entry.trust]
        dialog.whyHtml = richText(entry.why)
        dialog.attackHtml = entry.attack ? richText(entry.attack) : undefined
      }
      return [entry.id, dialog]
    })
  )
}

export function registryAnchor(id: string) {
  return id.replace(/\//g, "-")
}
