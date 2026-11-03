A protocol says who the parties are, what each one trusts, how a run goes and what an accept means. Verity has two, and they differ in one thing: whether the auditor has hardware at the developer's site.

| Protocol | The auditor's hardware at the site | Subprotocols it composes |
| --- | --- | --- |
| [Remote](/protocols/remote) | None | [Sampling](/proof-systems/sampling) for integrity, [compute accounting](/accounting/compute) for work |
| [Onsite](/protocols/onsite) | A network certifier on every uplink, and a memory challenger beside each one | Remote's two, with [memory accounting](/accounting/memory) for space and [network accounting](/accounting/network) for communication |

A remote accept means that few proof units of the committed computation are faulty, and that the prover spent at least a stated share of the declared work. With nothing at the site, it says nothing about what else the developer's machines stored or sent. The onsite protocol's devices let it account for those two resources as well, and its accept is faithfulness as Verity states it: the committed values are what the circuits compute, and the compute, memory and network the developer used are the ones its records account for.

Inference-only is [novel communication intensity](/policies/nci) (NCI), a policy on the declared circuits, checked from their structure alone. It is checked beside the onsite protocol rather than inside it, and reads the bound its network certifiers put on what flows into each node. Faithfulness is what ties the declared circuits to what actually ran.

[Architecture](/protocols/architecture) shows the layers both protocols are built from, how a run goes, and how subprotocols compose.
