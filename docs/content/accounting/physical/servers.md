A server is a node: eight accelerators and the host, with its CPUs, DRAM and NICs. The audits take it as one prover, with no assumption about which of its devices held or read what: [proof of useful space](/accounting/pous) bounds its whole state, and [proof of useful bandwidth](/accounting/poub) its reads over every tier.

## The server's whole state

Proof of useful space's bound is on the server's whole state, host memory included. It doesn't say where $C$ sits: that it is read from device memory while serving is [proof of useful bandwidth](/accounting/poub#on-pouss-store)'s, which onsite runs over the same store.

## Memory assumptions

The space bound is stated in a ring model, where an answer takes at most $D = 16{,}446$ sequential multiplication rounds. These make the deadline enforce that:

| Assumption | What it asks | Kind |
| --- | --- | --- |
| Step floor | No 16,448-bit modular root, nor anything equivalent, finishes within $\Delta + \mathrm{RTT}$ on the allowed hardware. | A modelled floor of 361.55 ns a squaring (Zen 5 at 5.7 GHz), divided by a measured 3.49× for eight cooperating cores: about 103.6 ns a round, so a root takes at least 1,704 µs, 2.0× the 854 µs limit. The fastest measured root is 12.8 ms. |
| Hardware class | CPU or GPU cores, cooperating within one chiplet. ASICs and FPGAs are outside it. | Declared. A GPU squaring takes 22–37 µs on one SM, so the CPU floor binds. |
| Perfect isolation | During an audit the server gets no outside help: every bit it can reach, in device memory, host memory, disk, caches or other devices, counts toward its state. | Assumed; procedural, not enforced by the wire. |
| Deadline and RTT | $\Delta = 500$ µs, and the allowance is measured on the same transport, capped at 354 µs. | Declared; on-node round trips are 10–22 µs at p99.9. |
| One session per audit | The memory challenger runs one session per setup, with coins flipped after the state is fixed. | Partly in code ([#1815](https://github.com/danielreuter/verity/pull/1815)): the session is bound to the setup's root. Refusing a reused session id is in progress. |
| The challenger runs as built | The memory challenger runs its stated code on its host. | Assumed; nothing attests it. |

## Bandwidth headroom

Over a session of span $\Sigma$, a node of read capacity $R$, its GPUs' HBM plus its host's DRAM, that passes proof of useful bandwidth made at most

$$
\underbrace{R\Sigma}_{\text{capacity, physical}} \;-\; \underbrace{(1 - \gamma) R\Sigma}_{\text{certified, cryptographic}} \;=\; \gamma R \Sigma
$$

reads of anything else, and each window alone at most $\gamma_t$ of its own span's. $R$ is the verifier's, reported twice: against the node's specified bandwidth, 13.60 TB/s, the headline, and its measured one, 12.92 TB/s, which every reading below uses. At the measured $R$ the worst window's $\gamma_t$ is under 1% with the store over every tier, and at the specified $R$ it is 5.82–5.85%, nearly all of it the gap between the two. The terms of $\gamma$ are on [proof of useful bandwidth](/accounting/poub#bandwidth-bound).

## The node's capacities

Proof of useful bandwidth takes every capacity as the node's, the sum over its devices, whatever share of the node the store is on:

- **Read capacity** $R$, over every registered tier, its eight GPUs' HBM plus its host's DRAM: $8 \times 1{,}539 + 606.8 = 12{,}918.8$ GB/s measured, and $8 \times 1{,}597 + 819.2 = 13{,}595.2$ GB/s specified, from the RTX PRO 6000 Server Edition and 16 channels of DDR5-6400.
- **On-chip storage** $S_{\mathrm{chip}}$, every GPU's and the host's: $8 \times 263{,}163{,}904 + 1{,}000{,}341{,}504 = 3{,}105{,}652{,}736$ bytes. The host's part bounds the whole host, two Xeon 6776P sockets of 64 cores, whatever share of it the VM gets: their caches at the guest's CPUID sizes, with allowances for registers and buffers.
- **Squaring ceiling** $C_{\mathrm{sq}}$, eight GPUs' shares: $2.003 \times 10^{11}$ squarings a second at 1,024 bits.

A device the store isn't on can still hold store bytes on chip and re-encode blocks, which is why $S_{\mathrm{chip}}$ and $C_{\mathrm{sq}}$ are the node's in every session.
