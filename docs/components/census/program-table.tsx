"use client"

import { ChevronRight } from "lucide-react"

import { circuitHref, useOpenCircuit } from "@/components/census/circuit-modal"
import type { ProgramIndexRow } from "@/lib/program-view"
import { contextLabel, shortModel } from "@/lib/vllm"

/*
 * The Programs on record, one row per served config: click one to open its
 * circuit. Gates are the Boolean circuit's AND, XOR and NOT gates over the
 * run, once per layer a repeated module stands for.
 */

const sampling = (s: ProgramIndexRow["sampling"]) => (s.temperature === 0 ? "Greedy" : `Top-p ${s.top_p}, T ${s.temperature}`)

export function ProgramTable({ rows, gates }: { rows: ProgramIndexRow[]; gates: Record<string, string | null> }) {
  const open = useOpenCircuit()
  return (
    <div className="not-prose overflow-x-auto rounded-lg border font-sans" data-program-table="">
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
            <th className="px-3 py-2.5 text-right font-medium">Calls</th>
            <th className="px-3 py-2.5 text-right font-medium">Gates</th>
            <th aria-hidden className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              className="group cursor-pointer border-t align-middle hover:bg-muted/40"
              data-row={r.key}
              key={r.key}
              onClick={() => open(r.key)}
            >
              <td className="px-4 py-2 font-medium whitespace-nowrap">
                <a
                  className="outline-none focus-visible:underline"
                  href={circuitHref(r.key)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                      e.stopPropagation()
                      return
                    }
                    e.preventDefault()
                  }}
                  title={r.model}
                >
                  {shortModel(r.model)}
                </a>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {r.gpu.toUpperCase()} · {r.dtype.toUpperCase()}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.tp}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.batch}</td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{contextLabel(r.context)}</td>
              <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap text-muted-foreground">{r.workload ?? "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{sampling(r.sampling)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.calls.toLocaleString("en-US")}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{gates[r.key] ?? "—"}</td>
              <td className="pr-3 text-muted-foreground">
                <ChevronRight aria-hidden className="size-4 opacity-40 group-hover:opacity-100" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
