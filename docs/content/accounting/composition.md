Within a protocol, the accounting subprotocols share one run, its commitments, its coins and its [zero-knowledge](/proof-systems/zero-knowledge) outer proofs, and each joins it by stating what it commits, its sampling design, its check and its public outputs ([composition](/protocols/architecture#composition)). Each lists its public outputs with the reason for each, and everything else stays hidden. The bounds that read [sampling](/proof-systems/sampling)'s integrity guarantee read one accept, by the rules below.

## Reading integrity

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
