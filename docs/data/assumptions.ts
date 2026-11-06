import type { Symbol } from "@/data/notation"
import { subcircuitLabel, subcircuits, templateList, templates } from "@/data/subcircuits"
import { datatypeLabel } from "@/lib/labels"

/*
 * Registry entries: properties (what a component has) and assumptions
 * (what you have to trust), each assumption rated on an opinionated trust
 * scale. Hash assumptions are composed from a property and a hash, so
 * "CR · SHA-512" is generated, not written twice. Statements are KaTeX;
 * `symbols` lists the glossary symbols they use (data/notation.ts), and
 * `where` overrides a symbol's meaning for this entry.
 */

type Ref = { label: string; href: string }

type Hash = {
  id: string
  name: string
  trust: "solid" | "caution"
  why: string
  // Generic collision attack cost, as KaTeX.
  birthday?: string
  ref: Ref
}

const fips180: Ref = {
  label: "FIPS 180-4",
  href: "https://csrc.nist.gov/pubs/fips/180-4/upd1/final",
}
const poseidon2: Ref = {
  label: "Poseidon2 (Grassi, Khovratovich, Schofnegger)",
  href: "https://eprint.iacr.org/2023/323",
}
const standardHashWhy =
  "A standard hash with decades of public cryptanalysis and no attack better than generic."
const algebraicHashWhy =
  "An algebraic hash, designed for proofs. Its cryptanalysis is only a few years old, and algebraic attacks keep improving."

const hashes: Hash[] = [
  { id: "sha-256", name: "SHA-256", trust: "solid", why: standardHashWhy, birthday: "2^{128}", ref: fips180 },
  { id: "sha-512", name: "SHA-512", trust: "solid", why: standardHashWhy, birthday: "2^{256}", ref: fips180 },
  {
    id: "blake3",
    name: "BLAKE3",
    trust: "solid",
    why: "A standard hash built on the long-studied BLAKE2 and ChaCha designs, with no attack better than generic.",
    birthday: "2^{128}",
    ref: { label: "BLAKE3 specification", href: "https://github.com/BLAKE3-team/BLAKE3-specs" },
  },
  {
    id: "blake2b",
    name: "BLAKE2b",
    trust: "solid",
    why: standardHashWhy,
    birthday: "2^{256}",
    ref: { label: "RFC 7693", href: "https://www.rfc-editor.org/rfc/rfc7693" },
  },
  { id: "poseidon2-babybear", name: "Poseidon2 over BabyBear", trust: "caution", why: algebraicHashWhy, ref: poseidon2 },
  { id: "poseidon2-koalabear", name: "Poseidon2 over KoalaBear", trust: "caution", why: algebraicHashWhy, ref: poseidon2 },
]

function collisionResistance(hash: Hash) {
  return {
    id: `cr/${hash.id}`,
    kind: "assumption" as const,
    name: `Collision resistance of ${hash.name}`,
    label: `CR · ${hash.name.replace(" over ", "-")}`,
    summary: `No one can find two different inputs with the same ${hash.name} digest.`,
    statement: String.raw`\Pr\big[(x, x') \leftarrow \mathcal{A}(1^\lambda) : x \neq x' \,\wedge\, H(x) = H(x')\big] \le \mathrm{negl}(\lambda)`,
    symbols: ["hash", "adversary", "lambda", "inputs", "negl"] satisfies Symbol[],
    where: { hash: hash.name },
    trust: hash.trust,
    why: hash.why,
    attack: hash.birthday
      ? `Generic birthday attack, about $${hash.birthday}$ work`
      : undefined,
    refs: [hash.ref],
  }
}

const gemmStatement = {
  statement: String.raw`y \;=\; \mathsf{mma}_\iota\Big(\sum_{k=1}^{K} x_k\, w_k\Big)`,
  symbols: ["gemmOutput", "accumulate", "dotLength", "gemmInputs"] satisfies Symbol[],
}
const statementOf = (template: string) =>
  template === "gemm-coordinate" ? gemmStatement : { symbols: [] as Symbol[] }

// A template's registry entry: what it computes, its parameters, and the
// subcircuits that bind them.
const templateEntries = templateList.map((t) => ({
  id: t.id,
  kind: "template" as const,
  name: t.name,
  label: t.name,
  summary: t.summary,
  ...statementOf(t.id),
  details: t.parameters.map((p) => ({ label: p.label, value: p.description })),
  members: subcircuits.filter((s) => s.template === t.id).map((s) => s.id),
  note: t.placeholder ? `Placeholder. ${t.placeholder}` : undefined,
  refs: [],
}))

// A subcircuit's registry entry: its template, bound parameters and inputs.
const subcircuitEntries = subcircuits.map((s) => {
  const t = templates[s.template]!
  return {
    id: s.id,
    kind: "subcircuit" as const,
    template: t.id,
    name: `${t.name}, ${subcircuitLabel(s)}`,
    label: subcircuitLabel(s),
    summary: t.summary,
    ...statementOf(t.id),
    details: [
      // The instruction row shows the full `semantics` value.
      ...t.parameters.map((p) => ({
        label: p.label,
        value: p.key === "semantics" && s.instruction ? s.instruction : s.params[p.key]!,
      })),
      ...(t.parameters.some((p) => p.key === "datatype")
        ? []
        : [{ label: "Datatype", value: datatypeLabel(s.datatype) }]),
      ...(s.template === "gemm-coordinate" ? [{ label: "Accumulation", value: "FP32" }] : []),
      { label: "Input set", value: s.inputsNote },
      ...(s.gap ? [{ label: "Known gap", value: s.gap }] : []),
    ],
    note: t.placeholder ? `Placeholder. ${t.placeholder}` : undefined,
    refs: [],
  }
})

export const entries = [
  ...templateEntries,
  ...subcircuitEntries,

  // Properties: what a backend has. Neutral, no rating.
  {
    id: "sound-statistical",
    kind: "property",
    name: "Statistical soundness",
    label: "Sound",
    summary: "Even an all-powerful prover convinces the verifier of a false statement with probability at most ε. The hashes a proof uses are separate assumptions.",
    statement: String.raw`\Pr\big[\langle P^*, V\rangle(x) = \mathsf{accept}\big] \le \varepsilon \quad \text{for all } P^* \text{ and all } x \notin L`,
    symbols: ["anyProver", "verifier", "decision", "falseStatements", "soundnessError"],
    refs: [],
  },
  {
    id: "sound-computational",
    kind: "property",
    name: "Computational soundness",
    label: "Sound (computational)",
    summary: "No efficient prover convinces the verifier of a false statement, except with negligible probability. A Fiat–Shamir proof is sound in this sense: the bound rests on the random oracle and the hashes it uses, which are listed as assumptions.",
    statement: String.raw`\Pr\big[\langle P^*, V\rangle(x) = \mathsf{accept}\big] \le \mathrm{negl}(\lambda) \quad \text{for all efficient } P^* \text{ and all } x \notin L`,
    symbols: ["anyProver", "verifier", "decision", "falseStatements", "negl", "lambda"],
    where: { anyProver: "any efficient prover, running in time polynomial in $\\lambda$" },
    refs: [],
  },
  {
    id: "zk-malicious",
    kind: "property",
    name: "Zero knowledge against a malicious verifier",
    label: "ZK",
    summary: "Whatever the verifier does, it learns nothing beyond the statement's truth: what it sees could be produced without the witness.",
    statement: String.raw`\text{for every } V^* \text{ there is an } S \text{ with } \mathsf{View}_{V^*}\big(\langle P(w), V^*\rangle(x)\big) \approx_c S(x)`,
    symbols: ["anyVerifier", "simulator", "view", "witness", "indistinguishable"],
    refs: [],
  },
  {
    id: "zk-honest-verifier",
    kind: "property",
    name: "Honest-verifier zero knowledge",
    label: "HVZK",
    summary: "A verifier that follows the protocol learns nothing beyond the statement's truth. With Fiat–Shamir, the random oracle makes this hold against any verifier.",
    statement: String.raw`\text{there is an } S \text{ with } \mathsf{View}_{V}\big(\langle P(w), V\rangle(x)\big) \approx_c S(x)`,
    symbols: ["verifier", "simulator", "view", "witness", "indistinguishable"],
    refs: [],
  },
  {
    id: "no-zk",
    kind: "property",
    name: "No zero knowledge",
    label: "No ZK",
    summary: "The proof is sound but may reveal the witness, such as private inputs or weights.",
    symbols: [],
    refs: [],
  },
  {
    id: "interactive",
    kind: "property",
    name: "Interactive",
    label: "Interactive",
    summary: "The verifier stays online and sends fresh random challenges during the proof. Only that verifier is convinced, and it should sit close to the prover, since every round costs a round trip. Expanding the coins may still use a hash; each backend lists the ones it relies on.",
    symbols: [],
    refs: [],
  },
  {
    id: "non-interactive",
    kind: "property",
    name: "Non-interactive (Fiat–Shamir)",
    label: "Non-interactive",
    summary: "Challenges are hashes of the transcript, so the proof is a single message that anyone can check later. Its soundness rests on the random oracle assumption.",
    symbols: [],
    refs: [{ label: "Fiat and Shamir (1986)", href: "https://link.springer.com/chapter/10.1007/3-540-47721-7_12" }],
  },
  {
    id: "transparent-setup",
    kind: "property",
    name: "Transparent setup",
    label: "Transparent setup",
    summary: "All public parameters are derived in the open. There's no trusted setup and no secret to destroy.",
    symbols: [],
    refs: [],
  },
  {
    id: "binding",
    kind: "property",
    name: "Binding commitment",
    label: "Binding",
    summary: "A committed value can be opened to only one value. For Merkle commitments, this rests on the collision resistance of the tree's hash.",
    statement: String.raw`\Pr\big[\mathsf{Open}(c, m, o) = \mathsf{Open}(c, m', o') = 1 \,\wedge\, m \neq m'\big] \le \mathrm{negl}(\lambda)`,
    symbols: ["commitment", "openings", "open", "negl"],
    refs: [],
  },

  // Commitment schemes: how the values a proof binds were committed. Each
  // rests on the collision resistance of its hashes.
  {
    id: "scheme/frame-v3-sha256",
    kind: "scheme",
    name: "frame-v3 with SHA-256 row leaves",
    label: "SHA-256 rows",
    summary: "Each row of inputs and weights is hashed with SHA-256, and the digests are the leaves of frame-v3's SHA-256 Merkle trees. The proof computes the row digests; the verifier checks the trees itself.",
    symbols: [],
    restsOn: ["cr/sha-256"],
    refs: [],
  },
  {
    id: "scheme/frame-v3-blake3",
    kind: "scheme",
    name: "frame-v3 with keyed-BLAKE3 row leaves",
    label: "BLAKE3 rows",
    summary: "Each row is hashed with keyed BLAKE3, and the digests are the leaves of frame-v3's SHA-256 Merkle trees. The proof computes the row digests; the verifier checks the trees itself.",
    symbols: [],
    restsOn: ["cr/blake3", "cr/sha-256"],
    refs: [],
  },
  {
    id: "scheme/frame-v3-poseidon2",
    kind: "scheme",
    name: "frame-v3 with Poseidon2 row leaves",
    label: "Poseidon2 rows",
    summary: "Each row is hashed with Poseidon2 over BabyBear, an algebraic hash that is cheap to compute inside a proof, and the digests are the leaves of frame-v3's SHA-256 Merkle trees.",
    symbols: [],
    restsOn: ["cr/poseidon2-babybear", "cr/sha-256"],
    refs: [],
  },
  {
    id: "scheme/vllm-v1",
    kind: "scheme",
    name: "vllm-v1",
    label: "vLLM framing",
    summary: "The vLLM integration's own framing, on SHA-256. Its roots also bind the Program, the template, the query and the count, so a proof checks values exactly as serving committed them.",
    symbols: [],
    restsOn: ["cr/sha-256"],
    refs: [],
  },

  // Assumptions: what you have to trust, rated.
  ...hashes.map(collisionResistance),
  {
    id: "xof/shake-256",
    kind: "assumption",
    name: "SHAKE-256 as a pseudorandom generator",
    label: "XOF · SHAKE-256",
    summary: "Output expanded from a secret random seed looks uniformly random, so masks generated this way hide what they mask.",
    statement: String.raw`\mathsf{SHAKE256}(s) \approx_c U`,
    symbols: ["seed", "uniform", "indistinguishable"],
    trust: "solid",
    why: "A NIST standard built on SHA-3's Keccak permutation, with a large security margin.",
    attack: "Generic attacks cost about $2^{256}$",
    refs: [{ label: "FIPS 202", href: "https://csrc.nist.gov/pubs/fips/202/final" }],
  },
  {
    id: "random-oracle",
    kind: "assumption",
    name: "Random oracle",
    label: "Random oracle",
    summary: "The hash behaves like a truly random function. Fiat–Shamir proofs are proven sound under this assumption.",
    statement: String.raw`H \leftarrow \mathsf{Funcs}\big(\{0,1\}^*, \{0,1\}^n\big)`,
    symbols: ["hash", "funcs", "digestBits"],
    trust: "accepted",
    why: "A heuristic: no real hash is a random function, and contrived counterexamples exist. But no practical attack is known on its standard uses, and nearly every deployed non-interactive proof relies on it.",
    refs: [
      {
        label: "Bellare and Rogaway, Random oracles are practical (1993)",
        href: "https://cseweb.ucsd.edu/~mihir/papers/ro.pdf",
      },
    ],
  },
  {
    id: "honest-verifier",
    kind: "assumption",
    name: "Honest verifier",
    label: "Honest verifier",
    summary: "The verifier follows the protocol and samples its challenges honestly. Zero knowledge stated this way says nothing about a verifier that cheats to learn the witness.",
    symbols: [],
    trust: "weak",
    why: "The verifier is often the party most interested in the witness. Trusting it to follow the protocol gives up zero knowledge against exactly the party it should protect against.",
    refs: [],
  },
]
