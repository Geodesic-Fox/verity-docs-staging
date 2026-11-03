import { readFileSync } from "node:fs"
import path from "node:path"

export const dynamic = "force-static"

// The Definition bodies the served rows' Calls apply, for the visualizer to load when you step inside a Call.
export function GET() {
  return new Response(readFileSync(path.join(process.cwd(), "data", "definitions.json"), "utf8"), {
    headers: { "content-type": "application/json" },
  })
}
