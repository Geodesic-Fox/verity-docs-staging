A network profile fixes the round-trip time (RTT) and bandwidth that a result's interaction is charged at. Evaluations use one reference profile, the same datacenter, and every published overhead is computed at it. The other profiles are sensitivity profiles: each changes one of the two numbers, to show how a result moves on a slower network. This page lists the profiles from `catalog/census/networks.json` on the verity repo's main branch. [Performance](/proof-systems/performance#interaction) defines the cost model they feed.

## Profiles

Each profile stores its RTT as `rtt_s`, in seconds, and its bandwidth as `bandwidth_bps`, in bits per second. The table shows them in milliseconds and gigabits per second:

| Id | Label | RTT | Bandwidth | Role | Source |
| --- | --- | --- | --- | --- | --- |
| `dc-1ms-100gbps` | same datacenter (reference) | 1 ms | 100 Gb/s | Reference | Reporting standard |
| `rtt-20ms-100gbps` | 20 ms RTT, 100 Gb/s | 20 ms | 100 Gb/s | Sensitivity | Reporting standard, drill-down profile |
| `rtt-100ms-100gbps` | 100 ms RTT, 100 Gb/s | 100 ms | 100 Gb/s | Sensitivity | Reporting standard, drill-down profile |
| `dc-1ms-10gbps` | 1 ms RTT, 10 Gb/s | 1 ms | 10 Gb/s | Sensitivity | Reporting standard, drill-down profile |

The reporting standard is the rule that interaction time is compute, plus rounds times RTT, plus bytes over bandwidth, with the same datacenter as the reference.

## The reference network

The reference network, `dc-1ms-100gbps`, is the same datacenter: 1 ms RTT and 100 Gb/s. Exactly one profile has the role `reference`, and the benchmark reads it as `census.REFERENCE_NETWORK`. The effects are:

- Every Table 2 cell is evaluated at the reference network.
- Each result in the render names that network by id.

Cite the reference by its id, `dc-1ms-100gbps`, rather than restating its numbers. The [contributing guidelines](/contributing#citing-an-entry) cover how to cite an entry.

## Sensitivity profiles

Each sensitivity profile changes exactly one of RTT and bandwidth from the reference, so its effect reads on its own:

- `rtt-20ms-100gbps` and `rtt-100ms-100gbps` raise the RTT and keep 100 Gb/s.
- `dc-1ms-10gbps` keeps 1 ms and cuts the bandwidth to 10 Gb/s.

A test in `benchmarks/numerical/tests/bench/test_census_data.py` enforces the one-axis rule. The render reports each result's overhead at every profile, keyed by profile id, and the interaction drill-down shows one column per profile.

## How a profile enters the cost

A profile supplies two terms of the interaction time. With compute as the prover's compute plus the verifier compute the prover waits on, the renderer charges:

$$
t = t_{\mathrm{compute}} + \mathrm{rounds} \times \mathrm{RTT} + \frac{8\,(\mathrm{bytes}_{\mathrm{up}} + \mathrm{bytes}_{\mathrm{down}})}{\mathrm{bandwidth}}
$$

The factor of 8 converts bytes to bits, since bandwidth is in bits per second. A result verified from its proof file counts no rounds, so only its bandwidth term depends on the profile. [Performance](/proof-systems/performance#interaction) defines each term and how the overhead is computed from it.

This diagram shows where a profile's two numbers go, and where the resulting interaction time is reported:

~~~mermaid
flowchart LR
  rec["A result's compute, rounds and bytes"]
  ref["Reference profile<br/>dc-1ms-100gbps"]
  sens["Sensitivity profiles"]
  t["Interaction time, per profile"]
  cell["Table 2 cell"]
  drill["Interaction drill-down"]
  rec --> t
  ref -->|"RTT, bandwidth"| t
  sens -->|"RTT, bandwidth"| t
  t -->|"at the reference"| cell
  t -->|"at every profile"| drill
~~~
