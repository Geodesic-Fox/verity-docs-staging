import { EyeOff, Server, ShieldCheck } from "lucide-react"

import type {
  Actor,
  FunctionEntry,
  Group,
  Protocol,
  Step,
} from "@/components/programs/types"

const ZK = "/proof-systems/zero-knowledge"

const PROVER: Actor = {
  id: "prover",
  name: "Prover",
  side: "developer",
  icon: Server,
  shade: "#f05252",
}
const WORKERS: Actor = {
  id: "workers",
  name: "Workers",
  side: "developer",
  icon: Server,
  shade: "#f05252",
  colorKey: "workers",
}
const ZK_SERVER: Actor = {
  id: "zk_server",
  name: "ZK server",
  side: "developer",
  icon: EyeOff,
  shade: "#c81e1e",
  colorKey: "zkServer",
}
const VERIFIER: Actor = {
  id: "verifier",
  name: "Verifier",
  side: "auditor",
  icon: ShieldCheck,
  shade: "#0b57c8",
  colorKey: "verifier",
}

const FUNCTIONS: Record<string, FunctionEntry> = {
  random: {
    returns: "seed",
    signature: "random() -> bytes",
    body: ["Fresh uniform randomness from the drawing party's own source."],
  },
  rounds: {
    returns: "data",
    signature: "rounds(stmt) -> int",
    body: [
      "How many rounds a protocol takes: $\\Pi$ on `x`, or $\\mathsf{Arg}$ on its statement. Like every message's length, it is fixed by public data.",
    ],
  },
  P_pi: {
    returns: "proof",
    signature: "P_pi(x, w, c) -> bytes",
    body: [
      "$\\Pi$'s prover $P_\\Pi$: its next message, given the coins so far. It is any program, used as a black box: nothing here looks inside it or changes it.",
    ],
  },
  Com: {
    returns: "commitment",
    signature: "Com(m, s) -> Commitment",
    body: [
      "A hiding, binding commitment to one message under a salt drawn for it alone. The verifier answers it as it would the message: $\\Pi$ is public-coin, so its coins never depend on what a message says.",
    ],
  },
  V_pi: {
    returns: "data",
    signature: "V_pi(x, m, c) -> (bool, Outputs)",
    tex: String.raw`V_\Pi(x, m, c) = (b, o)`,
    body: [
      "$\\Pi$'s verifier $V_\\Pi$, as a circuit: from the statement, the messages and the coins, its verdict $b$ and its public outputs $o$. $\\Pi$ is public-coin, so this function is all its verifier does.",
    ],
  },
  R_out: {
    returns: "data",
    signature: "R_out(x, h, c, o) -> Statement",
    tex: String.raw`\exists\, (m_i, s_i)_{i=1}^{r}:\ \ \mathsf{Com}(m_i; s_i) = h_i \ \ \forall i \;\wedge\; V_\Pi(x, m, c) = (1, o)`,
    body: [
      `The outer statement: openings of every commitment on which $V_\\Pi$ accepts at the coins $c$, with outputs $o$. Its witness is the openings, never $w$: $V_\\Pi$ checks a transcript, not the computation behind it ([the protocol](${ZK}#protocol)).`,
    ],
  },
  P_arg: {
    returns: "proof",
    signature: "P_arg(stmt, witness, coin) -> bytes",
    body: [
      "$\\mathsf{Arg}$'s prover: its next message for the outer statement, in zero knowledge.",
    ],
  },
  V_arg: {
    returns: "data",
    signature: "V_arg(stmt, proof) -> bool",
    body: [
      "$\\mathsf{Arg}$'s verifier. It reads the outer statement and the outer transcript, never a message of $\\Pi$.",
    ],
  },
}

const inner = (bound: string): Group => ({
  label: "Inner",
  steps: [
    { actor: "prover", code: "m, s, h, c = [], [], [], []" },
    { actor: "verifier", code: "h, c = [], []" },
    {
      gap: true,
      loop: `for i in range(rounds(${bound}))`,
      steps: [
        { actor: "prover", code: "m.append(P_pi(x, w, c))  # Π's prover, unmodified" },
        { actor: "prover", code: "s.append(random())" },
        { actor: "prover", code: "h.append(Com(m[i], s[i]))" },
        { actor: "prover", to: "verifier", code: "h[i]" },
        { actor: "verifier", code: "c.append(random())" },
        { actor: "verifier", to: "prover", code: "c[i]" },
      ],
    },
  ],
})

const outerRound = (witness: string): Group => ({
  gap: true,
  loop: "for j in range(rounds(stmt))",
  steps: [
    { actor: "verifier", code: "coin = random()" },
    { actor: "verifier", to: "prover", code: "coin" },
    { actor: "prover", code: `msg = P_arg(stmt, ${witness}, coin)  # zero knowledge` },
    { actor: "prover", to: "verifier", code: "msg" },
    { actor: "verifier", code: "proof.append((coin, msg))" },
  ],
})

const outer: Group = {
  label: "Outer",
  steps: [
    { actor: "prover", code: "b, o = V_pi(x, m, c)  # Π's verdict and outputs" },
    { actor: "prover", to: "verifier", code: "o" },
    { actor: "prover", code: "stmt = R_out(x, h, c, o)" },
    { actor: "verifier", code: "stmt = R_out(x, h, c, o)" },
    { actor: "verifier", code: "proof = []" },
    outerRound("(m, s)"),
  ],
}

const verify: Group = {
  label: "Verify",
  steps: [
    {
      gap: true,
      loop: "if V_arg(stmt, proof)",
      steps: [{ actor: "verifier", output: true, code: "accept, o" }],
    },
    {
      loop: "else",
      steps: [{ actor: "verifier", output: true, code: "reject" }],
    },
  ],
}

/* The transformation of Ben-Or et al. over an abstract public-coin protocol
   Π, commitment Com and zero-knowledge commit-and-prove argument Arg. */
export const RECURSION: Protocol = {
  title: "Zero knowledge",
  intro:
    "The prover runs Π unmodified and sends a commitment in place of each message, then proves in zero knowledge that the committed messages make V_Π accept with the outputs it sends.",
  actors: [PROVER, VERIFIER],
  params: [
    { code: "x", note: "The statement." },
    { code: "V_pi", note: "Π's verifier as a circuit, returning its verdict and outputs." },
  ],
  run: [inner("x"), outer, verify],
  functions: FUNCTIONS,
}

const faded = (steps: Step[]): Step[] =>
  steps.map((s) =>
    "steps" in s
      ? { ...s, kept: true, steps: faded(s.steps) }
      : { ...s, kept: true }
  )

/* The same run with x in the outer witness: what changes reads at full
   strength, what the public-circuit run shares reads faded. */
export const RECURSION_PRIVATE: Protocol = {
  title: "Zero knowledge, private circuit",
  intro:
    "The public-circuit run, with the statement committed at registration and moved into the outer proof's witness.",
  actors: [PROVER, VERIFIER],
  params: [
    { code: "cls", note: "The class: the bounds every admissible statement meets." },
    { code: "V_pi", note: "Π's verifier as one circuit for the whole class, reading the statement as data." },
  ],
  run: [
    {
      label: "Register",
      steps: [
        { actor: "prover", code: "s_x = random()" },
        { actor: "prover", code: "h_x = Com(pad(x, cls), s_x)" },
        { actor: "prover", to: "verifier", code: "h_x" },
      ],
    },
    {
      label: "Inner",
      steps: [
        ...faded(inner("cls").steps.slice(0, 2)),
        {
          ...(inner("cls").steps[2] as Group),
          steps: faded((inner("cls").steps[2] as Group).steps),
        },
      ],
    },
    {
      label: "Outer",
      steps: [
        ...faded(outer.steps.slice(0, 2)),
        { actor: "prover", code: "stmt = R_cls(cls, h_x, h, c, o)" },
        { actor: "verifier", code: "stmt = R_cls(cls, h_x, h, c, o)" },
        ...faded([{ actor: "verifier", code: "proof = []" }]),
        {
          ...outerRound("(x, s_x, m, s)"),
          kept: true,
          steps: outerRound("(x, s_x, m, s)").steps.map((s, i) =>
            i === 2 ? s : faded([s])[0]!
          ),
        },
      ],
    },
    { ...verify, steps: faded(verify.steps) },
  ],
  functions: {
    ...FUNCTIONS,
    pad: {
      returns: "data",
      signature: "pad(x, cls) -> bytes",
      body: [
        "The statement padded to the class's full size, so the commitment's length says nothing about it.",
      ],
    },
    R_cls: {
      returns: "data",
      signature: "R_cls(cls, h_x, h, c, o) -> Statement",
      tex: String.raw`\exists\, x, s_x, (m_i, s_i)_i:\ \ \mathsf{Com}(\mathrm{pad}(x); s_x) = h_x \;\wedge\; x \in \mathit{cls} \;\wedge\; \mathsf{Com}(m_i; s_i) = h_i\ \forall i \;\wedge\; V_\Pi(x, m, c) = (1, o)`,
      body: [
        `The outer statement with $x$ moved into the witness: some $x$ of the class opens $h_x$, and openings exist on which $V_\\Pi$ accepts for that $x$ with outputs $o$. $V_\\Pi$ is one circuit for the whole class and reads $x$ as data ([private circuit](${ZK}#private-circuit)).`,
      ],
    },
  },
}

/* The public-circuit run split across the workers and the ZK server, which
   draws every salt and pad and is the workers' only path to the verifier. */
export const RECURSION_DEPLOYED: Protocol = {
  title: "Zero knowledge, deployed",
  intro:
    "The workers run both provers; the ZK server salts every inner message, computes the outputs and releases the outer proof under its contract, each value at its slot.",
  actors: [WORKERS, ZK_SERVER, VERIFIER],
  run: [
    {
      label: "Inner",
      steps: [
        { actor: "workers", code: "c = []" },
        { actor: "zk_server", code: "m, s, h, c = [], [], [], []" },
        { actor: "verifier", code: "h, c = [], []" },
        {
          gap: true,
          loop: "for i in range(rounds(x))",
          steps: [
            { actor: "workers", code: "msg = P_pi(x, w, c)  # Π's prover, unmodified" },
            { actor: "workers", to: "zk_server", code: "msg" },
            { actor: "zk_server", code: "m.append(msg)" },
            { actor: "zk_server", code: "s.append(random())  # the workers can't choose it" },
            { actor: "zk_server", code: "h.append(Com(m[i], s[i]))" },
            { actor: "zk_server", to: "verifier", code: "h[i]  # at its slot" },
            { actor: "verifier", code: "c.append(random())" },
            { actor: "verifier", to: "zk_server", code: "c[i]" },
            { actor: "zk_server", to: "workers", code: "c[i]" },
          ],
        },
      ],
    },
    {
      label: "Outer",
      steps: [
        { actor: "zk_server", code: "b, o = V_pi(x, m, c)" },
        { actor: "zk_server", code: "require(b)" },
        { actor: "zk_server", to: "verifier", code: "o  # at its slot" },
        { actor: "zk_server", code: "stmt = R_out(x, h, c, o)" },
        { actor: "verifier", code: "stmt = R_out(x, h, c, o)" },
        { actor: "verifier", code: "proof = []" },
        { actor: "zk_server", to: "workers", code: "stmt, (m, s)" },
        {
          gap: true,
          loop: "for j in range(rounds(stmt))",
          steps: [
            { actor: "verifier", code: "coin = random()" },
            { actor: "verifier", to: "zk_server", code: "coin" },
            { actor: "zk_server", to: "workers", code: "coin" },
            { actor: "workers", code: "msg = P_arg(stmt, (m, s), coin)  # without the pads" },
            { actor: "workers", to: "zk_server", code: "msg" },
            { actor: "zk_server", code: "out = release(msg)" },
            { actor: "zk_server", to: "verifier", code: "out  # at its slot" },
            { actor: "verifier", code: "proof.append((coin, out))" },
          ],
        },
      ],
    },
    verify,
  ],
  functions: {
    ...FUNCTIONS,
    P_pi: {
      ...FUNCTIONS.P_pi!,
      body: [
        "$\\Pi$'s prover's next message. The workers may run any prover, on any kernels: nothing they send reaches the verifier as they sent it.",
      ],
    },
    P_arg: {
      ...FUNCTIONS.P_arg!,
      body: [
        "$\\mathsf{Arg}$'s next message, computed by the workers without its pads: the bulk of the outer proof's arithmetic.",
      ],
    },
    require: {
      signature: "require(cond) -> None",
      body: [
        "Stops the session if `cond` fails: nothing more leaves, and the verifier sees a stop.",
      ],
    },
    release: {
      returns: "proof",
      signature: "release(msg) -> bytes",
      body: [
        `Releases each value of the workers' message by its kind, which $\\mathsf{Arg}$ and the statement's shape fix: a salted commitment, a value the ZK server recomputes, a masked value whose relation it checks, or a constant. The first value that breaks its kind stops the session ([the contract](${ZK}#the-contract)).`,
      ],
    },
  },
}
