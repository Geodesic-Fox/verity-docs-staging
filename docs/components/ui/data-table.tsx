"use client"

import * as React from "react"
import type {
  ColumnDef,
  ColumnFiltersState,
  Row,
  SortingState,
  Table as ReactTable,
  TableOptions,
  VisibilityState,
} from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type DataTableColumnDef<TData, TValue = unknown> = ColumnDef<TData, TValue>
type DataTableToolbarSlot<TData> =
  | React.ReactNode
  | ((table: ReactTable<TData>) => React.ReactNode)

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  className?: string
  tableContainerClassName?: string
  emptyMessage?: string
  enableRowSelection?: boolean
  filterColumn?: string
  filterPlaceholder?: string
  getRowId?: TableOptions<TData>["getRowId"]
  initialPageSize?: number
  onRowClick?: (row: Row<TData>) => void
  getRowAriaLabel?: (row: Row<TData>) => string
  getRowClassName?: (row: Row<TData>) => string | undefined
  pageSizeOptions?: number[]
  showSelectionCount?: boolean
  showPagination?: boolean
  toolbar?: DataTableToolbarSlot<TData> | false
}

function DataTable<TData, TValue>({
  columns,
  data,
  className,
  tableContainerClassName,
  emptyMessage = "No results.",
  enableRowSelection = true,
  filterColumn,
  filterPlaceholder,
  getRowId,
  initialPageSize = 40,
  onRowClick,
  getRowAriaLabel,
  getRowClassName,
  pageSizeOptions,
  showSelectionCount = true,
  showPagination = true,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's API intentionally returns table methods from this hook.
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    initialState: {
      pagination: {
        pageSize: initialPageSize,
      },
    },
    enableRowSelection,
    getRowId,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const renderedToolbar =
    typeof toolbar === "function" ? toolbar(table) : toolbar

  const totalRowCount = table.getCoreRowModel().rows.length
  const filteredRowCount = table.getFilteredRowModel().rows.length
  const recordCount = (
    <span className="text-sm whitespace-nowrap text-muted-foreground">
      {filteredRowCount === totalRowCount
        ? `${totalRowCount} record${totalRowCount === 1 ? "" : "s"}`
        : `${filteredRowCount} of ${totalRowCount} records`}
    </span>
  )

  const shouldIgnoreRowClick = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false

    return Boolean(
      target.closest(
        "a,button,input,select,textarea,[role='button'],[data-ignore-row-click]"
      )
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {toolbar !== false && (
        <DataTableToolbar
          table={table}
          filterColumn={filterColumn}
          filterPlaceholder={filterPlaceholder}
        >
          {recordCount}
          {renderedToolbar}
        </DataTableToolbar>
      )}
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-background",
          tableContainerClassName
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  aria-label={getRowAriaLabel?.(row)}
                  className={cn(
                    onRowClick && "cursor-pointer",
                    getRowClassName?.(row)
                  )}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={(event) => {
                    if (!onRowClick || shouldIgnoreRowClick(event.target)) {
                      return
                    }

                    onRowClick(row)
                  }}
                  onKeyDown={(event) => {
                    if (
                      !onRowClick ||
                      event.currentTarget !== event.target ||
                      shouldIgnoreRowClick(event.target)
                    ) {
                      return
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onRowClick(row)
                    }
                  }}
                  role={onRowClick ? "link" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {showPagination ? (
        <DataTablePagination
          table={table}
          pageSizeOptions={pageSizeOptions}
          showSelectionCount={showSelectionCount}
        />
      ) : null}
    </div>
  )
}

export {
  DataTable,
  type DataTableColumnDef,
  type DataTableProps,
  type DataTableToolbarSlot,
}
