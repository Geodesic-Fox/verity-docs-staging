This protocol runs a public-coin subprotocol $\Pi$ so that the verifier learns only whether $\Pi$'s verifier would accept, together with $\Pi$'s public outputs. $\Pi$ runs unmodified: its messages travel as commitments, and the verifier checks a zero-knowledge proof that $\Pi$'s verifier would accept them.

This page covers:

- [Interface](#interface): the parties, the public parameters, the prover's private input and the outputs.
- [Protocol](#protocol): the inner phase, which runs $\Pi$ on commitments, and the outer phase, which proves that $\Pi$'s verifier would accept.
- [Security](#security): the assumptions, the theorem, and what the verifier learns.
- [Private circuit](#private-circuit): a variant that also hides the circuit.
- [Deployment](#deployment): a deployment in which zero knowledge rests on a small ZK server.

## Interface

### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Prover | $P$ | Runs $\Pi$'s prover $P_\Pi$, any program, as a black box, and proves the outer statement. |
| Verifier | $V$ | Would like to know whether $\Pi$'s verifier would accept, and $\Pi$'s public outputs, and nothing else. |

Throughout, $P^*$ is any prover and $V^*$ any verifier, however it behaves.

### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `x` | $x$ | The statement $\Pi$ proves. |
| `V_pi` | $V_\Pi$ | $\Pi$'s verifier as a circuit: $V_\Pi(x, m, c) = (b, o)$, its verdict $b$ and its public outputs $o$ on the statement, the messages $m$ and the coins $c$. |
| `Com` | $\mathsf{Com}$ | A commitment scheme: $\mathsf{Com}(m; s)$ commits to a message $m$ under a salt $s$. |
| `Arg` | $\mathsf{Arg} = (P_{\mathsf{Arg}}, V_{\mathsf{Arg}})$ | A [commit-and-prove argument](/docs/proof-systems#methods) for the outer relation $R_{\mathrm{out}}$ below. |

$\Pi = (P_\Pi, V_\Pi)$ must be public-coin: each of its verifier's messages is fresh uniform coins, so its verifier is the function $V_\Pi$. Its number of rounds $r$ and the length of each message must be fixed by $x$.

### Private input

| Input | Symbol | Description |
| --- | --- | --- |
| `w` | $w$ | $\Pi$'s witness. |

### Outputs

| Value | Description |
| --- | --- |
| `accept, o` | The outer proof verified, and $o$ is $\Pi$'s public outputs. |
| `reject` | Otherwise. |

## Protocol

Each line is run by the party beside it, and an arrow sends a value to the other party, who holds it under the same name. Click a function to see what it computes.

### Inner phase

Each round, the prover runs $P_\Pi$ for its next message $m_i$, commits to it under a fresh salt $s_i$, and sends only the commitment $h_i$. The verifier answers with fresh coins $c_i$, as it would the message itself: $\Pi$ is public-coin, so its coins never depend on what a message says.

![Inner phase](/programs/recursion#inner)

### Outer phase

The prover computes $V_\Pi(x, m, c) = (1, o)$ and sends $o$. Both sides build the outer statement from their own copies, the prover proves it in zero knowledge, and the verifier accepts if the proof verifies, and outputs $o$. The outer relation is

$$
R_{\mathrm{out}}(x, h, c, o):\quad \exists\, (m_i, s_i)_{i=1}^{r}.\ \ \mathsf{Com}(m_i; s_i) = h_i \ \ \forall i \;\;\wedge\;\; V_\Pi(x, m, c) = (1, o)
$$

Its witness is the openings, never $w$: $V_\Pi$ checks a transcript, not the computation behind it.

![Outer phase](/programs/recursion#outer,verify)

## Security

### Assumptions

The protocol assumes the following of its components only.

- **$\mathsf{Com}$ is hiding**, with error $\varepsilon_{\mathrm{hide}}$ over all the commitments a run sends: commitments to two sequences of messages of the same lengths are within $\varepsilon_{\mathrm{hide}}$, even when each message is chosen after the earlier commitments.
- **$\mathsf{Com}$ is binding, in fork form.** Across two runs that agree up to round $i$'s commitment and then fork, a prover that opens it two ways yields a collision of the hash that computes it. This has probability at most $\varepsilon_{\mathrm{bind},i}$, which carries a square-root loss from the fork: a hash whose collision probability at the prover's query budget is $\varepsilon_{\mathrm{cr}}$ enters as about $\sqrt{\varepsilon_{\mathrm{cr}}}$.
- **$\mathsf{Arg}$** is complete, knowledge sound with error $\varepsilon_{\mathrm{ks}}$, and zero knowledge against malicious verifiers with error $\varepsilon_{\mathrm{zk}}$: for every $V^*$, a simulator that reads only the statement is within $\varepsilon_{\mathrm{zk}}$ of $V^*$'s view.
- **$\Pi$** is complete and sound with error $\varepsilon_\Pi$: for every prover, $V_\Pi$ outputs $(1, o)$ on a false claim, $(x, o) \notin L$, with probability at most $\varepsilon_\Pi$.
- **Fresh randomness.** The salts and $P_{\mathsf{Arg}}$'s randomness are uniform, and the verifier's coins are uniform and unseen until sent.

$\mathsf{Arg}$'s zero knowledge has to hold however $V^*$ picks its coins. A construction that has it for each fixed sequence of coins, as a VEIL-style one does, gets it from a commitment to its coins and Goldreich–Kahan rewinding, which belong to the construction: C-Flock's are on [its page](/docs/proof-systems/c-flock#zero-knowledge-mode).

### Theorem

For every public-coin $\Pi = (P_\Pi, V_\Pi)$ whose rounds and message lengths are fixed by $x$, under the assumptions above, $(P, V)$ is:

1. **Complete.** On every $(x, w)$ where $P_\Pi$ is accepted with outputs $o$, $V$ outputs $(\mathsf{accept}, o)$.
2. **Sound.** For every $P^*$,
$$
\Pr\big[V \text{ outputs } (\mathsf{accept}, o) \,\wedge\, (x, o) \notin L\big] \;\le\; \varepsilon_\Pi + \varepsilon_{\mathrm{ks}} + \sum_{i=1}^{r} \varepsilon_{\mathrm{bind},i}
$$
3. **Zero knowledge.** For every $V^*$ there is a simulator $\mathcal{S}$, which reads $x$ and asks once for the outputs $o(c)$ at the coins $c$ that $V^*$ sends, such that
$$
\mathrm{View}_{V^*}\big(P(x, w) \leftrightarrow V^*\big) \;\approx_{\varepsilon_{\mathrm{hide}} + \varepsilon_{\mathrm{zk}}}\; \mathcal{S}^{V^*,\, o(\cdot)}(x)
$$

The simulator gets $o$ only at the coins $V^*$ chose, since $V^*$ chooses its coins after seeing the commitments, and $o$ may depend on them.

~~~proof pending
**Completeness.** $P_\Pi$'s messages make $V_\Pi$ output $(1, o)$, so the openings satisfy $R_{\mathrm{out}}(x, h, c, o)$, and $\mathsf{Arg}$'s completeness makes $V_{\mathsf{Arg}}$ accept.

**Soundness.** When $V_{\mathsf{Arg}}$ accepts, its extractor recovers openings $(m_i, s_i)$ with $V_\Pi(x, m, c) = (1, o)$, except with probability $\varepsilon_{\mathrm{ks}}$. Each $m_i$ is fixed before $c_i$: forking the run just after $h_i$ and extracting again gives the same opening, unless the prover has opened $h_i$ two ways, which costs $\varepsilon_{\mathrm{bind},i}$. So committing and later opening makes a prover for $\Pi$ whose round-$i$ message precedes $c_i$, and $\Pi$'s soundness bounds a false claim by $\varepsilon_\Pi$.

Lean proves soundness for C-Flock's instance, with the faithfulness of its verifier circuit as a named assumption ([C-Flock](/docs/proof-systems/c-flock#the-verifier-as-a-circuit)); the statement over abstract components isn't in Lean yet.
~~~

~~~python
def simulate(V_star, x, outputs):   # reads no message, salt or witness
    h, c = [], []
    for i in range(rounds(x)):
        h.append(Com(zeros(length(x, i)), random()))
        c.append(V_star.answer(h[i]))
    o = outputs(c)                  # the one query
    return S_arg(V_star, R_out(x, h, c, o))
~~~

~~~proof pending
Two hybrids. First, replace $V^*$'s view of the outer proof with $\mathsf{Arg}$'s simulator for $V^*$ on $R_{\mathrm{out}}(x, h, c, o)$; the outer witness, which holds every message and salt, is no longer read, at a cost of $\varepsilon_{\mathrm{zk}}$. Second, replace each commitment with a commitment to zeros of the message's length, which $x$ fixes. $V^*$ picks each $c_i$ after seeing $h_1, \ldots, h_i$, so each message may depend on earlier commitments, and hiding covers that, at a cost of $\varepsilon_{\mathrm{hide}}$ over all of them. What remains reads $x$ and $o(c)$ only, and it is `simulate`.

Lean proves this for C-Flock's commitments when the verifier's coins are fixed before the first commitment and there are no public outputs ([C-Flock](/docs/proof-systems/c-flock#the-verifier-as-a-circuit)). The statement here, with coins chosen after each commitment and the outputs in the outer statement, isn't in Lean yet.
~~~

### What's revealed

The verifier learns $x$ and $o$, by design. A public output is still a fact about the private values: a verdict is one bit, many verdicts over inputs a verifier chooses would make it an oracle for the model, and $V^*$ sees $o$ at coins of its own choosing. So each protocol that runs this one lists its public outputs with a reason for each, and anything not on its list stays hidden.

For a public circuit, $x = (C, U, \mathcal{D})$: the [circuit](/docs/accounting/circuits#the-circuit-model), its [partition](/docs/accounting/circuits#partitions) into proof units and the [sampling design](/docs/proof-systems/sampling). The trace stays hidden, every inner message and opening and so every unit's inputs and outputs, but which units were proved doesn't: the verifier draws them with its own coins. The [remote](/docs/protocols/remote) and [onsite](/docs/protocols/onsite) protocols run in this setting.

## Private circuit

To hide the circuit as well, the prover commits to $x$ and moves it into the outer witness. The lines that change are the unfaded ones:

![Zero knowledge, private circuit](/programs/recursion-private)

- **Registration.** Before the inner phase the prover sends $h_x = \mathsf{Com}(\mathrm{pad}(x, \mathit{cls}); s_x)$. The class $\mathit{cls}$ is public: bounds that every admissible statement meets, such as its number of proof units and the [width rule](/docs/accounting/circuits#partitions) $X$ on their outputs. $x$ is padded to the class's full size, so the commitment's length says nothing about it.
- **$x$ moves into the witness.** The outer relation adds two clauses: $x$ opens $h_x$, and $x \in \mathit{cls}$.
- **Shapes read only the class.** $\Pi$'s rounds, its message lengths and the sampling design are functions of $\mathit{cls}$, so neither the commitments nor the draw depend on $x$, and $V_\Pi$ is one circuit for the whole class that reads $x$ as data.

### Circuit privacy

Any two statements $x, x'$ of one class with the same public outputs give the verifier views within $2(\varepsilon_{\mathrm{hide}} + \varepsilon_{\mathrm{zk}})$, with $\varepsilon_{\mathrm{hide}}$ now counting $h_x$ too.

~~~proof abstract
In simulation form: the simulator registers a dummy statement of the class and runs the session's zero-knowledge simulator on it, reading the class and the public outputs only. Its registration is within the registration's hiding of the real one, and its session within the session's zero-knowledge error of the real session. Two statements are each that close to the same simulator, which gives the factor of 2. Separately, a session that accepts on a statement other than the registered one gives a collision of the registration's hash, so every proof is about the same circuit.

Lean proves this for an abstract scheme: a hiding registration followed by a zero-knowledge session of one circuit for the class. Neither this construction nor the universal-unit route below is instantiated yet.
~~~

The class still says something. Under the width rule every proof unit has at most $X$ output bits, so any set of units, the faulty ones included, has at most $X$ output bits per unit, which is the weight [network accounting](/docs/accounting/network) charges. A second route reaches the same end: make every proof unit of the class one *universal* unit, a circuit that takes its gates as private input, so the circuit becomes part of the trace and its privacy reduces to the public-circuit setting's, at the cost of proving each unit through the universal one. Private circuits are a prototype: a $V_\Pi$ for one session of eight RoPE instances has been built by hand against public bounds on the circuit's shape, 4.52 billion AND gates, 3.59 billion of them the matrix fold over the private circuit's 157,841 nonzeros. It agrees with C-Flock's verifier on every recorded session it was given, and no outer proof of it has run.

## Deployment

### Why

The theorem above protects an honest prover: zero knowledge describes the transcript of $P$ as written, with uniform salts and an honest $P_{\mathsf{Arg}}$. In a deployment, $P$ is the developer's proving stack: GPUs, kernels and provers that change from week to week. A prover that draws a salt from a secret, or chooses among accepting messages by it, sends the secret. That is too large a system to trust, so the deployment puts a small ZK server between it and the verifier, and zero knowledge rests on the ZK server alone.

### Roles

| Party | Trusted by | What it does |
| --- | --- | --- |
| Workers | Neither party | The developer's servers and GPUs. They serve the model, run $P_\Pi$ and nearly all of $P_{\mathsf{Arg}}$'s arithmetic, and see the witness. |
| ZK server | The developer | The workers' only path to the verifier, on CPUs the developer controls. It draws every salt and pad, and releases each value under [its contract](#the-contract). |
| Verifier | The auditor | It runs a challenger online, which issues the coins and keeps the record, and checks the outer proofs offline ([remote](/docs/protocols/remote#parties)). |

### What it asks of the argument

The ZK server can't afford to compute the outer proof itself: that is the work the workers do. So every value of an outer message must be one of four kinds, each of which the ZK server can make its own cheaply:

1. **A salted commitment**, under a salt the ZK server draws, which hides whatever went into it.
2. **A recomputed value**, which the honest prover fixes from public data, the witness, the ZK server's randomness and the coins, and which the ZK server computes at a cost independent of the inner proving: roots, openings, evaluations.
3. **A masked value**, an algebraic message plus a pad the ZK server drew and never shows the workers, with a relation the ZK server can check on the unmasked message.
4. **A constant**: labels, lengths, counts.

A VEIL-style argument has this form, and [C-Flock's](/docs/proof-systems/c-flock#zero-knowledge-mode) does.

### The run

![Zero knowledge, deployed](/programs/recursion-deployed)

In the inner phase the workers compute each message, and the ZK server commits to it under a salt it draws and sends the commitment at its slot. In the outer phase the ZK server computes $V_\Pi(x, m, c)$ itself from the messages, and stops the session if it rejects. The workers compute each outer message without its pads, which is nearly all of its arithmetic, and the ZK server releases it under its contract.

### The contract

~~~python
def release(msg):                       # one outer message from the workers
    out, plain = {}, []
    for v in msg:
        match kind(v):                  # fixed by Arg and the statement's shape
            case "salted":              # a commitment
                out[v.slot] = Com(v.value, random())
            case "recomputed":          # roots, openings, evaluations
                require(v.value == recompute(v.slot, witness, randomness, coins))
                out[v.slot] = v.value
            case "masked":              # an algebraic message
                plain.append(v.value)
                out[v.slot] = v.value + pads[v.slot]
            case "constant":            # labels, lengths, counts
                require(v.value == shape[v.slot])
                out[v.slot] = v.value
    require(all(r(plain) for r in relations(msg)))   # before any pad leaves
    return out
~~~

`require` stops the session at the first value that fails it: nothing more leaves, and the verifier sees a stop.

- **Randomness.** The salts, the pads and every coin $P_{\mathsf{Arg}}$ would draw are the ZK server's. The workers hold the witness, the messages and their salts, but never the pads.
- **Schedule.** Every value leaves at a slot fixed by a public schedule, the inner commitments and the outputs included, so when a value arrives says nothing. A value not ready at its slot is a stop.
- **The only path out.** The workers must have no other way to reach the verifier. That is a property of the deployment, such as its network isolation, rather than of the protocol.

### What changes

- **The ZK server draws all the randomness**, so no salt or pad the verifier sees is the workers' choice.
- **The trust assumption.** "$P$ is honest" becomes "the ZK server follows its contract and is the workers' only path out".
- **Soundness is unchanged.** The workers and the ZK server together are one prover $P^*$, and the verifier checks every outer proof whatever either did.
- **Two leaks appear**, and the schedule removes a third, timing:
  - **Stops.** The workers can make a session stop, depending on a secret. Over $n$ sessions with a budget of $b$ stops before the ZK server stops for good, and $R$ points in a session at which a stop can show, the pattern of stops is one of at most $\sum_{i=0}^{b} \binom{n}{i} R^{\,i}$, so stops carry at most its $\log_2$. When a stop shows only at a session's release, $R = 1$.
  - **Output freedom.** Where $V_\Pi$ can output more than one value of an output on accepting transcripts, the workers choose which. Output $j$ carries at most $\log_2 q_j$ bits per session for $q_j$ such values, and none when $x$ and the coins fix it. A protocol keeps $q_j$ small by rounding an output the prover can influence, such as credited work, to a public grid.
- **Cost.** The ZK server's checks take about 176 CPU seconds a session in the prototype ([benchmarks](/docs/proof-systems/performance#recursion)).

### Zero knowledge, deployed

Whatever the workers do, the verifier's view is within $\varepsilon_{\mathrm{hide}} + \varepsilon_{\mathrm{zk}}$ of the simulator's, run with the outputs the ZK server released and the pattern of stops. So the workers reach the verifier only through those, and over $n$ sessions they carry at most

$$
\log_2 \sum_{i=0}^{b} \binom{n}{i} R^{\,i} \;+\; \sum_{\text{sessions}} \sum_{j} \log_2 q_j \ \text{ bits}
$$

~~~proof pending
Every value the ZK server releases is one the honest protocol would release on the witness the workers supplied, with the ZK server's randomness: a salted or recomputed value is computed by the ZK server, a constant is checked, and a masked value is uniform under a pad the workers never see, released only after its relations hold on the unmasked message. So a session that doesn't stop is an honest run of the protocol on messages that $V_\Pi$ accepts with the released outputs, and the theorem's simulator covers it. The workers choose only which accepting messages, which shows only through the outputs, and whether and where each session stops.
~~~

The ZK server plays the role of a reverse firewall in Mironov and Stephens-Davidowitz's sense, except that it holds the witness and is trusted.

### Why not zero knowledge in the workers

VEIL makes a hash-based argument zero knowledge cheaply: it pads every committed column so that the opened positions are uniform, masks every algebraic message with a pad committed first, and proves in a small zero-knowledge proof that the masked messages satisfy the protocol's predicate. Run on the workers, it leaves them trusted, for three reasons. The prover draws the pads and salts, and one that draws them from a secret sends the secret. A root the workers compute carries whatever their salts encode, since they can grind the salts of leaves never opened, and every opening shows randomness they chose. And a ZK server in front of direct proofs can't re-randomize a root without recomputing it, which means rehashing everything the workers committed, the whole served trace included. Here the workers' roots and openings never leave, and the contract is stated over $\mathsf{Arg}$ alone, so the inner prover can change, its kernels or its whole protocol, without touching the ZK server. A new inner protocol needs a new $V_\Pi$, which is a soundness obligation, not a privacy one.

## References

- M. Ben-Or, O. Goldreich, S. Goldwasser, J. Håstad, J. Kilian, S. Micali and P. Rogaway. [Everything provable is provable in zero-knowledge](https://link.springer.com/chapter/10.1007/0-387-34799-2_4). CRYPTO 1988. The transformation this page states.
- O. Goldreich and A. Kahan. How to construct constant-round zero-knowledge proof systems for NP. *Journal of Cryptology*, 1996. Zero knowledge against malicious verifiers from committed coins and rewinding.
- I. Mironov and N. Stephens-Davidowitz. Cryptographic reverse firewalls. EUROCRYPT 2015.
- A. Dalal, T. Hemo, R. Rabinovich and R. Rothblum. [VEIL](https://eprint.iacr.org/2026/683). ePrint 2026/683. Zero knowledge for hash-based arguments by masking.
