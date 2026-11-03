import { readFileSync } from "node:fs"

import { entitiesSnapshotPath } from "@/lib/entities"

export const dynamic = "force-static"

// The benchmark render's entities JSON behind the proof systems' tables, byte for byte.
export function GET() {
  return new Response(readFileSync(entitiesSnapshotPath(), "utf8"), {
    headers: { "content-type": "application/json" },
  })
}
