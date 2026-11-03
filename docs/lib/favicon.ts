import type { SiteEnv } from "@/lib/site-env"

/*
 * Favicons drawn from the BoundaryMark ("asymmetric", the header's mark).
 * Production is the mark alone and follows the browser's color scheme;
 * preview sits on an amber tile and development on a red one, so a tab
 * never passes for production.
 */

// The mark's path in its 72×64 box, centered in a 72×72 square.
const MARK_PATH = "M26 10H10V29 M45 54H62V37"
const MARK_TRANSFORM = "translate(0 4)"

const tiles: Record<Exclude<SiteEnv, "production">, { bg: string; ink: string }> = {
  preview: { bg: "#f59e0b", ink: "#1c1917" },
  development: { bg: "#dc2626", ink: "#ffffff" },
}

export function faviconSvg(env: SiteEnv): string {
  if (env === "production") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
<style>path{stroke:#171717}@media (prefers-color-scheme:dark){path{stroke:#f5f5f5}}</style>
<path d="${MARK_PATH}" transform="${MARK_TRANSFORM}" fill="none" stroke-width="7" stroke-linecap="square" stroke-linejoin="miter"/>
</svg>`
  }
  const { bg, ink } = tiles[env]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
<rect width="72" height="72" rx="14" fill="${bg}"/>
<g transform="translate(9 9) scale(0.75)"><path d="${MARK_PATH}" transform="${MARK_TRANSFORM}" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="square" stroke-linejoin="miter"/></g>
</svg>`
}

export const appleIconColors: Record<SiteEnv, { bg: string; ink: string }> = {
  production: { bg: "#ffffff", ink: "#171717" },
  ...tiles,
}
