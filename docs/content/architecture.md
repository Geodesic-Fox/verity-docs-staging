Verity's components fall into three groups, and two protocols compose them. The [proof systems](/proof-systems/basic-proofs) prove that a committed computation was done correctly, and hide everything but the verdict and the public outputs. [Resource accounting](#resource-accounting) bounds the compute, memory and network a deployment used beyond what it registered. [Workload classification](/workload-classification/inference-vs-training) checks what the registered circuits compute, from their structure. The [remote](/protocols/remote) and [onsite](/protocols/onsite) protocols each compose a set of these into one accept.

## Physical architecture

Both parties hold the circuit and its partition into proof blocks. On the developer's side are its *workers*, the servers and GPUs, behind a *ZK server* that is their only path to the auditor; on the auditor's, a *challenger* online and a *verifier* offline.

The auditor never runs any part of the developer's computation. It only checks proofs, and the proofs are zero knowledge, so it learns nothing about the weights or data beyond each subprotocol's public outputs.

### The auditor's devices

The [onsite](/protocols/onsite) protocol adds devices of the auditor's at the developer's site, each on a machine the developer doesn't control. They sit where their guarantees need them:

- **A network certifier on every uplink of every node.** The machines behind the certifiers form a *spatial unit*, whose boundary they watch. Ingress links are certified the same way as egress.
- **A memory challenger beside each node's network certifier**, inside the node's isolation boundary, close enough that an answer's round trip fits within the deadline's allowance: the deadline plus allowance must stay at most 854 µs ([servers](/accounting/physical/servers#memory-assumptions)).
- **The challenger and the verifier stay with the auditor**, and the workers and the ZK server with the developer.

## Proof systems

Every subprotocol proves its claims through one stack of compilers over one argument: [basic proofs](/proof-systems/basic-proofs) with Flock, [sampling](/proof-systems/sampling) for a random sample of proof blocks, [zero-knowledge](/proof-systems/zero-knowledge) masking for the outer proofs, and [recursion](/proof-systems/recursion), which runs the plain proofs on commitments and proves in zero knowledge that they would have verified.

## Resource accounting

Resource accounting bounds how much of a deployment's compute, memory, memory bandwidth and network could have gone to something other than what the developer registered, its hardware and its circuits. Each resource has two layers. A cryptographic protocol secures a bound on the registered use: the work spent, the bits held, the bytes read, or, for the network, the most a run's traffic can say beyond its output. A physical layer then takes the hardware's capacity, from datasheets, measurements and named assumptions about the device, and the headroom is the difference: what the hardware could have done that the audit doesn't account for. The [remote](/protocols/remote) and [onsite](/protocols/onsite) protocols compose them, as [composition](#composition) describes.

| Resource | Cryptographic layer | Physical layer | Used by |
| --- | --- | --- | --- |
| Compute | [Proof of useful work](/accounting/pouw): the work spent after a salt | [Accelerators](/accounting/physical/accelerators#compute-headroom): the peak rate over the audit's window | Remote, Onsite |
| Memory | [Proof of useful space](/accounting/pous): the bits held at each challenge | [Accelerators](/accounting/physical/accelerators#memory-headroom) and [servers](/accounting/physical/servers#the-servers-whole-state): the device's memory and the server's whole state | Onsite |
| Memory bandwidth | [Proof of useful bandwidth](/accounting/poub): the reads of a registered store in each window | [Servers](/accounting/physical/servers#bandwidth-headroom): the node's read bandwidth over HBM and host DRAM | Onsite |
| Network | [Network certification](/accounting/network-certification) and sampling's [exfiltration bound](/proof-systems/sampling#exfiltration): the most a run can say beyond its output | [Datacenters](/accounting/physical/datacenters): the links' line rate | Onsite |

## Composition

Within a protocol, the accounting subprotocols share one run, its commitments, its coins and its [zero-knowledge](/proof-systems/recursion) outer proofs, and each joins it by stating what it commits, its sampling design, its check and its public outputs. Each lists its public outputs with the reason for each, and everything else stays hidden. The bounds that read [sampling](/proof-systems/sampling)'s integrity guarantee read one accept, by the rules of [reading integrity](/proof-systems/sampling#reading-integrity).

A protocol is the product of its subprotocols, in the order of their identifiers: its parameters, its commitment and its decision rule are the product's. [Remote](/protocols/remote#composition) composes two, as `verity/remote/v0`, and [onsite](/protocols/onsite#composition) four, as `verity/onsite/v0`.
