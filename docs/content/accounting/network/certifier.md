The network certifier fixes when a node's frames leave. It is a device of the auditor's on each uplink: it releases exactly $r$ frames of $B$ bytes in every bucket, real frames first, and signs a record of each window. The check accepts a window only if its record is the grid the Program schedules, so a covert sender's only say over timing is the clock sync each window declares. This page states the protocol and the bound an accept gives in the certifier's model; whether a real link meets that model, and what the bound leaves of a link's capacity, is [network accounting](/accounting/network)'s.

## Interface

### Parties

| Party | Symbol | Description |
| --- | --- | --- |
| Node | $\mathcal{N}$ | The developer's machines behind the certifiers, the *spatial unit*. It runs the Program and hands each egress frame to its link's certifier. |
| Certifier | $\mathcal{C}$ | The auditor's device on one uplink. It releases the link's frames on the grid and signs one record per link-window. |
| Verifier | $\mathcal{V}$ | Checks each link-window's certificate and record. |

### Public parameters

| Parameter | Symbol | Description |
| --- | --- | --- |
| `grid` | $T, \tau_b, r, B, Q$ | $T$ buckets of $\tau_b$ per window, $r$ frames of $B$ bytes in every bucket, and the queue capacity $Q$. |
| `sigma` | $\Sigma_{\mathrm{sync}}$ | The clock-sync values $(\delta, \rho)$ a window may declare: an offset in buckets and a rate in frames per bucket. |
| `program` | | Each egress frame's content, its anchor (the bucket of the request it answers) and its logical index $\lambda$ in its session, computed from the ingress and the content advice. |
| `advice` | $\mathcal{A}$ | The content advice the audit admits, fixed before the run; $A_c = \log_2 \lvert\mathcal{A}\rvert$. |
| `ingress` | $r_{\mathrm{in}}, \tau_{\mathrm{in}}$ | The ingress links' allocation and bucket width. |
| `session` | | The 32-byte identifier the challenger draws for this certifier session. |

### Outputs

| Value | Description |
| --- | --- |
| `accept` | Every link-window of the run passed its check. |
| `reject` | Otherwise. A rejected window shows only that it was rejected; later windows are still checked. |
| `charge` | With an accept, the timing bits the run is charged: $\log_2 \lvert\Sigma_{\mathrm{sync}}\rvert$ per window, and $A_c$ once. |

## Protocol

Each line is run by the party beside it, and an arrow sends a value to another party. Click a function to see what it computes. The listing follows one egress link; every link of the spatial unit runs it, and ingress links are certified the same way at $r_{\mathrm{in}}$ and $\tau_{\mathrm{in}}$.

### Registration

![Registration](/programs/network-certifier#register)

### Release

![Release](/programs/network-certifier#release)

Every bucket carries exactly $r$ frames, so the wire's load says nothing; a receiver that can tell padding from a real frame sees only the occupancy $n_t$, which the queue and the schedule fix.

#### The schedule

Each window declares one clock sync from $\Sigma_{\mathrm{sync}}$, and every egress link of the spatial unit declares the same one: the bound charges one sync per window for all links, where a sync per link would multiply the charge by their number. Frame $k$ becomes eligible at bucket $\mathit{anchor}_k + \delta + \lfloor \lambda_k/\rho \rfloor$ under its anchor's window's sync, and is handed over at $h(k) = \max(\mathrm{eligible}(k), h(k-1))$, so a window's grid reads only its own and earlier syncs.

### Certification

![Certification](/programs/network-certifier#certify)

#### The record and the certificate

The record has a fixed binary layout, integers big-endian, every field of fixed width or length-prefixed, so it parses one way:

~~~text
R           len(link) || link || direction || window || T || r || B || τ_b || status || deadline
            || parameters (64 B) || n_0 ... n_{T-1} || root (64 B)
digest      tagged SHA-512 of R, under "verity-network-certifier/record/v2"
leaf(f)     SHA-512(block("verity-network-certifier/frame/v2\0" || u32be B) || f)
node(a, b)  SHA-512(block("verity-network-certifier/node/v2\0") || a || b)
message     SHA-512([tag] || I || [[session] || [link] || [direction] || u64be window] || [digest])
            tag = "verity/network-certificate-message/v2", [x] = u64be len(x) || x
~~~

The status is complete, or the first fault's reason, with no time or count. The frame tree holds the window's real frames in grid order, then empty leaves, at depth $\lceil \log_2(Tr) \rceil$, so padding never enters it. The message binds every certificate to the challenger-drawn session as well as its link-window. The signature is LMS over SHA-512 ($n = 64$, $w = 1$, $h = 20$), and a certifier never reuses a leaf.

### Check

![Check](/programs/network-certifier#check)

#### The check

An egress link-window passes when it has exactly one record, settled by the verdict deadline; its certificate verifies under the certifier's key and names its session, link, direction and window; its status is complete; its sync is in $\Sigma_{\mathrm{sync}}$ and is the spatial unit's for the window; and its record is the Program's grid, slot for slot. An ingress link-window passes when it has one record by the deadline, its certificate verifies, its status is complete and its parameters are the registered ones.

Certificates are witness. In the protocols the developer is to prove in zero knowledge that each passes the check; today the verifier of record is a stand-in that reads the records itself.

## Security

### The model

The bound is stated about what the wire carries, and takes two facts about the device as its model: everything the certifier puts on the wire is a function of its record (*regeneration*, W2), and each bucket's timing falls in one of $D$ classes (*bounded jitter*, J). Whether a physical certifier meets them is a question about hardware, taken up on [network accounting](/accounting/network#physical-assumptions). The certifier's own rules (frames of $B$ bytes, left-packed rows, an untimed status, fail-closed faults) are enforced by its code.

### Assumptions

- **Collision resistance.** Equal record digests mean equal records: [CR · SHA-512](/assumptions/cr/sha-512).
- **Unforgeable certificates.** No one but the certifier signs a message under its key: EUF-CMA for LMS over SHA-512. The message names the challenger-drawn session, and the certifier refuses to start a session identifier it has started before.
- **Fixed advice.** The content advice, the Program's frames and $\Sigma_{\mathrm{sync}}$ are fixed before the run, independently of any secret, and the audit refuses advice outside $\mathcal{A}$.

### Completeness

An honest certifier's output passes the check (`DeviceOutputAccepted`, for one link pair). An honest node misses a window when no value of $\Sigma_{\mathrm{sync}}$ meets it on every egress link, and calibration sizes $\Sigma_{\mathrm{sync}}$, $r$ and $r_{\mathrm{in}}$ from honest traces so that it misses at most $10^{-4}$ of its windows.

### Timing bound

Take any sender inside the spatial unit, any operator driving the ingress, and a set $Z$ of secrets that a decoder reading the wire's first $n$ buckets always recovers, each from a run the audit accepts for those buckets, with $n \le mT$ and $n \le WT$. Then

$$
\log_2 |Z| \;\le\; A_c + \min(W, m)\,\log_2 \lvert\Sigma_{\mathrm{sync}}\rvert + n \log_2 D
$$

$W$ is the number of windows the audit checks and $m$ the number the horizon reaches. The bound has no error term, and holds under W2 and J (`NetTiming.Guarantees.EncardDecodableLeConstantRate`). At $16 \times 8$ sync values and $D = 1$ it is $A_c$ plus 7 bits per window. Two forms refine it:

- **Per window.** Over the run's first $m$ whole windows: $A_c$ once, then $\log_2 \lvert\Sigma_{\mathrm{sync}}\rvert + T \log_2 D$ bits per window, counted from the run's first window.
- **Ingress.** What arrival times can deliver into the unit: $T \log_2(r_{\mathrm{in}} + 1)$ bits per link-window, plus $T \log_2 D$ of jitter, on runs whose statuses are all complete. This is the unit of [NCI](/policies/nci)'s charge.

A rejected window carries no bound: it may already have carried the link's whole capacity, about $8TrB$ bits.

### From the check to the bound

The theorem is about accepted runs of the model. Two more connect it to the check's code, with nothing assumed of SHA-512 or LMS, for a unit of one link pair (one certifier, one egress and one ingress link): if the Lean check accepts and the certifier runs its code (`DeviceIntact`), every observation of the run is an accepted run of the model under the declared advice, or the run's own data holds a SHA-512 collision or a certificate the certifier never signed in this session (`AcceptedRunsAreProgramRuns`, `EncardAcceptedObservationsLe`). The bound in the model holds for any number of links sharing one sync; its connection to the code is proved only for one link pair so far. Because the signed message binds the challenger-drawn session and the certifier refuses to start the same identifier twice, a certificate it never signed in that session is an LMS forgery.

## Parameters

| Charge, at $T = 600$, $16 \times 8$ sync values, $D = 1$ | Per window | Per day of 1,440 windows |
| --- | --- | --- |
| Egress, $A_c$ left out | 7 bits | 10,080 bits |
| Egress, with 8 capacity profiles fixed per audit (proposed) | 7 bits, plus 3 bits once | 10,083 bits |
| Ingress, at $r_{\mathrm{in}} = 34$ | 3,077.6 bits per link-window | 4.4 Mbit per link |

The content advice is not yet declared: today the schedule is the workload manifest's arrival steps, which $A_c$ doesn't bound.
