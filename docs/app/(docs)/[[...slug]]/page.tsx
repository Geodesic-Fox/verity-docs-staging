import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DocBody } from "@/components/content/doc-body"
import { getNeighbors, getPage, getPages, type DocPage } from "@/lib/docs"

export const dynamicParams = false

export function generateStaticParams() {
  return getPages().map((page) => ({ slug: page.slug }))
}

type Props = { params: Promise<{ slug?: string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = getPage(slug)
  if (!page) return {}
  return { title: page.title, description: page.description }
}

function PageNav({ page }: { page: DocPage }) {
  const { previous, next } = getNeighbors(page)
  return (
    <nav
      aria-label="Previous and next pages"
      className="mt-16 grid grid-cols-2 gap-4 border-t pt-6 font-sans text-sm"
    >
      {previous ? (
        <Link
          className="group flex flex-col gap-1 rounded-md py-1"
          href={previous.href}
        >
          <span className="text-xs text-muted-foreground">Previous</span>
          <span className="font-medium text-foreground group-hover:underline">
            {previous.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          className="group flex flex-col items-end gap-1 rounded-md py-1 text-right"
          href={next.href}
        >
          <span className="text-xs text-muted-foreground">Next</span>
          <span className="font-medium text-foreground group-hover:underline">
            {next.title}
          </span>
        </Link>
      ) : null}
    </nav>
  )
}

export default async function DocPageRoute({ params }: Props) {
  const { slug } = await params
  const page = getPage(slug)
  if (!page) notFound()

  return (
    <DocBody
      footer={<PageNav page={page} />}
      header={
        <header className="mb-10 flex flex-col gap-3">
          <h1 className="font-sans text-[2rem] leading-[1.16] font-[450] tracking-[-0.04em] text-balance text-foreground sm:text-[2.5rem]">
            {page.title}
          </h1>
          {page.body === undefined ? (
            <div className="mt-2 font-sans text-xs text-muted-foreground">
              <span className="rounded-md border border-dashed px-2.5 py-1">
                Placeholder
              </span>
            </div>
          ) : null}
        </header>
      }
      markdown={page.body ?? ""}
    />
  )
}
