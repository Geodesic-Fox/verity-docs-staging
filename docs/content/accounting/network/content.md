The content bound limits what a node's traffic can say beyond the committed computation's output. What leaves must be the delivered values of the committed circuit, so if no proof unit is faulty and the inputs are the anchored ones, the prover chooses nothing. Its freedom lies in the faulty units, which [sampling's integrity guarantee](/docs/proof-systems/sampling#integrity) confines to a set in the confidence set $\mathcal{M}_\delta$. The bound needs no device and no physical assumption: it reads the same accept as integrity.

## Interface

| Input | Symbol | Description |
| --- | --- | --- |
| `partition`, `design` | $U$, $\mathcal{D}$ | The committed circuit's proof units and the sampling design, as in [sampling](/docs/proof-systems/sampling#public-parameters). |
| `level` | $\delta$ | The level the confidence set is read at. |
| `bits` | $\mathrm{bits}_u$ | Each unit's output bits: the gates it exports to other units or to the outputs, one bit each in a Boolean circuit. |

| Output | Description |
| --- | --- |
| $b$ | The content charge, in bits. |

## The charge

Network accounting charges each faulty unit its output bits, by [composition's exfiltration rule](/docs/accounting/composition#reading-integrity), and adds the choice of which set it was:

$$
b \;=\; \max_{B \in \mathcal{M}_\delta} \sum_{u \in B} \mathrm{bits}_u \;+\; \log_2 \lvert \mathcal{M}_\delta \rvert
$$

Two traces on the anchors' inputs whose faulty units lie in $B$, and that agree on $B$'s exported gates, deliver the same values, so the first term is all the faulty units can say. The second counts the sets they can form: with $K$ the size of the largest set in $\mathcal{M}_\delta$, out of $N$ units, $\lvert \mathcal{M}_\delta \rvert \le \sum_{j \le K} \binom{N}{j} \le 2^{N H_2(K/N)}$ for $K \le N/2$, and the term is 0 when the confidence set holds only the empty set.

## Guarantee

Take a prover that picks its strategy from a uniform $L$-bit message $M$, and a receiver that sees only the delivered values. Then

$$
\Pr\big[\mathsf{accept} \,\wedge\, \text{the receiver recovers } M\big] \;\le\; 2^{\,b - L} + \delta + \varepsilon_{\mathrm{ks}} + \delta_{\mathrm{link}} + \delta_{\mathrm{in}}
$$

$\varepsilon_{\mathrm{ks}}$ and $\delta_{\mathrm{link}}$ are the proof system's knowledge-soundness and binding terms, and $\delta_{\mathrm{in}}$ is the chance that the committed inputs differ from the anchors' values. It holds for any Boolean circuit, partition and one-stage sampling design (`FlockSoundness.Audit.Partition.audit_exfiltration`); the two-stage audit has only an influence form, not this one, and takes the proof system's knowledge soundness and binding as hypotheses, which are not yet proved of C-Flock's audit. Because it reads the same accept as integrity, an application that reads both pays $\delta + \varepsilon_{\mathrm{ks}} + \delta_{\mathrm{link}}$ once.

The content bound and the [timing bound](/docs/accounting/network/certifier#timing-bound) are separate statements over different models; no theorem adds them. That the frames on the wire are the delivered values of the committed circuit is checked only as far as the certifier's check reads them.
