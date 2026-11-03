These guidelines cover Verity's reference data so far. What a code change must pass is still to be written here.

The reference data, the Census, is the fixed quantities that benchmarks are computed against, and that other pages cite. It lives in the `catalog/census/` directory of the verity repo as JSON files, one per kind of entry, and each file validates against its own JSON Schema. Pages, the benchmark and its table render cite an entry by its id instead of restating its numbers, so a value lives in one place. The directory holds data only: nothing imports it as code, so it can move to its own repository unchanged.

## What the Census holds

Each kind of entry has its own file, with a schema under `catalog/census/schemas/`:

| Kind | File | What an entry holds | Listed on |
| --- | --- | --- | --- |
| Hardware line | `hardware.json` | One device running one operand datatype, with its dense tensor-core peak at FP32 accumulate | [Accelerators](/hardware/accelerators) |
| Datatype | `datatypes.json` | An operand format, shown as its common name, then its precise format | [Accelerators](/hardware/accelerators#datatypes) |
| Network profile | `networks.json` | A round-trip time and bandwidth, with the profile's role | [Networks](/hardware/networks) |
| Subcircuit template | `subcircuits.json` | A template with typed parameters, with every subcircuit (the template with each parameter bound) under it | [Inference](/workloads/inference#subcircuit-templates) |
| Input set | `input_sets.json` | The frozen input set of one subcircuit: its dataset, size, manifest digest, seed and provenance | This page, below |

Models aren't in the Census yet. The Census README plans for it to grow into a knowledge base of hardware, ML models and workloads, and [Inference](/workloads/inference#what-a-model-entry-will-hold) describes what a model entry will hold.

The Census never encodes proof units or replay units. Those are roles that [sampled proofs](/proof-systems/sampling) assigns, and applications choose them per run.

### Input sets

An input set is a batch of inputs to one subcircuit, with provenance: either captured from real model runs or generated from a seeded recipe. Each subcircuit has one frozen input set today:

| Id | Subcircuit | Provenance | Inputs | Seed |
| --- | --- | --- | --- | --- |
| `bench-instances-v1` | [sm80 BF16](/assumptions/gemm-coordinate/k1536/sm80-mma-bf16) | Captured | 4096 | None |
| `bench-instances-bf16-hopper-v1` | [sm90 BF16](/assumptions/gemm-coordinate/k1536/sm90-mma-bf16) | Synthetic | 4096 | 20260922 |
| `bench-instances-fp8-hopper-v1` | [sm90 FP8](/assumptions/gemm-coordinate/k1536/sm90-wgmma-e4m3) | Synthetic | 4096 | 20260922 |
| `bench-instances-fp8-ada-v1` | [sm89 FP8](/assumptions/gemm-coordinate/k1536/sm89-mma-e4m3) | Synthetic | 4096 | 20260922 |
| `bench-instances-nvfp4-sm120-v1` | [sm120 FP4](/assumptions/gemm-coordinate/k1536/sm120-mma-e2m1-nvf4) | Synthetic | 4096 | 20260922 |

Every input set's size equals its template's reference batch, 4096 inputs for the [GEMM coordinate](/assumptions/gemm-coordinate). Each entry's `manifest_sha256` pins its contents: for a captured set it's the sha256 of the set's manifest file, and for a synthetic set it's the sha256 of the recipe string that generates it.

## Ids

Every entry has an `id` that is unique within its file. The form depends on the kind of entry:

| Kind | Form | Example |
| --- | --- | --- |
| Hardware line | The device slug, a slash, then the datatype id | `a100-sxm4-80gb/bf16`, `rtx-4090/e4m3` |
| Datatype | The operand dtype, as the instruction registry names it | `bf16`, `e4m3`, `e2m1` |
| Network profile | Kebab-case | `dc-1ms-100gbps` |
| Subcircuit template | Kebab-case | `gemm-coordinate` |
| Subcircuit | The template id, `k` with the value of K, then the semantics | `gemm-coordinate/k1536/sm90-wgmma-e4m3` |
| Input set | Its dataset name, slugged | `bench-instances-fp8-ada-v1` |

A subcircuit's semantics segment is the exact tensor-core instruction's architecture, operation and types, without its shape. The full instruction, such as `sm90.wgmma.m64n8k32.e4m3`, is the subcircuit's `semantics` parameter.

Ids are stable, because renders cite them and history is built over them:

- A changed quantity gets a new entry with a new id.
- An id that has been cited is never renamed or reused.

## Citing an entry

Cite a Census entry by its id, and leave its value to the reference page that lists it. The same rule holds in prose, in results and in code.

This diagram shows what reads the Census files directly, and what cites their entries by id:

~~~mermaid
flowchart TB
  tests["Census tests"]
  census[("census/*.json")]
  bench["Benchmark<br/>verity_numerical.bench"]
  core["Verity core<br/>never reads the Census"]
  results["Benchmark results"]
  pages["Docs pages"]
  tests -->|"validate on every change"| census
  census -->|"read directly"| bench
  core -->|"a target names its anchor device"| bench
  bench -->|"renders"| results
  results -.->|"cite by id"| census
  pages -.->|"cite by id"| census
~~~

In docs, name the id and link the page that lists it. For example, write that a result is evaluated at the reference network, [`dc-1ms-100gbps`](/hardware/networks), and leave its round-trip time and bandwidth to the Networks page.

In benchmark results, the render cites entries by id. Each result names:

- its subcircuit;
- its input set;
- the hardware line whose peak sets its native rate;
- the network profile it is evaluated at.

In code, the benchmark package reads the Census directly. `verity_numerical.bench.census`, in `benchmarks/numerical`, loads each file as a mapping from id to entry:

~~~python
from verity_numerical.bench import census

peak = census.HARDWARE["rtx-4090/e4m3"].flop_per_second
reference = census.REFERENCE_NETWORK.id  # "dc-1ms-100gbps"
~~~

Set `VERITY_CENSUS` to the directory when the Census lives somewhere other than the repo root.

Verity core never reads the Census. Core takes such numbers as parameters: a target names only its anchor device, and the benchmark reads that device's peak from `hardware.json`. The test `verity/tests/test_boundaries.py` enforces the boundary.

## How entries are sourced

Every entry carries the sources its values were read from. The rules are:

- **Sources:** each entry has `sources`, a non-empty list of `{label, href?}`. The label names the document and the table or row the value came from.
- **Methodology:** each hardware line also states its `methodology`. Peaks are datasheet dense figures at the FP32 accumulate width the relations use. A fused multiply-add counts as two FLOP, and sparsity figures are never used.
- **Measurements:** a measured value, rather than a datasheet one, says how it was measured and names the artifact that holds the measurement. Artifacts live in the evidence store that [Autoresearch](/autoresearch) describes.

## How entries are reviewed

Tests in `benchmarks/numerical/tests/bench/test_census_data.py` check the Census on every change. They check that:

- every file validates against its JSON Schema (draft 2020-12), and every id is unique within its file;
- every id a render cites keeps its value, so changing a pinned value fails the test and needs a new entry instead;
- the directory holds only the README, the data files and their schemas;
- no id encodes a replay unit or a verification unit;
- every hardware line is a dense, FP32-accumulate peak whose datatype is a Census datatype;
- every subcircuit resolves to a hardware line, and every hardware line belongs to a subcircuit;
- each sensitivity network differs from the reference network in exactly one of round-trip time and bandwidth.
