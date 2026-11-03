import type { NextConfig } from "next"

// Where each page of an earlier layout lives now, so open tabs and shared
// links land; an empty destination is the Overview. The first match wins, so
// specific rules come before catch-alls, and a pattern ending in :path* takes
// the page and everything under it. The /census data routes (boolean,
// circuits, definitions, lowering, modules, programs, serving) are route
// handlers the graphs fetch: never redirect them.
const moved: [string, string][] = [
  // The tree of Nov 3, 2026.
  ["/proof-systems", "/proof-systems/basic-proofs"],
  ["/proof-systems/dither", "/accounting/compute/useful#dither"],
  ["/proof-systems/commitments", ""],
  ["/proof-systems/randomness", ""],
  ["/proof-systems/performance", ""],
  ["/accounting/compute/pouw", "/accounting/compute/useful"],
  ["/accounting/memory/pous", "/accounting/memory/useful"],
  ["/accounting/network/certifier", "/accounting/network/certification"],
  ["/accounting/network/content", "/accounting/network#content-bound"],
  ["/accounting/composition", "/accounting#composition"],
  ["/accounting/bandwidth/:path*", "/accounting/memory/reads"],
  ["/accounting/hardware", "/accounting"],
  ["/accounting/circuits", "/accounting"],
  ["/protocols", "/protocols/remote"],
  ["/protocols/architecture", "/protocols/remote#physical-architecture"],
  ["/policies/:path*", "/workload-classification"],
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
  ["/verification/sampled-proofs/c-flock", "/proof-systems/c-flock#integrity"],
  ["/verification/sampled-proofs/benchmarks", "/proof-systems/sampling"],
  ["/verification/sampled-proofs/two-stage", "/proof-systems/sampling#two-stage-sampling"],
  ["/circuits", "/accounting"],
  ["/circuits/silicon", ""],
  ["/primitives/:path*", ""],
  ["/census", ""],
  ["/census/hardware", ""],
  ["/census/networks", ""],
  ["/census/models", "/integrations/vllm/circuits"],
  ["/census/workloads", "/integrations/vllm/circuits"],
  ["/census/served", "/integrations/vllm/circuits"],
  ["/census/units", "/integrations/vllm/circuits"],
  ["/proof-systems/c-flock/sampled-proofs", "/proof-systems/c-flock#integrity"],
  ["/proof-systems/statements", "/proof-systems/basic-proofs#statements"],
  ["/proof-systems/interaction", ""],
  ["/proof-systems/comparison", ""],
  ["/proof-systems/a-gkr", "/proof-systems/basic-proofs"],
  ["/proof-systems/b-ligero", "/proof-systems/basic-proofs"],
  ["/proof-systems/d-sp1", "/proof-systems/basic-proofs"],
  ["/status", ""],
  ["/store-and-harness", ""],
  ["/harness", ""],
  ["/open-questions", "/accounting"],
  ["/core", "/accounting"],
  ["/core/ir", "/accounting"],
  ["/core/proofs", "/proof-systems/basic-proofs#statements"],
  ["/core/:page", ""],
  ["/proof-service", "/protocols/onsite"],
  ["/protocols/sampled-proofs", "/proof-systems/sampling"],
  ["/protocols/pouw", "/accounting/compute/useful"],
  ["/protocols/pous", "/accounting/memory/useful"],
  ["/architecture/:page", "/protocols/remote#physical-architecture"],
  ["/registry/:path*", "/census/:path*"],
  ["/backends/flock", "/proof-systems/c-flock"],
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
  async redirects() {
    return moved.map(([source, destination]) => ({
      source,
      destination: destination || "/",
      permanent: false,
    }))
  },
}

export default nextConfig
