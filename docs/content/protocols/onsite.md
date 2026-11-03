The onsite protocol is the [remote](/protocols/remote) protocol with the auditor's devices at the developer's site: a network certifier on every uplink, and a memory challenger beside each one. The devices let it account for the two resources that remote can't see. It composes four subprotocols: [sampling](/proof-systems/sampling) for integrity, [compute accounting](/accounting/compute) for work, [memory accounting](/accounting/memory) for space and [network accounting](/accounting/network) for communication. An accept means that all four accepted: few proof units of the committed computation are faulty, the prover spent at least a stated share of the declared work, each node held an encoding of the committed weights when challenged, and what left each node can carry only a bounded amount beyond the committed computation's output, in its content and in its timing.

## Interface

### Parties

The remote protocol's parties, and two devices of the auditor's:

| Party | Trusted by | Where it runs | What it does |
| --- | --- | --- | --- |
| Workers | Neither party | The developer's site | The developer's servers and GPUs. They serve, commit, answer the memory challenger, and run nearly all of the proving, with zero knowledge off. |
| ZK server | The developer | The developer's site, on CPUs it controls | The workers' only path to the auditor. It salts, recomputes or masks every value that leaves, under its [contract](/proof-systems/zero-knowledge#the-contract), and releases outer proofs on a fixed schedule. |
| Network certifier | The auditor | On each uplink of each node | Releases the node's traffic at a constant rate on a fixed grid, and attests what crossed the link in network certificates. |
| Memory challenger | The auditor | Beside each node's network certifier, inside its isolation boundary | Runs memory accounting's timed rounds on its own clock, and signs each session. |
| Challenger | The auditor | Online | Commits to every salt before the run and opens each once, answers each proof message with fresh coins, draws only after it has logged what it draws against, and keeps the record. It never sees the witness. |
| Verifier | The auditor | Offline | Checks the challenger's record and the memory challengers' openings with [C-Flock's verifier](/proof-systems/c-flock#verification-phase), written in Lean, and decides. |

The devices are the auditor's and the developer doesn't trust them, so what they record of the developer's traffic and memory never reaches the auditor in the clear. Certificates and signed sessions go to the workers as witness, and the developer proves in zero knowledge that they pass their checks.

### Public parameters

The remote protocol's [parameters](/protocols/remote#public-parameters), and the devices' subprotocols' own:

| Parameter | Description |
| --- | --- |
| `grid` | Network accounting's buckets, rates, frame size and sync values, fixed before the run ([public parameters](/accounting/network/certifier#public-parameters)). |
| `encoding` | Memory accounting's scheme, its $k$ challenges and each answer's deadline ([public parameters](/accounting/memory/pous#public-parameters)). |

### Outputs

The remote protocol's: `accept` when every subprotocol accepts and the commitment binds theirs, `reject` when any rejects or the run doesn't fit the parameters, and `undecided` otherwise ([outputs](/protocols/remote#outputs)).

## Protocol

The remote protocol's run, with the devices' steps added. Each line is run by the party beside it, and an arrow sends a value to another party. Click a function to see what it computes.

### Registration

As in remote, the challenger commits to every coin and the workers commit the registered inputs through the ZK server. Each memory challenger commits its block indices in a coin tree drawn from its own secret, never from a public source, so that a node can't compute the challenged blocks in advance. Once the weights' commitment is recorded, the challenger opens the encoding's salt, and the workers encode the weights and commit the encoding.

![Registration](/programs/onsite#register)

### Serving

The workers serve from the encoding, decoding each tensor on every use. Every frame a node sends or receives passes its network certifier, which releases it at its bucket on the grid and signs each link-window's record. Interleaved with serving, the memory challenger reveals its indices one at a time, each answer due within the deadline, and signs the session's round records once it closes. The workers commit the certificates and the signed sessions with the trace, as witness.

![Serving](/programs/onsite#serve)

### Sampling and proving

As in remote ([sampling](/protocols/remote#sampling), [proving](/protocols/remote#proving)). The inner statements also say that each certificate passes network accounting's check and that its frames are the delivered values of the committed circuit, and that each signed session passes memory accounting's.

### Verification

Each memory challenger opens every index it committed, the verifier checks every outer proof against the challenger's record and those openings, and the composition decides by the product's [rule](/protocols/architecture#composition).

![Verification](/programs/onsite#verify)

### Composition

The protocol is `verity/onsite/v0`, the product of its four subprotocols in the order of their identifiers: network accounting's certifier, memory accounting, compute accounting and integrity. Its parameters, its commitment and its decision rule are the product's ([composition](/protocols/architecture#composition)), over four subprotocols instead of two. Remote's subprotocols alone are not an onsite run: one that lacks the certifier's or memory accounting's part is rejected.

## Placement

The devices sit where their guarantees need them:

- **A network certifier on every uplink of every node.** The machines behind the certifiers form a *spatial unit*, whose boundary they watch. Ingress links are certified the same way as egress.
- **A memory challenger beside each node's network certifier**, inside the node's isolation boundary, close enough that an answer's round trip fits within the deadline's allowance: the deadline plus allowance must stay at most 854 µs ([memory accounting](/accounting/memory#physical-assumptions)).
- **The challenger and the verifier stay with the auditor**, and the workers and the ZK server with the developer, as in remote.

## Trusted base

The remote protocol's [trusted base](/protocols/remote#trusted-base), and the devices:

| Part | Trusted by | For | What it must do |
| --- | --- | --- | --- |
| Network certifier | The auditor | Communication | Release every frame by its rule, regenerate its link from its record alone, record one untimed status per link-window, and fail closed ([the certifier](/accounting/network/certifier#protocol)). |
| Memory challenger | The auditor | Space | Keep its indices secret until it reveals each one, time each answer on its own clock, and refuse an audit its guarantee doesn't cover ([the memory challenger](/accounting/memory/pous#challenge)). |

Neither device is in the developer's trusted base: zero knowledge holds whatever they do, since nothing they record reaches the auditor except through the ZK server's outer proofs.

## Premises

The remote protocol's [premises](/protocols/remote#premises), and premises about the hardware at the site:

| Premise | What it asks | For |
| --- | --- | --- |
| Every uplink is certified | Every uplink of every node passes through a certifier the auditor trusts, with its parameters fixed before the run and independent of the traffic. | Communication |
| Regeneration | Everything a certifier puts on the wire, faults included, is a function of its record; no acknowledgement, backpressure or physical feature passes any other way. | Communication, egress timing |
| Bounded jitter | Each bucket's timing offset falls in one of $D$ classes. | Communication, timing |
| Isolation during an audit | During a memory audit the node gets no outside help, so its state is all it holds. | Space |
| The step floor | No call of the encoding's permutation completes in under 241.5 µs on a CPU or GPU core. Custom hardware is outside it. | Space |
| Trusted hosts | Each device runs its stated code on the host it is deployed to. Nothing attests this, since no attestation hardware stands behind the device: it is trust in whoever runs the host. | Space and communication |
| The devices' keys | No one but a device can produce a signature that verifies under its key. | Space and communication |

## Security

### Assumptions

Those of its subprotocols, [sampling](/proof-systems/sampling#assumptions), [compute](/accounting/compute/pouw#assumptions), [memory](/accounting/memory/pous#assumptions) and [network](/accounting/network/certifier#assumptions) accounting, with [zero knowledge's](/proof-systems/zero-knowledge#assumptions) for the outer proofs.

### Completeness

An honest developer is accepted except with its subprotocols' completeness errors: compute accounting's ($K \varepsilon_{\mathrm{cap}}$ for Pearl-C), and network accounting's calibration, which sizes the rates and sync values so that an honest node misses at most $10^{-4}$ of its windows ([completeness](/accounting/network/certifier#completeness)). Sampling, memory accounting's timed rounds within their calibrated deadline, and both layers of proof accept an honest prover always.

### The composed guarantee

An accept is an accept of all four subprotocols, so its guarantee is the conjunction of theirs:

| Subprotocol | What an accept means | Error |
| --- | --- | --- |
| Integrity | The program's faulty set lies in the confidence set, $B^\star \in \mathcal{M}_\delta$ ([integrity](/proof-systems/sampling#integrity)). | $\varepsilon_I = \delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$ |
| Work | The prover spent at least $(1-\gamma)(1-\varepsilon_s)\,W$ after the salt ([compute accounting](/accounting/compute/pouw#work-bound)). | $\varepsilon_W$, as in [remote](/protocols/remote#integrity-and-work) |
| Space | Each node's state held at least $\lfloor \rho \lvert C\rvert \rfloor$ bits when challenged ([memory accounting](/accounting/memory/pous#space-bound)). | $\varepsilon_M = \delta_{\mathrm{mem}} + \varepsilon_{\mathrm{mem}}$, memory accounting's $\delta$ and $\varepsilon$ |
| Communication, timing | A covert sender carries at most $A_c + \min(W, m)\log_2\lvert\Sigma_{\mathrm{sync}}\rvert + n \log_2 D$ bits out through when frames leave ([network certifier](/accounting/network/certifier#timing-bound)). | None: it holds on every accepted run |
| Communication, content | A receiver of the delivered values recovers an $L$-bit message with probability at most $2^{b-L}$, beyond the error ([content bound](/accounting/network/content#guarantee)). | $\varepsilon_I + \delta_{\mathrm{in}}$, integrity's error shared |

Let $E_I$, $E_W$ and $E_M$ be the events that integrity's, work's and space's conclusions fail. For every prover,

$$
\Pr\big[\mathsf{accept} \,\wedge\, (E_I \vee E_W \vee E_M)\big] \;\le\; \varepsilon_I + \varepsilon_W + \varepsilon_M + \varepsilon_{\mathrm{outer}}
$$

with $\varepsilon_{\mathrm{outer}}$ the outer proofs' term, as in [remote](/protocols/remote#integrity-and-work). The content bound reads the same accept as integrity, so its $\delta + \varepsilon_{\mathrm{ks}} + \varepsilon_{\mathrm{bind}}$ is integrity's error and an application that reads both pays it once: a receiver recovers an $L$-bit message from an accepted run with probability at most $2^{b-L} + \varepsilon_I + \delta_{\mathrm{in}} + \varepsilon_{\mathrm{outer}}$.

~~~proof pending
As in remote: when the outer proofs are accepted, their extractor recovers inner transcripts that C-Flock's verifier accepts, except with probability $\varepsilon_{\mathrm{outer}}$, so the workers behind the ZK server are a prover for each subprotocol and each subprotocol's guarantee bounds its own event. A union bound over the events gives the sum. Integrity, work and space draw separate samples, so their terms add; the content bound is a reading of integrity's accept by [accounting's exfiltration rule](/accounting/composition#reading-integrity), so it adds no sample of its own. The timing bound counts the secrets an accepted run can carry, and adds no probability.
~~~

### Zero knowledge

As in [remote](/protocols/remote#zero-knowledge): the auditor's view is simulated from the public parameters and the public outputs, except for what stops and output freedom carry. The devices add nothing to the view, since their certificates and signed sessions are witness, and the memory challengers' openings are the auditor's own coins.

## Public outputs

With an accept, each subprotocol's public outputs and profile under its identifier; with a reject or an undecided, nothing but the verdict and its reason.

| Subprotocol | Its public outputs | Why they are public |
| --- | --- | --- |
| Integrity and compute accounting | As in [remote](/protocols/remote#public-outputs) | As there. |
| Memory accounting | `verdict`, `root_W`, `root_C`, `salt` and `coins` | Each with its reason, in [its table](/accounting/memory/pous#outputs). |
| Network accounting | `verdict` and `charge` | Each with its reason, in [its table](/accounting/network/certifier#outputs). |

Every certificate, record, occupancy, signed session and on-time bit stays hidden.

## Inference-only

The composition establishes faithfulness: the committed values are what the circuits compute, and the compute, memory and network the developer used are the ones its records account for. Inference-only is [NCI](/policies/nci)'s policy, checked over the declared circuit from its structure alone. It reads the onsite protocol's network certifiers: each isolation unit's read cap is charged the covert ingress capacity since its node's last memory wipe, which the certifiers' ingress bound counts. NCI is not one of the composition's subprotocols, so the onsite verdict doesn't include its verdict.

## Overhead

The remote protocol's [overhead](/protocols/remote#overhead), and the devices': every link carries its full rate of frames in every bucket whatever its load, and a frame waits in the certifier's queue until its bucket ([network accounting](/accounting/network#numbers)); the node serves from the encoding, at most twice the cost of the plaintext matrix multiplications, and answers $k = 105$ timed reads per memory audit ([memory accounting](/accounting/memory#numbers)).
