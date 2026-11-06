Compute accounting bounds how much of a device's compute could have gone to undeclared work. It has two layers. The cryptographic one, [proof of useful work](/accounting/compute/useful), secures a lower bound: after a salt it couldn't predict, the prover spent at least $W_{\mathrm{cert}} = (1-\gamma)(1-\varepsilon_s)W$ on the declared matrix multiplications. The physical one, this page, takes an upper bound on what the hardware can compute in the audit's window, and the headroom is the difference. Compute accounting is used by the [remote](/protocols/remote) and [onsite](/protocols/onsite) protocols.

## Headroom

Between the salt's release $t_s$ and the deadline $t_d$, hardware of peak rate $F$ can spend at most $F(t_d - t_s)$. On an accepted audit, the work it can have spent on anything undeclared is at most

$$
\underbrace{F\,(t_d - t_s)}_{\text{capacity, physical}} \;-\; \underbrace{(1-\gamma)(1-\varepsilon_s)\,W}_{\text{certified, cryptographic}}
$$

except with PoUW's error, $(1-\varepsilon_s)^K + \eta(q, N)$ (`Pouw.Guarantees.SpareCapacityAtDeadline`, and `PearlCSm120Rev1Cap1000ByDeadline_*` per cell for Pearl-C on sm_120). The headroom splits in two:

- **Honest overhead**, $F(t_d - t_s) - W$: what the registered work leaves unused even when run honestly, from the scheme's noise and hashing and from running below peak.
- **Soundness slack**, $W - W_{\mathrm{cert}} = (1 - (1-\gamma)(1-\varepsilon_s))W$: what the bound concedes to a cheating prover, at most $\gamma + \varepsilon_s$ of the work.

Shrinking the first is engineering, faster kernels; shrinking the second is cryptography, a smaller $\gamma$ or $\varepsilon_s$.

## Physical assumptions

The work bound is stated in the cost model's units. These connect it to a device:

| Assumption | What it asks | Kind |
| --- | --- | --- |
| Peak rate $F$ | The declared device can't price more than $F$ per second of the cost model's work. | Declared from the datasheet: 1,000 TFLOPS dense FP8 on the RTX PRO 6000, $5 \times 10^{14}$ MAC/s. Not measured. |
| The cost model fits the silicon | A tensor-core instruction costs its fragment's multiply-accumulates, and other instructions their measured class prices at the cheapest bit-exact implementation. | Assumed, with measured prices (FP32 add 8.376 in the loop, 8.00 issue-bound). Lean can't check it. |
| Honest clock | Nothing computed after $t_d$ can be stamped as received by $t_d$. | Assumed (`HonestClock`). |
| One account per operation | No operation the device runs is charged to two accounts, so compute certified to PoUW isn't also spent elsewhere. | Assumed in the device model (`Step.Fits`) of [#1807](https://github.com/danielreuter/verity/pull/1807). |
| The run realizes the game | PoUW's run on the device is a prover of the work game, with its cost and oracle calls inside the compute account. | Assumed (`RealizesPouw`, #1807). |

## Numbers

| Quantity | Value, `pearl-c-sm120-v1-h3` on the RTX PRO 6000 |
| --- | --- |
| $\gamma$ | 0.36949% at $8192^3$; 0.38912% for Llama-3.1-8B served |
| $\varepsilon_s$, $\delta$, $K$ | 0.1%, $2^{-40}$, 27,713 samples |
| Soundness slack | about 0.47% of $W$ |
| Pearl-C chain against native FP8 | 3.0–18.4× slower, 1.27–6.4× without hashing; hashing costs about 0.5 ms a call |
| Uncertified at $8192^3$ | 75.8–89.3% of native compute, of which 0.05–0.12% is soundness slack and the rest honest overhead |
| Served decode, Llama-3.1-8B at batch 32 | about 10× graphed FP8, in the served SHA-512 format |

The harness numbers are from [#1813](https://github.com/danielreuter/verity/pull/1813), on one leased GPU against torch's default cuBLAS, with the native chain's achieved rate standing in for $F$. Its certified-work column at Llama shapes waits on [#1809](https://github.com/danielreuter/verity/pull/1809), the harness's lookup of the pinned $\gamma$ by shape.

## Status

- **Proved:** the work bound and its Pearl-C per-cell form at $8192^3$, $16384^3$ and the Llama-3.1-8B linears; the deadline form at sm_120; completeness from the honest cap rate.
- **Conjectured:** TT_OUT rev1, Pearl-C's assumption, in two forms: per unit, and per audit tile, which the per-cell and deadline forms use.
- **In review:** the device model and the covert residual over it, in [#1807](https://github.com/danielreuter/verity/pull/1807), a worst case over each audit's coins; a per-run form is being proved.
- **Open:** measuring $F$ and $\varepsilon_{\mathrm{cap}}$; binding the sampled tiles' zero-knowledge proofs to their committed leaves: they are proved on a stand-in proof block that doesn't yet read the tile's leaf (TileRead), and until it does, acceptance is checked by a replay that opens rows in the clear, a development shortcut; matching Lean's whole-tile sampling weights to the audit's credited cells; the forming debit, a stub that returns 0.
