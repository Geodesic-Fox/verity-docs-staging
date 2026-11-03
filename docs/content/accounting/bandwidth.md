The bandwidth protocol of record since 12–15 Oct is the [remote bandwidth audit](/docs/accounting/bandwidth/remote), which treats a whole node as one resource of read capacity $R$. This page describes the per-GPU audit it grew from.

Memory bandwidth accounting bounds how much of a device's memory bandwidth could have gone to undeclared reads. It has two layers. The cryptographic one, the [bandwidth audit](/docs/accounting/bandwidth/audit), secures a lower bound: within a window of $T + \mathrm{RTT}$, the device read at least $I_{\mathrm{cert}} = kb - S - c - Gb - \lambda$ bits of its PoUS store from its memory. The physical one, this page, bounds what the device's memory interface can deliver in that window, and the headroom is the difference. The audit also places the store: blocks read from device memory inside the window were in device memory, which [memory accounting](/docs/accounting/memory)'s bound alone doesn't say.

## Headroom

A device whose memory delivers at most $\mathit{BW}$ bytes a second has, on an accepted window,

$$
\underbrace{\mathit{BW}\,(T + \mathrm{RTT})}_{\text{capacity, physical}} \;-\; \underbrace{(kb - S - c - Gb - \lambda)}_{\text{certified, cryptographic}}
$$

left for other reads, except with the audit's error, $2^{-40.42}$. The headroom splits in two:

- **Honest overhead:** the window is longer than a raw read of the store, since tagging and committing take time on top of reading.
- **Soundness slack:** $S + c + Gb + \lambda$ plus the forgiven $\varepsilon_s$ of the store: what was on chip, what side links could deliver, and the sampling and compression terms.

## Physical assumptions

The audit's bound takes $S$, $c$ and $G$ as parameters. These fix them for a device:

| Assumption | What it asks | Value on the RTX PRO 6000 Blackwell Server | Kind |
| --- | --- | --- | --- |
| On-chip state $S$ | Nothing beyond the L2, the registers and L1/shared memory holds data across the seed. | 239,992,832 B, 22.3% of the store: 128 MiB of L2; for each of 188 SMs, 256 KiB of registers, 128 KiB of L1 and shared memory and 160 KiB of other stores; and 1 MiB at the chip level | Measured from device properties, with the red team's correction for instruction and constant caches, uniform registers, TLBs and chip-level buffers. |
| Side link $c$ | Side sources reach the device only through its PCIe link, at most `cap_side` per second. | 63.0 GB/s (PCIe Gen5 x16 raw); measured 56.6 GB/s pinned copy | Measured ceiling. It holds only for a whole GPU without NVLink, not a MIG slice: at NVLink's 900 GB/s the certificate falls to nothing. |
| Regenerations $G$ | No block can be rebuilt within the window. | 0: $T + \mathrm{RTT}$ is under one cooperating P2 root, 1.708 ms; the fastest GPU root is 18.53 ms | Measured. |
| Side sources carry data | Side sources hold copies of data, not tags computed elsewhere, and every device that could hold a copy of $E$ is audited in the same window or isolated. | | Model claim. A co-audited helper interleaving at its measured read rate covers about 92% of another device's blocks, so the per-device bound holds only for isolated devices; stating it for the co-audited set instead is Daniel's call. |
| Peak bandwidth $\mathit{BW}$ | The device's memory can't deliver more than $\mathit{BW}$. | 1,476 GB/s measured raw read of the store, and 1,539 GB/s the best bare read measured on this card; 1.597 TB/s by the Server Edition's datasheet | Measured, or declared. |

## Numbers

The red team granted the rate at `5761861fd`. At $T = 1.2$ ms and $s = 1{,}849$, an accepted window certifies at least 741,353,308 B of the store (68.8%) within $T + \mathrm{RTT}$: 618 GB/s with $\mathrm{RTT} = 0$, and 722,448,693 B (67.0%), 482 GB/s, with a 0.3 ms allowance. The error is $2^{-40.42}$. The measured times, at the 1.2 ms deadline:

| Quantity | Value |
| --- | --- |
| Honest pass, `ro-blake3/v1` | 0.976 ms (L2 clean), 50 of 50 windows accepted at a p50 of 1.012 ms |
| Raw read of the store | 0.730 ms, 1,476 GB/s |

## Status

- **Proved, in review ([#1806](https://github.com/danielreuter/verity/pull/1806)):** the ingress bound and completeness, with no named assumption. A relay variant is on a branch, not yet reported or reviewed.
- **In review ([#1805](https://github.com/danielreuter/verity/pull/1805)):** the protocol, its reference code and the GPU tagger. The red team granted `5761861fd` on two conditions, one challenger state per store and a device id the challenger reads itself; both are fixed and await its check.
- **Open:** joining the bound to the covert residual of [#1807](https://github.com/danielreuter/verity/pull/1807), today a worst case over each audit's coins with a per-run form being proved; and whether to state the bound for a co-audited set.
