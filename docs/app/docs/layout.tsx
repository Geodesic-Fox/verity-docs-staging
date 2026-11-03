import { AssumptionProvider } from "@/components/assumptions/assumption-provider"
import { CircuitProvider } from "@/components/census/circuit-modal"
import { DocsShell } from "@/components/shell/docs-shell"
import { getDialogEntries } from "@/lib/assumption-index"
import { viewableEntries } from "@/lib/circuit-index"
import { PreviewBanner } from "@/components/shell/preview-banner"
import { getSiteEnv } from "@/lib/site-env"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AssumptionProvider circuits={viewableEntries()} entries={getDialogEntries()}>
      <CircuitProvider>
        <DocsShell banner={getSiteEnv() === "preview" ? <PreviewBanner /> : null}>
          {children}
        </DocsShell>
      </CircuitProvider>
    </AssumptionProvider>
  )
}
