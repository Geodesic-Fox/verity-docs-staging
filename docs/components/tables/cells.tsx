const flagPattern = /( \((?:prov\.|alg\.|under re-verification)\))/

/*
 * Prints a cell's display string verbatim. State flags render as small pills
 * for styling only: the element's text content is exactly `display`.
 */
export function CellText({ display }: { display: string }) {
  if (display === "—" || display === "n/s") {
    return <span className="text-muted-foreground/50">{display}</span>
  }
  return (
    <>
      {display.split(flagPattern).map((part, i) =>
        flagPattern.test(part) ? (
          <span key={i}>
            {" "}
            <span className="docs-flag" data-flag={part.includes("alg.") ? "alg" : "state"}>
              {part.trimStart()}
            </span>
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

// A table cell: the display string, with the render's footnote number on
// hover rather than inline.
export function DataCell({
  display,
  footnote,
}: {
  display: string
  footnote?: number
}) {
  return (
    <span
      className="docs-cell"
      title={footnote === undefined ? undefined : `Render footnote ${footnote}`}
    >
      <CellText display={display} />
    </span>
  )
}

// Splits a display string at "; " outside parentheses: "a (b; c); d" gives
// ["a (b; c)", "d"].
function splitTopLevel(display: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < display.length; i++) {
    const ch = display[i]
    if (ch === "(") depth++
    else if (ch === ")") depth = Math.max(0, depth - 1)
    else if (depth === 0 && display.startsWith("; ", i)) {
      parts.push(display.slice(start, i))
      start = i + 2
      i++
    }
  }
  parts.push(display.slice(start))
  return parts
}

/*
 * A list-shaped cell as pills. The "; " separators stay in the DOM as
 * visually hidden text, so the cell's text content is exactly `display`.
 */
export function PillList({ display }: { display: string }) {
  if (display === "—") return <CellText display={display} />
  const parts = splitTopLevel(display)
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((part, i) => (
        <span className="docs-pill" key={i}>
          {part}
          {i < parts.length - 1 ? <span className="sr-only">; </span> : null}
        </span>
      ))}
    </span>
  )
}
