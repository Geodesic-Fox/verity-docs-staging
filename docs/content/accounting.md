Resource accounting bounds how much of a deployment's compute, memory, memory bandwidth and network could have gone to something other than what the developer declared, its hardware and its circuits. Each resource has two layers. A cryptographic protocol secures a bound on the declared use: the work spent, the bits held, the bytes read, or, for the network, the most a run's traffic can say beyond its output. A physical layer then takes the hardware's capacity, from datasheets, measurements and named assumptions about the device, and the headroom is the difference: what the hardware could have done that the audit doesn't account for. The [remote](/protocols/remote) and [onsite](/protocols/onsite) protocols compose them, and [composition](/accounting#composition) says how the bounds that read [sampling](/proof-systems/sampling)'s integrity guarantee share one accept.

| Page | Cryptographic layer | Physical layer | Used by |
| --- | --- | --- | --- |
| [Compute](/accounting/compute) | [Proof of useful work](/accounting/compute/useful): the work spent after a salt | The device's peak rate over the audit's window | Remote, Onsite |
| [Memory](/accounting/memory) | [Proof of useful space](/accounting/memory/useful): the bits held at each challenge | The device's memory | Onsite |
| Memory bandwidth | Bandwidth audit: the bytes read from device memory in a window | The memory interface's peak bandwidth | Proposed |
| [Network](/accounting/network) | [Network certifier](/accounting/network/certification) and [content bound](/accounting/network#content-bound): the most a run can say beyond its output | The links' line rate | Onsite |

## Composition

Within a protocol, the accounting subprotocols share one run, its commitments, its coins and its [zero-knowledge](/proof-systems/zero-knowledge) outer proofs, and each joins it by stating what it commits, its sampling design, its check and its public outputs ([composition](/protocols/remote#physical-architecture)). Each lists its public outputs with the reason for each, and everything else stays hidden. The bounds that read [sampling](/proof-systems/sampling)'s integrity guarantee read one accept, by the rules below.

### Reading integrity

An accept doesn't say which proof units are faulty. [Sampling](/proof-systems/sampling#integrity) gives a *confidence set* $\mathcal{M}_\delta$, the candidate sets of faulty units that the sample misses with probability more than $\delta$, computed from the sampling design alone, and an accept means the faulty set $B^\star$ is in it, except with probability at most $\delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$. A consumer charges each unit $u$ a nonnegative quantity $y_u$, such as its work or its output bits, and reads the accept by one of two rules:

- **A total.** An upper confidence bound on the faulty units' total is the largest total of any set in the confidence set:

$$
\Pr\Big[\mathsf{accept} \,\wedge\, \sum_{u \in B^\star} y_u > \max_{B \in \mathcal{M}_\delta} \sum_{u \in B} y_u\Big] \;\le\; \delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}
$$

- **Exfiltration.** A bound on what faulty units can deliver counts every output value that some set in $\mathcal{M}_\delta$ could deliver, since an accept doesn't say which set it was: the largest total of the sets' output bits, plus the bits that name the set.

| Consumer | $y_u$ | Rule |
| --- | --- | --- |
| Compute accounting | The unit's work | A total |
| Network accounting | The unit's output bits | Exfiltration |

The confidence sets shrink as $\delta$ grows, so consumers that read one accept at levels $\delta_i$ fail together with probability at most $\max_i \delta_i + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$: an application that composes several of them pays the error once. Network accounting's content bound reads the same accept as integrity, the audit of the served program; compute accounting reads an accept of its own, over its tiles, so its terms add ([remote](/protocols/remote#integrity-and-work)).
