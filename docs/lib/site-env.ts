/*
 * The one place that decides which environment this build is. Production
 * branding appears only when Vercel says production; an unset VERCEL_ENV
 * (plain `next dev`, or a local `next build`) counts as development.
 */
export type SiteEnv = "development" | "preview" | "production"

export function getSiteEnv(): SiteEnv {
  switch (process.env.VERCEL_ENV) {
    case "production":
      return "production"
    case "preview":
      return "preview"
    default:
      return "development"
  }
}

export const titlePrefix: Record<SiteEnv, string> = {
  development: "[DEV] ",
  preview: "[PREVIEW] ",
  production: "",
}
