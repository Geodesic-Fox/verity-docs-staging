"use client"

import { BANDWIDTH_AUDIT, NETWORK_CERTIFIER, POUS_PROTOCOL, POUW_PROTOCOL } from "@/components/programs/accounting"
import { C_FLOCK_PLAIN, C_FLOCK_ZK } from "@/components/programs/c-flock"
import { ProgramFigure } from "@/components/programs/program-figure"
import { ONSITE, REMOTE } from "@/components/programs/protocols"
import {
  SAMPLED_PROOFS,
  SAMPLED_PROOFS_LAZY,
} from "@/components/programs/sampled-proofs"
import { isGroup, type Protocol } from "@/components/programs/types"
import { PROGRAM_VALUES } from "@/components/programs/values"
import {
  RECURSION,
  RECURSION_DEPLOYED,
  RECURSION_PRIVATE,
} from "@/components/programs/zero-knowledge"

const PROGRAMS: Record<string, Protocol> = {
  "network-certifier": NETWORK_CERTIFIER,
  pouw: POUW_PROTOCOL,
  pous: POUS_PROTOCOL,
  "bandwidth-audit": BANDWIDTH_AUDIT,
  "sampled-proofs": SAMPLED_PROOFS,
  "sampled-proofs-lazy": SAMPLED_PROOFS_LAZY,
  remote: REMOTE,
  onsite: ONSITE,
  recursion: RECURSION,
  "recursion-private": RECURSION_PRIVATE,
  "recursion-deployed": RECURSION_DEPLOYED,
  "c-flock": C_FLOCK_PLAIN,
  "c-flock-zk": C_FLOCK_ZK,
}

/*
 * `![…](/programs/<id>#<phase>,<phase>)` in a page: the named top-level
 * phases of a program's run (by label, lowercased), as one listing without
 * their headings, since the page's own headings name them. Without a
 * fragment, the whole run. Client-side because a protocol's actors carry
 * their icon components.
 */
export function ProgramEmbed({ id, phases }: { id: string; phases: string[] }) {
  const program = PROGRAMS[id]
  if (!program) throw new Error(`unknown program embed /programs/${id}`)
  const groups = program.run.filter(isGroup)
  const picked = phases.length
    ? phases.map((phase) => {
        const group = groups.find((g) => g.label?.toLowerCase() === phase)
        if (!group) throw new Error(`/programs/${id} has no phase ${phase}`)
        return group
      })
    : groups
  const protocol: Protocol = {
    ...program,
    title: "",
    intro: "",
    params: undefined,
    before: undefined,
    after: undefined,
    run: [{ steps: picked.flatMap((group) => group.steps) }],
  }
  return <ProgramFigure protocol={protocol} values={PROGRAM_VALUES} />
}
