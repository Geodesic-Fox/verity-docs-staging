Randomness fixes how every coin a protocol uses is produced, and how bytes become a draw. Coins come from the auditor's side. The challenger answers each of the prover's messages with fresh coins from its own generator, drawn after it has recorded the message. Where a coin must be fixed in advance, as compute accounting's salts are and as C-Flock's zero-knowledge mode needs, the challenger commits to it before the prover's messages and opens it later, and each opening is checked against the commitment. Where a draw must be bound to named values, such as an epoch or a committed root, a key is derived from an opened coin or from a key holder's secret with `derive(source, domain, context)`. Exact samplers then turn keys and bytes into draws, with no modulo bias. No coin comes from a public beacon, and no coin can be computed from the prover's own commitment: a prover that could predict its sample could re-commit until the sample missed its wrong proof units.

## Who draws what

| Draw | Drawn by | From | When |
| --- | --- | --- | --- |
| The proof units to prove | The challenger | Fresh bytes from its generator, read directly by the samplers | After registration, before the session's coins |
| A proof's round coins | The challenger | Fresh bytes from its generator, and in a zero-knowledge session all committed in a coin tree when the session opens | Each round's coins in the answer to that round's message |
| Compute accounting's salt and tile draw | The challenger | Two epoch coins, committed before the epoch | Each coin opened once, after the root it keys is recorded |
| Memory accounting's challenged indices | The memory challenger | A key derived from its own secret, the indices committed before the session | One index revealed per timed round |
| Hiding-leaf salts | Whoever commits the leaf: the workers, the ZK server or the challenger | Its own generator, fresh for every leaf | When the leaf is committed |

Every protocol's soundness reads one requirement on these sources: each draw is uniform, and unknown to the prover until the prover has committed everything the draw tests. The [remote](/docs/protocols/remote#parties) and [onsite](/docs/protocols/onsite#placement) protocols place the challenger and the memory challenger, and [sampled proofs](/docs/proof-systems/sampling#integrity) states the requirement as the assumption that `random` is fresh.

## Live coins

A proof is interactive: the prover sends a message, and the challenger answers with fresh coins, until the proof ends. These coins follow three rules:

- The challenger draws each round's coins from its own generator, after it has recorded the message they answer.
- No coin is derived from another, so no coin rests on a pseudorandom function.
- There are no retries. A failed proof is a visible failure, and nothing redraws a coin.

A zero-knowledge session, such as an outer proof in [C-Flock's zero-knowledge mode](/docs/proof-systems/c-flock#zero-knowledge-mode), commits to its coins in advance. The challenger draws every coin of the session before the prover's first message and commits to all of them in a coin tree. It opens a round's coins only in its answer to the prover's message for that round, and opens only the coins that round uses. The prover checks each opening against the commitment before it uses a coin, and stops the session at the first coin that doesn't open.

The commitment protects the prover. Its binding stops the challenger from choosing a coin after it has seen the prover's message, which zero knowledge against a dishonest verifier needs. Its hiding keeps each coin unknown to the prover until its round is answered, as drawing it fresh does. The verifier checks the record, not the openings.

~~~mermaid
sequenceDiagram
  participant P as Prover
  participant C as Challenger
  P->>C: Hello, with a fresh nonce
  Note over C: draw key, coins and salts
  C->>P: coin tree root and key
  loop each round
    P->>C: round message
    Note over C: record it
    C->>P: the round's coins, opened
    Note over P: check opening against root
  end
~~~

### The coin tree

A zero-knowledge session's coins are committed in the coin tree `coin-tree/hm96-sha512/v2`: one [hiding leaf](/docs/proof-systems/commitments#hiding-leaves) per round of each stream, in a SHA-512 Merkle tree, with every hash keyed to the session by the prover's nonce.

**Hello.** The prover's `Hello` names the schedule, `{"block", "nonce", "rounds_log", "scheme", "streams"}`:

- `block`: the most coins any round uses.
- `rounds_log`: each stream has $2^{\mathrm{rounds\_log}}$ rounds.
- `streams`: the stream names, in leaf order. A stream is one repetition of one table of the proof, or the session's own stream `session`, whose round 0 holds the coins drawn when the prover commits.
- `nonce`: the prover's fresh 32-byte nonce $\nu$, as 64 lowercase hex digits.
- `scheme`: `coin-tree/hm96-sha512/v2`.

**The draw.** Once it holds $\nu$, the challenger draws from its generator, in this order:

1. A 256-byte hm96 key $K$, with bit 2047 cleared (bit 7 of byte 255).
2. For each stream in order, and each round in order, the round's block of `block` coins, 16 bytes each, then a 192-byte salt.

It answers `Hello` with the root and $K$. A key is never reused, and the verifier refuses a session whose key an earlier session of the same run used.

**Hashes.** Every hash of the tree is SHA-512 with $\nu$ prefixed:

~~~text
H(x)            = SHA-512(ν ‖ x)
TAIL            = "verity/coin-tree/tail/v2\0"
CHAIN           = "verity/coin-tree/chain/v2\0"
ROUND           = "verity/coin-tree/round/v2\0"
PAD             = "verity/coin-tree/pad/v2\0"
SALT_PREFIX     = "verity/hm96-sha512/salt/v1\0"                 zero-padded to 128 bytes
LEAF_PREFIX(K)  = "verity/hm96-sha512/leaf/v1\0" ‖ SHA-512(K)    zero-padded to 128 bytes (SHA-512(K) unprefixed)

Round r of stream s, with coins c_0 … c_{B−1} (B = block) and salt y:
T_B   = H(TAIL)
T_i   = H(CHAIN ‖ c_i ‖ T_{i+1})                                  for i = B−1 down to 0
x     = H(ROUND ‖ u32be(s) ‖ u32be(r) ‖ T_0)                      s is the stream's index in the schedule
leaf  = H(LEAF_PREFIX(K) ‖ (x ⊕ M(K)·y) ‖ H(SALT_PREFIX ‖ y))

node(l, r) = H(l ‖ r)
~~~

$M(K)$ is the 512 × 1536 Hankel matrix of `hm96-sha512/v1`, $M_{ij} = k_{i+j}$. Each stream's $2^{\mathrm{rounds\_log}}$ leaves form a subtree. The stream roots, in stream order and padded with `H(PAD)` to a power of two, form the top tree, and its root is the commitment. A coin is 16 bytes. In C-Flock it's an element of $\mathrm{GF}(2^{128})$: its low 64 bits little-endian, then its high 64 bits.

**Openings.** An opening of the first $n$ coins of a round is $c_0, \dots, c_{n-1}$, then $T_n$, the salt $y$, and the path: the siblings in the stream's subtree, then the siblings in the top tree. The prover recomputes $T_{n-1}, \dots, T_0$, then $x$, the leaf and the root. The round's unopened coins stay hidden behind $T_n$.

**Bounds.** Hiding is statistical and rests on no hash property: with the fresh uniform key, any two choices of the coins give published data within statistical distance $N \cdot 2^{-256}$, for $N = \lvert\mathrm{streams}\rvert \cdot 2^{\mathrm{rounds\_log}}$ leaves. Binding is the collision resistance of $x \mapsto \mathrm{SHA\text{-}512}(\nu \Vert x)$, [CR · SHA-512](/assumptions/cr/sha-512). Because $\nu$ is fresh, a collision found before the session opens nothing.

## The unit draw

In a sampled proof, the challenger's first draw picks the proof units to prove. It comes after the developer's registration has fixed the program, the partition's query, the sampling design, the commitment scheme and every root, and after the challenger has checked the registration and logged its receipt. The challenger reads fresh bytes from its generator directly into the [samplers](#samplers), with no key and no derivation, and sends the draw in the clear. The drawn units' statement is then fixed, and the session follows. The draw answers no prover message, so it is never in a coin tree. What it needs is that its bytes are uniform and unknown to the prover until the registration was logged.

The draw is a JSON object, with its sampling design named in the `law` field:

~~~text
{"law": "subset",     "population": N, "k": K,                         "units": [u_0 < u_1 < …]}
{"law": "bernoulli",  "population": N, "p": "num/den",                 "units": [u_0 < u_1 < …]}
{"law": "stratified", "population": N, "k": K, "strata": [stratum, …], "units": [u_0 < u_1 < …]}
{"law": "work",       "population": N, "k": K, "strata": [stratum, …], "units": [u_0 < u_1 < …], "closure": [c_0 < c_1 < …]}
~~~

A work draw's `closure` is optional. Each sampling design draws this way:

| Sampling design | Units drawn |
| --- | --- |
| `subset:K` | `subset(K, N)` |
| `bernoulli:NUM/DEN` | Each unit $u \in [0, N)$ independently, when $U(\mathrm{den}) < \mathrm{num}$ |
| `stratified:K` | `subset(k_s, n_s)` in each stratum, with $k_s = \max(1, \lfloor (2Kn_s + N)/(2N) \rfloor)$ |
| `work:K` | `subset(k_s, n_s)` in each stratum, with $k_s = \min(n_s, \max(f_s, \lceil K w_s n_s / W \rceil))$ and $W = \sum_s w_s n_s$, plus the closure |

The verifier derives the strata from its own program and partition, never from the prover. It groups the units by the template of their root node, writes each stratum's units as ascending, disjoint, non-empty ranges `[lo, hi)` with adjacent ones merged, and orders the strata by their first unit. A stratum is `{"template": id, "units": [[lo, hi], …], "k": k_s}`, and a work stratum adds `"work": w_s` and `"floor": f_s`, from the verifier's own work table, with $f_s \ge 1$. Each stratum draws on its own fresh bytes, its local index $j$ standing for its $j$-th unit, and `units` is the union, ascending. A closure lists the units that the drawn units' credit depends on and that weren't drawn themselves, from the verifier's own closure map. [Sampling designs](/docs/proof-systems/sampling#sampling-designs) gives each design's acceptance probability. The [two-stage variant](/docs/proof-systems/sampling#two-stage-sampling) draws replay units first and proof units inside them second, each draw after the commitment it tests.

## Derived draws

A derived draw comes from a 32-byte key:

~~~text
derive(source, domain, context) -> key
~~~

- **`source`** is secret bytes: a coin the challenger has opened, or a key holder's own secret, such as the memory challenger's. It is never a public beacon and never the prover's commitment.
- **`domain`** names the draw, matching `verity/[a-z0-9-]+/[a-z0-9-]+/v[0-9]+`, so draws for different purposes from one source are independent.
- **`context`** maps names to the values the draw is bound to, such as an epoch or a root, so the draw can't be computed before those values exist.

A key is SHA-512 truncated to 256 bits, which keeps 128-bit security against a quantum search. The byte format is:

~~~text
frame(b: bytes)   = "b" ‖ u64be(len b) ‖ b
frame(s: string)  = "s" ‖ u64be(len utf8(s)) ‖ utf8(s)
frame(i: integer) = "i" ‖ u64be(len body) ‖ body       i ≥ 0; body = i big-endian in the fewest bytes, one zero byte for 0

ctx    = frame(k_1) ‖ frame(v_1) ‖ … ‖ frame(k_m) ‖ frame(v_m)          context keys k_j as strings, sorted by code point
derive = SHA-512("verity/randomness/derive/v2\0" ‖ frame(source) ‖ frame(domain) ‖ frame(ctx))[0..32)
~~~

A key drives counter-mode streams, each addressed by an index: one part or a tuple of parts, each part bytes, a string or a nonnegative integer. Draws at different indices are independent streams, and a worker can compute one part of a population's draws with a sub-key, a shard, without the rest:

~~~text
F(index)            = frame(p_1) ‖ … ‖ frame(p_m)       for index (p_1, …, p_m); a single part is a one-part index
stream(key, index)  = B_0 ‖ B_1 ‖ …                      B_c = SHA-512("verity/randomness/stream/v2\0" ‖ key ‖ frame(F(index)) ‖ u64be(c))
shard(key, index)   = SHA-512("verity/randomness/shard/v2\0" ‖ key ‖ frame(F(index)))[0..32)
~~~

Each block $B_c$ is a whole 64-byte digest, and a stream's first $n$ bytes are a prefix of every longer read.

## Samplers

Three samplers turn a stream into a draw. Each is exact: its output distribution is the stated one, with no modulo bias and no approximation. All three share one word rule, $U$:

~~~text
U(n, S)   for n ≥ 1 and a byte stream S:
          w = ⌈(bitlen(n) + 64) / 8⌉,   L = 2^(8w) − (2^(8w) mod n)
          read S as consecutive w-byte big-endian words x_0, x_1, …
          return x_t mod n for the first x_t < L

uniform(n, index)      = U(n, stream(key, ("u", index…)))
bernoulli(a/d, index)  = U(d, stream(key, ("b", index…))) < a         a/d in lowest terms; p = 0 and p = 1 draw nothing
subset(k, n, index)    = for i = 0 … k−1:  j = i + U(n − i, stream(key, ("s", index…, i))),  swap positions i and j
                         of [0, n); return the first k positions' values, sorted ascending
~~~

`("u", index…)` is the index with the part `"u"` prepended. `uniform` returns an integer uniform on $[0, n)$, `bernoulli` returns true with probability exactly $a/d$, and `subset` returns a uniformly random $k$-subset of $[0, n)$ in $O(k)$ time and memory, whatever $n$ is. The 64 extra bits in each word make a rejection rare.

The unit draw runs the same rules on raw bytes, with no key. `uniform(n)` reads words from the challenger's fresh bytes in order, and `subset`'s swaps read in order from the same bytes. A byte string that runs out is extended with more fresh bytes and the sampler rerun, so the draw stays exact.

## What each protocol draws

**[Sampled proofs](/docs/proof-systems/sampling).** The unit draw above, and the proof's live round coins, from the coin tree in a zero-knowledge session. In [C-Flock](/docs/proof-systems/c-flock) every round coin is a 16-byte element of $\mathrm{GF}(2^{128})$.

**[Compute accounting](/docs/accounting/compute)**, proof of useful work. Before epoch $e$, the challenger draws one 32-byte coin per label, `salt` and then `draw`, and publishes a commitment to both:

~~~text
x_l      = SHA-512("verity/pouw/epoch-coin/v1\0" ‖ coin_l)                         l ∈ {salt, draw}
value_l  = the hm96-sha512/v1 leaf of x_l under the pinned key, with a fresh 192-byte salt
root     = the frame-v3-sha512 root over (value_salt, value_draw) at positions 0 and 1,
           leaf schema "verity/pouw/epoch-coins/v1", owner −1, bound to epoch e
~~~

The challenger opens each coin once, live: the salt coin after the verifier has recorded the weights' root, and the draw coin after it has recorded the transcript's root. It refuses a second request for an opened coin. From the opened coins:

~~~text
salt    = stream(derive(coin_salt, "verity/pouw/epoch-salt/v1",
                        {"epoch": e, "coins": root, "weights": weights_root}), "salt")[0..32)
key     = derive(coin_draw, "verity/pouw/audit/v1", {"transcript": transcript_root, "salt": salt})
tile_j  = the tile whose cumulative ticket range holds uniform(key, T, j),   j = 0 … t − 1
~~~

Each tile holds integer tickets in proportion to its share of its matrix multiplication's reference work, and $T$ is the total. So each of the $t$ draws picks a tile independently, with probability $W_{\mathrm{ref}}(\text{tile})/W$. Pearl-C draws the same way under the domain `verity/pouw/pearl-c-draw/v1`, with the context `{"transcript", "records", "salt"}`, where `records` is the digest of its unit records. A scheme's noise isn't a coin: it is part of the scheme's computation, derived from the salt and the prover's roots inside the scheme, and the scheme's own assumption accounts for grinding it.

**[Memory accounting](/docs/accounting/memory)**, proof of useful space. The setup salt is 24 bytes, derived from the auditor's secret after the server has committed to the weights' encoding:

~~~text
salt = stream(derive(secret, "verity/pous/salt/v1", {"w": commitment}), "salt")[0..24)
~~~

Before a session of $k$ timed rounds over a space of `blocks` blocks, the memory challenger derives its indices from its own secret, uniformly and with replacement, and commits them in the coin tree `verity-pous/coin-tree/hm96-sha512/v1`:

~~~text
key      = derive(secret, "verity/pous/memory-challenger-coins/v1", {"session": session, "blocks": blocks, "k": k})
index_j  = uniform(key, blocks, j)                                                  j = 0 … k − 1
x_j      = SHA-512("verity-pous/memory-challenger/coin/v1\0" ‖ session ‖ u32be(j) ‖ u64be(index_j))
leaf_j   = the frame-v3-sha512 leaf at rank and position j, schema "pous/coin/hm96-sha512/v1", over the
           hm96-sha512/v1 leaf of x_j under the session's fresh key, with a fresh 192-byte salt
root     = the frame-v3-sha512 root over leaf_0 … leaf_{k−1}, owner −1, bound to the session
~~~

Round $j$ reveals index $j$, and after the session the memory challenger opens every coin it revealed. Hiding is $k \cdot 2^{-256}$ under the fresh key, and binding is [CR · SHA-512](/assumptions/cr/sha-512). The secret stays private until the session: from a public source, a server could compute the challenged blocks in advance and rebuild only those.

## Who a draw convinces

Live coins convince the auditor, who trusts its own challenger and memory challenger, and no third party: anyone else would also have to trust that the challenger drew its coins honestly and kept them from the prover. A proof's transcript therefore doesn't transfer; what the audit leaves behind is the auditor's verdict, recorded in its integrity profile.

## Related pages

Randomness connects to these pages:

- [Remote](/docs/protocols/remote#protocol) and [Onsite](/docs/protocols/onsite#protocol): the challenger, the ZK server and the order of commitments and coins
- [Sampling](/docs/proof-systems/sampling): the sampling designs and the freshness assumption
- [Commitments](/docs/proof-systems/commitments): the hiding leaves and trees the coin commitments use
- [Compute](/docs/accounting/compute) and [Memory](/docs/accounting/memory): the protocols whose draws are derived
- [C-Flock](/docs/proof-systems/c-flock): the proof system whose round coins these are, and whose zero-knowledge mode commits them in the coin tree
