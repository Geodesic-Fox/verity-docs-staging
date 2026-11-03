"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { DataCell } from "@/components/tables/cells"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter"
import { familyName } from "@/lib/families"
import { datatypeLabel, hardwareLabel } from "@/lib/labels"
import type { BenchmarkTableData } from "@/lib/tables"

type Row = {
  id: string
  label: string
  parts: string[]
  cells: BenchmarkTableData["rows"][number]["cells"]
}

const SEP = " · "

function includesSelected(value: unknown, selected: string[] | undefined) {
  return !selected?.length || selected.includes(String(value))
}

function toRows(table: BenchmarkTableData): Row[] {
  return table.rows.map((row) => ({
    id: row.label,
    label: row.label,
    parts: row.label.split(SEP),
    cells: row.cells,
  }))
}

function valueColumns(table: BenchmarkTableData): ColumnDef<Row>[] {
  return table.columns.map((title, i) => ({
    id: `c${i}`,
    accessorFn: (row) => row.cells[i]?.value,
    sortUndefined: "last",
    header: ({ column }) => (
      <div className="flex justify-end">
        <DataTableColumnHeader column={column} title={familyName(title)} />
      </div>
    ),
    cell: ({ row }) => {
      const cell = row.original.cells[i]
      if (!cell) return null
      return (
        <div className="text-right">
          <DataCell display={cell.display} footnote={cell.footnote} />
        </div>
      )
    },
  }))
}

const tableProps = {
  enableRowSelection: false,
  initialPageSize: 100,
  showPagination: false,
  toolbar: false as const,
  tableContainerClassName: "docs-data-table overflow-x-auto",
}

// Table 2: rows are "device · dtype · subcircuit · scheme…". The
// subcircuit is one per device and datatype, so it stays out of the view.
export function Table2DataTable({
  table,
  emptyMessage,
}: {
  table: BenchmarkTableData
  emptyMessage?: string
}) {
  const rows = toRows(table)

  const facet = (
    id: string,
    title: string,
    pick: (row: Row) => string
  ): ColumnDef<Row> => ({
    id,
    accessorFn: pick,
    header: ({ column }) => (
      <DataTableFacetedFilter
        column={column}
        options={[...new Set(rows.map(pick))].map((value) => ({
          label: value,
          value,
        }))}
        title={title}
      />
    ),
    cell: ({ getValue }) => <span>{String(getValue())}</span>,
    filterFn: (row, columnId, value: string[]) =>
      includesSelected(row.getValue(columnId), value),
  })

  const columns: ColumnDef<Row>[] = [
    facet("device", "Hardware", (row) => hardwareLabel(row.parts[0] ?? "")),
    facet("dtype", "Datatype", (row) => datatypeLabel(row.parts[1] ?? "")),
    facet("scheme", "Scheme", (row) => row.parts.slice(3).join(SEP)),
    ...valueColumns(table),
  ]

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage={emptyMessage}
      {...tableProps}
    />
  )
}

// Table 3: one row per Table 2 cell, labelled "subcircuit · scheme… · backend".
export function Table3DataTable({ table }: { table: BenchmarkTableData }) {
  const rows = toRows(table)
  const columns: ColumnDef<Row>[] = [
    {
      id: "cell",
      accessorFn: (row) => row.label,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={table.rowHeader} />
      ),
      cell: ({ getValue }) => (
        <span className="block min-w-[16rem]">{String(getValue())}</span>
      ),
    },
    ...valueColumns(table),
  ]
  return <DataTable columns={columns} data={rows} {...tableProps} />
}
