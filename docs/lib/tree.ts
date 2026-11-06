/*
 * The documentation tree: the one place that decides the sidebar, the
 * breadcrumbs, the previous/next order and which pages exist.
 *
 * The sidebar lists sections, each under its heading (if it has one). A node
 * with an `href` is a page, whose body is the markdown file at
 * content/<href>.md; without one it renders as a blank placeholder. A hidden
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
  | "basic-proofs"
  | "sampling"
  | "zero-knowledge"
  | "recursion"
  | "compute"
  | "network"
  | "memory"
  | "inference"
  | "vllm"

export type TreeSection = { label?: string; nodes: TreeNode[] }

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
    nodes: [
      {
        label: "Basic proofs",
        href: "/proof-systems/basic-proofs",
        icon: "basic-proofs",
        description:
          "The commit-and-prove argument the compilers take: statements, methods and properties, and Flock, the construction, with its verifier in Lean.",
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
          "VEIL's masking, applied to Flock: the zero-knowledge mode, and its zero knowledge against honest and malicious verifiers.",
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
    nodes: [
      {
        label: "Compute",
        href: "/accounting/compute",
        title: "Compute accounting",
        icon: "compute",
        description:
          "Proof of useful work, and the headroom it leaves: the work the registered hardware could have done beyond what an audit certifies.",
      },
      {
        label: "Network",
        href: "/accounting/network",
        title: "Network accounting",
        icon: "network",
        description:
          "What a node's traffic can carry beyond the committed computation's output: the content bound, the network certifier, and the headroom on the wire.",
      },
      {
        label: "Memory",
        href: "/accounting/memory",
        title: "Memory accounting",
        icon: "memory",
        description:
          "Proof of useful space, and the headroom it leaves: the memory a server has beyond the encoding of the weights an audit certifies it held.",
      },
    ],
  },
  {
    label: "Workload classification",
    nodes: [{ label: "Inference vs. training", href: "/workload-classification/inference-vs-training", icon: "inference" }],
  },
  {
    label: "Integrations",
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
