"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createContext, Suspense, useContext, type ReactNode } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TokenButton } from "@/components/assumptions/token-button"
import type { DialogEntry } from "@/lib/assumption-index"

/*
 * Opens a registry entry in a dialog: the idea in words, then the formal
 * statement with every symbol defined, then (for assumptions) how far to
 * trust it and why. The open entry lives in the URL (?assumption=<id>), so
 * a dialog can be linked and Back closes it.
 */

const kindLabels = {
  property: "Property",
  assumption: "Assumption",
  scheme: "Commitment scheme",
  template: "Subcircuit template",
  subcircuit: "Subcircuit",
}

const OpenContext = createContext<(id: string) => void>(() => {})

export function useOpenAssumption() {
  return useContext(OpenContext)
}

function EntryDialog({ entries, circuits }: { entries: Record<string, DialogEntry>; circuits: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const id = params.get("assumption")
  const entry = id ? entries[id] : undefined

  const close = () => {
    const query = new URLSearchParams(params)
    query.delete("assumption")
    const qs = query.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <Dialog onOpenChange={(open) => (open ? null : close())} open={Boolean(entry)}>
      {entry ? (
        <DialogContent className="max-h-[85svh] gap-5 overflow-y-auto sm:max-w-[520px]">
          <DialogHeader className="gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {entry.trustLabel ? (
                <span className="docs-trust" data-trust={entry.trust}>
                  {entry.trustLabel}
                </span>
              ) : (
                <span>{kindLabels[entry.kind]}</span>
              )}
              <code className="font-mono">{entry.id}</code>
            </div>
            <DialogTitle className="text-base font-semibold tracking-[-0.01em]">
              {entry.name}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-foreground">
              {entry.summary}
            </DialogDescription>
          </DialogHeader>

          {entry.note ? (
            <p className="rounded-md border border-dashed border-[var(--trust-caution-border)] bg-[var(--trust-caution-bg)] px-3 py-2 text-[13px] text-[var(--trust-caution-fg)]">
              {entry.note}
            </p>
          ) : null}

          {entry.statementHtml ? (
            <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
              <div
                className="overflow-x-auto text-[14px]"
                dangerouslySetInnerHTML={{ __html: entry.statementHtml }}
              />
              {entry.where.length ? (
                <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 border-t pt-3 text-[13px]">
                  <span className="col-span-2 text-xs text-muted-foreground">where</span>
                  {entry.where.map((symbol, i) => (
                    <div className="contents" key={i}>
                      <dt
                        className="text-right"
                        dangerouslySetInnerHTML={{ __html: symbol.symbolHtml }}
                      />
                      <dd
                        className="text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: symbol.meaningHtml }}
                      />
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}

          {entry.details.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              {entry.details.map((detail) => (
                <div className="contents" key={detail.label}>
                  <dt className="text-muted-foreground">{detail.label}</dt>
                  <dd
                    className={
                      detail.label === "Instruction"
                        ? "font-mono text-[12.5px]"
                        : detail.label === "Known gap"
                          ? "text-[var(--trust-caution-fg)]"
                          : undefined
                    }
                  >
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {entry.related.map((group) =>
            group.tokens.length ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs" key={group.label}>
                <span className="text-muted-foreground">{group.label}</span>
                {group.tokens.map((token) => (
                  <TokenButton key={token.id} {...token} />
                ))}
              </div>
            ) : null
          )}

          {entry.whyHtml ? (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Why {entry.trustLabel?.toLowerCase()}</span>
              <p dangerouslySetInnerHTML={{ __html: entry.whyHtml }} />
              {entry.attackHtml ? (
                <p
                  className="text-xs text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: entry.attackHtml }}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-xs">
            {entry.refs.map((ref) => (
              <a
                className="text-muted-foreground hover:text-foreground"
                href={ref.href}
                key={ref.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {ref.label} ↗
              </a>
            ))}
            {(entry.kind === "subcircuit" || entry.kind === "template") && circuits.includes(entry.id) ? (
              <Link
                className="ml-auto font-medium hover:underline"
                href={`${pathname}?${new URLSearchParams({ circuit: entry.id })}`}
                scroll={false}
              >
                View circuit
              </Link>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

export function AssumptionProvider({
  entries,
  circuits = [],
  children,
}: {
  entries: Record<string, DialogEntry>
  // The template and subcircuit entries that open a circuit.
  circuits?: string[]
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const open = (id: string) => {
    const query = new URLSearchParams(window.location.search)
    query.set("assumption", id)
    router.push(`${pathname}?${query}`, { scroll: false })
  }
  return (
    <OpenContext.Provider value={open}>
      {children}
      <Suspense fallback={null}>
        <EntryDialog circuits={circuits} entries={entries} />
      </Suspense>
    </OpenContext.Provider>
  )
}
