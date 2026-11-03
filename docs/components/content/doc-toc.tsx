"use client"

import type { MouseEvent, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export type DocTocItem = {
  id: string
  nested: boolean
  label: ReactNode
  title: string
}

const scrollKeys = new Set([" ", "ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"])

/*
 * The "On this page" rail, after Vercel's docs: 32px rows on a 1px track,
 * the section being read darkened, medium and marked on the track. A
 * section is being read once its heading has passed the top fifth of the
 * viewport; over the last screen of scroll that line slides down to the
 * bottom so the closing sections each get their turn. A click jumps
 * natively (hash, history, scroll-margin). The section a click or the URL
 * hash names stays marked until the reader scrolls: the browser's own
 * fragment scrolls and layout shifts don't count.
 */
export function DocToc({ items }: { items: DocTocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id)
  const listRef = useRef<HTMLUListElement | null>(null)
  const heldRef = useRef(false)

  useEffect(() => {
    let frame = 0

    function update() {
      frame = 0
      if (!heldRef.current) setActiveId(readingId(items))
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update)
    }
    function followHash() {
      const id = decodeURIComponent(window.location.hash.slice(1))
      heldRef.current = items.some((item) => item.id === id)
      if (heldRef.current) setActiveId(id)
      else schedule()
    }
    function release() {
      if (!heldRef.current) return
      heldRef.current = false
      schedule()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (scrollKeys.has(event.key)) release()
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target === document.documentElement) release()
    }

    followHash()
    const article = document.getElementById(items[0]?.id ?? "")?.closest("article")
    const resizeObserver = new ResizeObserver(schedule)
    if (article) resizeObserver.observe(article)
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    window.addEventListener("hashchange", followHash)
    window.addEventListener("wheel", release, { passive: true })
    window.addEventListener("touchmove", release, { passive: true })
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("hashchange", followHash)
      window.removeEventListener("wheel", release)
      window.removeEventListener("touchmove", release)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [items])

  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>("[data-active]")
    if (!list || !row || list.scrollHeight <= list.clientHeight) return
    const margin = row.offsetHeight * 2
    let top = list.scrollTop
    if (row.offsetTop - margin < top) {
      top = row.offsetTop - margin
    } else if (row.offsetTop + row.offsetHeight + margin > top + list.clientHeight) {
      top = row.offsetTop + row.offsetHeight + margin - list.clientHeight
    } else {
      return
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    list.scrollTo({ top, behavior: reduce ? "instant" : "smooth" })
  }, [activeId])

  function hold(event: MouseEvent, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    heldRef.current = true
    setActiveId(id)
  }

  return (
    <aside aria-labelledby="doc-toc-heading" className="doc-toc">
      <h2
        className="pb-2 text-sm font-normal text-[hsl(0_0%_49%)]"
        id="doc-toc-heading"
      >
        On this page
      </h2>
      <ul className="relative min-h-0 overflow-y-auto" ref={listRef}>
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <li
              className={cn(
                "relative flex h-8 min-w-0 items-center py-1.5 pr-3 text-sm transition-colors duration-160 before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-black/8 hover:text-sidebar-foreground dark:before:bg-white/14",
                item.nested ? "pl-8" : "pl-4",
                active
                  ? "font-medium text-sidebar-foreground after:absolute after:inset-y-1 after:left-0 after:w-px after:bg-sidebar-foreground"
                  : "text-sidebar-muted"
              )}
              data-active={active || undefined}
              key={item.id}
            >
              <a
                aria-current={active ? "location" : undefined}
                className="block min-w-0 truncate outline-offset-4 focus-visible:outline-2 focus-visible:outline-sidebar-ring"
                href={`#${item.id}`}
                onClick={(event) => hold(event, item.id)}
                title={item.title}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function readingId(items: DocTocItem[]) {
  const headings = items
    .map((item) => document.getElementById(item.id))
    .filter((heading): heading is HTMLElement => heading !== null)
  if (headings.length === 0) return items[0]?.id
  const viewport = window.innerHeight
  const margin = parseFloat(getComputedStyle(headings[0]!).scrollMarginTop) || 0
  const line = Math.max(viewport * 0.2, margin + 1)
  const room = document.documentElement.scrollHeight - viewport
  const reach = Math.min(viewport, room)
  const progress =
    reach > 0 ? Math.min(1, Math.max(0, 1 - (room - window.scrollY) / reach)) : 0
  const threshold = line + (viewport - line) * progress
  let reading = headings[0]!
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top > threshold) break
    reading = heading
  }
  return reading.id
}
