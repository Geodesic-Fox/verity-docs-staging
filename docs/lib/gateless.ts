import { defName } from "@/lib/names"

/*
 * Why something the Program runs has no gates to draw, keyed on stable ids.
 *   - Wiring: a primitive that only moves or clears bits needs no gates.
 *   - Not lowered yet: what it is, or the export's own reason where that
 *     says more.
 */

export type Gateless = {
  kind: "wiring" | "not-lowered"
  // A card's first words, a size row, and a hover's short form.
  headline: string
  sizeRow: string
  short: string
  detail: string
}

// Primitives that only move or clear bits: a sign bit cleared, an encoding shifted, a bf16 widened.
const WIRING = /^(F32Fabs|F32BitsShl23|Bf16ToF32)$/

// What a primitive without a Boolean circuit is, by its base name.
const FAMILIES: [RegExp, string][] = [
  [/^(F32Max|F32(Add|Sub|Mul|Fma|FmaSub)Ftz|MufuEx2Ftz|GuardNegInfZero|Fa[23]InvSum|MufuTanh|TanhF32Rn)$/, "one of attention's softmax steps"],
  [/^(RsqrtApprox|MufuSqrtFtz|DivFull(ScaleA|Rcp)|F32Div)$/, "one of a norm's row scalars"],
  [/^(GumbelStreamKey|GumbelNoiseLane|TopPMaskWordx\d+)$/, "part of top-p sampling"],
  [/^(Bf16GtStrict|F32GtStrict|F32Eq|I32(Add|Eq|Le)|Select(Bf16|F32|I32)|BitNot|BitOr|BitAtx\d+)$/, "a comparison, select or integer op, as in MoE routing and argmax"],
  [/^GatherBf16x\d+$/, "a gather of one row"],
  [/^GeluTanhMulBf16$/, "GELU-tanh · mul"],
  [/^(F32ToE4m3Sat|HopperE4m3QgmmaDot32)$/, "an FP8 step"],
  [/^F32/, "an FP32 op"],
]

// The export's reason when it only says there's no piece yet.
const GENERIC = "ir_lower has no piece for this primitive yet"

const sentence = (s: string) => {
  const t = s.charAt(0).toUpperCase() + s.slice(1)
  return t.endsWith(".") ? t : `${t}.`
}

// `fn` is the primitive (none for a whole template), `reason` the export's.
export function gateless({ fn, reason }: { template?: string | null; fn?: string | null; reason?: string | null }): Gateless {
  const base = fn ? defName(fn) : null
  if (base && WIRING.test(base)) {
    return {
      kind: "wiring",
      headline: "No gates by design.",
      sizeRow: "No gates: wiring",
      short: "none: wiring",
      detail: "It only moves or clears bits, so it's wiring.",
    }
  }
  const family = base ? FAMILIES.find(([re]) => re.test(base))?.[1] : null
  const what =
    reason && reason !== GENERIC
      ? sentence(reason)
      : family
        ? `It's ${family}, which C-Flock's lowering doesn't cover yet.`
        : "C-Flock's lowering has no Boolean circuit for it yet."
  return {
    kind: "not-lowered",
    headline: "No gates below this yet.",
    sizeRow: "Not lowered to gates yet",
    short: "not lowered yet",
    detail: what,
  }
}
