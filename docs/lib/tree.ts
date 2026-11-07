/*
 * The documentation tree: the one place that decides the sidebar, the
 * breadcrumbs, the previous/next order and which pages exist.
 *
 * The sidebar lists the unlabeled section's pages first, then each labeled
 * section as a group that opens and closes, with its pages beneath it. A node
 * with an `href` is a page, whose body is the markdown file at
 * content/<href>.md. A page's children show beneath it in the sidebar. A hidden
 * page (a browser) is routed but left out of the sidebar and the
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

export type TreeIcon =
  | "overview"
  | "architecture"
  | "remote"
  | "onsite"
  | "proof-systems"
  | "basic-proofs"
  | "flock"
  | "sampling"
  | "zero-knowledge"
  | "recursion"
  | "accounting"
  | "physical"
  | "accelerators"
  | "servers"
  | "datacenters"
  | "pouw"
  | "pous"
  | "poub"
  | "certification"
  | "classification"
  | "inference"
  | "integrations"
  | "vllm"

export type TreeSection = { label?: string; icon?: TreeIcon; nodes: TreeNode[] }

export const tree: TreeSection[] = [
  {
    nodes: [
      {
        label: "Overview",
        href: "/",
        icon: "overview",
        title: "Verity",
        description: "What Verity proves, its two protocols, and where to start.",
      },
      {
        label: "Architecture",
        href: "/architecture",
        icon: "architecture",
        description:
          "The parties and the auditor's devices, the components Verity is built from, and how a protocol composes them into one accept.",
      },
      {
        label: "Remote protocol",
        href: "/protocols/remote",
        icon: "remote",
        description:
          "Integrity and work, checked with no hardware of the auditor's at the site: the run, the trusted base, the premises and the composed guarantee.",
      },
      {
        label: "Onsite protocol",
        href: "/protocols/onsite",
        icon: "onsite",
        description:
          "Remote with the auditor's network certifiers and memory challengers at the site, which add space and communication: their premises and the composed guarantee.",
      },
    ],
  },
  {
    label: "Proof systems",
    icon: "proof-systems",
    nodes: [
      {
        label: "Basic proofs",
        href: "/proof-systems/basic-proofs",
        icon: "basic-proofs",
        description:
          "The commit-and-prove argument the compilers take: its statements, methods and properties, and how Flock implements them.",
        children: [
          {
            label: "Flock",
            href: "/proof-systems/basic-proofs/flock",
            icon: "flock",
            description:
              "The construction: Flock over GF(2^128) on live coins, its verifier in Lean, its knowledge soundness and integrity, and its parameters.",
          },
        ],
      },
      {
        label: "Sampling",
        href: "/proof-systems/sampling",
        icon: "sampling",
        description:
          "Integrity from a random sample of proof blocks, over any commit-and-prove argument: the protocol, its integrity, reading an accept, and two-stage sampling.",
      },
      {
        label: "Zero-knowledge",
        href: "/proof-systems/zero-knowledge",
        icon: "zero-knowledge",
        description:
          "VEIL's masking applied to Flock: what the zero-knowledge mode hides, its protocol, its zero knowledge against honest and malicious verifiers, and where Verity uses it.",
      },
      {
        label: "Recursion",
        href: "/proof-systems/recursion",
        icon: "recursion",
        description:
          "Plain proofs on commitments, and a zero-knowledge proof that they would verify: the theorem, the verifier as a circuit, private circuits, and the ZK server.",
      },
    ],
  },
  {
    label: "Resource accounting",
    icon: "accounting",
    nodes: [
      {
        label: "Physical modeling",
        href: "/accounting/physical",
        icon: "physical",
        description:
          "The other side of each resource protocol's bound: what the hardware can do, and the headroom between that and what an audit certifies.",
        children: [
          {
            label: "Accelerators",
            href: "/accounting/physical/accelerators",
            icon: "accelerators",
            description: "One GPU: its peak rate against proof of useful work, its device memory against proof of useful space, and its share of the node's bandwidth.",
          },
          {
            label: "Servers",
            href: "/accounting/physical/servers",
            icon: "servers",
            description: "The node as one prover: its whole state, the timing assumptions behind proof of useful space, and its read capacity against proof of useful bandwidth.",
          },
          {
            label: "Datacenters",
            href: "/accounting/physical/datacenters",
            icon: "datacenters",
            description: "The links out of the spatial unit: what an accepted run's traffic can carry, the assumptions that make a deployment the certifier's model, and the line rates.",
          },
        ],
      },
      {
        label: "Proof of useful work",
        href: "/accounting/pouw",
        icon: "pouw",
        description:
          "Each tile computed under noise from a salt the prover couldn't predict, a work-weighted sample proved in zero knowledge, and the lower bound on work an accept gives; and Dither, for int8 products.",
      },
      {
        label: "Proof of useful space",
        href: "/accounting/pous",
        icon: "pous",
        description:
          "The weights kept only as a slow-to-encode, fast-to-decode encoding, timed challenges for random blocks, and the lower bound on held state an accept gives.",
      },
      {
        label: "Proof of useful bandwidth",
        href: "/accounting/poub",
        icon: "poub",
        description:
          "A registered store read in chained passes, receipts drawn and opened after each window's roots, and the lower bound on a node's reads an accept gives.",
      },
      {
        label: "Network certification",
        href: "/accounting/network-certification",
        icon: "certification",
        description:
          "The auditor's device on each uplink: constant-rate release on a fixed grid, signed records, and the bound on what frame timing can carry.",
      },
    ],
  },
  {
    label: "Workload classification",
    icon: "classification",
    nodes: [{ label: "Inference vs. training", href: "/workload-classification/inference-vs-training", icon: "inference" }],
  },
  {
    label: "Integrations",
    icon: "integrations",
    nodes: [
      {
        label: "vLLM",
        href: "/integrations/vllm",
        icon: "vllm",
        description: "Hooks vLLM to build each workload's circuit, commit its values while serving, and prove the sampled proof blocks.",
        children: [
          {
            label: "Circuit browser",
            href: "/integrations/vllm/circuits",
            hidden: true,
            description: "Every Program the vLLM integration has on record, shown down to its gates.",
          },
        ],
      },
    ],
  },
]

export type TreePage = TreeNode & { href: string }

// Every page in tree order, parents before their children, with the headings
// and labels above it (its section's heading first, when it has one).
export function treePages(): { page: TreePage; parents: string[] }[] {
  const walk = (nodes: TreeNode[], parents: string[]): { page: TreePage; parents: string[] }[] =>
    nodes.flatMap((node) => [
      ...(node.href ? [{ page: node as TreePage, parents }] : []),
      ...walk(node.children ?? [], [...parents, node.label]),
    ])
  return tree.flatMap((section) => walk(section.nodes, section.label ? [section.label] : []))
}
