import { Server, ShieldCheck } from "lucide-react"

import type { Protocol, Step } from "@/components/programs/types"

const SPEC = "/proof-systems/sampling"

/* Sampled proofs over an abstract commit-and-prove argument. The page
   states the definitions; each entry here says what its function computes. */
export const SAMPLED_PROOFS: Protocol = {
  title: "Sampled proofs",
  intro:
    "The prover commits to its trace at the boundary gates, the verifier samples proof blocks, and the prover proves that no sampled proof block is incorrect in the committed trace.",
  actors: [
    {
      id: "prover",
      name: "Prover",
      side: "developer",
      icon: Server,
      shade: "#f05252",
    },
    {
      id: "verifier",
      name: "Verifier",
      side: "auditor",
      icon: ShieldCheck,
      shade: "#0b57c8",
    },
  ],
  params: [
    { code: "circuit", note: "The computation, every gate public." },
    {
      code: "partition",
      note: "The circuit's gates cut into proof blocks, the population the sample is taken from.",
    },
    {
      code: "design",
      note: "The sampling design: a probability distribution over sets of proof blocks.",
    },
  ],
  run: [
    {
      label: "Commit",
      steps: [
        { actor: "prover", code: "trace = evaluate(circuit, inputs)" },
        {
          actor: "prover",
          code: "boundary = boundary_gates(circuit, partition)",
        },
        { actor: "prover", code: "com = commit(trace, boundary)" },
        { actor: "prover", to: "verifier", code: "com" },
      ],
    },
    {
      label: "Sample",
      steps: [
        { actor: "verifier", code: "seed = random()" },
        { actor: "verifier", code: "sample = sample_from(design, seed)" },
        { actor: "verifier", to: "prover", code: "sample" },
      ],
    },
    {
      label: "Prove",
      steps: [
        {
          actor: "prover",
          code: "stmt = statement(circuit, partition, sample, com)",
        },
        {
          actor: "verifier",
          code: "stmt = statement(circuit, partition, sample, com)",
        },
        { actor: "verifier", code: "transcript = []" },
        {
          gap: true,
          loop: "for _ in range(rounds(stmt))",
          steps: [
            { actor: "verifier", code: "coins = random()" },
            { actor: "verifier", to: "prover", code: "coins" },
            {
              actor: "prover",
              code: "msg = prove(stmt, com, trace, coins)",
            },
            { actor: "prover", to: "verifier", code: "msg" },
            { actor: "verifier", code: "transcript.append((coins, msg))" },
          ],
        },
      ],
    },
    {
      label: "Verify",
      steps: [
        {
          gap: true,
          loop: "if verify(stmt, com, transcript)",
          steps: [{ actor: "verifier", output: true, code: "accept" }],
        },
        {
          loop: "else",
          steps: [{ actor: "verifier", output: true, code: "reject" }],
        },
      ],
    },
  ],
  functions: {
    evaluate: {
      returns: "data",
      signature: "evaluate(circuit, inputs) -> dict[Gate, Value]",
      tex: String.raw`\mathit{values}[g] = \mathrm{op}_g\big(\mathit{values}[\mathrm{in}(g)]\big)`,
      body: [
        `The honest [trace](${SPEC}#commitment-phase): each input gate's value from \`inputs\`, then each computed gate's operation applied to the values it reads, in order.`,
      ],
    },
    boundary_gates: {
      returns: "data",
      signature: "boundary_gates(region, partition) -> set[Gate]",
      tex: String.raw`\mathrm{in}(C) \;\cup\; \bigcup\, \big\{\, \mathrm{in}(u) \cup \mathrm{out}(u) \;:\; u \in \mathit{partition},\ u \subseteq \mathit{region} \,\big\}`,
      body: [
        `The [boundary gates](${SPEC}#commitment-phase) of the proof blocks of \`partition\` inside \`region\`, with every input gate of the circuit. \`region\` is the whole circuit, or the replay blocks sampled under lazy commitments.`,
      ],
    },
    commit: {
      returns: "commitment",
      signature: "commit(trace, gates) -> Commitment",
      body: [
        "Commits to `trace` restricted to `gates`, binding each value to its gate. It accepts only a value of each gate's width, so every committed value is well typed.",
      ],
    },
    random: {
      returns: "seed",
      signature: "random() -> bytes",
      body: [
        "Fresh uniform randomness, unseen by the prover until it is sent.",
      ],
    },
    sample_from: {
      returns: "coin",
      signature: "sample_from(design, seed) -> set[ProofBlock]",
      body: [
        "Samples a set of proof blocks with the probabilities `design` assigns, using `seed` as its only randomness.",
      ],
    },
    statement: {
      returns: "data",
      signature: "statement(circuit, partition, sample, com) -> Statement",
      tex: String.raw`\exists \tau:\ \mathrm{opens}\big(\mathit{com}, \tau|_{\partial U}\big) \;\wedge\; \forall u \in \mathit{sample}:\ \tau_{\mathrm{out}(u)} = f_u\big(\tau_{\mathrm{in}(u)}\big)`,
      body: [
        `The claim to be proved: some trace whose boundary values open \`com\`, and in which no proof block of \`sample\` is [incorrect](${SPEC}#verification-phase). Each party builds it from its own copies.`,
      ],
    },
    rounds: {
      returns: "data",
      signature: "rounds(stmt) -> int",
      body: ["How many rounds the argument takes."],
    },
    prove: {
      returns: "proof",
      signature: "prove(stmt, com, trace, coins) -> bytes",
      body: [
        "The prover's message in this round, given the verifier's coins and the earlier rounds. The same `com` can serve further statements, such as the inputs agreeing with values the verifier already holds.",
      ],
    },
    verify: {
      returns: "data",
      signature: "verify(stmt, com, transcript) -> bool",
      body: [
        `Whether the transcript proves \`stmt\` of the values \`com\` commits. What it guarantees is the argument's [assumptions](${SPEC}#assumptions).`,
      ],
    },
  },
}

/* Lazy commitments: the prover commits the replay blocks' boundary, the
   verifier samples replay blocks, the prover commits their interiors, and the
   verifier samples proof blocks inside them. Proving and verifying are the
   one-stage protocol's, against both commitments. */
const againstBoth = (steps: Step[]): Step[] =>
  JSON.parse(
    JSON.stringify(steps).replace(/\bcom\b/g, "com_boundary, com_interior")
  )

export const SAMPLED_PROOFS_LAZY: Protocol = {
  ...SAMPLED_PROOFS,
  title: "Sampled proofs, lazy commitments",
  params: [
    { code: "circuit", note: "The computation, every gate public." },
    { code: "partition", note: "The circuit's gates cut into proof blocks." },
    {
      code: "replay",
      note: "The replay blocks, a partition that `partition` refines.",
    },
    {
      code: "first_stage",
      note: "The first stage's sampling design, over sets of replay blocks.",
    },
  ],
  run: [
    {
      label: "Commit",
      steps: [
        { actor: "prover", code: "trace = evaluate(circuit, inputs)" },
        { actor: "prover", code: "boundary = boundary_gates(circuit, replay)" },
        { actor: "prover", code: "com_boundary = commit(trace, boundary)" },
        { actor: "prover", to: "verifier", code: "com_boundary" },
      ],
    },
    {
      label: "Sample",
      steps: [
        { actor: "verifier", code: "picked = sample_from(first_stage, random())" },
        { actor: "verifier", to: "prover", code: "picked" },
        {
          actor: "prover",
          code: "interior = boundary_gates(picked, partition) - boundary",
        },
        { actor: "prover", code: "com_interior = commit(trace, interior)" },
        { actor: "prover", to: "verifier", code: "com_interior" },
        {
          actor: "verifier",
          code: "sample = sample_from(second_stage(picked), random())",
        },
        { actor: "verifier", to: "prover", code: "sample" },
      ],
    },
    ...againstBoth(SAMPLED_PROOFS.run.slice(2)),
  ],
  functions: {
    ...SAMPLED_PROOFS.functions,
    second_stage: {
      returns: "data",
      signature: "second_stage(picked) -> Design",
      body: [
        "The second stage's sampling design: in each sampled replay block, a design over its proof blocks that depends on that replay block alone, sampled independently across replay blocks. It never reads an interior.",
      ],
    },
  },
}
