import { readFileSync } from "node:fs"
import path from "node:path"

import index from "@/data/serving/index.json"

export const dynamicParams = false

export function generateStaticParams() {
  return index.rows.map((r) => ({ key: r.key }))
}

// One served row's serving view, laid out by engine step, for the visualizer to load when asked.
export async function GET(_: Request, { params }: RouteContext<"/docs/census/serving/[key]">) {
  const { key } = await params
  return new Response(readFileSync(path.join(process.cwd(), "data", "serving", `${key}.json`), "utf8"), {
    headers: { "content-type": "application/json" },
  })
}
