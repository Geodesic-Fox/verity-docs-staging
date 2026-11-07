import type { NextConfig } from "next"

// Where each page of an earlier layout lives now, so open tabs and shared
// links land; an empty destination is the Overview. The first match wins, so
// specific rules come before catch-alls, and a pattern ending in :path* takes
// the page and everything under it. The /census data routes (boolean,
// circuits, definitions, lowering, modules, programs, serving) are route
// handlers the graphs fetch: never redirect them.
const moved: [string, string][] = [
  // The tree of Nov 6, 2026, evening.
  ["/accounting/compute/pouw", "/accounting/pouw"],
  ["/accounting/compute", "/accounting/physical/accelerators"],
  ["/accounting/memory/pous", "/accounting/pous"],
  ["/accounting/memory/poub", "/accounting/poub"],
  ["/accounting/memory", "/accounting/physical"],
  ["/accounting/network/certification", "/accounting/network-certification"],
  ["/accounting/network", "/accounting/physical/datacenters"],
  ["/proof-systems/zero-knowledge/veil", "/proof-systems/zero-knowledge"],

  // The tree of Nov 6, 2026.
  ["/proof-systems/flock", "/proof-systems/basic-proofs/flock"],
  ["/accounting", "/architecture#resource-accounting"],
  ["/accounting/compute/useful", "/accounting/pouw"],
  ["/accounting/compute/useless", "/accounting/physical/accelerators"],
  ["/accounting/memory/useful", "/accounting/pous"],
  ["/accounting/memory/useless", "/accounting/physical"],
  ["/accounting/memory/reads", "/accounting/physical"],
  ["/accounting/network/certifier", "/accounting/network-certification"],
  ["/accounting/network/content-bound", "/proof-systems/sampling#exfiltration"],
  ["/workload-classification", "/workload-classification/inference-vs-training"],

  // The tree of Nov 3, 2026.
  ["/proof-systems", "/proof-systems/basic-proofs"],
  ["/proof-systems/dither", "/accounting/pouw#dither"],
  ["/proof-systems/commitments", ""],
  ["/proof-systems/randomness", ""],
  ["/proof-systems/performance", ""],
  ["/accounting/network/content", "/proof-systems/sampling#exfiltration"],
  ["/accounting/composition", "/architecture#composition"],
  ["/accounting/bandwidth/:path*", "/accounting/poub"],
  ["/accounting/hardware", "/architecture#resource-accounting"],
  ["/accounting/circuits", "/architecture#resource-accounting"],
  ["/protocols", "/protocols/remote"],
  ["/protocols/architecture", "/architecture"],
  ["/policies/:path*", "/workload-classification/inference-vs-training"],
  ["/workloads/inference", "/integrations/vllm/circuits"],
  ["/workloads/:path*", ""],
  ["/hardware/:path*", ""],
  ["/assumptions/:path*", ""],
  ["/glossary", ""],
  ["/autoresearch", ""],
  ["/contributing", ""],
  ["/getting-started", ""],
  ["/dev/:path*", ""],

  // Earlier layouts.
  ["/vllm", "/integrations/vllm"],
  ["/benchmarks/:path*", ""],
  ["/flows", ""],
  ["/verification", "/proof-systems/sampling"],
  ["/verification/sampled-proofs", "/proof-systems/sampling"],
  ["/verification/sampled-proofs/specification", "/proof-systems/sampling"],
  ["/verification/sampled-proofs/c-flock", "/proof-systems/basic-proofs/flock#integrity"],
  ["/verification/sampled-proofs/benchmarks", "/proof-systems/sampling"],
  ["/verification/sampled-proofs/two-stage", "/proof-systems/sampling#two-stage-sampling"],
  ["/circuits", "/architecture#resource-accounting"],
  ["/circuits/silicon", ""],
  ["/primitives/:path*", ""],
  ["/census", ""],
  ["/census/hardware", ""],
  ["/census/networks", ""],
  ["/census/models", "/integrations/vllm/circuits"],
  ["/census/workloads", "/integrations/vllm/circuits"],
  ["/census/served", "/integrations/vllm/circuits"],
  ["/census/units", "/integrations/vllm/circuits"],
  ["/proof-systems/flock/sampled-proofs", "/proof-systems/basic-proofs/flock#integrity"],
  ["/proof-systems/statements", "/proof-systems/basic-proofs#statements"],
  ["/proof-systems/interaction", ""],
  ["/proof-systems/comparison", ""],
  ["/proof-systems/a-gkr", "/proof-systems/basic-proofs"],
  ["/proof-systems/b-ligero", "/proof-systems/basic-proofs"],
  ["/proof-systems/d-sp1", "/proof-systems/basic-proofs"],
  ["/status", ""],
  ["/store-and-harness", ""],
  ["/harness", ""],
  ["/open-questions", "/architecture#resource-accounting"],
  ["/core", "/architecture#resource-accounting"],
  ["/core/ir", "/architecture#resource-accounting"],
  ["/core/proofs", "/proof-systems/basic-proofs#statements"],
  ["/core/:page", ""],
  ["/proof-service", "/protocols/onsite"],
  ["/protocols/sampled-proofs", "/proof-systems/sampling"],
  ["/protocols/pouw", "/accounting/pouw"],
  ["/protocols/pous", "/accounting/pous"],
  ["/architecture/:page", "/architecture"],
  ["/registry/:path*", "/census/:path*"],
  ["/backends/flock", "/proof-systems/basic-proofs/flock"],
  ["/proof-systems/c-flock", "/proof-systems/basic-proofs/flock"],
  ["/backends/:path*", "/proof-systems/basic-proofs"],
  ["/verity/how-the-pieces-fit", ""],
  ["/verity/security-model", "/proof-systems/sampling"],
  ["/verity/reference/assumptions", ""],
  ["/verity", ""],
  ["/verity/:path*", "/:path*"],

  // Pages lived under /docs until the site moved to its own domain.
  ["/docs", ""],
  ["/docs/:path*", "/:path*"],
]

const nextConfig: NextConfig = {
  // The dev badge sits over the bottom of the sidebar.
  devIndicators: false,
  // Next 16 blocks its dev resources to any other host, and a page opened at
  // 127.0.0.1 then never hydrates: no button works.
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return moved.map(([source, destination]) => ({
      source,
      destination: destination || "/",
      permanent: false,
    }))
  },
}

export default nextConfig
