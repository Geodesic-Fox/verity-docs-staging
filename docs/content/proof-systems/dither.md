Dither is a proof of useful work for the int8 matrix products a node serves. After the node commits to a product's operands, the challenger draws fresh random bits: a dither that rounds each entry of one operand down or up, and noise on the other. The node computes the noised product, commits to every 32-step partial sum of every dot product, and serves the dithered product $\tilde A B$ exactly, by removing the noise's low-rank part. Each round the verifier checks one random partial sum with a zero-knowledge proof on live coins. An accept bounds from below the multiplications the node performed, on inputs it chose itself.

The work comes from the cross term between the dither on one operand and the noise on the other. It doesn't depend on the operands, so no choice of data removes it: its rank, 64 mod 2, forces 32 multiplications for every committed word, and one multiplication supplies at most 2.

## Protocol

One product $C = AB$, with $A$ an $m \times k$ and $B$ a $k \times n$ int8 matrix, both the prover's, and $\lvert B \rvert \le 63$. The commitment stride is $L = 32$, one int8 tensor-core MMA, and `Commit` is a SHA-512 hm96 tree with 128 × 32 tile leaves. Removing the noise's low-rank part costs $L/k$ of the product.

~~~text
Prover:     com_A, com_B ← Commit(A), Commit(B)
Challenger: after both commitments, draw live bits
              R ← {0,1}^{m×k}                # dither: round A down or up
              U ← {±1, …, ±64}^{n×32}        # noise on B
Prover:     Ã ← A + R
            B̃ ← B + N,  N[t, j] = U[j, t mod 32]          # N has rank 32
            for each output (i, j) and 32-step segment ℓ:
              w[i, j, ℓ] ← Σ_{t < 32(ℓ+1)} Ã[i, t]·B̃[t, j]  # exact s32
              (y, z) ← Duo((y, z), w[i, j, ℓ])              # 3 int ops
              every 128 segments: commit the fold's state
            serve ÃB̃ − (ÃΣ)Uᵀ = ÃB       # Σ: k/32 copies of I_32
Verifier:   after the round, draw a uniform word (i, j, ℓ)
            the prover proves in zero knowledge that the opened tiles
              match com_A and com_B, that w[i, j, ℓ] recomputes from
              them with R and U, and that the fold from the previous
              checkpoint reaches the next committed one
            accept the round iff the proof verifies; a drawn check
              with no proof requested by the window's close fails

Duo((y, z), d):  u ← y ⊕ d ⊕ k;  y ← u·a + z;  z ← rotl(u, r) + y
                 # mod 2^32, with key k, odd a and rotation r
~~~

Serving: every dependent stage of a forward pass commits, then draws, then computes, so each stage has its own live coins, and no operand computed after a draw can cancel that draw's noise. Decode serves clean products and recomputes the noised ones in a deferred pass, after one draw per 4,096 tokens.

## Guarantee

A window has $R$ rounds, each of $S_t$ dependent stages, and a stage computes $n \times n'$ outputs over $B$ segments of $L$. Its nominal work is $N = R\,S_t\,L\,n\,n'\,B$ multiply-accumulates. For every prover that commits each stage's operands before its draw, under the assumptions below, an accepted run is charged at least

$$
\Big(1 - \frac{274 \ln 2}{R}\Big)\,\kappa N \;-\; V_{\max}
$$

except with probability at most $2^{-40} + R\,(\delta_{\mathrm{bind}} + \delta_{\mathrm{ZK}})$, where $\kappa$ is the machine's price for one multiplication and $V_{\max}$ bounds the run's noise reads. One check every 10.6 s for a week, $R \approx 57{,}000$, certifies at least 0.997 of the nominal multiplications.

~~~proof abstract
The bound is `StagedFloorKOneSided` (`Security/Models/Pouw/Guarantees/RelativeSecurity.lean`), proved in Lean on main. Theorem K counts the products: each committed word's cross term has rank $2L$ over $\mathbb{F}_2$, and a product contributes rank at most 2, so a word needs $L$ of them, $c = 1$. Theorem S turns one check a round into the window's floor: a check passes a cell that is short of products with probability at most 0.854, so a deficit costs $e^{-0.146\,D}$, which reaches $2^{-40}$ at $D = 274 \ln 2$. The machine's charge per product turns the count into work.
~~~

### Assumptions

- **Live coins, the hash and the proof system.** A trusted challenger draws the coins after each stage's commitment (`trusted-nebius-host`), SHA-512 is a random oracle, and the [zero-knowledge](/proof-systems/zero-knowledge) proof of each check binds and hides except with probability $\delta_{\mathrm{bind}}$ and $\delta_{\mathrm{ZK}}$ a round (`ServiceSoundStaged`).
- **Duo receipts bind** every word they fold ($\text{H-}\mu^+$), a named exception to the one-hash rule.
- **The covered family $\mathcal{K}$**, Theorem K's one-sided scope (`KScopeOneSided`). The prover's program for each stage is straight-line; every product is a function of the noise's bits times a function of the dither's; and no product is two-sided at two cell-blocks whose words read it (charge purity), so Strassen-style sharing across output blocks or rows is outside it. The verifier can't observe whether a run is inside $\mathcal{K}$. Outside it, Theorem O gives a priced floor on paper only: $c \ge \tfrac14$, or $c \ge 1 - \delta$ given that finding coincidences in data-dependent loads is charged.
- **The machine's prices** (`ChargeVF3j16`): the sm_120 price vector VF3j-16 charges at least $\kappa$ a product, every price at most its measured cost.

## Cost

Measured on an RTX PRO 6000 serving Llama-3.1-8B:

| Measure | Cost |
| --- | --- |
| Matrix product, with duo receipts | 1.47–1.55× plain int8 |
| Prefill, every commitment included | 1.88× plain |
| Decode | +4–17% |
| Perplexity, against bf16 | +0.8–0.9% (Llama-3.1-70B: +1.8%) |
