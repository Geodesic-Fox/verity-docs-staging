"use client"

import { ReactFlowProvider } from "@xyflow/react"
import { Boxes, Info, ListTree, Network, Ruler, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"

import { Canvas, LEVELS, variantsFrom, type CircuitRoot } from "@/components/census/program-graph"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import annotationData from "@/data/program-annotations.json"
import type { BooleanRow } from "@/lib/boolean-view"
import { stemOf } from "@/lib/annotations"
import { homePlace, resolveCircuit, type CircuitIndex } from "@/lib/circuits"
import type { Definitions } from "@/lib/definition-view"
import { defName } from "@/lib/names"
import { rowConfig, type Annotations, type ProgramGraph as Graph } from "@/lib/program-view"
import { shortModel } from "@/lib/vllm"

/*
 * One circuit, open: a served config's Program or a Definition on its own.
 * The header names it and holds the views; below, the hierarchy (every
 * level, as a tree) beside the schematic (the level you're at, drawn).
 * Everything loads on open, once per page: the index of what can be
 * opened, then the Program or the Definitions, then the Boolean circuits.
 */

const annotations = (annotationData as Annotations).annotations

const cache = new Map<string, Promise<unknown>>()
function fetchJson<T>(url: string, schema: string): Promise<T> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`${url}: ${res.status}`)
      const data = (await res.json()) as { schema?: string }
      if (data.schema !== schema) throw new Error(`${url}: not ${schema}`)
      return data
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p as Promise<T>
}

const loadIndex = () => fetchJson<CircuitIndex>("/census/circuits", "verity-docs/circuits/v1")
const loadDefs = () => fetchJson<Definitions>("/census/definitions", "verity-docs/definitions/v1")

// A view's state in the URL: ?units=1, ?widths=1, ?serving=1, ?levels=2 (or all).
function setParam(name: string, value: string | null) {
  const url = new URL(window.location.href)
  if (value) url.searchParams.set(name, value)
  else url.searchParams.delete(name)
  window.history.replaceState(null, "", url)
}

function Status({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">{children}</div>
}

export function CircuitView({
  circuit,
  at,
  narrow,
  onPlace,
  onOpen,
  onClose,
  Title,
}: {
  // The circuit's key (lib/circuits.ts) and the place to open at.
  circuit: string
  at: string | null
  // On a narrow screen the hierarchy opens over the schematic, and starts closed.
  narrow: boolean
  // Where you are, or null at the circuit's home.
  onPlace: (place: string | null) => void
  // Another circuit in its place: another specialization of the Definition.
  onOpen: (key: string) => void
  onClose: () => void
  // The dialog's or drawer's title, which names it to assistive technology.
  Title: ComponentType<{ className?: string; children?: ReactNode }>
}) {
  const [index, setIndex] = useState<CircuitIndex | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    loadIndex().then(setIndex, (e: unknown) => setFailed(String(e)))
  }, [])
  const target = index ? resolveCircuit(index, circuit) : null
  const row = target?.kind === "program" ? target.row : null
  const spec = target?.kind === "definition" ? target.spec : null
  const key = row?.key ?? null

  const [initial] = useState(() => new URLSearchParams(window.location.search))
  const [levels, setLevels] = useState<number>(() => {
    const l = initial.get("levels")
    return l === "all" ? Infinity : l && Number(l) > 1 ? Math.min(3, Number(l)) : 1
  })
  const [vuOn, setVuOn] = useState(() => Boolean(initial.get("units") || initial.get("vu")))
  const [widths, setWidths] = useState(() => Boolean(initial.get("widths")))
  const [serving, setServing] = useState(() => Boolean(initial.get("serving")))
  const [variants] = useState(() => variantsFrom(initial))
  const [hierarchy, setHierarchy] = useState(!narrow)

  const [graph, setGraph] = useState<Graph | null>(null)
  const [servingGraph, setServingGraph] = useState<Graph | null>(null)
  useEffect(() => {
    if (!key) return
    let live = true
    fetchJson<Graph>(`/census/programs/${key}`, "verity-docs/program-graph/v2").then(
      (g) => live && setGraph(g),
      (e: unknown) => live && setFailed(String(e))
    )
    return () => {
      live = false
    }
  }, [key])
  // With Serving on, a row that has a serving view draws it: its run laid out by engine step.
  const hasServing = Boolean(key && index?.serving.includes(key))
  const servingOn = serving && hasServing
  useEffect(() => {
    if (!servingOn || !key) return
    let live = true
    fetchJson<Graph>(`/census/serving/${key}`, "verity-docs/serving-graph/v1").then(
      (g) => live && setServingGraph(g),
      (e: unknown) => live && setFailed(String(e))
    )
    return () => {
      live = false
    }
  }, [servingOn, key])
  const program = graph && graph.row.key === key ? graph : null
  const shown = servingOn ? (servingGraph?.row.key === key ? servingGraph : null) : program

  // The canvas starts over when its root changes, so it's kept while nothing it's made of does.
  const land = spec ? (index?.definitions[spec]?.land ?? null) : null
  const call = spec ? (index?.definitions[spec]?.call ?? null) : null
  const root = useMemo((): CircuitRoot | null => {
    if (spec) return { kind: "definition", spec, land, call }
    return shown ? { kind: "program", graph: shown } : null
  }, [spec, land, call, shown])
  const tpl = spec ? (index?.definitions[spec]?.tpl ?? null) : null
  const boolUrl = key
    ? index?.boolean.includes(key)
      ? `/census/boolean/${key}`
      : null
    : tpl
      ? `/census/lowering/${encodeURIComponent(tpl)}`
      : null
  const loadBool = useMemo(() => (boolUrl ? () => fetchJson<BooleanRow>(boolUrl, "verity-docs/boolean/v2") : null), [boolUrl])

  const home = index ? homePlace(index, circuit) : null
  const report = useCallback((place: string) => onPlace(place === home ? null : place), [home, onPlace])

  // A Definition's other specializations, by their static parameters.
  const siblings = useMemo(() => {
    if (!spec || !index) return []
    const stem = stemOf(spec)
    return Object.keys(index.definitions)
      .filter((id) => stemOf(id) === stem)
      .map((id) => ({ id, label: index.definitions[id]!.statics || stem }))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }))
  }, [spec, index])
  const pick = (id: string) => onOpen(index?.stems[stemOf(id)] === id ? stemOf(id) : id)

  // The views, toggled together: [URL name, label, icon, what it does, on, set].
  const views = [
    ...(hasServing
      ? [["serving", "Serving", Network, "Lay the whole run out as vLLM runs it: by engine step, then request, then the model runner", serving, setServing] as const]
      : []),
    ["units", "Proof blocks", Boxes, "Outline the proof blocks inside each Call", vuOn, setVuOn] as const,
    ["widths", "Widths", Ruler, "Label each wire with what it carries: how many elements, in what format", widths, setWidths] as const,
  ]

  const about = row ? (
    <>
      <span>Click a subcircuit to open it, down to its gates. Scroll to zoom. The hierarchy lists every level, and goes to any.</span>
      {shown?.serving ? (
        <span>
          The whole run as vLLM runs it: by engine step, then request, then the model runner. Steps whose requests have one structure
          are drawn once, and the next token and the KV cache run back across them.
          {shown.serving.record ? " From the record Build of this config." : ""}
        </span>
      ) : null}
      {row.shard ? <span>One rank&apos;s shard of the Program ({row.shard}); its collectives read from the other rank.</span> : null}
      <span className="opacity-70">
        From the vLLM integration&apos;s Programs, merged across a config&apos;s requests, and its export of their Definitions. Layers that
        repeat exactly are drawn once.
        {widths
          ? program?.edgeBits
            ? " Between Calls, a width is what one read carries."
            : " This config's reads weren't kept, so edges between Calls have no widths."
          : ""}
        {boolUrl ? " Below a Call's primitives, the AND, XOR and NOT gates are Flock's Boolean lowering, derived for this site: not a proof statement." : ""}
      </span>
    </>
  ) : (
    <>
      <span>Click a part to open it, down to its gates. Scroll to zoom. The hierarchy lists every level, and goes to any.</span>
      <span className="opacity-70">
        One Definition on its own, from the vLLM integration&apos;s export of its Definitions. Its static parameters are bound; pick
        another specialization above.
        {boolUrl
          ? " Below its primitives, the AND, XOR and NOT gates are Flock's Boolean lowering of a template that applies it, derived for this site: not a proof statement."
          : ""}
      </span>
    </>
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-col font-sans">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[11.5px] text-muted-foreground">
            {row ? (
              "vLLM Program"
            ) : spec ? (
              <>
                Definition <span className="font-mono">{stemOf(spec)}</span>
              </>
            ) : (
              "Circuit"
            )}
          </span>
          <div className="flex min-w-0 items-baseline gap-2">
            <Title className="truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]">
              {row ? shortModel(row.model) : spec ? defName(spec) : failed ? "Couldn't load the circuit" : target === null && index ? circuit : "Loading…"}
            </Title>
            {row ? <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{rowConfig(row)}</span> : null}
            {spec && siblings.length > 1 ? (
              <Select onValueChange={pick} value={spec}>
                <SelectTrigger aria-label="Specialization" className="h-6 max-w-[min(420px,60vw)] text-[12px]" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {siblings.map((s) => (
                    <SelectItem className="text-[12.5px]" key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : spec && index?.definitions[spec]?.statics ? (
              <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{index.definitions[spec]!.statics}</span>
            ) : null}
          </div>
        </div>
        <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto max-md:order-last max-md:w-full">
          <Button
            aria-label="Hierarchy"
            aria-pressed={hierarchy}
            data-toggle="hierarchy"
            onClick={() => setHierarchy((h) => !h)}
            size="sm"
            variant={hierarchy ? "secondary" : "outline"}
          >
            <ListTree />
            Hierarchy
          </Button>
          {row ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs text-muted-foreground max-md:hidden">Levels</span>
              <ToggleGroup
                aria-label="Levels shown"
                onValueChange={(v) => {
                  if (!v) return
                  setLevels(v === "all" ? Infinity : Number(v))
                  setParam("levels", v === "1" ? null : v)
                }}
                size="sm"
                type="single"
                value={levels === Infinity ? "all" : String(levels)}
                variant="outline"
              >
                {LEVELS.map((l) => {
                  const v = l === Infinity ? "all" : String(l)
                  return (
                    <ToggleGroupItem aria-label={l === Infinity ? "Every level" : `${l} level${l === 1 ? "" : "s"}`} data-levels={v} key={v} value={v}>
                      {l === Infinity ? "All" : l}
                    </ToggleGroupItem>
                  )
                })}
              </ToggleGroup>
            </div>
          ) : null}
          <ToggleGroup
            aria-label="View"
            className="shrink-0"
            onValueChange={(on: string[]) => {
              for (const [name, , , , was, set] of views) {
                const now = on.includes(name)
                if (now === was) continue
                set(now)
                setParam(name, now ? "1" : null)
              }
            }}
            size="sm"
            type="multiple"
            value={views.filter(([, , , , was]) => was).map(([name]) => name)}
            variant="outline"
          >
            {views.map(([name, label, Icon, tip]) => (
              <Tooltip key={name}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem aria-label={label} data-toggle={name} value={name}>
                    <Icon />
                    <span className="max-md:hidden">{label}</span>
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{tip}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button aria-label="About this circuit" className="shrink-0 text-muted-foreground" size="icon-sm" variant="ghost">
                <Info />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[340px] flex-col items-start gap-1.5 py-2 text-left leading-snug" side="bottom">
              {about}
            </TooltipContent>
          </Tooltip>
        </div>
        <Button aria-label="Close" className="shrink-0 max-md:order-2" data-close="" onClick={onClose} size="icon-sm" variant="ghost">
          <X />
        </Button>
      </header>
      <div className="relative min-h-0 flex-1" data-vaul-no-drag="">
        {failed ? (
          <Status>Couldn&apos;t load the circuit: {failed}</Status>
        ) : index && !target ? (
          <Status>No circuit on record is named {circuit}.</Status>
        ) : root && index ? (
          <ReactFlowProvider key={circuit}>
            <Canvas
              annotations={annotations}
              levels={levels}
              loadBool={loadBool}
              loadDefs={loadDefs}
              onParts={setHierarchy}
              onPlace={report}
              parts={hierarchy ? (narrow ? "over" : "side") : null}
              root={root}
              start={at}
              tokens={index.tokens}
              variants={variants}
              vuOn={vuOn}
              widths={widths}
            />
          </ReactFlowProvider>
        ) : (
          <Status>Loading…</Status>
        )}
        {shown?.serving && !shown.serving.record && row ? (
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-background/95 px-2.5 py-1 text-[11.5px] text-muted-foreground shadow-xs"
            data-serving-example=""
          >
            {`An example of the rank level: ${shown.serving.requests.length} of this config's ${row.requests} requests, on both ranks. Its Build has no step chronology, so the steps are each request's own.`}
          </div>
        ) : null}
      </div>
    </div>
  )
}
