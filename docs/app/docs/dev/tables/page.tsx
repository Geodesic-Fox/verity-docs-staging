import { notFound } from "next/navigation"

import { DocBody } from "@/components/content/doc-body"
import { getSiteEnv } from "@/lib/site-env"

// A preview of every table embed, outside the tree, for development and
// preview deployments only. Pages embed the same components from markdown.
const markdown = `
![Table 2](/tables/table-2)

![Table 3](/tables/table-3)

![Table 1](/tables/table-1)

## Filtered to one backend family

![Table 2](/tables/table-2?family=B-Ligero)

![Table 3](/tables/table-3?family=B-Ligero)

![Table 2](/tables/table-2?family=A-GKR)
`

export const metadata = { title: "Table embeds" }

export default function TablesPreviewPage() {
  if (getSiteEnv() === "production") notFound()
  return (
    <DocBody
      header={
        <header className="mb-10 flex flex-col gap-3">
          <h1 className="font-sans text-[2rem] leading-[1.16] font-[450] tracking-[-0.04em] text-foreground sm:text-[2.5rem]">
            Table embeds
          </h1>
          <p className="font-sans text-[16px] leading-relaxed text-muted-foreground">
            Every table component, from the committed snapshot. Not in the
            sidebar; hidden in production.
          </p>
        </header>
      }
      markdown={markdown}
    />
  )
}
