A verifier with no hardware at the site certifies, window by window, how many reads of a node's registered memory the node made. Over a session's span $\Sigma$, the credited reads are at least $(1 - \gamma)\,R\,\Sigma$ bytes, where $R$ is the node's read capacity, and every term of $\gamma$ is explicit with its premises named. It is the bandwidth protocol of record, and replaces the per-GPU [bandwidth audit](/docs/accounting/bandwidth/audit).

The prover is the whole node: its GPUs' HBM, its host's DRAM, its CPUs and its NICs are one untrusted resource of capacity $R$ (Daniel, 12 Oct). Only the challenger and the verifier are trusted, as the auditor's own machines on hosts the prover doesn't control (`trusted-nebius-host`).

## Interface

### Parties

| Party | Description |
| --- | --- |
| Node (prover) | Registers a store, runs chained passes over it, and opens what the verifier draws. |
| Challenger | The auditor's online service. It draws every coin of a session before the session starts, commits to them, and releases each once. |
| Verifier | Remote. It keeps the record and its own clock, and checks. |

### Public parameters

| Parameter | Symbol | Value |
| --- | --- | --- |
| Store | $N$ | Blocks of $b = 4{,}096$ bytes, across every tier of the node: each GPU's HBM and the host's DRAM. |
| Window | $T$ | 60 s. No window ends sooner. |
| Openings | $s$ | 33,273 a window, at an error $\delta = 2^{-40}$ a window. |
| Deadline | $A$ | Window $t$'s roots are due by its boundary plus $A$. |
| Codec | | `p1024/k3/masked`: the store's encoding, which decodes a block in 96 squarings. |
| Receipt | | `sketch-sha512` at 16 rows: an exact int8 sketch of the block, then SHA-512 over the sketch. |
| Read capacity | $R$ | The node's read bandwidth over every tier, the verifier's figure, never the prover's ([below](#which-r)). |
| On-chip storage | $S_{\mathrm{chip}}$ | 3,045,746,688 B: every GPU's on-chip storage and the host's caches. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | Every window's roots arrived by its deadline and every check passed: the chain, the plans and the openings. |
| `reject` | Otherwise. |
| `gamma` | With an accept, $\gamma$ for the session and $\gamma_t$ for each window, at both readings of $R$. |

## Protocol

~~~mermaid
sequenceDiagram
  participant N as Node (prover)
  participant C as Challenger
  participant V as Verifier
  N->>V: register the store: one root over N blocks of 4 KiB
  C->>V: commit to every coin of the session
  loop each window t, 60 s
    C->>N: challenge for window t
    loop chained passes
      Note over N: seed from the challenge and the previous root; read the plan's blocks; one receipt each
      N->>V: the pass's plan and root
    end
    V->>N: window boundary
    N->>V: last roots, by the deadline
    C->>V: openings coin
    V->>N: 33,273 openings
    N->>V: an opening each
  end
~~~

1. **Registration.** The node commits its store: $N$ blocks of 4 KiB across every tier, in a frame-v3-sha512 tree of hm96 leaves. A node has one live registration at a time.
2. **Coins.** The challenger draws every coin of the session before it starts, commits to them, and releases each once.
3. **Windows.** Window $t$'s challenge $\sigma_t$ starts a chain of passes. Each pass's seed comes from $\sigma_t$ and the previous root, so the passes are chained. This is Fiat–Shamir inside a window, allowed for this protocol only (Daniel, 12 Oct), because a live coin a pass is impractical at its rate. Each pass reads a plan of distinct blocks and emits a receipt for each. The window's roots are due by its deadline.
4. **Openings.** A live coin draws 33,273 openings a window. Each opening is specified as one zero-knowledge proof unit (§8 of the protocol, [#2432](https://github.com/compute-verification/verity/pull/2432)). The units are being built, and every run so far, including those below, checks openings in the clear.
5. **KV pages.** Serving reports the KV blocks it writes and frees, in the `memory-map/v1` format. An appended block gets a fresh index and an append coin, released only after its digest is committed. A released block leaves every later plan, and blocks are re-keyed every lifetime $L$.

## Security

### Guarantee

On an accept, over the session's span $\Sigma$, the credited reads are at least $(1 - \gamma)\,R\,\Sigma$, with

$$
\gamma \;=\; \mu_{\mathrm{timing}} + \mu_{\mathrm{sample}} + \mu_{\mathrm{chip}} + \lambda + \mu_{\mathrm{rebuild}} + \mu_{\mathrm{host}} + \mu_{\mathrm{link}} + \mu_{\mathrm{carrier}}.
$$

~~~proof abstract
The bound is `RemoteSessionConservationSketchDeployed` (`Security/Models/Accounting/Guarantees/RateAuditDeployed.lean`), proved in Lean for the session as modelled, at the deployed parameters (`Security/Proofs/Accounting/RateAudit/DeployedSketchSum.lean`), with AuditRO applied to each pass. Its link to the running code is in review: the verifier as Lean code ([#2429](https://github.com/compute-verification/verity/pull/2429)) and a bridge in progress.
~~~

The same terms over window $t$'s own span give $\gamma_t$, so the bound also holds for every window separately. The failure probability is $W\delta$ for a session of $W$ windows (or $\delta$ read over the horizon), plus $2^{-\mathrm{slack}}$ a pass, plus $s/2^{512}$ a window for guessing a receipt; the sketch receipts add at most $C \cdot 2^{-95.12}$ a session for a prover of $C$ SHA-512 compressions, no more than $2^{-40}$ up to $C = 2^{55.12}$.

| Term | What it is | How the protocol handles it |
| --- | --- | --- |
| $\mu_{\mathrm{timing}}$ | The span the credited receipts don't fill: the gap after each pass, the session's two ends, blocks a plan leaves out, and appended blocks without a verdict. | Bounded, from the record. |
| $\mu_{\mathrm{sample}}$ | Receipts the openings can't rule out as wrong, at $\delta$. | Bounded, from the openings. |
| $\mu_{\mathrm{chip}}$ | What each pass could hold on chip instead of reading it again: $S_{\mathrm{chip}}$ a pass (the host's caches are an estimate). | Bounded, from the measured $S_{\mathrm{chip}}$. |
| $\lambda$ | The bits a prover saves by choosing among its random-oracle queries: $\log_2(q^k/k!)$ a pass of $k$ receipts, at $q = 2^{64}$. | Bounded, proved in Lean (AuditRO, applied per pass). |
| $\mu_{\mathrm{rebuild}}$ | Blocks re-encoded from their payloads instead of read. | Priced from the codec's squarings at the node's stated squaring ceiling. |
| $\mu_{\mathrm{host}}$ | The host tier's own shortfall, and host DRAM bandwidth PCIe can't carry. | Passed through: a model. |
| $\mu_{\mathrm{link}}$ | Relays over a link, under a registration that binds PoUW's tile output (0 otherwise). | Passed through: a model. |
| $\mu_{\mathrm{carrier}}$ | A credited block appended after the codec seed holding another block's encoding (0 unless such blocks are credited). | Read off the property's verdict on the circuits that wrote the blocks. |

### Premises

- **AuditRO** (`Bandwidth.Guarantees.AuditRO`): proved in the random-oracle model, over an abstract device; no Lean function of the code computes it.
- **RateAuditSketch:** the sketch receipts bind, at most $C \cdot 2^{-95.12}$ a session for a prover of $C$ SHA-512 compressions. In Lean it is `Assumptions.SketchRank` at 16 rows and `Assumptions.SketchHashBudget` (each pass's hash queries capped, $2^{55}$ SHA-512 compressions deployed), with the rebuild bound.
- **WorkHardness$(p, k)$:** re-encoding a block instead of reading it costs at least the codec's squarings, 98,016 at `p1024/k3/masked`, against the node's stated ceiling of $1.915 \cdot 10^{11}$ squarings a second.
- **The trusted host** (`trusted-nebius-host`): the challenger and the verifier run on machines the prover doesn't control.
- $\mu_{\mathrm{host}}$ and $\mu_{\mathrm{link}}$ are models, passed through.

### Which R

$\gamma$ is reported twice: against the node's specified read bandwidth, the headline, and against its measured one beside it (Daniel, 13 Oct). Specified, $R$ is $8 \times 1{,}597 + 819.2 = 13{,}595.2$ GB/s: the RTX PRO 6000 Server Edition's datasheet read and 16 channels of DDR5-6400. Measured, it is $8 \times 1{,}539 + 606.8 = 12{,}918.8$ GB/s, each tier's fastest measured read. $R$ is always the verifier's figure: a prover reporting a slower read would only lower its own credit.

## Numbers

At $T = 60$ s, on one node whose store spans every tier (789 GB), the worst window's $\gamma_t$ is 5.82–5.85% at the specified $R$, and 0.885–0.917% at the measured $R$ at round trips of 1–20 ms. These are the schedule's stated figures. Below about 372 GB over every tier (44 GB a GPU), no window length meets 1%, and a store in HBM alone leaves host DRAM's share of $R$ idle.

Runs so far:

- **One GPU, two machines, an 85 GiB store** ([#2005](https://github.com/compute-verification/verity/pull/2005), [#2028](https://github.com/compute-verification/verity/pull/2028)): both honest sessions were accepted, and a prover dropping 1/16 of its blocks was rejected in its first window.
- **The whole node with the host tier, 15 Oct** ([#2089](https://github.com/compute-verification/verity/pull/2089)): a 760.2 GB store (700 GiB of HBM and 8 GiB of host DRAM), seven windows of 60 s. The honest session was accepted (verifier `r20261015-203743-d101`, prover `r20261015-203710-cc89`) at $\gamma$ 14.98% at the specified $R$ and 10.53% at the measured $R$, most of it the timing term: receipt work beyond the read and idle host DRAM. A prover dropping 1/16 of its blocks, 11,599,872 of them and 131,153 in the host tier, was rejected in window 0 at a receipt on a dropped block (verifier `r20261015-203803-e653`, prover `r20261015-203727-96b9`).
- **Serving, 18 Oct:** a real vLLM engine served under the audit on one GPU, in lockstep with the serving run's own steps, on Llama-3.2-1B (`r20261018-053152-fb73`). The honest session was accepted, a prover dropping one block was rejected at that block's receipt, and a lifetime of 1 was accepted with 4,256 re-keys. The 18 Oct GPU runs ran the verifier on the same node, for the test only; the off-node verifier comes with the thin-slice run.

## Status

Daniel's decision 111 restates $\gamma$ in layers, and the page will follow it:

1. The chain's certified reads: a cryptographic bound on the prover system.
2. $R$ and $\mu_{\mathrm{host}}$: per-device upper bounds.
3. The challenger's clock, and placing reads in HBM rather than host DRAM: attribution.
4. $\gamma$: joint accounting.

Where each part stands:

- **Proved:** the guarantee, `RemoteSessionConservationSketchDeployed`, for the session as modelled; and AuditRO.
- **In review:** the verifier as Lean code, held to the Python by difftest ([#2429](https://github.com/compute-verification/verity/pull/2429), in review); deferred residency, where a KV block stays plaintext and uncredited until its coin arrives and is then encoded in place ([#2461](https://github.com/compute-verification/verity/pull/2461), in review).
- **Open:** the declared-circuit statement (G) is stated but not proved.

What it doesn't certify:

- Which GPU made a read. It certifies the node's reads.
- Other work's bandwidth, which is bounded in bus time (MEM-22).
- Live KV memory, today. A block appended after the codec seed is credited only on the property's verdict on the circuits that wrote it.
