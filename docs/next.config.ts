import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // The dev badge sits over the bottom of the sidebar.
  devIndicators: false,
  async redirects() {
    // Earlier page layouts, so open tabs and shared links land; an empty
    // destination is the Overview. Order matters: the first match wins, so
    // specific rules come before the /verity catch-all.
    // The /census data routes (boolean, definitions, modules, programs,
    // serving) are route handlers the graphs fetch: never redirect them.
    const moved: [string, string][] = [
      ["/vllm", "/integrations/vllm"],
      ["/benchmarks", "/proof-systems/performance"],
      ["/benchmarks/tables", "/proof-systems/performance"],
      ["/flows", ""],
      ["/policies", "/policies/nci"],
      ["/verification", "/proof-systems/sampling"],
      ["/verification/sampled-proofs", "/proof-systems/sampling"],
      ["/verification/sampled-proofs/specification", "/proof-systems/sampling"],
      [
        "/verification/sampled-proofs/c-flock",
        "/proof-systems/c-flock#integrity",
      ],
      ["/verification/sampled-proofs/benchmarks", "/proof-systems/sampling"],
      [
        "/verification/sampled-proofs/two-stage",
        "/proof-systems/sampling#two-stage-sampling",
      ],
      ["/circuits", "/accounting/circuits"],
      ["/circuits/silicon", "/hardware/accelerators#silicon"],
      ["/primitives", "/accounting/circuits"],
      ["/primitives/circuits", "/accounting/circuits"],
      ["/primitives/silicon", "/hardware/accelerators#silicon"],
      ["/primitives/commitments", "/proof-systems/commitments"],
      ["/primitives/randomness", "/proof-systems/randomness"],
      ["/census", "/contributing"],
      ["/census/hardware", "/hardware/accelerators"],
      ["/census/networks", "/hardware/networks"],
      ["/census/models", "/workloads/inference"],
      ["/census/workloads", "/workloads/inference#subcircuit-templates"],
      ["/census/served", "/workloads/inference#served-configurations"],
      ["/census/units", "/workloads/inference#model-graphs"],
      [
        "/proof-systems/c-flock/sampled-proofs",
        "/proof-systems/c-flock#integrity",
      ],
      ["/proof-systems/statements", "/proof-systems#statements"],
      ["/proof-systems/interaction", "/proof-systems/performance#interaction"],
      ["/proof-systems/comparison", "/proof-systems/performance"],
      ["/proof-systems/a-gkr", "/proof-systems"],
      ["/proof-systems/b-ligero", "/proof-systems"],
      ["/proof-systems/d-sp1", "/proof-systems"],
      ["/status", ""],
      ["/store-and-harness", "/autoresearch"],
      ["/harness", "/autoresearch"],
      ["/open-questions", "/accounting"],
      ["/core", "/accounting/circuits"],
      ["/core/ir", "/accounting/circuits"],
      ["/core/proofs", "/proof-systems#statements"],
      ["/core/interaction", "/proof-systems/performance#interaction"],
      ["/core/:page", "/primitives/:page"],
      ["/proof-service", "/protocols/onsite"],
      ["/protocols/sampled-proofs", "/proof-systems/sampling"],
      ["/protocols/pouw", "/accounting/compute"],
      ["/protocols/pous", "/accounting/memory"],
      ["/architecture/:page", "/protocols/architecture"],
      ["/registry/:path*", "/census/:path*"],
      ["/backends/flock", "/proof-systems/c-flock"],
      ["/backends/sp1", "/proof-systems"],
      ["/backends", "/proof-systems"],
      ["/backends/:path*", "/proof-systems/:path*"],
      ["/verity/how-the-pieces-fit", ""],
      ["/verity/security-model", "/proof-systems/sampling"],
      ["/verity/reference/assumptions", "/assumptions"],
      ["/verity", ""],
      ["/verity/:path*", "/:path*"],
    ]
    return [
      {
        source: "/benchmarks/:path*",
        destination: "/proof-systems/performance",
        permanent: false,
      },
      ...moved.map(([source, destination]) => ({
        source,
        destination: destination || "/",
        permanent: false,
      })),
      // Pages lived under /docs until the site moved to its own domain.
      { source: "/docs", destination: "/", permanent: false },
      { source: "/docs/:path*", destination: "/:path*", permanent: false },
    ]
  },
}

export default nextConfig
