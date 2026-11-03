Every construction is benchmarked on the same statements, so their costs compare directly. Beside [C-Flock](/docs/proof-systems/c-flock), the tables hold A-GKR, B-Ligero and D-SP1, constructions that are no longer developed and have no page of their own. Each benchmark proves one statement over an input set, and the tables are the evidence store's latest render.

## What is measured

A benchmark's circuit is a [subcircuit](/docs/accounting/circuits#subcircuit-templates), a subcircuit template with every parameter bound, proved over an [input set](/docs/workloads/inference#subcircuit-templates): a batch of inputs with their provenance, captured from a model or synthetic, each with the chip's output recorded alongside. For the GEMM coordinate, serving commits the activation rows $x$, the weight columns $W$ and the outputs $y$, and the proof shows $y = S(x, W)$, where $S$ is the subcircuit's exact semantics, down to the tensor core's rounding. A statement's id joins its subcircuit and its commitment scheme with `+`:

~~~text
<subcircuit>+<scheme>
gemm-coordinate/k1536/sm90-mma-bf16+frame-v3/sha-512
~~~

A proof of less than the full committed relation proves a weaker statement, and is reported under it, never in the full statement's cell:

| Weaker statement | What it gives up |
| --- | --- |
| Operands public, with no commitment | The verifier could recompute $y$ itself. |
| Operands private and bound to nothing | The proof says nothing about the values serving committed. |
| Operands published for the verifier to re-hash | The verifier could recompute $y$ itself. |

## Security

![Security](/tables/table-1)

Each column holds one property: soundness, [statistical](/assumptions/sound-statistical) or [computational](/assumptions/sound-computational), with its bound; zero knowledge, [malicious-verifier](/assumptions/zk-malicious), [honest-verifier](/assumptions/zk-honest-verifier) or [none](/assumptions/no-zk); interaction, [interactive](/assumptions/interactive) or [non-interactive](/assumptions/non-interactive); and setup, [transparent](/assumptions/transparent-setup). Every property, assumption and model has a stable id that is never renamed once cited, and an assumption about a primitive is `<property>/<instance>`, such as `cr/sha-512`.

## Overhead

![Table 2](/tables/table-2)

A result's overhead is its end-to-end time per input, commitment included, in units of the [native time](/docs/hardware/accelerators#native-cost) per input:

$$
\text{overhead} = \frac{N \times \left( t_{\mathrm{commit}} + t \right)}{\text{inputs}} = \frac{N}{P}
$$

Here $N$ is the native throughput, the compute-bound datasheet estimate of inputs per second on the busiest execution unit, $t_{\mathrm{commit}}$ the time to commit the batch's values, $t$ the proof's time below, and $P$ the number of inputs proved per second end to end.

## Interaction

A proof's time charges its interaction by one cost model, compute plus rounds times the round-trip time plus bytes over bandwidth:

$$
t = t_{\mathrm{prover}} + t_{\mathrm{verifier}} + \mathrm{rounds} \times \mathrm{RTT} + \frac{8\,(b_{\mathrm{up}} + b_{\mathrm{down}})}{\mathrm{bandwidth}}
$$

$t_{\mathrm{verifier}}$ is the verifier compute the prover waits on, $b_{\mathrm{up}}$ and $b_{\mathrm{down}}$ the bytes from the prover and back to it, and the factor of 8 turns bytes into bits. A round is one round trip that the prover must wait for, and the count charged is the protocol's *sequential depth*: coins that don't depend on each other travel in one message and count once. C-Flock's rounds run between the prover and the challenger, which draws the coins. Its verifier runs offline on the challenger's record and adds none.

A *live* result ran against a live challenger, and its rounds, bytes and round-trip time are measured; its measured wall time must fall within ±10% of the formula at the run's measured network. A *file-verified* result is checked from its files, and its interaction is derived from the protocol. Either way the published figure is the formula at the reference network, `dc-1ms-100gbps`, with the prover and the verifier in one datacenter. Three sensitivity profiles each change the round-trip time or the bandwidth alone, and [Networks](/docs/hardware/networks) lists them.

![Table 3](/tables/table-3)

Table 3 splits each overhead into stages. The interaction stage is rounds times the reference round-trip time, plus bytes over the reference bandwidth, plus the verifier compute the prover waits on, all times $N$.

## Soundness bounds

A result's soundness bound is a union bound: over the error terms of one proof, each belonging to one component (batching, sumcheck, encoding and opening, or the commitment's hash), then over the $m$ proofs behind a result whose batch is split into sub-batches:

$$
\varepsilon_{\mathrm{result}} \;\le\; \sum_{i=1}^{m} \varepsilon_{\mathrm{proof},i} \qquad\text{and, for } m \text{ equal proofs,}\qquad \log_2 \varepsilon_{\mathrm{result}} = \log_2 \varepsilon_{\mathrm{proof}} + \log_2 m
$$

Zero-knowledge and completeness terms are recorded separately and never count toward soundness. A result with more than one sub-batch states its whole bound, never only the per-proof one, and a verifier that checks a batch recomputes each proof's bound from that proof's own parameters and accepts only if the sum stays within its budget. The tables keep a result only if its whole bound is at most $2^{-128}$: a filter on the view, not a validity rule.

## Recursion

[Zero knowledge](/docs/proof-systems/zero-knowledge) with C-Flock as both its inner protocol and its outer argument was measured on the prototype on Oct 6, 2026: one RTX PRO 6000 on a shared node, proving a [GEMM coordinate](/docs/accounting/circuits#subcircuit-templates) statement at $m = 35$ and $K = 4096$. The comparison is C-Flock's [zero-knowledge mode](/docs/proof-systems/c-flock#zero-knowledge-mode) run directly on the same statement. Each time is a median of three sessions.

| | Recursion | Zero-knowledge mode, direct |
| --- | --- | --- |
| Prove | 8.6 s: 0.9 s inner, 7.75 s outer | 5.1 s |
| Proof size | 19.7 MB | 2.4 MB |
| Verify, Rust | 13 to 22 s | 7 s |
| Verify, Lean | 440 to 480 s | 54 to 73 s |

Recursion's cost is a fixed price per inner session. The outer statements depend only on $m$, so from $K = 2048$ to $K = 16384$ the outer proof took 6.9 to 7.9 s and its Lean verification 436 to 478 s, while the direct mode's Lean verification grew from 34 s to 173 s. Over that range recursion proved in 1.7 to 2.0 times the direct time.

The [ZK server](/docs/proof-systems/zero-knowledge#deployment)'s checks come on top. The prototype ZK server recomputes the outer proof's commitments and openings, and folds the linear check's random combination itself, since a fold the workers computed would choose the rows it proves. Its checks take about 176 CPU seconds a session. With the ZK server and the prover sharing 16 cores, the checked outer proof took 46.8 s against 7.4 s unchecked.
