import { Table3DataTable } from "@/components/tables/benchmark-data-table"
import type { TableEmbedProps } from "@/components/tables/registry"
import { TableFrame } from "@/components/tables/table-frame"
import { familyName } from "@/lib/families"
import { filterTableToFamily, getTable } from "@/lib/tables"

// Stage columns that add up to the cell. Total and one-time setup sit
// outside the bar.
const TOTAL_PREFIX = "Total"
const SETUP_PREFIX = "Setup"

const stageColors = [
  "oklch(0.55 0.12 255)",
  "oklch(0.7 0.1 225)",
  "oklch(0.72 0.11 165)",
  "oklch(0.62 0.13 290)",
  "oklch(0.68 0.14 40)",
  "oklch(0.8 0.11 85)",
  "oklch(0.65 0.1 340)",
  "oklch(0.5 0.02 260)",
  "oklch(0.82 0.01 260)",
]

export function Table3View({ family }: TableEmbedProps) {
  const full = getTable("table-3")
  const table = family ? filterTableToFamily(full, family) : full
  const stages = table.columns
    .map((column, i) => ({ column, i }))
    .filter(
      ({ column }) =>
        !column.startsWith(TOTAL_PREFIX) && !column.startsWith(SETUP_PREFIX)
    )
  const totalIndex = table.columns.findIndex((c) => c.startsWith(TOTAL_PREFIX))

  if (!table.rows.length) {
    return (
      <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
        No result for {familyName(family ?? "")} yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {stages.map(({ column }, k) => (
            <span className="inline-flex items-center gap-1.5" key={column}>
              <span
                aria-hidden="true"
                className="size-2 rounded-[2px]"
                style={{ background: stageColors[k % stageColors.length] }}
              />
              {column}
            </span>
          ))}
        </div>
        <ol className="docs-bars">
          {table.rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-4 text-xs">
                <span className="min-w-0 truncate" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {totalIndex >= 0 ? row.cells[totalIndex]?.display : null}
                </span>
              </div>
              <div
                aria-label={`Stage shares for ${row.label}`}
                className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted"
                role="img"
              >
                {stages.map(({ column, i }, k) => {
                  const share = Math.max(0, row.cells[i]?.share ?? 0)
                  if (share === 0) return null
                  return (
                    <span
                      key={column}
                      style={{
                        width: `${share}%`,
                        background: stageColors[k % stageColors.length],
                      }}
                      title={`${column}: ${row.cells[i]?.display}`}
                    />
                  )
                })}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <Table3DataTable table={table} />
    </div>
  )
}

export function Table3Breakdown({ family }: TableEmbedProps) {
  return (
    <TableFrame family={family} title="Where the overhead comes from">
      <Table3View family={family} />
    </TableFrame>
  )
}
