"use client"

import { useOpenAssumption } from "@/components/assumptions/assumption-provider"
import type { EntryKind } from "@/lib/assumption-index"

export function TokenButton({
  id,
  label,
  name,
  kind,
  trust,
  paramHtml,
}: {
  id: string
  label: string
  name: string
  kind: EntryKind
  trust?: string
  paramHtml?: string
}) {
  const open = useOpenAssumption()
  return (
    <button
      aria-haspopup="dialog"
      aria-label={name}
      className="docs-token"
      data-kind={kind}
      data-trust={trust}
      onClick={() => open(id)}
      title={name}
      type="button"
    >
      <span>{label}</span>
      {paramHtml ? (
        <span className="docs-token-param" dangerouslySetInnerHTML={{ __html: paramHtml }} />
      ) : null}
    </button>
  )
}
