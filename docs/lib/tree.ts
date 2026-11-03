/*
 * The documentation tree: the one place that decides the sidebar, the
 * breadcrumbs, the previous/next order and which pages exist.
 *
 * The sidebar's root panel lists the groups in order. A labelled group is a
 * drill row into a panel of its pages; an unlabelled group lists its pages
 * in the root panel. A page's body is the markdown file at
 * content/<href>.md; without one it renders as a placeholder from
 * `description` and `cites`.
 *
 * The reference pages under Hardware and Workloads are the single canonical
 * home for hardware, model, workload and network entries. Other pages cite
 * entries by id instead of restating their numbers; `cites` lists the
 * reference pages a page draws entries from.
 */

export type TreePage = {
  label: string
  href: string
  // The page's h1, when it differs from the sidebar label (e.g. "Overview").
  title?: string
  description: string
  cites?: ReferenceHref[]
  // Wide pages are full-width views with their own route, not markdown.
  layout?: "wide"
  // Draws a divider above this page in its group's panel.
  dividerBefore?: boolean
  icon?: TreeIcon
}

export type TreeIcon =
  | "overview"
  | "protocols"
  | "accounting"
  | "policies"
  | "proof-systems"
  | "getting-started"
  | "integrations"
  | "vllm"
  | "guidelines"
  | "autoresearch"
  | "hardware"
  | "workloads"
  | "assumptions"
  | "glossary"

// A labelled group is its own nested panel, reached from the panel it sits
// in; an unlabelled group lists its pages directly in the root panel.
// Consecutive groups with the same `section` form one run under that
// heading, pages and nested groups together, with a divider between runs.
// A labelled group may hold labelled groups of its own, each a drill row in
// its panel; labels are unique across the tree, since they name panels.
export type TreeGroup = {
  label: string | null
  section?: string
  icon?: TreeIcon
  dividerBefore?: boolean
  pages: TreeEntry[]
}

export type TreeEntry = TreePage | TreeGroup

export const isGroup = (entry: TreeEntry): entry is TreeGroup => "pages" in entry

export const referencePages = {
  "/hardware/accelerators": "Accelerators",
  "/hardware/networks": "Networks",
  "/workloads/inference": "Inference",
} as const

export type ReferenceHref = keyof typeof referencePages

export const tree: TreeGroup[] = [
  {
    label: null,
    pages: [
      {
        label: "Overview",
        href: "/",
        icon: "overview",
        title: "Verity",
        description: "What Verity proves, its two protocols, and where to start.",
      },
    ],
  },
  {
    label: "Protocols",
    icon: "protocols",
    pages: [
      {
        label: "Overview",
        href: "/protocols",
        title: "Protocols",
        description: "The remote and onsite protocols, and their one difference: whether the auditor has devices at the developer's site.",
      },
      {
        label: "Architecture",
        href: "/protocols/architecture",
        description: "The layers and what each establishes, how a run goes, and how subprotocols compose into a protocol.",
      },
      {
        label: "Remote",
        href: "/protocols/remote",
        title: "Remote protocol",
        description: "Integrity and work, checked with no hardware of the auditor's at the site: the parties, the run, the composition, the trusted base, the premises and the composed guarantee.",
      },
      {
        label: "Onsite",
        href: "/protocols/onsite",
        title: "Onsite protocol",
        description: "Remote with the auditor's network certifiers and memory challengers at the site, which add space and communication: their placement, their premises and the composed guarantee.",
      },
    ],
  },
  {
    label: "Resource accounting",
    section: "Subprotocols",
    icon: "accounting",
    pages: [
      {
        label: "Overview",
        href: "/accounting",
        title: "Resource accounting",
        description: "Bounds on the compute, memory and network a deployment used, checked against what it declared.",
      },
      {
        label: "Hardware declaration",
        href: "/accounting/hardware",
        description: "What the developer declares about its hardware, and what the protocols assume about it.",
        cites: ["/hardware/accelerators"],
      },
      {
        label: "Circuit declaration",
        href: "/accounting/circuits",
        description: "The circuits the developer declares: gates and their widths, traces, partitions into proof units, boundary gates and faulty units, and the program format.",
        cites: ["/workloads/inference"],
      },
      {
        label: "Compute",
        dividerBefore: true,
        pages: [
          {
            label: "Overview",
            href: "/accounting/compute",
            title: "Compute accounting",
            description: "The useful work an audit certifies, against the work the declared hardware could have done: the headroom left for undeclared compute.",
            cites: ["/hardware/accelerators", "/workloads/inference"],
          },
          {
            label: "Proof of useful work",
            href: "/accounting/compute/pouw",
            description: "PoUW: each tile computed under noise from a salt the prover couldn't predict, a work-weighted sample proved in zero knowledge, and the lower bound on work an accept gives.",
          },
        ],
      },
      {
        label: "Memory",
        pages: [
          {
            label: "Overview",
            href: "/accounting/memory",
            title: "Memory accounting",
            description: "The state an audit certifies a server holds, against the memory its hardware has: the headroom left for undeclared state.",
            cites: ["/hardware/accelerators", "/workloads/inference"],
          },
          {
            label: "Proof of useful space",
            href: "/accounting/memory/pous",
            description: "PoUS: the weights kept only as a slow-to-encode, fast-to-decode encoding, timed challenges for random blocks, and the lower bound on held state an accept gives.",
          },
        ],
      },
      {
        label: "Memory bandwidth",
        pages: [
          {
            label: "Overview",
            href: "/accounting/bandwidth",
            title: "Memory bandwidth accounting",
            description: "The bytes an audit certifies crossed into the chip in a window, against the device's memory bandwidth: the headroom left for undeclared traffic.",
            cites: ["/hardware/accelerators"],
          },
          {
            label: "Remote bandwidth audit",
            href: "/accounting/bandwidth/remote",
            description: "The protocol of record: the whole node as one resource of read capacity R, chained passes under a live coin a window, sketch-sha512 receipts, and γ with every term named.",
          },
          {
            label: "Per-GPU audit",
            href: "/accounting/bandwidth/audit",
            description: "Tags of every block of the stored encoding under a fresh seed, committed by a deadline and sampled, and the lower bound on ingress an accept gives.",
          },
        ],
      },
      {
        label: "Network",
        pages: [
          {
            label: "Overview",
            href: "/accounting/network",
            title: "Network accounting",
            description: "What a node's traffic can carry beyond the committed computation's output, against what its links could carry: the headroom left for covert communication.",
            cites: ["/hardware/networks"],
          },
          {
            label: "Network certifier",
            href: "/accounting/network/certifier",
            description: "The auditor's device on each uplink: constant-rate release on a fixed grid, signed records, and the bound on what frame timing can carry.",
          },
          {
            label: "Content bound",
            href: "/accounting/network/content",
            description: "What faulty proof units can put in the delivered values, read from sampling's accept.",
          },
        ],
      },
      {
        label: "Composition",
        href: "/accounting/composition",
        dividerBefore: true,
        description: "How each bound reads sampling's accept, and why an application that reads several pays the error once.",
      },
    ],
  },
  {
    label: "Policies",
    section: "Subprotocols",
    icon: "policies",
    pages: [
      {
        label: "NCI",
        href: "/policies/nci",
        title: "Novel communication intensity",
        description: "The inference-only policy: declared circuits divide into small units that each read little novel information.",
      },
    ],
  },
  {
    label: "Proof systems",
    section: "Subprotocols",
    icon: "proof-systems",
    pages: [
      {
        label: "Overview",
        href: "/proof-systems",
        title: "Proof systems",
        description: "Commit-and-prove arguments: statements, the methods Sampling and Zero knowledge call, the properties each needs, and how C-Flock implements them.",
      },
      {
        label: "Sampling",
        href: "/proof-systems/sampling",
        description: "Integrity from a random sample, over any commit-and-prove argument: the protocol, its integrity, and two-stage sampling with lazy commitments.",
      },
      {
        label: "Dither",
        href: "/proof-systems/dither",
        description: "Proof of useful work for served int8 products: fresh dither and noise after the commitment, every 32-step partial sum committed, one checked a round, and a floor of 0.997 of nominal multiplications.",
      },
      {
        label: "Zero knowledge",
        href: "/proof-systems/zero-knowledge",
        description: "Recursion keeps the provers out of the privacy TCB: the ZK server commits to every inner message, and an outer proof shows in zero knowledge that the verifier's circuit accepts them. Its contract, public and private circuits, what still leaks, and what it costs.",
      },
      {
        label: "C-Flock",
        href: "/proof-systems/c-flock",
        dividerBefore: true,
        description: "The proof system: Flock over GF(2^128) on live coins, its verifier in Lean, its knowledge soundness and integrity, a zero-knowledge mode, and its verifier as a circuit.",
      },
      {
        label: "Commitments",
        href: "/proof-systems/commitments",
        dividerBefore: true,
        description: "How values are bound before proving: frame-v3-sha512 trees, hm96 hiding leaves and the vLLM framing.",
      },
      {
        label: "Randomness",
        href: "/proof-systems/randomness",
        description: "The challenger's live coins and the coin tree, derived draws, exact samplers, and what each protocol draws.",
      },
      {
        label: "Performance",
        href: "/proof-systems/performance",
        dividerBefore: true,
        description: "Every construction measured on the same statements: security, overhead, interaction, soundness bounds, and what recursion costs.",
        cites: ["/hardware/accelerators", "/workloads/inference", "/hardware/networks"],
      },
    ],
  },
  {
    label: null,
    section: "Deployment",
    pages: [
      {
        label: "Getting started",
        href: "/getting-started",
        icon: "getting-started",
        description: "How to set up Verity on a deployment.",
      },
    ],
  },
  {
    label: "Integrations",
    section: "Deployment",
    icon: "integrations",
    pages: [
      {
        label: "vLLM",
        href: "/integrations/vllm",
        icon: "vllm",
        description: "Hooks vLLM to build each workload's circuit, commit its values while serving, and prove the drawn units.",
        cites: ["/hardware/accelerators", "/workloads/inference"],
      },
    ],
  },
  {
    label: null,
    section: "Contributing",
    pages: [
      {
        label: "Guidelines",
        href: "/contributing",
        icon: "guidelines",
        title: "Contributing guidelines",
        description: "How reference entries are identified, cited, sourced and reviewed, and what a change must pass.",
      },
      {
        label: "Autoresearch",
        href: "/autoresearch",
        icon: "autoresearch",
        description: "How research runs are launched, recorded and reviewed.",
      },
    ],
  },
  {
    label: "Hardware",
    section: "Reference",
    icon: "hardware",
    pages: [
      {
        label: "Overview",
        href: "/hardware",
        title: "Hardware",
        description: "Back-of-the-envelope figures for the hardware Verity runs on.",
      },
      {
        label: "Accelerators",
        href: "/hardware/accelerators",
        description: "Each accelerator's dense peaks per datatype, with their sources, and the exact semantics of its arithmetic, established against the hardware.",
      },
      {
        label: "Servers",
        href: "/hardware/servers",
        description: "Server configurations: accelerators per server, memory, interconnect and network uplinks.",
      },
      {
        label: "Networks",
        href: "/hardware/networks",
        description: "Network profiles, including the reference network that evaluations charge interaction at.",
      },
    ],
  },
  {
    label: "Workloads",
    section: "Reference",
    icon: "workloads",
    pages: [
      {
        label: "Overview",
        href: "/workloads",
        title: "Workloads",
        description: "Back-of-the-envelope figures for training and inference workloads.",
      },
      {
        label: "Training",
        href: "/workloads/training",
        description: "What training workloads compute and read.",
      },
      {
        label: "Inference",
        href: "/workloads/inference",
        description: "The models the vLLM integration serves, their Programs, the subcircuit templates they lower to, and the served configurations on record.",
      },
    ],
  },
  {
    label: null,
    section: "Reference",
    pages: [
      {
        label: "Security assumptions",
        href: "/assumptions",
        icon: "assumptions",
        description: "What Verity's components rest on, and how far to trust each assumption.",
        layout: "wide",
      },
      {
        label: "Glossary",
        href: "/glossary",
        icon: "glossary",
        description: "The terms these pages use, each with its one meaning.",
      },
    ],
  },
]

export function groupId(group: TreeGroup) {
  return (group.label ?? "").toLowerCase().replace(/\s+/g, "-")
}

// Every page in sidebar order, with the labelled groups it sits in, outermost first.
export function treePages(): { page: TreePage; groups: TreeGroup[] }[] {
  const walk = (entries: TreeEntry[], groups: TreeGroup[]): { page: TreePage; groups: TreeGroup[] }[] =>
    entries.flatMap((entry) => (isGroup(entry) ? walk(entry.pages, entry.label === null ? groups : [...groups, entry]) : [{ page: entry, groups }]))
  return tree.flatMap((group) => walk(group.pages, group.label === null ? [] : [group]))
}

// Every labelled group, each with the panel it is reached from.
export function treePanels(): { group: TreeGroup; parent: string; depth: number }[] {
  const walk = (group: TreeGroup, parent: string, depth: number): { group: TreeGroup; parent: string; depth: number }[] => [
    { group, parent, depth },
    ...group.pages.filter(isGroup).flatMap((child) => walk(child, groupId(group), depth + 1)),
  ]
  return tree.filter((group) => group.label !== null).flatMap((group) => walk(group, "root", 1))
}

// The labelled groups a page sits in, outermost first.
export function groupsForPath(pathname: string): TreeGroup[] {
  return treePages().find(({ page }) => page.href === pathname)?.groups ?? []
}

// The sidebar panel a page lives in: its innermost labelled group's panel,
// or the root panel for unlabelled groups.
export function panelForPath(pathname: string): string {
  const groups = groupsForPath(pathname)
  return groups.length ? groupId(groups[groups.length - 1]!) : "root"
}

// A group's first page, depth first: where its drill row links.
export function firstHref(group: TreeGroup): string {
  const first = group.pages[0]
  if (!first) return "/"
  return isGroup(first) ? firstHref(first) : first.href
}
