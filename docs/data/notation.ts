/*
 * One glossary of symbols for every formal statement. An entry lists the
 * symbols its statement uses and may override a meaning locally (for
 * example, H is "SHA-512" in one entry and "the hash" in another). Meanings
 * are plain text with $…$ spans typeset.
 */
export const notation = {
  lambda: { tex: String.raw`\lambda`, meaning: "the security parameter: security grows with it" },
  negl: {
    tex: String.raw`\mathrm{negl}(\lambda)`,
    meaning: "a quantity that shrinks faster than any inverse polynomial in $\\lambda$",
  },
  adversary: {
    tex: String.raw`\mathcal{A}`,
    meaning: "any efficient (probabilistic polynomial-time) adversary",
  },
  hash: { tex: "H", meaning: "the hash function" },
  inputs: { tex: String.raw`x, x'`, meaning: "two inputs to $H$" },
  digestBits: { tex: "n", meaning: "the digest length in bits" },
  funcs: {
    tex: String.raw`\mathsf{Funcs}(A, B)`,
    meaning: "the set of all functions from $A$ to $B$, from which $H$ is drawn uniformly",
  },
  seed: { tex: "s", meaning: "a secret, uniformly random seed of $\\lambda$ bits" },
  uniform: { tex: "U", meaning: "a uniformly random string of the same length" },
  indistinguishable: {
    tex: String.raw`\approx_c`,
    meaning: "indistinguishable to any efficient observer",
  },
  anyProver: {
    tex: "P^*",
    meaning: "any prover, even a dishonest and computationally unbounded one",
  },
  verifier: { tex: "V", meaning: "the honest verifier" },
  anyVerifier: { tex: "V^*", meaning: "any verifier strategy, including a malicious one" },
  decision: {
    tex: String.raw`\langle P, V\rangle(x)`,
    meaning: "the verifier's decision after interacting with prover $P$ on statement $x$",
  },
  falseStatements: { tex: String.raw`x \notin L`, meaning: "$x$ is a false statement" },
  soundnessError: {
    tex: String.raw`\varepsilon`,
    meaning: "the soundness error, such as $2^{-128}$",
  },
  witness: { tex: "w", meaning: "the prover's secret witness, such as private inputs or weights" },
  simulator: { tex: "S", meaning: "a simulator, which never sees $w$" },
  view: {
    tex: String.raw`\mathsf{View}`,
    meaning: "everything the verifier sees: the messages and its own coins",
  },
  commitment: { tex: "c", meaning: "a commitment" },
  openings: {
    tex: String.raw`(m, o), (m', o')`,
    meaning: "two claimed openings of $c$: a value and its opening data",
  },
  open: { tex: String.raw`\mathsf{Open}`, meaning: "the check that an opening matches a commitment" },
  dotLength: { tex: "K", meaning: "the dot product's length" },
  gemmInputs: {
    tex: String.raw`x_k, w_k`,
    meaning: "the $k$-th elements of an input row and a weight column, in the subcircuit's datatype",
  },
  gemmOutput: { tex: "y", meaning: "the output element" },
  accumulate: {
    tex: String.raw`\mathsf{mma}_\iota`,
    meaning: "the products and sums exactly as tensor-core instruction $\\iota$ computes them, with its rounding and FP32 accumulation",
  },
} as const

export type Symbol = keyof typeof notation
