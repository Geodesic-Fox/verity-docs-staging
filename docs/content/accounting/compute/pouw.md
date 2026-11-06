Proof of useful work (PoUW) bounds from below the work a prover spent on the matrix multiplications it registered. After a salt it couldn't predict, the prover computes every tile of every product under noise derived from the salt and its committed operands, and commits the tiles; the verifier samples tiles in proportion to their work and checks them. The registered products still come out of the tiles for the workload to use, which is what makes the work useful. An accept certifies that the prover spent at least $(1-\gamma)(1-\varepsilon_s)W$ after the salt. This page states the protocol and that bound; what it leaves of a device's capacity is [compute accounting](/accounting/compute)'s.

## Interface

### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Prover | $\mathcal{P}$ | The developer's workers. It commits rows, computes the tiles and answers for the sampled ones. |
| Challenger | $\mathcal{H}$ | The auditor's coin service. Before each epoch it commits to one coin per label, `salt` and `draw`, and opens each once, live. |
| Verifier | $\mathcal{V}$ | The auditor's side. It records each commitment before asking for the next coin, samples the tiles and checks them. |

### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `scheme` | | How a tile is noised, computed and checked, with each tile's reference cost $W_{\mathrm{ref}}$, its assumption, its cap $\rho$ and its $\gamma$ ([Schemes](#schemes)). |
| `workload` | $U$ | The declared matrix multiplications, each an index, a shape $(m, k, n)$ and the weight it reads. Rows run along $k$, and the product is $AB^\top$. |
| `sampling` | $\varepsilon_s, \delta, K$ | The share of the work the audit may leave unchecked, the probability it leaves more, and the number of samples they fix. |
| Cost model | | How the prover's work after the salt is priced ([Assumptions](#assumptions)). |

### Private input

| Input | Description |
| --- | --- |
| `weights`, `activations` | The prover's operands $B$ and $A$. Honest activations are fixed independently of the salt. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | Every sampled tile passed the check. |
| `reject` | Otherwise. |
| `work` | With an accept, the credited work $W$, rounded down to a grid level. |
| `certified` | The work the audit certifies the prover spent after the salt, $(1-\gamma)(1-\varepsilon_s)W$. |

## Protocol

Each line is run by the party beside it, and an arrow sends a value to another party. Click a function to see what it computes. A scheme fixes `noise`, `tile` and `check`; everything else is the same for every scheme.

### Commitment

The challenger commits to the epoch's coins, and the prover commits to its weights, before either knows the salt.

![Commit](/programs/pouw#commit)

#### The coins

The salt and the sample are the challenger's epoch coins, never a public beacon and never Fiat–Shamir over the prover's roots:

~~~text
x_l      = SHA-512("verity/pouw/epoch-coin/v1" || 0x00 || coin_l)
value_l  = the hm96-sha512 leaf of x_l under 192 fresh salt bytes
root     = a frame-v3-sha512 tree over (value_salt, value_draw), bound to ("verity/pouw/epoch-coins/v1", e)
~~~

An unopened coin is statistically hidden, and the commitment binds under SHA-512's collision resistance. Each coin is opened once, after the verifier has recorded what it keys: the salt after the weights' root, the sample after the transcript's root. A second request for an opened coin is refused, so a retry never flips new coins. The coins convince the auditor, who trusts its own challenger, and no third party.

### Salt

![Salt](/programs/pouw#salt)

The salt is 32 bytes derived from the salt coin, the epoch, the coin root and the weights' root, in the domain `verity/pouw/epoch-salt/v1`. The work the bound counts is the work after this point.

### Compute

![Compute](/programs/pouw#compute)

Each matmul's noise is the scheme's own derivation from the salt, the matmul and the prover's roots: Fiat–Shamir inside the scheme, whose grinding the scheme's assumption accounts for. A tile is rows of $A$ times rows of $B$ at full $k$; it yields the values the check reads, their digest (the tile's leaf), and its part of the useful product, which goes to the workload.

The prover then sends the transcript's root to the challenger. It must arrive within a registration deadline of the salt coin's release, on the challenger's clock: a root received later, or before the salt, is refused as late registration, the window earns no credit and the epoch ends. This is the verifier's rule in `Security/Definitions/Pouw/Game/Deadline.lean`, which `WorkBetweenSaltAndDeadline` reads; the deployment's deadline isn't set yet.

### Sample

![Sample](/programs/pouw#sample)

#### The sample

Each of $K$ independent samples picks a tile with probability $W_{\mathrm{ref}}(\text{tile})/W$, keyed by the sampling coin, the transcript's root and the salt in the scheme's sampling domain (`verity/pouw/pearl-c-draw/v1` for Pearl-C). Tiles holding a share $\varepsilon_s$ of the work are all missed with probability at most $(1-\varepsilon_s)^K$, so $K$ is the least integer with $(1-\varepsilon_s)^K \le \delta$. When every tile does the same work, the verifier may instead sample a uniform subset of $K'$ tiles, where $K'$ is the least $K$ with $\big(1 - \varepsilon_s W / (N w_{\max})\big)^{K} \le \delta$.

### Proof and verification

![Prove](/programs/pouw#prove,verify)

A sampled tile passes when its rows open the committed roots, they pass the scheme's rules, and recomputing the tile through the scheme gives its leaf. The sample and the proofs are [sampling](/proof-systems/sampling) with tiles as proof blocks. The protocol's target proves each sampled tile in zero knowledge, bound to the scheme, salt and workload by an identifier the verifier computes itself:

~~~text
identifier  {"format": "verity/pouw/identifier/v1", "scheme": name, "salt": hex(salt),
             "workload": hex(SHA-512(canonical(workload)))}
~~~

Served windows prove sampled tiles with Flock in zero knowledge, on a stand-in proof block that doesn't yet read the tile's committed leaf (TileRead). Until it does, acceptance is checked by a replay that opens rows in the clear, a development shortcut.

## Security

### Assumptions

- **Tight noised transcript (TT) at $\gamma_0$.** A prover that spends $T$ after the salt gets the checked values right on tiles holding at most $T/(1-\gamma_0)$ of the matrix-multiplication work, except with probability $\eta(q, N)$. Each scheme names its own instance; Pearl-C's is TT_OUT rev1 at $\gamma_0 = 1/400$, a named conjecture.
- **The cost model.** A tensor-core instruction costs its whole fragment's multiply-accumulates, and any other instruction its class's price at the cheapest bit-exact implementation. Priced per word instead, TT would be a different assumption, and known sets of skipped words falsify that one.
- **Counted queries.** The scheme's hashes are reached only through at most $q \le 2^{64}$ counted queries: the [random oracle](/assumptions/random-oracle).
- **Fresh coins.** The challenger's coins are uniform and unknown to the prover until it has committed what each one keys.
- **Binding commitments.** The row, transcript and coin commitments bind: [CR · SHA-512](/assumptions/cr/sha-512).

### Completeness

An honest prover on served activations is rejected only when a sampled tile fails the scheme's cap: with probability at most $K\varepsilon_{\mathrm{cap}}$, where $\varepsilon_{\mathrm{cap}}$ bounds the rate at which an honest tile fails it (`CompleteSampled`, proved at Llama-3.1-8B and Qwen3-8B from the empirical assumption `HonestTileCapRate`). The measurement that fixes $\varepsilon_{\mathrm{cap}}$ isn't recorded yet.

### Work bound

Take any workload in the scheme's domain and any prover whose preprocessing is unbounded but never reads the salt, that spends $T$ after the salt, priced by the cost model, with at most $q$ queries. Then

$$
\Pr\big[\mathsf{accept} \,\wedge\, T < (1-\gamma)(1-\varepsilon_s)\,W\big] \;\le\; (1-\varepsilon_s)^K + \eta(q, N), \qquad \gamma = 1 - \frac{1-\gamma_0}{\Omega^*}
$$

$W$ is the registered work, $\gamma_0$ the share the assumption lets a prover save, and $\Omega^*$ bounds each proof block's $W_{\mathrm{ref}}$ as a multiple of the work the assumption credits (`Pouw.Guarantees.EndToEnd`).

~~~proof
Sampling bounds the work in tiles whose checked values are wrong: on an accept, they hold less than $\varepsilon_s W$ except with probability $(1-\varepsilon_s)^K$. TT turns the rest into work: tiles holding at least $(1-\varepsilon_s)W$ correct can't be had for less than $(1-\gamma_0)/\Omega^*$ of it after the salt, except with probability $\eta(q, N)$. A union bound gives the sum.
~~~

For Pearl-C the bound is per credited cell: $T < (1-\gamma)(W_{\mathrm{claimed}} - \varepsilon_s W)$, with $W_{\mathrm{claimed}}$ the reference cost of the rows the transcript credits and $\eta(q, N) = (q + N)/2^{128}$ (`GγSampled`). At $K = 27{,}713$ and $\varepsilon_s = 0.1\%$, the sampling term is $2^{-40}$.

The game takes the sampled tiles' checks as ideal. With tiles proved in zero knowledge, the proof system's knowledge-soundness and binding errors add to the bound; that composition is stated for Flock at $8192^3$ and awaits the proof that a tile's proof reads its committed rows.

## Schemes

A scheme is named and versioned. It fixes the tiling, the noise, the checked values and their digest, each tile's reference cost, and the assumption with its $\gamma_0$ and $\Omega^*$. Hardware uses the ids of Accelerators. Each $\gamma$ is proved from its scheme's assumption.

| Scheme | Hardware | Assumption | $\gamma$ |
| --- | --- | --- | --- |
| `pearl-c-sm120-v1-h3` (served default) | `rtx-pro-6000-server/e4m3` | TT_OUT rev1 at $\gamma_0 = 1/400$, cap $\rho = 1/1{,}000$ | 0.36949% at $8192^3$; Llama-3.1-8B served, 0.38912% |
| `pearl-c-h100-v1` | `h100-sxm5-80gb/e4m3` | TT on Pearl-C's checked outputs, cap 1/400 | 0.53751% at $8192^3$, 0.51862% at $16384^3$ |
| `pearl-c-nvfp4-v0` (Pearl-C4) | `rtx-pro-6000-server/e2m1` | TT for NVFP4 on sm_120, cap 1/400 | 0.71732% at $8192^3$, 0.61102% at $16384^3$ |
| `ncp-v1`, `ncp-v2` | RTX 4090 | TT for noise-cancelling polarization at $\gamma_0 = 0.5\%$ | 0.995% on shapes with $n \ge 1{,}600$ |
| `pearl-fp8-v4` | H100, B200, RTX 4090 | Pearl's own hardness conjecture | None: the conjecture names no $\gamma_0$ |

Pearl-C takes Pearl's FP8 product and adds its noisy clean-up, checked bit for bit, so that the useful output is itself a checked value. A sampled tile is rejected when its replayed debit exceeds $\rho$ times its credited cells' credit, and an accepted tile earns $1-\rho$ of it. On `pearl-c-sm120-v1-h3` the served Llama-3.1-8B linears have these $\gamma$; a mixed layout takes the largest, since a prover picks which proof blocks it is right on:

| Linear | Shape $(n, k)$ | $\gamma$ |
| --- | --- | --- |
| qkv | $6144, 4096$ | 0.37565% |
| o | $4096, 4096$ | 0.38839% |
| gate_up | $28672, 4096$ | 0.35535% |
| down | $4096, 14336$ | 0.38912% |
| $16384^3$, for reference | | 0.35973% |

## Public outputs

PoUW makes public the verdict, the work level, the check (the tile template, its work and the commitment scheme), the sampling parameters, the sample, the weights' salted root and the weights' size. The work is one grid level: the positive integers with at most 4 significant bits, so consecutive levels differ by at most $9/8$, and a declared range of $q$ levels carries at most $\log_2 q$ bits. Rounding down leaves at most a ninth of an honest prover's tiles uncredited.

## Parameters

| $\varepsilon_s$, $\delta$ | Work-weighted $K$ | Uniform $K'$, at most |
| --- | --- | --- |
| 0.1%, $2^{-40}$ | 27,713 | 31,178 |
| 1%, $2^{-128}$ | 8,828 | 9,937 |

The number of samples is fixed by $\varepsilon_s$ and $\delta$, not by the workload's size, so proving's share of an audit's cost falls as the workload grows.

## Dither

Dither is a proof of useful work for the int8 matrix products a node serves. After the node commits to a product's operands, the challenger flips fresh coins: a dither that rounds each entry of one operand down or up, and noise on the other. The node computes the noised product, commits to every 32-step partial sum of every dot product, and serves the dithered product $\tilde A B$ exactly, by removing the noise's low-rank part. Each round the verifier checks one random partial sum with a zero-knowledge proof on live coins. An accept bounds from below the multiplications the node performed, on inputs it chose itself.

The work comes from the cross term between the dither on one operand and the noise on the other. It doesn't depend on the operands, so no choice of data removes it: its rank, 64 mod 2, forces 32 multiplications for every committed word, and one multiplication supplies at most 2.

### Protocol

One product $C = AB$, with $A$ an $m \times k$ and $B$ a $k \times n$ int8 matrix, both the prover's, and $\lvert B \rvert \le 63$. The commitment stride is $L = 32$, one int8 tensor-core MMA, and `Commit` is a SHA-512 hm96 tree with 128 × 32 tile leaves. Removing the noise's low-rank part costs $L/k$ of the product.

~~~text
Prover:     com_A, com_B ← Commit(A), Commit(B)
Challenger: after both commitments, flip live coins
              R ← {0,1}^{m×k}                # dither: round A down or up
              U ← {±1, …, ±64}^{n×32}        # noise on B
Prover:     Ã ← A + R
            B̃ ← B + N,  N[t, j] = U[j, t mod 32]          # N has rank 32
            for each output (i, j) and 32-step segment ℓ:
              w[i, j, ℓ] ← Σ_{t < 32(ℓ+1)} Ã[i, t]·B̃[t, j]  # exact s32
              (y, z) ← Duo((y, z), w[i, j, ℓ])              # 3 int ops
              every 128 segments: commit the fold's state
            serve ÃB̃ − (ÃΣ)Uᵀ = ÃB       # Σ: k/32 copies of I_32
Verifier:   after the round, sample a uniform word (i, j, ℓ)
            the prover proves in zero knowledge that the opened tiles
              match com_A and com_B, that w[i, j, ℓ] recomputes from
              them with R and U, and that the fold from the previous
              checkpoint reaches the next committed one
            accept the round iff the proof verifies; a sampled check
              with no proof requested by the window's close fails

Duo((y, z), d):  u ← y ⊕ d ⊕ k;  y ← u·a + z;  z ← rotl(u, r) + y
                 # mod 2^32, with key k, odd a and rotation r
~~~

Serving: every dependent stage of a forward pass commits, then flips its coins, then computes, so each stage has its own live coins, and no operand computed after a stage's coins can cancel their noise. Decode serves clean products and recomputes the noised ones in a deferred pass, after one set of coins per 4,096 tokens.

### Guarantee

A window has $R$ rounds, each of $S_t$ dependent stages, and a stage computes $n \times n'$ outputs over $B$ segments of $L$. Its nominal work is $N = R\,S_t\,L\,n\,n'\,B$ multiply-accumulates. For every prover that commits each stage's operands before its coins are flipped, under the assumptions below, an accepted run is charged at least

$$
\Big(1 - \frac{274 \ln 2}{R}\Big)\,\kappa N \;-\; V_{\max}
$$

except with probability at most $2^{-40} + R\,(\delta_{\mathrm{bind}} + \delta_{\mathrm{ZK}})$, where $\kappa$ is the machine's price for one multiplication and $V_{\max}$ bounds the run's noise reads. One check every 10.6 s for a week, $R \approx 57{,}000$, certifies at least 0.997 of the nominal multiplications.

~~~proof abstract
The bound is `StagedFloorKOneSided` (`Security/Models/Pouw/Guarantees/RelativeSecurity.lean`), proved in Lean on main. Theorem K counts the products: each committed word's cross term has rank $2L$ over $\mathbb{F}_2$, and a product contributes rank at most 2, so a word needs $L$ of them, $c = 1$. Theorem S turns one check a round into the window's floor: a check passes a cell that is short of products with probability at most 0.854, so a deficit costs $e^{-0.146\,D}$, which reaches $2^{-40}$ at $D = 274 \ln 2$. The machine's charge per product turns the count into work.
~~~

#### Assumptions

- **Live coins, the hash and the proof system.** A trusted challenger flips the coins after each stage's commitment (`trusted-nebius-host`), SHA-512 is a random oracle, and the [zero-knowledge](/proof-systems/recursion) proof of each check binds and hides except with probability $\delta_{\mathrm{bind}}$ and $\delta_{\mathrm{ZK}}$ a round (`ServiceSoundStaged`).
- **Duo receipts bind** every word they fold ($\text{H-}\mu^+$), a named exception to the one-hash rule.
- **The covered family $\mathcal{K}$**, Theorem K's one-sided scope (`KScopeOneSided`). The prover's program for each stage is straight-line; every product is a function of the noise's bits times a function of the dither's; and no product is two-sided at two cell-blocks whose words read it (charge purity), so Strassen-style sharing across output blocks or rows is outside it. The verifier can't observe whether a run is inside $\mathcal{K}$. Outside it, Theorem O gives a priced floor on paper only: $c \ge \tfrac14$, or $c \ge 1 - \delta$ given that finding coincidences in data-dependent loads is charged.
- **The machine's prices** (`ChargeVF3j16`): the sm_120 price vector VF3j-16 charges at least $\kappa$ a product, every price at most its measured cost.

### Cost

Measured on an RTX PRO 6000 serving Llama-3.1-8B:

| Measure | Cost |
| --- | --- |
| Matrix product, with duo receipts | 1.47–1.55× plain int8 |
| Prefill, every commitment included | 1.88× plain |
| Decode | +4–17% |
| Perplexity, against bf16 | +0.8–0.9% (Llama-3.1-70B: +1.8%) |
