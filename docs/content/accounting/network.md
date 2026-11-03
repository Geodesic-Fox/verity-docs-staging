Network accounting bounds what a node's traffic can carry out beyond the committed computation's output. A node can say something in two ways, in what its frames contain and in when they leave, and each has its own protocol:

- **Content.** The [content bound](/accounting/network#content-bound) reads sampling's accept: what leaves must be the delivered output of the committed circuit, so only faulty proof units can add to it, charged their output bits.
- **Timing.** The [network certifier](/accounting/network/certification) is the auditor's device on each uplink. It releases a constant number of frames per bucket on the grid the Program fixes, so the only timing freedom left is one clock sync per window.

Both bounds are proved in a model. This page says what a deployment has to be true of its hardware for the model to describe it, and what the bounds leave of the wire's capacity. Network accounting is used by the [onsite](/protocols/onsite) protocol, whose certifiers sit at the developer's site.

## Headroom

Without a certifier, a covert sender on an egress link can use the whole wire, $8TrB$ bits per window of $T$ buckets of $r$ frames of $B$ bytes. On a run the audit accepts, what it can carry is at most

$$
\underbrace{A_c + W \log_2 \lvert\Sigma_{\mathrm{sync}}\rvert + WT \log_2 D}_{\text{timing, over } W \text{ windows}} \;+\; \underbrace{b}_{\text{content}}
$$

The timing term is the certifier's [bound](/accounting/network/certification#timing-bound), and the content term is the [content charge](/accounting/network#the-charge). The two are separate theorems over different models, added here as a budget, not as one statement. The headroom is the gap between the wire's capacity and this: at the deployed calibration, a link carries about $3.3 \times 10^{10}$ bits a window, of which an accepted run's timing can say 7.

## Physical assumptions

The bounds hold of the certifier's model. These are what make a real deployment an instance of it:

| Assumption | What it asks | Kind |
| --- | --- | --- |
| Coverage (W1) | Every uplink of the spatial unit passes through a certifier the auditor trusts, with its parameters fixed before the run and independent of the traffic. Nothing leaves the unit another way. | Assumed: the auditor's placement, in the [onsite](/protocols/onsite#placement) protocol. Stated in Lean as the named premise `Accounting.Covered` (no uncertified boundary capacity); B4 at a covered location (`B4Covered`) drops the uncertified term. Claim id: `certifier-coverage`. |
| The device runs as built | The certifier executes its code, its key stays its own, and its host never restores an earlier copy of the state it keeps there. | Assumed: the trusted Nebius host (`DeviceIntact`). There is no attestation. |
| Regeneration (W2) | Everything the certifier puts on the wire, faults included, is a function of its record. No acknowledgement, backpressure, power draw or other physical feature carries anything else. | Assumed. |
| Bounded jitter (J) | Each bucket's timing offset, as an outside receiver sees it, falls in one of $D$ classes. | Assumed at $D = 1$. The certifier faults on a tick more than 25 ms late; $D$ hasn't been measured. |
| Line rate | Each egress link sustains $8rB/\tau_b$ bits per second whatever the load. | Declared by the parameters, sized from honest traces. |

The certifier enforces its own rules in code (frames of $B$ bytes, left-packed rows, at most $r$ real frames a bucket, an untimed status, fail-closed faults), and they're proved of its Lean model. A violation of any assumption above is outside the bound: a side channel the record doesn't determine is a channel the audit doesn't see.

## Numbers

| Link, at the deployed calibration | Line rate | Accounted, accepted runs |
| --- | --- | --- |
| Egress, $r = 1{,}686$, $B = 4{,}096$, $\tau_b = 100$ ms | 552.5 Mbit/s | 7 bits per 60 s window, plus $A_c$ once |
| Ingress, $r_{\mathrm{in}} = 34$ | 11.1 Mbit/s | 3,077.6 bits per window |

The content advice $A_c$ is not yet declared, so today's runs leave it unbounded; with eight registered capacity profiles fixed per audit it would be 3 bits.

## Status

- **Proved:** the timing bounds, under W2 and J, for any number of links sharing one sync.
- **Proved, under the trusted host (`DeviceIntact`), for one link pair:** that an accepted run of the check's code is an accepted run of the model, or exhibits a SHA-512 collision or a certificate the certifier didn't sign in its challenger-drawn session, which is an LMS forgery; and that an honest certifier's output passes. A unit of several certifiers sharing a clock isn't stated yet.
- **Conditional:** the content bound, on the proof system's knowledge soundness and binding.
- **Open:** declaring the content advice; and proving the check in zero knowledge, which a stand-in verifier does in the clear today.

## Content bound

The content bound limits what a node's traffic can say beyond the committed computation's output. What leaves must be the delivered values of the committed circuit, so if no proof unit is faulty and the inputs are the anchored ones, the prover chooses nothing. Its freedom lies in the faulty units, which [sampling's integrity guarantee](/proof-systems/sampling#integrity) confines to a set in the confidence set $\mathcal{M}_\delta$. The bound needs no device and no physical assumption: it reads the same accept as integrity.

### Interface

| Input | Symbol | Description |
| --- | --- | --- |
| `partition`, `design` | $U$, $\mathcal{D}$ | The committed circuit's proof units and the sampling design, as in [sampling](/proof-systems/sampling#public-parameters). |
| `level` | $\delta$ | The level the confidence set is read at. |
| `bits` | $\mathrm{bits}_u$ | Each unit's output bits: the gates it exports to other units or to the outputs, one bit each in a Boolean circuit. |

| Output | Description |
| --- | --- |
| $b$ | The content charge, in bits. |

### The charge

Network accounting charges each faulty unit its output bits, by [composition's exfiltration rule](/accounting#reading-integrity), and adds the choice of which set it was:

$$
b \;=\; \max_{B \in \mathcal{M}_\delta} \sum_{u \in B} \mathrm{bits}_u \;+\; \log_2 \lvert \mathcal{M}_\delta \rvert
$$

Two traces on the anchors' inputs whose faulty units lie in $B$, and that agree on $B$'s exported gates, deliver the same values, so the first term is all the faulty units can say. The second counts the sets they can form: with $K$ the size of the largest set in $\mathcal{M}_\delta$, out of $N$ units, $\lvert \mathcal{M}_\delta \rvert \le \sum_{j \le K} \binom{N}{j} \le 2^{N H_2(K/N)}$ for $K \le N/2$, and the term is 0 when the confidence set holds only the empty set.

### Guarantee

Take a prover that picks its strategy from a uniform $L$-bit message $M$, and a receiver that sees only the delivered values. Then

$$
\Pr\big[\mathsf{accept} \,\wedge\, \text{the receiver recovers } M\big] \;\le\; 2^{\,b - L} + \delta + \varepsilon_{\mathrm{ks}} + \delta_{\mathrm{link}} + \delta_{\mathrm{in}}
$$

$\varepsilon_{\mathrm{ks}}$ and $\delta_{\mathrm{link}}$ are the proof system's knowledge-soundness and binding terms, and $\delta_{\mathrm{in}}$ is the chance that the committed inputs differ from the anchors' values. It holds for any Boolean circuit, partition and one-stage sampling design (`FlockSoundness.Audit.Partition.audit_exfiltration`); the two-stage audit has only an influence form, not this one, and takes the proof system's knowledge soundness and binding as hypotheses, which are not yet proved of C-Flock's audit. Because it reads the same accept as integrity, an application that reads both pays $\delta + \varepsilon_{\mathrm{ks}} + \delta_{\mathrm{link}}$ once.

The content bound and the [timing bound](/accounting/network/certification#timing-bound) are separate statements over different models; no theorem adds them. That the frames on the wire are the delivered values of the committed circuit is checked only as far as the certifier's check reads them.
