import { SecurityTable } from "@/components/assumptions/security-table"
import { CellText, PillList } from "@/components/tables/cells"
import type { TableEmbedProps } from "@/components/tables/registry"
import { TableFrame } from "@/components/tables/table-frame"
import { familyName } from "@/lib/families"
import { filterTableToFamily, getTable } from "@/lib/tables"

// List-shaped columns render as pills; the description is the row's hover
// title, since the page already describes each family.
const PILL_COLUMNS = new Set(["Interaction", "Security assumptions"])
const TITLE_COLUMN = "Description"

export function Table1View({ family }: TableEmbedProps) {
  const full = getTable("table-1")
  const table = family ? filterTableToFamily(full, family) : full

  if (!table.rows.length) {
    return (
      <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
        {familyName(family ?? "")} isn&apos;t in the published Table 1 yet.
      </p>
    )
  }

  const titleIndex = table.columns.indexOf(TITLE_COLUMN)
  const shown = table.columns
    .map((column, i) => ({ column, i }))
    .filter(({ i }) => i !== titleIndex)

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">{table.rowHeader}</th>
            {shown.map(({ column }) => (
              <th className="px-4 py-2.5 font-medium" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr className="border-t align-top" key={row.label}>
              <th
                className="px-4 py-3 text-left font-medium whitespace-nowrap"
                scope="row"
                title={titleIndex >= 0 ? row.cells[titleIndex]?.display : undefined}
              >
                {row.label}
              </th>
              {shown.map(({ column, i }) => {
                const cell = row.cells[i]!
                return (
                  <td
                    className={
                      PILL_COLUMNS.has(column)
                        ? "min-w-[14rem] px-4 py-3"
                        : "min-w-[8rem] px-4 py-3"
                    }
                    key={column}
                  >
                    {PILL_COLUMNS.has(column) ? (
                      <PillList display={cell.display} />
                    ) : (
                      <CellText display={cell.display} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Table1Backends({ family }: TableEmbedProps) {
  return (
    <TableFrame family={family} title="Security">
      <SecurityTable family={family} />
    </TableFrame>
  )
}
