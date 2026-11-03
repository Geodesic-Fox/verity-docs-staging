import { z } from "zod"

import rawSnapshot from "@/data/tables/snapshot.json"

/*
 * The committed tables snapshot, validated at build time: a snapshot that
 * doesn't match fails the build. Components print `display` verbatim;
 * `value` and `share` only drive shading and bar widths.
 */

const cellSchema = z.object({
  display: z.string(),
  footnote: z.number().int().optional(),
  value: z.number().optional(),
  share: z.number().optional(),
})

const tableSchema = z.object({
  id: z.enum(["table-1", "table-2", "table-3"]),
  standard: z.enum(["published", "new"]),
  title: z.string(),
  caption: z.string(),
  rowHeader: z.string(),
  columns: z.array(z.string()),
  rows: z.array(
    z.object({
      label: z.string(),
      cells: z.array(cellSchema),
    })
  ),
})

const snapshotSchema = z.object({
  schema: z.literal("verity-docs/tables-snapshot/v0"),
  renderedAt: z.string(),
  verityCommit: z.string(),
  source: z.string(),
  tables: z.array(tableSchema),
})

export type TableCell = z.infer<typeof cellSchema>
export type BenchmarkTableData = z.infer<typeof tableSchema>
export type TablesSnapshot = z.infer<typeof snapshotSchema>

export const tablesSnapshot: TablesSnapshot = snapshotSchema.parse(rawSnapshot)

export function getTable(id: BenchmarkTableData["id"]): BenchmarkTableData {
  const table = tablesSnapshot.tables.find((t) => t.id === id)
  if (!table) throw new Error(`table ${id} missing from the snapshot`)
  return table
}

/*
 * A backend family's Table 2 standing, for catalog cards: how many lines it
 * has a result on, and its lowest-overhead cell (chosen by `value`, printed
 * by `display`).
 */
export function backendStanding(family: string) {
  const table = getTable("table-2")
  const column = table.columns.indexOf(family)
  if (column < 0) throw new Error(`table-2 has no column for ${family}`)
  const results = table.rows
    .map((row) => ({ line: row.label, cell: row.cells[column]! }))
    .filter(({ cell }) => cell.display !== "—")
  const best = results
    .filter(({ cell }) => cell.value !== undefined)
    .sort((a, b) => a.cell.value! - b.cell.value!)[0]
  return { lines: table.rows.length, results: results.length, best }
}

/*
 * One backend family's slice of a table, for its page. Cells are the same
 * objects as in the full table; only rows and columns are selected.
 *   - Table 1: that family's row.
 *   - Table 2: Native N and that family's column, on the lines where it has
 *     a result (any cell other than "—").
 *   - Table 3: the cells whose label ends with that family.
 */
export function filterTableToFamily(
  table: BenchmarkTableData,
  family: string
): BenchmarkTableData {
  if (table.id === "table-1") {
    return { ...table, rows: table.rows.filter((r) => r.label === family) }
  }
  if (table.id === "table-2") {
    const keep = [table.columns.indexOf("Native N"), table.columns.indexOf(family)]
    if (keep.some((i) => i < 0)) {
      throw new Error(`table-2 has no column for ${family}`)
    }
    const [, familyIndex] = keep
    return {
      ...table,
      columns: keep.map((i) => table.columns[i]!),
      rows: table.rows
        .filter((r) => r.cells[familyIndex!]?.display !== "—")
        .map((r) => ({ ...r, cells: keep.map((i) => r.cells[i]!) })),
    }
  }
  return {
    ...table,
    rows: table.rows.filter((r) => r.label.endsWith(` · ${family}`)),
  }
}
