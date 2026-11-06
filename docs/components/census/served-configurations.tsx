import { Fragment } from "react"

import { TokenButton } from "@/components/assumptions/token-button"
import { ServedConfigs } from "@/components/census/served-configs"
import programs from "@/data/programs/index.json"
import { subcircuits, templates } from "@/data/subcircuits"
import { tokenData } from "@/lib/assumption-index"
import {
  batchSize,
  compact,
  contextLabel,
  hardware,
  samplingLabel,
  shortModel,
  vllm,
  type ExportedSubcircuit,
  type SamplePort,
} from "@/lib/vllm"

const bySet = new Map(subcircuits.flatMap((s) => (s.exportSet ? [[s.exportSet, s]] : [])))

// "0x1.4f8b588e368f1p-17" as a number.
function hexFloat(text: string): number {
  const m = /^(-)?0x([0-9a-f]+)(?:\.([0-9a-f]+))?p([+-]?\d+)$/i.exec(text)
  if (!m) return Number.NaN
  const fraction = m[3] ?? ""
  const mantissa = parseInt(m[2] + fraction, 16) / 16 ** fraction.length
  return (m[1] ? -1 : 1) * mantissa * 2 ** Number(m[4])
}

function paramValue(value: number | string): string {
  if (typeof value === "number") return value.toLocaleString("en-US")
  try {
    const parsed = JSON.parse(value) as { f64?: string }
    if (parsed.f64) return Number(hexFloat(parsed.f64).toPrecision(3)).toString()
  } catch {}
  return value
}

const paramNames: Record<string, string> = { EPS: "ε" }

function boundParams(s: ExportedSubcircuit): string {
  return Object.entries(s.boundParams)
    .map(([k, v]) => `${paramNames[k] ?? k} = ${paramValue(v)}`)
    .join(", ")
}

const megabytes = (bytes: number) => `${Number((bytes / 1e6).toPrecision(3))} MB`

const preview = (values: (number | null)[]) =>
  values
    .slice(0, 6)
    .map((v) => (v === null ? "·" : Number(v.toPrecision(4)).toString()))
    .join(", ")

function Ports({ label, ports }: { label: string; ports: Record<string, SamplePort> }) {
  return (
    <>
      {Object.entries(ports).map(([name, p], i) => (
        <tr className="border-t border-border/60 align-baseline" key={name}>
          <td className="py-1 pr-3 text-muted-foreground">{i === 0 ? label : ""}</td>
          <td className="py-1 pr-3 font-mono">{name}</td>
          <td className="py-1 pr-3 text-muted-foreground">
            {p.dtype} × {p.words.toLocaleString("en-US")}
          </td>
          <td className="py-1 pr-3 tabular-nums">
            {preview(p.f32)}
            {p.words > 6 ? ", …" : ""}
          </td>
          <td className="py-1 font-mono text-muted-foreground">
            {p.hex.slice(0, 6).join(" ")}
            {p.words > 6 ? " …" : ""}
          </td>
        </tr>
      ))}
    </>
  )
}

function Samples({ s }: { s: ExportedSubcircuit }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs text-muted-foreground select-none hover:text-foreground">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> {s.samples.length} sample
        {s.samples.length === 1 ? "" : "s"}, with exact outputs
        {s.rule ? <span className="ml-2 font-mono text-[11px]">{s.rule}</span> : null}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {s.samples.map((sample, i) => (
          <div key={i}>
            <div className="mb-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{sample.source.opPath}</span>
              {sample.source.phase ? <span>{sample.source.phase}</span> : null}
              {sample.source.engineStep !== null ? <span>engine step {sample.source.engineStep}</span> : null}
              {Object.entries(sample.source.sub).map(([k, v]) => (
                <span key={k}>
                  {k} {String(v)}
                </span>
              ))}
            </div>
            <table className="w-full text-[12px]">
              <tbody>
                <Ports label="In" ports={sample.inputs} />
                <Ports label="Out" ports={sample.outputs} />
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </details>
  )
}

export function ServedConfigurations() {
  const run = vllm.run
  const exportedUnits = vllm.subcircuits.reduce((a, s) => a + s.exportedUnits, 0)
  return (
    <div className="not-prose font-sans" data-breakout="">
      <ServedConfigs configs={vllm.configs} programs={programs.rows.map((r) => r.key)} />

      <section className="mt-14">
        <h3>
          {shortModel(run.model)} on an {run.gpu.toUpperCase()}, by subcircuit
        </h3>
        <p className="mt-1.5 max-w-[860px] text-[13px] text-muted-foreground">
          {hardware(run)}, batch {batchSize(run.batch)}, {contextLabel(run.context)}, {samplingLabel(run.sampling).toLowerCase()}.
          Weights at revision <span className="font-mono">{run.revision.slice(0, 10)}</span>, vLLM{" "}
          {run.versions.vllm.split("+")[0]}, CUDA {run.versions.cuda}. The run has{" "}
          {run.units.toLocaleString("en-US")} units. For each subcircuit, a random sample of its units was replayed
          and every replay matched bit for bit; the inputs of {exportedUnits.toLocaleString("en-US")} units were
          exported as the subcircuits&apos; input sets.
          {Object.keys(run.notExported).includes("Embedding_v1")
            ? " Embedding isn't exported: it's a commitment opening of the embedding table, not a subcircuit."
            : null}{" "}
          These input sets have no backend results yet; see{" "}
          <a className="text-foreground hover:underline" href="#subcircuit-templates">
            Subcircuit templates
          </a>
          .
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Subcircuit</th>
                <th className="px-3 py-2.5 font-medium">Bound parameters</th>
                <th className="px-3 py-2.5 text-right font-medium">Units in run</th>
                <th className="px-3 py-2.5 text-right font-medium">Inputs in run</th>
                <th className="px-3 py-2.5 text-right font-medium">Inputs exported</th>
                <th className="px-3 py-2.5 text-right font-medium">Replayed</th>
                <th className="px-4 py-2.5 text-right font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {vllm.subcircuits.map((s) => {
                const site = bySet.get(s.set)
                return (
                  <Fragment key={s.set}>
                    <tr className="border-t align-middle">
                      <td className="px-4 pt-2.5 pb-1">
                        {site ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium whitespace-nowrap">{templates[site.template]?.name}</span>
                            <TokenButton {...tokenData(site.id)} />
                          </span>
                        ) : (
                          <span className="font-mono text-[12px]">{s.template}</span>
                        )}
                      </td>
                      <td className="px-3 pt-2.5 pb-1 text-muted-foreground">{boundParams(s)}</td>
                      <td className="px-3 pt-2.5 pb-1 text-right tabular-nums">{s.unitsInRun.toLocaleString("en-US")}</td>
                      <td className="px-3 pt-2.5 pb-1 text-right tabular-nums" title={s.inputsInRun.toLocaleString("en-US")}>
                        {compact(s.inputsInRun)}
                      </td>
                      <td className="px-3 pt-2.5 pb-1 text-right tabular-nums">
                        {s.exported.toLocaleString("en-US")}
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          from {s.exportedUnits.toLocaleString("en-US")} units
                        </span>
                      </td>
                      <td
                        className="px-3 pt-2.5 pb-1 text-right tabular-nums"
                        title="Instances of this subcircuit's definition sampled at random and replayed; all matched bit for bit"
                      >
                        {s.replay ? `${s.replay.replayed_equal} of ${s.replay.drawn}` : "—"}
                      </td>
                      <td className="px-4 pt-2.5 pb-1 text-right tabular-nums text-muted-foreground">{megabytes(s.bytes)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 pb-2.5" colSpan={7}>
                        <Samples s={s} />
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Samples show each port&apos;s first values, decoded, and first words in hex. The GEMM coordinates&apos;
          replay count covers both of the run&apos;s GEMM subcircuits.
        </p>
      </section>
    </div>
  )
}
