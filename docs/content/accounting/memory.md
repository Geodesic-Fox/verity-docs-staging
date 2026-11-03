Memory accounting bounds how much of a device's memory could hold something other than the committed weights. It has two layers. The cryptographic one, [proof of useful space](/accounting/memory/useful), secures a lower bound: a server that keeps at most $S_{\mathrm{cert}} = \lfloor \tfrac{18}{19}\lvert C\rvert \rfloor$ bits throughout setup and the session fails, where $C$ is an encoding of the weights it serves from. The physical one, this page, takes an upper bound on the memory the device has, and the headroom is the difference. Memory accounting is used by the [onsite](/protocols/onsite) protocol, whose memory challengers sit at the developer's site.

## Headroom

A device with $M$ bytes of memory that passes the audit has at most

$$
\underbrace{M}_{\text{capacity, physical}} \;-\; \underbrace{\lfloor \rho \lvert C\rvert \rfloor}_{\text{certified, cryptographic}}
$$

left for anything else at some point of the session, except with probability $\delta + \varepsilon$. Between audits the bound says nothing, until a time-averaged audit for P2 lands. The headroom splits in two:

- **Uncommitted memory**, $M - \lvert C\rvert$: what the store doesn't cover. Today the store is fixed at $2^{19}$ blocks, 1.078 GB, so on a 102 GB card nearly all of it is here. A larger store would close it, at the cost of setup: more roots to compute.
- **Soundness slack**, $(1 - \rho)\lvert C\rvert$: what the bound concedes, $1/19$ of the store.

The bound is on the server's whole state, host memory included. It doesn't say where $C$ sits: placing it in device memory is memory bandwidth accounting's job.

## Physical assumptions

The space bound is stated in a ring model, where an answer takes at most $D = 16{,}446$ sequential multiplication rounds. These make the deadline enforce that:

| Assumption | What it asks | Kind |
| --- | --- | --- |
| Step floor | No 16,448-bit modular root, nor anything equivalent, finishes within $\Delta + \mathrm{RTT}$ on the allowed hardware. | A modelled floor of 361.55 ns a squaring (Zen 5 at 5.7 GHz), divided by a measured 3.49× for eight cooperating cores: about 103.6 ns a round, so a root takes at least 1,704 µs, 2.0× the 854 µs limit. The fastest measured root is 12.8 ms. |
| Hardware class | CPU or GPU cores, cooperating within one chiplet. ASICs and FPGAs are outside it. | Declared. A GPU squaring takes 22–37 µs on one SM, so the CPU floor binds. |
| Perfect isolation | During an audit the server gets no outside help: every bit it can reach, in device memory, host memory, disk, caches or other devices, counts toward its state. | Assumed; procedural, not enforced by the wire. |
| Deadline and RTT | $\Delta = 500$ µs, and the allowance is measured on the same transport, capped at 354 µs. | Declared; on-node round trips are 10–22 µs at p99.9. |
| One session per audit | The memory challenger runs one session per setup, with coins drawn after the state is fixed. | Partly in code ([#1815](https://github.com/danielreuter/verity/pull/1815)): the session is bound to the setup's root. Refusing a reused session id is in progress. |
| The challenger runs as built | The memory challenger runs its stated code on its host. | Assumed; nothing attests it. |

## Numbers

| Quantity | Value |
| --- | --- |
| Device, RTX PRO 6000 Blackwell | about 102 GB |
| Certified, $S_{\mathrm{cert}}$ | about 1.021 GB of a 1.078 GB store |
| Headroom | about 101 GB |
| Decode on the GPU | about 50–70 GB/s, against about 1.5 TB/s device-memory reads ([#1804](https://github.com/danielreuter/verity/pull/1804)) |

P2 can't decode at device-memory rate, about 30× short, and a narrower block that would decode faster puts a root inside the deadline. So serving the weights from $C$ costs far more than serving plaintext. A store that fills the card is a separate question, of setup cost, which is being sized now.

## Status

- **Proved, in review ([#1790](https://github.com/danielreuter/verity/pull/1790)):** the space bound at the deployed point, from `P2RingAuditSecure` and the coins' hiding; completeness; that the conjecture fails from two roots' depth.
- **Proved, on main:** the abstract rows the bound rests on, for every store size from $2^8$ to $2^{23}$ blocks.
- **Conjectured:** that the ring game is hard (`P2RingAuditSecure`), and that P2 as deployed is no easier than the ring game (the instantiation claim).
- **Open:** binding each audit's session id into the check, after [#1815](https://github.com/danielreuter/verity/pull/1815)'s binding to the setup's root; the composed check of a run, in review in [#1814](https://github.com/danielreuter/verity/pull/1814), whose setup half is unproved; a store that fills the card; and the time-averaged audit for P2.
