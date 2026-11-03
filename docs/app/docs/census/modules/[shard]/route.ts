import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { gunzipSync } from "node:zlib"

const dir = () => path.join(process.cwd(), "data", "boolean", "modules")

export function generateStaticParams() {
  if (!existsSync(dir())) return []
  return readdirSync(dir())
    .filter((f) => f.endsWith(".json.gz"))
    .map((f) => ({ shard: f.replace(/\.json\.gz$/, "") }))
}

// The circuit types whose digests start with these two hex digits: each one's own ANDs, reads and
// the calls of its parts, which the visualizer expands to gates as you step down.
export async function GET(_: Request, { params }: RouteContext<"/docs/census/modules/[shard]">) {
  const { shard } = await params
  const file = path.join(dir(), `${shard}.json.gz`)
  if (!/^[0-9a-f]{2}$/.test(shard) || !existsSync(file)) return new Response("{}", { headers: { "content-type": "application/json" } })
  return new Response(gunzipSync(readFileSync(file)), { headers: { "content-type": "application/json" } })
}
