import { getEntry, type Citation } from "@/lib/assumptions"
import { getEntities } from "@/lib/entities"

/*
 * Each backend's security, from the entities JSON's backend profiles: its
 * properties and the assumptions they rest on, in the site registry's ids.
 * Proven bounds (proximity gaps, LogUp) are left out: they're theorems,
 * not things to trust. A statement's commitment-scheme hashes aren't here
 * either; a result adds them to its backend's. An id the registry doesn't
 * have fails the build.
 */

export type SecurityProfile = {
  backend: string
  family: string
  properties: Citation[]
  assumptions: Citation[]
}

// The render's property ids, by the registry's.
const propertyIds: Record<string, string> = {
  "statistical-soundness": "sound-statistical",
  "computational-soundness": "sound-computational",
  "malicious-verifier-zk": "zk-malicious",
  hvzk: "zk-honest-verifier",
  "no-zk": "no-zk",
  "designated-verifier": "interactive",
  "non-interactive": "non-interactive",
  "transparent-setup": "transparent-setup",
}

function registered(id: string, backend: string): string {
  try {
    getEntry(id)
  } catch {
    throw new Error(`${backend}: ${id} has no entry in data/assumptions.ts`)
  }
  return id
}

// "2^{-128.0}" reads as "2^{-128}".
const tidyBound = (param: string) => param.replace(/\.0\}/, "}")

export function getSecurityProfiles(): SecurityProfile[] {
  const entities = getEntities()
  if (!entities) throw new Error("data/entities.json is missing")
  const standing = (id: string) => entities.claims[id]?.standing

  return entities.backends.map((b) => {
    const params = new Map(
      b.claims.flatMap((c) => (c.property.id && c.property.param ? [[c.property.id, c.property.param]] : []))
    )
    return {
      backend: b.id,
      family: b.backend_family,
      properties: b.properties.map((id) => {
        const mapped = propertyIds[id]
        if (!mapped) throw new Error(`${b.id}: property ${id} has no registry mapping in lib/security.ts`)
        const param = params.get(id)
        return param ? { id: registered(mapped, b.id), param: tidyBound(param) } : { id: registered(mapped, b.id) }
      }),
      assumptions: b.assumptions
        .filter((id) => standing(id) !== "proven")
        .map((id) => ({ id: registered(id, b.id) })),
    }
  })
}
