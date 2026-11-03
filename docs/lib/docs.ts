import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { referencePages, treePages, type ReferenceHref } from "@/lib/tree"

/*
 * Pages come from the tree (lib/tree.ts), in sidebar order. Bodies are
 * optional markdown files under content/, named after the page's href. A
 * content file that the tree doesn't list fails loudly, so the two can't
 * drift apart.
 */

export type DocPage = {
  group: string | null
  label: string
  title: string
  description: string
  slug: string[]
  href: string
  cites: { href: ReferenceHref; label: string }[]
  layout?: "wide"
  body?: string
}

const contentDir = join(process.cwd(), "content")

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith(".md") ? [path] : []
  })
}

function load(): DocPage[] {
  const pages: DocPage[] = treePages().map(({ page, groups }) => {
      const rel = page.href === "/" ? "index" : page.href.slice(1)
      const file = join(contentDir, `${rel}.md`)
      return {
        group: groups[groups.length - 1]?.label ?? null,
        label: page.label,
        title: page.title ?? page.label,
        description: page.description,
        slug: rel === "index" ? [] : rel.split("/"),
        href: page.href,
        cites: (page.cites ?? []).map((cite) => ({
          href: cite,
          label: referencePages[cite],
        })),
        layout: page.layout,
        body: existsSync(file) ? readFileSync(file, "utf8") : undefined,
      }
    })

  const hrefs = new Set(pages.map((p) => p.href))
  if (hrefs.size !== pages.length) throw new Error("duplicate href in lib/tree.ts")
  for (const reference of Object.keys(referencePages)) {
    if (!hrefs.has(reference)) {
      throw new Error(`reference page ${reference} isn't in lib/tree.ts`)
    }
  }
  for (const file of walk(contentDir)) {
    const rel = relative(contentDir, file).replace(/\.md$/, "").split(sep).join("/")
    if (!hrefs.has(rel === "index" ? "/" : `/${rel}`)) {
      throw new Error(`content/${rel}.md isn't in lib/tree.ts`)
    }
  }
  return pages
}

let cache: DocPage[] | undefined

export function getPages(): DocPage[] {
  if (!cache || process.env.NODE_ENV === "development") cache = load()
  return cache
}

export function getPage(slug: string[] = []): DocPage | undefined {
  const href = slug.length ? `/${slug.join("/")}` : "/"
  return getPages().find((page) => page.href === href)
}

export function getNeighbors(page: DocPage) {
  const pages = getPages()
  const index = pages.findIndex((p) => p.href === page.href)
  return { previous: pages[index - 1], next: pages[index + 1] }
}
