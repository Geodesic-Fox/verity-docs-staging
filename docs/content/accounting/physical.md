Each of Verity's resource protocols certifies one side of a bound: [proof of useful work](/accounting/pouw) a lower bound on the registered work, [proof of useful space](/accounting/pous) on the state held, [proof of useful bandwidth](/accounting/poub) on the reads made, and [network certification](/accounting/network-certification), with sampling's [exfiltration bound](/proof-systems/sampling#exfiltration), an upper bound on what a run's traffic can say. Physical modeling takes the other side: an upper bound on what the hardware can do, from its datasheet, its measurements and named assumptions. The headroom is the difference, what could have gone to something other than what the developer registered.

| Resource | Certified | Capacity | Modeled on |
| --- | --- | --- | --- |
| Compute | $W_{\mathrm{cert}}$, the work after a salt | The peak rate $F$ over the audit's window | [Accelerators](/accounting/physical/accelerators#compute-headroom) |
| Memory | More than $S_{\mathrm{cert}}$ bits held | The device's memory $M$, and the server's whole state | [Accelerators](/accounting/physical/accelerators#memory-headroom), [servers](/accounting/physical/servers#the-servers-whole-state) |
| Memory bandwidth | $(1 - \gamma) R \Sigma$ credited reads | The node's read capacity $R$ over the session | [Servers](/accounting/physical/servers#bandwidth-headroom) |
| Network | What a run's timing and content can say | The links' line rate | [Datacenters](/accounting/physical/datacenters) |

Each headroom splits in two: honest overhead, what the registered use leaves unused even when run honestly, and soundness slack, what the bound concedes to a cheating prover. Shrinking the first is engineering; shrinking the second is cryptography. The [remote](/protocols/remote) protocol accounts for compute, and the [onsite](/protocols/onsite) protocol for all four.
