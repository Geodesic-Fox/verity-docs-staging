The vLLM integration makes an LLM serving run auditable. It hooks a pinned vLLM engine so that, for each served workload, it builds the workload's circuit with an embedded Torch-to-circuit frontend, supplies the circuit's silicon-specific bindings, acquires and commits runtime values while serving, and runs proving through the ZK server, as the [remote](/docs/protocols/remote) and [onsite](/docs/protocols/onsite) protocols run it. It composes the components and owns none of their semantics. The program format belongs to [circuits](/docs/accounting/circuits), the exact arithmetic to [silicon](/docs/hardware/accelerators#silicon), the leaves and trees to [commitments](/docs/proof-systems/commitments), the draw and the guarantee to [sampled proofs](/docs/proof-systems/sampling), and each accounting check to its own [protocol](/docs/accounting). [Served configs](/docs/workloads/inference#served-configurations) lists the configurations it serves.

## Parts

| Part | What it does |
| --- | --- |
| Engine profile | Pins how vLLM runs the model |
| Frontend | Lowers the pinned model to a program of Calls |
| Silicon bindings | Binds each Call to the exact arithmetic the GPU performs |
| Runtime correspondence | Maps each Call to where vLLM runs it |
| Acquisition | Reads each committed value where it is computed |
| Commitment | Hashes the values into hiding leaves and trees while serving |
| Proving | Proves the drawn units through the ZK server, as the [remote](/docs/protocols/remote#proving) protocol runs it |

The **engine profile** fixes the dtype, the tokenizer and the attention kernel, turns prefix caching off so that each request computes its own prompt, and runs vLLM batch-invariant, so that a request's values don't depend on what it was batched with. The program of a request is then the same however the scheduler groups it.

The **frontend** runs inside the engine. It exports the graph of the actual pinned vLLM model class, and its lowering rules turn each graph node into a Call: one application of a registered Definition, a function with an exact evaluator. Collectives across tensor-parallel ranks are exported as Calls too.

The **silicon bindings** make each Definition exact on the GPU that serves. The same PyTorch operation computes different bits on different hardware: a BF16 GEMM accumulates through `mma` on an `sm80` GPU and through `wgmma` on an `sm90` one, and attention may be a FlashAttention-2 or a FlashAttention-3 construction. Each Definition carries a semantics parameter that the integration binds to the instruction sequence the GPU runs. A different binding is a different circuit.

The **runtime correspondence** records, for each Call, where it runs in the served model: its module path, its graph node, its argument slot and its tensor view. **Acquisition** uses it to read each committed value at run time, through hooks on the engine and, for values that live only in registers inside a fused kernel, through in-kernel taps.

## A request as a program

Each request becomes a program that covers its prefill and each of its decode steps, and a workload's requests combine into the workload's program. A decode step's input token is a wire from the previous step's sampled token, so the audit covers that link like any other value. The program is public and named by its digest, and the auditor holds its own copy. Its inputs fall into three kinds:

| Kind | Examples | Committed |
| --- | --- | --- |
| Registered inputs | The weights; constants such as epsilon, the attention scale and the softcap; tables such as `gelu_tanh_bf16` | Once, at registration, before serving |
| Run inputs | Each request's prompt token ids, and its sampling parameters: temperature, top-p and the positions of its sampler's random stream | While serving |
| Structure | The Calls, their dataflow and every shape | Never: it is the program itself, and public |

The partition is `Q_word` v1 with $X = 16$ and $W = 32$. It cuts each Call's circuit into proof units whose committed outputs total at most 16 bits, or are one value of at most 32 bits. A value read across units is committed once, and no unit recomputes a value another unit computes. The [model graphs](/docs/workloads/inference#model-graphs) draw the cut on the served configurations, with their Proof units toggle.

## What is committed, and when

What is committed is the partition's [boundary gates](/docs/accounting/circuits#partitions), fixed by the program and its partition before serving starts:

- every value read across a proof-unit boundary, which includes every value one Call passes to another;
- the prescribed inputs: the weights and each request's prompt token ids;
- the values the protocols need, such as the token ids sampled at each step.

Some of these values exist only inside a kernel, such as attention's running max or a norm's scale. In-kernel taps read them where they are computed.

~~~mermaid
sequenceDiagram
  participant W as Workers (vLLM)
  participant Z as ZK server
  participant H as Challenger
  participant V as Verifier
  Note over W: build program, bindings
  W->>Z: registered inputs' roots
  Z->>H: salted commitments to them
  Note over W: serve, commit at taps
  W->>Z: serving roots
  Z->>H: salted commitments to them
  Note over H: draw proof units
  H->>Z: drawn units
  Z->>W: drawn units
  W->>Z: inner and outer proof messages
  Z->>H: salted commitments, then outer proofs
  H->>V: record and transcript
  Note over V: verify offline
~~~

1. **Before serving**, the registered inputs are committed under hiding leaves and registered with the program's digest and the partition. Their roots stay fixed for every later window.
2. **While serving**, every boundary value is written into a hiding leaf as it is computed, under the `frame-v3-sha512/hm96-sha512` scheme. Each port's tree has a domain that binds the program, the partition, the port, its leaf schema, its leaf count and the run.
3. **After the window, before any draw**, the serving roots are registered with the challenger, which logs a receipt and only then draws.
4. **After the draw**, the drawn units' values, still on the workers, are the witness the workers prove over. Nothing else is opened.

[Sampling](/docs/proof-systems/sampling) states the protocol these steps run, and [C-Flock](/docs/proof-systems/c-flock#integrity) bounds its error terms.

## The instrumented program

What the engine runs while serving is the instrumented program: the program, plus a tap at every committed value, plus the leaf and tree hashing. It is derived from the program and its boundary gates, never written by hand, and no proof claims anything about it. If it commits a wrong value, the unit that computes that value is faulty against what was committed, and the audit counts it like any other faulty unit. Its correctness is what lets an honest developer's audits pass. The auditor's guarantee doesn't rest on it.

## Checks on the developer's side

Before it registers a window, the integration checks its own run, so that a mistake surfaces before registration rather than as a failed audit:

- **Runtime match:** what vLLM ran matches the program, Call for Call.
- **Boundary linkage:** each request's input tokens are its prompt at arrival, and its own previously sampled token at every later step.
- **Checkpoint binding:** the weights are the pinned checkpoint's.
- **Execution extent:** how many steps each request ran, so that positions after an early stop count as not executed.
- **Coverage:** every boundary value was committed.
- **Program and source identity:** the program and the code are the ones the build used.

None of these is part of the auditor's guarantee, which rests on the audit alone.

## Serving overhead and proving overhead

Serving overhead is the cost of committing while serving. The same engine alternates runs without the integration and runs with it, their generated tokens must be identical, and

$$
\Delta_{\mathrm{commit}} = \frac{T_{\mathrm{serve+commit}}}{T_{\mathrm{serve}}} - 1.
$$

Proving overhead is the cost of proof generation relative to the computation it proves: the time the proof system takes to prove a set of units, over the time the serving hardware takes to compute them natively,

$$
R_{\mathrm{prove}} = \frac{T_{\mathrm{prove}}(\text{units})}{T_{\mathrm{native}}(\text{units})}.
$$

Serving overhead is paid on every request. Proving overhead is paid only on the drawn units, so a window's proving cost is $R_{\mathrm{prove}}$ times the native time of the units drawn, not of the whole window.

## Composing protocols

The integration can install the [accounting](/docs/accounting) protocols on the same engine, innermost first. [Compute accounting](/docs/accounting/compute) runs the linear layers' GEMMs under its useful-work scheme, [memory accounting](/docs/accounting/memory) decodes the weights those GEMMs read, and sampled proofs commits what the model computed. A run admits only the protocols its program describes. Memory accounting's decode is bit-identical to the plain weights, and compute accounting's scheme must have a circuit in the program, so the committed values remain the program's values. Each protocol keeps its own checks, and the integration only installs them in order.
