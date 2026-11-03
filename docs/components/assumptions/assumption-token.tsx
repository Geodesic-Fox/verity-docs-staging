import { TokenButton } from "@/components/assumptions/token-button"
import { tex } from "@/lib/assumption-index"
import { getEntry, trustOf, type Citation } from "@/lib/assumptions"

// A registry token: server-rendered (KaTeX for the parameter), with a
// client button that opens the entry's dialog.
export function AssumptionToken({ citation }: { citation: Citation }) {
  const entry = getEntry(citation.id)
  return (
    <TokenButton
      id={entry.id}
      kind={entry.kind}
      label={entry.label}
      name={entry.name}
      paramHtml={citation.param ? tex(citation.param) : undefined}
      trust={trustOf(entry)}
    />
  )
}

export function TokenList({ citations }: { citations: Citation[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {citations.map((citation) => (
        <AssumptionToken
          citation={citation}
          key={citation.id}
        />
      ))}
    </span>
  )
}
