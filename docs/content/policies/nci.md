Novel communication intensity (NCI) is the policy behind inference-only: that the developer's records reflect only having performed inference, not training. It exploits an asymmetry between the two. Each inference episode, such as a chat session, depends on only a small amount of novel information, such as 100 KB of prompt tokens, while each training episode, such as a reinforcement-learning rollout, depends on an enormous amount, such as 1 TB of new parameters. NCI asks that the developer's declared circuit divide into *isolation units* of bounded size, each reading a bounded amount of novel information per gate. Inference complies as it is, at no cost. Under two named assumptions, both known to be false as stated ([below](#assumptions)), and a premise about what frontier training needs, a training computation complies only inside a circuit larger than itself by a factor computed [below](#what-compliance-implies).

Read beside the [onsite](/protocols/onsite#inference-only) protocol, whose network certifiers bound the covert ingress that each isolation unit's read cap is charged ([below](#what-ties-the-declaration-to-what-ran)). It isn't one of onsite's subprotocols, so the onsite verdict doesn't include it.

The design's argument for inference-only ends in a conjecture: that circuits with low NCI cannot advance frontier capabilities on relevant timescales, such as years. The guarantees on this page bound how much larger a complying circuit must be. That this keeps it from advancing the frontier is a scientific claim, and nothing here proves it.

## Policies

A *policy* is a condition on declarations that the verifier checks from the circuit and its baseline alone. It is a protocol with no rounds of its own: it draws no coins, asks for no proofs and reads no values. What ties the declared circuit to what actually ran is faithfulness, which [sampling](/proof-systems/sampling) and [accounting](/accounting) establish together. NCI is the first policy.

## Declarations and novel information

The developer *declares* $(D, \theta)$: the circuit $D$ it registers, and its *baseline* $\theta$, the input gates of $D$ whose values it committed beforehand. The baseline holds its models, code and data in storage. Every other value is *novel information*: the remaining input gates, which hold data such as prompts, and every computed gate, since each is computed after the commitment. Circuits are read as in [the circuit model](/accounting/circuits#the-circuit-model): gates $0, \dots, N-1$ in topological order, gate $g$ holding a value of $w(g)$ bits, some of them input gates.

An *isolation unit* (IU) is one part of a division of $D$'s computed gates into disjoint sets, each computed gate in exactly one: a [partition](/accounting/circuits#partitions) in the role of isolating what each part reads. Input gates are in no IU, so an IU that uses an input reads it.

~~~mermaid
flowchart LR
  theta["Baseline θ<br/>models, code, data"]
  prompt["Novel inputs<br/>such as prompts"]
  r1["IU 1"]
  r2["IU 2"]
  theta -.->|"free"| r1
  theta -.->|"free"| r2
  prompt -->|"counted"| r1
  r1 -->|"counted"| r2
~~~

For a set $R$ of gates, $\mathrm{in}(R)$ is the set of gates outside $R$ with a wire into $R$, each counted once however many of $R$'s gates read it. The gates $R$ of an IU read

$$
\mathrm{novel}(R) \;=\; \mathrm{width}\big(\mathrm{in}(R) \setminus \theta\big) \;=\; \sum_{g \,\in\, \mathrm{in}(R) \setminus \theta} w(g)
$$

bits of novel information. Baseline values are free, and so is anything $R$ computes itself; every other input it reads, and every value another IU computed, counts. The IU's novel communication intensity is that per gate it holds:

$$
\mathrm{NCI}(R) \;=\; \frac{\mathrm{novel}(R)}{\lvert R \rvert}
$$

## The policy

The NCI policy at maximum IU size $\Gamma$ and NCI limit $\alpha$ asks that $D$ divide into IUs of at most $\Gamma$ gates, each with NCI at most $\alpha$:

$$
\mathrm{Complies}_{\Gamma,\alpha}(D, \theta) \iff \exists\, R_1, \dots, R_n \text{ dividing } D\text{'s computed gates}:\ \forall u,\ \lvert R_u\rvert \le \Gamma \;\wedge\; \mathrm{novel}(R_u) \le \alpha\,\lvert R_u\rvert
$$

The NCI bound is multiplied out, so it is defined for every IU. Every IU of a complying division reads at most $K = \alpha\Gamma$ bits of novel information, the *read cap*.

## Public parameters

| Parameter | Description |
| --- | --- |
| $\Gamma$ | The largest isolation unit allowed, in gates. |
| $\alpha$ | The NCI limit, in bits of novel information per gate: a ratio of two integers. |

## Outputs

| Value | Description |
| --- | --- |
| `complies` | Every isolation unit of the declared division has at most $\Gamma$ gates and NCI at most $\alpha$. |
| `does not comply` | Otherwise. The verdict names the first isolation unit that fails and the bound it breaks. |

## Public outputs

Every protocol is zero knowledge, and the declared circuit is the developer's: the developer proves the check in zero knowledge over its registered declaration, with the division as witness.

| Output | What it is | Why it is public |
| --- | --- | --- |
| `verdict` | `complies` or `does not comply`. | The policy's result. |
| $\Gamma$, $\alpha$ | The policy's parameters. | The protocol's structure: what compliance means. |

The declaration, its baseline, the division and the check's per-unit report stay hidden.

## The check

~~~mermaid
sequenceDiagram
  participant P as Developer
  participant V as Verifier
  P->>V: (D, θ)
  P->>V: division
  Note over V: v = check(D, θ, division, Γ, α)
~~~

| Function | Description |
| --- | --- |
| `declare() -> (D, θ)` | The developer registers its circuit $D$ as a program in the [program format](/accounting/circuits#the-descriptor-and-its-digest), and lists its baseline $\theta$ as gate indices of the program's canonical layout, each an input gate, none twice. |
| `divide(D, θ) -> division` | The developer's division of $D$ into isolation units: one owner per gate, an IU index for each computed gate and none for each input gate, with every IU holding at least one gate. |
| `check(D, θ, division, Γ, α) -> v` | Decides that the division partitions $D$'s computed gates and that every IU meets both bounds. The verdict $v$ reports the number of gates, each IU's size and novel reads, whether the declaration complies, and otherwise the first IU that fails, with the bound it breaks first: size, then NCI. |

The check reads only the circuit's structure: its gates, their widths, which of them are input gates, and the wires between them. It never reads a gate's operation, the outputs or any value. It compares $\mathrm{novel}(R) \le \alpha\,\lvert R\rvert$ exactly, with $\alpha$ as a ratio of integers. Before it gives a verdict, it refuses an instance that isn't well formed: a program that doesn't decode or isn't topological, a baseline entry that names no gate, names a computed gate or repeats one, or a division that puts an input gate in an IU, leaves a computed gate out, or has an empty IU.

The division is the developer's witness. The policy asks only that some division exist, and any division that passes shows that one does.

## Security goal

A `complies` verdict means exactly that the declaration complies: for the circuit $D$ that the program lays out and the baseline $\theta$ its entries name, the declared division witnesses $\mathrm{Complies}_{\Gamma,\alpha}(D, \theta)$. Conversely, every well-formed instance gets a verdict, and the sizes and novel reads it reports are the definitions'. This rests on no assumption.

It says nothing more. Whether $D$ is what actually ran is faithfulness ([below](#what-ties-the-declaration-to-what-ran)), and whether a complying circuit could still advance the frontier is [the conjecture](#the-conjecture). What compliance implies about the size of a circuit that trains is the next section's.

## What compliance implies

Complying has a cost, measured against the computation a declaration implements. A declaration $d$ *implements* a declaration $t$ when $d$'s circuit has $t$'s input gates and produces $t$'s outputs on every input, computed however it likes, without moving any novel input of $t$ into $d$'s baseline. It *contains* $t$ when, besides, it computes each of $t$'s gates with the same operation from the same wires. A declaration's size $\lvert d\rvert$ counts its computed gates. The *slowdown factor* of a computation $t$ under a policy $\mathcal{P}$ is the least ratio of sizes over the declarations that implement $t$ and comply, and infinite when none does:

$$
\rho_{\mathcal{P}}(t) \;=\; \inf\,\big\{\, \lvert d\rvert / \lvert t\rvert \;:\; d \text{ implements } t \;\wedge\; \mathcal{P}(d) \,\big\}
$$

$\mathrm{Reads}_\Gamma(c)$ is the least total novel information that the IUs of a division of $c$ into IUs of at most $\Gamma$ gates read. Four guarantees follow, each for every $\Gamma$ and $\alpha$ (the last two for $\alpha > 0$ and positive entry widths, the last for a nonempty $T$):

| Guarantee | What it says | Rests on |
| --- | --- | --- |
| Inference complies | A declaration divided into sessions of at most $\Gamma$ gates, each reading from outside itself only baseline values and its own prompt, with at most $\alpha$ bits of prompt per gate of the session, complies, and its slowdown factor is at most 1. | Nothing |
| The read bound | A complying declaration that contains $c$ has at least $\mathrm{Reads}_\Gamma(c)/\alpha$ computed gates. | Nothing |
| Updated matrix multiplications are throttled | A complying declaration that runs an updated matrix multiplication chain of $G$ products has at least $F \cdot 2G$ computed gates. | Both [assumptions](#assumptions), known false as stated |
| Frontier training is throttled | If every complying declaration that implements a training computation $T$ runs such a chain, covering a fraction $\kappa$ of $\lvert T\rvert$, then $\rho(T) \ge \kappa F$. | Both assumptions, known false as stated, and that premise |

The first is why the policy costs inference nothing: a session that reads its prompt and the baseline is already an IU. The second turns lower bounds on what a computation must read into lower bounds on size, whenever the declared circuit computes it the way it is written.

An *updated matrix multiplication chain* is $L$ multiplications $y_t = W_\ell\, x_t$ at $N$ token positions, whose weight matrices are computed after the commitment. The circuit computes each product $W_\ell[i, j]\, x_t[j]$ with its own gate; each output entry adds up its products, in any order; and each input entry of the next multiplication is computed from one complete output entry of this one, through an injective link, possibly with other values. The circuit may compute anything else besides. Multiplication $\ell$ has inner dimension $d_\ell$ and output dimension $e_\ell$, and $G = \sum_\ell e_\ell\, d_\ell\, N$ counts the products. With $K = \alpha\Gamma$ the read cap, $b_w$ and $b_a$ the widths of a weight entry and an activation entry, and $d$ the smallest inner dimension, the slowdown factor is

$$
F \;=\; \frac{1}{2\alpha} \sup_{0<\mu<1} \min\left\{ \frac{(1+\sqrt{\mu})^2\, b_w\, b_a\, d}{K},\ \ \sqrt{2}\,(1+\sqrt{\mu})\sqrt{1-\mu}\; b_a \sqrt{\frac{b_w}{K}} \right\}
$$

The multiplications have about $2G$ gates, $G$ products and about as many additions, so $F$ is the factor by which a complying circuit is larger than the multiplications it runs. The first term covers IUs that complete output entries themselves, the second IUs that split entries with other IUs. A smaller $d$ gives a smaller $F$.

## Assumptions

The two named assumptions are compute-bounded incompressibility: the weights, activations and partial sums of an updated chain can't pass between IUs more cheaply than by sending them. An IU *uses* an entry when it holds one of the entry's products, and an output entry is *whole* in an IU when all of its products lie in it.

| Assumption | What it asks |
| --- | --- |
| Weights and activations are incompressible | An IU of at most $\Gamma$ gates that reads at most $K$ bits reads at least $b_w$ bits for each weight entry it uses, and $b_a$ for each input entry it uses, except an input entry computed from an output entry whole in the IU, which it can compute from its own products. |
| Partial sums are incompressible | When an output entry's products lie in $m$ IUs, at least $m - 1$ partial sums pass between them, and each costs the IU that receives it at least $b_a$ bits, on top of $b_w$ for each weight entry that IU uses. |

Written out, the first asks that every set $R$ of at most $\Gamma$ computed gates with $\mathrm{novel}(R) \le K$ satisfy $b_w\, p_R + b_a\, q_R \le \mathrm{novel}(R)$, where $p_R$ counts the weight entries $R$ uses and $q_R$ the input entries it uses that aren't computed from an output entry whole in $R$. The second asks that, for every division into IUs of at most $\Gamma$ gates each reading at most $K$ bits, the partial sums can be charged to the IUs that receive them, $s_u$ to IU $u$, so that $\sum_y (m_y - 1) \le \sum_u s_u$ over the output entries $y$, with $m_y$ the number of IUs holding products of $y$, and $b_w\, p_{R_u} + b_a\, s_u \le \mathrm{novel}(R_u)$ for every $u$.

Both are assumed only for chains whose weights and first inputs depend on more than $\Gamma$ work of training since the commitment, which frontier training passes at once. Below that threshold one IU could compute the weights from a committed checkpoint, or compute the first inputs from the baseline alone at many positions. Both are assumed only for IUs that read at most $K$ bits: without the cap they fail for honest training, since an IU that runs a transformer's first attention layer and first MLP at many positions reads the embeddings and attention weights once and then computes the MLP's inputs itself.

The assumptions are hypotheses of the guarantees that take them, and nothing proves them. Nor does anything prove the premise of the training guarantee: that every complying implementation of frontier training runs updated matrix multiplication chains covering a fraction $\kappa$ of its size.

**Both are known to be false as stated.** They are simplifications made for the analysis (Daniel, 9 Oct), and restating them is open. Until then the two guarantees that take them are proved implications that say nothing about a real circuit. Inference's compliance and the read bound take neither, and stand.

## The conjecture

Under their assumptions, the guarantees bound how much larger a complying circuit must be to train: a factor of $\kappa F$ over the training computation itself, with every IU reading at most $K$ bits. The design's argument for inference-only is that this keeps a circuit with low NCI from advancing frontier capabilities on relevant timescales, such as years. That is a conjecture: a scientific claim about how frontier capabilities advance. The guarantees neither state nor imply it, and inference-only rests on it.

## What ties the declaration to what ran

The check reads the declared circuit, never the datacenter. Faithfulness ties the two: [sampling](/proof-systems/sampling#integrity) bounds which proof units of the committed computation can be faulty, and [accounting](/accounting) bounds the compute, memory and network the developer used against what its records account for.

Novel information can also reach a node outside any declared wire, through a covert channel on its network link. [Network accounting](/accounting/network) bounds how much such a channel can carry in. The inference-only policy charges each IU the covert ingress capacity since its node's last memory wipe before the IU starts, plus whatever survived that wipe, as a share of its read cap $K$.

## Overhead

For inference, none: a session that reads its prompt and the baseline is already an isolation unit, so a declaration of sessions complies as it runs, with a slowdown factor of at most 1. The check reads each wire of the declared circuit once. For training, under the [assumptions](#assumptions), the overhead is the slowdown factor $\kappa F$ of [What compliance implies](#what-compliance-implies), which is the policy's purpose.

## Parameters

One setting, the one network accounting's ingress charge is calibrated against:

| Parameter | Value |
| --- | --- |
| $\Gamma$ | $9.5 \times 10^{17}$ gates |
| $\alpha$ | $9.6 \times 10^{-11}$ bits per gate |
| $K = \alpha\Gamma$ | $9.12 \times 10^{7}$ bits, about 11.4 MB |
