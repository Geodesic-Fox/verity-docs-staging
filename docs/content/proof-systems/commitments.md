A commitment binds values before anything is proved about them. Serving commits each value it will be asked about to a published root, and a later proof uses those values only through openings that the verifier checks against the root. A commitment scheme fixes how: the leaf encoding, the tree rules and the root, each with a stable id, and the hash assumptions they rest on. Everything hashes with SHA-512. The schemes are `frame-v3-sha512`, indexed Merkle trees over domains the verifier derives itself; `hm96-sha512/v1`, the hiding leaf that wraps every committed value; and `vllm-v1-sha512`, the framing a vLLM server's committers emit. Committed values are hiding rows in frame-v3-sha512 trees.

## What a commitment establishes

A commitment shows that the values a proof uses are the values bound earlier. It doesn't show how they are related. A proof of a dot product, for example, establishes both of these:

~~~text
x, w and y are the previously committed values
y = ExactDot(x, w)
~~~

The commitment establishes the first, and the proof system's proof establishes the second. An accepted opening means "this value, at this verifier-derived position, of this verifier-derived commitment", except with the probability of finding a SHA-512 collision. It doesn't mean the value is right, that it relates to any other value, or that it came from a particular source. A proof unit is [faulty](/docs/accounting/circuits#partitions) when its committed outputs differ from its gates applied to its committed inputs, so correctness is always measured against what was committed.

A hiding commitment also keeps the values private: the published roots and commit strings reveal nothing about an unopened value, up to a stated statistical distance. Opening a leaf reveals its value and its salt, and nothing about the other leaves.

The scheme is part of the [statement](/docs/proof-systems#statements): the same circuit under another scheme is another statement. A proof system's own internal commitments, such as the column trees of its polynomial commitment, stay inside its proof and aren't commitment schemes.

## What serving commits, and when

Every commitment comes before any coin that tests it. In a [sampled proof](/docs/proof-systems/sampling):

1. **Registered values** (the weights, a program's constants and its tables) are committed once, when the program is registered, as hiding rows under a frame-v3-sha512 root. The weights' domain has owner −2.
2. **Run values** are committed while serving: every value that crosses a proof-unit boundary of the program's partition, and the program's run inputs and outputs, as hiding rows under one root per port. The boundary's domain has owner −1.
3. **Registration.** The developer registers a `verity/registration/v1` record that fixes the program, the query that partitions it, the sampling design, the commitment scheme and every root. The challenger holds each root's domain to its own derivation and logs a receipt.
4. **Coins.** Only then does the challenger draw the proof units and, after them, the session's coins.

A served root's domain binds the program, the partition, the port, its leaf schema, its leaf count and the run, so a root can't be replayed into another statement. The verifier derives every domain from its own data, never from the prover. The ZK server also commits every message it sends the auditor under a fresh salt. The [two-stage variant](/docs/proof-systems/sampling#lazy-commitments) commits in two steps, the replay units' boundary first and their interiors after the first draw. [Compute accounting](/docs/accounting/compute) commits the weights before the epoch's salt coin is opened and the tile transcript before its draw coin. [Memory accounting](/docs/accounting/memory) commits the encoded weights before the setup salt is drawn. [Randomness](/docs/proof-systems/randomness) covers the coins themselves.

## The schemes

| Scheme | What it is | Binding rests on |
| --- | --- | --- |
| `frame-v3-sha512` | Merkle trees whose every leaf, pad and node is bound to a verifier-derived domain, with one leaf schema per port | [CR · SHA-512](/assumptions/cr/sha-512) |
| `hm96-sha512/v1` | A hiding leaf: a SHA-512 leaf digest wrapped with a fresh 192-byte salt, after Halevi and Micali | [CR · SHA-512](/assumptions/cr/sha-512); hiding is statistical |
| `vllm-v1-sha512` | The vLLM serving framing: unpadded trees under root bindings, with the domain held by the verifier | [CR · SHA-512](/assumptions/cr/sha-512) |

Every scheme is [binding](/assumptions/binding): a root opens at a position to one value only. Each scheme has a spec, a reference implementation and conformance vectors, and any committer, however fast, must match the vectors byte for byte.

The path from a committed row to its root:

~~~mermaid
flowchart LR
  subgraph proved["proved, private inputs"]
    v["Row value"]
    x["Row digest x"]
    bc["Commit string b ‖ c"]
  end
  subgraph native["computed by the verifier"]
    hl["hm96 leaf"]
    tl["frame-v3 tree leaf"]
    root["Root"]
  end
  v -->|"row schema"| x
  x -->|"salt and key"| bc
  bc --> hl
  hl -->|"domain, rank, schema"| tl
  tl -->|"pads and nodes"| root
~~~

## frame-v3-sha512

### Framing

Every frame-v3-sha512 hash is SHA-512 over one framed message, and every digest is 64 bytes:

~~~text
F              = "veritor/protocol/merkle/frame/v3\0"
M(tag, p_1…p_m) = F ‖ u32be(len tag) ‖ tag ‖ (u64be(len p_i) ‖ p_i) for each part
uint(x)        = x big-endian in the fewest bytes, one zero byte for 0

domain_id      = SHA-512(M("domain", binding, uint(owner + 2), positions_id, uint(count)))
leaf           = SHA-512(M("leaf",   domain_id, uint(rank), uint(position), schema, value))
pad(rank)      = SHA-512(M("pad",    domain_id, uint(rank)))
node           = SHA-512(M("node",   domain_id, uint(level), uint(index), left, right))
empty          = SHA-512(M("empty",  domain_id))
~~~

`schema` is the leaf schema's UTF-8 name, and `value` is the 64 bytes the leaf binds: a row digest, or for a hiding row, its hm96 leaf.

### Domains

A domain fixes which positions a commitment covers, in which order, and what it may not outlive. Both parties derive it from trusted data alone:

| Field | What it is |
| --- | --- |
| `binding` | A 64-byte SHA-512 identity digest of what the commitment may not outlive: the registration for a served port, a replay phase for an interior, a fixed tag for the weights |
| `owner` | −2 for the weights, −1 for the boundary, or a replay unit's index |
| positions | The ordered positions covered, $\mathrm{count}$ of them; a leaf's rank is its place in this order |

`positions_id` is the positions' identity: a tagged SHA-512 hash of a canonical manifest, `{"start", "step", "stop"}` under the tag `veritor/indexed-domain/range/v1` for a range, or `{"items": […]}` under `veritor/indexed-domain/explicit/v1` for an explicit list:

~~~text
tagged(tag, payload) = SHA-512("verity/tagged-sha512/v1\0" ‖ u32be(len tag) ‖ tag ‖ u64be(len payload) ‖ payload)
~~~

The payload is canonical JSON: sorted keys, no insignificant whitespace, UTF-8, and no floats. Because every part is length-framed, no two domains share a message.

### Tree and openings

The leaves, in rank order, are padded with `pad(rank)` for ranks $\mathrm{count}, \dots, 2^d - 1$, where $d = \lceil \log_2 \mathrm{count} \rceil$. Level 0 of nodes pairs the leaves, and each node is bound to its level and its index within the level. The single top node is the root. A tree of one leaf has that leaf as its root, and a tree of none has the root `empty`. An opening of rank $r$ is the value, its salt and $d$ siblings of 64 bytes, from the leaf's up, and the verifier derives the direction at each level from $r$'s bits. A pad's tag differs from a leaf's, so no opening reaches a padded slot.

### Row digests

A committed value is a row: a string of bits, digested once before the tree. Each row schema's prefix is exactly one 128-byte SHA-512 block, so a gadget starts from a constant midstate.

~~~text
sha512/row/v1       prefix = ("verity/sha512-row/v1\0" ‖ u8 role ‖ u8 word_bits ‖ u32be n_words), zero-padded to 128 bytes
                    digest = SHA-512(prefix ‖ row bytes)

sha512/row/v2       P(ℓ)   = ("verity/sha512-row/v2\0" ‖ u64be ℓ), zero-padded to 128 bytes
                    digest = SHA-512(P(ℓ) ‖ row bytes)

sha512/row-seg/v1   s      = ⌈ℓ / 8192⌉ segments of 1024 bytes, the last holding m_{s−1} = ℓ − 8192(s − 1) bits
                    Q(ℓ)   = ("verity/sha512-row-seg/v1\0" ‖ u64be ℓ ‖ u64be s ‖ u32be 1024), zero-padded to 128 bytes
                    S(j, s, m) = ("verity/sha512-row-seg/v1/segment\0" ‖ u64be j ‖ u64be s ‖ u64be m), zero-padded to 128 bytes
                    d_j    = SHA-512(S(j, s, m_j) ‖ segment j)
                    digest = SHA-512(Q(ℓ) ‖ d_0 ‖ … ‖ d_{s−1})
~~~

- **`sha512/row/v1`** is a word row: `n_words` little-endian words of `word_bits` ∈ {8, 16, 32}. Role 1 is a row of an activation matrix and role 2 a column of a weight matrix, in the orientation the product consumes it. The prefix binds the role, the width and the length.
- **`sha512/row/v2`** is a bit row of any length ℓ, including 0. Row bit $i$ is bit $i \bmod 8$ of byte $\lfloor i/8 \rfloor$, and the last byte's fill is zero. A row of elements lists each element's bits least significant first, so the row bytes are the tensor's memory: two E2M1 codes a byte, the first in the low nibble; one byte per E4M3 element or scale; two little-endian bytes per BF16 element. An NVFP4 or MXFP4 row is its codes followed by its scales. No format, role or width enters the digest: the tree leaf's domain, rank, position and schema keep rows of different ports apart.
- **`sha512/row-seg/v1`** is the same bit row cut into 1024-byte segments that hash independently, so a prover hashes them in parallel, then one hash over the segment digests. The empty row has no segment, and its message is $Q(0)$ alone.

The three tags differ before each one's only zero byte, so no prefix block of one schema equals another's, and each encoding is injective. A hiding row's tree leaf names its rule as its schema: `hm96-sha512/row/v1`, `hm96-sha512/row/v2` or `hm96-sha512/row-seg/v1`, over the matching row digest.

## Hiding leaves

An unsalted leaf digest is a function of the value, so anyone holding it can search a low-entropy value, such as a token id, however zero-knowledge the proof over it is. A hiding leaf wraps the digest with a fresh salt stored beside the value, so the published data hides the value. `hm96-sha512/v1` is Halevi and Micali's first scheme (CRYPTO 1996), with an affine universal family, applied to a digest of the value:

~~~text
x            = the row digest (or another SHA-512 leaf digest the verifier derives for the position)   private
y            = 192 fresh bytes from the committer's generator, one salt per leaf, stored with it        private
c            = SHA-512(SALT_PREFIX ‖ y)
b            = x ⊕ M·y                                    M = M(K), a 512 × 1536 matrix over GF(2)
leaf         = SHA-512(LEAF_PREFIX(K) ‖ b ‖ c)

SALT_PREFIX    = "verity/hm96-sha512/salt/v1\0"                 zero-padded to 128 bytes
LEAF_PREFIX(K) = "verity/hm96-sha512/leaf/v1\0" ‖ SHA-512(K)    zero-padded to 128 bytes
~~~

$M$ is the Hankel matrix of the key's bits, $M_{ij} = k_{i+j}$ for $i < 512$ and $j < 1536$, so $(My)_i = \bigoplus_j k_{i+j} y_j$. Bit $t$ of a byte string is bit $t \bmod 8$ of byte $\lfloor t/8 \rfloor$. The key has 2,047 bits and is stored as 256 bytes with the top bit zero, so each matrix has one encoding. `b ‖ c` is the 128-byte commit string, and an opening is the value and its salt.

**The pinned key.** Data commitments use one fixed public key, derived in counter mode from a public label, so nobody chose it and nobody holds a trapdoor:

~~~text
K = SHA-512("verity/hm96-sha512/key/v1\0" ‖ u32be(0)) ‖ … ‖ SHA-512("verity/hm96-sha512/key/v1\0" ‖ u32be(3)),   bit 2047 cleared
~~~

A coin tree draws a fresh uniform key for each session instead ([Randomness](/docs/proof-systems/randomness#the-coin-tree)). Every leaf binds its key's digest, and the verifier takes the key from its own statement, never from an opening.

**Hiding.** With a uniform key and independent uniform salts, the published data of any two vectors of $N$ leaves is within statistical distance $N \cdot 2^{-256}$, by the generalized leftover hash lemma. With the pinned key the bound is $N \cdot 2^{-192}$, except for a $2^{-64}$ fraction of keys. Treating the pinned key as outside that fraction is a common-reference-string step, justified because a counter-mode hash of a public label is a typical draw: the setup assumption that the hash-derived key is typical. $N$ counts every leaf ever committed under the key, and the bound needs a fresh salt for every leaf: two leaves with one salt reveal $x \oplus x'$. Hiding rests on no hash property.

**Binding** holds for every key and rests on [CR · SHA-512](/assumptions/cr/sha-512) alone. Two different openings of one leaf give a collision in the leaf hash, in the salt hash, or in the inner digest. A key substituted after commitment is excluded by the leaf's key digest. No random oracle is assumed.

## vllm-v1-sha512

vllm-v1-sha512 is the framing a vLLM server's committers emit, with SHA-512 for every hash. Unlike frame-v3, it binds no domain in its leaves or nodes: the verifier holds the domain, and the published root binds the context.

**Base hash.** Every tree hash is a tagged, length-prefixed SHA-512:

~~~text
H(tag, p_1 … p_k) = SHA-512( u32be(len tag) ‖ tag ‖ (u64be(len p_i) ‖ p_i)* )
~~~

The tags are `verity-vllm/{leaf,node,lift,ids,empty,json,challenge}/v1`. `json` and `challenge` digest documents and aren't part of the tree.

**Leaves.** Every leaf is `SHA-512(prefix ‖ value)`, with no suffix:

| Leaf | Preimage |
| --- | --- |
| Position leaf | `"verity/pos-leaf/v0" ‖ u64be(len v) ‖ v`, the raw tag with no length prefix; the 26-byte prefix isn't block-aligned, so a gadget absorbs the value from byte 26 |
| `fa2h` chunk leaf | A 64-byte chunk header, then the chunk: `4 · chunk_words` bytes of little-endian 32-bit words |
| `fa2h` thread leaf | A 64-byte thread header, then the thread's words |

Under `hm96-sha512/v1`, the position leaf is the inner digest $x$ and the tree leaf is the hm96 leaf. Each `fa2h` header is sixteen little-endian 32-bit words:

| Word | Chunk header | Thread header |
| --- | --- | --- |
| 0 | `0x68326166` (`"fa2h"`) | `0x68326166` |
| 1 | `7<<16 \| 1<<8 \| src_mask` | `7<<16 \| src_mask` |
| 2 | `launch_tag` | 0 |
| 3 | `chunk_index`, the leaf's position | `slab` |
| 4 | `chunk_words` | `m_block` |
| 5, 6, 7 | `HB`, `M`, `NB` | `n_block`, `tidx`, `seqlen_q` |
| 8, 9 | `BN`, `D`, the kernel tile; 0, 0 stands for the (128, 64) tile | `seqlen_k`, `launch_tag` |
| 10 | 0 | `n_block_max` |
| 11 | 0 | `ok0 \| ok1<<1`, the row validity |
| 12 to 15 | 0 | 0 |

`src_mask` is below $2^8$, so word 1's second byte is a kind byte, 1 for a chunk and 0 for a thread. The first bytes separate every preimage: a node or lift starts `00 00 00 13`, a position leaf `verity/`, an hm96 leaf `verity/hm96-sha512/`, and an `fa2h` leaf `fa2h`. So no leaf preimage is a node preimage, and no two leaf rules share one.

**Tree.** No padding, and no position in the nodes:

- While a level has more than one node, neighbours (0, 1), (2, 3), … become `H(node/v1, left, right)`.
- An odd trailing node becomes `H(lift/v1, child)`. Nothing is duplicated or padded.
- A tree with no leaves has the root `H(empty/v1)`.

An opening of leaf $i$ of $N$ has one entry per level, from the leaves up: a 64-byte sibling, or null where the node was lifted.

~~~text
shape(N, i): while width > 1: emit (i ≠ width−1 or width even); width ← ⌈width/2⌉; i ← ⌊i/2⌋
fold(d, i, path): for each entry: null → d ← lift(d); i even → d ← node(d, s); i odd → d ← node(s, d); i ← ⌊i/2⌋
~~~

**Root bindings.** A published root is SHA-512 over a tag and fixed-width fields, wrapping the tree root:

| Root | Preimage |
| --- | --- |
| Semantic | `"verity/semantic-root/v0" ‖ program ‖ query_id ‖ template ‖ ctx ‖ u64be epoch ‖ u64be N ‖ tree_root` |
| Step | `"verity/fa2c/root/v0" ‖ program ‖ ctx ‖ geo ‖ layout ‖ u64be N ‖ tree_root` |
| Run | `"verity/cmt-integ/run-root/v0" ‖ program ‖ geo ‖ u64be S ‖ fold(step_root_0 … step_root_{S−1})` |
| Weights | `"verity/cmt-integ/weights-root/v0" ‖ geo ‖ names ‖ u64be T ‖ fold(tensor_root_0 … tensor_root_{T−1})` |
| `fa2h` stream | `"verity/fa2-hidden/root/v7" ‖ layout ‖ stream_ctx ‖ tree_root` |
| `fa2h` thread | `"verity/fa2-hidden/thread-root/v7" ‖ geo ‖ thread_ctx ‖ tree_root` |

Every named digest is a 64-byte SHA-512 digest, and `query_id` is the only variable-length field, so each preimage parses one way. `fold` is the tree rule above. `stream_ctx` is SHA-512 of the ASCII text `{"chunk_words": C, "launch_tag": T, "leaf_count": N, "src_mask": S}`, and `thread_ctx` of `{"launch_tag": T, "src_mask": S}`, with decimal integers and the spacing exactly as shown. Under hiding leaves, a step's `ctx` ends with `/leaf=` and the hm96 rule's 64-byte scheme digest, so the step root binds the leaf rule. Unvisited thread slots hold 64 zero bytes, which no message hashes to.

**What a statement must bind.** Since vllm-v1-sha512 binds no domain inside its hashes, a statement over its openings supplies these outside them:

1. The domain of each port, built by the verifier from its own program, input set and range, absorbed as `tagged("verity/vllm-v1/domain/v1", {kind, leaf_count, fields…, "hash": "sha512"})`, with byte fields in hex.
2. The bound root from the table above, never the bare tree root.
3. Each port's leaf rule, and under hiding leaves its key's scheme digest.
4. Each position's value length and meaning, from the template or layout, so the length prefix is public.
5. Positions the verifier derives from its own subcircuit, range and port. The prover's path must have the shape $\mathrm{shape}(N, i)$, and an `fa2h` header is derived from the claimed position.
6. The geometry of thread trees, since $N$ and every thread header derive from it.
7. One tree per opening: siblings never mix trees, and a subtree root is never reused as a leaf.

With these in place, a vllm-v1-sha512 opening means what a frame-v3-sha512 opening does: this value, at this verifier-derived position, of this verifier-derived commitment.

## What a proof system proves

A proof system proves only what touches private data. For each committed row a proof unit reads or writes, it proves the row digest $x$ from the row, then the commit string `b ‖ c` from $x$ and the salt, and publishes the commit string. The verifier computes the hm96 leaf, the tree leaf and the path natively from its own domain and the registered root. Adding a scheme adds data and a native verifier, never a circuit.

The hm96 key is the statement's, never a witness: it is a circuit constant, or a public input checked against its scheme digest. A prover free to choose the key could solve $M_{K'} y = b \oplus x'$ for a key $K'$ and open a committed `b ‖ c` to any $x'$. Beyond the unsalted digest, a hiding row costs two SHA-512 compressions for $c$, 116,240 ANDs, and 400,193 two-input XORs for $M y$ under the pinned key. The leaf hash is native at the verifier.

## Merkle trees as gates

When a unit reads a committed row at a position it keeps hidden, the whole read is inside the proof, written as Boolean Definitions in the circuit format:

| Definition | What it computes |
| --- | --- |
| `Sha512Compress_v1` | One SHA-512 compression: 58,120 ANDs per 128-byte block with ripple-carry additions, fewer where an operand is constant |
| `Sha512RowSeg_v1{N_BITS}` | A `sha512/row-seg/v1` row digest, cut into `Sha512RowSegSegment_v1{M}` per segment and `Sha512RowSegOuter_v1{N_BITS}` |
| `Hm96Sha512Leaf_v1` | The hiding leaf under the pinned key, from a private digest and salt: `b`, `c` and the leaf |
| `FrameV3Read_v1{D, SCHEMA}` | 1 when a value opens at a hidden position of a dense frame-v3-sha512 tree of depth $D$, from `FrameV3Leaf_v1{B, SCHEMA}` and `FrameV3Node_v1{B}` parts; the root and domain id are public |
| `MerkleRead_v1{ARITY, D}` | 1 when a leaf opens at a hidden position of a plain SHA-512 tree of arity 2 or 4 and depth $D$, whose node is SHA-512 over its children in slot order; only the root is public |

In both reads the position, the path and the leaf are values, hidden like any other, and the circuit depends only on the tree's shape.

## Assumptions

| Property | Rests on |
| --- | --- |
| Binding, for every scheme and every key | [CR · SHA-512](/assumptions/cr/sha-512) |
| Hiding under a fresh uniform key | Nothing but uniform, independent salts: $N \cdot 2^{-256}$ |
| Hiding under the pinned key | Uniform salts, the common-reference-string step and the typical hash-derived key: $N \cdot 2^{-192}$ |

## Related pages

Commitments connect to these pages:

- [Statements](/docs/proof-systems#statements): a statement is a circuit plus the scheme that binds its inputs and outputs
- [Randomness](/docs/proof-systems/randomness): the coins that come after the commitments, and the coin trees
- [Sampled proofs](/docs/proof-systems/sampling): the audit whose registration fixes the roots
- [Remote](/docs/protocols/remote#parties): the workers that commit and the ZK server that salts every message
- [Security assumptions](/docs/assumptions): the hash assumptions and their trust ratings
- [vLLM](/docs/integrations/vllm): the integration whose committers emit vllm-v1-sha512
