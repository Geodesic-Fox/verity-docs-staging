import type { LucideIcon } from "lucide-react"

import type { ProgramValues } from "@/components/programs/values"

export type Kind = "seed" | "coin" | "root" | "commitment" | "signature" | "proof" | "data"
/* A function the run calls. Clicking one in the figure opens its entry. */
export type FunctionEntry = { signature: string; body: string[]; tex?: string; returns?: Kind }

/* The party that trusts an actor. The figure's one trust boundary runs
   between the two. */
export type Side = "developer" | "auditor"

/* An actor is an algorithm that runs, never a party. */
export type Actor = {
  id: string
  name: string
  side: Side
  icon: LucideIcon
  /* Its step on its side's lightness ladder, for the Shades palette. */
  shade: string
  /* Its color in the dials, for the Per actor palette; without one it keeps its shade. */
  colorKey?: keyof ProgramValues["colors"]
  person?: boolean
}

/* A step computes on its actor, sends to `to`, or outputs: hands the values
   `code` names out of the run. Code is one line of Python, and may end in a
   `#` comment. A kept step is the abstract protocol's, unchanged in the
   construction that builds it, so it reads faded. `gap` puts a blank line
   before a step, as Python separates a block's logical sections, except at
   the top of a listing. */
export type Leaf = {
  actor: string
  to?: string
  output?: boolean
  code: string
  kept?: boolean
  gap?: boolean
}
/* A group without a label is only its loop: a header and an indent, no
   heading. In a construction, `builds` is the abstract protocol's line its
   steps build, shown as a comment over them. A kept group's loop header
   reads faded, as a kept step does. */
export type Group = {
  label?: string
  loop?: string
  builds?: string
  gap?: boolean
  kept?: boolean
  steps: Step[]
}
export type Step = Leaf | Group
export const isGroup = (s: Step): s is Group => "steps" in s

/* A public parameter: what both sides hold before the run, each its own copy. */
export type Param = { code: string; note: string; kept?: boolean }

/* A prose section's parts: paragraphs, display formulas and tables. Text
   takes `code`, $math$ and [links](href); a status column's cells are pills. */
export type Part =
  | string
  | { tex: string }
  | { table: { columns: string[]; rows: string[][]; status?: number } }
export type Doc = { title: string; parts: Part[] }

export type Protocol = {
  title: string
  intro: string
  actors: Actor[]
  params?: Param[]
  /* Prose sections between the parameters and the run, and after the run. */
  before?: Doc[]
  run: Step[]
  after?: Doc[]
  functions: Record<string, FunctionEntry>
}
