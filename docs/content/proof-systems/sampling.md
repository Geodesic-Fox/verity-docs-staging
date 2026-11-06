Sampling lets a verifier check a large computation by proving only a random sample of its parts. The prover commits to what it computed, the verifier samples proof blocks, and the prover proves that each sampled proof block was computed correctly on the committed trace. An accept then bounds how many proof blocks can be incorrect, sampled or not. This page states the protocol over any commit-and-prove argument, and asks of it only the [properties below](#assumptions). Hiding what the prover computed is a separate compiler, [recursion](/proof-systems/recursion), and [compute](/accounting/compute) and [network](/accounting/network) accounting read sampling's guarantee.

## Interface

### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Prover | $\mathcal{P}$ | Would like to run a computation. |
| Verifier | $\mathcal{V}$ | Would like to check the integrity of the prover's computation. |

### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `circuit` | $C$ | A circuit representing the prover's computation. |
| `partition` | $U$ | A partition of `circuit` into proof blocks: the population the verifier samples. |
| `design` | $\mathcal{D}$ | A sampling design: a probability distribution over subsets of $U$, from which the verifier samples. |

### Private input

| Input | Symbol | Description |
| --- | --- | --- |
| `inputs` | $x$ | The prover's values for the input gates of `circuit`. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | The proof that no sampled proof block is incorrect verified. |
| `reject` | Otherwise. |

## Protocol

Each line is run by the party beside it, and an arrow sends a value to the other party. Click a function to see what it computes.

### Commitment phase

The prover runs the circuit and commits to what it computed, before it knows which proof blocks will be sampled. Committing first is what turns the sample into a test: whatever the prover does afterwards, each sampled proof block is checked against values that were fixed in advance.

What the prover computes is a trace $\tau$, and the honest trace is `evaluate(circuit, inputs)`. The prover commits only the trace's values at the boundary gates $\partial U$, which are everything a proof block's check reads, every input gate included.

![Commitment phase](/programs/sampled-proofs#commit)

### Challenge phase

Once `com` has arrived, the verifier samples $S \subseteq U$ from the sampling design, using randomness the prover hasn't seen.

![Challenge phase](/programs/sampled-proofs#sample)

### Verification phase

The prover proves that no sampled proof block is incorrect in the committed trace, its outputs some other function of its inputs than its gates compute, and the verifier checks the proof. Both parties build the statement from their own copies, so the prover can't choose what is proved, and the verifier sends fresh coins in each round of the proof.

![Verification phase](/programs/sampled-proofs#prove,verify)

## Security

### Assumptions

The protocol calls three methods of a commit-and-prove argument: `commit(trace, gates)` returns `com`, and then `prove` and `verify` run a proof of a statement about `com`'s values, on the verifier's live coins. It assumes the following of them and of the verifier's randomness. The *extracted values* are what the argument's extractor recovers from a run that `verify` accepts.

- **Completeness.** `verify` accepts `prove` on a true statement.
- **Knowledge soundness**, with error $\varepsilon_{\mathrm{ks}}$. For any rule that picks one sampled proof block before the first coin, averaged over the sample, `verify` accepts while the picked proof block is incorrect in the extracted values with probability at most $\varepsilon_{\mathrm{ks}}$.
- **Binding**, with error $\varepsilon_{\mathrm{bind}}$. There is a *committed trace* $\tau^\star$, fixed by the prover's strategy once it sends `com` and not by the sample, such that for any such rule, averaged over the sample, `verify` accepts while the extracted values differ from $\tau^\star$ on the picked proof block's boundary gates with probability at most $\varepsilon_{\mathrm{bind}}$.
- **Fresh randomness.** `random` is uniform, and the prover doesn't see it until it's sent.

With a perfect argument both error terms are 0, and only the sampling design's error remains. Nothing here limits what the verifier learns: integrity holds whether or not the argument is zero knowledge.

### Completeness

For every $x$, the honest prover is accepted:

$$
\Pr\big[\mathcal{P}(x) \leftrightarrow \mathcal{V} \text{ outputs } \mathsf{accept}\big] \;=\; 1
$$

The honest prover's trace is the evaluation. Whether a real prover's computation reproduces it, on nondeterministic hardware for instance, is out of scope.

~~~proof pending
No proof block is incorrect in the honest trace, so the statement is true, and `verify` accepts `prove` by the argument's completeness.
~~~

### Integrity

Let $B^\star \subseteq U$ be the set of proof blocks incorrect in the committed trace $\tau^\star$. It is fixed before the sample is taken, since $\tau^\star$ is. The probability that the sample misses a set $B$,

$$
P_a(B) \;=\; \Pr_{S \sim \mathcal{D}}\big[S \cap B = \varnothing\big]
$$

is its *acceptance probability*, and as a function of $B$ it is the sampling design's operating characteristic. For every prover $\mathcal{P}^*$ and every family $\mathcal{B}$ of candidate sets:

$$
\Pr\big[\mathsf{accept} \,\wedge\, B^\star \in \mathcal{B}\big] \;\le\; \max_{B \in \mathcal{B}} P_a(B) + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}
$$

The bound takes a family rather than one set because $\mathcal{P}^*$ may randomize which proof blocks it makes incorrect.

~~~proof abstract
$\tau^\star$ is a function of the prover's strategy after it sends `com`, so $B^\star$ is fixed before $S$, and $S$ is sampled from $\mathcal{D}$ independently of it. Before the run's first coin, pick the first sampled proof block that is incorrect in $\tau^\star$, if there is one. If $S$ misses $B^\star$, the run may accept, and given $B^\star = B$ that has probability $P_a(B)$. If $S$ hits $B^\star$ and `verify` accepts, then for the picked proof block $u$ either the extracted values disagree with $\tau^\star$ on $u$'s boundary gates, with probability at most $\varepsilon_{\mathrm{bind}}$, or they agree, so $u$ is incorrect in them and the run accepted anyway, with probability at most $\varepsilon_{\mathrm{ks}}$. So

$$
\begin{aligned}
\Pr\big[\mathsf{accept} \,\wedge\, B^\star \in \mathcal{B}\big] \;&\le\; \sum_{B \in \mathcal{B}} \Pr\big[B^\star = B\big]\, P_a(B) + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}} \\
&\le\; \max_{B \in \mathcal{B}} P_a(B) + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}
\end{aligned}
$$
~~~

The *confidence set* for error $\delta$ keeps the sets that the sample misses with probability more than $\delta$:

$$
\mathcal{M}_\delta \;=\; \big\{B \subseteq U : P_a(B) > \delta\big\}
$$

Every set outside it has $P_a(B) \le \delta$, so an accept means $B^\star \in \mathcal{M}_\delta$, except with probability at most $\delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$. The confidence set is computed from the sampling design alone, and it shrinks as $\delta$ grows, so readings of one accept at several levels fail together with probability at most the largest $\delta$ plus the argument's terms.

So an upper confidence bound on a total of a nonnegative quantity $y_u$ over the incorrect proof blocks, such as work, is the largest total over any set in the confidence set, $\max_{B \in \mathcal{M}_\delta} \sum_{u \in B} y_u$. A bound on exfiltration counts every output value that some set in $\mathcal{M}_\delta$ could deliver, since an accept doesn't say which set it was.

## Sampling designs

The sampling design is agreed before the prover commits, and the verifier expands it over its own partition. It is one of these, with $B$ a candidate set of incorrect proof blocks:

| Sampling design | Sample | $P_a(B)$ |
| --- | --- | --- |
| `subset:K` | A uniform $K$-subset of the proof blocks | $\binom{\lvert U\rvert - \lvert B\rvert}{K} \big/ \binom{\lvert U\rvert}{K}$ |
| `bernoulli:p` | Each proof block independently, with probability $p$ | $(1-p)^{\lvert B\rvert}$ |
| `stratified:K` | $k_s$ proof blocks without replacement from each stratum $s$ | $\prod_s \binom{n_s - m_s}{k_s} \big/ \binom{n_s}{k_s}$ |
| `work:K` | $k_s$ proof blocks from each stratum, sized by the work its proof blocks do | At most $(1-\phi)^K$, when $B$ does a fraction $\phi$ of the work |

Stratum $s$ has $n_s$ proof blocks, $m_s$ of them in $B$. `stratified:K` samples $k_s = \max\big(1, \lfloor (2Kn_s + \lvert U\rvert)/(2\lvert U\rvert) \rfloor\big)$, which is $Kn_s/\lvert U\rvert$ rounded half up and at least one, so a template incorrect in every proof block is never missed. `work:K` gives each stratum's proof blocks a work $w_s$ and a floor $f_s \ge 1$, and samples $k_s = \min\big(n_s, \max(f_s, \lceil K w_s n_s / W \rceil)\big)$ with $W = \sum_s w_s n_s$.

`stratified:K` is the default. Its strata are subcircuit templates, so `stratified` and `work` need a query whose proof blocks are template instances, `Q_template_instance` or `Q_template_instances`. Work sampling reads the work the verifier's own work table credits each template. Work counts only on rows the program declares, so filler is credited nothing and is still sampled by its floor, and templates padded differently are separate strata. A sample may add the verifier's closure, proof blocks proved along with the sampled ones, which only helps.

### Cost

A design's cost is the number of proof blocks it proves. Against a set of incorrect proof blocks that is a fraction $\phi$ of what the design weighs, about $K$ proved proof blocks, with $(1-\phi)^K \le \delta$, bring $P_a(B)$ down to $\delta$:

| $\delta$ | $\phi = 1\%$ | $\phi = 0.1\%$ | $\phi = 0.01\%$ |
| --- | --- | --- | --- |
| $2^{-20}$ | 1,380 | 13,857 | 138,623 |
| $2^{-40}$ | 2,759 | 27,713 | 277,246 |

`subset:K` proves exactly $K$ proof blocks and meets the bound. `bernoulli:p` proves $p\lvert U\rvert$ proof blocks on average, a number that varies from run to run, and needs slightly more, $p\lvert U\rvert \ge \ln(1/\delta)/\phi$. `stratified:K` proves about $K$, plus at most one per stratum for its floor. `work:K` proves about $K$ plus its floors, with $\phi$ a fraction of the work rather than of the proof blocks, so a prover can't hide skipped work in a few expensive proof blocks. What one proved proof block costs depends on the argument.

## Two-stage sampling

A prover that doesn't keep its trace rebuilds a proof block's values by replaying the part of the computation around it, a *replay block*. The replay blocks are a partition $U_I$ of `circuit` that $U$ refines, and replay block $i$ holds $N_i$ proof blocks, $U_i$. Cochran's cost model prices a run at $c_1$ per replay block replayed and $c_2$ per proof block proved, so a sample spread over many replay blocks pays $c_1$ many times over. The verifier therefore samples in two stages: it samples replay blocks $S_I$ from a first-stage sampling design $\mathcal{D}_I$, then proof blocks inside each sampled replay block $i$, each $u \in U_i$ with probability $\pi_{u|i}$, independently across replay blocks. That two-stage sampling design is a sampling design on $U$ like any other, and everything above holds for it unchanged.

### Lazy commitments

With *lazy commitments* the prover commits in two steps as well: the replay blocks' boundary before the first sample, and after it the interior of each sampled replay block, the boundary gates of its proof blocks not yet committed. The interior must reach the verifier before the second sample, and the second stage must read only which replay blocks were sampled.

![Lazy commitments](/programs/sampled-proofs-lazy#commit,sample)

Before the first sample only the replay blocks' boundary is committed, so integrity is about $B^\star_I \subseteq U_I$, the replay blocks incorrect in the committed boundary trace. A sampled incorrect replay block holds an incorrect proof block whatever interior the prover commits, since its proof blocks' functions compose to its own. For every prover $\mathcal{P}^*$ and every family $\mathcal{B}$ of sets of replay blocks:

$$
\Pr\big[\mathsf{accept} \,\wedge\, B^\star_I \in \mathcal{B}\big] \;\le\; \max_{B \in \mathcal{B}} \bar P_a(B) + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}
$$

where

$$
\bar P_a(B) \;=\; \mathbb{E}_{S_I \sim \mathcal{D}_I}\Big[\prod_{i \in B \cap S_I} \big(1 - \min_{u \in U_i} \pi_{u|i}\big)\Big]
$$

$\bar P_a(B)$ is an upper bound on the acceptance probability, not its value, since the prover need not put the fault where the second stage is least likely to look, and the confidence set uses it in place of $P_a$. A total's upper confidence bound then charges each replay block in a set its whole $\sum_{u \in U_i} y_u$: a prover that skipped a whole replay block can, once it is sampled, replay it and commit an interior with a single incorrect proof block.

~~~proof abstract
The committed boundary trace is a function of the prover's strategy after it sends `com_boundary`, so $B^\star_I$ is fixed before the first sample. Given the first sample $S_I$, each sampled replay block in $B^\star_I$ holds a proof block incorrect in the committed trace of both commitments. That trace is fixed before the second sample, because `com_interior` arrives first, and the second stage doesn't read it, so the second stage misses that proof block with probability at most $1 - \min_{u \in U_i} \pi_{u|i}$, independently across replay blocks. Averaging over $S_I$ gives $\bar P_a(B)$, and a hit followed by an accept costs $\varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$, taken at the proof blocks, as in the one-stage proof.
~~~

## Reading integrity

An accept doesn't say which proof blocks are incorrect. [Integrity](#integrity) gives a *confidence set* $\mathcal{M}_\delta$, the candidate sets of incorrect proof blocks that the sample misses with probability more than $\delta$, computed from the sampling design alone, and an accept means the incorrect set $B^\star$ is in it, except with probability at most $\delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$. A consumer charges each proof block $u$ a nonnegative quantity $y_u$, such as its work or its output bits, and reads the accept by one of two rules:

- **A total.** An upper confidence bound on the incorrect proof blocks' total is the largest total of any set in the confidence set:

$$
\Pr\Big[\mathsf{accept} \,\wedge\, \sum_{u \in B^\star} y_u > \max_{B \in \mathcal{M}_\delta} \sum_{u \in B} y_u\Big] \;\le\; \delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}
$$

- **Exfiltration.** A bound on what incorrect proof blocks can deliver counts every output value that some set in $\mathcal{M}_\delta$ could deliver, since an accept doesn't say which set it was: the largest total of the sets' output bits, plus the bits that name the set.

| Consumer | $y_u$ | Rule |
| --- | --- | --- |
| Compute accounting | The proof block's work | A total |
| Network accounting | The proof block's output bits | Exfiltration |

The confidence sets shrink as $\delta$ grows, so consumers that read one accept at levels $\delta_i$ fail together with probability at most $\max_i \delta_i + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$: an application that composes several of them pays the error once. Network accounting's content bound reads the same accept as integrity, the audit of the served program; compute accounting reads an accept of its own, over its tiles, so its terms add ([remote](/protocols/remote#integrity-and-work)).

## With Flock

[Flock](/proof-systems/basic-proofs#flock) provides `commit`, `prove` and `verify`, with $\varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$ evaluated at about $t \cdot 2^{-209}$ for a prover making $t$ SHA-512 evaluations on an audit whose sampled proof blocks read $2^{24}$ commit strings ([its bound](/proof-systems/basic-proofs#integrity)).
