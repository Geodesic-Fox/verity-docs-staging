import { z } from "zod"

import raw from "@/data/vllm-101.json"

/*
 * The vLLM integration's served configs and one run's exported input sets,
 * from data/vllm-101.json (written by scripts/import-vllm-bundle.mjs from
 * the vLLM export's site bundle). Validated at build time.
 */

const sampling = z.object({
  variant: z.string(),
  temperature: z.number(),
  top_p: z.number(),
  top_k: z.number(),
})

const port = z.object({
  dtype: z.string(),
  words: z.number(),
  hex: z.array(z.string()),
  f32: z.array(z.number().nullable()),
})

const schema = z.object({
  schema: z.literal("verity-docs/vllm-served/v1"),
  run: z.object({
    model: z.string(),
    revision: z.string(),
    dtype: z.string(),
    gpu: z.string(),
    tp: z.string(),
    batch: z.string(),
    context: z.string(),
    sampling,
    execution: z.string(),
    versions: z.object({ vllm: z.string(), torch: z.string(), cuda: z.string() }),
    units: z.number(),
    unitsByFamily: z.record(z.string(), z.number()),
    notExported: z.record(z.string(), z.string()),
  }),
  subcircuits: z.array(
    z.object({
      set: z.string(),
      template: z.string(),
      definition: z.string().nullable(),
      rule: z.string().nullable(),
      boundParams: z.record(z.string(), z.union([z.number(), z.string()])),
      unitsInRun: z.number(),
      inputsInRun: z.number(),
      unitSpecs: z.record(z.string(), z.number()),
      exported: z.number(),
      exportedUnits: z.number(),
      bytes: z.number(),
      replay: z.object({ drawn: z.number(), replayed_equal: z.number() }).nullable(),
      samples: z.array(
        z.object({
          source: z.object({
            opPath: z.string().nullable(),
            phase: z.string().nullable(),
            engineStep: z.number().nullable(),
            sub: z.record(z.string(), z.union([z.number(), z.string()])),
          }),
          inputs: z.record(z.string(), port),
          outputs: z.record(z.string(), port),
        })
      ),
    })
  ),
  configs: z.array(
    z.object({
      key: z.string(),
      model: z.string(),
      dtype: z.string(),
      gpu: z.string(),
      tp: z.string(),
      batch: z.string(),
      context: z.string(),
      workload: z.string().nullable(),
      sampling: sampling.nullable(),
      partitioned: z.boolean(),
      mix: z.array(
        z.object({
          template: z.string(),
          params: z.record(z.string(), z.unknown()),
          units: z.number(),
          inputs: z.number().nullable(),
        })
      ),
    })
  ),
})

export type VllmData = z.infer<typeof schema>
export type ServedConfig = VllmData["configs"][number]
export type ExportedSubcircuit = VllmData["subcircuits"][number]
export type SamplePort = z.infer<typeof port>

export const vllm: VllmData = schema.parse(raw)

// The elementwise Definitions a norm or softcap runs as a chain of, as in
// Gemma-2's; they share one legend entry.
const elementwise = [
  "AddScalarBf16_v1",
  "AddScalarF32_v1",
  "AddWidenedBf16_v1",
  "Bf16DivScalar_v1",
  "Bf16MulScalar_v1",
  "Bf16Tanh_v1",
  "MeanTriton_v1",
  "MulVecF32_v1",
  "NarrowF32ToBf16_v1",
  "RsqrtF32_v1",
  "ScaleRowBf16_v1",
  "ScaleRowF32_v1",
  "SquareBf16_v1",
  "SquareF32_v1",
]

// The integration's template names, as the site names them, in legend
// order. Templates that share a label share a legend entry.
export const mixTemplates: { id: string; label: string; color: string }[] = [
  { id: "GemmCoordinate", label: "GEMM coordinate", color: "oklch(0.55 0.14 255)" },
  { id: "ScaledMmFp8Block_v1", label: "FP8 block-scaled GEMM", color: "oklch(0.68 0.1 245)" },
  { id: "Fp8GroupQuant_v1", label: "FP8 group quantize", color: "oklch(0.8 0.06 225)" },
  { id: "MoeExpertGemm_v1", label: "MoE expert GEMM", color: "oklch(0.45 0.12 265)" },
  { id: "MoeExpertGemmW_v1", label: "MoE expert GEMM, weighted", color: "oklch(0.75 0.08 260)" },
  { id: "AttentionHead", label: "Attention head", color: "oklch(0.62 0.13 295)" },
  { id: "AttentionSoftcap_v1", label: "Attention head, softcapped", color: "oklch(0.52 0.12 310)" },
  { id: "RoPEHead", label: "RoPE", color: "oklch(0.72 0.11 165)" },
  { id: "RMSNormFusedCuda_v2", label: "RMSNorm, fused CUDA", color: "oklch(0.68 0.14 40)" },
  { id: "RMSNormTriton_v1", label: "RMSNorm, Triton", color: "oklch(0.8 0.1 55)" },
  { id: "SiluMul_v1", label: "SiLU · mul", color: "oklch(0.8 0.11 85)" },
  { id: "GeluTanhMul_v1", label: "GELU · mul", color: "oklch(0.74 0.12 100)" },
  { id: "BiasAdd_v1", label: "Bias add", color: "oklch(0.7 0.08 130)" },
  { id: "Bf16MulScalarTensor_v1", label: "BF16 × scalar", color: "oklch(0.62 0.08 140)" },
  ...elementwise.map((id) => ({ id, label: "Elementwise", color: "oklch(0.76 0.05 65)" })),
  { id: "MoeRouterTopK_v1", label: "MoE router top-k", color: "oklch(0.65 0.1 340)" },
  { id: "MoeRouterTopKNorm_v1", label: "MoE router top-k, normalized", color: "oklch(0.58 0.1 350)" },
  { id: "MoeSum_v1", label: "MoE sum", color: "oklch(0.78 0.07 330)" },
  { id: "AllReduce2_v1", label: "All-reduce", color: "oklch(0.6 0.06 200)" },
  { id: "AllGather2_v1", label: "All-gather", color: "oklch(0.74 0.06 195)" },
  { id: "GumbelTopPTokenSelect_v1", label: "Top-p sampling", color: "oklch(0.5 0.1 20)" },
  { id: "TokenSelect_v1", label: "Greedy token select", color: "oklch(0.6 0.08 20)" },
  { id: "Embedding_v1", label: "Embedding", color: "oklch(0.82 0.01 260)" },
  { id: "EmbeddingShard_v1", label: "Embedding shard", color: "oklch(0.76 0.01 260)" },
]

const templateById = new Map(mixTemplates.map((t) => [t.id, t]))

export function mixTemplate(id: string) {
  return templateById.get(id) ?? { id, label: id, color: "oklch(0.7 0.02 260)" }
}

export const shortModel = (model: string) => model.split("/").pop() ?? model

export const hardware = (c: { gpu: string; dtype: string }) => `${c.gpu.toUpperCase()} · ${c.dtype.toUpperCase()}`

// "b8" reads as 8.
export const batchSize = (batch: string) => Number(batch.replace(/\D/g, ""))

// "I1024-O128" reads as "1,024 in, 128 out".
export function contextLabel(context: string): string {
  const m = /^I(\d+)-O(\d+)$/.exec(context)
  if (!m) return context
  return `${Number(m[1]).toLocaleString("en-US")} in, ${Number(m[2]).toLocaleString("en-US")} out`
}

export function samplingLabel(s: z.infer<typeof sampling> | null): string {
  if (!s) return "—"
  if (s.temperature === 0) return "Greedy"
  return `Top-p ${s.top_p}, temperature ${s.temperature}`
}

// The row key's own term for its prompt mix, e.g. "mixed" or "mixed-arrivals".
export const workloadLabel = (workload: string | null) => workload ?? "—"

// 5,745,046 reads as "5.7M".
export function compact(n: number): string {
  if (n >= 1e9) return `${Number((n / 1e9).toPrecision(2))}B`
  if (n >= 1e6) return `${Number((n / 1e6).toPrecision(2))}M`
  if (n >= 1e3) return `${Number((n / 1e3).toPrecision(2))}K`
  return String(n)
}
