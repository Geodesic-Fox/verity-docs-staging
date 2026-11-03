import Link from "next/link"
import type { ReactNode } from "react"

import { familyName } from "@/lib/families"
import { tablesSnapshot } from "@/lib/tables"

export const benchmarksHref = "/proof-systems/performance"
export const tablesDataHref = "/proof-systems/data.json"

/*
 * The frame for a table embedded in a docs page: one short title, the table,
 * and one footer line with the render. `family` marks a one-family slice,
 * whose footer links the tables over every proof system.
 */
export function TableFrame({
  title,
  family,
  children,
}: {
  title: string
  family?: string
  children: ReactNode
}) {
  return (
    <figure className="docs-table not-prose" data-breakout="">
      <div className="mb-3 text-sm font-medium text-foreground">
        {title}
        {family ? (
          <span className="font-normal text-muted-foreground"> · {familyName(family)}</span>
        ) : null}
      </div>
      {children}
      <figcaption className="mt-3 text-xs text-muted-foreground">
        Render of {tablesSnapshot.renderedAt} ·{" "}
        {family ? (
          <Link
            className="text-foreground underline-offset-2 hover:underline"
            href={benchmarksHref}
          >
            All proof systems
          </Link>
        ) : (
          <a
            className="text-foreground underline-offset-2 hover:underline"
            download
            href={tablesDataHref}
          >
            Download JSON
          </a>
        )}
      </figcaption>
    </figure>
  )
}
