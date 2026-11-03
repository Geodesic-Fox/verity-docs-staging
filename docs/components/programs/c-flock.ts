import { Dices, Server, ShieldCheck } from "lucide-react"

import type {
  Actor,
  FunctionEntry,
  Leaf,
  Param,
  Protocol,
} from "@/components/programs/types"

const C_FLOCK = "/proof-systems/c-flock"

const ACTORS: Actor[] = [
  {
    id: "prover",
    name: "Prover",
    side: "developer",
    icon: Server,
    shade: "#f05252",
  },
  {
    id: "challenger",
    name: "Challenger",
    side: "auditor",
    icon: Dices,
    shade: "#0b57c8",
    colorKey: "challenger",
  },
  {
    id: "verifier",
    name: "Verifier",
    side: "auditor",
    icon: ShieldCheck,
    shade: "#1e3a8a",
    colorKey: "verifier",
  },
]

const PARAMS: Param[] = [
  { code: "circuit", note: "The Boolean circuit." },
  {
    code: "com",
    note: "The commit string of each row of values, and the SHA-512 Merkle roots over the commit strings.",
  },
]

const FUNCTIONS: Record<string, FunctionEntry> = {
  statement: {
    returns: "data",
    signature: "statement(circuit, com) -> Statement",
    tex: String.raw`Az \circ Bz = z, \qquad A = I \otimes A_0,\ \ B = I \otimes B_0`,
    body: [
      `The block R1CS over $\\mathrm{GF}(2)$ satisfied by exactly the witnesses whose trace satisfies \`circuit\` and whose rows open \`com\`. It constrains the circuit's gates, the SHA-512 digest and commit string of each committed row, and the bits the verifier knows ([the relation](${C_FLOCK}#the-relation)). Each party derives it from its own copies of \`circuit\` and \`com\`.`,
    ],
  },
  witness: {
    returns: "data",
    signature: "witness(stmt, trace) -> Bits",
    body: [
      "The witness $z$: the value of every gate from `trace`, together with every intermediate bit of the SHA-512 compressions that commit the rows, laid out in the statement's blocks.",
    ],
  },
  commit: {
    returns: "commitment",
    signature: "commit(z) -> Cap",
    body: [
      "Commits to $z$ with Ligerito: a Reed–Solomon encoding of $z$, hashed into SHA-512 Merkle trees with hiding leaves. The prover sends the cap, the 128 nodes seven levels below the root.",
    ],
  },
  random: {
    returns: "seed",
    signature: "random() -> bytes",
    body: [
      "Fresh uniform bytes from the challenger's operating system. Every 16 bytes encode one element of $\\mathrm{GF}(2^{128})$.",
    ],
  },
  rounds: {
    returns: "data",
    signature: "rounds(stmt) -> int",
    body: [
      "The number of rounds in one repetition, determined by the witness size and the block size.",
    ],
  },
  prove: {
    returns: "proof",
    signature: "prove(stmt, z, coins) -> bytes",
    body: [
      `The prover's next Flock message, given the challenges so far: the rounds of the zerocheck, then of the lincheck, ring switching and the Ligerito opening ([proving phase](${C_FLOCK}#proving-phase)). The first message of each repetition names the statement by its digest and repeats the cap.`,
    ],
  },
  verify: {
    returns: "data",
    signature: "verify(stmt, record) -> accept | reject(reason)",
    body: [
      "Replays the record against its own statement. The first message must name `stmt`, both repetitions must open the same cap, each round's challenges must be recorded after the message they answer, and every check of Flock must pass. After the last round the prover also sends each repetition's proof as a file, which must contain exactly the recorded messages.",
      "A total function written in Lean, which reads no clock and no randomness. The reason for a rejection is diagnostic only.",
    ],
  },
}

/* C-Flock with zero knowledge off: Flock's block R1CS proof on the
   challenger's fresh coins, replayed offline by the verifier. */
export const C_FLOCK_PLAIN: Protocol = {
  title: "C-Flock",
  intro:
    "The prover commits to its witness, then answers the challenger's fresh challenges round by round, in two repetitions. The verifier replays the challenger's record afterwards.",
  actors: ACTORS,
  params: PARAMS,
  run: [
    {
      label: "Commit",
      steps: [
        { actor: "prover", code: "stmt = statement(circuit, com)" },
        { actor: "prover", code: "z = witness(stmt, trace)" },
        { actor: "prover", code: "cap = commit(z)" },
        { actor: "prover", to: "challenger", code: "cap" },
        { actor: "challenger", code: "coins = random()  # the link points" },
        { actor: "challenger", code: "record = [(cap, coins)]" },
        { actor: "challenger", to: "prover", code: "coins" },
      ],
    },
    {
      label: "Prove",
      steps: [
        {
          loop: "for rep in range(2)",
          steps: [
            {
              loop: "for _ in range(rounds(stmt))",
              steps: [
                { actor: "prover", code: "msg = prove(stmt, z, coins)" },
                { actor: "prover", to: "challenger", code: "msg" },
                { actor: "challenger", code: "coins = random()" },
                { actor: "challenger", code: "record.append((msg, coins))" },
                { actor: "challenger", to: "prover", code: "coins" },
              ],
            },
          ],
        },
      ],
    },
    {
      label: "Verify",
      steps: [
        { actor: "challenger", to: "verifier", code: "record" },
        { actor: "verifier", code: "stmt = statement(circuit, com)" },
        { actor: "verifier", code: "verdict = verify(stmt, record)" },
        { actor: "verifier", output: true, code: "verdict" },
      ],
    },
  ],
  functions: FUNCTIONS,
}

const kept = (leaf: Leaf): Leaf => ({ ...leaf, kept: true })

/* The zero-knowledge mode: what changes reads at full strength, what the
   plain mode shares reads faded. */
export const C_FLOCK_ZK: Protocol = {
  title: "C-Flock, zero-knowledge mode",
  intro:
    "The plain protocol, with every challenge of the session committed at its start and every algebraic message masked.",
  actors: ACTORS,
  params: PARAMS,
  run: [
    {
      label: "Commit",
      steps: [
        { actor: "prover", code: "nonce = random()" },
        { actor: "prover", to: "challenger", code: "nonce" },
        { actor: "challenger", code: "all_coins = random()  # every coin of the session" },
        { actor: "challenger", code: "coin_com = commit_coins(all_coins, nonce)" },
        { actor: "challenger", to: "prover", code: "coin_com" },
        kept({ actor: "prover", code: "stmt = statement(circuit, com)", gap: true }),
        kept({ actor: "prover", code: "z = witness(stmt, trace)" }),
        { actor: "prover", code: "pads = random()" },
        { actor: "prover", code: "cap = commit(z, pads)" },
        kept({ actor: "prover", to: "challenger", code: "cap" }),
        { actor: "challenger", code: 'coins = open(coin_com, "link")' },
        kept({ actor: "challenger", code: "record = [(cap, coins)]" }),
        kept({ actor: "challenger", to: "prover", code: "coins" }),
        { actor: "prover", code: "check_coins(coins, coin_com)" },
      ],
    },
    {
      label: "Prove",
      steps: [
        {
          loop: "for rep in range(2)",
          kept: true,
          steps: [
            {
              loop: "for _ in range(rounds(stmt))",
              kept: true,
              steps: [
                { actor: "prover", code: "msg = prove(stmt, z, pads, coins)  # masked" },
                kept({ actor: "prover", to: "challenger", code: "msg" }),
                { actor: "challenger", code: "coins = open(coin_com)  # the next round's" },
                kept({ actor: "challenger", code: "record.append((msg, coins))" }),
                kept({ actor: "challenger", to: "prover", code: "coins" }),
                { actor: "prover", code: "check_coins(coins, coin_com)" },
              ],
            },
          ],
        },
      ],
    },
    {
      label: "Verify",
      steps: [
        kept({ actor: "challenger", to: "verifier", code: "record" }),
        kept({ actor: "verifier", code: "stmt = statement(circuit, com)" }),
        { actor: "verifier", code: "verdict = verify(stmt, record)  # the masked checks" },
        kept({ actor: "verifier", output: true, code: "verdict" }),
      ],
    },
  ],
  functions: {
    ...FUNCTIONS,
    random: {
      returns: "seed",
      signature: "random() -> bytes",
      body: [
        "Fresh uniform bytes: from the operating system for the challenger, and from ChaCha20 under a fresh operating-system seed for the prover.",
      ],
    },
    commit_coins: {
      returns: "commitment",
      signature: "commit_coins(all_coins, nonce) -> Root",
      body: [
        "Commits to every challenge of the session in a coin tree: one hiding leaf per round of each repetition, under a fresh key, with every hash prefixed by the prover's nonce.",
      ],
    },
    open: {
      returns: "coin",
      signature: "open(coin_com, round) -> Coins",
      body: [
        "Opens the challenges of one round, with their Merkle path. The challenges of later rounds remain hidden.",
      ],
    },
    check_coins: {
      signature: "check_coins(coins, coin_com) -> None",
      body: [
        "Checks the opening against the root before the prover uses a challenge, so that the challenger cannot choose a challenge after seeing a message. Also aborts at a degenerate challenge, such as a zero batching coefficient or a zerocheck challenge equal to 1, before the prover sends anything that depends on it. Either failure ends the session.",
      ],
    },
    commit: {
      returns: "commitment",
      signature: "commit(z, pads) -> Cap",
      body: [
        "Commits to the witness as in the plain protocol, with Ligerito's first codeword padded by random coefficients and a pair of extra lanes for each repetition. The pads are committed at the same time, before any value that depends on the witness is sent.",
      ],
    },
    prove: {
      returns: "proof",
      signature: "prove(stmt, z, pads, coins) -> bytes",
      body: [
        `The next Flock message, with each algebraic value $v$ sent as $v + h$ for a pad $h$. The final rounds of each repetition prove that the masked values pass Flock's checks, so the verifier can check them without seeing the values ([zero-knowledge mode](${C_FLOCK}#zero-knowledge-mode)).`,
      ],
    },
    verify: {
      returns: "data",
      signature: "verify(stmt, record) -> accept | reject(reason)",
      body: [
        "The replay of the plain protocol, with Flock's checks run on the masked values and the proof of the masked checks verified. It also rejects a coin-tree key used by an earlier session of the same run.",
      ],
    },
  },
}
