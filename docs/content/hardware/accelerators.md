This page describes each accelerator in two ways, which are vetted differently:

- [Hardware lines](#hardware-lines): its dense tensor-core peak per datatype, read from datasheets, each citing its source.
- [Silicon](#silicon): the exact semantics of its arithmetic, which circuits call, each established by measurement on the hardware.

A hardware line is one device running one operand datatype, with its dense tensor-core peak at FP32 accumulate. The benchmark takes a subcircuit's native rate from the line of its device and datatype, and every result cites that line by id. There are five lines today, across four devices, all read from datasheets. This page lists them from `catalog/census/hardware.json` on the verity repo's main branch, with the datatypes from `catalog/census/datatypes.json`.

## Hardware lines

Each line's peak is its `flop_per_second` field, shown here in TFLOP/s ($10^{12}$ FLOP per second). Every source is an NVIDIA datasheet or whitepaper:

| Id | Name | Datatype | Peak | Accumulate | Source |
| --- | --- | --- | --- | --- | --- |
| `a100-sxm4-80gb/bf16` | A100 SXM4 | BF16 | 312 TFLOP/s | FP32 | A100 datasheet, Ampere whitepaper |
| `h100-sxm5-80gb/bf16` | H100 SXM5 | BF16 | 989.4 TFLOP/s | FP32 | Hopper whitepaper[^hopper-bf16] |
| `h100-sxm5-80gb/e4m3` | H100 SXM5 | FP8 (E4M3) | 1978.9 TFLOP/s | FP32 | Hopper whitepaper[^hopper-fp8] |
| `rtx-4090/e4m3` | RTX 4090 | FP8 (E4M3) | 330.3 TFLOP/s | FP32 | Ada whitepaper[^ada] |
| `rtx-5090/e2m1` | RTX 5090 | FP4 (NVFP4, E2M1) | 1676 TFLOP/s | FP32 | RTX Blackwell whitepaper, Appendix A[^blackwell] |

A line's id is the device slug and the datatype id, so the same device appears once per datatype it runs. The [contributing guidelines](/contributing#ids) cover the id rules.

## Methodology

Every line states the same methodology: the datasheet's dense tensor-core peak at FP32 accumulate. A fused multiply-add (FMA) counts as two FLOP, and sparsity figures are never used. Accumulate is always FP32, because that's the accumulate width the relations use, and the schema allows no other value. Where a datasheet headlines a sparse figure, the source label records it beside the dense one, so you can check which figure the Census took.

## Devices

Each line names its device twice: a short `name` for display, and the full datasheet part as `device`. Each line also records the device's memory in bytes, as `memory_bytes`, or `null` where the Census hasn't recorded it. Both H100 SXM5 lines record the same device and memory:

| Name | Device | `memory_bytes` |
| --- | --- | --- |
| A100 SXM4 | NVIDIA A100 SXM4 80GB | 85899345920 (80 GiB) |
| H100 SXM5 | NVIDIA H100 SXM5 80GB | 85899345920 (80 GiB) |
| RTX 4090 | NVIDIA GeForce RTX 4090 | 25769803776 (24 GiB) |
| RTX 5090 | NVIDIA GeForce RTX 5090 | Not recorded (`null`) |

## Datatypes

A line's datatype is an id from `catalog/census/datatypes.json`, named the way the instruction registry names operand dtypes. Each datatype displays as its common name, followed by its precise format when the two differ:

| Id | Display | Bits | Source |
| --- | --- | --- | --- |
| `bf16` | BF16 | 16 | PTX ISA `.bf16`: 1 sign, 8 exponent and 7 mantissa bits |
| `e4m3` | FP8 (E4M3) | 8 | PTX ISA `.e4m3`: OCP FP8, with 1 sign, 4 exponent and 3 mantissa bits, and no infinities |
| `e2m1` | FP4 (NVFP4, E2M1) | 4 | PTX ISA `.e2m1` operands, with UE4M3 block scales over 16 elements (`kind::mxf4nvf4`, NVFP4) |

The table holds only each format's names, width and sources. [Silicon](#silicon) covers the number formats themselves, their casts and the accumulator models.

## How the benchmark uses a line

A subcircuit's target names only its anchor device. The benchmark finds the hardware line for that device and the subcircuit's operand datatype. It counts one GEMM coordinate of length $K$ as $2K$ FLOP, run at the line's peak. Every line belongs to exactly one subcircuit today:

| Subcircuit | Hardware line |
| --- | --- |
| [sm80 BF16](/assumptions/gemm-coordinate/k1536/sm80-mma-bf16) | `a100-sxm4-80gb/bf16` |
| [sm90 BF16](/assumptions/gemm-coordinate/k1536/sm90-mma-bf16) | `h100-sxm5-80gb/bf16` |
| [sm90 FP8](/assumptions/gemm-coordinate/k1536/sm90-wgmma-e4m3) | `h100-sxm5-80gb/e4m3` |
| [sm89 FP8](/assumptions/gemm-coordinate/k1536/sm89-mma-e4m3) | `rtx-4090/e4m3` |
| [sm120 FP4](/assumptions/gemm-coordinate/k1536/sm120-mma-e2m1-nvf4) | `rtx-5090/e2m1` |

The subcircuit's semantics say what is computed, and the hardware line is the device whose peak sets the native rate. The two are one-to-one today. [Inference](/workloads/inference#subcircuit-templates) lists every subcircuit with its parameters.

## Silicon

Silicon is the exact semantics of the accelerators' arithmetic, stated as integer arithmetic on encodings: the floating-point and block-scaled number formats, the casts between them, each tensor-core instruction's accumulator step, and the scalar and special-function operations. Each is registered as a Definition, on words and on bits, so a program calls the hardware's arithmetic rather than an idealized one. A subcircuit template takes its numeric semantics as a parameter, an instruction id, beside its shape: `gemm_coordinate(K=1536, semantics=sm90.wgmma.m64n8k32.e4m3)` is one subcircuit. Proof systems, protocols and integrations all read this one definition, and none of them defines the numerical meaning of a dot product itself.

### Totality

Every function here is total and exact, as [evaluation](/accounting/circuits#evaluation) requires, and matches the hardware bit for bit on every encoding. An accumulator step is stated in two layers: a model of its finite arithmetic, which is where the hardware's grouping, alignment and truncation live, and rules for NaN, infinities, saturation and zero signs, measured like the rest. Together they give a total function, and a Definition registers only that total function.

### Number formats

Four operand formats enter the tensor cores. Each decoder is exact, and the product of two operands is computed exactly as a sign, an exponent and an integer significand, never rounded:

| Format | Sign, exponent, mantissa bits | Bias | Special values and range |
| --- | --- | --- | --- |
| BF16 | 1, 8, 7 | 127 | Exponent field 255 encodes infinities and NaN. The smallest subnormal is $2^{-133}$ |
| E4M3 | 1, 4, 3 | 7 | No infinities. `0x7F` and `0xFF` are NaN, and the largest finite value is 448. The smallest subnormal is $2^{-9}$ |
| E5M2 | 1, 5, 2 | 15 | IEEE-style infinities and NaN. The largest finite value is 57344, and the smallest subnormal is $2^{-16}$ |
| E2M1 | 1, 2, 1 | 1 | No special values. The 16 codes are $\pm\{0, 0.5, 1, 1.5, 2, 3, 4, 6\}$ |

Every accumulator is an FP32 word, IEEE binary32. The Census names the datatypes its subcircuits use, BF16, FP8 (E4M3) and FP4 (NVFP4, E2M1), and [Datatypes](#datatypes) lists them with their sources.

#### Block scales

An FP4 operand carries block scales: one scale byte per block of E2M1 codes, applied losslessly to the block's products. A step of 64 codes takes its scales after its codes, on each side:

- **UE4M3, for NVFP4:** one scale per 16 codes, so 4 scales and 68 words per step. The scale is read from its low seven bits and bit 7 is ignored, so `0x80` is a zero scale like `0x00`. A scale whose low seven bits are `0x7F` is NaN, `0xFF` included. As a multiplier, a scale with exponent field $e$ and mantissa field $m$ is $(8 + m) \cdot 2^{e - 10}$, or $m \cdot 2^{-9}$ when $e = 0$.
- **UE8M0, for MXFP4:** one scale per 32 codes, so 2 scales and 66 words per step. A code $c$ is the scale $2^{c - 127}$, and `0xFF` is NaN.

### Casts

Each cast is a Definition on words:

| Definition | Semantics |
| --- | --- |
| `Bf16ToF32_v1` | Exact widening: the BF16 word becomes the high half of the FP32 word |
| `F32ToBf16Rn_v1` | Round to nearest, ties to even. NaN becomes `0x7FC0` |
| `F2fpBf16_v1` | `cvt.rn.bf16.f32` as the hardware computes it: the same rounding, but NaN becomes `0x7FFF` |
| `F32ToE4m3Sat_v1` | `cvt.rn.satfinite.e4m3x2.f32`: NaN becomes `0x7F`, infinities and values beyond 448 saturate to `0x7E` or `0xFE`, and the rest round to nearest, ties to even |
| `F32ToE2m1Sat_v1` | `cvt.rn.satfinite.e2m1x2.f32`: round to nearest, ties to even, onto the E2M1 grid, saturating at ±6. NaN gives code 7 (+6) |
| `E4m3ToF32_v1` | Exact widening of an E4M3 byte |

`F32ToBf16Rn_v1` and `F2fpBf16_v1` agree on every word that isn't NaN. A GEMM coordinate ends in the hardware cast `F2fpBf16`.

### The accumulator step

A tensor-core instruction computes, for each output coordinate, a step

$$
c' = \mathrm{step}(c, a_0, \dots, a_{k-1}, b_0, \dots, b_{k-1})
$$

from an incoming FP32 accumulator word $c$ and $k$ operand pairs, plus their scales for block-scaled formats, to the FP32 word the silicon writes. No IEEE rounding happens anywhere in a step: the silicon doesn't compute a dot product the way a sequence of FP32 fused multiply-adds would. It sums exact products in fixed-width adders that align and truncate. A dot product of length $K$ is $K/k$ steps chained from a +0 accumulator, in ascending $k$. Two models describe every step: `GroupSum` for BF16 and FP8, and `BlockScaledAlignAdd` for block-scaled FP4.

#### GroupSum

`GroupSum` is the grouped, truncating accumulation that [Hawkeye](https://arxiv.org/abs/2603.20421) (MLSys 2026) recovered from NVIDIA tensor cores, with its parameters generalized. Its parameters are `groups`, how many products each grouped sum takes in $k$ order; `width`, the adder's significand width; and `floor`, its exponent floor. The finite step works like this:

1. The incoming accumulator joins the first group, and each group's result joins the next.
2. Within a group, every term (the accumulator and each exact product) is put on a `width`-bit significand grid. A `width` below 24 truncates the accumulator's significand to the adder too.
3. The terms are aligned at the larger of the group's largest exponent and `floor`, by truncating right shifts, so terms far below shift out to zero, and summed exactly.
4. The sum is normalized to `width` bits by truncation, denormalized by truncation if it lies below the FP32 normal range, and truncated back to FP32's 24-bit significand. A zero sum is +0.

This diagram shows the step of `sm80.mma.m16n8k16.bf16`:

~~~mermaid
flowchart LR
  c["Incoming FP32 accumulator"]
  p1["Exact products, k = 0 to 7"]
  p2["Exact products, k = 8 to 15"]
  g1["Group 1: 25-bit adder"]
  g2["Group 2: 25-bit adder"]
  out["FP32 accumulator word"]
  c --> g1
  p1 --> g1
  g1 --> g2
  p2 --> g2
  g2 --> out
~~~

The total rules for BF16 and FP8 steps:

- Any NaN operand or accumulator gives the one word `0x7FFFFFFF`.
- An infinity in the accumulator or a product carries through the step, and infinities of both signs give NaN.
- A group whose sum leaves the FP32 range becomes an infinity of its sign, which stays through the rest of the step.
- Infinities are written `0x7F800000` and `0xFF800000`, and every zero result is +0.

#### BlockScaledAlignAdd

`BlockScaledAlignAdd` models the block-scaled FP4 step: 64 E2M1 products in four groups of 16. The finite step works like this:

1. Each group's 16 products are summed exactly as integers.
2. The group's two block scales multiply its sum losslessly. With $(m_a, e_a)$ and $(m_b, e_b)$ the scales' 4-bit mantissas and exponents, the scaled sum is the integer $\mathrm{gd} \cdot m_a \cdot m_b$ at the unit weight $2^{X}$, with $X = -2 + e_a + e_b$. UE4M3 gives $(8 + m, e - 10)$, or $(m, -9)$ for a zero exponent field; UE8M0 gives $(8, c - 130)$.
3. The four scaled sums and the accumulator meet in one align-add on a common grid whose least significant bit is
   $$\mathrm{lsb} = \max\big(\max_{g\ \text{participates}} X_g - 27,\ \ E_{\mathrm{acc}} - 35,\ \ -174\big)$$
   where $E_{\mathrm{acc}}$ is the accumulator's exponent field minus 127 (−126 for a subnormal), and the middle term is present only for a nonzero accumulator. A group participates when at least one of its products is nonzero and both its scale mantissas are nonzero, even if its sum cancels to zero.
4. Each addend is truncated toward zero onto the grid, the addends are summed exactly, and the sum is packed to FP32, truncating toward zero. Every zero result is +0, including a nonzero sum below the FP32 subnormal grid.

So the adder keeps 27 bits below the leading participating group's unit weight, the accumulator contributes through a 36-bit window, and the grid never goes below $2^{-174}$, a floor that only UE8M0 scales reach.

The total rules for FP4 steps:

- A NaN scale on either side gives `0x7FFFFFFF`, whatever the accumulator.
- Otherwise a NaN accumulator gives `0x7FFFFFFF`, and an infinite accumulator passes through unchanged.
- Under UE8M0 scales, a sum that leaves the FP32 range becomes an infinity of its sign. Under UE4M3 scales, no sum from a finite accumulator can leave the range.

### Instructions

An instruction id names one PTX instruction class on one architecture, and it is the value of a subcircuit's semantics parameter. Each id fixes the step's model and parameters:

| Id | Architecture | Shape (m, n, k) | Operands | Scales | Step |
| --- | --- | --- | --- | --- | --- |
| `sm80.mma.m16n8k16.bf16` | `sm_80` | 16, 8, 16 | BF16 | None | `GroupSum`: groups 8, 8; 25 bits; floor −132 |
| `sm89.mma.m16n8k16.bf16` | `sm_89` | 16, 8, 16 | BF16 | None | `GroupSum`: groups 8, 8; 25 bits; floor −132 |
| `sm90.mma.m16n8k16.bf16` | `sm_90` | 16, 8, 16 | BF16 | None | `GroupSum`: group 16; 26 bits; floor −133 |
| `sm90.wgmma.m64n8k16.bf16` | `sm_90` | 64, 8, 16 | BF16 | None | `GroupSum`: group 16; 26 bits; floor −133 |
| `sm89.mma.m16n8k32.e4m3` | `sm_89` | 16, 8, 32 | E4M3 | None | `GroupSum`: groups 16, 16; 14 bits; floor −139 |
| `sm89.mma.m16n8k32.e5m2` | `sm_89` | 16, 8, 32 | E5M2 | None | `GroupSum`: groups 16, 16; 14 bits; floor −139 |
| `sm90.wgmma.m64n8k32.e4m3` | `sm_90` | 64, 8, 32 | E4M3 | None | `GroupSum`: group 32; 14 bits; floor −139 |
| `sm90.wgmma.m64n8k32.e5m2` | `sm_90` | 64, 8, 32 | E5M2 | None | `GroupSum`: group 32; 14 bits; floor −139 |
| `sm120.mma.m16n8k16.bf16` | `sm_120` | 16, 8, 16 | BF16 | None | `GroupSum`: group 16; 26 bits; floor −133 |
| `sm120.mma.m16n8k32.e4m3` | `sm_120` | 16, 8, 32 | E4M3 | None | `GroupSum`: group 32; 26 bits; floor −133 |
| `sm120.mma.m16n8k32.e5m2` | `sm_120` | 16, 8, 32 | E5M2 | None | `GroupSum`: group 32; 26 bits; floor −133 |
| `sm120.mma.m16n8k64.e2m1.nvf4` | `sm_120` | 16, 8, 64 | E2M1 | UE4M3 | `BlockScaledAlignAdd` |
| `sm120.mma.m16n8k64.e2m1.mxf4` | `sm_120` | 16, 8, 64 | E2M1 | UE8M0 | `BlockScaledAlignAdd` |
| `sm100.tcgen05.mma.e2m1.nvf4` | `sm_100` | 128, 8, 64 | E2M1 | UE4M3 | `BlockScaledAlignAdd` |
| `sm100.tcgen05.mma.e2m1.mxf4` | `sm_100` | 128, 8, 64 | E2M1 | UE8M0 | `BlockScaledAlignAdd` |

The 14-bit FP8 adders of `sm_89` and `sm_90` keep only the top 14 bits of the incoming accumulator's significand, even through a group of zero products. The `sm_120` FP8 steps use the 26-bit adder of its BF16 path, so they don't truncate the accumulator. A `wgmma` shape is the $N = 8$ member of its class, because one accumulator coordinate's semantics don't depend on $N$. An instruction gets an id only when its compiled form is one hardware instruction per PTX instruction, or a documented lowering that one step describes. An instruction that compiles to several tensor-core operations joined by FP32 additions isn't one step.

### Definitions

Each step is registered as a primitive Definition that a program can call, and each has a Boolean Definition that computes the same function on bits, from a body of And, Xor and Not gates. A word Definition that a [served Program](/workloads/inference#model-graphs) calls is linked, and opens as a circuit down to its gates. Under the word view, the Boolean Definition takes and returns exactly what its word Definition does:

| Word Definition | Boolean Definition | Signature | Step of |
| --- | --- | --- | --- |
| `AmpereBF16TcDot16_v2` | `AmpereBF16TcDot16_v3` | FP32 accumulator, 16 BF16 pairs, to FP32 | `sm80.mma.m16n8k16.bf16` |
| [`HopperBF16WgmmaDot16_v1`](/circuits/HopperBF16WgmmaDot16_v1) | `HopperBF16WgmmaDot16_v2` | FP32 accumulator, 16 BF16 pairs, to FP32 | `sm90.wgmma.m64n8k16.bf16` |
| [`HopperE4m3QgmmaDot32_v1`](/circuits/HopperE4m3QgmmaDot32_v1) | `HopperE4m3QgmmaDot32_v2` | FP32 accumulator, 32 E4M3 pairs, to FP32 | `sm90.wgmma.m64n8k32.e4m3` |
| `BlackwellE4m3QmmaDot32_v1` | `BlackwellE4m3QmmaDot32_v2` | FP32 accumulator, 32 E4M3 pairs, to FP32 | `sm120.mma.m16n8k32.e4m3` |
| `BlackwellE5m2QmmaDot32_v1` | `BlackwellE5m2QmmaDot32_v2` | FP32 accumulator, 32 E5M2 pairs, to FP32 | `sm120.mma.m16n8k32.e5m2` |
| `BlackwellNvf4OmmaDot64_v1` | `BlackwellNvf4OmmaDot64_v2` | FP32 accumulator, 64 E2M1 pairs, 4 UE4M3 scales per side, to FP32 | `sm120.mma.m16n8k64.e2m1.nvf4` |
| `BlackwellMxf4OmmaDot64_v1` | `BlackwellMxf4OmmaDot64_v2` | FP32 accumulator, 64 E2M1 pairs, 2 UE8M0 scales per side, to FP32 | `sm120.mma.m16n8k64.e2m1.mxf4` |
| [`F2fpBf16_v1`](/circuits/F2fpBf16_v1) | `F2fpBf16_v2` | FP32 to BF16 | The hardware cast |

Composites build GEMM coordinates on these steps. Each takes its step as the static `DOT`, starts from a +0 accumulator and runs in ascending $k$:

| Word Definition | Boolean Definition | What it computes |
| --- | --- | --- |
| `DotBf16_v2{K, DOT}` | `DotBf16_v3` | A BF16 dot product of length $K$, as $K/16$ chained steps |
| `GemmCoordinate_v2{K, DOT}` | `GemmCoordinate_v3` | `DotBf16`, then `F2fpBf16` |
| `Gemm_v2{K, N, DOT}` | `Gemm_v3` | $N$ GEMM coordinates |
| `GemmCoordinateE4m3_v1`, `GemmCoordinateNvf4_v1`, `GemmCoordinateMxf4_v1` | Their `_v2` | The `sm_120` coordinates: $K/32$ or $K/64$ steps, then `F2fpBf16` |

The subcircuit `gemm_coordinate(K, semantics)` binds `DOT` to the step of the instruction its semantics parameter names.

The other operations a workload calls are Definitions too, each total and each matched to the hardware:

- FP32 add, multiply, fused multiply-add, divide and square root, as IEEE binary32 with ties to even and no flush to zero, which is the scalar FP32 pipe; their flush-to-zero forms; and BF16 element-wise arithmetic.
- Integer, bit, select and comparison operations, FP32 absolute value, negation and saturation, the BF16 comparator, and PTX `max` and `min`.
- The special-function unit's approximations (ex2, rcp, sqrt, rsqrt, tanh), each defined over the hardware's measured table.
- Attention's softmax operations and its inverse sum.

### Establishing semantics against hardware

A model is a hypothesis about one instruction on one architecture, and hardware is the only arbiter. The method follows Hawkeye's: inputs built to isolate one parameter at a time (where the groups split, how wide the adder is, where terms flush to zero, how the accumulator enters), together with random sweeps, run on the device through the instruction alone, and compared word for word with the model.

Each instruction is measured on one anchor device, its architecture's unless the instruction names its own:

| Architecture | Anchor device |
| --- | --- |
| `sm_80` | NVIDIA A100 SXM4 80GB |
| `sm_89` | NVIDIA GeForce RTX 4090 |
| `sm_90` | NVIDIA H100 SXM5 80GB |
| `sm_100` | NVIDIA B200 |
| `sm_120` | NVIDIA GeForce RTX 5090; the `sm_120` FP8 instructions anchor on the NVIDIA RTX PRO 6000 Blackwell Server Edition |

A model is pinned on its instruction when every one of these holds on the anchor device:

1. **Agreement.** Every recorded hardware word agrees with the model, with zero mismatches.
2. **Volume.** At least $10^7$ elements agree. A defect that affects one element in $2 \cdot 10^6$ then escapes with probability below 1%.
3. **Coverage.** The words cover every canonical family: random sweeps over operand encodings and accumulators; adder-width probes, such as large cancellations; zero products with a nonzero or tiny accumulator; walks over the accumulator's least significant bits; and special values.
4. **Lowering.** The compiled machine code shows one hardware instruction per PTX instruction, or the lowering is documented.
5. **Regression.** Every resolved discrepancy names the tiles that reproduce it, and those tiles agree on the anchor.

A pinned model is trusted when, besides, an independent reference agrees with it (a second harness, a second compiled path, or a source-close simulator such as Hawkeye's), or every disagreement with that reference is resolved with hardware as the arbiter, and no discrepancy naming it is open. A trusted model is stable when it is trusted on two physical devices, or under two driver or compiler versions, with identical words. Each level is computed from recorded evidence and never asserted.

Every disagreement among a paper, a simulator, a reference and the hardware is recorded as a discrepancy and resolved with hardware as the arbiter. These events reopen a model:

- a mismatch on the anchor, in a canary run or any probe;
- a change of the anchor's driver or compiler, which reruns the canary;
- an independent verifier rejecting an honest run of a relation built on the model;
- a new discrepancy naming the instruction;
- a red team's finding against the relation or its checker.

The response is fixed: reproduce on the anchor; locate the fault by comparing hardware words with the model, the model with the prover's relation, and the relation with the verifier; record the discrepancy, which lowers the level automatically; and resolve it with hardware as the arbiter, adding its tiles to the regression set. [Hardware lines](#hardware-lines) lists the Census line of each device and operand datatype.

### Native cost

One GEMM coordinate of length $K$ is $K$ multiply-accumulates, which count as $2K$ FLOP, since a fused multiply-add counts as 2 FLOP. Its native time at a peak of $F$ FLOP per second is

$$
t_{\mathrm{native}} = \frac{2K}{F}
$$

where $F$ is the Census hardware line of the instruction's anchor device and operand datatype: the device's dense tensor-core peak at FP32 accumulate. A proof's overhead is the prover's seconds per GEMM coordinate over $t_{\mathrm{native}}$, and [Performance](/proof-systems/performance) reports it for every proof system. The anchor device fixes the semantics and the native rate, not the machine a prover runs on.

[^hopper-bf16]: The whitepaper lists BF16 at 1978.9 TFLOP/s with sparsity. The Census uses the dense figure.

[^hopper-fp8]: The whitepaper lists FP8 at 3957.8 TFLOP/s with sparsity. Hopper runs FP8 with FP32 accumulate at full rate.

[^ada]: The whitepaper lists FP8 with FP32 accumulate at 330.3 TFLOP/s dense and 660.6 TFLOP/s with sparsity. FP8 with FP16 accumulate is 660.6 TFLOP/s: Ada halves FP8 throughput with FP32 accumulate.

[^blackwell]: Appendix A, table “GeForce RTX 5090 vs RTX 4090 vs RTX 3090”, row “Peak FP4 Tensor TFLOPS with FP32 Accumulate (FP4 AI TOPS)”: 1676 dense and 3352 with the 2:4 sparsity feature, at the GPU boost clock of 2407 MHz. The card's headline figure of 3352 AI TOPS is the sparse one. The dense FP4 rate is 4 times the dense rate of FP8 with FP32 accumulate, 419 TFLOP/s.
