import Link from "next/link"

import { getPage } from "@/lib/docs"
import { families } from "@/lib/families"
import { backendStanding } from "@/lib/tables"

// The backend families with a page, each linking to it, with what it is
// (from the tree) and how many benchmark lines it has a result on.
export function BackendList() {
  return (
    <div className="not-prose overflow-hidden rounded-lg border font-sans">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Proof system family</th>
            <th className="px-4 py-2.5 font-medium">What it is</th>
            <th className="px-4 py-2.5 text-right font-medium">Results</th>
          </tr>
        </thead>
        <tbody>
          {families.flatMap(({ href, ...family }) => {
            if (!href) return []
            const standing = backendStanding(family.column)
            return (
              <tr className="border-t" key={family.name}>
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  <Link className="hover:underline" href={href}>
                    {family.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {getPage(href.split("/").slice(2))?.description}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                  {standing.results} of {standing.lines}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
