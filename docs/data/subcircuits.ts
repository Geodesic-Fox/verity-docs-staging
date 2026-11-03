import { datatypeLabel } from "@/lib/labels"

/*
 * Subcircuit templates and their subcircuits (a template with every
 * parameter bound). Each template lists its parameters; each subcircuit
 * gives its value for every one, which is what the Performance view sweeps.
 *
 * Today one template has results: the GEMM coordinate, at K = 1536 for five
 * chips. The others are placeholders from a vLLM serving run of
 * Llama-3.2-1B on an L40S: its input sets were exported, but no backend
 * has results on them.
 * They only appear alongside sample data.
 *
 * Interim: mapped by hand from the render's published Table 2, the Census
 * and the vLLM export's handoff. The entities JSON will carry the real ids,
 * display names and parameters; this file then goes.
 */

export type TemplateParameter = { key: string; label: string; description: string }

export type Template = {
  id: string
  name: string
  summary: string
  parameters: TemplateParameter[]
  // Why it isn't in the tables yet; set for placeholders.
  placeholder?: string
}

export type Subcircuit = {
  id: string
  template: string
  // Display value for each of the template's parameters, by key.
  params: Record<string, string>
  // The renderer's target id, which Table 2 row labels carry today.
  target?: string
  // The device the subcircuit's input set comes from, by the renderer's
  // hardware label. Not a template parameter: the hardware a proof runs on
  // is its own axis of a cell.
  chip: string
  datatype: string
  instruction?: string
  inputs: "captured" | "synthetic"
  inputsNote: string
  // The vLLM export's name for this subcircuit's input set.
  exportSet?: string
  gap?: string
}

const fromVllm =
  "Input sets exported from a vLLM serving run of Llama-3.2-1B on an L40S. No backend has results on them yet."

// "sm90.wgmma.m64n8k32.e4m3" reads as "sm90 wgmma e4m3": the shape is
// implied by the instruction and the template.
export function instructionLabel(instruction: string): string {
  return instruction
    .split(".")
    .filter((part) => !/^m\d+n\d+k\d+$/.test(part))
    .join(" ")
}

export const templateList: Template[] = [
  {
    id: "gemm-coordinate",
    name: "GEMM coordinate",
    summary:
      "One output element of a matrix multiply: a length-K dot product, computed bit for bit as the chip's tensor cores compute it, with FP32 accumulation.",
    parameters: [
      { key: "K", label: "K", description: "The dot product's length: multiply-accumulates in the chain." },
      { key: "datatype", label: "Datatype", description: "The operands' number format." },
      {
        key: "semantics",
        label: "Instruction",
        description:
          "The exact tensor-core instruction whose accumulator step the chain follows, bit for bit (the field semantics).",
      },
    ],
  },
  {
    id: "attention-head",
    name: "Attention head",
    summary:
      "One attention head as FlashAttention-2 computes it: blockwise query–key dot products, exponentials and the running normalization, then the weighted sum of values.",
    parameters: [
      { key: "headDim", label: "Head dim", description: "Elements per query, key and value." },
      { key: "block", label: "Key block", description: "Keys per block of the kernel." },
    ],
    placeholder: fromVllm,
  },
  {
    id: "rope",
    name: "RoPE",
    summary: "Rotary position embedding on one head: pairs of elements rotated by angles that depend on the token's position.",
    parameters: [{ key: "headDim", label: "Head dim", description: "Elements per head." }],
    placeholder: fromVllm,
  },
  {
    id: "rmsnorm",
    name: "RMSNorm",
    summary: "RMS normalization of one row: divide by the root mean square of its elements, then scale, as the serving kernel computes it.",
    parameters: [
      { key: "kernel", label: "Kernel", description: "The serving kernel reproduced." },
      { key: "hidden", label: "Hidden size", description: "Elements per row." },
    ],
    placeholder: fromVllm,
  },
  {
    id: "silu-mul",
    name: "SiLU · mul",
    summary: "The gated activation of one row: SiLU of the gate projection times the up projection, element by element.",
    parameters: [{ key: "intermediate", label: "Intermediate size", description: "Elements per row." }],
    placeholder: fromVllm,
  },
  {
    id: "top-p-sampling",
    name: "Top-p sampling",
    summary: "Choosing the next token from one row of logits with Gumbel top-p sampling: Philox noise, the top-p cutoff and the argmax.",
    parameters: [{ key: "vocab", label: "Vocabulary", description: "Logits per token." }],
    placeholder: fromVllm,
  },
]

export const templates: Record<string, Template> = Object.fromEntries(
  templateList.map((t) => [t.id, t])
)

const synthetic = "Synthetic inputs, seeded from the IR."

type Gemm = Omit<Subcircuit, "template" | "params" | "instruction"> & { K: number; instruction: string }

const gemm = (s: Gemm): Subcircuit => ({
  ...s,
  template: "gemm-coordinate",
  params: {
    K: s.K.toLocaleString("en-US"),
    datatype: datatypeLabel(s.datatype),
    semantics: instructionLabel(s.instruction),
  },
})

const l40s = "NVIDIA L40S"
const fromServingRun = "Exported from a vLLM serving run of Llama-3.2-1B on an L40S."

export const subcircuits: Subcircuit[] = [
  gemm({
    id: "gemm-coordinate/k1536/sm80-mma-bf16",
    target: "first-campaign-target/2026-09-21",
    K: 1536,
    chip: "NVIDIA A100 SXM4 80GB",
    datatype: "BF16",
    instruction: "sm80.mma.m16n8k16.bf16",
    inputs: "captured",
    inputsNote: "Captured from Qwen2.5-1.5B.",
  }),
  gemm({
    id: "gemm-coordinate/k1536/sm90-mma-bf16",
    target: "bf16-hopper-mma-draft/2026-09-22",
    K: 1536,
    chip: "NVIDIA H100 SXM5 80GB",
    datatype: "BF16",
    instruction: "sm90.mma.m16n8k16.bf16",
    inputs: "synthetic",
    inputsNote: synthetic,
    gap: "Models the mma instruction, while vLLM on the H100 runs wgmma.",
  }),
  gemm({
    id: "gemm-coordinate/k1536/sm90-wgmma-e4m3",
    target: "fp8-hopper-wgmma-draft/2026-09-22",
    K: 1536,
    chip: "NVIDIA H100 SXM5 80GB",
    datatype: "E4M3",
    instruction: "sm90.wgmma.m64n8k32.e4m3",
    inputs: "synthetic",
    inputsNote: synthetic,
  }),
  gemm({
    id: "gemm-coordinate/k1536/sm89-mma-e4m3",
    target: "fp8-ada-mma-draft/2026-09-22",
    K: 1536,
    chip: "NVIDIA GeForce RTX 4090",
    datatype: "E4M3",
    instruction: "sm89.mma.m16n8k32.e4m3",
    inputs: "synthetic",
    inputsNote: synthetic,
  }),
  gemm({
    id: "gemm-coordinate/k1536/sm120-mma-e2m1-nvf4",
    target: "nvfp4-sm120-mma-draft/2026-09-22",
    K: 1536,
    chip: "NVIDIA GeForce RTX 5090",
    datatype: "E2M1",
    instruction: "sm120.mma.m16n8k64.e2m1.nvf4",
    inputs: "synthetic",
    inputsNote: synthetic,
  }),
  ...[2048, 8192].map((K) =>
    gemm({
      id: `gemm-coordinate/k${K}/sm80-mma-bf16`,
      K,
      chip: l40s,
      datatype: "BF16",
      instruction: "sm80.mma.m16n8k16.bf16",
      inputs: "captured",
      inputsNote: fromServingRun,
      exportSet: `gemm-coordinate-ampere-bf16-k${K}`,
    })
  ),
  {
    id: "attention-head/fa2-d64-b128",
    template: "attention-head",
    params: { headDim: "64", block: "128" },
    chip: l40s,
    datatype: "BF16",
    inputs: "captured",
    inputsNote: fromServingRun,
    exportSet: "attention-head-fa2-d64-bn128",
  },
  {
    id: "rope/d64",
    template: "rope",
    params: { headDim: "64" },
    chip: l40s,
    datatype: "BF16",
    inputs: "captured",
    inputsNote: fromServingRun,
    exportSet: "rope-head-d64",
  },
  ...[
    ["fused-cuda", "Fused CUDA", "rmsnormfusedcuda-v2-n2048-00e4e4aa"],
    ["triton", "Triton", "rmsnormtriton-v1-n2048-00e4e4aa"],
  ].map(([id, kernel, exportSet]) => ({
    id: `rmsnorm/${id}-n2048`,
    template: "rmsnorm",
    params: { kernel: kernel!, hidden: "2,048" },
    chip: l40s,
    datatype: "BF16",
    inputs: "captured" as const,
    inputsNote: fromServingRun,
    exportSet,
  })),
  {
    id: "silu-mul/i8192",
    template: "silu-mul",
    params: { intermediate: "8,192" },
    chip: l40s,
    datatype: "BF16",
    inputs: "captured",
    inputsNote: fromServingRun,
    exportSet: "silumul-v1-i8192",
  },
  {
    id: "top-p-sampling/v128256",
    template: "top-p-sampling",
    params: { vocab: "128,256" },
    chip: l40s,
    datatype: "FP32",
    inputs: "captured",
    inputsNote: fromServingRun,
    exportSet: "gumbeltopptokenselect-v1-v128256",
  },
]

for (const s of subcircuits) {
  const template = templates[s.template]
  if (!template) throw new Error(`${s.id}: unknown template ${s.template}`)
  const missing = template.parameters.filter((p) => !(p.key in s.params))
  if (missing.length) throw new Error(`${s.id}: no value for ${missing.map((p) => p.key).join(", ")}`)
}

// A subcircuit's short label: its parameter values in the template's
// order, with numbers named ("K 1,536").
export function subcircuitLabel(s: Subcircuit): string {
  return templates[s.template]!.parameters
    .map((p) => {
      const value = s.params[p.key]!
      return /^[\d,]+$/.test(value) ? `${p.label} ${value}` : value
    })
    .join(" · ")
}