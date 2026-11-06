A proof system here is a *commit-and-prove argument*: it binds values with a commitment, then proves statements about the committed values on the verifier's live coins. Verity's proof systems are one such argument and three compilers, each of which takes an argument and returns a stronger one:

1. **Basic proofs**, this page: the argument itself, and [Flock](#flock), the construction Verity runs. A proof shows that every gate of a circuit was computed correctly on the committed values.
2. **[Sampling](/proof-systems/sampling)** proves a random sample of a computation's proof blocks instead of all of them, and bounds how many of the rest are incorrect.
3. **[Zero-knowledge](/proof-systems/zero-knowledge)** masks every message, so the verifier learns only the verdict and the public outputs from a prover that follows the protocol.
4. **[Recursion](/proof-systems/recursion)** runs the plain argument underneath and proves, with the zero-knowledge one, that its verifier would accept. With a small ZK server in front of the provers, the verifier learns only the verdict and the public outputs whatever the provers do, and committing to the circuit as well hides the circuit.

~~~mermaid
flowchart LR
  basic["Basic proofs<br/>Flock"]
  samp["Sampling"]
  zk["Zero-knowledge<br/>Flock's masked mode"]
  rec["Recursion"]
  basic -->|"per proof block"| samp
  basic -->|"masked"| zk
  samp -->|"inner proofs"| rec
  zk -->|"outer proof"| rec
~~~

Arrows point from an argument to the compiler that takes it. Recursion takes two: sampling's proofs as its inner protocol, and the zero-knowledge argument for its outer proof. No compiler names a construction: each asks only for the methods and properties below, so a construction that has them serves all three unchanged.

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
| `commit(trace, gates) -> com` | Binds a trace's values at a set of gates, before any coin that tests them | Sampling, for the boundary gates; recursion, hiding, for each inner message |
| `prove(stmt, com, trace, coins)` | The prover's side of an interactive proof that `stmt` holds of `com`'s values, one message per round of live coins | Sampling, for the sampled proof blocks; recursion, for the outer statement |
| `verify(stmt, com, transcript) -> bool` | The verifier's side: accept or reject the proof | Both |
| `verify` as a circuit | `verify` written as a circuit, so that a proof can show a transcript would have been accepted: $V_\Pi$, when the construction runs as recursion's $\Pi$ | Recursion |

## Properties

Each property is stated for one audit: one commitment, and one statement about it picked by any rule fixed before the first coin. An audit therefore pays each error term once, however many proof blocks it proves against the commitment. This is what lets a prover commit once and prove many statements: binding makes every statement proved against `com` read one committed trace $\tau^\star$, fixed when `com` is sent.

| Property | Error | What it asks | Needed by |
| --- | --- | --- | --- |
| Completeness | None | `verify` accepts `prove` on a true statement | Both |
| Knowledge soundness | $\varepsilon_{\mathrm{ks}}$ | When `verify` accepts, an extractor recovers values that satisfy the picked statement | Sampling, of the inner proofs; recursion, of the outer proof |
| Binding | $\varepsilon_{\mathrm{bind}}$ | The extracted values agree with the committed trace $\tau^\star$ on the picked statement's gates | Sampling, of `com`; recursion, of each inner message's commitment |
| Hiding | $\varepsilon_{\mathrm{hide}}$ | A commitment reveals nothing of the values it binds | Recursion |
| Zero knowledge | $\varepsilon_{\mathrm{zk}}$ | Every verifier's view can be simulated from the statement alone | Recursion, of the outer proof only |
| A faithful verifier circuit | None | The circuit accepts only transcripts that `verify` accepts | Recursion |

Knowledge soundness, not plain soundness, is what both sampling and recursion need. Hiding commitments open to almost any value, so a sound proof that *some* values satisfy the statement says nothing about which values `com` bound. Sampling defines an incorrect proof block through the extracted values, and recursion extracts the inner transcript from the outer proof. Sampling asks nothing about what the verifier learns, and the inner proofs need no zero knowledge: recursion asks it only of the outer proof.

Verity asks three more things of every construction. Zero knowledge holds against a malicious verifier, never only an honest one: the auditor is the party most interested in the developer's weights and data, as when two nations check each other. The coins are live: the challenger answers each of the prover's messages with fresh coins, so soundness rests on the interactive bound with no [random oracle](/assumptions/random-oracle), and Fiat–Shamir isn't used. And the verifier is a total, deterministic function from the challenger's record and its own copy of the statement to accept or a reason for rejecting, which reads no clock and no randomness, and whose soundness is one theorem over everything it accepts. Every commitment hashes with SHA-512, so SHA-512 is the only hash a proof's soundness rests on, through [CR · SHA-512](/assumptions/cr/sha-512) and its expected-time form.

## Flock

Flock ([Bünz, Rothblum and Wang](https://eprint.iacr.org/2026/1329)) proves the correct evaluation of arbitrary Boolean circuits. Verity runs it with the following modifications:

1. **Interactivity:** The verifier's challenges are sampled live by a challenger, instead of derived by the Fiat–Shamir transformation. Proofs are therefore not transferable: a proof convinces only the verifier whose challenger sampled its challenges.
2. **Increased soundness via repetition:** Flock runs twice against one committed witness, with independent challenges, which roughly squares the soundness error, from about $2^{-97.8}$ to about $2^{-195.5}$.
3. **Hiding commitment scheme:** The Merkle trees use SHA-512 with hiding leaves, instead of SHA-256 or BLAKE3 with plain leaves.
4. **Including commitments in the statement:** The statement includes the SHA-512 computations that produce the commitments to the circuit's inputs and hidden outputs, so a proof is about the committed values and Flock is a commit-and-prove argument. Values known to the verifier are checked as additional evaluation claims on the witness, batched into Flock's opening.
5. **Optional zero-knowledge variant:** In the [zero-knowledge mode](/proof-systems/zero-knowledge), every prover message is masked, following VEIL, and the challenger commits to its challenges in advance.

Flock's polynomial IOP is unchanged: the zerocheck, the lincheck, ring switching and the Ligerito opening, over the binary field $\mathrm{GF}(2^{128})$, with Flock's 100-bit parameters. A binary field suits Boolean circuits: a bit is a field element and XOR is field addition, so both the gates of a circuit and the bitwise rounds of SHA-512 have small arithmetizations.

We implement the verifier in Lean, directly from the Flock paper, and formally verify its soundness. The verifier rejects every statement outside the scope of its soundness theorem, so the theorem covers every session it accepts.

Flock implements every method:

| Method | Flock |
| --- | --- |
| `commit` | SHA-512 Merkle trees over hiding leaves, `frame-v3-sha512/hm96-sha512` |
| `prove`, `verify` | Flock: block R1CS with a Ligerito polynomial commitment over $\mathrm{GF}(2^{128})$, on the challenger's live coins, with a [zero-knowledge mode](/proof-systems/zero-knowledge) for the outer proofs |
| `verify` as a circuit | Its verifier as public Boolean circuits, proved by the outer sessions ([the verifier as a circuit](/proof-systems/recursion#the-verifier-as-a-circuit)) |

Its verifier is written in Lean, with upstream Flock's Rust verifier as a cross-check ([verification phase](#verification-phase)). The sections below bound $\varepsilon_{\mathrm{ks}}$ and $\varepsilon_{\mathrm{bind}}$ by the success of SHA-512 collision finders built from the prover ([integrity](#integrity)), and says how far Lean proves each property.

Measured costs are on Performance.

## Interface

### Parties

| Party | Description |
| --- | --- |
| Prover | Has committed to the values of a circuit's evaluation, and proves that they are correct. |
| Verifier | Decides whether to accept. During the session it runs a challenger, which answers each prover message with fresh challenges and records the session; afterwards it checks the record. |

### Public parameters

| Parameter | Description |
| --- | --- |
| `circuit` | The Boolean circuit. In an audit, it consists of the sampled proof blocks. |
| `com` | The commitment to the values the circuit reads and writes: the commit string of each row of values (a hiding leaf), and the SHA-512 Merkle roots over the commit strings. |

### Private input

| Input | Description |
| --- | --- |
| `trace` | The value of every gate of `circuit`, and the salt of each committed row. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | Every check in both repetitions passed. |
| `reject(reason)` | Some check failed. The reason is diagnostic only. |

## Protocol

In the figures below, the label beside each line names the party that executes it, and an arrow sends a value to the party it points to. The challenger acts during the session and the verifier afterwards, both on the verifier's behalf. Click a function to see its definition.

### The relation

Flock proves the satisfiability of a block R1CS over $\mathrm{GF}(2)$:

$$
A z \circ B z = z, \qquad A = I_{2^{n}} \otimes A_0, \quad B = I_{2^{n}} \otimes B_0
$$

The witness $z$ consists of $2^{n}$ blocks of $2^{k}$ bits, all constrained by the same matrices $A_0$ and $B_0$: each bit of $z$ is the product of two linear forms in the bits of its block. With one column fixed to 1, an AND gate is $z_i = a \cdot b$, an XOR gate is $z_i = (a + b) \cdot 1$, and a NOT gate is $z_i = (a + 1) \cdot 1$. Each block is divided into slots, and each slot holds one copy of a subcircuit: the gates of a proof block, or one SHA-512 compression.

The commitment is part of the relation. For each committed row that the circuit reads or writes, the relation also computes, from the row and its salt, the row's SHA-512 digest and its commit string (what a proof proves). The commit strings are public, and the verifier recomputes the Merkle roots from them. Each output of the circuit is either public or a hidden row, committed in the same way as an input.

The bits whose values the verifier knows (the commit strings, the public outputs and the constant column) form the *public regions*. The verifier checks each public region as an evaluation claim on the multilinear extension of $z$ at two random points, the *link points*, which the challenger samples after the prover commits.

### Commitment phase

The prover derives the statement from `circuit` and `com`, lays out its trace as the witness $z$, and commits to $z$ with Ligerito ([Novakovic and Angeris](https://eprint.iacr.org/2025/1187)): it encodes $z$ with a Reed–Solomon code and hashes the codeword into SHA-512 Merkle trees with hiding leaves. The challenger responds with the link points. The statement, the committed witness and the link points are therefore fixed before the first challenge of either repetition.

![Commitment phase](/programs/flock#commit)

### Proving phase

The prover then runs Flock twice against the committed witness, with Flock's 100-bit parameters (`fast100`) and independent challenges in each repetition. A repetition has four steps:

1. **Zerocheck.** A sum-check reduces the claim that every constraint holds to a single evaluation claim. Its first 6 variables are handled by a univariate skip, with evaluation points in the subfield $\mathrm{GF}(2^8)$.
2. **Lincheck.** A second sum-check reduces the claims about $Az$ and $Bz$ to claims about $z$, batched with the claim for the constant column.
3. **Ring switching.** The claims about the bit-packed witness are converted into claims about a multilinear polynomial over $\mathrm{GF}(2^{128})$ and batched into a single opening claim.
4. **Ligerito.** The prover opens the commitment at that claim, folding over the degree-2 extension field $\mathrm{GF}(2^{256})$.

The challenger records each prover message before it samples the challenge that answers it, and the record keeps the message bytes, so the verifier can check which message each challenge answered. The prover therefore cannot choose a message after seeing its challenge, and binding messages to challenges needs no hash function. Fiat–Shamir would give a much weaker bound at these parameters ([knowledge soundness](#knowledge-soundness)).

![Proving phase](/programs/flock#prove)

### Verification phase

After the session, the challenger hands its record to the verifier. The verifier derives the statement from its own copies of `circuit` and `com`, not from anything the prover sent, and replays the record. `verify` is a total function written in Lean, and it reads nothing but its inputs: no clock, no randomness and no other file.

![Verification phase](/programs/flock#verify)

`verify` accepts only statements covered by its soundness theorem and rejects all others, so the theorem applies to every session it accepts, for any Boolean circuit and with no hypothesis on the circuit file. Concretely, a session must record a sample (by `stratified:K`, or by `subset:K` in the zero-knowledge mode), retain every round's message bytes, use hiding leaves in every tree, and prove a single table (or several, in the zero-knowledge mode). Its sizes must lie in these ranges:

| Quantity | Accepted |
| --- | --- |
| Witness size $m = k + n$ | 22 to 35 |
| Bits per block, $2^{k}$ | $k \le 27$ |
| Public regions | At most 1,024 |
| Coordinates of a link point | At most 64 |

Rejecting a statement outside these forms costs completeness, not soundness. Circuit inputs and outputs use one canonical format, which the theorem covers in general, so a new workload needs no change to the verifier or to its proof.

Flock's Rust verifier, with Flock's changes applied, serves as a cross-check: on every session in the test corpus (honest sessions, malformed records, forgeries, mutated proofs and fuzzed variants of honest sessions), the two verifiers must return the same verdict. A disagreement is resolved against the Flock paper and Flock's specification. Where the specification is deliberately stricter than the Rust code, its verdict stands and the Rust verdict is recorded alongside it. Agreement reduces the trust placed in Lean's compiler and runtime, but only on the inputs the tests exercise. The Rust verifier has no zero-knowledge mode, so zero-knowledge sessions are not cross-checked.

## Security

### Assumptions

The theorems below assume the following.

- *Fresh randomness.* The sample and the challenges are uniform, independent bytes from the verifier's operating system, and the prover learns each challenge only after sending the message it answers.
- *Record integrity.* The record and the sample that `verify` reads are those the challenger wrote during the live session.
- *Collision resistance of SHA-512*, in two forms, each applied only to collision finders that the proofs construct from the prover:
  - [CR · SHA-512](/assumptions/cr/sha-512): a finder that makes $q$ SHA-512 evaluations outputs a collision with probability at most $q^2/2^{513}$.
  - ECR · SHA-512, the expected-time form: a finder that makes $T$ evaluations in expectation outputs a collision with probability at most $T/2^{256}$.

The collision-resistance assumptions are stated for explicit adversaries because the usual formulation is false for a fixed, unkeyed hash function: SHA-512 has collisions, so an efficient program that outputs one exists, even though nobody knows it. Following [Rogaway](https://eprint.iacr.org/2006/281), each theorem bounds its error by a statistical term plus the success probability of collision finders constructed explicitly from the prover, and the two conjectures bound that success probability.

### Completeness

If the trace satisfies `circuit` and its rows open `com`, the honest prover is accepted. In the zero-knowledge mode the prover aborts on certain degenerate challenges, so there it is accepted except with probability at most $2^{-128}$ times the number of challenges.

~~~proof pending
Each of Flock's checks is an identity that holds on a satisfying witness for every choice of challenges: the sums of the two sum-checks, the ring-switching claim and the Ligerito openings.
~~~

### Knowledge soundness

If `verify` accepts, then except with probability $\varepsilon_{\mathrm{ks}}$ per table, a witness can be extracted from the prover's commitment. Soundness alone would not suffice: a hiding leaf can be opened to almost any value, so a proof that *some* witness satisfies the statement would say nothing about the values the prover committed to. The extractor rewinds the prover to just after its commitment, fills each opened position of the codeword with the first opening that verified there, and decodes within Ligerito's proximity radius.

The error has a statistical term and a hashing term. The statistical term is the error of the idealized protocol in which the committed codewords are sent in full. By Flock's round-by-round analysis it is about $2^{-97.8}$ for one repetition. (Flock's parameters credit a few bits to grinding, a hash puzzle the prover solves before certain Fiat–Shamir challenges. With live challenges grinding has no effect, so Flock credits none, and one repetition falls just short of 100 bits.) Two repetitions with independent challenges give about $2^{-195.5}$, and the bound proved in Lean is $2^{-205}$ per table for every $m$ from 22 to 35. The hashing term is the success probability of two SHA-512 collision finders built from the prover, one against the Merkle trees and one built from the extractor's rewinding. Under CR · SHA-512, for a prover that makes $t$ SHA-512 evaluations,

$$
\varepsilon_{\mathrm{ks}} \;\approx\; 2^{-205} + t \cdot 2^{-238.7}
$$

per table at the largest witness size, which is below $2^{-128}$ for $t$ up to about $2^{110.7}$.

We sample challenges live because Fiat–Shamir gives a much weaker bound at these parameters: a Fiat–Shamir analysis charges every round's error for the prover's hash queries, and the same parameters would give at most $2^{-75.6}$. The cost is that proofs are not transferable.

~~~proof instantiated
The statistical term, $2^{-205}$ per table for each $m$ from 22 to 35, is proved in Lean. The proximity results for Ligerito on which the extractor's decoding rests are proved in ArkLib, not assumed. The whole of $\varepsilon_{\mathrm{ks}}$, for Flock as `verify` implements it, is proved as part of the integrity theorem below, with the hashing term given by the success probabilities of the two finders.
~~~

### Integrity

Flock supplies the two error terms in the [integrity bound](/proof-systems/sampling#integrity) of Sampling. Its committed trace $\tau^\star$ takes, at each commit string, the value that extraction from accepting runs recovers most often. Like any committed trace, $\tau^\star$ is an object of the analysis: it is fixed by the prover's strategy once the prover sends `com`, before the sample. A proof block is incorrect in $\tau^\star$ with respect to the circuit as `verify` parses it.

For every prover and every sampling design, the probability that `verify` accepts while some sampled proof block is incorrect is at most $\varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$, with each term averaged over the sample. This is the property Sampling requires of its argument. For the samples that `verify` accepts, the whole of Sampling's bound is also proved in Lean; for a uniformly random $k$-subset of $n$ proof blocks it reads

$$
\Pr\big[\mathsf{accept} \,\wedge\, \text{at least } K_0 \text{ proof blocks incorrect}\big] \;\le\; \binom{n - K_0}{k} \Big/ \binom{n}{k} \;+\; \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}
$$

Here $\varepsilon_{\mathrm{bind}}$ is the success probability of an adversary against binding, which reruns the prover through the extractor and wins if two runs recover different values for the same commit string, weighted by how often the sample reads each commit string, plus statistical terms for the adversary's trials. Under ECR · SHA-512 it is about

$$
\varepsilon_{\mathrm{bind}} \;\approx\; \frac{t \cdot Q_s \cdot 8N_0/e}{2^{256}}
$$

where $Q_s$ is the expected number of commit strings that the sampled proof blocks read and $N_0 = 2^{21}$ is the length of Ligerito's first codeword. For an audit whose sampled proof blocks read $Q_s = 2^{24}$ commit strings, this is $t \cdot 2^{-209.4}$, or $2^{-129.4}$ at $t = 2^{80}$, and it dominates $\varepsilon_{\mathrm{ks}}$. This term is where the expected-time form of the assumption is needed: under CR · SHA-512 alone, the same term is $t^{2/3} \cdot Q_s \cdot (12N_0/e)/2^{512/3}$, which is $2^{-70.2}$ at $t = 2^{80}$.

~~~proof instantiated
Proved in Lean for Flock as `verify` implements it: for a stratified sample proved in one table, with or without zero knowledge, and for a uniformly random subset proved in a zero-knowledge session with any number of tables, with public or hidden outputs. The bound on the sampled proof blocks holds for every sample and needs no assumption on its randomness; the subset bound also assumes fresh randomness.
~~~

## Parameters

| Parameter | Value |
| --- | --- |
| Field | $\mathrm{GF}(2^{128})$ in GHASH form, $\mathbb{F}_2[x]/(x^{128} + x^7 + x^2 + x + 1)$ |
| Extension | $\mathrm{GF}(2^{128})[u]/(u^2 + u + x^{-1})$, for Ligerito's folding |
| Univariate skip | The zerocheck's first 6 variables, with points in $\mathrm{GF}(2^8)$ |
| Profile | `fast100`, two repetitions on one committed witness |
| Witness size | $2^m$ bits, $m$ from 22 to 35 |
| Statistical error | $2^{-205}$ per table |
| Hiding leaves | `hm96-sha512/v1` in Ligerito's trees, `hm96-sha512/row/v1` for committed rows |
| Coin commitment | `coin-tree/hm96-sha512/v2`, in the zero-knowledge mode |
| Sampling designs | `stratified:K`, and `subset:K` in the zero-knowledge mode |
| Hash | SHA-512, in every commitment |

## References

- Bünz, Rothblum and Wang. [Flock](https://eprint.iacr.org/2026/1329). ePrint 2026/1329. The proof system Flock modifies.
- A. Novakovic and G. Angeris. [Ligerito](https://eprint.iacr.org/2025/1187). ePrint 2025/1187. The polynomial commitment scheme Flock opens with.
- A. Dalal, T. Hemo, R. Rabinovich and R. Rothblum. [VEIL](https://eprint.iacr.org/2026/683). ePrint 2026/683. The masking the zero-knowledge mode follows.
- O. Goldreich and A. Kahan. How to construct constant-round zero-knowledge proof systems for NP. *Journal of Cryptology*, 1996. Zero knowledge against malicious verifiers from committed coins and rewinding.
- S. Halevi and S. Micali. Practical and provably-secure commitment schemes from collision-free hashing. CRYPTO 1996. The hiding leaves.
- P. Rogaway. [Formalizing human ignorance: collision-resistant hashing without the keys](https://eprint.iacr.org/2006/281). VIETCRYPT 2006. Security statements for unkeyed hash functions through explicit reductions.
