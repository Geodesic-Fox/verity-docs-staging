/*
 * The documentation tree: the one place that decides the sidebar, the
 * breadcrumbs, the previous/next order and which pages exist.
 *
 * A node with an `href` is a page, whose body is the markdown file at
 * content/<href>.md; without one it renders as a blank placeholder. A node
 * with `children` is a folder, always open in the sidebar; a folder with an
 * `href` is a page as well. A hidden page (a construction too long for its
 * abstract's page, a browser) is routed but left out of the sidebar and the
 * previous/next order: the page it belongs to links to it.
 */

export type TreeNode = {
  label: string
  href?: string
  // The page's h1, when it differs from the sidebar label (e.g. "Overview").
  title?: string
  description?: string
  icon?: TreeIcon
  hidden?: boolean
  children?: TreeNode[]
}

export type TreeIcon = "overview" | "protocols" | "subprotocols" | "classification" | "integrations"

export const tree: TreeNode[] = [
  {
    label: "Overview",
    href: "/",
    icon: "overview",
    title: "Verity",
    description: "What Verity proves, its two protocols, and where to start.",
  },
  {
    label: "Protocols",
    icon: "protocols",
    children: [
      {
        label: "Remote protocol",
        href: "/protocols/remote",
        description:
          "Integrity and work, checked with no hardware of the auditor's at the site: its physical architecture, the run, the trusted base, the premises and the composed guarantee.",
      },
      {
        label: "Onsite protocol",
        href: "/protocols/onsite",
        description:
          "Remote with the auditor's network certifiers and memory challengers at the site, which add space and communication: their placement, their premises and the composed guarantee.",
      },
    ],
  },
  {
    label: "Subprotocols",
    icon: "subprotocols",
    children: [
      {
        label: "Proof systems",
        children: [
          {
            label: "Basic proofs",
            href: "/proof-systems/basic-proofs",
            description:
              "Commit-and-prove arguments: statements, the methods sampling and zero knowledge call, the properties each needs, and C-Flock, the construction.",
          },
          {
            label: "C-Flock",
            href: "/proof-systems/c-flock",
            hidden: true,
            description:
              "The proof system: Flock over GF(2^128) on live coins, its verifier in Lean, its knowledge soundness and integrity, a zero-knowledge mode, and its verifier as a circuit.",
          },
          {
            label: "Sampling",
            href: "/proof-systems/sampling",
            description:
              "Integrity from a random sample, over any commit-and-prove argument: the protocol, its integrity, and two-stage sampling with lazy commitments.",
          },
          {
            label: "Zero-knowledge",
            href: "/proof-systems/zero-knowledge",
            description:
              "The verifier learns only whether a subprotocol's verifier would accept, and its public outputs: the contract, public and private circuits, what still leaks, and what it costs.",
          },
          { label: "Recursion", href: "/proof-systems/recursion" },
        ],
      },
      {
        label: "Resource accounting",
        href: "/accounting",
        description:
          "Bounds on the compute, memory and network a deployment used, checked against what it declared, and how the subprotocols that give them compose.",
        children: [
          {
            label: "Compute",
            children: [
              {
                label: "Forced matrix multiplication (useful)",
                href: "/accounting/compute/useful",
                description:
                  "Each tile computed under noise from a salt the prover couldn't predict, a work-weighted sample proved in zero knowledge, and the lower bound on work an accept gives; and Dither, for int8 products.",
              },
              { label: "Forced matrix multiplication (useless)", href: "/accounting/compute/useless" },
              {
                label: "Accounting",
                href: "/accounting/compute",
                title: "Compute accounting",
                description:
                  "The useful work an audit certifies, against the work the declared hardware could have done: the headroom left for undeclared compute.",
              },
            ],
          },
          {
            label: "Network",
            children: [
              {
                label: "Network certification",
                href: "/accounting/network/certification",
                description:
                  "The auditor's device on each uplink: constant-rate release on a fixed grid, signed records, and the bound on what frame timing can carry.",
              },
              {
                label: "Accounting",
                href: "/accounting/network",
                title: "Network accounting",
                description:
                  "What a node's traffic can carry beyond the committed computation's output, in its timing and its content, against what its links could carry.",
              },
            ],
          },
          {
            label: "Memory",
            children: [
              {
                label: "Forced occupancy (useful)",
                href: "/accounting/memory/useful",
                description:
                  "The weights kept only as a slow-to-encode, fast-to-decode encoding, timed challenges for random blocks, and the lower bound on held state an accept gives.",
              },
              { label: "Forced occupancy (useless)", href: "/accounting/memory/useless" },
              { label: "Forced reads", href: "/accounting/memory/reads" },
              {
                label: "Accounting",
                href: "/accounting/memory",
                title: "Memory accounting",
                description:
                  "The state an audit certifies a server holds, against the memory its hardware has: the headroom left for undeclared state.",
              },
            ],
          },
        ],
      },
    ],
  },
  { label: "Workload classification", href: "/workload-classification", icon: "classification" },
  {
    label: "Integrations",
    icon: "integrations",
    children: [
      {
        label: "vLLM",
        href: "/integrations/vllm",
        description: "Hooks vLLM to build each workload's circuit, commit its values while serving, and prove the drawn units.",
      },
      {
        label: "Circuit browser",
        href: "/integrations/vllm/circuits",
        hidden: true,
        description: "Every Program the vLLM integration has on record, drawn down to its gates.",
      },
    ],
  },
]

export type TreePage = TreeNode & { href: string }

// Every page in tree order, parents before their children, with the labels of the folders above it.
export function treePages(): { page: TreePage; parents: string[] }[] {
  const walk = (nodes: TreeNode[], parents: string[]): { page: TreePage; parents: string[] }[] =>
    nodes.flatMap((node) => [
      ...(node.href ? [{ page: node as TreePage, parents }] : []),
      ...walk(node.children ?? [], [...parents, node.label]),
    ])
  return walk(tree, [])
}
