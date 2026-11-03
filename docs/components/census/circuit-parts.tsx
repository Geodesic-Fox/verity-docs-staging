"use client"

import { hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { kindColor } from "@/components/census/boolean"
import { count, fmtSize, groupBadge, partKind } from "@/components/census/circuit-format"
import { Tree, TreeItem, TreeItemLabel } from "@/components/reui/tree"
import { Button } from "@/components/ui/button"
import { landing, loweringOf, templateOfGroup, type BooleanRow } from "@/lib/boolean-view"
import { DEFINITION_GROUP, parsePlace } from "@/lib/circuits"
import type { Definitions } from "@/lib/definition-view"
import { defName, subcircuitName } from "@/lib/names"
import { labeler, templateOf, type Annotation, type ProgramGraph as Graph, type ProgramOp } from "@/lib/program-view"
import { mixTemplate } from "@/lib/vllm"
import { cn } from "@/lib/utils"

/*
 * The circuit's hierarchy: every level the schematic draws, as a tree you can
 * open without leaving the level you're at. A Program's modules hold its
 * ops; an op opens on its Call's Definition, a Definition on its parts, and
 * a lowered primitive on the Boolean subcircuit it's lowered in, down to the
 * subcircuits with no parts. Each item's id is its place (lib/circuits.ts),
 * so clicking one goes there, and the item you're at stays selected and in
 * view. Sizes are gates (AND, XOR and NOT), over the run for an op.
 */

type Item = {
  name: string
  badge: string | null
  size: number | null
  color: string | null
  folder: boolean
  // Where clicking it goes, when that isn't its own place: a primitive with no gates opens on the
  // level it's a part of.
  go: string | null
}

const ROOT = "__root"
const INDENT = 16

const gates = (n: { and: number; xor: number; not: number }) => n.and + n.xor + n.not

type Ctx = {
  graph: Graph | null
  definition: { spec: string; land: string | null; call: string | null } | null
  defs: Definitions | null
  b: BooleanRow | null
  nameOf: (id: string) => string
  moduleLabel: (path: string) => string | null
}

// Items and their children, built as the tree asks for them.
function partsModel(ctx: Ctx) {
  const { graph, definition, defs, b, nameOf, moduleLabel } = ctx
  const items = new Map<string, Item>([[ROOT, { name: "", badge: null, size: null, color: null, folder: true, go: null }]])
  const kids = new Map<string, () => string[]>()
  const modules = new Map((graph?.modules ?? []).map((m) => [m.path, m]))
  const ops = new Map((graph?.ops ?? []).map((o) => [o.id, o]))
  const put = (id: string, item: Item, children: () => string[] = () => []) => {
    items.set(id, item)
    kids.set(id, children)
    return id
  }
  const specOf = (o: ProgramOp) => (graph && defs ? (defs.ops[graph.row.key]?.[o.source ?? o.id]?.spec ?? null) : null)

  const bools = (prefix: string, nodeId: string): string[] => {
    const n = b?.nodes[nodeId]
    if (!b || !n) return []
    return n.children.map((c, i) => {
      const child = b.nodes[c.ref]
      const landed = landing(b, c.ref).pop()!
      const id = prefix.endsWith("~") ? `${prefix}${i}` : `${prefix}.${i}`
      return put(
        id,
        {
          name: child ? subcircuitName(c.ref, child) : c.ref.slice(0, 8),
          badge: c.count > 1 ? `× ${count(c.count)}` : null,
          size: child ? gates(child) * c.count : null,
          color: child ? kindColor(child.kind) : null,
          folder: Boolean(b.nodes[landed]?.children.length),
          go: null,
        },
        () => bools(id, landed)
      )
    })
  }

  // A body's parts: composite ones open on their own parts, lowered primitives on their circuits.
  const groups = (prefix: string, spec: string, group: string, call: string): string[] => {
    if (!defs) return []
    const cells = defs.partition[call]?.prims?.[spec]
    return (defs.definitions[spec]?.groups ?? []).map((g) => {
      const d = defs.definitions[g.fn]
      const item = {
        name: defName(g.fn),
        badge: groupBadge(g),
        size: cells?.[g.id] ? Object.values(cells[g.id]!).reduce((a, x) => a + x[0], 0) : null,
        color: partKind(g.fn).color,
      }
      if (d?.form === "composite" && d.groups?.length) {
        const id = `${prefix}>${g.id}`
        return put(id, { ...item, folder: true, go: null }, () => groups(id, g.fn, group, call))
      }
      const low = b && d?.form === "primitive" ? loweringOf(b, group, g.fn) : null
      if (b && low && "root" in low && b.nodes[low.root]) {
        const landed = landing(b, low.root).pop()!
        const id = `${prefix}>${g.id}~`
        return put(id, { ...item, folder: Boolean(b.nodes[landed]?.children.length), go: null }, () => bools(id, landed))
      }
      return put(`${prefix}>${g.id}`, { ...item, folder: false, go: prefix })
    })
  }

  const op = (opId: string): string => {
    const o = ops.get(opId)!
    const spec = specOf(o)
    const d = spec ? defs?.definitions[spec] : null
    const level = d?.summary && !d.groups?.length && b ? (templateOfGroup(b, o.group)?.level ?? null) : null
    const id = level ? `c:${opId}~` : `c:${opId}`
    const size = b?.size[o.group]
    return put(
      id,
      {
        name: nameOf(opId),
        badge: o.calls > 1 ? `${count(o.calls)} Calls` : null,
        size: typeof size === "number" ? size : null,
        color: mixTemplate(templateOf(o)).color,
        folder: !defs || Boolean(d?.groups?.length || level),
        go: null,
      },
      () => (level ? bools(id, level) : spec ? groups(id, spec, o.group, spec) : [])
    )
  }

  const module = (path: string): string => {
    const m = modules.get(path)!
    const id = `m:${path}`
    const repeat = m.repeat?.count ?? m.launches ?? 1
    return put(
      id,
      {
        name: path === "" ? "Program" : (moduleLabel(path) ?? m.label ?? m.name),
        badge: repeat > 1 ? `× ${count(repeat)}` : null,
        size: null,
        color: null,
        folder: m.children.length + m.ops.length > 0,
        go: null,
      },
      () => [
        ...m.children.map((c) => {
          const cm = modules.get(c)
          return cm && cm.children.length === 0 && cm.ops.length === 1 && ops.has(cm.ops[0]!) ? op(cm.ops[0]!) : module(c)
        }),
        ...m.ops.filter((o) => ops.has(o)).map(op),
      ]
    )
  }

  let top: string | null = null
  if (graph && modules.has("")) top = module("")
  else if (definition) {
    const { spec, land, call } = definition
    const id = land ? "d~" : "d"
    top = put(
      id,
      { name: defName(spec), badge: null, size: null, color: partKind(spec).color, folder: true, go: null },
      () => (land ? bools(id, land) : groups(id, spec, DEFINITION_GROUP, call ?? spec))
    )
  }
  kids.set(ROOT, () => (top ? [top] : []))

  // The items above a place, top first, as the tree has them.
  const lineage = (place: string): string[] => {
    const p = parsePlace(place)
    const out = [ROOT]
    if (!p) return out
    const chain = (path: string | null) => {
      const up: string[] = []
      for (let q: string | null = path ?? ""; q !== null; q = q === "" ? null : (modules.get(q)?.parent ?? "")) up.unshift(`m:${q}`)
      return up
    }
    let head: string
    if (!p.call && !p.definition) {
      out.push(...chain(p.module))
      return out
    }
    if (p.call) {
      const o = ops.get(p.call)
      if (!o) return out
      const m = modules.get(o.module)
      const home = m && m.children.length === 0 && m.ops.length === 1 ? (m.parent ?? "") : o.module
      out.push(...chain(home))
      // An op's place that goes below with no parts on the way is a Call too large to draw.
      head = !p.path.length && !p.part && p.below ? `c:${p.call}~` : `c:${p.call}`
    } else head = definition?.land ? "d~" : "d"
    out.push(head)
    let prefix = head
    for (const g of p.path) out.push((prefix = `${prefix}>${g}`))
    if (p.part) out.push((prefix = `${prefix}>${p.part}~`))
    for (const i of p.below ?? []) out.push((prefix = prefix.endsWith("~") ? `${prefix}${i}` : `${prefix}.${i}`))
    return out
  }

  return {
    item: (id: string): Item => items.get(id) ?? { name: id, badge: null, size: null, color: null, folder: false, go: null },
    children: (id: string): string[] => kids.get(id)?.() ?? [],
    lineage,
  }
}

export function CircuitParts({
  graph,
  definition,
  defs,
  boolean,
  annotations,
  nameOf,
  place,
  onGo,
  onClose,
  className,
}: {
  graph: Graph | null
  definition: { spec: string; land: string | null; call: string | null } | null
  defs: Definitions | null
  boolean: BooleanRow | null
  annotations: Annotation[]
  nameOf: (id: string) => string
  place: string
  onGo: (place: string) => void
  onClose: () => void
  className?: string
}) {
  const moduleLabel = useMemo(() => (graph ? labeler(graph, annotations).moduleLabel : () => null), [graph, annotations])
  const model = useMemo(
    () => partsModel({ graph, definition, defs, b: boolean, nameOf, moduleLabel }),
    [graph, definition, defs, boolean, nameOf, moduleLabel]
  )
  const [expanded, setExpanded] = useState<string[]>([ROOT])
  const [focused, setFocused] = useState<string | null>(null)

  // The place you're at, and every item above it, open: the tree shows what the schematic draws.
  useEffect(() => {
    const line = model.lineage(place)
    setExpanded((was) => (line.every((id) => was.includes(id)) ? was : [...new Set([...was, ...line])]))
  }, [model, place])

  const tree = useTree<Item>({
    rootItemId: ROOT,
    indent: INDENT,
    state: { expandedItems: expanded, selectedItems: [place], focusedItem: focused },
    setExpandedItems: setExpanded,
    setSelectedItems: () => {},
    setFocusedItem: setFocused,
    getItemName: (item) => item.getItemData()?.name ?? "",
    isItemFolder: (item) => Boolean(item.getItemData()?.folder),
    onPrimaryAction: (item) => onGo(item.getItemData()?.go ?? item.getId()),
    dataLoader: { getItem: model.item, getChildren: model.children },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  })
  // New data (the Definitions, the Boolean circuits) fills in what was open.
  useEffect(() => {
    tree.rebuildTree()
  }, [model, tree])

  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-place="${CSS.escape(place)}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [place, expanded])

  return (
    <aside aria-label="Hierarchy" className={cn("flex h-full min-h-0 flex-col border-r bg-background", className)} data-hierarchy="">
      <div className="flex h-10 shrink-0 items-center justify-between border-b pr-1.5 pl-3">
        <span className="text-[12px] font-medium">Hierarchy</span>
        <Button aria-label="Close the hierarchy" className="text-muted-foreground" onClick={onClose} size="icon-xs" variant="ghost">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-2" ref={list}>
        <Tree
          className="relative before:absolute before:inset-0 before:-ms-1 before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)))]"
          indent={INDENT}
          tree={tree}
        >
          {tree.getItems().map((item) => {
            const d = item.getItemData()
            if (!d) return null
            return (
              <TreeItem data-place={item.getId()} item={item} key={item.getId()}>
                <TreeItemLabel className="gap-1.5 py-1 pr-1.5 text-[12.5px] in-data-[selected=true]:font-medium">
                  {d.color ? <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: d.color }} /> : null}
                  <span className="min-w-0 truncate" title={d.name}>
                    {d.name}
                  </span>
                  {d.badge ? <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{d.badge}</span> : null}
                  {d.size ? (
                    <span className="ml-auto shrink-0 pl-2 text-[11px] text-muted-foreground tabular-nums">{fmtSize(d.size).replace(/ gates?$/, "")}</span>
                  ) : null}
                </TreeItemLabel>
              </TreeItem>
            )
          })}
        </Tree>
      </div>
    </aside>
  )
}
