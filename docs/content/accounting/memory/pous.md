Proof of useful space (PoUS) bounds from below how much of an encoding of the committed weights a server holds. The server keeps the weights $W$ only as an encoding $C$, slow to build and fast to decode, and a memory challenger asks for random blocks of $C$ one at a time, each due within a deadline too short to rebuild a block the server doesn't hold. An accept certifies that the server held more than $S = \lfloor \tfrac{18}{19}\lvert C\rvert \rfloor$ bits at some point between setup and the session's last round: a server that keeps at most $S$ bits throughout fails. This page states the protocol and that bound; where those bits sit, and what they leave of a device's memory, is [memory accounting](/docs/accounting/memory)'s.

## Interface

### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Server | $\mathcal{S}$ | The developer's machine. It commits to $W$, encodes it into $C$, holds $C$, and answers each challenge with a block. |
| Memory challenger | $\mathcal{M}$ | The auditor's device, on a machine the prover doesn't control and never on the prover's node (the `trusted-nebius-host` assumption). It commits its indices, reveals them one at a time, times each answer on its own clock, and signs the session. |
| Verifier | $\mathcal{V}$ | Draws the salt, checks the setup, and checks the signed session. |

### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `scheme` | $w, p, B$ | P2: blocks of $w = 16{,}448$ bits modulo the prime $p = 2^{16448} - 21065$, $B = 2^{19}$ of them, so $\lvert C\rvert \approx 1.078$ GB. Each block carries 2,054 bytes of $W$. |
| `k` | $k$ | 105 sequential challenges, uniform over the blocks, with replacement. |
| `limit` | $\Delta + \mathrm{RTT}$ | Each answer's deadline: $\Delta = 500$ µs, plus a measured round-trip allowance of at most 354 µs. |
| `S` | $S$ | The state bound, $\lfloor \rho \lvert C\rvert \rfloor$ at $\rho = 18/19$, about 1.021 GB. |

### Private input

| Input | Description |
| --- | --- |
| `W` | The weights, fixed before the salt is drawn. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | The setup decodes to the committed $W$, and every challenge was answered with its block in time. |
| `reject` | Otherwise. |

## Protocol

Each line is run by the party beside it, and an arrow sends a value to another party. Click a function to see what it computes.

### Commitment

![Commit](/programs/pous#commit)

### Setup

![Setup](/programs/pous#setup)

The salt is drawn after the commitment, so the server can't choose $W$ to suit it. The encoder's output is public: the verifier decodes $C$ and refuses it unless it is exactly the committed $W$'s encoding, then publishes $C$'s root.

#### The encoding

Write $d(z) = \pm z^2 \bmod p$ (the sign by $z$'s parity) and $\rho = d^{-1}$, a modular square root $y^{(p+1)/4}$. Block $j$ of $W$ is encoded as

$$
E_j(m) = \rho\big(\sigma_{K_j}(\rho(m + t_j))\big), \qquad D_j(c) = d\big(\sigma_{K_j}(d(c))\big) - t_j
$$

where $\sigma_K$ XORs a full-width mask, keeping the value when it would leave $[0, p)$, and $K_j$, $t_j$ come from SHA-512 counter mode over the salt, the commitment and the block's position. A root is about 16,447 sequential squarings; decoding is two. So rebuilding a block takes two roots in sequence, which no allowed hardware finishes within a deadline, while serving from $C$ costs two squarings a block.

### Challenge

![Challenge](/programs/pous#challenge)

The indices come from the memory challenger's own secret, never a public beacon: from a public source a server could compute the challenged blocks in advance and rebuild only those. Index $j + 1$ goes out only after answer $j$ is in, and the first late answer ends the session. The memory challenger hashes each answer itself, so the audit needs no commitment from the server about what it sent.

### Verification

![Verify](/programs/pous#verify)

#### The check

The session passes when its signature verifies under a trusted key and names this setup's root; it ended complete after $k$ rounds; each opening opens the coin tree to its round's index; each answer's digest is the committed block's; and each round arrived within $\Delta + \mathrm{RTT}$ on the memory challenger's clock.

## Security

### The model

The bound is stated in a ring model. A server keeps at most $S$ bits between setup, the session and each round, with unbounded preprocessing. Each answer is computed in at most $D$ sequential rounds that contain a multiplication modulo $p$, $Q$ key queries and $L$ ring operations; all other local computation is free. Whether a real responder fits $D$ within the deadline is a question about hardware, taken up on [memory accounting](/docs/accounting/memory#physical-assumptions).

### Assumptions

- **The ring game is hard.** `P2RingAuditSecure` at $D = 16{,}446$, $Q = 2^{20}$, $L = 2^{64}$: in the ring model, a responder holding at most $S$ bits passes $k = 105$ challenges with probability at most $1\% + 2^{-129} + 2^{-130}$. A named conjecture (P2–M1 hardness and the sequential root), taken as a hypothesis.
- **Hiding coins.** The memory challenger's coin tree hides unrevealed indices up to $2^{-131}$.
- **$W$ before coins.** $W$ is fixed before the salt, and the salt is unpredictable to the server.
- **Binding and signatures.** [CR · SHA-512](/assumptions/cr/sha-512) for the commitments and digests; EUF-CMA for the memory challenger's LMS key.

### Completeness

A server holding all of $C$ answers every challenge with two reads and no queries, and passes with probability 1 (`HonestPassesRing`, `HonestPassesAccepts`).

### Space bound

For any $W$ and any server bounded as above, which keeps at most $S$ bits at every point between setup, the session and each round,

$$
\Pr\big[\mathsf{accept}\big] \;\le\; \delta + \varepsilon, \qquad \delta = 1\%, \quad \varepsilon \le 2^{-128}
$$

(`EndToEndRingDeployed`). The bound says nothing about a server that holds $C$ during the session and drops it otherwise; a time-averaged audit for P2, which is open, would cover that.

~~~proof
A server with at most $S$ bits lacks some share of $C$'s blocks. Answering a challenge for one of them within $D$ rounds needs a root it can't finish: at $D = 16{,}446$ a root, at 16,447 rounds, doesn't fit, and two roots are 32,894. With $k = 105$ uniform challenges, the chance that none lands on a missing block is at most $\delta$. The error $\varepsilon$ is the conjecture's two terms, $2^{-129}$ and $2^{-130}$, and the coins' hiding, $2^{-131}$.
~~~

The conjecture is false from $D = 32{,}894$, two roots' depth, since a server can then recompute a block (`tight_p16448`); the deployed $D = 16{,}446$ is one root's depth, about half that. $L$ is bounded because truncating the root's exponent passes 105 challenges at about $2^{168}$ operations.

### From the check to the bound

The bound is about the ring game; four claims, outside the theorem, tie it to the deployed code: the device model; the speed of a round, a modelled single-core floor times a measured 8-core speedup; the instantiation, that P2 with its SHA-512 keys and identity labeling is no easier than the ring game with a uniform labeling (conjectured); and SHA-512 as a PRF. Separately, in review in [#1814](https://github.com/danielreuter/verity/pull/1814): when the composed check accepts, the trusted device answered all 105 challenges with $C$'s blocks within the limit on its own clock, or the run holds a SHA-512 collision or an LMS forgery (`RunCheckAccepts`). The bound may be cited for the deployed verifier only once each audit's session id is bound into its check and the setup half of the check (`AcceptsDecodes`, `PublishesRoot`) is proved.

## Parameters

| Quantity | Value |
| --- | --- |
| Store | $2^{19}$ blocks of 2,056 bytes, 1.078 GB; $S \approx 1.021$ GB |
| Challenges, deadline | $k = 105$; $\Delta = 500$ µs, $\Delta + \mathrm{RTT} \le 854$ µs |
| Error | $\delta = 1\%$, $\varepsilon \le 2^{-128}$ |
| Storage | $C$ with its public parameters at most $1.05\,\lvert W\rvert$ |

An earlier scheme, band-chain over a permutation $\Pi_2$, is still the registry's default; its guarantees hold only for an ideal $\Pi_2$, and at the concrete one a red team rebuilt any block from 1.53% of $C$ in about 24 µs.
