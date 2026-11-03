import { readFileSync } from "node:fs"
import path from "node:path"

import index from "@/data/programs/index.json"

export const dynamicParams = false

export function generateStaticParams() {
  return index.rows.map((r) => ({ key: r.key }))
}

// One served row's Program graph, for the visualizer to load when picked.
export async function GET(_: Request, { params }: RouteContext<"/docs/census/programs/[key]">) {
  const { key } = await params
  return new Response(readFileSync(path.join(process.cwd(), "data", "programs", `${key}.json`), "utf8"), {
    headers: { "content-type": "application/json" },
  })
}
