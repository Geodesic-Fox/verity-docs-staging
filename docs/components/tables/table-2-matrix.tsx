import { Table2DataTable } from "@/components/tables/benchmark-data-table"
import type { TableEmbedProps } from "@/components/tables/registry"
import { TableFrame } from "@/components/tables/table-frame"
import { familyName } from "@/lib/families"
import { filterTableToFamily, getTable } from "@/lib/tables"

export function Table2View({ family }: TableEmbedProps) {
  const full = getTable("table-2")
  const table = family ? filterTableToFamily(full, family) : full
  return (
    <Table2DataTable
      emptyMessage={family ? `No admissible result for ${familyName(family)} yet.` : undefined}
      table={table}
    />
  )
}

export function Table2Matrix({ family }: TableEmbedProps) {
  return (
    <TableFrame family={family} title="Proving overhead">
      <Table2View family={family} />
    </TableFrame>
  )
}
