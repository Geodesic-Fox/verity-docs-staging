An accelerator is one GPU, the RTX PRO 6000 Blackwell in the deployed numbers. Its peak rate bounds the work that [proof of useful work](/accounting/pouw) leaves uncertified, and its device memory the state that [proof of useful space](/accounting/pous) does. Its memory bandwidth and on-chip storage are a share of the node's, which [proof of useful bandwidth](/accounting/poub) bounds on [servers](/accounting/physical/servers#bandwidth-headroom).

## Compute headroom

Proof of useful work secures a lower bound: after a salt it couldn't predict, the prover spent at least $W_{\mathrm{cert}} = (1-\gamma)(1-\varepsilon_s)W$ on the registered matrix multiplications. Between the salt's release $t_s$ and the deadline $t_d$, hardware of peak rate $F$ can spend at most $F(t_d - t_s)$. On an accepted audit, the work it can have spent on anything unregistered is at most

$$
\underbrace{F\,(t_d - t_s)}_{\text{capacity, physical}} \;-\; \underbrace{(1-\gamma)(1-\varepsilon_s)\,W}_{\text{certified, cryptographic}}
$$

except with PoUW's error, $(1-\varepsilon_s)^K + \eta(q, N)$ (`Pouw.Guarantees.SpareCapacityAtDeadline`, and `PearlCSm120Rev1Cap1000ByDeadline_*` per cell for Pearl-C on sm_120). The headroom splits in two:

- **Honest overhead**, $F(t_d - t_s) - W$: what the registered work leaves unused even when run honestly, from the scheme's noise and hashing and from running below peak.
- **Soundness slack**, $W - W_{\mathrm{cert}} = (1 - (1-\gamma)(1-\varepsilon_s))W$: what the bound concedes to a cheating prover, at most $\gamma + \varepsilon_s$ of the work.

Shrinking the first is engineering, faster kernels; shrinking the second is cryptography, a smaller $\gamma$ or $\varepsilon_s$.

## Compute assumptions

The work bound is stated in the cost model's units. These connect it to a device:

| Assumption | What it asks | Kind |
| --- | --- | --- |
| Peak rate $F$ | The registered device can't price more than $F$ per second of the cost model's work. | Declared from the datasheet: 1,000 TFLOPS dense FP8 on the RTX PRO 6000, $5 \times 10^{14}$ MAC/s. Not measured. |
| The cost model fits the silicon | A tensor-core instruction costs its fragment's multiply-accumulates, and other instructions their measured class prices at the cheapest bit-exact implementation. | Assumed, with measured prices (FP32 add 8.376 in the loop, 8.00 issue-bound). Lean can't check it. |
| Honest clock | Nothing computed after $t_d$ can be stamped as received by $t_d$. | Assumed (`HonestClock`). |
| One account per operation | No operation the device runs is charged to two accounts, so compute certified to PoUW isn't also spent elsewhere. | Assumed in the device model (`Step.Fits`) of [#1807](https://github.com/danielreuter/verity/pull/1807). |
| The run realizes the game | PoUW's run on the device is a prover of the work game, with its cost and oracle calls inside the compute account. | Assumed (`RealizesPouw`, #1807). |

## Compute numbers

| Quantity | Value, `pearl-c-sm120-v1-h3` on the RTX PRO 6000 |
| --- | --- |
| $\gamma$ | 0.36949% at $8192^3$; 0.38912% for Llama-3.1-8B served |
| $\varepsilon_s$, $\delta$, $K$ | 0.1%, $2^{-40}$, 27,713 samples |
| Soundness slack | about 0.47% of $W$ |
| Pearl-C chain against native FP8 | 3.0–18.4× slower, 1.27–6.4× without hashing; hashing costs about 0.5 ms a call |
| Uncertified at $8192^3$ | 75.8–89.3% of native compute, of which 0.05–0.12% is soundness slack and the rest honest overhead |
| Served decode, Llama-3.1-8B at batch 32 | about 10× graphed FP8, in the served SHA-512 format |

The harness numbers are from [#1813](https://github.com/danielreuter/verity/pull/1813), on one leased GPU against torch's default cuBLAS, with the native chain's achieved rate standing in for $F$. Its certified-work column at Llama shapes waits on [#1809](https://github.com/danielreuter/verity/pull/1809), the harness's lookup of the pinned $\gamma$ by shape.

## Memory headroom

Proof of useful space secures a lower bound: a server that keeps at most $S_{\mathrm{cert}} = \lfloor \tfrac{18}{19}\lvert C\rvert \rfloor$ bits throughout setup and the session fails, where $C$ is an encoding of the weights it serves from. A device with $M$ bytes of memory that passes the audit has at most

$$
\underbrace{M}_{\text{capacity, physical}} \;-\; \underbrace{\lfloor \rho \lvert C\rvert \rfloor}_{\text{certified, cryptographic}}
$$

left for anything else at some point of the session, except with probability $\delta + \varepsilon$. Between audits the bound says nothing, until a time-averaged audit for P2 lands. The headroom splits in two:

- **Uncommitted memory**, $M - \lvert C\rvert$: what the store doesn't cover. Today the store is fixed at $2^{19}$ blocks, 1.078 GB, so on a 102 GB card nearly all of it is here. A larger store would close it, at the cost of setup: more roots to compute.
- **Soundness slack**, $(1 - \rho)\lvert C\rvert$: what the bound concedes, $1/19$ of the store.

## Memory numbers

| Quantity | Value |
| --- | --- |
| Device, RTX PRO 6000 Blackwell | about 102 GB |
| Certified, $S_{\mathrm{cert}}$ | about 1.021 GB of a 1.078 GB store |
| Headroom | about 101 GB |
| Decode on the GPU | about 50–70 GB/s, against about 1.5 TB/s device-memory reads ([#1804](https://github.com/danielreuter/verity/pull/1804)) |

P2 can't decode at device-memory rate, about 30× short, and a narrower block that would decode faster puts a root inside the deadline. So serving the weights from $C$ costs far more than serving plaintext. A store that fills the card is a separate question, of setup cost, which is being sized now.

## Bandwidth and on-chip storage

Proof of useful bandwidth's capacities are the node's, the sum over its devices, so a GPU's enter as its share of [the node's](/accounting/physical/servers#the-nodes-capacities):

| Quantity | One RTX PRO 6000 |
| --- | --- |
| Read bandwidth | 1,539 GB/s measured, an honest session's; 1.597 TB/s specified |
| On-chip storage | 263,163,904 bytes |
| Squarings at 1,024 bits | 1.67 × `kv.cu`'s $1.499 \times 10^{10}$ a second |

The read bandwidth is the rate of plain, incompressible reads, which the store's encoded blocks are. The GPU's compression engine reads a compressible buffer faster, 7.55 TB/s against 1.536 TB/s plain, but the encoded store reads at 1.515 TB/s under a compressible allocation: the hardware compresses 128-byte units, one codec word, and no encoded word is constant.
