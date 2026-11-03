import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const dir = () => path.join(process.cwd(), "data", "boolean")

export const dynamicParams = false

export function generateStaticParams() {
  return readdirSync(dir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ key: f.replace(/\.json$/, "") }))
}

// One served row's Boolean circuits, for the visualizer to load when you step below a primitive.
export async function GET(_: Request, { params }: RouteContext<"/docs/census/boolean/[key]">) {
  const { key } = await params
  return new Response(readFileSync(path.join(dir(), `${key}.json`), "utf8"), {
    headers: { "content-type": "application/json" },
  })
}
