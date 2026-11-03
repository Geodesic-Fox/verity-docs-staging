"use client"

import katex from "katex"
import { ArrowUpRight, User } from "lucide-react"
import Link from "next/link"
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import {
  isGroup,
  type Doc,
  type Group,
  type Leaf,
  type Param,
  type Part,
  type Protocol,
  type Side,
  type Step,
} from "@/components/programs/types"
import type { ProgramValues } from "@/components/programs/values"

const leaves = (s: Step): Leaf[] => (isGroup(s) ? s.steps.flatMap(leaves) : [s])
const sends = (l: Leaf) => l.to !== undefined && l.to !== l.actor
const tint = (color: string, amount: number) =>
  `color-mix(in srgb, ${color} ${amount * 100}%, transparent)`

type Token = {
  text: string
  kind: "fn" | "var" | "keyword" | "str" | "comment" | "space" | "punct"
}

const KEYWORDS = new Set(["for", "in", "while", "if", "else", "return", "def", "range"])

/* A dotted name is one function when the protocol defines it whole, such as
   an interface's `Com.commit`; otherwise each part is its own name. */
function tokenize(code: string, functions: Protocol["functions"]): Token[] {
  const out: Token[] = []
  const name = (text: string) =>
    out.push({
      text,
      kind: KEYWORDS.has(text)
        ? "keyword"
        : Object.hasOwn(functions, text)
          ? "fn"
          : "var",
    })
  for (const m of code.matchAll(
    /(#.*$)|("[^"]*")|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)|(\s+)|(.)/g
  )) {
    const [text, comment, str, ident, space] = m
    if (comment) out.push({ text, kind: "comment" })
    else if (str) out.push({ text, kind: "str" })
    else if (ident && !Object.hasOwn(functions, ident) && ident.includes("."))
      ident.split(".").forEach((part, i) => {
        if (i > 0) out.push({ text: ".", kind: "punct" })
        name(part)
      })
    else if (ident) name(ident)
    else if (space) out.push({ text, kind: "space" })
    else out.push({ text, kind: "punct" })
  }
  return out
}

const uncommented = (code: string) => code.replace(/\s*#.*$/, "")

function assignment(code: string) {
  const m = uncommented(code).match(/^\s*(\w+(?:\s*,\s*\w+)*)\s*=\s*(.+)$/)
  return m ? { lhs: m[1]!.split(",").map((s) => s.trim()), rhs: m[2]! } : null
}

/* Everything the figure reads off its protocol. */
function modelOf(p: Protocol) {
  const byId = new Map(p.actors.map((a) => [a.id, a]))
  const actor = (id: string) => byId.get(id)!
  const tokens = (code: string) => tokenize(code, p.functions)
  const sideOf = (id: string): Side => actor(id).side
  const sides = (["developer", "auditor"] as const).map((side) => ({
    side,
    label: side === "developer" ? "Developer" : "Auditor",
    actors: p.actors.filter((a) => a.side === side).map((a) => a.id),
  }))
  /* Lanes run side by side, the developer's first, so the boundary falls
     between two neighbouring lanes. */
  const order = sides.flatMap((s) => s.actors)
  const all = p.run.flatMap(leaves)

  /* A value's maker is the actor that computes it, or, for a value from
     outside the run, the actor that first uses it. A public parameter has no
     maker: both sides hold it. A commitment, a value a function returning
     one makes, remembers the value it commits to. */
  const shared = new Set(
    (p.params ?? []).flatMap((param) =>
      tokens(param.code)
        .filter((t) => t.kind === "var")
        .map((t) => t.text)
    )
  )
  const maker = new Map<string, string>()
  const committed = new Map<string, string>()
  for (const leaf of all) {
    const a = assignment(leaf.code)
    const own = (name: string) => {
      if (!maker.has(name) && !shared.has(name)) maker.set(name, leaf.actor)
    }
    for (const name of a?.lhs ?? []) own(name)
    for (const t of tokens(leaf.code)) if (t.kind === "var") own(t.text)
    const rhs = a ? tokens(a.rhs) : []
    const value = rhs.find((t) => t.kind === "var")
    const fn = rhs.find((t) => t.kind === "fn")
    if (a && fn && p.functions[fn.text]?.returns === "commitment" && value)
      committed.set(a.lhs[0]!, value.text)
  }

  return {
    protocol: p,
    actors: p.actors,
    actor,
    tokens,
    sideOf,
    crosses: (l: Leaf) => sends(l) && sideOf(l.actor) !== sideOf(l.to!),
    sides,
    order,
    lane: (id: string) => order.indexOf(id),
    boundaryLane: sides[0]!.actors.length,
    all,
    maker,
    committed,
    /* Whether a name is a value of the run, so prose can trace it. */
    known: (name: string) => maker.has(name) || shared.has(name),
    actorsIn: (s: Step) => {
      const ids = new Set(leaves(s).flatMap((l) => [l.actor, l.to ?? l.actor]))
      return p.actors.filter((a) => ids.has(a.id)).map((a) => a.id)
    },
  }
}
type Model = ReturnType<typeof modelOf>

/* A public parameter's strip: it is neither side's. */
const PUBLIC_INK = "var(--muted-foreground)"

type Lanes = "columns" | "gutter" | "off"
type Boundary = "none" | "gate" | "bands" | "strip" | "sides"

/* With Two sides, the space between the developer's column and the auditor's. */
const SIDE_GAP = 44
/* With Gutter strip, how far left of the content the strip runs, the same
   for every line whatever its section's indent. With Crossings on, a
   crossing line's strip turns from the sender's side to the receiver's
   halfway down. */
const STRIP_INSET = 9

type Ctx = {
  m: Model
  v: ProgramValues
  lanes: Lanes
  boundary: Boundary
  /* The listing laid out in a developer column and an auditor column. */
  sides: boolean
  /* The listing in code blocks. */
  blocks: boolean
  /* A line's left padding: none for a bare line, so it starts on the title's
     edge, and some for a line drawn on a band, a tint or a rail. */
  lineInset: number
  sideColor: (s: Side) => string
  /* An actor's line, from the left of the unindented content. */
  laneX: (i: number) => number
  color: (id: string) => string
  focus: string | null
  setFocus: (id: string | null) => void
  hoverVar: string | null
  setHoverVar: (name: string | null) => void
  selected: string | null
  select: (fn: string | null) => void
}
const ProgramContext = createContext<Ctx | null>(null)
const useProgram = () => useContext(ProgramContext)!

/* How far a section's body is indented, so marks in the gutter stay on
   their lines. */
const InsetContext = createContext(0)

/* Whether a line already sits in a code block, so it opens no block of its own. */
const BlockContext = createContext(false)

/* The margin left of the content, outside the page's edge: the gutter strip
   and the first actor's legend badge hang in it, so the content lines up
   with the title. */
const EDGE = 28
const gutterWidth = (v: ProgramValues, m: Model) =>
  m.actors.length * v.lanes.gutterGap + 10

function columnsWidth(v: ProgramValues, m: Model) {
  const x = (i: number) => v.lanes.left + i * v.lanes.spacing
  const text = (code: string) => code.length * v.type.code * 0.6 + 12
  const last = m.actors.length - 1
  let w = x(last) + 60
  for (const l of m.all) {
    const a = x(m.lane(l.actor))
    const end =
      sends(l) && m.lane(l.to!) < m.lane(l.actor) ? a : a + 8 + text(l.code)
    w = Math.max(
      w,
      end,
      sends(l) ? x(m.lane(l.to!)) : 0,
      l.output ? x(last) + v.lanes.spacing / 2 + 80 : 0
    )
  }
  if (v.params.style === "lines")
    for (const p of m.protocol.params ?? [])
      w = Math.max(w, text(`${p.code}   # ${p.note}`))
  return Math.ceil(w + 16)
}

export function ProgramFigure({
  protocol,
  values: v,
  nav,
}: {
  protocol: Protocol
  values: ProgramValues
  /* Links above the title, on the page's left edge. */
  nav?: ReactNode
}) {
  const m = useMemo(() => modelOf(protocol), [protocol])
  const [focus, setFocus] = useState<string | null>(null)
  const [hoverVar, setHoverVar] = useState<string | null>(null)
  const [selected, select] = useState<string | null>(null)
  const sideColor = (s: Side) =>
    s === "developer" ? v.trust.developer : v.trust.auditor
  const color = (id: string) => {
    const a = m.actor(id)
    if (v.trust.palette === "two") return sideColor(a.side)
    return v.trust.palette === "actors" && a.colorKey
      ? v.colors[a.colorKey]
      : a.shade
  }
  const lanes = v.lanes.mode as Lanes
  const boundary = v.trust.boundary as Boundary
  const sides = lanes === "off" && boundary === "sides"
  const headings =
    v.headings.structure === "headings" || lanes !== "off" || sides
  const blocks = v.blocks.style !== "none" && lanes === "off" && headings
  const lineInset =
    !headings ||
    boundary === "bands" ||
    v.actors.tintRows ||
    v.actors.style === "rail"
      ? 10
      : 0
  const pad = lanes === "gutter" ? gutterWidth(v, m) : 0
  const laneX = (i: number) =>
    lanes === "gutter"
      ? -pad + i * v.lanes.gutterGap + v.lanes.gutterGap / 2
      : v.lanes.left + i * v.lanes.spacing
  const badges = useRef<HTMLDivElement>(null)
  /* Where each side's column starts, past a block's and a line's left padding. */
  const sideLeft = (s: Side) =>
    pad +
    (blocks ? v.blocks.padX : 0) +
    lineInset +
    (s === "auditor" ? v.trust.sideWidth + SIDE_GAP : 0)
  /* The page is one centered column, everything in it on one left edge.
     Columns and two sides widen it to fit their lines; past the screen's
     width the listing scrolls. */
  const measure: CSSProperties =
    lanes === "columns" || sides
      ? {
          width: "max-content",
          minWidth: `min(${v.layout.width}px, 100%)`,
          maxWidth: "100%",
        }
      : { maxWidth: v.layout.width }
  const legend = (s: Model["sides"][number]) => (
    <div className="flex items-center gap-1.5" key={s.side}>
      <span
        className="pr-1 text-[11px] font-semibold tracking-wide uppercase"
        style={{ color: sideColor(s.side) }}
      >
        {s.label}
      </span>
      {s.actors.map((id) => (
        <ActorBadge id={id} key={id} named />
      ))}
    </div>
  )
  return (
    <ProgramContext.Provider
      value={{
        m,
        v,
        lanes,
        boundary,
        sides,
        blocks,
        lineInset,
        sideColor,
        laneX,
        color,
        focus,
        setFocus,
        hoverVar,
        setHoverVar,
        selected,
        select,
      }}
    >
      <div
        className="mx-auto text-foreground"
        style={{ fontSize: v.type.label, ...measure }}
      >
        {nav}
        {protocol.title ? (
          <header className="pb-8" style={{ maxWidth: v.layout.width }}>
            <h1
              className="font-bold tracking-tight"
              style={{ fontSize: v.headings.title, lineHeight: 1.2 }}
            >
              {protocol.title}
            </h1>
            <p
              className="pt-3 text-foreground/70"
              style={{ fontSize: v.type.body, lineHeight: 1.65 }}
            >
              <Inline text={protocol.intro} />
            </p>
          </header>
        ) : null}
        {(lanes !== "off" || sides) && (
          <div
            className="sticky top-0 z-20 overflow-hidden bg-background/90 backdrop-blur"
            style={{ marginLeft: -EDGE, paddingLeft: EDGE }}
          >
            <div className="border-b border-border/60 py-3">
              {lanes === "columns" ? (
                <div className="relative h-5" ref={badges}>
                  {m.order.map((id, i) => (
                    <span
                      className="absolute top-0 -translate-x-1/2"
                      key={id}
                      style={{ left: pad + laneX(i) }}
                    >
                      <ActorBadge id={id} named />
                    </span>
                  ))}
                </div>
              ) : lanes === "gutter" ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.order.map((id) => (
                    <ActorBadge id={id} key={id} named />
                  ))}
                </div>
              ) : (
                <div className="relative h-5" ref={badges}>
                  {m.sides.map((s) => (
                    <div
                      className="absolute top-0"
                      key={s.side}
                      style={{ left: sideLeft(s.side) }}
                    >
                      {legend(s)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div
          className={cn("overflow-x-auto", protocol.title && "pt-6")}
          onScroll={(e) => {
            if (badges.current)
              badges.current.style.transform = `translateX(${-e.currentTarget.scrollLeft}px)`
          }}
          style={{ marginLeft: -EDGE, paddingLeft: EDGE }}
        >
          <div
            className="relative flex w-max min-w-full flex-col"
            style={{
              gap: headings ? 0 : v.layout.cardGap,
              paddingLeft: pad,
              minWidth:
                lanes === "columns"
                  ? `max(100%, ${columnsWidth(v, m)}px)`
                  : undefined,
            }}
          >
            {sides && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 z-10 border-l border-dashed border-foreground/20"
                style={{ left: sideLeft("auditor") - SIDE_GAP / 2 }}
              />
            )}
            {lanes === "columns" && boundary !== "none" && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/20"
                style={{
                  left:
                    pad +
                    (laneX(m.boundaryLane - 1) + laneX(m.boundaryLane)) / 2,
                }}
              />
            )}
            {lanes !== "off" &&
              m.order.map((id, i) => (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0"
                  key={id}
                  style={{
                    left: pad + laneX(i) - (lanes === "gutter" ? 0.75 : 0.5),
                    width: lanes === "gutter" ? 1.5 : 1,
                    background:
                      v.lanes.lines === "actor"
                        ? tint(color(id), v.lanes.lineStrength)
                        : tint("var(--muted-foreground)", v.lanes.lineStrength),
                  }}
                />
              ))}
            {protocol.params && <Params params={protocol.params} />}
            {protocol.before?.map((d, i) => (
              <DocSection
                doc={d}
                first={i === 0 && !protocol.params}
                key={d.title}
              />
            ))}
            {protocol.run.map((s, i) => (
              <StepView
                depth={0}
                first={i === 0 && !protocol.params && !protocol.before?.length}
                key={i}
                loops={0}
                number={`${i + 1}`}
                step={s}
              />
            ))}
            {protocol.after?.map((d) => (
              <DocSection doc={d} key={d.title} />
            ))}
          </div>
        </div>
      </div>
      <FunctionPanel />
    </ProgramContext.Provider>
  )
}

/* An actor's badge. In the legend and the function sheet it always carries
   the name, so the icon-only style has a key to read against. */
function ActorBadge({ id, named }: { id: string; named?: boolean }) {
  const { m, v, color, setFocus } = useProgram()
  const a = m.actor(id)
  const c = color(id)
  const style = named && v.actors.style === "icon" ? "badge" : v.actors.style
  const solid =
    style === "solid" || (v.trust.badges === "fill" && a.side === "developer")
  const pill = style === "badge" || solid
  const ink = solid
    ? "text-white"
    : "text-(--ink) dark:text-[color-mix(in_oklab,var(--ink)_60%,var(--foreground))]"
  const Icon = v.trust.icons ? a.icon : a.person ? User : null
  if (style === "icon") {
    const Glyph = a.icon
    return (
      <span
        aria-label={a.name}
        className={cn(
          "inline-flex size-5 cursor-default items-center justify-center rounded-md",
          ink
        )}
        onMouseEnter={() => setFocus(id)}
        onMouseLeave={() => setFocus(null)}
        style={
          {
            "--ink": c,
            background: solid ? c : tint(c, 0.1),
          } as CSSProperties
        }
        title={a.name}
      >
        <Glyph className="size-3.5" strokeWidth={2} />
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex cursor-default items-center gap-1.5 font-medium whitespace-nowrap",
        pill && "rounded-md px-1.5 leading-5",
        ink
      )}
      onMouseEnter={() => setFocus(id)}
      onMouseLeave={() => setFocus(null)}
      style={
        {
          "--ink": c,
          fontSize: v.type.actor,
          background: solid ? c : style === "badge" ? tint(c, 0.1) : undefined,
        } as CSSProperties
      }
    >
      {Icon ? (
        <Icon className="size-[1em] shrink-0" strokeWidth={2.25} />
      ) : (
        !pill && (
          <span className="size-1.5 rounded-full" style={{ background: c }} />
        )
      )}
      {a.name}
    </span>
  )
}

type StepProps = {
  step: Step
  depth: number
  loops: number
  prev?: Step
  number: string
  first?: boolean
}

function StepView(props: StepProps) {
  const { v } = useProgram()
  if (!props.step.gap || props.first) return <StepBody {...props} />
  return (
    <>
      <div aria-hidden style={{ height: v.layout.rowHeight }} />
      <StepBody {...props} />
    </>
  )
}

function StepBody({ step, depth, loops, prev, number, first }: StepProps) {
  const { m, v, lanes, sides } = useProgram()
  const inBlock = useContext(BlockContext)
  if (!isGroup(step))
    return lanes === "columns" ? (
      <ColumnLine leaf={step} />
    ) : sides ? (
      <SidesLine leaf={step} loops={loops} prev={prev} />
    ) : (
      <Line leaf={step} loops={loops} prev={prev} />
    )
  const children = (
    <Children
      depth={depth}
      group={step}
      loops={loops}
      number={number}
      prev={step.label ? undefined : prev}
    />
  )
  if (step.builds)
    return (
      <>
        <GroupComment first={first} loops={loops}>
          <span
            className="font-mono text-muted-foreground/70"
            style={{ fontSize: v.type.code }}
          >
            {"#\u00a0"}
          </span>
          <Code code={step.builds} muted />
        </GroupComment>
        {children}
      </>
    )
  if (!step.label) return children
  if (inBlock)
    return (
      <>
        <GroupComment first={first} loops={loops}>
          <Code code={`# ${step.label}`} />
        </GroupComment>
        {children}
      </>
    )
  return v.headings.structure === "headings" || lanes !== "off" || sides ? (
    <Section
      actors={m.actorsIn(step)}
      depth={depth}
      first={first}
      label={step.label}
      number={number}
    >
      {children}
    </Section>
  ) : (
    <GroupCard actors={m.actorsIn(step)} depth={depth} label={step.label}>
      {children}
    </GroupCard>
  )
}

/* The public parameters: what both sides hold before the run, each its own
   copy. As a table, or as code lines: no actor runs them, so their actor
   column stays empty, and their comments line up in one column. */
function Params({ params }: { params: Param[] }) {
  const { v, lanes, sides } = useProgram()
  const table = v.params.style === "table"
  const width = Math.max(...params.map((p) => p.code.length)) + 3
  const body = table ? (
    <ParamTable params={params} />
  ) : (
    <CodeBlock>
      {params.map((p) => (
        <ParamLine key={p.code} param={p} width={width} />
      ))}
    </CodeBlock>
  )
  return v.headings.structure === "headings" || lanes !== "off" || sides ? (
    <Section
      actors={[]}
      depth={0}
      first
      label="Public parameters"
      number="0"
      raw={table}
    >
      {body}
    </Section>
  ) : (
    <GroupCard actors={[]} depth={0} label="Public parameters">
      <div style={{ maxWidth: v.layout.width - CARD_INSET }}>{body}</div>
    </GroupCard>
  )
}

/* A card's padding and border, which prose inside it gives up so the card
   keeps to the page's measure. */
const CARD_INSET = 14

/* The public parameters as a docs table, each one's code beside what it is. */
function ParamTable({ params }: { params: Param[] }) {
  return (
    <DocTable
      columns={["Parameter", "Description"]}
      kept={params.map((p) => p.kept === true)}
      rows={params.map((p) => [`\`${p.code}\``, p.note])}
    />
  )
}

/* A prose section, under a heading like a phase's. Its parts cover the lanes
   and the boundary, which are about the run. */
function DocSection({ doc, first }: { doc: Doc; first?: boolean }) {
  const { v, lanes, sides } = useProgram()
  const headed = v.headings.structure === "headings" || lanes !== "off" || sides
  const body = (
    <div
      className="relative z-10 flex flex-col gap-3 bg-background"
      style={{ maxWidth: v.layout.width - (headed ? 0 : CARD_INSET) }}
    >
      {doc.parts.map((part, i) => (
        <DocPart key={i} part={part} />
      ))}
    </div>
  )
  return headed ? (
    <Section
      actors={[]}
      depth={0}
      first={first}
      label={doc.title}
      number=""
      raw
    >
      {body}
    </Section>
  ) : (
    <GroupCard actors={[]} depth={0} label={doc.title}>
      {body}
    </GroupCard>
  )
}

function DocPart({ part }: { part: Part }) {
  const { v } = useProgram()
  if (typeof part === "string")
    return (
      <p
        className="text-foreground/80"
        style={{ fontSize: v.type.body, lineHeight: 1.65 }}
      >
        <Inline text={part} />
      </p>
    )
  if ("tex" in part)
    return (
      <div
        className="overflow-x-auto py-1 text-foreground"
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(part.tex, {
            displayMode: true,
            throwOnError: false,
          }),
        }}
      />
    )
  return <DocTable {...part.table} />
}

/* A docs table. A first column of names only stays on one line; a status
   column's cells are pills. A kept row is faded, as a kept line is. */
function DocTable({
  columns,
  rows,
  status,
  kept,
}: {
  columns: string[]
  rows: string[][]
  status?: number
  kept?: boolean[]
}) {
  const { v } = useProgram()
  const names = rows.every((r) => /^(`[^`]+`[,\s]*)+$/.test(r[0] ?? ""))
  return (
    <div
      className="relative z-10 my-2 overflow-hidden rounded-lg border border-border bg-background"
      style={{ maxWidth: v.layout.width }}
    >
      <table className="w-full border-collapse text-left">
        <thead className="bg-muted/60 text-[13px] text-muted-foreground">
          <tr>
            {columns.map((c, j) => (
              <th
                className={cn(
                  "px-4 py-2 font-medium",
                  ((j === 0 && names) || j === status) &&
                    "w-0 whitespace-nowrap"
                )}
                key={c}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              className="border-t border-border"
              key={i}
              style={{ opacity: kept?.[i] ? KEPT : 1 }}
            >
              {row.map((cell, j) => (
                <td
                  className={cn(
                    "px-4 py-2.5 align-top",
                    j === 0 && names && "whitespace-nowrap",
                    j === 0 ? "text-foreground" : "text-foreground/70"
                  )}
                  key={j}
                  style={{ fontSize: v.type.body - 2, lineHeight: 1.55 }}
                >
                  {j === status ? (
                    <StatusPill status={cell} />
                  ) : (
                    <Inline text={cell} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STATUS: Record<string, string> = {
  proved:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  assumed:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  "intended to prove":
    "border-dashed border-sky-300 bg-background text-sky-800 dark:border-sky-800 dark:text-sky-300",
  trusted: "border-border bg-muted text-foreground/80",
  empirical:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  "not claimed":
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 text-[12px] leading-5 font-medium whitespace-nowrap",
        STATUS[status.toLowerCase()] ?? STATUS.trusted
      )}
    >
      {status}
    </span>
  )
}

/* Prose with `code`, $math$ and [links](href). Code that names a function
   or a value of the run is the run's code, so it opens and traces as there. */
function Inline({ text }: { text: string }) {
  const { m, v } = useProgram()
  const out: ReactNode[] = []
  let at = 0
  for (const match of text.matchAll(
    /`([^`]+)`|\$([^$]+)\$|\[([^\]]+)\]\(([^)]+)\)/g
  )) {
    const [whole, code, tex, label, href] = match
    const before = text.slice(at, match.index)
    at = match.index + whole.length
    const key = match.index
    if (code !== undefined) {
      /* A chip's functions are buttons, which a line may break around, so
         the brackets and punctuation beside it stay on its line. */
      const open = /[([]$/.exec(before)?.[0] ?? ""
      const close = /^[)\].,:;]+/.exec(text.slice(at))?.[0] ?? ""
      at += close.length
      out.push(before.slice(0, before.length - open.length))
      const live = m
        .tokens(code)
        .some((t) => t.kind === "fn" || (t.kind === "var" && m.known(t.text)))
      out.push(
        <span className="whitespace-nowrap" key={key}>
          {open}
          <span className="rounded-md border border-border bg-muted/60 px-[3px] py-px">
            {live ? (
              <Code code={code} />
            ) : (
              <span
                className="font-mono text-foreground"
                style={{ fontSize: v.type.code }}
              >
                {code}
              </span>
            )}
          </span>
          {close}
        </span>
      )
      continue
    }
    out.push(before)
    if (tex !== undefined)
      out.push(
        <span
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(tex, { throwOnError: false }),
          }}
          key={key}
        />
      )
    else
      out.push(
        <Link
          className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
          href={href!}
          key={key}
        >
          {label}
        </Link>
      )
  }
  out.push(text.slice(at))
  return <>{out}</>
}

/* How faded a line the construction keeps from the abstract protocol is. */
const KEPT = 0.45

function ParamLine({ param, width }: { param: Param; width: number }) {
  const { m, v, lanes, boundary, lineInset } = useProgram()
  const offset = useContext(InsetContext)
  const onLines = lanes === "columns" && "rounded-sm bg-background px-0.5"
  return (
    <div
      className="relative flex items-center pr-2 whitespace-nowrap"
      style={{
        height: v.layout.rowHeight,
        paddingLeft: lineInset,
        opacity: param.kept ? KEPT : 1,
      }}
    >
      {boundary === "strip" && lanes === "off" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0"
          style={{
            left: -offset - STRIP_INSET,
            width: v.trust.strip,
            background: PUBLIC_INK,
          }}
        />
      )}
      {lanes !== "columns" && (
        <span
          className="flex shrink-0 items-center"
          style={{ width: nameWidth(v, m), marginRight: v.layout.nameGap }}
        />
      )}
      <span
        className="shrink-0 font-mono"
        style={{ fontSize: v.type.code, width: `${width}ch` }}
      >
        <span className={cn(onLines)}>
          <Code code={param.code} />
        </span>
      </span>
      <span className={cn(onLines)}>
        <Code code={`# ${param.note}`} />
      </span>
    </div>
  )
}

/* The line a step follows in reading order, so an actor's name shows once
   per run of its lines across a loop or branch header; a subsection starts
   a new run. */
const lineBefore = (s: Step): Leaf | undefined =>
  !isGroup(s)
    ? s
    : s.label
      ? undefined
      : s.steps.map(lineBefore).filter((l) => l !== undefined).at(-1)

/* A group's children: its loop header, when it has one, then its steps,
   indented one level under it. Each subgroup is numbered among its sibling
   groups. With code blocks, each run of lines between subsections is one
   block, unless the group already sits in one. */
function Children({
  group,
  depth,
  loops,
  number,
  prev,
}: {
  group: Group
  depth: number
  loops: number
  number: string
  prev?: Step
}) {
  const { lanes, blocks } = useProgram()
  const inBlock = useContext(BlockContext)
  let n = 0
  const inner = group.loop ? loops + 1 : loops
  const steps = group.steps.map((s, i) => (
    <StepView
      depth={depth + 1}
      first={i === 0}
      key={i}
      loops={inner}
      number={isGroup(s) ? `${number}.${++n}` : number}
      prev={i === 0 ? prev : lineBefore(group.steps[i - 1]!)}
      step={s}
    />
  ))
  if (lanes === "columns" && group.loop)
    return (
      <>
        <LoopLine code={group.loop} kept={group.kept} loops={loops} />
        <div className="relative">
          <span
            aria-hidden
            className="absolute top-0 bottom-1 w-px bg-foreground/20"
            style={{ left: -10 - 6 * loops }}
          />
          {steps}
        </div>
      </>
    )
  const lines = group.loop
    ? [
        <LoopLine code={group.loop} kept={group.kept} key="loop" loops={loops} />,
        ...steps,
      ]
    : steps
  if (!blocks || inBlock) return <>{lines}</>
  const out: ReactNode[] = []
  let run: ReactNode[] = []
  const flush = () => {
    if (run.length)
      out.push(<CodeBlock key={`run-${out.length}`}>{run}</CodeBlock>)
    run = []
  }
  lines.forEach((line, i) => {
    const step = group.steps[group.loop ? i - 1 : i]
    if (step && isGroup(step) && step.label) {
      flush()
      out.push(line)
    } else run.push(line)
  })
  flush()
  return <>{out}</>
}

/* Pseudocode as a code block: no filename, no language, no copy button.
   Outline is Vercel's docs block, Fill Notion's, Rail a rule down the left.
   A line's strip runs down the block's inside left edge, and on a rail it is
   the rule. */
function CodeBlock({ children }: { children: ReactNode }) {
  const { v, blocks, boundary } = useProgram()
  const inBlock = useContext(BlockContext)
  if (!blocks || inBlock) return <>{children}</>
  const b = v.blocks
  const look: CSSProperties =
    b.style === "fill"
      ? { background: "var(--muted)", borderRadius: b.radius }
      : b.style === "rail"
        ? {
            borderStyle: "solid",
            borderColor: "var(--border)",
            borderWidth: boundary === "strip" ? 0 : "0 0 0 2px",
          }
        : {
            background: "color-mix(in oklab, var(--muted) 60%, var(--background))",
            borderStyle: "solid",
            borderColor: "var(--border)",
            borderWidth: 1,
            borderRadius: b.radius,
          }
  return (
    <div
      className="relative"
      style={{
        ...look,
        padding: `${b.padY}px ${b.padX}px`,
        margin: `${b.gap / 2}px 0`,
      }}
    >
      <BlockContext.Provider value>
        <InsetContext.Provider value={b.padX - STRIP_INSET}>
          {children}
        </InsetContext.Provider>
      </BlockContext.Provider>
    </div>
  )
}

/* A comment over a group's lines, after a blank half line: inside a block, a
   subsection's label, and in a construction, the abstract line its lines
   build. In columns it sits at the left over the lines, as a loop header does. */
function GroupComment({
  loops,
  first,
  children,
}: {
  loops: number
  first?: boolean
  children: ReactNode
}) {
  const { m, v, lanes, lineInset } = useProgram()
  const marginTop = first ? 0 : v.layout.rowHeight / 2
  if (lanes === "columns")
    return (
      <div
        className="relative flex items-center whitespace-nowrap"
        style={{ height: v.layout.rowHeight, marginTop }}
      >
        <span
          className="rounded-sm bg-background pr-1"
          style={{ marginLeft: 6 * loops }}
        >
          {children}
        </span>
      </div>
    )
  return (
    <div
      className="flex items-center pr-2 whitespace-nowrap"
      style={{ height: v.layout.rowHeight, paddingLeft: lineInset, marginTop }}
    >
      <span
        className="flex shrink-0 items-center"
        style={{ width: nameWidth(v, m), marginRight: v.layout.nameGap }}
      />
      <Indent loops={loops} />
      {children}
    </div>
  )
}

/* A group as a markdown section: a phase is a heading, a group inside it a
   subheading. A subsection's lines sit behind a rule or an indent, so a
   phase's own line after it reads as the phase's. */
function Section({
  label,
  actors,
  depth,
  number,
  first,
  raw,
  children,
}: {
  label: string
  actors: string[]
  depth: number
  number: string
  first?: boolean
  /* Its body isn't code, so it never goes in a block. */
  raw?: boolean
  children: ReactNode
}) {
  const { v, lanes, sides, blocks, color, focus } = useProgram()
  const offset = useContext(InsetContext)
  const h = v.headings
  const top = depth === 0
  const Heading = top ? "h2" : "h3"
  const size = top ? h.phase : h.section
  const dim = focus !== null && !actors.includes(focus)
  const inset = !top && h.body !== "flush" && lanes !== "columns" && !sides
  const rule = h.body === "rule"
  const onLines =
    (lanes === "columns" || sides) && "rounded-sm bg-background px-1 -mx-1"
  const body =
    blocks && !raw && top && v.blocks.split === "phase" ? (
      <CodeBlock>{children}</CodeBlock>
    ) : (
      children
    )

  return (
    <section
      className={cn(
        top && h.dividers && !first && "border-t border-border/60"
      )}
      style={{
        marginTop: first ? 0 : top ? h.phaseGap : h.sectionGap,
        paddingTop: top && h.dividers && !first ? h.phaseGap / 2 : 0,
      }}
    >
      <Heading
        className="flex items-center gap-2 transition-opacity duration-150"
        style={{
          fontSize: size,
          height: Math.round(size * 1.3),
          marginBottom: Math.round(size * 0.3),
          opacity: dim ? 0.35 : 1,
        }}
      >
        {h.numbers && number && (
          <span
            className={cn("font-medium text-muted-foreground/70 tabular-nums", onLines)}
          >
            {number}
          </span>
        )}
        <span className={cn("font-semibold tracking-tight", onLines)}>
          {label}
        </span>
        {h.actorDots && (
          <span className="flex items-center gap-1 pl-1">
            {actors.map((id) => (
              <span
                className="size-1.5 rounded-full"
                key={id}
                style={{ background: color(id) }}
              />
            ))}
          </span>
        )}
      </Heading>
      <div
        style={
          inset
            ? {
                marginLeft: h.bodyIndent,
                borderLeft: rule ? "1px solid var(--border)" : undefined,
              }
            : undefined
        }
      >
        <InsetContext.Provider
          value={inset ? offset + h.bodyIndent + (rule ? 1 : 0) : offset}
        >
          {body}
        </InsetContext.Provider>
      </div>
    </section>
  )
}

function GroupCard({
  label,
  actors,
  depth,
  children,
}: {
  label: string
  actors: string[]
  depth: number
  children: ReactNode
}) {
  const { v, color, focus } = useProgram()
  const dim = focus !== null && !actors.includes(focus)
  const card: CSSProperties =
    v.cards.style === "fill"
      ? { background: "color-mix(in oklab, var(--foreground) 2.5%, transparent)", borderRadius: v.cards.radius }
      : v.cards.style === "rail"
        ? { borderLeft: "1px solid var(--border)" }
        : {
            border: "1px solid var(--border)",
            borderRadius: v.cards.radius,
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }

  return (
    <div
      className={cn("transition-opacity duration-150", depth > 0 && "my-1.5")}
      style={{
        ...card,
        marginLeft: depth > 0 ? v.layout.indent : 0,
        opacity: dim ? 0.35 : 1,
      }}
    >
      <div className="flex h-9 items-center gap-1.5 px-2.5">
        <span className="font-medium">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          {actors.map((id) => (
            <span
              className="size-1.5 rounded-full"
              key={id}
              style={{ background: color(id) }}
            />
          ))}
        </span>
      </div>
      <div className="px-1.5 pb-1.5">{children}</div>
    </div>
  )
}

const nameWidth = (v: ProgramValues, m: Model) =>
  v.actors.style === "icon"
    ? 20
    : Math.ceil(
        Math.max(...m.actors.map((a) => a.name.length)) * v.type.actor * 0.58 +
          14
      )

/* One line: the actor running it, its code, and for a send, an arrow to the
   receiver. The name shows once per run of an actor's lines. */
function Line({
  leaf,
  loops,
  prev,
}: {
  leaf: Leaf
  loops: number
  prev?: Step
}) {
  const { m, v, lanes, boundary, lineInset, sideColor, color, focus } =
    useProgram()
  const { sideOf, crosses } = m
  const offset = useContext(InsetContext)
  const c = color(leaf.actor)
  const repeat =
    !v.actors.repeatNames &&
    prev !== undefined &&
    !isGroup(prev) &&
    prev.actor === leaf.actor
  const dim = focus !== null && focus !== leaf.actor && focus !== leaf.to
  const rail = v.actors.style === "rail"
  const bands = boundary === "bands"
  const strip = boundary === "strip" && lanes === "off"
  const from = sideColor(sideOf(leaf.actor))
  const band = (s: Side) => tint(sideColor(s), v.trust.band)
  const cross = v.trust.crossings && crosses(leaf)
  const background = bands
    ? cross
      ? `linear-gradient(90deg, ${band(sideOf(leaf.actor))} 35%, ${band(sideOf(leaf.to!))} 75%)`
      : band(sideOf(leaf.actor))
    : v.actors.tintRows
      ? tint(c, 0.06)
      : undefined
  return (
    <div
      className={cn(
        "relative flex items-center pr-2 whitespace-nowrap transition-opacity duration-150",
        !rail && !bands && "rounded-md"
      )}
      style={{
        height: v.layout.rowHeight,
        paddingLeft: lineInset,
        opacity: dim ? 0.25 : leaf.kept ? KEPT : 1,
        background,
        boxShadow: rail ? `inset 2px 0 0 ${c}` : undefined,
      }}
    >
      {strip && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0"
          style={{
            left: -offset - STRIP_INSET,
            width: v.trust.strip,
            background: cross
              ? `linear-gradient(${from} 50%, ${sideColor(sideOf(leaf.to!))} 50%)`
              : from,
          }}
        />
      )}
      {lanes === "gutter" && <GutterMark leaf={leaf} />}
      <span
        className="flex shrink-0 items-center"
        style={{ width: nameWidth(v, m), marginRight: v.layout.nameGap }}
      >
        {!repeat && <ActorBadge id={leaf.actor} />}
      </span>
      <Indent loops={loops} />
      <Code code={codeOf(leaf, v)} />
      {sends(leaf) && (
        <>
          <SendArrow cross={crosses(leaf)} />
          <ActorBadge id={leaf.to!} />
        </>
      )}
      {marksOutput(leaf, v) && (
        <>
          <SendArrow out />
          <OutputMark />
        </>
      )}
    </div>
  )
}

/* With Two sides, a line sits in its side's column. A send across the
   boundary runs its arrow through it, to the receiver at the head of the
   other column. */
function SidesLine({
  leaf,
  loops,
  prev,
}: {
  leaf: Leaf
  loops: number
  prev?: Step
}) {
  const { m, v, lineInset, focus } = useProgram()
  const { sideOf } = m
  const cross = m.crosses(leaf)
  const repeat =
    !cross &&
    !v.actors.repeatNames &&
    prev !== undefined &&
    !isGroup(prev) &&
    prev.actor === leaf.actor
  const dim = focus !== null && focus !== leaf.actor && focus !== leaf.to
  const own = (
    <>
      <span
        className="flex shrink-0 items-center"
        style={{ width: nameWidth(v, m), marginRight: v.layout.nameGap }}
      >
        {!repeat && <ActorBadge id={leaf.actor} />}
      </span>
      <Indent loops={loops} />
      <Code code={codeOf(leaf, v)} />
      {sends(leaf) && !cross && (
        <>
          <SendArrow />
          <ActorBadge id={leaf.to!} />
        </>
      )}
      {marksOutput(leaf, v) && (
        <>
          <SendArrow out />
          <OutputMark />
        </>
      )}
    </>
  )
  const wire = (
    <span className="h-0 min-w-3 flex-1 border-t-[1.5px] border-foreground" />
  )
  const head = (dir: 1 | -1) => (
    <svg className="shrink-0 overflow-visible" height={10} width={6}>
      <path
        d={dir === 1 ? "M0.5 1.5 L5.5 5 L0.5 8.5" : "M5.5 1.5 L0.5 5 L5.5 8.5"}
        fill="none"
        style={{ stroke: "var(--foreground)" }}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  )
  const right = cross && sideOf(leaf.actor) === "developer"
  const developer = !cross ? (
    sideOf(leaf.actor) === "developer" && own
  ) : right ? (
    <>
      {own}
      <span className="ml-2.5 flex flex-1 items-center">{wire}</span>
    </>
  ) : (
    <>
      <ActorBadge id={leaf.to!} />
      <span className="ml-1.5 flex flex-1 items-center">
        {head(-1)}
        {wire}
      </span>
    </>
  )
  const auditor = !cross ? (
    sideOf(leaf.actor) === "auditor" && own
  ) : right ? (
    <ActorBadge id={leaf.to!} />
  ) : (
    own
  )
  return (
    <div
      className="relative flex items-center pr-2 whitespace-nowrap transition-opacity duration-150"
      style={{
        height: v.layout.rowHeight,
        paddingLeft: lineInset,
        opacity: dim ? 0.25 : leaf.kept ? KEPT : 1,
      }}
    >
      <div
        className="flex shrink-0 items-center self-stretch"
        style={{ width: v.trust.sideWidth }}
      >
        {developer}
      </div>
      <div className="flex shrink-0 items-center" style={{ width: SIDE_GAP }}>
        {cross && (
          <>
            {wire}
            {right && <span className="pr-1">{head(1)}</span>}
          </>
        )}
      </div>
      <div className="flex items-center">{auditor}</div>
    </div>
  )
}

/* Python indentation: four columns of the code font per enclosing loop. */
function Indent({ loops }: { loops: number }) {
  const { v } = useProgram()
  return loops > 0 ? (
    <span
      className="shrink-0 font-mono"
      style={{ fontSize: v.type.code, width: `${4 * loops}ch` }}
    />
  ) : null
}

/* A loop header runs on no actor: the actor column stays empty, or in
   columns it sits at the left over the lines. */
function LoopLine({
  code,
  kept,
  loops,
}: {
  code: string
  kept?: boolean
  loops: number
}) {
  const { m, v, lanes, lineInset } = useProgram()
  const opacity = kept ? KEPT : 1
  if (lanes === "columns")
    return (
      <div
        className="relative flex items-center whitespace-nowrap"
        style={{ height: v.layout.rowHeight, opacity }}
      >
        <span
          className="rounded-sm bg-background pr-1"
          style={{ marginLeft: 6 * loops }}
        >
          <Code code={`${code}:`} />
        </span>
      </div>
    )
  return (
    <div
      className="flex items-center pr-2 whitespace-nowrap"
      style={{ height: v.layout.rowHeight, paddingLeft: lineInset, opacity }}
    >
      <span
        className="flex shrink-0 items-center"
        style={{ width: nameWidth(v, m), marginRight: v.layout.nameGap }}
      />
      <Indent loops={loops} />
      <Code code={`${code}:`} />
    </div>
  )
}

/* In the gutter, a computation is a dot on its actor's line and a send a
   short arrow from the sender's line to the receiver's. */
function GutterMark({ leaf }: { leaf: Leaf }) {
  const { m, v, laneX, color } = useProgram()
  const offset = useContext(InsetContext)
  const h = v.layout.rowHeight
  const y = h / 2
  const a = laneX(m.lane(leaf.actor)) - offset
  if (!sends(leaf))
    return (
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 overflow-visible"
        height={h}
        style={{ left: 0 }}
        width={1}
      >
        <circle
          cx={a}
          cy={y}
          fill={color(leaf.actor)}
          r={v.lanes.dot + 0.5}
          style={{ stroke: "var(--background)" }}
          strokeWidth={1.5}
        />
      </svg>
    )
  const r = laneX(m.lane(leaf.to!)) - offset
  const dir = r > a ? 1 : -1
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute top-0 overflow-visible"
      height={h}
      style={{ left: 0 }}
      width={1}
    >
      <g
        fill="none"
        style={{ stroke: "var(--foreground)" }}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.25}
      >
        <line x1={a} x2={r - dir * 1.5} y1={y} y2={y} />
        <polyline
          points={`${r - dir * 5},${y - 3} ${r - dir * 1},${y} ${r - dir * 5},${y + 3}`}
        />
      </g>
    </svg>
  )
}

/* In columns, a line's code starts just right of its actor's line: beside a
   dot for a computation, above the arrow at the sender's end for a send. An
   output's arrow runs past the last line to its mark. */
function ColumnLine({ leaf }: { leaf: Leaf }) {
  const { m, v, laneX, color, focus } = useProgram()
  const h = v.layout.rowHeight
  const a = laneX(m.lane(leaf.actor))
  const dim = focus !== null && focus !== leaf.actor && focus !== leaf.to
  const label = (
    <span className="rounded-sm bg-background px-0.5">
      <Code code={codeOf(leaf, v)} />
    </span>
  )
  if (marksOutput(leaf, v)) {
    const end = laneX(m.actors.length - 1) + v.lanes.spacing / 2
    const y = Math.round(h * 0.74) + 0.5
    return (
      <div
        className="relative transition-opacity duration-150"
        style={{ height: h, opacity: dim ? 0.25 : leaf.kept ? KEPT : 1 }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute top-0 overflow-visible"
          height={h}
          width={1}
        >
          <g
            fill="none"
            style={{ stroke: "var(--foreground)" }}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.25}
          >
            <line x1={a} x2={end - 2} y1={y} y2={y} />
            <polyline
              points={`${end - 7},${y - 4} ${end - 1.5},${y} ${end - 7},${y + 4}`}
            />
          </g>
        </svg>
        <div
          className="absolute whitespace-nowrap"
          style={{ left: a + 6, bottom: h - y + 2 }}
        >
          {label}
        </div>
        <div
          className="absolute flex -translate-y-1/2 items-center"
          style={{ left: end + 4, top: y }}
        >
          <OutputMark />
        </div>
      </div>
    )
  }
  if (!sends(leaf))
    return (
      <div
        className="relative transition-opacity duration-150"
        style={{ height: h, opacity: dim ? 0.25 : leaf.kept ? KEPT : 1 }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute top-0 overflow-visible"
          height={h}
          width={1}
        >
          <circle cx={a} cy={h / 2} fill={color(leaf.actor)} r={v.lanes.dot} />
        </svg>
        <div
          className="absolute inset-y-0 flex items-center whitespace-nowrap"
          style={{ left: a + 6 }}
        >
          {label}
        </div>
      </div>
    )
  const r = laneX(m.lane(leaf.to!))
  const right = r > a
  const dir = right ? 1 : -1
  const y = Math.round(h * 0.74) + 0.5
  return (
    <div
      className="relative transition-opacity duration-150"
      style={{ height: h, opacity: dim ? 0.25 : leaf.kept ? KEPT : 1 }}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 overflow-visible"
        height={h}
        width={1}
      >
        <g
          fill="none"
          style={{ stroke: "var(--foreground)" }}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.25}
        >
          <line x1={a} x2={r - dir * 2} y1={y} y2={y} />
          <polyline
            points={`${r - dir * 7},${y - 4} ${r - dir * 1.5},${y} ${r - dir * 7},${y + 4}`}
          />
        </g>
      </svg>
      <div
        className={cn(
          "absolute whitespace-nowrap",
          !right && "-translate-x-full"
        )}
        style={{ left: right ? a + 6 : a - 6, bottom: h - y + 2 }}
      >
        {label}
      </div>
    </div>
  )
}

/* An output leaves the run for whoever relies on it, so it is drawn in ink,
   on neither side. */
function OutputMark({ children }: { children?: ReactNode }) {
  const { v } = useProgram()
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground px-1.5 leading-5 font-medium whitespace-nowrap text-background"
      style={{ fontSize: v.type.actor }}
    >
      <ArrowUpRight className="size-[1em]" strokeWidth={2.5} />
      {children ?? "Output"}
    </span>
  )
}

/* An output's code, as a Python return when outputs are written that way. */
const codeOf = (leaf: Leaf, v: ProgramValues) =>
  leaf.output && v.code.outputs === "return" ? `return ${leaf.code}` : leaf.code
const marksOutput = (leaf: Leaf, v: ProgramValues) =>
  leaf.output === true && v.code.outputs === "chip"

/* With Gate arrows, or any boundary with Crossings on, a send across the
   boundary is heavy with a tick where it crosses, and a send within a side is
   gray. An output's arrow is ink. */
function SendArrow({ cross, out }: { cross?: boolean; out?: boolean }) {
  const { v, boundary } = useProgram()
  const gate = boundary === "gate" || (boundary !== "none" && v.trust.crossings)
  return (
    <svg className="mx-2.5 shrink-0 overflow-visible" height={10} width={30}>
      <g
        fill="none"
        style={{ stroke: gate && !cross && !out ? "var(--muted-foreground)" : "var(--foreground)" }}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={gate && cross ? 1.75 : 1.5}
      >
        <path d="M1 5 H27.5" />
        <path d="M23.5 1.5 L28 5 L23.5 8.5" />
        {gate && cross && <path d="M12 -2 V12" strokeWidth={1.5} />}
      </g>
    </svg>
  )
}

/* Code: functions open their entry; a value takes its maker's color, and
   hovering it lights up every place it appears. Muted code is a comment's,
   gray but for its functions, which still open. */
function Code({ code, muted }: { code: string; muted?: boolean }) {
  const { m, v, color, hoverVar, setHoverVar, selected, select } = useProgram()
  const valueColor = (name: string) => {
    const maker = m.maker.get(name)
    return v.code.values === "maker" && maker && !muted
      ? color(maker)
      : undefined
  }
  return (
    <span className="font-mono" style={{ fontSize: v.type.code }}>
      {m.tokens(code).map((t, i) => {
        if (t.kind === "fn")
          return (
            <button
              className={cn(
                "cursor-pointer rounded-sm font-semibold decoration-current/30 underline-offset-2 hover:underline",
                selected === t.text &&
                  "bg-foreground px-0.5 !text-background hover:no-underline"
              )}
              data-program-fn
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                select(selected === t.text ? null : t.text)
              }}
              style={{ color: muted ? "var(--muted-foreground)" : v.code.functionColor }}
              type="button"
            >
              {t.text}
            </button>
          )
        if (t.kind === "var") {
          const style = v.code.commitments
          const com = style !== "name" && !muted && m.committed.has(t.text)
          const inner =
            com && style === "value" ? m.committed.get(t.text) : undefined
          const own = valueColor(t.text)
          const ink = inner ? valueColor(inner) : own
          const edge = own ?? "var(--muted-foreground)"
          const hover = hoverVar === t.text
          return (
            <span
              className={cn(
                "rounded-[3px] transition-colors",
                !ink && (muted ? "text-muted-foreground/70" : "text-foreground/80"),
                com && "px-[3px]"
              )}
              key={i}
              onMouseEnter={() => setHoverVar(t.text)}
              onMouseLeave={() => setHoverVar(null)}
              style={{
                color: ink,
                fontWeight: ink ? 500 : undefined,
                boxShadow:
                  com && style !== "fill"
                    ? `inset 0 0 0 1px ${edge}`
                    : undefined,
                background: hover
                  ? tint(edge, 0.22)
                  : com && style === "fill"
                    ? tint(edge, 0.12)
                    : undefined,
              }}
            >
              {inner ?? t.text}
            </span>
          )
        }
        if (t.kind === "keyword")
          return (
            <span className="font-semibold text-muted-foreground" key={i}>
              {t.text}
            </span>
          )
        if (t.kind === "str")
          return (
            <span className="text-muted-foreground/70" key={i}>
              {t.text}
            </span>
          )
        if (t.kind === "comment")
          return (
            <span
              className={cn("text-muted-foreground/70", i > 0 && "pl-[1ch]")}
              key={i}
            >
              {t.text}
            </span>
          )
        return (
          <span
            className={t.kind === "punct" ? "text-muted-foreground/70" : undefined}
            key={i}
          >
            {t.kind === "punct" && t.text === "=" ? v.code.assign : t.text}
          </span>
        )
      })}
    </span>
  )
}

/* Where a function is called: in the public parameters, which no actor runs,
   in a phase of the run, by its line's actor, or in the abstract line a
   construction's lines build. */
type Use = { phase: string; code: string; actor?: string }
function usesOf(m: Model, fn: string): Use[] {
  const calls = (code: string) =>
    m.tokens(code).some((t) => t.kind === "fn" && t.text === fn)
  const out: Use[] = (m.protocol.params ?? [])
    .filter((p) => calls(p.code))
    .map((p) => ({ phase: "Public", code: p.code }))
  for (const phase of m.protocol.run) {
    const name = (isGroup(phase) && phase.label) || "Run"
    const walk = (s: Step) => {
      if (!isGroup(s)) {
        if (calls(s.code))
          out.push({ phase: name, code: s.code, actor: s.actor })
        return
      }
      if (s.builds && calls(s.builds))
        out.push({ phase: name, code: `# ${s.builds}` })
      s.steps.forEach(walk)
    }
    walk(phase)
  }
  return out
}

/* The side sheet for one function. Non-modal and kept open on outside
   clicks, so clicking another function swaps the entry. */
function FunctionPanel() {
  const { m, selected, select } = useProgram()
  const shown = useRef(selected)
  if (selected) shown.current = selected
  const name = shown.current
  const entry = name ? m.protocol.functions[name] : undefined
  const uses = name ? usesOf(m, name) : []
  const runBy = m.actors.filter((a) => uses.some((u) => u.actor === a.id))

  return (
    <Sheet
      modal={false}
      onOpenChange={(open) => !open && select(null)}
      open={selected !== null}
    >
      <SheetContent
        aria-describedby={undefined}
        className="gap-0 shadow-[-8px_0_24px_rgba(0,0,0,0.06)] data-[side=right]:w-[min(600px,100vw)] data-[side=right]:sm:max-w-none"
        onInteractOutside={(e) => {
          // Another function switches the sheet; any other click outside closes it.
          if ((e.target as Element | null)?.closest("[data-program-fn], [class*='dialkit']")) e.preventDefault()
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border/60 px-5 py-3.5 pr-12">
          <SheetTitle className="font-mono text-[15px] font-semibold">
            {name}
          </SheetTitle>
        </div>
        {entry && (
          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5 text-[15px] leading-relaxed text-foreground/80">
            <div className="rounded-md border border-border bg-muted/60 px-3 py-2">
              <Code code={entry.signature} />
            </div>
            {runBy.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                Run by
                {runBy.map((a) => (
                  <ActorBadge id={a.id} key={a.id} named />
                ))}
              </div>
            )}
            {entry.tex && (
              <div
                className="overflow-x-auto py-1 text-foreground"
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(entry.tex, {
                    displayMode: true,
                    throwOnError: false,
                  }),
                }}
              />
            )}
            {entry.body.map((p, i) => (
              <p key={i}>
                <Inline text={p} />
              </p>
            ))}
            {uses.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                <span className="text-[12px] text-muted-foreground">Used in</span>
                {uses.map((u, i) => (
                  <div className="flex items-baseline gap-3" key={i}>
                    <span className="w-14 shrink-0 text-[12px] text-muted-foreground/70">
                      {u.phase}
                    </span>
                    <Code code={u.code} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
