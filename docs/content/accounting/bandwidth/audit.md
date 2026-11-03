The bandwidth protocol of record since 12–15 Oct is the [remote bandwidth audit](/accounting/bandwidth/remote), which treats a whole node as one resource of read capacity $R$. This page describes the per-GPU audit it grew from.

The bandwidth audit bounds from below how much of a store a device read from its memory within a window. The memory challenger sends a fresh seed; the device must tag every block of its [PoUS](/accounting/memory/pous) store under the seed and commit the tags before a deadline; the challenger then samples blocks and checks their tags. A tag reads the whole block and can't be computed before the seed, so every block whose tag is right came through the device's memory interface inside the window, unless it was already on chip. This page states the protocol and that bound; what it leaves of a device's memory bandwidth is [memory bandwidth accounting](/accounting/bandwidth)'s.

## Interface

### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Device | $\mathcal{D}$ | The audited GPU, holding the store $E$ in device memory. |
| Memory challenger | $\mathcal{M}$ | PoUS's memory challenger. It holds PoUS's root and salt and a secret source, runs the clock, and publishes one bit. |

### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `vk` | $N, b$ | PoUS's store, reused unchanged: $N = 2^{19}$ blocks of $b = 2{,}056$ bytes, its root and its salt. |
| `tag` | $h$ | `ro-blake3/v1`, 256-bit tags. |
| `deadline` | $T, \mathrm{RTT}$ | The time the root is due after the seed, 1.2 ms. It must stay under one rebuild of a block, 1.708 ms. |
| `samples` | $s$ | 1,849 uniform samples, with replacement. |
| `slack` | $\varepsilon_s$ | The share of blocks the bound forgives, 1/64, so $k = \lceil (1-\varepsilon_s) N\rceil = 516{,}096$ blocks are certified. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | The root arrived in time, and every sampled tag opened and was right. |
| `reject` | Otherwise. The reason (late, malformed, a bad path, a wrong tag) stays with the challenger. |

## Protocol

Each line is run by the party beside it, and an arrow sends a value to another party. Click a function to see what it computes. Before a window, untimed, the device warms its launch path and fills its L2 cache with another buffer, so no part of $E$ is on chip when the seed arrives.

### Seed

![Seed](/programs/bandwidth-audit#seed)

### Tag

![Tag](/programs/bandwidth-audit#tag)

#### The tag

Each block's tag is keyed BLAKE3 over its index and the whole block, under a 32-byte key that is SHA-512 of the seed's prefix. The seed comes first: with a tag of the form $H(E_j, \sigma)$ the device could precompute a midstate per block and answer reading at most $1/32$ of $E$. The tags go into an RFC 6962 SHA-512 tree, 16 to a leaf, whose root binds every tag before any sample is drawn. A faster polynomial tag over $\mathrm{GF}(2^{31}-1)$ exists, but it is uncertified: a precomputed evaluation structure fitting in spare device memory answers it without reading $E$.

### Sample

![Sample](/programs/bandwidth-audit#sample)

The samples are drawn only for a root that arrived in time, and the openings are untimed: the root already binds every tag.

## Security

### The model

A device holds $S$ bits on chip when the seed arrives, can read at most $c$ bits from side sources laid out before the seed (the host, disks, the network, a peer GPU), may regenerate at most $G$ blocks, and makes at most $q$ queries to the tag. Its reads from device memory are counted as ingress. Whether a real device has these $S$, $c$ and $G$ is a question about hardware, taken up on [memory bandwidth accounting](/accounting/bandwidth#physical-assumptions).

### Assumptions

- **The tag is a random oracle** at a fresh seed: [random oracle](/assumptions/random-oracle).
- **The store is incompressible.** PoUS's store reads as a uniform one: its blocks can't be described in fewer bits than they hold. BLAKE3's chunks 1 and 2 don't bind the index, so equal chunks would share work; P2's blocks don't repeat, so this costs nothing.
- **Secret seeds.** The challenger's source is secret, and no window is reopened or run concurrently with another over the same store. The verifier's refusal of concurrent windows, and binding the device into the window key, are in progress.

### Completeness

A device that reads all of $E$ and tags it honestly passes, with ingress exactly $Nb$ (`HonestPasses`).

### Ingress bound

For any device in the model, with $I$ its ingress from device memory in the window,

$$
\Pr\big[\mathsf{accept} \,\wedge\, I + S + c + Gb + \lambda < kb\big] \;\le\; \Big(\frac{k-1}{N}\Big)^{s} + \frac{s}{2^h} + \frac{\binom{q}{k}}{2^{\lambda}}
$$

(`Bandwidth.Guarantees.AuditRO`, proved with no named assumption). On an accept, the device read at least $kb - S - c - Gb - \lambda$ bits from its memory within $T + \mathrm{RTT}$.

~~~proof
The three terms are the three ways to pass without the reads. The samples can all miss the at most $k-1$ blocks the device never tagged; a tag can be guessed; or a device that tagged $k$ blocks while holding less information than they carry would describe the store in fewer bits than it has, which the compression term $\lambda = 40k + 41$ bits pays for.
~~~

At the deployed point the error is $2^{-42.01} + 2^{-245.1} + 2^{-41} \le 2^{-40.42}$. A relay variant, where a peer may compute tags for the device, charges side sources about $c(1 + b/(h - \log_2 N))$ bits instead of excluding them.

## Parameters

| Quantity | Value |
| --- | --- |
| Store | $2^{19}$ blocks of 2,056 bytes, 1.078 GB |
| Samples, slack | $s = 1{,}849$, $\varepsilon_s = 1/64$, $\lambda \approx 2.6$ MB |
| Error | $2^{-40.42}$ |
| Deadline | 1.2 ms |
