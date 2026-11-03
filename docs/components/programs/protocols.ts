import {
  Dices,
  EyeOff,
  MemoryStick,
  Network,
  Server,
  ShieldCheck,
} from "lucide-react"

import type {
  Actor,
  FunctionEntry,
  Group,
  Leaf,
  Param,
  Protocol,
} from "@/components/programs/types"

const ZK = "/docs/proof-systems/zero-knowledge"
const C_FLOCK = "/docs/proof-systems/c-flock"
const SAMPLING = "/docs/proof-systems/sampling"
const COMPUTE = "/docs/accounting/compute"
const MEMORY = "/docs/accounting/memory"
const NETWORK = "/docs/accounting/network"

/* The workers are trusted by neither party; they sit on the developer's side
   because they are the developer's machines, behind its ZK server. */
const ACTORS: Record<string, Actor> = {
  workers: {
    id: "workers",
    name: "Workers",
    side: "developer",
    icon: Server,
    shade: "#f05252",
    colorKey: "workers",
  },
  zk_server: {
    id: "zk_server",
    name: "ZK server",
    side: "developer",
    icon: EyeOff,
    shade: "#c81e1e",
    colorKey: "zkServer",
  },
  certifier: {
    id: "certifier",
    name: "Certifier",
    side: "auditor",
    icon: Network,
    shade: "#76a9fa",
    colorKey: "certifiers",
  },
  memory: {
    id: "memory",
    name: "Memory challenger",
    side: "auditor",
    icon: MemoryStick,
    shade: "#3f83f8",
  },
  challenger: {
    id: "challenger",
    name: "Challenger",
    side: "auditor",
    icon: Dices,
    shade: "#0b57c8",
    colorKey: "challenger",
  },
  verifier: {
    id: "verifier",
    name: "Verifier",
    side: "auditor",
    icon: ShieldCheck,
    shade: "#1e3a8a",
    colorKey: "verifier",
  },
}

/* A value the workers send reaches the challenger only as the ZK server's
   commitment to it. */
const throughZkServer = (value: string, hidden: string): Leaf[] => [
  { actor: "workers", to: "zk_server", code: value },
  { actor: "zk_server", code: `${hidden} = commit(${value})` },
  { actor: "zk_server", to: "challenger", code: hidden },
]

/* A committed salt reaches the workers only after the ZK server has checked
   it against the coin commitment. */
const openedCoin = (coin: string, label: string, gap = false): Leaf[] => [
  { actor: "challenger", code: `${coin} = open(coins, "${label}")`, gap },
  { actor: "challenger", to: "zk_server", code: coin },
  { actor: "zk_server", code: `check_coin(${coin}, coin_com)` },
  { actor: "zk_server", to: "workers", code: coin },
]

const register = (onsite: boolean): Group => ({
  label: "Register",
  steps: [
    { actor: "challenger", code: "coins = random()  # every salt the run opens" },
    { actor: "challenger", code: "coin_com = commit(coins)" },
    { actor: "challenger", to: "zk_server", code: "coin_com" },
    ...(onsite
      ? [
          { actor: "memory", code: "indices = random()", gap: true },
          { actor: "memory", code: "index_com = commit(indices)" },
          { actor: "memory", to: "challenger", code: "index_com" },
        ]
      : []),
    { actor: "workers", code: "weights_com = commit(weights)", gap: true },
    ...throughZkServer("weights_com", "h_weights"),
    ...(onsite
      ? [
          ...openedCoin("encoding_salt", "encoding", true),
          { actor: "workers", code: "C = encode(weights, encoding_salt)" },
          { actor: "workers", code: "encoding_com = commit(C)" },
          ...throughZkServer("encoding_com", "h_encoding"),
        ]
      : []),
  ],
})

const serve = (onsite: boolean): Group => ({
  label: "Serve",
  steps: [
    ...openedCoin("salt", "salt"),
    { actor: "workers", code: "trace = serve(program, requests, salt)", gap: true },
    ...(onsite
      ? [
          {
            gap: true,
            loop: "for window in link_windows",
            steps: [
              { actor: "workers", to: "certifier", code: "frames" },
              { actor: "certifier", code: "cert = certify(frames, grid)" },
              { actor: "certifier", to: "workers", code: "cert" },
            ],
          },
          {
            gap: true,
            loop: "for _ in range(k)",
            steps: [
              { actor: "memory", code: "i = challenge(indices)" },
              { actor: "memory", to: "workers", code: "i" },
              { actor: "workers", code: "block = respond(C, i)" },
              { actor: "workers", to: "memory", code: "block" },
              { actor: "memory", code: "session += [time(i, block)]" },
            ],
          },
          { actor: "memory", code: "signed = sign(session)" },
          { actor: "memory", to: "workers", code: "signed" },
        ]
      : []),
    {
      actor: "workers",
      code: "com = commit(trace, boundary_gates(program, partition))",
      gap: true,
    },
    ...throughZkServer("com", "h_com"),
    { actor: "challenger", code: "receipt = log(h_com)" },
  ],
})

const sample: Group = {
  label: "Sample",
  steps: [
    { actor: "challenger", code: "seed = random()" },
    { actor: "challenger", code: "sample = draw(designs, seed)" },
    { actor: "challenger", to: "zk_server", code: "sample" },
    { actor: "zk_server", to: "workers", code: "sample" },
  ],
}

const prove: Group = {
  label: "Prove",
  steps: [
    {
      loop: "for _ in range(rounds(sample))",
      steps: [
        { actor: "workers", code: "msg = prove(sample, trace)" },
        ...throughZkServer("msg", "h_msg"),
        { actor: "challenger", code: "coin = random()" },
        { actor: "challenger", to: "zk_server", code: "coin" },
        { actor: "zk_server", to: "workers", code: "coin" },
      ],
    },
    {
      gap: true,
      loop: "for slot in schedule",
      steps: [
        { actor: "workers", code: "outer = outer_prove(v_pi, slot)" },
        { actor: "workers", to: "zk_server", code: "outer" },
        { actor: "zk_server", code: "released = release(outer, slot)" },
        { actor: "zk_server", to: "challenger", code: "released" },
      ],
    },
  ],
}

const verify = (onsite: boolean): Group => ({
  label: "Verify",
  steps: [
    ...(onsite
      ? [
          { actor: "memory", code: "openings = reveal(indices)" },
          { actor: "memory", to: "verifier", code: "openings" },
        ]
      : []),
    { actor: "challenger", to: "verifier", code: "record" },
    {
      actor: "verifier",
      code: onsite
        ? "answers = verify(v_pi, record, openings)"
        : "answers = verify(v_pi, record)",
    },
    { actor: "verifier", code: "verdict = decide(answers)" },
    { actor: "verifier", output: true, code: "verdict" },
  ],
})

const PARAMS: Param[] = [
  { code: "program", note: "The circuit the workers serve, every gate public." },
  { code: "partition", note: "Its proof units." },
  {
    code: "designs",
    note: "Each subprotocol's sampling design: integrity's over the program's proof units, compute accounting's over its tiles.",
  },
  {
    code: "scheme",
    note: "Compute accounting's scheme, with the declared matrix multiplications, ε_s and δ.",
  },
  { code: "v_pi", note: "The verifier as a circuit, the statement of every outer proof." },
  { code: "schedule", note: "The slots at which the ZK server releases outer proofs." },
]

const FUNCTIONS: Record<string, FunctionEntry> = {
  random: {
    returns: "seed",
    signature: "random() -> bytes",
    body: [
      "Fresh uniform randomness from the drawing party's own source, with no beacon and no derivation from anything the developer sent.",
    ],
  },
  commit: {
    returns: "commitment",
    signature: "commit(x) -> Commitment",
    body: [
      "A hiding, binding commitment to `x`. The workers commit values under the hiding leaves of SHA-512 Merkle trees ([commitments](/docs/proof-systems/commitments)). The ZK server commits each message under a salt it draws for that message alone. The challenger and the memory challenger commit their coins in coin trees.",
    ],
  },
  open: {
    returns: "coin",
    signature: "open(coins, label) -> Coin",
    body: [
      "Opens one committed coin with its path, once. A second request for an opened coin is refused, so a retry never redraws.",
    ],
  },
  check_coin: {
    signature: "check_coin(coin, coin_com) -> None",
    body: [
      `The ZK server checks the opening against \`coin_com\` before it passes the salt on, so the challenger can't choose a salt after seeing a commitment ([randomness](/docs/proof-systems/randomness#what-each-protocol-draws)). A salt that fails stops the session.`,
    ],
  },
  serve: {
    returns: "data",
    signature: "serve(program, requests, salt) -> Trace",
    body: [
      `Runs the program on the requests. Each declared matrix multiplication is computed as [compute accounting](${COMPUTE}/pouw#compute)'s tiles, noised under \`salt\`, and the product the workload uses comes out of them. What stays behind is the [trace](/docs/accounting/circuits#traces).`,
    ],
  },
  boundary_gates: {
    returns: "data",
    signature: "boundary_gates(program, partition) -> set[Gate]",
    body: [
      `The values a unit's check reads: every input gate, and every gate read across a proof-unit boundary ([sampling](${SAMPLING}#commitment-phase)).`,
    ],
  },
  log: {
    returns: "data",
    signature: "log(h_com) -> Receipt",
    body: [
      "The challenger records what it received and logs a receipt naming it. Only then does it draw, and the draw names the receipt.",
    ],
  },
  draw: {
    returns: "coin",
    signature: "draw(designs, seed) -> Sample",
    body: [
      `One sample per subprotocol, each from its own sampling design, with \`seed\` as its only randomness: proof units of the program for [integrity](${SAMPLING}#challenge-phase), and tiles in proportion to their work for [compute accounting](${COMPUTE}/pouw#compute).`,
    ],
  },
  rounds: {
    returns: "data",
    signature: "rounds(sample) -> int",
    body: ["How many rounds the inner proofs of the sample take."],
  },
  prove: {
    returns: "proof",
    signature: "prove(sample, trace) -> bytes",
    body: [
      `The workers' next inner message, with zero knowledge off: the proof that no sampled unit is faulty in the committed values, and that each drawn tile passes its check.`,
    ],
  },
  outer_prove: {
    returns: "proof",
    signature: "outer_prove(v_pi, slot) -> bytes",
    body: [
      `The outer proof due at \`slot\`: the ZK server's commitments open to messages on which $V_\\Pi$ accepts at the coins sent ([zero knowledge](${ZK}#outer-phase)). The workers compute it without its pads. It runs its own rounds in [C-Flock's zero-knowledge mode](${C_FLOCK}#zero-knowledge-mode), on live coins that the challenger commits when the session opens.`,
    ],
  },
  release: {
    returns: "proof",
    signature: "release(outer, slot) -> bytes",
    body: [
      `The ZK server releases each value of the outer proof under the kind the statement's shape gives it: a commitment under a salt it draws, a value it recomputes from its own copy of the witness, a value masked by a pad the workers never see, or a constant. It checks every relation the verifier will check before anything that reads the pads leaves, and releases the proof at its slot ([the contract](${ZK}#the-contract)). The first value that breaks its rule stops the session.`,
    ],
  },
  verify: {
    returns: "data",
    signature: "verify(v_pi, record) -> list[Answer]",
    body: [
      "The verifier checks every outer proof offline against the challenger's record: its commitments, its coins and the released proofs. Each subprotocol answers accept, reject or undecided, with its public outputs on an accept.",
    ],
  },
  decide: {
    returns: "data",
    signature: "decide(answers) -> Verdict",
    body: [
      "Reject when any subprotocol rejects, whatever the others answer, or when the answers don't fit the parameters or the commitment doesn't bind them; otherwise undecided when any is undecided, and accept when every one accepts.",
    ],
  },
}

const ONSITE_FUNCTIONS: Record<string, FunctionEntry> = {
  ...FUNCTIONS,
  encode: {
    returns: "data",
    signature: "encode(weights, encoding_salt) -> C",
    body: [
      `[Memory accounting](${MEMORY}/pous#the-encoding)'s encoding of the weights, which the workers serve from, decoding each tensor on every use.`,
    ],
  },
  certify: {
    returns: "signature",
    signature: "certify(frames, grid) -> Certificate",
    body: [
      `The [network certifier](${NETWORK}/certifier#release) releases each link's frames at a constant rate on the grid, and signs the link-window's record. Certificates go back to the workers as witness and never reach the auditor in the clear.`,
    ],
  },
  challenge: {
    returns: "coin",
    signature: "challenge(indices) -> int",
    body: [
      "The next committed block index, revealed only once the previous answer is in. Revealing it starts its answer's clock.",
    ],
  },
  respond: {
    returns: "data",
    signature: "respond(C, i) -> bytes",
    body: ["The honest answer: block `i` of the encoding, read from memory."],
  },
  time: {
    returns: "data",
    signature: "time(i, block) -> Round",
    body: [
      "The round's record on the memory challenger's own clock: the index, the send and receipt times, and the answer's hash.",
    ],
  },
  sign: {
    returns: "signature",
    signature: "sign(session) -> Signed",
    body: [
      "One signature over the session's round records, under a key only the memory challenger holds. The signed session goes to the workers as witness.",
    ],
  },
  reveal: {
    returns: "data",
    signature: "reveal(indices) -> Openings",
    body: [
      "Once the session has closed, the memory challenger opens every index it committed, so the verifier can check each round's index against `index_com`.",
    ],
  },
  serve: {
    ...FUNCTIONS.serve!,
    body: [
      ...FUNCTIONS.serve!.body,
      "Every frame a node sends or receives passes its network certifier, and the weights are served from the encoding `C`.",
    ],
  },
  commit: {
    ...FUNCTIONS.commit!,
    body: [
      ...FUNCTIONS.commit!.body,
      "The certificates and the signed sessions are committed with the trace, as witness, so the developer can prove that they pass their checks.",
    ],
  },
  verify: {
    ...FUNCTIONS.verify!,
    signature: "verify(v_pi, record, openings) -> list[Answer]",
  },
}

export const REMOTE: Protocol = {
  title: "Remote protocol",
  intro:
    "One serving window, then proving about it, with no hardware of the auditor's at the developer's site.",
  actors: [ACTORS.workers!, ACTORS.zk_server!, ACTORS.challenger!, ACTORS.verifier!],
  params: PARAMS,
  run: [register(false), serve(false), sample, prove, verify(false)],
  functions: FUNCTIONS,
}

export const ONSITE: Protocol = {
  title: "Onsite protocol",
  intro:
    "The remote protocol's run, with network certifiers and memory challengers of the auditor's at the developer's site.",
  actors: [
    ACTORS.workers!,
    ACTORS.zk_server!,
    ACTORS.certifier!,
    ACTORS.memory!,
    ACTORS.challenger!,
    ACTORS.verifier!,
  ],
  params: [
    ...PARAMS,
    {
      code: "grid",
      note: "Network accounting's buckets, rates, frame size and sync values, fixed before the run.",
    },
    {
      code: "encoding",
      note: "Memory accounting's scheme, its k challenges and each answer's deadline.",
    },
  ],
  run: [register(true), serve(true), sample, prove, verify(true)],
  functions: ONSITE_FUNCTIONS,
}
