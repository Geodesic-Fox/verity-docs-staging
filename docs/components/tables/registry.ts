import type { ComponentType } from "react"

import { BackendList } from "@/components/backends/backend-list"
import { ServedConfigurations } from "@/components/census/served-configurations"
import { SubcircuitTemplates } from "@/components/census/subcircuit-templates"
import { Table1Backends } from "@/components/tables/table-1-backends"
import { Table2Matrix } from "@/components/tables/table-2-matrix"
import { Table3Breakdown } from "@/components/tables/table-3-breakdown"

// `family` is a backend family's renderer name, e.g. "B-Ligero".
export type TableEmbedProps = { family?: string }

// Pages embed a table with `![Table 2](/tables/table-2)`, or one
// backend family's slice with `![Table 2](/tables/table-2?family=B-Ligero)`.
// `![Backends](/tables/backends)` lists the backend families.
export const tableComponents: Record<string, ComponentType<TableEmbedProps>> = {
  backends: BackendList,
  "served-configs": ServedConfigurations,
  "subcircuit-templates": SubcircuitTemplates,
  "table-1": Table1Backends,
  "table-2": Table2Matrix,
  "table-3": Table3Breakdown,
}
