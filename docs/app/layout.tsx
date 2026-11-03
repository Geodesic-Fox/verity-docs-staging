import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import "katex/dist/katex.min.css"
import { ThemeProvider } from "@/components/theme-provider"
import { getSiteEnv, titlePrefix } from "@/lib/site-env"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

const siteEnv = getSiteEnv()

export const metadata: Metadata = {
  title: {
    default: `${titlePrefix[siteEnv]}Verity documentation`,
    template: `${titlePrefix[siteEnv]}%s · Verity documentation`,
  },
  description:
    "How Verity represents computations, proves claims about them, and measures what proving costs.",
  robots: siteEnv === "production" ? undefined : { index: false, follow: false },
  icons: {
    icon: { url: "/brand/icon.svg", type: "image/svg+xml" },
    apple: "/brand/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
