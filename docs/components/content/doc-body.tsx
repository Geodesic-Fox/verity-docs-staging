import type { ElementContent, Root } from "hast"
import katex from "katex"
import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { AssumptionToken } from "@/components/assumptions/assumption-token"
import { CircuitLink } from "@/components/census/circuit-modal"
import { GraphEmbed } from "@/components/census/graph-embed"
import { DocToc, type DocTocItem } from "@/components/content/doc-toc"
import { MermaidDiagram } from "@/components/content/mermaid-diagram"
import { ProgramEmbed } from "@/components/programs/program-embed"
import { tableComponents } from "@/components/tables/registry"
import { Badge } from "@/components/ui/badge"

/*
 * The docs renderer: the editorial markdown pipeline (GFM, math, footnotes)
 * with the docs typography baked in as CSS variables, plus these
 * docs-specific embeds and links:
 *   - `![Table 2](/tables/table-2)` renders a benchmark table component;
 *   - `![Served Programs](/graphs/programs)` renders the table of Programs
 *     on record, each opening its circuit;
 *   - `![Commitment phase](/programs/sampled-proofs#commit)` renders a
 *     protocol's pseudocode, one or more phases of it;
 *   - `[CR · SHA-512](/assumptions/cr/sha-512)` renders a registry token;
 *   - `[the step](/circuits/HopperBF16WgmmaDot16_v1)` opens a circuit
 *     (lib/circuits.ts says what a key names);
 *   - a ~~~mermaid fence renders a diagram;
 *   - a ~~~proof fence renders its markdown folded under "Proof", and
 *     `~~~proof instantiated`, `~~~proof abstract` or `~~~proof pending`
 *     adds its Lean status.
 * Inline math uses $…$ and display math $$…$$.
 * A page with an h2 gets the "On this page" rail beside the article.
 * Stays server-compatible; the Mermaid renderer, the Programs table, circuit
 * links and the rail are the client islands.
 */

// Geist throughout, sized like Vercel's docs: 16px body, semibold headings
// with tight tracking, Geist Mono for code.
const themeVars = {
  "--post-font": "var(--font-sans)",
  "--post-size": "16px",
  "--post-leading": "1.75",
  "--post-text": "var(--foreground)",
  "--post-bg": "var(--background)",
  "--post-measure": "680px",
  "--post-gap": "20px",
  "--post-list-gap": "8px",
  "--post-item-gap": "6px",
  "--post-heading-weight": "600",
  "--post-heading-leading": "1.3",
  "--post-heading-color": "var(--foreground)",
  "--post-h2-size": "24px",
  "--post-h3-size": "18px",
  "--post-h2-space": "28px",
  "--post-h3-space": "16px",
  "--post-marker": "var(--muted-foreground)",
  "--post-caption": "var(--muted-foreground)",
} as CSSProperties

const docCss = `
.doc-surface { color: var(--post-text); background: var(--post-bg); }
.doc-surface .post-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) min(var(--post-measure), 100%) minmax(0, 1fr);
}
.doc-surface .post-article { grid-column: 2; min-width: 0; }
.doc-surface .post-body {
  font-family: var(--post-font);
  font-size: var(--post-size);
  line-height: var(--post-leading);
}
.doc-surface .post-body > * + * { margin-top: var(--post-gap); }
.doc-surface .post-body strong { font-weight: 600; }
.doc-surface .post-body h2,
.doc-surface .post-body h3 {
  font-weight: var(--post-heading-weight);
  line-height: var(--post-heading-leading);
  color: var(--post-heading-color);
  scroll-margin-top: 88px;
}
.doc-surface .post-body h2 { font-size: var(--post-h2-size); padding-top: var(--post-h2-space); letter-spacing: -0.02em; }
.doc-surface .post-body h3 { font-size: var(--post-h3-size); padding-top: var(--post-h3-space); letter-spacing: -0.01em; }
.doc-surface .post-body h4 { font-weight: 600; color: var(--post-heading-color); scroll-margin-top: 88px; }
.doc-surface .post-body h2:first-child, .doc-surface .post-body h3:first-child { padding-top: 0; }
.doc-surface .post-body ul { list-style: disc; margin-left: 1.25rem; }
.doc-surface .post-body ol { list-style: decimal; margin-left: 2rem; }
.doc-surface .post-body li { padding-left: 4px; }
.doc-surface .post-body li::marker { color: var(--post-marker); }
.doc-surface .post-body li + li,
.doc-surface .post-body li > ul,
.doc-surface .post-body li > ol,
.doc-surface .post-body li > p + p { margin-top: var(--post-item-gap); }
.doc-surface .post-body > p + ul,
.doc-surface .post-body > p + ol { margin-top: var(--post-list-gap); }
.doc-surface .post-body a {
  color: var(--foreground);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--foreground) 30%, transparent);
  text-underline-offset: 3px;
}
.doc-surface .post-body a:hover { text-decoration-color: var(--foreground); }
.doc-surface .post-body .not-prose a { text-decoration: none; }
.doc-surface .post-body .not-prose a:hover { text-decoration: underline; }
.doc-surface .post-body .not-prose ul,
.doc-surface .post-body .not-prose ol { list-style: none; margin-left: 0; }
.doc-surface .post-body .not-prose li { padding-left: 0; }
.doc-surface .post-body .not-prose li + li { margin-top: 0; }
.doc-surface .post-body code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--muted);
}
.doc-surface .post-body pre {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--muted);
}
.doc-surface .post-body pre code {
  font-size: 14px; line-height: 1.6; padding: 0; background: none;
}
.doc-surface .post-body blockquote {
  border-left: 2px solid var(--border);
  color: var(--muted-foreground);
  margin-left: 1rem;
  padding: 0.1rem 0 0.1rem 1.25rem;
}
.doc-surface .post-body hr { border: 0; border-top: 1px solid var(--border); }
.doc-surface .post-body .post-table {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.doc-surface .post-body .post-table > table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  line-height: 1.55;
  text-align: left;
}
.doc-surface .post-body .post-table > table th {
  background: color-mix(in srgb, var(--muted) 60%, transparent);
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
}
.doc-surface .post-body .post-table > table td {
  border-top: 1px solid var(--border);
  color: color-mix(in srgb, var(--foreground) 72%, transparent);
  padding: 10px 16px;
  vertical-align: top;
}
.doc-surface .post-body .post-table > table td:first-child { color: var(--foreground); }
.doc-surface .post-body .post-table > table td:first-child:has(> code) {
  width: 0;
  white-space: nowrap;
}
.doc-surface .post-body section[data-footnotes] {
  margin-top: 40px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--post-caption);
}
.doc-surface .post-body section[data-footnotes] h2 { display: none; }
/*
 * Math keeps KaTeX's own 1.21em, inline and display: a size set here would
 * also outrank .docs-token-param's 1em inside the body.
 */
.doc-surface .post-body .katex-display { overflow-x: auto; overflow-y: hidden; margin: 2.2rem 0; }

/*
 * Breakout: tables and diagrams widen past the text column at lg+, centred
 * on it. A diagram wider than its breakout shrinks to fit down to 3/4 of
 * its size (12px labels), then scrolls.
 */
@media (min-width: 1024px) {
  .doc-surface .post-layout { container: doc-layout / inline-size; }
  .doc-surface .post-body [data-breakout] {
    --post-breakout-w: min(1280px, calc(100cqw - 48px));
    width: var(--post-breakout-w);
    margin-inline: calc((100% - var(--post-breakout-w)) / 2);
  }
  .doc-surface .docs-mermaid svg {
    flex: 0 1 auto;
    width: var(--diagram-w, 100%);
    min-width: calc(var(--diagram-w, 0px) * 0.75);
  }
}

/*
 * At xl the rail is a column as wide as the sidebar, at the page's right
 * edge, so the text column centres between the two. The column is there
 * on every page, rail or not, so the text doesn't move between pages.
 */
.doc-surface .doc-rail { display: none; }
@media (min-width: 1280px) {
  .doc-surface .doc-rail {
    display: block;
    flex: none;
    width: var(--sidebar-width, 14.58rem);
    padding: 3.5rem 1rem 0 0;
  }
  .doc-surface .doc-toc {
    --doc-toc-top: calc(var(--header-height, 3rem) + 3.5rem);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: var(--doc-toc-top);
    max-height: calc(100svh - var(--doc-toc-top) - 24px);
  }
}

.doc-surface .docs-mermaid {
  display: flex;
  justify-content: safe center;
  overflow-x: auto;
  padding: 1.25rem 0;
  font-family: var(--font-sans);
}
.doc-surface .docs-mermaid svg { flex: none; height: auto; }
.doc-surface .docs-mermaid svg[style*="max-width"] { flex: 0 1 auto; }
.doc-surface .docs-mermaid-loading { min-height: 240px; }

.doc-surface .post-body .docs-bars { display: flex; flex-direction: column; gap: 14px; list-style: none; margin: 0; }
.doc-surface .post-body .docs-bars li { padding: 0; margin: 0; }

.doc-surface .post-body details.doc-proof > summary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted-foreground);
}
.doc-surface .post-body details.doc-proof > summary::-webkit-details-marker { display: none; }
.doc-surface .post-body details.doc-proof > summary::before {
  content: "";
  border-left: 5px solid currentColor;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transition: transform 120ms;
}
.doc-surface .post-body details.doc-proof[open] > summary::before { transform: rotate(90deg); }
.doc-surface .post-body details.doc-proof > summary:hover { color: var(--foreground); }
.doc-surface .post-body .doc-proof-body {
  margin-top: 12px;
  border-left: 2px solid var(--border);
  padding-left: 1.25rem;
}
.doc-surface .post-body .doc-proof-body > * + * { margin-top: var(--post-gap); }
.doc-surface .post-body .doc-proof-body .katex-display { margin: 1.4rem 0; }
`

/* Which layer the Lean proves: the statement over abstract components, or
   its instance for the deployed construction as well. */
const proofStatus: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  instantiated: { label: "Proved and instantiated", variant: "default" },
  abstract: { label: "Proved for the abstract scheme", variant: "secondary" },
  pending: { label: "Lean proof pending", variant: "outline" },
}

function codeText(code: ElementContent | undefined) {
  return code?.type === "element"
    ? code.children.map((child) => (child.type === "text" ? child.value : "")).join("")
    : ""
}

function isExternalHref(href?: string) {
  return Boolean(href && /^https?:\/\//.test(href))
}

const tableSrcPrefix = "/tables/"
const graphSrcPrefix = "/graphs/"
const circuitHrefPrefix = "/circuits/"
const programSrcPrefix = "/programs/"

const markdownComponents: Components = {
  a({ node, href, children, ...props }) {
    void node
    if (href?.startsWith("/assumptions/")) {
      return <AssumptionToken citation={{ id: href.slice("/assumptions/".length) }} />
    }
    if (href?.startsWith(circuitHrefPrefix)) {
      return <CircuitLink circuit={decodeURIComponent(href.slice(circuitHrefPrefix.length))}>{children}</CircuitLink>
    }
    if (href?.startsWith("/") && !href.startsWith("//")) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      )
    }
    return (
      <a
        href={href}
        rel={isExternalHref(href) ? "noopener noreferrer" : undefined}
        target={isExternalHref(href) ? "_blank" : undefined}
        {...props}
      >
        {children}
      </a>
    )
  },
  // Unwrap paragraphs whose only child is an embed so the output is valid HTML.
  p({ node, children }) {
    const meaningful = node?.children.filter(
      (child) => !(child.type === "text" && !child.value.trim())
    )
    const only = meaningful?.length === 1 ? meaningful[0] : null
    if (only && only.type === "element" && only.tagName === "img") {
      return <>{children}</>
    }
    return <p>{children}</p>
  },
  img({ src, alt }) {
    if (typeof src === "string" && src.startsWith(graphSrcPrefix)) {
      return (
        <div data-breakout="">
          <GraphEmbed id={src.slice(graphSrcPrefix.length)} />
        </div>
      )
    }
    if (typeof src === "string" && src.startsWith(programSrcPrefix)) {
      const [id = "", fragment = ""] = src.slice(programSrcPrefix.length).split("#")
      return <ProgramEmbed id={id} phases={fragment ? fragment.split(",") : []} />
    }
    if (typeof src === "string" && src.startsWith(tableSrcPrefix)) {
      const [id, query] = src.slice(tableSrcPrefix.length).split("?")
      const Table = id ? tableComponents[id] : undefined
      if (!Table) throw new Error(`unknown table embed ${src}`)
      const family = new URLSearchParams(query).get("family") ?? undefined
      return <Table family={family} />
    }
    return (
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt ?? ""} src={typeof src === "string" ? src : undefined} />
        <figcaption>{alt}</figcaption>
      </figure>
    )
  },
  pre({ node, children }) {
    const code = node?.children[0]
    const className =
      code?.type === "element" ? code.properties?.className : undefined
    if (Array.isArray(className) && className.includes("language-mermaid")) {
      return (
        <div data-breakout="">
          <MermaidDiagram chart={codeText(code).trim()} />
        </div>
      )
    }
    if (Array.isArray(className) && className.includes("language-proof")) {
      const meta = code?.type === "element" ? (code.data as { meta?: string } | undefined)?.meta?.trim() : undefined
      const status = meta ? proofStatus[meta] : undefined
      if (meta && !status) throw new Error(`unknown proof status "${meta}"`)
      return (
        <details className="doc-proof">
          <summary>
            Proof
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
          </summary>
          <div className="doc-proof-body">
            <ReactMarkdown
              components={markdownComponents}
              rehypePlugins={[[rehypeKatex, { strict: "warn", throwOnError: true }]]}
              remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
            >
              {codeText(code)}
            </ReactMarkdown>
          </div>
        </details>
      )
    }
    return <pre>{children}</pre>
  },
  table({ node, ...props }) {
    void node
    return (
      <div className="post-table">
        <table {...props} />
      </div>
    )
  },
}

type HeadingPart = { text: string } | { tex: string }
type Heading = { id: string; level: 2 | 3; parts: HeadingPart[] }

function headingParts(nodes: ElementContent[]): HeadingPart[] {
  return nodes.flatMap((node): HeadingPart[] => {
    if (node.type === "text") return [{ text: node.value }]
    if (node.type !== "element") return []
    const className = node.properties.className
    if (Array.isArray(className) && className.includes("math-inline")) {
      const tex = node.children
        .map((child) => (child.type === "text" ? child.value : ""))
        .join("")
      return [{ tex }]
    }
    return headingParts(node.children)
  })
}

// The page's sections: the top-level h2s and h3s (footnotes' heading sits
// inside their section), read after rehype-slug ids them and before KaTeX.
function collectHeadings(into: Heading[]) {
  return (tree: Root) => {
    for (const node of tree.children) {
      if (node.type !== "element") continue
      if (node.tagName !== "h2" && node.tagName !== "h3") continue
      const id = node.properties.id
      if (typeof id !== "string") continue
      into.push({
        id,
        level: node.tagName === "h2" ? 2 : 3,
        parts: headingParts(node.children),
      })
    }
  }
}

function tocItems(headings: Heading[]): DocTocItem[] {
  let underH2 = false
  return headings.map(({ id, level, parts }) => {
    if (level === 2) underH2 = true
    const title = parts.map((part) => ("tex" in part ? part.tex : part.text)).join("")
    const label = parts.some((part) => "tex" in part)
      ? parts.map((part, i) =>
          "tex" in part ? (
            <span
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(part.tex, { output: "html" }),
              }}
              key={i}
            />
          ) : (
            part.text
          )
        )
      : title
    return { id, nested: level === 3 && underH2, label, title }
  })
}

export function DocBody({
  markdown,
  header,
  footer,
}: {
  markdown: string
  header?: ReactNode
  footer?: ReactNode
}) {
  const headings: Heading[] = []
  // Called as a function so the headings are collected before the rail
  // renders.
  const body = ReactMarkdown({
    children: markdown,
    components: markdownComponents,
    rehypePlugins: [
      rehypeSlug,
      [collectHeadings, headings],
      [rehypeKatex, { strict: "warn", throwOnError: true }],
    ],
    remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: true }]],
  })
  const toc = headings.some((heading) => heading.level === 2)
    ? tocItems(headings)
    : null

  return (
    <div className="doc-surface flex min-h-full" style={themeVars}>
      <style>{docCss}</style>
      <div className="mx-auto w-full min-w-0 max-w-[1448px] px-5 py-12 sm:px-8 lg:px-10 lg:py-14">
        <div className="post-layout">
          <article className="post-article">
            {header}
            <div className="post-body">{body}</div>
            {footer}
          </article>
        </div>
      </div>
      <div className="doc-rail">{toc ? <DocToc items={toc} /> : null}</div>
    </div>
  )
}
