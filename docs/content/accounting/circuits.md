The developer declares the circuits it runs. A circuit is the exact computation a proof claims something about, and every other page takes its terms from this one: gates and their widths, traces, partitions into proof units, boundary gates and faulty units. A circuit describes logical computation, not a GPU schedule, a proof system, a commitment layout or a sampling design. Which parts are checked, how they are sampled and what is committed before a challenge are protocol questions, and none of them changes the circuit. Circuits are total: they match the hardware on every input bit pattern, NaN and infinity included, with the hardware's arithmetic fixed in [Silicon](/hardware/accelerators#silicon). A *program* is one circuit written compactly, in [the program format](#the-program-format).

## The circuit model

A circuit $C$ has gates $0, \dots, N-1$ in topological order. Gate $g$ has a fixed width $w_g$ and reads a set of earlier gates, the wires into it. An *input gate* reads nothing, and its value comes from the inputs. Every other gate is *computed*: its operation maps the values of the gates it reads to a value of $w_g$ bits. A constant is a computed gate that reads nothing. Some gates are designated outputs, and the size of a circuit is its number of computed gates. A program's [canonical layout](#canonical-layout) is such a circuit: gate $g$ of the layout is gate $g$, its width is its primitive's result width, its input gates are the input nodes' gates, and it reads the gates its operands name.

For a set $A$ of gates:

$$
\begin{aligned}
\lvert A\rvert &= \text{the number of gates in } A \\
\mathrm{width}(A) &= \textstyle\sum_{g \in A} w_g \\
\mathrm{in}(A) &= \{\, a \notin A : a \text{ is read by some } g \in A \,\} \\
\mathrm{out}(A) &= \{\, g \in A : g \text{ is an output, or is read by some } h \notin A \,\} \\
w_{\mathrm{out}}(A) &= \mathrm{width}\big(\mathrm{out}(A)\big)
\end{aligned}
$$

A gate counts once in $\mathrm{in}(A)$ however many wires leave it for $A$.

A circuit $D$ *implements* a circuit $C$ when every input gate of $C$ is an input gate of $D$ of the same width, distinct gates going to distinct gates, and on every assignment to its inputs $D$ produces $C$'s outputs among its own outputs, computed however it likes. $D$ *contains* $C$ when, besides, it computes each computed gate of $C$ with the same operation from the same wires. [NCI](/policies/nci) reads both.

## Traces

A *trace* $\tau$ gives each gate $g$ a value $\tau_g$ of $w_g$ bits, and $\tau_A$ is its values at a set of gates $A$, in gate order. The *honest trace* on inputs $x$ is the evaluation, `evaluate(C, x)`: each input gate takes its value from $x$, and each computed gate, in order, its operation applied to the values of the gates it reads. [Evaluation](#evaluation) is exact, so the honest trace is a function of $x$ alone.

## Partitions

A *partition* $U$ of $C$ divides its computed gates, constants included, into *proof units*, each gate in exactly one. Input gates are in no unit. A unit $u \in U$ computes a function $f_u$ from its inputs to its outputs: from values at $\mathrm{in}(u)$, it applies each gate of $u$ in order to the values of the gates it reads, and returns the values at $\mathrm{out}(u)$. The verifier derives the partition itself, by evaluating a [named query](#the-partition-object) on its own copy of the program, so the prover can't choose the units.

The *boundary gates* are every input gate of $C$, read or not, and the inputs and outputs of every unit:

$$
\partial U \;=\; \mathrm{inputs}(C) \;\cup\; \bigcup_{u \in U} \big(\mathrm{in}(u) \cup \mathrm{out}(u)\big)
$$

A unit's check reads only boundary gates; its interior is recomputed, never compared. Because $\partial U$ holds every input gate, read or not, a claim about the inputs is a claim about the boundary.

A unit $u$ is *faulty* in a trace $\tau$ when its outputs aren't its function of its inputs:

$$
\tau_{\mathrm{out}(u)} \;\neq\; f_u\big(\tau_{\mathrm{in}(u)}\big)
$$

A unit fed wrong inputs that computes faithfully from them isn't faulty, so checking it won't reveal the fault upstream. No unit is faulty in the honest trace.

### Proof units

Each proof unit outputs at most 16 bits, $w_{\mathrm{out}}(u) \le 16$, and its inputs are unbounded. A unit's inputs and outputs are ordered bit strings, counted in bits at any gate width, and a partition doesn't read elements, so a unit may hold some of an element's bits and not others. Under `Q_call` v1 with $X = 16$ every unit meets the limit by construction. The template queries have no width rule of their own: an instance's unit outputs what the template returns, such as the one BF16 word of a GEMM coordinate.

[Sampling](/proof-systems/sampling#integrity) bounds how many units are faulty from a sample of them, so it needs no unit's inputs to be small. The input gates form the *input unit*, which is never drawn: the verifier checks each input commitment against its external anchor, such as the declared model's weights or the client's request commitment.

Each proof unit cut out on its own is a standalone circuit: the computed gates the partition assigns it, a copy of every constant and structure gate they read, its inputs in first-read order, and its outputs. Units whose standalone circuits are equal share a *shape*, so one lowering and one statement serve them all.

Proof units, replay units and isolation units are partitions in three roles. A finer partition *refines* a coarser one when each fine unit lies inside one coarse unit, as the proof units of [two-stage sampling](/proof-systems/sampling#two-stage-sampling) lie inside its replay units. [NCI](/policies/nci)'s isolation units divide a declared circuit by what each part reads.

## The program format

A program is one circuit, stored compressed as *Definitions* called from a root body, with a canonical layout that locates any gate without expanding the circuit and a SHA-512 digest that names it. A partition names its program by that digest.

~~~mermaid
flowchart LR
  defs["Definitions"]
  prog["Program"]
  desc["Descriptor"]
  dig["SHA-512 digest"]
  part["Partition object"]
  units["Proof units"]
  defs -->|"called from a root"| prog
  prog -->|"encoded as"| desc
  desc -->|"canonical bytes hashed"| dig
  dig -->|"names the program of"| part
  part -->|"query evaluated"| units
~~~

### Terms

| Term | Meaning |
| --- | --- |
| Program | One circuit, stored compressed as Definitions called from a root body, with the same interface at every level. |
| Definition | An exact function with an id `Name_vN`: a primitive, which is one gate, or a composite, a body of calls to other Definitions. |
| Circuit | Gates and the wires between them. A program is a compressed circuit; an *expanded* circuit is written out gate by gate. |
| Gate | A node of a circuit: an input gate, the constant 0 or 1 as one of an operation's own bits, the AND or XOR of two or more bits, or NOT. Each outputs one bit. |
| Wire | An edge from a gate to a gate that reads it. It carries its source gate's value and has none of its own. |
| Port | A named array of fixed-width elements on a Definition's boundary, one of its parameters or results. Each call binds it to gates of the caller. |
| Element | One fixed-width member of a port, such as 16 bits. |
| Format | A label on a port's elements, such as BF16, E4M3 or token id, saying how their bits encode a number or symbol. |
| Value | What a gate takes in one run: data, always hidden. A trace is all of them. |
| Registered input, run input | The two binding times of a program's input gates: when the program is registered, or per request. |
| Operation | A Definition whose own definition is gates, its constants and the hardware's measured tables included. |

These gates are the [Boolean profile](#the-boolean-profile)'s. The program format itself is word-level: a primitive is one gate that outputs one `Value<w>` of $w$ bits, and the Boolean profile is $w = 1$.

### Evaluation

Evaluation is exact. A primitive's meaning is a total function from the bit patterns of its operands to the bit pattern of its result: defined on every input, NaN and infinity encodings included, with no tolerance and no undefined case. A composite's meaning is its body. So a program's transcript is a function of its inputs alone, and two evaluators either agree bit for bit or one of them is wrong. A fast evaluator adds speed only: it must agree with the Definitions on every input it accepts, and nothing it does is recorded, so it can't change a digest or a gate index.

Input gates are never evaluated: their values are prescribed, asserted equal to the claimed inputs.

One id denotes one function. Two Definitions that differ on any input, even only on NaN encodings, have different ids, and a changed function takes a new version: `AmpereBF16TcDot16_v1` and `AmpereBF16TcDot16_v2` agree on every finite input and differ on NaN and infinity encodings. A registry refuses a second, different Definition under an id it already holds.

### Types and Definitions

Every value is built from one leaf type, `Value<w>`:

~~~text
["Value", w]                  w ≥ 1: one leaf of w bits
["Array", n, T]               n ≥ 0: n elements of type T
["Tuple", [T0, T1, ...]]      fields in order
["Record", [[k0, T0], ...]]   named fields in declared order, names distinct
~~~

Leaves are numbered row-major: element $i$ of an `Array<n, T>` occupies leaves $[\,i \cdot \mathrm{leaves}(T),\ (i+1) \cdot \mathrm{leaves}(T)\,)$, and the fields of a tuple or record follow one another in order. A type is *homogeneous of width $w$* when all its leaves are $w$ bits wide.

A Definition is either:

- **Primitive:** one gate returning one `Value<w>`, whose meaning is the total function its id names.
- **Composite:** a body of explicit dataflow over other Definitions. The composite's definition is its decomposition.

A body's nodes call other Definitions in four forms:

| Form | What it adds | Output |
| --- | --- | --- |
| `primitive` | One gate of a primitive callee | The callee's return value |
| `call` | One call of a composite callee | The callee's return value |
| `batch` | $n$ independent calls of one callee. Each argument is mapped over one of its array axes, or shared by every member | `Array<n, ret>` |
| `scan` | $n$ sequential calls of a step `Step(carry, x1..xk, s1..sm) -> Tuple(carry, Y)`, from an initial carry | `Tuple(carry, Array<n, Y>)` |

A node's arguments are reference sequences naming leaves of the body's parameters or of earlier nodes' outputs, and a body's result names leaves of any node. Writers name only nodes before the reading node.

A primitive, or a composite without static parameters, has the id `Name_vN`, with N in decimal without leading zeros. A composite with static parameters is keyed by its id followed by every static in its declared order, each written as canonical JSON: an integer, string, boolean or null as itself, a list as an array, a function as `{"fn": <id>}`, a float as `{"f64": <hex float>}`, and a dictionary as `{"dict": {...}}`. For example:

~~~text
TRow_v1{N=4,OP={"fn":"TAdd32_v1"},C={"f64":"0x1.8000000000000p+0"},D={"dict":{"a":[1,"x"],"k":2}}}
~~~

Binding some statics and then the rest gives the same specialization as binding them all at once.

### The Boolean profile

A *Boolean Definition* has only `Value<1>` leaves in its signature, and every primitive it reaches is one of these:

| Id | Parameters | Value |
| --- | --- | --- |
| `And<n>_v1`, $n \ge 2$ | `x: Array<n, Value<1>>` | $x_0 \wedge \dots \wedge x_{n-1}$ |
| `Xor<n>_v1`, $n \ge 2$ | `x: Array<n, Value<1>>` | $x_0 \oplus \dots \oplus x_{n-1}$ |
| `Not_v1` | `a: Value<1>` | $\neg a$ |
| `Const1[0x0]_v1`, `Const1[0x1]_v1` | None | 0, 1 |
| `Input1_v1`, `RegisteredInput1_v1` | None | Prescribed by the run or the registration |

The format fixes what these mean: no other Definition may take their ids. AND and XOR are one family each, with a member per number of inputs $n$ written in decimal without leading zeros, which a reader builds from its id. A Boolean Definition's meaning is its gates. It needs no new syntax, and its digest is computed like any other's.

An *element* of a Boolean type is an innermost `Array<w, Value<1>>`, a $w$-bit word with bit $j$ at leaf $j$, least significant first, or a lone `Value<1>`. The *word view* of a Boolean Definition is its signature with each element replaced by `Value<w>`: the signature of the word Definition it computes. A *word Definition* is one whose primitives output whole words, each meaning the function its id names. Under the word view, `GemmCoordinate_v3`, a Boolean Definition, takes and returns exactly what the word Definition `GemmCoordinate_v2` does. The word view never reads a port's format. The circuits the developer declares and proves are Boolean.

### Programs

A program's root is a composite with no parameters and no statics, keyed `Root[<readable id of the program function>]_v1`. Its body starts with the input nodes, then inlines the program function's body with the input nodes' outputs standing for the function's parameters, and its result names the program's outputs. Each parameter of the program function has a binding time, and its input nodes are emitted per parameter, in parameter order:

- a parameter homogeneous of width $w$, with $L \ge 1$ leaves, is one batch of $L$ input gates of width $w$;
- a parameter without leaves emits nothing;
- any other is lowered field by field, or element by element.

A node is an input node exactly when its callee's id matches `^Input([1-9][0-9]*)_v1$`, a run input, or `^RegisteredInput([1-9][0-9]*)_v1$`, a registered input. Each input primitive takes no parameters and returns `Value<w>`: a gate whose value is prescribed, never computed and never held by the program. Input nodes appear only in the root's body. The binding times change only the input nodes' callees: the layout, the gates and the Calls are those of the same program with every parameter a run input, while the descriptor, and so the digest, binds which parameters are registered.

A program's *Calls* are the root body's nodes other than its input nodes, in body order.

A program holds no data. An operation's own definition is gates: the floating-point formats' constants, the round constants of SHA-512 and Keccak-f, and the hardware's measured special-function tables (exp2, rcp, sqrt, rsqrt and tanh) are its bits, not a program's data. A constant gate, `Const<w>[0x…]_v1`, is therefore one of an operation's own bits. The operations are one versioned list, `verity/operations` v1, and the measured tables are the library's, `verity/library` v1. A program holds data exactly when it has a constant outside every operation, or a primitive that reads a table the library doesn't list; every such constant or table belongs in a registered input.

### Values and structure

Gates, wires, ports and elements are structure, and so are shapes such as batch size and sequence length. Structure is public: the verifier holds the program. Values are data, even those that are the same in every run. The value of an element or port is the transcript read at its gates, in order.

| Binding time | Input gate | Bound | Holds, for example |
| --- | --- | --- | --- |
| Registration | `RegisteredInput<w>_v1` | When the program is registered | The weights; constants such as a norm's epsilon, the attention scale or a softcap; tables such as `gelu_tanh_bf16` |
| Run | `Input<w>_v1` | Per request | The request's data; parameters such as temperature, top-p and the Philox positions |

Values are always hidden. Each is committed under a [hiding leaf](/proof-systems/commitments) and reaches the auditor only through [zero knowledge](/proof-systems/zero-knowledge), never treated as part of the program the verifier holds. A table that tabulates a fixed function is a value too, unless it is one of the library's measured tables.

Formats are metadata. Annotations, `verity/annotations/v0`, give names, descriptions, formats and groupings to a program's parts, keyed by ids the descriptor already has (`def:`, `node:`, `wire:`, `port:`, `call:` and `group:` keys). They are checked against the descriptor's structure and never enter a digest.

### Canonical layout

The layout gives every gate one root-scoped index, computed from sizes rather than by expanding the circuit:

- **Gate counts.** A primitive is 1 gate, and a composite's gates are its body's nodes' gates in total. A primitive node is 1 gate, a call node its callee's gates, and a batch or scan node $n$ times its callee's.
- **Offsets.** In a body, $\mathrm{off}_0 = 0$ and $\mathrm{off}_{k+1} = \mathrm{off}_k + \mathrm{gates}(\text{node } k)$. Member or iteration $m$ of node $k$ occupies $[\,\mathrm{off}_k + m \cdot \mathrm{gates}(\mathrm{callee}),\ \mathrm{off}_k + (m+1) \cdot \mathrm{gates}(\mathrm{callee})\,)$, members consecutive in index order.
- **Locating gate $g$.** In an activation at offset $o$, node $k$ is the one with $\mathrm{off}_k \le g - o < \mathrm{off}_{k+1}$, and member $m = \lfloor (g - o - \mathrm{off}_k) / \mathrm{gates}(\mathrm{callee}) \rfloor$. A primitive callee is the gate; otherwise the search descends into that member's activation, at offset $o + \mathrm{off}_k + m \cdot \mathrm{gates}(\mathrm{callee})$.
- **Operands.** A gate's operands are its primitive's arguments resolved to gates, order and repeats kept. Input gates and constants have none.
- **Scope resolution.** A body-scoped reference is followed up through parameters into the caller, and down through node outputs into callees, until it reaches a primitive: the gate it denotes. A scan's carry into iteration $m > 0$ resolves into iteration $m - 1$'s result, and into the initial carry for $m = 0$.
- **Topological order.** When every node reads only its body's parameters and earlier nodes, every gate's operands come before it.

### The descriptor and its digest

A program is exchanged as a JSON descriptor of schema `verity-ir/descriptor/v1`. From a descriptor's canonical bytes a reader obtains every gate, its primitive and its operand gates, and needs nothing else:

~~~text
{"schema": "verity-ir/descriptor/v1",
 "root": <id>, "program_fn": <id>,
 "definitions": {<id>: <definition>, ...},
 "callees": [<id>, ...], "types": [<type>, ...],
 "annotations": {...}}
~~~

`root` names the root, and `program_fn` the program function it inlines, which is part of the identity. `definitions` holds exactly the Definitions reachable from the root and from the program function's binding record. `callees` and `types` are interning tables: a node's callee indexes `callees`, and its output type and each argument's type index `types`. Definitions and nodes are written as:

~~~text
{"form": "primitive", "id": "Name_vN", "params": [[name, <type>], ...], "ret": ["Value", w]}
{"form": "composite", "id": "Name_vN", "bindings": {<static>: <value>, ...},
 "body": {"params": [[name, <type>], ...], "ret_type": <type>, "nodes": [<node>, ...], "ret": <seq>}}

{"form": "primitive" | "call", "fn": c, "args": [{"type": t, "refs": <seq>}, ...], "out": t}
{"form": "batch", "fn": c, "args": [...], "out": t, "axes": [null | d, ...], "n": n}
{"form": "scan",  "fn": c, "args": [...], "out": t, "n": n, "n_xs": k}
~~~

A reference `(s, i, j)` names leaf $j$ of parameter $i$ (`s = "p"`) or of node $i$'s output (`s = "n"`) in the enclosing body. A reference sequence takes one of four forms, or stands for an earlier node's argument:

| Form | JSON | Reference $k$ |
| --- | --- | --- |
| Affine | `{"affine": [s, i, base, count]}` | $(s, i, \mathit{base} + k)$ |
| Strided | `{"strided": [s, i, base, inner, outer_stride, inner_stride, count]}`, with `inner` at least 1 | $(s, i, \mathit{base} + \lfloor k / \mathit{inner} \rfloor \cdot \mathit{outer\_stride} + (k \bmod \mathit{inner}) \cdot \mathit{inner\_stride})$ |
| Explicit | `{"explicit": [[s, i, j], ...]}` | The $k$-th triple |
| Concat | `{"concat": [seq, ...]}` | The parts' references, in order, flattened |
| Alias | `{"alias": [k, a]}` | The whole sequence of argument $a$ of earlier node $k$ |

The canonical bytes of a JSON value are its RFC 8785 serialization. A descriptor is held to a domain on which that serialization is short to state: objects with string keys, arrays, strings, integers, `true`, `false` and `null`; every string, keys included, of the characters U+0000 to U+007E; and every integer of magnitude at most $2^{53} - 1$, with no other numbers, so a float static is written as a hex string. On that domain the bytes have no whitespace, list each object's members sorted by key as byte strings, escape `"` and `\` and the control characters (`\b`, `\t`, `\n`, `\f`, `\r`, and `\u00xx` in lowercase hex for the rest below U+0020), and write each integer in decimal without leading zeros. A stored descriptor need not be canonical; only its canonical bytes are hashed.

A program's digest is the hex SHA-512 of the canonical bytes of its descriptor without `annotations`. It carries no domain prefix, and it is the program's name: a partition names its program by it.

A reader refuses a descriptor outside the canonical domain; a Definition keyed other than by its id and binding record; a root that isn't a composite without parameters; an input node outside the root; a node of another form, or with keys other than its form's; a table index outside its table; a reference that names no leaf; an alias that doesn't name an argument of an earlier node; a sequence whose length isn't its type's leaf count; a node that doesn't type-check against its callee; and a primitive whose signature differs from the one its id denotes. A node that names itself or a later node still decodes, so that a checker can name the defect, and every partition query refuses it.

### The partition object

A partition divides a program's computed gates, constants included, into proof units, each gate in exactly one. Input gates are in no unit: they are bound outside the partition. Under `Q_call` and `Q_word`, each unit computes its own copy of every constant it reads, so no constant is read across units. A partition is an object of format `verity/partition/v1` that names the program and a query, and nothing derived is stored in it:

~~~json
{"format": "verity/partition/v1",
 "program": "<hex SHA-512 of the program>",
 "query": {"name": "Q_call", "version": 1, "params": {"X": 16}}}
~~~

The object has exactly these three fields, and the query exactly its own parameters. Its digest is $\mathrm{SHA\text{-}512}(\texttt{verity/partition/v1\textbackslash 0} \,\Vert\, \mathrm{canon}(\mathit{object}))$, with $\mathrm{canon}$ the canonical bytes above. The verifier evaluates the query on its own copy of the program, and from the units it derives the owner of every gate and the boundary gates. The queries are:

| Query | Parameters | Proof units |
| --- | --- | --- |
| `Q_call` v1 | `X` | Each Call is cut down its hierarchy, through body nodes and then batch members or scan iterations, until each piece's outputs total at most `X` bits. A computing gate wider than `X` makes the query inapplicable |
| `Q_word` v1 | `X`, `W` | Each Call's computing graph is cut so that a unit's outputs total at most `X` bits, or are one value of at most `W` bits. A value computed in two units is refused |
| `Q_word` v2 | `X`, `W` | `Q_word` v1's units, but a value computed in two units is reported, not refused |
| `Q_template_instance` v0 | `template`, a descriptor id | Every root node other than an input node is a call or a batch of the template, and each call and each batch member is one unit |
| `Q_template_instances` v0 | `templates`, a non-empty list of distinct descriptor ids | The same over several templates, each with at least one instance |

Width parameters are integers from 1 to $2^{16}$. Units are numbered by Call, then in layout order within it under `Q_call`, and in node order, then member order, under the template queries. `Q_word` copies its structure the same way, into every unit that reads it: the gates of the wiring primitives `Bf16ToF32_v1`, `F32BitsShl23_v1` and `F32Fabs_v1`, and every gate computed from constants alone. Under the template queries a unit owns every gate of its instance, constants included.

Every query applies only to a topological program, whose nodes read only their body's parameters and earlier nodes; `Q_call` and `Q_word` apply only when every Call is a `call` or `primitive` node. Otherwise the query is inapplicable, and the verifier refuses the partition. A query's algorithm and constants are part of its version: any change to what it computes is a new version.

`Q_word` v2 and `Q_call` v1 may let two units compute a common value. A count of their units bounds faulty work but not distinct work, so a consumer that credits work, such as [compute accounting](/accounting/compute), takes neither.

### Subcircuit templates

A *subcircuit template* is a named template with typed parameters, such as a GEMM coordinate of inner dimension K. Shape and numeric semantics are both parameters, and a semantics value is an instruction id from [silicon](/hardware/accelerators#silicon). A *subcircuit* binds every parameter: it is what a proof system proves and a benchmark measures. The [GEMM coordinate](/assumptions/gemm-coordinate) is a chain of K multiply-accumulates from a zero accumulator on one tensor-core instruction's exact semantics. [Inference](/workloads/inference#subcircuit-templates) lists every template and subcircuit, and [Statements](/proof-systems#statements) says what a proof system proves about one.
