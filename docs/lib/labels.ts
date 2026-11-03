/*
 * Readable names for the renderer's labels. Unknown labels pass through.
 */

// The common name first, the exact format in parentheses.
const datatypes: Record<string, string> = {
  BF16: "BF16",
  FP16: "FP16",
  E4M3: "FP8 (E4M3)",
  E5M2: "FP8 (E5M2)",
  E2M1: "FP4 (NVFP4, E2M1)",
}

export function datatypeLabel(label: string): string {
  return datatypes[label] ?? label
}

// Short hardware names, as people say them. The full name is kept for hover.
const hardware: Record<string, string> = {
  "NVIDIA A100 SXM4 80GB": "A100 SXM4",
  "NVIDIA H100 SXM5 80GB": "H100 SXM5",
  "NVIDIA GeForce RTX 4090": "RTX 4090",
  "NVIDIA GeForce RTX 5090": "RTX 5090",
  "NVIDIA L40S": "L40S",
}

export function hardwareLabel(label: string): string {
  return hardware[label] ?? label
}
