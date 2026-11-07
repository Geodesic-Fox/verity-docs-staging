Zero knowledge compiles a commit-and-prove argument into one whose verifier learns only the statement, the verdict and the public outputs. VEIL ([Dalal, Hemo, Rabinovich and Rothblum](https://eprint.iacr.org/2026/683)) is the compiler Verity runs: it pads every committed column so that the opened positions are uniform, masks every algebraic message with a pad committed first, and proves that the masked messages pass the argument's checks. Applied to [Flock](/proof-systems/basic-proofs/flock), it gives Flock's zero-knowledge mode. Two of the mode's changes are Verity's own: the challenger commits to its challenges in advance, because its coins are live and zero knowledge must hold against a malicious verifier, and the prover aborts at the degenerate challenges a binary field has.

## What it gives

An argument is zero knowledge with error $\varepsilon_{\mathrm{zk}}$ if for every verifier $V^*$, however it behaves, a simulator that reads only the statement and the public outputs produces a view within $\varepsilon_{\mathrm{zk}}$ of $V^*$'s view of a run with the honest prover. Verity asks for it against malicious verifiers, never only honest ones: the auditor is the party most interested in the developer's weights and data, as when two nations check each other.

A weaker form is the usual step toward it. *Special honest-verifier* zero knowledge asks the same only for each fixed sequence of challenges. A construction that has it gets zero knowledge against malicious verifiers from a commitment to its challenges, made before the prover sends anything that depends on the witness, and Goldreich–Kahan rewinding: since the verifier can't choose a challenge after seeing a message, the simulator can rewind it to just after the commitment. Verity's challenges are live coins, so the commitment is the challenger's.

## Protocol

The mode differs from the plain protocol in six ways, and the figure fades the lines they leave unchanged.

![Flock, zero-knowledge mode](/programs/flock-zk)

- The challenger commits to its challenges in advance. The prover first sends a fresh nonce, and the challenger samples every challenge of the session and commits to all of them in a coin tree, keyed to the session by the nonce. Each response opens only the challenges its round uses, and the prover checks each opening before using it. Since the tree is binding, the challenger cannot choose a challenge after seeing a message, as zero knowledge against a malicious verifier requires.
- The prover commits to its pads together with the witness, before it sends any value that depends on the witness, and sends each algebraic value $v$ masked as $v + h$ for a pad $h$.
- Ligerito's first codeword is padded with random coefficients, twice as many as the positions opened at that level, and each repetition folds its own pair of extra lanes with its own challenges, so the openings of the two repetitions are jointly uniform.
- The final rounds of each repetition prove that the masked values pass Flock's checks, so the verifier can check them without seeing the values. A mask slot in the witness hides the values those checks concern.
- The prover aborts at a degenerate challenge (a zero batching coefficient, mask weights of deficient rank, or a zerocheck challenge equal to 1) before it sends anything that depends on it. Whether it aborts depends only on the challenges, so an abort reveals nothing about the witness.
- A session may prove several tables, each with its own challenges in the coin tree.

As a result, every value the prover sends is a salted commitment, a masked value, a value determined by the witness and the prover's randomness (such as a Merkle root or an opening), or a constant. These are the [four kinds of value](/proof-systems/recursion#what-it-asks-of-the-argument) that a ZK server needs in order to release an outer proof computed by the workers.

## Security

### Zero knowledge

The mode is special honest-verifier zero knowledge: for every fixed sequence of challenges on which the prover does not abort, the verifier's view of a session is within statistical distance

$$
\sum_j 2\,\lvert \mathrm{Hid}_j \rvert \cdot 2^{-193}
$$

of the output of a simulator that sees only the statement and the public outputs, where $\lvert \mathrm{Hid}_j \rvert$ is the number of hiding leaves of table $j$ that the proof leaves unopened. The bound assumes that the key of the hiding leaves, derived once by hashing, is one under which each leaf hides within $2^{-193}$, as all but a $2^{-64}$ fraction of keys are. It also treats the prover's pads and salts as uniform. In the implementation they are ChaCha20 output under a fresh seed, so the deployed bound also assumes that ChaCha20 is a pseudorandom generator.

~~~proof instantiated
Proved in Lean for hidden outputs with any number of tables, and for public outputs with one table. Two gaps remain. The prover also aborts when its own check of the batched constraint fails, and the theorem covers only runs in which that check passes; every honest run passes it if the plain protocol is complete, which is not yet proved. The theorem also assumes that no table's statement touches the mask slot, which `verify` does not yet check.
~~~

### Malicious verifiers

Against a malicious verifier $V^*$ that chooses its challenges, zero knowledge follows from the coin commitment and Goldreich–Kahan rewinding. The simulator runs the honest prover once on a dummy witness to learn which challenges $V^*$ committed to, estimates the probability that $V^*$ completes a session, and then rewinds to just after the coin commitment, with fresh simulated openings, until a session completes or a cutoff is reached. With a completion threshold $s$ and at most $M$ estimation runs, the simulator's output is within

$$
\varepsilon_{\mathrm{sim}} \;\le\; 3\delta_C + 8s\,\delta_B + 3^{-s} + \frac{s}{M} + \frac{q^2}{2^{513}}
$$

of the real view. Here $\delta_B$ bounds how far one rewind moves the view of $V^*$, and $\delta_C$ how far the view under the real witness is from the view under the dummy witness, both by the hiding of the leaves; $3^{-s}$ is the probability of exhausting the rewinds, $s/M$ the cost of the cutoff, and $q^2/2^{513}$ the binding of the coin tree against a finder, built from $V^*$, that makes $q$ SHA-512 evaluations. The simulator runs $V^*$ at most $1 + 5s$ times in expectation.

~~~proof abstract
Proved in Lean for a model of one session against a verifier with a fixed random tape, averaged over the tape. Three links to Flock as implemented remain open: from the implemented prover to the model, the binding of the coin tree under its session key, and composition across back-to-back sessions with one verifier, as when the ZK server releases successive outer proofs to the same auditor.
~~~

## What it asks

- **Of the argument**, nothing new: Flock keeps its knowledge soundness in the zero-knowledge mode, and its [integrity bound](/proof-systems/basic-proofs/flock#integrity) is proved with or without zero knowledge.
- **Of the prover**, its randomness: the masks must be uniform and unseen by the verifier. Zero knowledge holds for a prover that follows the protocol, so whoever samples the masks must be trusted for privacy.

## Where Verity uses it

The outer proofs of [recursion](/proof-systems/recursion) run in zero knowledge, with a small ZK server sampling the masks, so the workers who compute the proofs never hold them. That needs every value of an outer message to be one of [four kinds](/proof-systems/recursion#what-it-asks-of-the-argument) the ZK server can release cheaply, which a VEIL-style argument meets. An audit that proves its sampled proof blocks directly in zero knowledge must trust the workers that sample the masks ([why](/proof-systems/recursion#why-not-zero-knowledge-in-the-workers)).

## References

- A. Dalal, T. Hemo, R. Rabinovich and R. Rothblum. [VEIL](https://eprint.iacr.org/2026/683). ePrint 2026/683. The masking the zero-knowledge mode follows.
- O. Goldreich and A. Kahan. How to construct constant-round zero-knowledge proof systems for NP. *Journal of Cryptology*, 1996. Zero knowledge against malicious verifiers from committed coins and rewinding.
- S. Halevi and S. Micali. Practical and provably-secure commitment schemes from collision-free hashing. CRYPTO 1996. The hiding leaves.
