This page covers:

- [The layers](#the-layers): what each layer establishes, and what it builds on.
- [How a run works](#how-a-run-works): the parties' messages in one remote run, and what onsite adds.
- [Composition](#composition): how subprotocols combine into a protocol, and how the verifier decides.

## The layers

Each layer has one job and states its own guarantee. Arrows point from a layer to what it builds on.

~~~mermaid
flowchart TB
  integ["Integrations<br/>vLLM"]
  proto["Protocols<br/>remote · onsite"]
  pol["Policies<br/>NCI"]
  ps["Proof systems<br/>sampling · zero knowledge · C-Flock"]
  subgraph accounting["Resource accounting"]
    acc["Bounds<br/>compute · memory · network"]
    decl["Declarations<br/>hardware · circuits"]
  end
  integ -->|"runs the developer's side"| proto
  proto -->|"composes"| acc
  proto -->|"composes"| ps
  pol -.->|"reads the certifiers"| proto
  acc -->|"reads integrity"| ps
  acc --> decl
  pol --> decl
  ps --> decl
~~~

| Layer | What it establishes |
| --- | --- |
| [Protocols](/docs/protocols) | The parties and their trust, the run, and the composed guarantee, for [remote](/docs/protocols/remote) and [onsite](/docs/protocols/onsite). |
| [Resource accounting](/docs/accounting) | What the developer declares: its [hardware](/docs/accounting/hardware), and its [circuits](/docs/accounting/circuits), what a computation is bit for bit, with gates and their widths, traces, the partition into proof units and the program format. Then bounds on the compute, memory and network a deployment used, against those declarations. Compute and network accounting read the integrity guarantee. |
| [Policies](/docs/policies/nci) | Conditions on the declared circuits themselves, checked from the circuits alone. |
| [Proof systems](/docs/proof-systems) | Integrity from a random sample of proof units ([sampling](/docs/proof-systems/sampling)), proofs that show the auditor only the public outputs ([zero knowledge](/docs/proof-systems/zero-knowledge)), and [C-Flock](/docs/proof-systems/c-flock), the construction that implements both, with the [commitments](/docs/proof-systems/commitments) and [coins](/docs/proof-systems/randomness) they share. |
| [Integrations](/docs/integrations/vllm) | Real serving systems, wrapped so that what they compute is a committed circuit. |

## How a run works

Both parties hold the circuit and its partition into proof units. On the developer's side are its *workers*, the servers and GPUs, behind a *ZK server* that is their only path to the auditor; on the auditor's, a *challenger* online and a *verifier* offline. One remote run goes like this:

~~~text
developer                                  auditor
workers behind the ZK server               challenger and verifier
----------------------------               -----------------------
                                 <-------  commit to the salts
commit the weights and inputs    ------->  record the commitment
                                 <-------  open the salt
serve, committing the trace at
the boundary gates               ------->  log a receipt
                                 <-------  draw proof units and tiles
prove the draws; the ZK server
releases outer proofs            ------->  the verifier checks them, and
                                           the composition decides
~~~

An onsite run is the same, with the devices working during serving: each network certifier passes its uplink's frames at a constant rate and certifies what crossed, and each memory challenger runs timed rounds against its node. What the devices record goes to the workers as witness and is proved like the rest.

The auditor never runs any part of the developer's computation. It only checks proofs, and the proofs are zero knowledge, so it learns nothing about the weights or data beyond each subprotocol's public outputs.

## Composition

A protocol is the product of its subprotocols, in the order of their identifiers: [remote](/docs/protocols/remote#composition) composes two and [onsite](/docs/protocols/onsite#composition) four. A subprotocol joins the product by stating four things:

| A subprotocol states | Description |
| --- | --- |
| What is committed | The values the workers commit while serving, before any coin is drawn. |
| Its sampling design | Which of its units are proved, drawn from the challenger's randomness. |
| Its check | The public circuit each drawn unit must pass. |
| Its public outputs | What the auditor may learn, such as a verdict or a bound, each with its reason. |

The product owns the rest: the commitments, the coins and the record, the draw, the proving and verifying. Its parameters are each subprotocol's parameters under its identifier, and its commitment binds theirs: the SHA-512 of the protocol's identifier, a zero byte, and the canonical JSON (RFC 8785) of the subprotocols' commitments in order. The verifier runs each subprotocol's check on its own part of the evidence, then decides, rejection first:

| The subprotocols' answers | The verdict |
| --- | --- |
| Any rejects, whatever the others answer | `reject` |
| The parts don't fit: a subprotocol unknown, missing, repeated or out of order, or a part under other parameters | `reject` |
| None rejects, and the commitment doesn't bind theirs | `reject` |
| None rejects, the commitment binds them, and some is undecided | `undecided` |
| Every one accepts, and the commitment binds them | `accept` |

Rejection dominates, so a prover can't hide one subprotocol's rejection by leaving another undecided.
