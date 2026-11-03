"use client"

import type * as React from "react"
import type { Table } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { DataTableViewOptions } from "@/components/ui/data-table-view-options"
import { Input } from "@/components/ui/input"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  filterColumn?: string
  filterPlaceholder?: string
  showViewOptions?: boolean
  children?: React.ReactNode
}

function DataTableToolbar<TData>({
  table,
  filterColumn,
  filterPlaceholder = "Filter rows...",
  showViewOptions = true,
  children,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0
  const column = filterColumn ? table.getColumn(filterColumn) : undefined

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {column && (
          <Input
            placeholder={filterPlaceholder}
            value={(column.getFilterValue() as string) ?? ""}
            onChange={(event) => column.setFilterValue(event.target.value)}
            className="h-8 w-full sm:w-64"
          />
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
          >
            Reset
          </Button>
        )}
        {children}
      </div>
      {showViewOptions && <DataTableViewOptions table={table} />}
    </div>
  )
}

export { DataTableToolbar, type DataTableToolbarProps }

