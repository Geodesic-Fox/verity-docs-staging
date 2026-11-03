import { Cpu, Dices, MemoryStick, Network, Server, ShieldCheck } from "lucide-react"

import type { Actor, FunctionEntry, Protocol } from "@/components/programs/types"

const CERTIFIER = "/accounting/network/certifier"

const ACTOR = {
  node: { id: "node", name: "Node", side: "developer", icon: Server, shade: "#f05252", colorKey: "workers" },
  prover: { id: "prover", name: "Prover", side: "developer", icon: Server, shade: "#f05252", colorKey: "workers" },
  server: { id: "server", name: "Server", side: "developer", icon: Server, shade: "#f05252", colorKey: "workers" },
  device: { id: "device", name: "Device", side: "developer", icon: Cpu, shade: "#f05252", colorKey: "workers" },
  memory: { id: "memory", name: "Memory challenger", side: "auditor", icon: MemoryStick, shade: "#3f83f8", colorKey: "challenger" },
  certifier: { id: "certifier", name: "Certifier", side: "auditor", icon: Network, shade: "#76a9fa", colorKey: "certifiers" },
  challenger: { id: "challenger", name: "Challenger", side: "auditor", icon: Dices, shade: "#0b57c8", colorKey: "challenger" },
  verifier: { id: "verifier", name: "Verifier", side: "auditor", icon: ShieldCheck, shade: "#1e3a8a", colorKey: "verifier" },
} satisfies Record<string, Actor>

const CERTIFIER_FUNCTIONS: Record<string, FunctionEntry> = {
  keygen: {
    returns: "data",
    signature: "keygen() -> (SecretKey, PublicKey)",
    body: ["An LMS key pair over SHA-512 ($n = 64$, $w = 1$, $h = 20$): $2^{20}$ one-time leaves. The auditor registers the public key."],
  },
  choose_sync: {
    returns: "data",
    signature: "choose_sync(window) -> (δ, ρ)",
    body: [
      "The window's clock sync: an offset $\\delta$ in buckets and a rate $\\rho$ in frames per bucket, one value of $\\Sigma_{\\mathrm{sync}}$ for every egress link of the spatial unit. Without a choice by the window's first tick, the node takes the envelope, the largest $\\delta$ and the smallest $\\rho$.",
    ],
  },
  due: {
    returns: "data",
    signature: "due(program, syncs, t) -> list[Frame]",
    tex: String.raw`h(k) = \max\big(\mathit{anchor}_k + \delta + \lfloor \lambda_k/\rho \rfloor,\ h(k-1)\big)`,
    body: [
      `The frames the Program hands over at bucket $t$: frame $k$, with its anchor (the bucket of the request it answers) and its logical index $\\lambda_k$ in its session, is handed over at $h(k)$ under the sync of its anchor's window, in canonical order. A window's grid reads only its own and earlier syncs ([the schedule](${CERTIFIER}#the-schedule)).`,
    ],
  },
  admit: {
    returns: "data",
    signature: "admit(queue, frames) -> Status",
    body: [
      "Appends the frames to the link's FIFO queue, which carries across windows. A frame of the wrong size, a queue past its capacity $Q$, a drop, a sync outside $\\Sigma_{\\mathrm{sync}}$ or a monitor that misses its tick by more than 25 ms is a fault: the rest of the window is padding, the queue is dropped, and the first fault's reason becomes the window's status.",
    ],
  },
  release: {
    returns: "data",
    signature: "release(queue, r) -> Row",
    tex: String.raw`n_t = \min(\lvert\mathit{queue}\rvert,\ r)`,
    body: [
      "One bucket on the wire: the first $n_t$ queued frames, then $r - n_t$ frames of padding, $r$ frames of $B$ bytes in all. The occupancy $n_t$ is all the bucket's timing can say.",
    ],
  },
  record: {
    returns: "data",
    signature: "record(link, window, rows, status) -> bytes",
    body: [
      `The link-window's record $R$: a fixed binary head (the link, its direction, the window, $T$, $r$, $B$, $\\tau_b$, the status and the parameters' digest), the occupancies $n_0, \\dots, n_{T-1}$, and the root of the tree of its real frames ([the record](${CERTIFIER}#the-record-and-the-certificate)).`,
    ],
  },
  digest: {
    returns: "root",
    signature: "digest(R) -> bytes",
    body: ['SHA-512 of the record under the tag `verity-network-certifier/record/v2`.'],
  },
  message: {
    returns: "data",
    signature: "message(I, session, link, direction, window, dg) -> bytes",
    body: [
      "What the certificate signs: SHA-512 over the tag `verity/network-certificate-message/v2`, the key's identifier $I$, the challenger-drawn session, the link, its direction, the window and the record's digest, each variable-width field length-prefixed. It ties the digest to one session and link-window under one key.",
    ],
  },
  sign: {
    returns: "signature",
    signature: "sign(sk, m) -> Signature",
    body: [
      "LMS-signs `m` with the next unused leaf. A certifier without its leaf state signs nothing, and the link-window has no record: it fails closed.",
    ],
  },
  check: {
    returns: "data",
    signature: "check(cert, frames, syncs) -> bool",
    body: [
      `One link-window's [check](${CERTIFIER}#the-check): exactly one record, settled by the deadline; its certificate verifies under the certifier's key and names its session, link, direction and window; its status is complete; its sync is in $\\Sigma_{\\mathrm{sync}}$ and is the spatial unit's for the window; and its record is the Program's grid, slot for slot. An ingress link-window needs only its record, signature, status and registered parameters.`,
    ],
  },
}

const POUW = "/accounting/compute/pouw"

const POUW_FUNCTIONS: Record<string, FunctionEntry> = {
  random: {
    returns: "seed",
    signature: "random() -> bytes",
    body: ["Fresh uniform bytes from the challenger, one 32-byte coin per label."],
  },
  commit_coins: {
    returns: "commitment",
    signature: "commit_coins(epoch, coins) -> Root",
    body: [
      `A frame-v3-sha512 tree over hm96-sha512 leaves of each coin's SHA-512 under 192 fresh salt bytes, bound to the epoch ([the coins](${POUW}#the-coins)). An unopened coin is statistically hidden.`,
    ],
  },
  open: {
    returns: "coin",
    signature: "open(coins, label, after) -> bytes",
    body: [
      "Opens one coin, live and once, after the verifier has recorded `after`, the root it keys. A second request for an opened coin is refused, so a retry never redraws.",
    ],
  },
  commit: {
    returns: "commitment",
    signature: "commit(rows, bound_to) -> Root",
    body: [
      "A hiding commitment to a matrix's rows along $k$: `sha512/row-seg/v1` row digests in hm96-sha512 leaves of a frame-v3-sha512 tree. Weight rows are bound to their weight, activation rows to the salt and the matmul's index, tile leaves to the salt and the weights' root.",
    ],
  },
  salt: {
    returns: "seed",
    signature: "salt(coin, epoch, coins_root, wroot) -> bytes",
    body: [
      "32 bytes [derived](/proof-systems/randomness) from the salt coin in the domain `verity/pouw/epoch-salt/v1`, bound to the epoch, the coin commitment and the weights' root.",
    ],
  },
  noise: {
    returns: "data",
    signature: "noise(salt, u, aroot, wroot) -> Noise",
    body: [
      "The scheme's noise for matmul `u`: per-row seeds from the salt, each row's own digest, the weights' root and the row's index, expanded into Pearl's low-rank noise lines. Each row is keyed by its own digest, so rows can't be folded onto shared noised rows.",
    ],
  },
  tile: {
    returns: "data",
    signature: "tile(noise, a_rows, b_rows) -> (Leaf, Matrix)",
    tex: String.raw`\tilde C = \mathrm{chain}(A', \tilde B), \qquad U = \tilde C + P_A P_B^\top`,
    body: [
      "One 64 × 64 tile at full $k$: the rows formed into E4M3 under the noise, multiplied through the device's FP8 atom chain, and cleaned up by the BF16 peel into the useful output $U$. The leaf is the digest of the checked values $\\tilde C$ and $U$; the product the workload uses is $U$ rescaled.",
    ],
  },
  draw: {
    returns: "coin",
    signature: "draw(coin, troot, salt, K) -> list[Tile]",
    tex: String.raw`\Pr[\text{tile } t] = W_{\mathrm{ref}}(t) / W`,
    body: [
      `$K$ independent draws, each a tile with probability its share of the credited work, keyed by the draw coin, the transcript's root and the salt in the domain \`verity/pouw/pearl-c-draw/v1\` ([the draw](${POUW}#the-draw)).`,
    ],
  },
  prove: {
    returns: "proof",
    signature: "prove(t) -> Proof",
    body: [
      "Shows that tile `t` passes `check`: its rows open the committed roots, and recomputing it through the scheme gives its leaf. In the target protocol it is a C-Flock proof, in zero knowledge, whose header carries the identifier; served windows prove drawn tiles this way today, on a stand-in unit that doesn't yet read the tile's committed leaf (TileRead), and until it does, a replay that opens the rows checks acceptance, a development shortcut.",
    ],
  },
  check: {
    returns: "data",
    signature: "check(t, proof) -> bool",
    body: [
      "The rows open their roots, the recomputed checked values hash to the tile's leaf, filler is zero, and the tile's replayed debit is at most the cap times its credited cells' credit.",
    ],
  },
  credited: {
    returns: "data",
    signature: "credited(records) -> int",
    body: ["$W$: the reference cost of the credited cells, from the shapes alone, rounded down to a grid level."],
  },
}

/* Proof of useful work with a scheme of Pearl-C's form, as the reference audit runs it. */
export const POUW_PROTOCOL: Protocol = {
  title: "Proof of useful work",
  intro:
    "The prover commits the weights, gets a salt it couldn't predict, computes every tile of the declared products under noise from the salt, and commits the tiles; the verifier draws tiles by their work and checks them.",
  actors: [ACTOR.prover, ACTOR.challenger, ACTOR.verifier],
  params: [
    { code: "scheme", note: "How a tile is noised, computed and checked, with its cap and its γ." },
    { code: "workload", note: "The declared matrix multiplications: index, shape (m, k, n) and the weight each reads." },
    { code: "eps_s, delta", note: "The share of the work the audit may leave unchecked, and the chance it leaves more. They fix K." },
  ],
  run: [
    {
      label: "Commit",
      steps: [
        { actor: "challenger", code: "coins = random()  # one per label: salt, draw" },
        { actor: "challenger", code: "coins_root = commit_coins(epoch, coins)" },
        { actor: "challenger", to: "verifier", code: "coins_root" },
        { actor: "prover", code: "wroot = commit(weights, bound_to=weight_ids)", gap: true },
        { actor: "prover", to: "verifier", code: "wroot" },
      ],
    },
    {
      label: "Salt",
      steps: [
        { actor: "challenger", code: "coin = open(coins, 'salt', after=wroot)" },
        { actor: "challenger", to: "verifier", code: "coin" },
        { actor: "verifier", code: "s = salt(coin, epoch, coins_root, wroot)" },
        { actor: "verifier", to: "prover", code: "s" },
      ],
    },
    {
      label: "Compute",
      steps: [
        {
          loop: "for u in workload",
          steps: [
            { actor: "prover", code: "aroot[u] = commit(activations[u], bound_to=(s, u))" },
            { actor: "prover", code: "n = noise(s, u, aroot[u], wroot)" },
            {
              loop: "for t in tiles(u)",
              steps: [{ actor: "prover", code: "leaf[t], useful[t] = tile(n, a_rows(t), b_rows(t))" }],
            },
          ],
        },
        { actor: "prover", code: "troot = commit(leaf, bound_to=(s, wroot))", gap: true },
        { actor: "prover", to: "verifier", code: "aroot, troot" },
      ],
    },
    {
      label: "Draw",
      steps: [
        { actor: "challenger", code: "coin = open(coins, 'draw', after=troot)" },
        { actor: "challenger", to: "verifier", code: "coin" },
        { actor: "verifier", code: "drawn = draw(coin, troot, s, K)" },
        { actor: "verifier", to: "prover", code: "drawn" },
      ],
    },
    {
      label: "Prove",
      steps: [
        {
          loop: "for t in drawn",
          steps: [
            { actor: "prover", code: "proof[t] = prove(t)" },
            { actor: "prover", to: "verifier", code: "proof[t]" },
          ],
        },
      ],
    },
    {
      label: "Verify",
      steps: [
        {
          loop: "if all(check(t, proof[t]) for t in drawn)",
          steps: [
            { actor: "verifier", code: "W = credited(records)" },
            { actor: "verifier", output: true, code: "accept, (1 - gamma) * (1 - eps_s) * W" },
          ],
        },
        { loop: "else", steps: [{ actor: "verifier", output: true, code: "reject" }] },
      ],
    },
  ],
  functions: POUW_FUNCTIONS,
}

/* One link of the network certifier, egress, over a run of windows. */
export const NETWORK_CERTIFIER: Protocol = {
  title: "Network certifier",
  intro:
    "The node hands each egress frame to the certifier at the bucket the Program schedules; the certifier releases a constant number of frames per bucket, records the window and signs the record; the verifier checks each record against the Program's grid.",
  actors: [ACTOR.node, ACTOR.certifier, ACTOR.verifier],
  params: [
    { code: "grid", note: "T buckets of τ_b per window, r frames of B bytes per bucket, the queue capacity Q." },
    { code: "sigma", note: "Σ_sync, the clock-sync values a window may declare." },
    { code: "program", note: "Each egress frame's content, anchor and logical index, from the ingress and the content advice." },
    { code: "session", note: "The 32-byte identifier the challenger draws for this certifier session." },
  ],
  run: [
    {
      label: "Register",
      steps: [
        { actor: "certifier", code: "sk, pk = keygen()" },
        { actor: "certifier", to: "verifier", code: "pk" },
      ],
    },
    {
      label: "Release",
      steps: [
        {
          loop: "for w in windows",
          steps: [
            { actor: "node", code: "syncs[w] = choose_sync(w)" },
            { actor: "node", to: "certifier", code: "syncs[w]" },
            {
              gap: true,
              loop: "for t in buckets(w)",
              steps: [
                { actor: "node", code: "frames = due(program, syncs, t)" },
                { actor: "node", to: "certifier", code: "frames" },
                { actor: "certifier", code: "status = admit(queue, frames)" },
                { actor: "certifier", code: "rows[t] = release(queue, r)  # r frames of B bytes" },
              ],
            },
          ],
        },
      ],
    },
    {
      label: "Certify",
      steps: [
        {
          loop: "for w in windows",
          steps: [
            { actor: "certifier", code: "R = record(link, w, rows, status)" },
            { actor: "certifier", code: "cert = sign(sk, message(I, session, link, 'egress', w, digest(R)))" },
            { actor: "certifier", to: "node", code: "cert" },
          ],
        },
      ],
    },
    {
      label: "Check",
      steps: [
        { actor: "node", to: "verifier", code: "certs, frames, syncs" },
        {
          gap: true,
          loop: "if all(check(c, frames, syncs) for c in certs)",
          steps: [{ actor: "verifier", output: true, code: "accept" }],
        },
        { loop: "else", steps: [{ actor: "verifier", output: true, code: "reject" }] },
      ],
    },
  ],
  functions: CERTIFIER_FUNCTIONS,
}

const POUS = "/accounting/memory/pous"

const POUS_FUNCTIONS: Record<string, FunctionEntry> = {
  commit: {
    returns: "commitment",
    signature: "commit(manifest, W) -> bytes",
    body: [
      "Tagged SHA-512 over the manifest (scheme, width, profile, geometry) and the weights, under `verity-pous/w-commitment/v2`. It is fixed before any salt exists.",
    ],
  },
  random: {
    returns: "seed",
    signature: "random() -> bytes",
    body: ["A fresh verifier secret, or the first beacon round after the commitment; never the server's choice."],
  },
  derive_salt: {
    returns: "seed",
    signature: "derive_salt(source, w_commitment) -> bytes",
    body: [
      "32 bytes [derived](/proof-systems/randomness) in the domain `verity/pous/p2-setup/v4`, bound to the commitment, the prime and the protocol.",
    ],
  },
  encode: {
    returns: "data",
    signature: "encode(W, salt) -> list[Block]",
    tex: String.raw`E_j(m) = \rho\big(\sigma_{K_j}(\rho(m + t_j))\big), \qquad D_j(c) = d\big(\sigma_{K_j}(d(c))\big) - t_j`,
    body: [
      `Each block of $W$, 2,054 bytes, becomes a 2,056-byte codeword modulo $p = 2^{16448} - 21065$ ([the encoding](${POUS}#the-encoding)). $\\rho$ is a modular square root, about 16,447 sequential squarings; $d$ is one signed squaring; $\\sigma_K$ XORs a full-width mask from SHA-512 counter mode, rejected when it leaves $[0, p)$. Encoding takes two roots, decoding two squarings.`,
    ],
  },
  decode: {
    returns: "data",
    signature: "decode(C, salt) -> W'",
    body: ["Two signed squarings a block: the public check that $C^*$ encodes the committed weights."],
  },
  root: {
    returns: "root",
    signature: "root(C, salt) -> bytes",
    body: ["An RFC 6962 SHA-512 tree over the blocks' row digests, each leaf bound to the salt and the block's position."],
  },
  session: {
    returns: "seed",
    signature: "session() -> bytes",
    body: ["A 32-byte session id the auditor designates, one per audit. The session is bound to the setup's root; refusing a reused id is in progress."],
  },
  draw: {
    returns: "commitment",
    signature: "draw(secret, session, B, k) -> (list[int], Root)",
    body: [
      "$k$ indices uniform over the $B$ blocks, with replacement, from the challenger's own secret, and a hiding coin tree over them. The tree is published; the indices stay hidden until each is asked.",
    ],
  },
  clock: {
    returns: "data",
    signature: "clock() -> int",
    body: ["The memory challenger's own clock, in nanoseconds, read before any hashing."],
  },
  record: {
    returns: "data",
    signature: "record(j, i, sent, received, block) -> Record",
    body: ["The round's index, its send and receipt times, and the answer's SHA-512 row digest."],
  },
  sign: {
    returns: "signature",
    signature: "sign(session, ended, records) -> Signature",
    body: [
      "One LMS-SHA512 signature over the session's header (the commitment, how it ended, the number of rounds) and the root of its records. The signed session is witness.",
    ],
  },
  openings: {
    returns: "coin",
    signature: "openings(coins) -> list[Opening]",
    body: ["After the session closes, each revealed index with its coin-tree path."],
  },
  check: {
    returns: "data",
    signature: "check(root, signed, openings) -> bool",
    body: [
      `The [check](${POUS}#the-check): the signature verifies under a trusted key over this setup's root, the session ended complete after $k$ rounds, every opening matches its round's index, every answer's digest is the committed block's, and every round arrived within $\\Delta + \\mathrm{RTT}$.`,
    ],
  },
}

/* Proof of useful space with P2, setup then one audit session. */
export const POUS_PROTOCOL: Protocol = {
  title: "Proof of useful space",
  intro:
    "The server commits the weights, encodes them under a salt it couldn't choose into a store that is slow to build and fast to read, and answers a memory challenger's timed requests for random blocks of it.",
  actors: [ACTOR.server, ACTOR.memory, ACTOR.verifier],
  params: [
    { code: "scheme", note: "P2: width w = 16,448 bits, prime p = 2^16448 − 21065, B = 2^19 blocks." },
    { code: "k, limit", note: "105 sequential challenges, each due within Δ + RTT ≤ 854 µs." },
    { code: "S", note: "The state bound: 18/19 of the store's bits." },
  ],
  run: [
    {
      label: "Commit",
      steps: [
        { actor: "server", code: "w_commitment = commit(manifest, W)" },
        { actor: "server", to: "verifier", code: "manifest, w_commitment" },
      ],
    },
    {
      label: "Setup",
      steps: [
        { actor: "verifier", code: "salt = derive_salt(random(), w_commitment)" },
        { actor: "verifier", to: "server", code: "salt" },
        { actor: "server", code: "C = encode(W, salt)  # two roots a block", gap: true },
        { actor: "server", to: "verifier", code: "C" },
        { actor: "verifier", code: "assert commit(manifest, decode(C, salt)) == w_commitment" },
        { actor: "verifier", code: "vk = root(C, salt)" },
      ],
    },
    {
      label: "Challenge",
      steps: [
        { actor: "verifier", to: "memory", code: "vk, session()" },
        { actor: "memory", code: "I, coin_root = draw(secret, session, B, k)" },
        { actor: "memory", to: "verifier", code: "coin_root" },
        {
          gap: true,
          loop: "for j in range(k)",
          steps: [
            { actor: "memory", code: "sent = clock()" },
            { actor: "memory", to: "server", code: "I[j]" },
            { actor: "server", to: "memory", code: "C[I[j]]" },
            { actor: "memory", code: "rec[j] = record(j, I[j], sent, clock(), C[I[j]])" },
          ],
        },
        { actor: "memory", code: "sig = sign(session, ended, rec)", gap: true },
        { actor: "memory", to: "server", code: "sig, rec" },
        { actor: "memory", to: "verifier", code: "openings(coins)" },
      ],
    },
    {
      label: "Verify",
      steps: [
        { actor: "server", to: "verifier", code: "sig, rec" },
        {
          gap: true,
          loop: "if check(vk, (sig, rec), openings)",
          steps: [{ actor: "verifier", output: true, code: "accept" }],
        },
        { loop: "else", steps: [{ actor: "verifier", output: true, code: "reject" }] },
      ],
    },
  ],
  functions: POUS_FUNCTIONS,
}

const BANDWIDTH = "/accounting/bandwidth/audit"

const BANDWIDTH_FUNCTIONS: Record<string, FunctionEntry> = {
  window_key: {
    returns: "seed",
    signature: "window_key(source, vk, n) -> Key",
    body: [
      "The window's key, [derived](/proof-systems/randomness) from the challenger's secret in the domain `verity/bandwidth/window/v1`, bound to PoUS's root and salt and the window's number. A window is never reopened.",
    ],
  },
  seed: {
    returns: "seed",
    signature: "seed(key) -> bytes",
    body: ["32 bytes of the window's key stream."],
  },
  clock: {
    returns: "data",
    signature: "clock() -> int",
    body: ["The challenger's own clock, in nanoseconds."],
  },
  tag: {
    returns: "data",
    signature: "tag(σ, j, E_j) -> bytes",
    tex: String.raw`y_j = \mathrm{BLAKE3}_{K}(j \,\Vert\, E_j), \qquad K = \mathrm{SHA512}(\mathit{prefix}(\sigma))[0{:}32]`,
    body: [
      `\`ro-blake3/v1\`: keyed BLAKE3 over the block's index and the whole block, under a key from the seed ([the tag](${BANDWIDTH}#the-tag)). The seed comes first, so no midstate can be computed ahead of it.`,
    ],
  },
  commit: {
    returns: "root",
    signature: "commit(σ, tags) -> Root",
    body: [
      "An RFC 6962 SHA-512 tree over leaves of 16 tags each, every leaf prefixed by the seed. The root binds every tag before any sample is drawn.",
    ],
  },
  samples: {
    returns: "coin",
    signature: "samples(key, N, s) -> list[int]",
    body: ["$s$ indices uniform over the $N$ blocks, with replacement, from the window's key: drawn only for a root that arrived on time."],
  },
  open: {
    returns: "data",
    signature: "open(i) -> Opening",
    body: ["Block $E_i$ with its path to PoUS's root, and its leaf's 16 tags with their path to $R$."],
  },
  check: {
    returns: "data",
    signature: "check(vk, R, σ, I, openings) -> bool",
    body: [
      "Every opening is the sampled index, its block opens PoUS's root, its leaf opens $R$, and its tag is the block's tag under the seed.",
    ],
  },
}

/* One window of the bandwidth audit, over a store PoUS has set up. */
export const BANDWIDTH_AUDIT: Protocol = {
  title: "Bandwidth audit",
  intro:
    "The memory challenger sends a fresh seed; the device tags every block of its store under it and commits the tags before a deadline; the challenger samples blocks and checks their tags.",
  actors: [ACTOR.device, ACTOR.memory],
  params: [
    { code: "vk", note: "PoUS's store: N = 2^19 blocks of 2,056 bytes, its root and salt." },
    { code: "T, RTT", note: "The deadline for the root, proposed at 1.2 ms." },
    { code: "s", note: "1,849 uniform samples." },
  ],
  run: [
    {
      label: "Seed",
      steps: [
        { actor: "memory", code: "key = window_key(source, vk, n)" },
        { actor: "memory", code: "σ = seed(key)" },
        { actor: "memory", code: "t0 = clock()" },
        { actor: "memory", to: "device", code: "σ" },
      ],
    },
    {
      label: "Tag",
      steps: [
        { loop: "for j in range(N)", steps: [{ actor: "device", code: "y[j] = tag(σ, j, E[j])" }] },
        { actor: "device", code: "R = commit(σ, y)" },
        { actor: "device", to: "memory", code: "R" },
        {
          gap: true,
          loop: "if clock() - t0 > T + RTT",
          steps: [{ actor: "memory", output: true, code: "reject  # late" }],
        },
      ],
    },
    {
      label: "Sample",
      steps: [
        { actor: "memory", code: "I = samples(key, N, s)" },
        { actor: "memory", to: "device", code: "I" },
        { actor: "device", to: "memory", code: "[open(i) for i in I]" },
        {
          gap: true,
          loop: "if check(vk, R, σ, I, openings)",
          steps: [{ actor: "memory", output: true, code: "accept" }],
        },
        { loop: "else", steps: [{ actor: "memory", output: true, code: "reject" }] },
      ],
    },
  ],
  functions: BANDWIDTH_FUNCTIONS,
}
