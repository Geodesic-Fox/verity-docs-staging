Network accounting bounds what a node's traffic can carry out beyond the committed computation's output. A node can say something in two ways, in what its frames contain and in when they leave, and each has its own protocol:

- **Content.** The [content bound](#content-bound) reads sampling's accept: what leaves must be the delivered output of the committed circuit, so only incorrect proof blocks can add to it, charged their output bits.
- **Timing.** The [network certifier](#network-certifier) is the auditor's device on each uplink. It releases a constant number of frames per bucket on the grid the Program fixes, so the only timing freedom left is one clock sync per window.

Both bounds are proved in a model, in the first two sections below. The rest of the page says what has to be true of a deployment's hardware for the model to describe it, and what the bounds leave of the wire's capacity. Network accounting is used by the [onsite](/protocols/onsite) protocol, whose certifiers sit at the developer's site.

## Content bound

The content bound limits what a node's traffic can say beyond the committed computation's output. What leaves must be the delivered values of the committed circuit, so if no proof block is incorrect and the inputs are the anchored ones, the prover chooses nothing. Its freedom lies in the incorrect proof blocks, which [sampling's integrity guarantee](/proof-systems/sampling#integrity) confines to a set in the confidence set $\mathcal{M}_\delta$. The bound needs no device and no physical assumption: it reads the same accept as integrity.

### Interface

| Input | Symbol | Description |
| --- | --- | --- |
| `partition`, `design` | $U$, $\mathcal{D}$ | The committed circuit's proof blocks and the sampling design, as in [sampling](/proof-systems/sampling#public-parameters). |
| `level` | $\delta$ | The level the confidence set is read at. |
| `bits` | $\mathrm{bits}_u$ | Each proof block's output bits: the gates it exports to other proof blocks or to the outputs, one bit each in a Boolean circuit. |

| Output | Description |
| --- | --- |
| $b$ | The content charge, in bits. |

### The charge

Network accounting charges each incorrect proof block its output bits, by [composition's exfiltration rule](/proof-systems/sampling#reading-integrity), and adds the choice of which set it was:

$$
b \;=\; \max_{B \in \mathcal{M}_\delta} \sum_{u \in B} \mathrm{bits}_u \;+\; \log_2 \lvert \mathcal{M}_\delta \rvert
$$

Two traces on the anchors' inputs whose incorrect proof blocks lie in $B$, and that agree on $B$'s exported gates, deliver the same values, so the first term is all the incorrect proof blocks can say. The second counts the sets they can form: with $K$ the size of the largest set in $\mathcal{M}_\delta$, out of $N$ proof blocks, $\lvert \mathcal{M}_\delta \rvert \le \sum_{j \le K} \binom{N}{j} \le 2^{N H_2(K/N)}$ for $K \le N/2$, and the term is 0 when the confidence set holds only the empty set.

### Guarantee

Take a prover that picks its strategy from a uniform $L$-bit message $M$, and a receiver that sees only the delivered values. Then

$$
\Pr\big[\mathsf{accept} \,\wedge\, \text{the receiver recovers } M\big] \;\le\; 2^{\,b - L} + \delta + \varepsilon_{\mathrm{ks}} + \delta_{\mathrm{link}} + \delta_{\mathrm{in}}
$$

$\varepsilon_{\mathrm{ks}}$ and $\delta_{\mathrm{link}}$ are the proof system's knowledge-soundness and binding terms, and $\delta_{\mathrm{in}}$ is the chance that the committed inputs differ from the anchors' values. It holds for any Boolean circuit, partition and one-stage sampling design (`FlockSoundness.Audit.Partition.audit_exfiltration`); the two-stage audit has only an influence form, not this one, and takes the proof system's knowledge soundness and binding as hypotheses, which are not yet proved of Flock's audit. Because it reads the same accept as integrity, an application that reads both pays $\delta + \varepsilon_{\mathrm{ks}} + \delta_{\mathrm{link}}$ once.

The content bound and the [timing bound](/accounting/network#timing-bound) are separate statements over different models; no theorem adds them. That the frames on the wire are the delivered values of the committed circuit is checked only as far as the certifier's check reads them.

## Network certifier

The network certifier fixes when a node's frames leave. It is a device of the auditor's on each uplink: it releases exactly $r$ frames of $B$ bytes in every bucket, real frames first, and signs a record of each window. The check accepts a window only if its record is the grid the Program schedules, so a covert sender's only say over timing is the clock sync each window declares. This section states the protocol and the bound an accept gives in the certifier's model; whether a real link meets that model, and what the bound leaves of a link's capacity, are the [physical assumptions](#physical-assumptions) and the [headroom](#headroom).

### Interface

#### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Node | $\mathcal{N}$ | The developer's machines behind the certifiers, the *spatial unit*. It runs the Program and hands each egress frame to its link's certifier. |
| Certifier | $\mathcal{C}$ | The auditor's device on one uplink. It releases the link's frames on the grid and signs one record per transfer block. |
| Verifier | $\mathcal{V}$ | Checks each transfer block's certificate and record. |

#### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `grid` | $T, \tau_b, r, B, Q$ | $T$ buckets of $\tau_b$ per window, $r$ frames of $B$ bytes in every bucket, and the queue capacity $Q$. |
| `sigma` | $\Sigma_{\mathrm{sync}}$ | The clock-sync values $(\delta, \rho)$ a window may declare: an offset in buckets and a rate in frames per bucket. |
| `program` | | Each egress frame's content, its anchor (the bucket of the request it answers) and its logical index $\lambda$ in its session, computed from the ingress and the content advice. |
| `advice` | $\mathcal{A}$ | The content advice the audit admits, fixed before the run; $A_c = \log_2 \lvert\mathcal{A}\rvert$. |
| `ingress` | $r_{\mathrm{in}}, \tau_{\mathrm{in}}$ | The ingress links' allocation and bucket width. |
| `session` | | The 32-byte identifier the challenger generates for this certifier session. |

#### Outputs

| Value | Description |
| --- | --- |
| `accept` | Every transfer block of the run passed its check. |
| `reject` | Otherwise. A rejected window shows only that it was rejected; later windows are still checked. |
| `charge` | With an accept, the timing bits the run is charged: $\log_2 \lvert\Sigma_{\mathrm{sync}}\rvert$ per window, and $A_c$ once. |

### Protocol

Each line is run by the party beside it, and an arrow sends a value to another party. Click a function to see what it computes. The listing follows one egress link; every link of the spatial unit runs it, and ingress links are certified the same way at $r_{\mathrm{in}}$ and $\tau_{\mathrm{in}}$.

#### Registration

![Registration](/programs/network-certifier#register)

#### Release

![Release](/programs/network-certifier#release)

Every bucket carries exactly $r$ frames, so the wire's load says nothing; a receiver that can tell padding from a real frame sees only the occupancy $n_t$, which the queue and the schedule fix.

##### The schedule

Each window declares one clock sync from $\Sigma_{\mathrm{sync}}$, and every egress link of the spatial unit declares the same one: the bound charges one sync per window for all links, where a sync per link would multiply the charge by their number. Frame $k$ becomes eligible at bucket $\mathit{anchor}_k + \delta + \lfloor \lambda_k/\rho \rfloor$ under its anchor's window's sync, and is handed over at $h(k) = \max(\mathrm{eligible}(k), h(k-1))$, so a window's grid reads only its own and earlier syncs.

#### Certification

![Certification](/programs/network-certifier#certify)

##### The record and the certificate

The record has a fixed binary layout, integers big-endian, every field of fixed width or length-prefixed, so it parses one way:

~~~text
R           len(link) || link || direction || window || T || r || B || τ_b || status || deadline
            || parameters (64 B) || n_0 ... n_{T-1} || root (64 B)
digest      tagged SHA-512 of R, under "verity-network-certifier/record/v2"
leaf(f)     SHA-512(block("verity-network-certifier/frame/v2\0" || u32be B) || f)
node(a, b)  SHA-512(block("verity-network-certifier/node/v2\0") || a || b)
message     SHA-512([tag] || I || [[session] || [link] || [direction] || u64be window] || [digest])
            tag = "verity/network-certificate-message/v2", [x] = u64be len(x) || x
~~~

The status is complete, or the first fault's reason, with no time or count. The frame tree holds the window's real frames in grid order, then empty leaves, at depth $\lceil \log_2(Tr) \rceil$, so padding never enters it. The message binds every certificate to the challenger-generated session as well as its transfer block. The signature is LMS over SHA-512 ($n = 64$, $w = 1$, $h = 20$), and a certifier never reuses a leaf.

#### Check

![Check](/programs/network-certifier#check)

##### The check

An egress transfer block passes when it has exactly one record, settled by the verdict deadline; its certificate verifies under the certifier's key and names its session, link, direction and window; its status is complete; its sync is in $\Sigma_{\mathrm{sync}}$ and is the spatial unit's for the window; and its record is the Program's grid, slot for slot. An ingress transfer block passes when it has one record by the deadline, its certificate verifies, its status is complete and its parameters are the registered ones.

Certificates are witness. In the protocols the developer is to prove in zero knowledge that each passes the check; today the verifier is a stand-in that reads the records itself.

### Security

#### The model

The bound is stated about what the wire carries, and takes two facts about the device as its model: everything the certifier puts on the wire is a function of its record (*regeneration*, W2), and each bucket's timing falls in one of $D$ classes (*bounded jitter*, J). Whether a physical certifier meets them is a question about hardware, taken up on [network accounting](/accounting/network#physical-assumptions). The certifier's own rules (frames of $B$ bytes, left-packed rows, an untimed status, fail-closed faults) are enforced by its code.

#### Assumptions

- **Collision resistance.** Equal record digests mean equal records: [CR · SHA-512](/assumptions/cr/sha-512).
- **Unforgeable certificates.** No one but the certifier signs a message under its key: EUF-CMA for LMS over SHA-512. The message names the challenger-generated session, and the certifier refuses to start a session identifier it has started before.
- **Fixed advice.** The content advice, the Program's frames and $\Sigma_{\mathrm{sync}}$ are fixed before the run, independently of any secret, and the audit refuses advice outside $\mathcal{A}$.

#### Completeness

An honest certifier's output passes the check (`DeviceOutputAccepted`, for one link pair). An honest node misses a window when no value of $\Sigma_{\mathrm{sync}}$ meets it on every egress link, and calibration sizes $\Sigma_{\mathrm{sync}}$, $r$ and $r_{\mathrm{in}}$ from honest traces so that it misses at most $10^{-4}$ of its windows.

#### Timing bound

Take any sender inside the spatial unit, any operator driving the ingress, and a set $Z$ of secrets that a decoder reading the wire's first $n$ buckets always recovers, each from a run the audit accepts for those buckets, with $n \le mT$ and $n \le WT$. Then

$$
\log_2 |Z| \;\le\; A_c + \min(W, m)\,\log_2 \lvert\Sigma_{\mathrm{sync}}\rvert + n \log_2 D
$$

$W$ is the number of windows the audit checks and $m$ the number the monitoring period reaches. The bound has no error term, and holds under W2 and J (`NetTiming.Guarantees.EncardDecodableLeConstantRate`). At $16 \times 8$ sync values and $D = 1$ it is $A_c$ plus 7 bits per window. Two forms refine it:

- **Per window.** Over the run's first $m$ whole windows: $A_c$ once, then $\log_2 \lvert\Sigma_{\mathrm{sync}}\rvert + T \log_2 D$ bits per window, counted from the run's first window.
- **Ingress.** What arrival times can deliver into the spatial unit: $T \log_2(r_{\mathrm{in}} + 1)$ bits per transfer block, plus $T \log_2 D$ of jitter, on runs whose statuses are all complete. This is the unit the inference-only policy charges.

A rejected window carries no bound: it may already have carried the link's whole capacity, about $8TrB$ bits.

#### From the check to the bound

The theorem is about accepted runs of the model. Two more connect it to the check's code, with nothing assumed of SHA-512 or LMS, for a spatial unit of one link pair (one certifier, one egress and one ingress link): if the Lean check accepts and the certifier runs its code (`DeviceIntact`), every observation of the run is an accepted run of the model under the reported advice, or the run's own data holds a SHA-512 collision or a certificate the certifier never signed in this session (`AcceptedRunsAreProgramRuns`, `EncardAcceptedObservationsLe`). The bound in the model holds for any number of links sharing one sync; its connection to the code is proved only for one link pair so far. Because the signed message binds the challenger-generated session and the certifier refuses to start the same identifier twice, a certificate it never signed in that session is an LMS forgery.

### Parameters

| Charge, at $T = 600$, $16 \times 8$ sync values, $D = 1$ | Per window | Per day of 1,440 windows |
| --- | --- | --- |
| Egress, $A_c$ left out | 7 bits | 10,080 bits |
| Egress, with 8 capacity profiles fixed per audit (proposed) | 7 bits, plus 3 bits once | 10,083 bits |
| Ingress, at $r_{\mathrm{in}} = 34$ | 3,077.6 bits per transfer block | 4.4 Mbit per link |

The content advice is not yet reported: today the schedule is the workload manifest's arrival steps, which $A_c$ doesn't bound.

## Headroom

Without a certifier, a covert sender on an egress link can use the whole wire, $8TrB$ bits per window of $T$ buckets of $r$ frames of $B$ bytes. On a run the audit accepts, what it can carry is at most

$$
\underbrace{A_c + W \log_2 \lvert\Sigma_{\mathrm{sync}}\rvert + WT \log_2 D}_{\text{timing, over } W \text{ windows}} \;+\; \underbrace{b}_{\text{content}}
$$

The timing term is the certifier's [bound](/accounting/network#timing-bound), and the content term is the [content charge](/accounting/network#the-charge). The two are separate theorems over different models, added here as a budget, not as one statement. The headroom is the gap between the wire's capacity and this: at the deployed calibration, a link carries about $3.3 \times 10^{10}$ bits a window, of which an accepted run's timing can say 7.

## Physical assumptions

The bounds hold of the certifier's model. These are what make a real deployment an instance of it:

| Assumption | What it asks | Kind |
| --- | --- | --- |
| Coverage (W1) | Every uplink of the spatial unit passes through a certifier the auditor trusts, with its parameters fixed before the run and independent of the traffic. Nothing leaves the spatial unit another way. | Assumed: the auditor's placement, in the [onsite](/architecture#the-auditors-devices) protocol. Stated in Lean as the named premise `Accounting.Covered` (no uncertified boundary capacity); B4 at a covered location (`B4Covered`) drops the uncertified term. Claim id: `certifier-coverage`. |
| The device runs as built | The certifier executes its code, its key stays its own, and its host never restores an earlier copy of the state it keeps there. | Assumed: the trusted Nebius host (`DeviceIntact`). There is no attestation. |
| Regeneration (W2) | Everything the certifier puts on the wire, faults included, is a function of its record. No acknowledgement, backpressure, power consumption or other physical feature carries anything else. | Assumed. |
| Bounded jitter (J) | Each bucket's timing offset, as an outside receiver sees it, falls in one of $D$ classes. | Assumed at $D = 1$. The certifier faults on a tick more than 25 ms late; $D$ hasn't been measured. |
| Line rate | Each egress link sustains $8rB/\tau_b$ bits per second whatever the load. | Declared by the parameters, sized from honest traces. |

The certifier enforces its own rules in code (frames of $B$ bytes, left-packed rows, at most $r$ real frames a bucket, an untimed status, fail-closed faults), and they're proved of its Lean model. A violation of any assumption above is outside the bound: a side channel the record doesn't determine is a channel the audit doesn't see.

## Numbers

| Link, at the deployed calibration | Line rate | Accounted, accepted runs |
| --- | --- | --- |
| Egress, $r = 1{,}686$, $B = 4{,}096$, $\tau_b = 100$ ms | 552.5 Mbit/s | 7 bits per 60 s window, plus $A_c$ once |
| Ingress, $r_{\mathrm{in}} = 34$ | 11.1 Mbit/s | 3,077.6 bits per window |

The content advice $A_c$ is not yet reported, so today's runs leave it unbounded; with eight registered capacity profiles fixed per audit it would be 3 bits.

## Status

- **Proved:** the timing bounds, under W2 and J, for any number of links sharing one sync.
- **Proved, under the trusted host (`DeviceIntact`), for one link pair:** that an accepted run of the check's code is an accepted run of the model, or exhibits a SHA-512 collision or a certificate the certifier didn't sign in its challenger-generated session, which is an LMS forgery; and that an honest certifier's output passes. A spatial unit of several certifiers sharing a clock isn't stated yet.
- **Conditional:** the content bound, on the proof system's knowledge soundness and binding.
- **Open:** declaring the content advice; and proving the check in zero knowledge, which a stand-in verifier does in the clear today.
