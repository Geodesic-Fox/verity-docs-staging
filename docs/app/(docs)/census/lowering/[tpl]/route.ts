import { loweringTemplates, templateLowering } from "@/lib/circuit-index"

export const dynamicParams = false

export function generateStaticParams() {
  return loweringTemplates().map((tpl) => ({ tpl }))
}

// One template's Boolean circuits, for a Definition opened on its own to step below its primitives.
export async function GET(_: Request, { params }: RouteContext<"/census/lowering/[tpl]">) {
  const { tpl } = await params
  const lowering = templateLowering(tpl)
  if (!lowering) return new Response("no such template", { status: 404 })
  return Response.json(lowering)
}
