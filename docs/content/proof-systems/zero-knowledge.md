Zero knowledge compiles a commit-and-prove argument into one whose verifier learns only the statement, the verdict and the public outputs. [VEIL](/proof-systems/zero-knowledge/veil) is the construction Verity runs, applied to [Flock](/proof-systems/basic-proofs/flock).

## What it gives

An argument is zero knowledge with error $\varepsilon_{\mathrm{zk}}$ if for every verifier $V^*$, however it behaves, a simulator that reads only the statement and the public outputs produces a view within $\varepsilon_{\mathrm{zk}}$ of $V^*$'s view of a run with the honest prover. Verity asks for it against malicious verifiers, never only honest ones: the auditor is the party most interested in the developer's weights and data, as when two nations check each other.

A weaker form is the usual step toward it. *Special honest-verifier* zero knowledge asks the same only for each fixed sequence of challenges. A construction that has it gets zero knowledge against malicious verifiers from a commitment to its challenges, made before the prover sends anything that depends on the witness, and Goldreich–Kahan rewinding: since the verifier can't choose a challenge after seeing a message, the simulator can rewind it to just after the commitment. Verity's challenges are live coins, so the commitment is the challenger's.

## What it asks

- **Of the argument**, nothing new: Flock keeps its knowledge soundness in the zero-knowledge mode, and its [integrity bound](/proof-systems/basic-proofs/flock#integrity) is proved with or without zero knowledge.
- **Of the prover**, its randomness: the masks must be uniform and unseen by the verifier. Zero knowledge holds for a prover that follows the protocol, so whoever samples the masks must be trusted for privacy.

## Where Verity uses it

The outer proofs of [recursion](/proof-systems/recursion) run in zero knowledge, with a small ZK server sampling the masks, so the workers who compute the proofs never hold them. That needs every value of an outer message to be one of [four kinds](/proof-systems/recursion#what-it-asks-of-the-argument) the ZK server can release cheaply, which a VEIL-style argument meets. An audit that proves its sampled proof blocks directly in zero knowledge must trust the workers that sample the masks ([why](/proof-systems/recursion#why-not-zero-knowledge-in-the-workers)).
