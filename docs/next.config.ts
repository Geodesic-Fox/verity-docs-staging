import type { NextConfig } from "next"

// Where each page of an earlier layout lives now, so open tabs and shared
// links land; an empty destination is the Overview. The first match wins, so
// specific rules come before catch-alls, and a pattern ending in :path* takes
// the page and everything under it. The /census data routes (boolean,
// circuits, definitions, lowering, modules, programs, serving) are route
// handlers the graphs fetch: never redirect them.
const moved: [string, string][] = [
  // The tree of Nov 6, 2026.
  ["/proof-systems/flock", "/proof-systems/basic-proofs#flock"],
  ["/accounting", "/architecture#resource-accounting"],
  ["/accounting/compute/useful", "/accounting/compute#proof-of-useful-work"],
  ["/accounting/compute/useless", "/accounting/compute"],
  ["/accounting/memory/useful", "/accounting/memory#proof-of-useful-space"],
  ["/accounting/memory/useless", "/accounting/memory"],
  ["/accounting/memory/reads", "/accounting/memory"],
  ["/accounting/network/certification", "/accounting/network#network-certifier"],
  ["/workload-classification", "/workload-classification/inference-vs-training"],

  // The tree of Nov 3, 2026.
  ["/proof-systems", "/proof-systems/basic-proofs"],
  ["/proof-systems/dither", "/accounting/compute#dither"],
  ["/proof-systems/commitments", ""],
  ["/proof-systems/randomness", ""],
  ["/proof-systems/performance", ""],
  ["/accounting/compute/pouw", "/accounting/compute#proof-of-useful-work"],
  ["/accounting/memory/pous", "/accounting/memory#proof-of-useful-space"],
  ["/accounting/network/certifier", "/accounting/network#network-certifier"],
  ["/accounting/network/content", "/accounting/network#content-bound"],
  ["/accounting/composition", "/architecture#composition"],
  ["/accounting/bandwidth/:path*", "/accounting/memory"],
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
  ["/verification/sampled-proofs/c-flock", "/proof-systems/basic-proofs#integrity"],
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
  ["/proof-systems/flock/sampled-proofs", "/proof-systems/basic-proofs#integrity"],
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
  ["/protocols/pouw", "/accounting/compute#proof-of-useful-work"],
  ["/protocols/pous", "/accounting/memory#proof-of-useful-space"],
  ["/architecture/:page", "/architecture"],
  ["/registry/:path*", "/census/:path*"],
  ["/backends/flock", "/proof-systems/basic-proofs#flock"],
  ["/proof-systems/c-flock", "/proof-systems/basic-proofs#flock"],
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
