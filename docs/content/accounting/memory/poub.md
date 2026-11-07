Proof of useful bandwidth (PoUB) bounds from below how many reads of a registered store a node made. The node registers a store of 4 KiB blocks, encoded under a seed it couldn't predict, and reads it in chained passes: each pass's seed comes from the window's challenge and the previous pass's root, so a read serves at most one receipt. A verifier with no hardware at the site opens receipts it draws once each window's roots are in. An accepted session certifies that the node's credited reads were at least $(1 - \gamma) R \Sigma$, where $R$ is the node's read capacity and $\Sigma$ the session's span. No prover hardware is trusted: the host, its CPUs and its NICs are all part of the prover. This page states the protocol and that bound; what it leaves of the node's bandwidth is [memory accounting](/accounting/memory#bandwidth)'s.

The [onsite](/protocols/onsite) protocol runs PoUB over PoUS's store, the [P2 session](#on-pouss-store). PoUB's code still carries an older name, the remote bandwidth audit (`remote_bandwidth`, its Lean verifier `RemoteAudit`).

## Interface

### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Node | $\mathcal{N}$ | The prover: its GPUs' HBM, its host's DRAM, and everything else on the node. It registers a store, runs chained passes over it, sends each pass's plan with the root of its receipts, and opens what the verifier draws. |
| Challenger | $\mathcal{C}$ | The proof service's one challenger, on the auditor's host. It draws every coin of a session and commits to them before the session, releases each once, after the root the verifier recorded for it, and signs the log of releases. |
| Verifier | $\mathcal{V}$ | Remote, with no hardware at the site. It holds a secret source for the codec seed and a clock, keeps the record, and checks the openings. |

### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `blocks` | $N$ | The registered store's blocks, $b = 4{,}096$ bytes each. |
| `windows`, `window_ns` | $W$, $T$ | $W$ windows a session, each at least $T = 60$ s. |
| `deadline_ns` | $A$ | Window $t$'s roots are due by $b_t + A$, where $b_t$ is when its boundary message left: $A = \mathrm{RTT} + 2J + t_{\mathrm{pass}} + g$, a whole round trip with each direction's jitter $J$, the pass in flight and the gap $g$ a pass waits on. |
| `samples`, `delta` | $s$, $\delta$ | $s = 33{,}273$ openings a window, 555 a second, at $\delta = 2^{-40}$. |
| `min_passes` | | The fewest passes a window may certify. |
| `codec` | | Sloth over $p = 2^{1024} - 105$ with a mask between rounds, at $k = 3$ (`p1024/k3/masked`). |
| `receipt` | | `sketch-sha512`, a $\pm 1$ projection of the block hashed with SHA-512, at 16 rows unless the registration names 64. |

### Private input

| Input | Description |
| --- | --- |
| Payload | The weights, the KV pages and filler, in 4 KiB blocks, each committed under a hiding leaf. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | Every window's openings check. The record holds each window's passes, receipts $U_t$, span and integrity profile: every input of $\gamma$ but the node's measured $R$ and on-chip storage $S_{\mathrm{chip}}$. |
| `reject` | A late root (`late`), too few passes (`few`), or an opening that fails. A rejected window ends its session, and nothing of it is recorded. |

## Protocol

### Registration

1. The node commits to its payload blocks: a frame-v3-sha512 tree with one hm96-sha512 hiding leaf a block, the leaf PoUS's answer circuit proves over a block.
2. Only after the payload root has arrived does the verifier draw the codec seed, from its own secret and a fresh nonce.
3. The node encodes every block under that seed, $E_j = \mathrm{encode}(\mathrm{payload}_j)$.
4. The registration's digest binds the node, $N$, the payload root, the codec seed, the codec, the receipt kind and the sketch's rows. Each session's coins and its chain start from it.

The payload root is the node's choice unless the verifier holds it to a store it can recompute. Under a binding to a pinned model, the verifier lays out the store the checkpoint alone fixes, its weights in vLLM's module order and filler of zeros, and refuses a payload root that isn't that store's.

### Chained passes

Before a session the challenger commits to its coins: a challenge and an openings coin for each window. The verifier releases $\mathrm{chal}_0$ at the start, and at each window's end a boundary message, which is the next window's challenge. Pass $i$ of window $t$ is seeded by

$$
\mathrm{seed}_{t,i} \;=\; \mathrm{SHA512}\big(\texttt{seed} \,\Vert\, \mathrm{chal}_t \,\Vert\, i \,\Vert\, \mathrm{root}_{t,i-1}\big)
$$

with the last root of window $t - 1$ before a window's first pass, and the registration's digest before the session's. The node reads the blocks of its plan, distinct blocks in read order, makes a receipt of each under the seed, and sends the plan with the root of the pass's receipts, which seeds the next pass. The chain runs on through each boundary, so a window's end costs nothing. Inside a window the seeds are Fiat–Shamir, the one exception to live coins, since a live coin a pass is impractical at its rate; each window's challenge and openings coin are live.

#### What the chain forces

A receipt of pass $(t, i)$ needs its seed, which is unpredictable until $\mathrm{root}_{t,i-1}$ is fixed, in the random-oracle model, to a prover within its query budget. So the reads behind pass $(t, i)$'s correct receipts all come after the reads behind pass $(t, i-1)$'s. A plan's blocks are distinct, so one read serves at most one receipt of the session, unless the block stayed on chip since an earlier read. The order comes from the hashes, not the clock, so no round-trip floor is assumed. The deadlines only place each window's reads within its span, so that each window certifies a rate, and fix its roots before its openings are drawn.

### Openings

Once a window's roots are final, the challenger releases its openings coin, and the verifier draws $s$ distinct receipts uniformly from the window's $U_t$. The coin leaves only after every root it draws from is fixed. Drawing from the window's last root instead would let a prover grind: re-salting the last leaf re-rolls the draws for the price of a leaf and its path. The node opens each draw with the block, its receipt leaf with the leaf's salt and path to the pass's root, and the payload's salt and path to the payload root.

#### The check

A window passes when every opening checks: the indices are the draw's and every field has its size; the receipt leaf has its path to the pass's root, under the pass's seed and plan; every word of the block is below $p$, and the block decodes to a payload whose leaf has its path to the payload root; and the receipt, recomputed from the block under the registration's kind, is the leaf's. The verifier derives the sketch's signs from the seed itself and takes no sketch from the node. A pass whose seed is not the chain's fails at its first opening.

## Security

### The model

The prover is the whole node, one undifferentiated resource of capacity $R$: its read bandwidth over every registered tier, its GPUs' HBM plus its host's DRAM. The guarantee is over whatever reads the node made, with no assumption about which hardware made them. $R$ is the verifier's, never the node's: every term of $\gamma$ but the timing term is a fixed byte count over $R\Sigma$, so a node reporting a slower read would only shrink them.

### Assumptions

- **Random oracle.** SHA-512 as a random oracle for the seeds, against a prover of bounded queries, which the chain's ordering rests on.
- **Binding.** [CR · SHA-512](/assumptions/cr/sha-512) for the receipts' roots, charged through a fork bound (`ReceiptsBindingOfCR`).
- **Pseudorandom draws.** SHA-512 as a PRF for the openings' draws (`prf/sha-512`).
- **Rebuild cost.** Re-encoding a block from its payload takes at least the codec's squarings, 98,016 at `p1024/k3/masked`, at the node's stated ceiling (`WorkHardness(p, k)`).
- **The sketch.** Under `sketch-sha512`, a receipt also rests on the sketch's bound (`SketchBound`, derived by `Accounting.Guarantees.Remote.SketchBoundDeployed`), which adds at most $2^{-30.19}$ to one node's 10-minute session.

### Completeness

An honest node runs passes back to back and is never late: on the boundary message it finishes the pass in flight, and its last root arrives at most $A - 1$ ns after the boundary (`timing.honest`, replayed against the verifier in the tests).

### Bandwidth bound

On an accepted session, the credited reads over its span $\Sigma$ are at least $(1 - \gamma) R \Sigma$, with

$$
\gamma \;=\; \mu_{\mathrm{timing}} + \mu_{\mathrm{sample}} + \mu_{\mathrm{chip}} + \lambda + \mu_{\mathrm{rebuild}} + \mu_{\mathrm{host}} + \mu_{\mathrm{link}} + \mu_{\mathrm{carrier}}
$$

| Term | What it is | From |
| --- | --- | --- |
| $\mu_{\mathrm{timing}}$ | The span the credited receipts don't fill: the gap $g$ after each pass and the session's two ends. In steady state $g / (t_{\mathrm{pass}} + g)$, 0.25% at 20 ms passes. | The record |
| $\mu_{\mathrm{sample}}$ | The wrong receipts the openings allow at $\delta$, per window or pooled over the session. | The record's profiles |
| $\mu_{\mathrm{chip}}$ | What each pass can hold on chip instead of reading again, $P_t S_{\mathrm{chip}} / (R\Sigma)$ summed over windows. | $S_{\mathrm{chip}}$, measured |
| $\lambda$ | The random oracle's slack: the bits that name a pass's queried blocks, plus a fixed slack. | Proved, `Bandwidth.Guarantees.AuditRO` per pass |
| $\mu_{\mathrm{rebuild}}$ | Blocks re-encoded from their payloads instead of read, at the node's stated squaring ceiling. | The record's codec, and `WorkHardness(p, k)` |
| $\mu_{\mathrm{host}}$, $\mu_{\mathrm{link}}$ | The host tier's own shortfall, and relays over a link under a registration that binds PoUW's tiles. | Models, passed through |
| $\mu_{\mathrm{carrier}}$ | A block appended after the codec seed that holds another block's encoding, when such blocks are credited. | The property's verdict |

The protocol bounds the first four, prices $\mu_{\mathrm{rebuild}}$ from the record's codec, passes $\mu_{\mathrm{host}}$ and $\mu_{\mathrm{link}}$ through, and reads $\mu_{\mathrm{carrier}}$ off a verdict. The failure probability is $W\delta$ read per window, or $\delta$ pooled over the session, plus $2^{-\mathrm{slack}}$ a pass, $s / 2^{512}$ a window for guessing a receipt, and the draw's rejection and binding terms.

The same terms over window $t$'s own span give $\gamma_t$, and the every-window claim is $\max_t \gamma_t$, reported beside the session's $\gamma$. No read serves two windows' receipts, so a window the node leaves idle shows in its own $\gamma_t$, where the session's $\gamma$ sees about $1/W$ of it.

The statement is `Accounting.Guarantees.RemoteSessionRunConservation`, with `RemoteWindowRunConservation` for one window, proved by `Accounting.SecurityProofs.Remote.Conservation` at the per-pass routes; the openings are `RateWindowDraw`, `RateSessionDraw` and, on the deployed draw, `Accounting.Guarantees.Remote.PooledDraw`. The binding term is charged on the hypothesis that each window's receipts are fixed by the cut before its openings coin. The protocol is built so that they are, but the Lean statement that the prover's play fixes them is open (the gap `binding-split`), so every reading is conditional on it.

### From the check to the bound

The verifier of record is Lean (`RemoteAudit`: `verifyWindow`, a window's draw and its openings' checks, and `RemoteAudit.Session`, the session's bookkeeping), held to the Python reference by a difftest over every event, the outcome and the record. Three things are not yet zero-knowledge:

- **Openings are in the clear.** An opened block can decode to a KV page, user data. The clear checks are the specification of what each proof block proves; deployed, each drawn receipt is a proof block the proof service proves in zero knowledge.
- **Plans are in the clear.** The verifier sees which blocks each pass covers, and so which KV pages were live.
- **The requirement's units are inputs.** Credit for the served circuit's reads, and for blocks appended after the seed, waits on unit verdicts that sessions don't yet prove.

## On PoUS's store

The P2 session (`verity/remote-bandwidth/p2/v0`) runs the same audit over [PoUS](/accounting/memory/pous)'s store $C^*$, its weights under P2, so the receipts come from the GPU's own decode of $C^*$ while it serves. A unit is four consecutive 2,056-byte blocks, 8,224 bytes, and the registration is PoUS's setup: the commitment to $W$, the salt the verifier draws after it, and the root of the key built from the $C^*$ that decodes to $W$. Seeds, plans, leaves, windows, deadlines, coins and draws are unchanged. Onsite requires PoUS and PoUB to commit to the same store.

## Parameters

| Quantity | Value |
| --- | --- |
| Window | $T = 60$ s, $s = 33{,}273$ openings, $\delta = 2^{-40}$ |
| Node | Eight RTX PRO 6000s and the host: $R$ = 12.92 TB/s measured, 13.60 TB/s specified; $S_{\mathrm{chip}} \approx 3.11$ GB |
| Rebuild | 98,016 squarings a block at `p1024/k3/masked`; $\mu_{\mathrm{rebuild}} = 0.065\%$ |
| Worst window | $\gamma_t$ = 0.896–0.927% at RTT 1–20 ms, with a 789 GB store over every tier, at the measured $R$; 5.82–5.85% at the specified $R$ |
| Session of 10 minutes | Pooled $\mu_{\mathrm{sample}}$ 0.0083%; whole $\gamma$ 0.67% |

Every window stays under 1% only with the store over every tier, host DRAM holding its share: below about 380 GB no window length meets it, and a store in the GPUs' HBM alone leaves host DRAM's 4.7% of $R$ idle. The 1% holds at the measured $R$ only; the specified $R$, which no measured kernel reaches, is the headline. The two-machine sessions so far are one GPU's, over an 85 GiB store: both honest sessions were accepted, and a prover dropping 1/16 of its blocks was rejected in its first window.
