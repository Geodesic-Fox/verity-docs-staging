import { fmtSize } from "@/components/census/circuit-format"
import { ProgramTable } from "@/components/census/program-table"
import { circuitIndex } from "@/lib/circuit-index"

// Pages embed the table of Programs on record with `![Served Programs](/graphs/programs)`; a row
// opens its circuit.
export function GraphEmbed({ id }: { id: string }) {
  if (id !== "programs") throw new Error(`unknown graph embed /graphs/${id}`)
  const index = circuitIndex()
  const gates = Object.fromEntries(
    Object.entries(index.gates).map(([key, n]) => [key, n === null ? null : fmtSize(n).replace(/ gates?$/, "")])
  )
  return <ProgramTable gates={gates} rows={index.programs} />
}
