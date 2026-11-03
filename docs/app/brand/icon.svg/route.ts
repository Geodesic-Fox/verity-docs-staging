import { faviconSvg } from "@/lib/favicon"
import { getSiteEnv } from "@/lib/site-env"

export const dynamic = "force-static"

export function GET() {
  return new Response(faviconSvg(getSiteEnv()), {
    headers: { "Content-Type": "image/svg+xml" },
  })
}
