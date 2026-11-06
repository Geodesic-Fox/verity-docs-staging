The remote protocol checks a developer's serving from afar. The auditor places no hardware at the developer's site: it runs a challenger online and a verifier offline, and everything it learns arrives through the developer's ZK server as zero-knowledge proofs. The protocol composes two subprotocols, [sampling](/proof-systems/sampling) for integrity and [compute accounting](/accounting/compute) for work, and an accept means that both accepted: few proof blocks of the committed computation are incorrect, and the prover spent at least a stated share of the registered work after a salt it couldn't predict. With nothing at the site, it says nothing about what else the developer's machines stored or sent. The [onsite](/protocols/onsite) protocol adds the auditor's devices, and the two subprotocols that need them.

## Physical architecture

Both parties hold the circuit and its partition into proof blocks. On the developer's side are its *workers*, the servers and GPUs, behind a *ZK server* that is their only path to the auditor; on the auditor's, a *challenger* online and a *verifier* offline. One remote run goes like this:

~~~text
developer                                  auditor
workers behind the ZK server               challenger and verifier
----------------------------               -----------------------
                                 <-------  commit to the salts
commit the weights and inputs    ------->  record the commitment
                                 <-------  open the salt
serve, committing the trace at
the boundary gates               ------->  log a receipt
                                 <-------  sample proof blocks and tiles
prove the samples; the ZK server
releases outer proofs            ------->  the verifier checks them, and
                                           the composition decides
~~~


The auditor never runs any part of the developer's computation. It only checks proofs, and the proofs are zero knowledge, so it learns nothing about the weights or data beyond each subprotocol's public outputs.

## Interface

### Parties

| Party | Trusted by | Where it runs | What it does |
| --- | --- | --- | --- |
| Workers | Neither party | The developer's site | The developer's servers and GPUs. They serve, commit, and run nearly all of the proving, with zero knowledge off. |
| ZK server | The developer | The developer's site, on CPUs it controls | The workers' only path to the auditor. It salts, recomputes or masks every value that leaves, under its [contract](/proof-systems/zero-knowledge#the-contract), and releases outer proofs on a fixed schedule. |
| Challenger | The auditor | Online | Commits to every salt before the run and opens each once, answers each proof message with fresh coins, samples only after it has logged what it samples against, and keeps the record. It never sees the witness. |
| Verifier | The auditor | Offline | Checks the challenger's record with [Flock's verifier](/proof-systems/c-flock#verification-phase), written in Lean, and decides. |

In the subprotocols' statements the prover $\mathcal{P}$ is the workers behind the ZK server, and the verifier $\mathcal{V}$ is the challenger and the verifier together.

### Public parameters

| Parameter | Description |
| --- | --- |
| `program` | The circuit the workers serve, a program named by its digest. |
| `partition` | Its partition into proof blocks. |
| `designs` | Each subprotocol's [sampling design](/proof-systems/sampling#sampling-designs): integrity's over the program's proof blocks, and compute accounting's over its tiles. |
| `scheme` | Compute accounting's scheme, with the declared matrix multiplications, $\varepsilon_s$ and $\delta$ ([public parameters](/accounting/compute/useful#public-parameters)). |
| `v_pi` | The inner proofs' verifier as a circuit, $V_\Pi$, the statement of every outer proof ([zero knowledge](/proof-systems/zero-knowledge#public-parameters)). |
| `schedule` | The slots at which the ZK server releases outer proofs. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | Every subprotocol accepted, and the commitment binds theirs. |
| `reject` | Some subprotocol rejected, whatever the others answered, or the run doesn't fit the parameters ([Composition](#composition)). |
| `undecided` | No subprotocol rejected, but some subprotocol's evidence doesn't settle its question yet, such as a proof that hasn't arrived. It doesn't reject the developer. |

## Protocol

One serving window, then proving about it. Each line is run by the party beside it, and an arrow sends a value to another party. Click a function to see what it computes.

### Registration

Before serving, the challenger generates every salt the run opens and commits to them, so that none can be chosen after the developer's messages. The workers commit the registered inputs, the weights and a program's constants and tables, under hiding leaves. Whatever the workers send reaches the challenger only as the ZK server's commitment to it.

![Registration](/programs/remote#register)

### Serving

The challenger opens the salt, and the ZK server passes it on once it has checked it against the coin commitment. The workers serve: each declared matrix multiplication is computed as compute accounting's tiles, noised under the salt, and the product the workload uses comes out of them. They commit the trace at the boundary gates, and the challenger logs a receipt for the commitment before anything is sampled.

![Serving](/programs/remote#serve)

### Sampling

The challenger takes each subprotocol's sample from its own sampling design, with fresh randomness read after the receipt: proof blocks of the program for integrity, and tiles in proportion to their work for compute accounting. The sample is sent in the clear.

![Sampling](/programs/remote#sample)

### Proving

The workers prove the samples in two layers ([zero knowledge](/proof-systems/zero-knowledge#protocol)). The inner proofs run with zero knowledge off: each message reaches the challenger only as the ZK server's commitment to it, and the challenger answers each commitment with fresh coins. In the outer proofs, the workers prove that the committed messages make $V_\Pi$ accept at the coins sent. The outer proofs run in [Flock's zero-knowledge mode](/proof-systems/c-flock#zero-knowledge-mode), whose coins the challenger commits when each session opens. The ZK server checks every value of an outer proof against its contract before anything leaves, and releases each proof at its slot in the schedule.

![Proving](/programs/remote#prove)

### Verification

The verifier checks every outer proof against the challenger's record, each subprotocol answers, and the composition decides.

![Verification](/programs/remote#verify)

### Composition

The protocol is `verity/remote/v0`, the product of its two subprotocols, compute accounting and integrity, in the order of their identifiers. Its parameters, its commitment and its decision rule are the product's ([composition](/protocols/remote#physical-architecture)).

## Trusted base

Each guarantee rests on a different part of the system, and each party relies only on parts it trusts.

| Part | Trusted by | For | What it must do |
| --- | --- | --- | --- |
| Verifier | The auditor | Integrity and work | Accept only what the subprotocols' specifications accept. It is written in Lean, with one soundness theorem over everything it accepts ([Flock's verifier](/proof-systems/c-flock#verification-phase)). |
| $V_\Pi$ | The auditor | Integrity and work | Accept only inner transcripts the verifier accepts ([the verifier as a circuit](/proof-systems/c-flock#the-verifier-as-a-circuit)). |
| Challenger | The auditor | Integrity and work | Take its coins from its own fresh randomness, open each committed salt once, and sample only after logging the receipt. |
| ZK server | The developer | Zero knowledge | Follow its contract, keep its pads from the workers, and release only at the schedule's slots. |
| Workers | Neither party | Nothing | Integrity and work hold whatever they do, and so does zero knowledge, short of stopping sessions and choosing among accepting outputs ([what changes](/proof-systems/zero-knowledge#what-changes)). |

The workers are outside both parties' trusted base. Every GPU kernel, the serving engine and the inner prover can be wrong or malicious without weakening either party's guarantee; that they are correct is what lets an honest developer pass.

## Premises

Beyond its subprotocols' assumptions, the protocol rests on facts about the deployment that no proof covers:

- **The ZK server is the only path out.** Nothing the workers compute leaves the site except through the ZK server. It is a property of the developer's network, such as its isolation, and it is the developer's premise: zero knowledge needs it, and integrity and work don't.
- **The challenger's coins are its own.** Its randomness is uniform, and unseen by the developer until each coin is opened.
- **The declared hardware and an honest clock**, for compute accounting's [deadline form](/accounting/compute#headroom): how much the developer's hardware can compute between the salt and the deadline, and that nothing computed after the deadline is stamped as received by it.

No device of the auditor's watches the developer's site, so the protocol bounds neither the memory the developer used nor what crossed its network.

## Security

### Assumptions

Those of its subprotocols, [sampling](/proof-systems/sampling#assumptions) and [compute accounting](/accounting/compute/useful#assumptions), with [zero knowledge's](/proof-systems/zero-knowledge#assumptions) for the outer proofs.

### Completeness

An honest developer is accepted except with compute accounting's completeness error, $K \varepsilon_{\mathrm{cap}}$ for Pearl-C: sampling and both layers of proof accept an honest prover always.

### Integrity and work

An accept is an accept of both subprotocols, so its guarantee is the conjunction of theirs. Let $E_I$ be the event that the program's incorrect set lies outside the [confidence set](/proof-systems/sampling#integrity), $B^\star \notin \mathcal{M}_\delta$, and $E_W$ the event that the prover spent less than the certified work after the salt, $T < (1-\gamma)(1-\varepsilon_s)\,W$ ([compute accounting](/accounting/compute/useful#work-bound)). For every prover,

$$
\Pr\big[\mathsf{accept} \,\wedge\, (E_I \vee E_W)\big] \;\le\; \varepsilon_I + \varepsilon_W + \varepsilon_{\mathrm{outer}}
$$

| Term | Whose | Value |
| --- | --- | --- |
| $\varepsilon_I$ | Integrity's | $\delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$, over the program's sample |
| $\varepsilon_W$ | Compute accounting's | $(1-\varepsilon_s)^K + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}} + \eta(q, N)$, over the tiles' sample, with its own audit's $\varepsilon_{\mathrm{ks}}$ and $\varepsilon_{\mathrm{bind}}$ |
| $\varepsilon_{\mathrm{outer}}$ | The outer proofs' | $\varepsilon_{\mathrm{ks}} + \sum_i \varepsilon_{\mathrm{bind},i}$, the outer argument's knowledge soundness and the binding of the ZK server's commitments ([soundness](/proof-systems/zero-knowledge#theorem)) |

~~~proof pending
When the outer proofs are accepted, their extractor recovers openings of the ZK server's commitments that form inner transcripts Flock's verifier accepts, each message fixed before its round's coins, except with probability $\varepsilon_{\mathrm{outer}}$. So the workers behind the ZK server are a prover for each subprotocol, and each subprotocol's guarantee bounds its own event: $E_I$ by $\varepsilon_I$ ([integrity](/proof-systems/sampling#integrity)) and $E_W$ by $\varepsilon_W$ (compute accounting's composed bound). A union bound over the two events gives the sum. The two subprotocols take separate samples, so their terms add.
~~~

### Zero knowledge

For every auditor, however it behaves, its view of a run is simulated from the public parameters and the [public outputs](#public-outputs), within $\varepsilon_{\mathrm{hide}} + \varepsilon_{\mathrm{zk}}$ for each outer proof ([zero knowledge](/proof-systems/zero-knowledge#theorem)), except for what the workers carry by stopping sessions and by choosing among accepting outputs, which [the deployment](/proof-systems/zero-knowledge#zero-knowledge-deployed) bounds in bits.

~~~proof pending
Each outer proof's view is simulated by zero knowledge's simulator, which reads only the public parameters and the public outputs. The outer proofs go one after another to the same auditor, and composing their simulators across those sessions is open, as is the bound on what stops and output freedom carry.
~~~

## Public outputs

With an accept, the protocol makes public each subprotocol's public outputs and keeps each one's profile, both under the subprotocol's identifier. With a reject or an undecided, nothing is public but the verdict and its reason.

| Subprotocol | Its public outputs | Why they are public |
| --- | --- | --- |
| Integrity | The verdict, and the integrity profile: what was audited, the sampling design, how many proof blocks were sampled, and the error terms | The [bound on incorrect proof blocks](/proof-systems/sampling#integrity) is read from the profile, at any $\delta$. |
| Compute accounting | `verdict`, `work`, `check`, `sampling`, `drawn` and `root_W` | Each with its reason, in [its table](/accounting/compute/useful#public-outputs). |

Every weight, activation, tile value and inner message stays hidden.

## Overhead

Serving pays compute accounting's noised tiles and the commitments at the boundary gates. Proving is the inner proofs of the two samples, whose size is fixed by the sampling designs rather than by the workload, and the outer proofs over $V_\Pi$ (recursion's benchmarks).
