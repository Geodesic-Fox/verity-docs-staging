A proof system here is a *commit-and-prove argument*: it binds values with a commitment, then proves statements about the committed values on the verifier's live coins. Two layers are stated once over any such argument. [Sampling](/proof-systems/sampling) proves a random sample of a computation's proof blocks and bounds how many of them are incorrect. [Zero knowledge](/proof-systems/zero-knowledge) wraps the inner proofs in an outer proof that they would have verified, so the auditor learns only the public outputs, whatever the provers do. A *construction* implements the methods both layers call, and [Flock](/proof-systems/c-flock) is the one documented here.

~~~mermaid
flowchart TB
  acc["Accounting · policies"]
  samp["Sampling"]
  zk["Zero knowledge"]
  arg["Commit-and-prove argument<br/>commit · prove · verify · verify as a circuit"]
  cf["Flock"]
  acc -->|"reads integrity"| samp
  zk -->|"wraps its proofs"| samp
  samp --> arg
  zk --> arg
  cf -->|"implements"| arg
~~~

Arrows point from what builds to what it builds on. Neither layer names a construction, so a construction that implements the methods with the properties below serves both unchanged.

## Statements

A statement is the full committed relation: a circuit $C$, and a commitment `com` that binds the values at some of its gates. It says that some trace opens `com` and that the circuit holds on it:

$$
x = (C, \mathit{com}), \qquad R(x) = \big\{ \tau :\ \mathrm{opens}(\mathit{com}, \tau) \;\wedge\; \tau_{\mathrm{out}} = C(\tau_{\mathrm{in}}) \big\}
$$

The trace $\tau$ is the witness, and the verifier sees `com`, never the values. In sampling, $C$ is the proof blocks the verifier sampled and `com` binds the boundary gates. A commitment and a proof establish different things. A proof that a dot product was computed correctly establishes two facts:

~~~text
x, w and y are the previously committed values
y = ExactDot(x, w)
~~~

The commitment establishes the first, and the proof the second. A construction's own internal commitments, such as the Merkle trees over its encoded witness, stay inside it and aren't the statement's commitment. A construction lowers each statement into a circuit of its own, so two statements that differ only in their commitment scheme are two statements, and cost it different amounts.

A proof counts only against the intended statement. Both sides build the statement from their own copies of the circuit, the partition, the sampled proof blocks and the commitment, and the verifier refuses a proof about any other. The statement is fixed before the first coin, so the prover can't choose it after seeing one. And what the verifier checks a proof against, a lowering or a compiled constraint system, is held by the verifier by digest, so a proof under any other identity is refused whatever it shows.

## Methods

| Method | What it does | Called by |
| --- | --- | --- |
| `commit(trace, gates) -> com` | Binds a trace's values at a set of gates, before any coin that tests them | Sampling, for the boundary gates; zero knowledge, hiding, for each inner message |
| `prove(stmt, com, trace, coins)` | The prover's side of an interactive proof that `stmt` holds of `com`'s values, one message per round of live coins | Sampling, for the sampled proof blocks; zero knowledge, for the outer statement |
| `verify(stmt, com, transcript) -> bool` | The verifier's side: accept or reject the proof | Both |
| `verify` as a circuit | `verify` written as a circuit, so that a proof can show a transcript would have been accepted: $V_\Pi$, when the construction runs as zero knowledge's $\Pi$ | Zero knowledge |

## Properties

Each property is stated for one audit: one commitment, and one statement about it picked by any rule fixed before the first coin. An audit therefore pays each error term once, however many proof blocks it proves against the commitment. This is what lets a prover commit once and prove many statements: binding makes every statement proved against `com` read one committed trace $\tau^\star$, fixed when `com` is sent.

| Property | Error | What it asks | Needed by |
| --- | --- | --- | --- |
| Completeness | None | `verify` accepts `prove` on a true statement | Both |
| Knowledge soundness | $\varepsilon_{\mathrm{ks}}$ | When `verify` accepts, an extractor recovers values that satisfy the picked statement | Sampling, of the inner proofs; zero knowledge, of the outer proof |
| Binding | $\varepsilon_{\mathrm{bind}}$ | The extracted values agree with the committed trace $\tau^\star$ on the picked statement's gates | Sampling, of `com`; zero knowledge, of each inner message's commitment |
| Hiding | $\varepsilon_{\mathrm{hide}}$ | A commitment reveals nothing of the values it binds | Zero knowledge |
| Zero knowledge | $\varepsilon_{\mathrm{zk}}$ | Every verifier's view can be simulated from the statement alone | Zero knowledge, of the outer proof only |
| A faithful verifier circuit | None | The circuit accepts only transcripts that `verify` accepts | Zero knowledge |

Knowledge soundness, not plain soundness, is what both layers need. Hiding commitments open to almost any value, so a sound proof that *some* values satisfy the statement says nothing about which values `com` bound. Sampling defines a incorrect proof block through the extracted values, and zero knowledge extracts the inner transcript from the outer proof. Sampling asks nothing about what the verifier learns, and the inner proofs need no zero knowledge: zero knowledge asks it only of the outer proof.

Verity asks three more things of every construction. Zero knowledge holds against a malicious verifier, never only an honest one: the auditor is the party most interested in the developer's weights and data, as when two nations check each other. The coins are live: the challenger answers each of the prover's messages with fresh coins, so soundness rests on the interactive bound with no [random oracle](/assumptions/random-oracle), and Fiat–Shamir isn't used. And the verifier is a total, deterministic function from the challenger's record and its own copy of the statement to accept or a reason for rejecting, which reads no clock and no randomness, and whose soundness is one theorem over everything it accepts. Every commitment hashes with SHA-512, so SHA-512 is the only hash a proof's soundness rests on, through [CR · SHA-512](/assumptions/cr/sha-512) and its expected-time form.

## Flock

[Flock](/proof-systems/c-flock) implements every method:

| Method | Flock |
| --- | --- |
| `commit` | SHA-512 Merkle trees over hiding leaves, `frame-v3-sha512/hm96-sha512` |
| `prove`, `verify` | Flock: block R1CS with a Ligerito polynomial commitment over $\mathrm{GF}(2^{128})$, on the challenger's live coins, with a [zero-knowledge mode](/proof-systems/c-flock#zero-knowledge-mode) for the outer proofs |
| `verify` as a circuit | Its verifier as public Boolean circuits, proved by the outer sessions ([the verifier as a circuit](/proof-systems/c-flock#the-verifier-as-a-circuit)) |

Its verifier is written in Lean, with upstream Flock's Rust verifier as a cross-check ([verification phase](/proof-systems/c-flock#verification-phase)). Flock's page bounds $\varepsilon_{\mathrm{ks}}$ and $\varepsilon_{\mathrm{bind}}$ by the success of SHA-512 collision finders built from the prover ([integrity](/proof-systems/c-flock#integrity)), and says how far Lean proves each property.
