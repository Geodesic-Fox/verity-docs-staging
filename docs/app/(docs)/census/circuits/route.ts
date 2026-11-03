import { circuitIndex } from "@/lib/circuit-index"

export const dynamic = "force-static"

// What the circuit viewer can open, for it to load when it opens.
export function GET() {
  return Response.json(circuitIndex())
}
