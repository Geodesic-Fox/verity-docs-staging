"use client"

import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createContext, Suspense, useCallback, useContext, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CIRCUIT_PARAMS } from "@/lib/circuits"

/*
 * Opens a circuit over the page: a large dialog on a desktop, a drawer from
 * the bottom on a phone. The open circuit and where you are in it live in
 * the URL (?circuit=<key>&at=<place>, lib/circuits.ts), so a link can open
 * one at any level and Back closes it. The viewer loads only when a circuit
 * opens.
 */

const CircuitView = dynamic(() => import("@/components/census/circuit-view").then((m) => m.CircuitView), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Loading…</div>,
})

const NARROW = "(max-width: 767px)"
const subscribe = (onChange: () => void) => {
  const m = window.matchMedia(NARROW)
  m.addEventListener("change", onChange)
  return () => m.removeEventListener("change", onChange)
}
// Null until the page knows its width, so a phone never flashes the dialog.
const useNarrow = () => useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches, () => null)

type Open = (key: string, at?: string) => void
const OpenContext = createContext<Open>(() => {})

export const useOpenCircuit = () => useContext(OpenContext)

export const circuitHref = (key: string, at?: string) => `?${new URLSearchParams(at ? { circuit: key, at } : { circuit: key })}`

// A link that opens a circuit; with a modifier key, it opens the page with the circuit in a new tab.
export function CircuitLink({ circuit, at, className, children }: { circuit: string; at?: string; className?: string; children: ReactNode }) {
  const open = useOpenCircuit()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    open(circuit, at)
  }
  return (
    <a className={className} data-circuit={circuit} href={circuitHref(circuit, at)} onClick={onClick}>
      {children}
    </a>
  )
}

function CircuitModal() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const circuit = params.get("circuit")
  const at = params.get("at")
  const narrow = useNarrow()
  // The circuit closing stays drawn until it's gone.
  const last = useRef(circuit)
  if (circuit) last.current = circuit

  const navigate = useCallback(
    (query: URLSearchParams) => {
      const qs = query.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname]
  )
  const close = useCallback(() => {
    const query = new URLSearchParams(window.location.search)
    for (const k of CIRCUIT_PARAMS) query.delete(k)
    navigate(query)
  }, [navigate])
  const swap = useCallback(
    (key: string) => {
      const query = new URLSearchParams(window.location.search)
      query.set("circuit", key)
      query.delete("at")
      navigate(query)
    },
    [navigate]
  )
  // Where you are replaces the URL's place as you go, so Back still closes the circuit.
  const onPlace = useCallback((place: string | null) => {
    const url = new URL(window.location.href)
    if (!url.searchParams.get("circuit") || url.searchParams.get("at") === place) return
    if (place) url.searchParams.set("at", place)
    else url.searchParams.delete("at")
    window.history.replaceState(null, "", url)
  }, [])

  if (narrow === null) return null
  const shown = circuit ?? last.current
  // The modal sits outside the docs shell, and its tooltip provider.
  const view = shown ? (
    <TooltipProvider delayDuration={0}>
      <CircuitView
        at={circuit ? at : null}
        circuit={shown}
        narrow={narrow}
        onClose={close}
        onOpen={swap}
        onPlace={onPlace}
        Title={narrow ? DrawerTitle : DialogTitle}
      />
    </TooltipProvider>
  ) : null
  const onOpenChange = (open: boolean) => {
    if (!open) close()
  }
  // Focus the sheet itself, not its first control, whose tooltip would open.
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).focus()
  }
  if (narrow) {
    return (
      <Drawer onOpenChange={onOpenChange} open={Boolean(circuit)}>
        <DrawerContent
          aria-describedby={undefined}
          className="h-[94svh] data-[vaul-drawer-direction=bottom]:max-h-[94svh]"
          data-circuit-modal=""
          onOpenAutoFocus={onOpenAutoFocus}
        >
          {view}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(circuit)}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[min(92svh,1200px)] w-[min(96vw,1880px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        data-circuit-modal=""
        onOpenAutoFocus={onOpenAutoFocus}
        showCloseButton={false}
      >
        {view}
      </DialogContent>
    </Dialog>
  )
}

export function CircuitProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const open = useCallback<Open>(
    (key, at) => {
      const query = new URLSearchParams(window.location.search)
      for (const k of CIRCUIT_PARAMS) query.delete(k)
      query.delete("assumption")
      query.set("circuit", key)
      if (at) query.set("at", at)
      router.push(`${pathname}?${query}`, { scroll: false })
    },
    [router, pathname]
  )
  return (
    <OpenContext.Provider value={open}>
      {children}
      <Suspense fallback={null}>
        <CircuitModal />
      </Suspense>
    </OpenContext.Provider>
  )
}
