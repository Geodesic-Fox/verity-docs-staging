"use client"

import { useState } from "react"

import { circuitHref, useOpenCircuit } from "@/components/census/circuit-modal"
import {
  batchSize,
  compact,
  contextLabel,
  hardware,
  mixTemplate,
  mixTemplates,
  samplingLabel,
  shortModel,
  workloadLabel,
  type ServedConfig,
} from "@/lib/vllm"
import { cn } from "@/lib/utils"

/*
 * One row per served config, each with a full-width bar of its template
 * mix: how its proof units, or the inputs they hold, split across
 * subcircuit templates. A config without a replay partition on record has
 * no mix.
 */

type Measure = "units" | "inputs"

function totals(config: ServedConfig, measure: Measure) {
  const by = new Map<string, number>()
  for (const m of config.mix) {
    const v = measure === "units" ? m.units : (m.inputs ?? 0)
    by.set(m.template, (by.get(m.template) ?? 0) + v)
  }
  const total = [...by.values()].reduce((a, b) => a + b, 0)
  return { by, total }
}

// A row with a Program on record opens its circuit.
export function ServedConfigs({ configs, programs }: { configs: ServedConfig[]; programs: string[] }) {
  const open = useOpenCircuit()
  const [measure, setMeasure] = useState<Measure>("units")
  const present = new Set(configs.flatMap((c) => c.mix.map((m) => m.template)))
  const legend = mixTemplates.filter(
    (t, i) => present.has(t.id) && !mixTemplates.slice(0, i).some((u) => u.label === t.label && present.has(u.id))
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((t) => (
            <span className="inline-flex items-center gap-1.5" key={t.id}>
              <span aria-hidden className="size-2 rounded-[2px]" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
          {(["units", "inputs"] as const).map((m) => (
            <button
              aria-selected={measure === m}
              className={cn(
                "h-7 rounded-md px-3 text-[12.5px]",
                measure === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              key={m}
              onClick={() => setMeasure(m)}
              role="tab"
              type="button"
            >
              {m === "units" ? "By units" : "By inputs"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Model</th>
              <th className="px-3 py-2.5 font-medium">Hardware</th>
              <th className="px-3 py-2.5 text-right font-medium">TP</th>
              <th className="px-3 py-2.5 text-right font-medium">Batch</th>
              <th className="px-3 py-2.5 font-medium">Context</th>
              <th className="px-3 py-2.5 font-medium">Prompt mix</th>
              <th className="px-3 py-2.5 font-medium">Sampling</th>
              <th className="px-3 py-2.5 text-right font-medium">{measure === "units" ? "Units" : "Inputs"}</th>
              <th className="w-[34%] min-w-[15rem] px-4 py-2.5 font-medium">Template mix</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => {
              const { by, total } = totals(c, measure)
              const order = mixTemplates.map((t) => t.id).filter((id) => by.has(id))
              const extra = [...by.keys()].filter((id) => !order.includes(id))
              const program = programs.includes(c.key)
              return (
                <tr
                  className={cn("border-t align-middle", program && "cursor-pointer hover:bg-muted/40")}
                  key={c.key}
                  onClick={program ? () => open(c.key) : undefined}
                >
                  <td className="px-4 py-2 font-medium whitespace-nowrap" title={c.model}>
                    {program ? (
                      <a
                        className="outline-none focus-visible:underline"
                        href={circuitHref(c.key)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                            e.stopPropagation()
                            return
                          }
                          e.preventDefault()
                        }}
                      >
                        {shortModel(c.model)}
                      </a>
                    ) : (
                      shortModel(c.model)
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{hardware(c)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.tp.replace(/\D/g, "")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{batchSize(c.batch)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{contextLabel(c.context)}</td>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap text-muted-foreground">
                    {workloadLabel(c.workload)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{samplingLabel(c.sampling)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.partitioned ? compact(total) : "—"}</td>
                  <td className="px-4 py-2">
                    {c.partitioned && total > 0 ? (
                      <div
                        aria-label={`Template mix for ${shortModel(c.model)}`}
                        className="flex h-3 w-full overflow-hidden rounded-[3px]"
                        role="img"
                      >
                        {[...order, ...extra].map((id) => {
                          const v = by.get(id) ?? 0
                          const t = mixTemplate(id)
                          const share = Math.round((v / total) * 100000) / 1000
                          return v > 0 ? (
                            <span
                              key={id}
                              style={{ width: `${share}%`, background: t.color }}
                              title={`${t.label}: ${v.toLocaleString("en-US")} ${measure} (${share.toFixed(1)}%)`}
                            />
                          ) : null
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No replay partition on record</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        A unit is a proof unit, the part of a serving run that replay checks as a whole; an input is one
        input to a subcircuit, such as one GEMM coordinate. Units undercount GEMM&apos;s share of the work, since
        one GEMM unit holds a whole row of coordinates. Hover a segment for its count, and click a row to open its
        Program.
      </p>
    </div>
  )
}
