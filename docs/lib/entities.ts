import fs from "node:fs"
import path from "node:path"

import { z } from "zod"

/*
 * The benchmark render's entities JSON (`verity/tables-entities/v1`),
 * committed as `data/entities.json` from the Project store's
 * `internal/tables-render/latest.json`. Only the fields the site reads are
 * validated; the rest passes through for the download. Performance, the
 * Security table and the interaction charts all read from here.
 *
 * Renders before the input-set rename say `instance_set`,
 * `instance_set_provenance` and `interaction.instances`; both spellings
 * are accepted until the renamed render lands.
 */

const SNAPSHOT = path.join(process.cwd(), "data", "entities.json")

const num = z.number()
const maybe = z.number().nullable()
const provenance = z.enum(["captured", "synthetic"])
const inputSet = z.object({ id: z.string(), provenance }).nullable()

const schema = z.object({
  schema: z.literal("verity/tables-entities/v1"),
  provenance: z.object({ rendered_at: z.string(), verity_commit: z.string() }),
  census: z.object({
    hardware: z.record(z.string(), z.object({ id: z.string(), name: z.string() })),
    networks: z.record(
      z.string(),
      z.object({
        id: z.string(),
        label: z.string(),
        rtt_s: num,
        bandwidth_bps: num,
        role: z.enum(["reference", "sensitivity"]),
      })
    ),
  }),
  subcircuits: z.array(
    z.object({
      id: z.string(),
      hardware_display: z.string(),
      input_set_provenance: provenance.nullable().optional(),
      instance_set_provenance: provenance.nullable().optional(),
    })
  ),
  schemes: z.array(z.object({ id: z.string(), name: z.string(), standard: z.boolean() })),
  // Registry of guarantees and assumptions; `standing` is "proven" for theorems.
  claims: z.record(
    z.string(),
    z.object({ kind: z.enum(["guarantee", "assumption"]), standing: z.string().nullable() })
  ),
  backend_families: z.array(z.object({ id: z.string() })),
  backends: z.array(
    z.object({
      id: z.string(),
      backend_family: z.string(),
      mode: z.enum(["interactive", "fs"]),
      composed: z.boolean(),
      properties: z.array(z.string()),
      assumptions: z.array(z.string()),
      claims: z.array(
        z.object({
          property: z.object({ id: z.string().nullable(), param: z.string().nullable() }),
        })
      ),
    })
  ),
  tables: z.object({
    table3: z.object({ labels: z.record(z.string(), z.string()) }),
  }),
  results: z.array(
    z.object({
      id: z.string(),
      backend: z.string(),
      backend_family: z.string(),
      subcircuit: z.string(),
      scheme: z.string(),
      prover_hardware: z.string(),
      input_set: inputSet.optional(),
      instance_set: inputSet.optional(),
      N: z.object({ value: num }),
      overhead: z.object({ value: num, display: z.string() }),
      state: z.object({ provisional: z.boolean() }),
      phases: z.array(
        z.object({ id: z.string(), kind: z.string(), share: maybe, display: z.string() })
      ),
      interaction: z.object({
        live: z.boolean(),
        derived: z.boolean(),
        rounds: maybe,
        bytes_up: num,
        bytes_down: num,
        proof_bytes: maybe,
        commit_s: num,
        prover_compute_s: maybe,
        verifier_compute_s: num,
        measured_rtt: z.object({ ms: num, method: z.string() }).nullable(),
        inputs: num.optional(),
        instances: num.optional(),
      }),
    })
  ),
})

export type Entities = z.infer<typeof schema>
export type EntityResult = Entities["results"][number]

let cache: Entities | null | undefined

export function getEntities(): Entities | null {
  if (cache !== undefined) return cache
  cache = fs.existsSync(SNAPSHOT) ? schema.parse(JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"))) : null
  return cache
}

export function entitiesSnapshotPath() {
  return SNAPSHOT
}

export const inputSetOf = (r: EntityResult) => r.input_set ?? r.instance_set ?? null

export const inputSetProvenanceOf = (s: Entities["subcircuits"][number]) =>
  s.input_set_provenance ?? s.instance_set_provenance ?? null

export function inputCountOf(r: EntityResult): number {
  const count = r.interaction.inputs ?? r.interaction.instances
  if (count === undefined) throw new Error(`${r.id}: interaction record has no input count`)
  return count
}

// The render's scheme ids, by the site registry's.
const schemeIds: Record<string, string> = {
  "frame-v3/sha-256": "scheme/frame-v3-sha256",
  "frame-v3/blake3-keyed": "scheme/frame-v3-blake3",
  "frame-v3/poseidon2-babybear": "scheme/frame-v3-poseidon2",
  "vllm-v1/sha-256": "scheme/vllm-v1",
}

export function registrySchemeId(id: string): string {
  const mapped = schemeIds[id]
  if (!mapped) throw new Error(`scheme ${id} has no registry entry in data/assumptions.ts`)
  return mapped
}

// "2026-09-26T01:29:30Z" as "Fri Sep 25, 6:29 PM PT".
export function formatRenderedAt(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("weekday")} ${get("month")} ${get("day")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")} PT`
}
