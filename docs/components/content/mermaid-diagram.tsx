"use client"

import { useTheme } from "next-themes"
import type { CSSProperties } from "react"
import { useEffect, useId, useState } from "react"

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "")
  const { resolvedTheme } = useTheme()
  const [svg, setSvg] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: resolvedTheme === "dark" ? "dark" : "neutral",
        fontFamily: "var(--font-sans)",
        flowchart: { useMaxWidth: true },
        sequence: { useMaxWidth: false },
      })
      try {
        const result = await mermaid.render(`mermaid-${id}`, chart)
        if (!cancelled) setSvg(result.svg)
      } catch (err) {
        if (!cancelled) setError(String(err))
      }
    })
    return () => {
      cancelled = true
    }
  }, [chart, id, resolvedTheme])

  if (error) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    )
  }

  const width = svg?.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/)?.[1]
  return svg ? (
    <div
      className="docs-mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={width ? ({ "--diagram-w": `${width}px` } as CSSProperties) : undefined}
    />
  ) : (
    <div aria-busy="true" className="docs-mermaid docs-mermaid-loading" />
  )
}
