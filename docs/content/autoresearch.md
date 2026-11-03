Autoresearch is Verity's research harness: the `research` command-line tool in `tools/research` of the verity repo. It launches an experiment as an opaque command, records what happened in a run directory, and publishes the run and its outputs to an evidence store. Reviewers then query that store, compare runs and attach labels, such as an independent verifier's verdict. The harness doesn't interpret the workload. The workload reports its own fingerprint, validation, measurements and artifacts through a small result file, and the benchmark decides what makes two runs comparable.

This diagram shows the life of a research run, from launch to the benchmark render:

~~~mermaid
---
config:
  sequence:
    width: 110
    actorMargin: 30
---
sequenceDiagram
  participant R as Research run
  participant P as Prover
  participant S as Store
  participant V as Independent<br/>verifier
  participant Rv as Reviewer
  participant B as Benchmark<br/>render
  R->>R: write job.json
  R->>P: start the workload
  P->>P: prove over its input set
  P->>R: write result.json
  R->>S: publish the attempt and artifacts
  V->>S: fetch the proof
  V->>V: re-verify with own keys
  V->>S: label verified=accepted
  Rv->>R: research status, inspect and compare
  Rv->>S: research data select and label
  B->>S: select results by their labels
  B->>B: compute the tables
~~~

## What the harness is

The harness is one Python package with one command, `research`, built on the standard library alone. Its boundaries are:

- It needs Python 3.11 or later, and installs with `uv sync` from the verity root.
- It imports nothing from Verity's library packages, and reaches Verity only by running its commands. The test `tools/research/tests/test_cli.py` enforces this.
- It records and exposes differences between runs, but doesn't understand SP1, Verity's IR or proof semantics.

## Launching a run

`research run` wraps one command, given after `--`, and records it as a run. Its flags fall into three groups: plain local runs, runs of a declared tool, and remote runs:

~~~text
research run [--project P] [--stage S] [--timeout T] [--expect K=V] [--require-result] [--env K=V] [--cwd DIR] -- CMD...
research run [--tool NAME] [--scratch NAME]... [--campaign C] [...] -- CMD...
research run --on MACHINE --project P [--source GITDIR] [--send FILE] [--env K=V] [--exclusive] [--mem-gb N] [...] -- CMD...
~~~

For each run, the runner:

1. allocates a run id and a run directory in the local registry, `~/.research/runs` or `$RESEARCH_RUNS`;
2. writes the job record, `job.json`, before the command starts;
3. passes the workload `RESEARCH_RUN_ID` and `RESEARCH_RUN_DIR`, and runs it inside the run directory unless `--cwd` says otherwise;
4. hands execution to the telemetry harness, which applies the timeout, samples resources, classifies failures and keeps the logs;
5. exits with the workload's status.

With `--require-result`, a zero exit without a valid `result.json` exits with status 65 instead. `--env K=V` sets a variable for the workload only and records it with the run, redacting the values of secret-named keys.

### Declaring a tool

`--tool NAME` loads a Tool declaration: a small Python description of an existing command, its key parameters and the source files it depends on. Before launch, the runner records the run's conditions (source tree, runtime and hardware), a content hash of every declared source file, and the derivation id and reuse key described below. Without `--tool`, the whole command line is the request, and no earlier run is reused for it. `--scratch NAME` gives the workload a cache directory keyed by the reuse key, so every commit starts with a cold cache.

### Running on a remote machine

`--on MACHINE` runs the same runner on a remote machine that `~/.research/machines.toml` lists for the project. The safeguards are:

- An unlisted machine is refused before anything is contacted.
- The tool ships as a content-addressed snapshot, with no install and no credentials on the machine. The machine checks that the package that answers is the one shipped, and refuses the run on a mismatch.
- `--source GITDIR` ships `git archive HEAD` of a clean checkout. A dirty tree is refused, and the shipped tree is checked by sha256 on both ends before anything runs from it.
- `--exclusive` refuses the run if another run is live on the machine. `--mem-gb N` admits it only if N GB of the machine's memory is free after live reservations.

Until `research fetch RUN --all` copies every file back, sha256-verified, or the run is preserved on the store's remote, the only copy of the evidence is on the machine. Provisioning is a separate step: `--on` never creates a machine.

## What a run records

Each run directory holds the harness's own records beside the workload's result:

| File | Written by | Holds |
| --- | --- | --- |
| `job.json` | The runner, before launch | The job: command, source tree, tool identity, expected fingerprint and cost |
| `status.json` | The harness | The run's state and exit code |
| `events.jsonl`, `resources.jsonl` | The harness | Timeline events and resource samples |
| `failure.json` | The harness | Why the run failed, when it did |
| `stdout.log`, `stderr.log` | The harness | The workload's output |
| `result.json` | The workload | The result, in the format below |

### The result file

The workload writes `$RESEARCH_RUN_DIR/result.json` once, at the end, in the `research/result/v0.1` format. Any language can write it without importing `research`:

~~~json
{
  "schema": "research/result/v0.1",
  "run_id": "the run's own id",
  "workload_fingerprint": {},
  "validation": {"status": "passed", "checker": "checker_name", "detail": "text", "evidence": []},
  "measurements": [{"name": "prove_wall", "value": 12.3, "unit": "s"}],
  "measurement_files": ["results.jsonl"],
  "artifacts": ["proofs/"]
}
~~~

The fields are:

- **`workload_fingerprint`:** the workload's own identity of what actually ran, such as binary hashes, keys, inputs and mode
- **`validation`:** the verdict of the workload's own checker: `passed`, `failed` or `not_run`
- **`measurements`:** named values, each with an explicit unit
- **`measurement_files` and `artifacts`:** paths inside the run directory that are worth preserving

The harness keeps four facts separate, and reports each one on its own:

- the process exited;
- the result file is well-formed;
- the workload's checker reported `passed`;
- the evidence was preserved.

The harness reports that validation passed. It never verifies a proof itself.

## The evidence store

When a run ends, `research run` publishes it to the evidence store, and `research data` queries the store. The store has four objects and two relations:

- **Tool:** a reusable computation, declared around an existing command
- **Derivation:** a requested computation, identified by the hash of its tool, input artifact ids, key parameters and key conditions, with a `drv:` id
- **Attempt:** one execution of a derivation, that is, one `research run`, whose id is the run id
- **Artifact:** an immutable, typed, content-addressed object, with an `art:` id that covers its bytes
- **Replica:** where an artifact's bytes live: the local cache, a repo fixture or the remote
- **Label:** an assertion about an artifact, attempt or derivation, with who made it

The derivation identifies what was asked for, across revisions. The reuse key adds the exact source tree, so a lookup matches only the same request on the same code, and a dirty tree has no reuse key at all.

### Publishing a run

A run is published whether it succeeds or fails, because a failed attempt is evidence too. Publishing does five things:

1. A valid `result.json` becomes an artifact, of kind `bench-result/v1` unless the result names another.
2. The files the result lists become one `run-files/v1` tree artifact.
3. `events.jsonl` and `resources.jsonl` become `telemetry/v1` artifacts.
4. The attempt manifest is written once, to `attempts/<run id>.json`.
5. With a remote configured, every blob and manifest is uploaded and verified.

A failed publish never changes the run's exit status. The error goes to `store_publish_error.json`, and `research data attempt publish RUN` retries it.

### Where the store lives

The local store is `~/.research/store`, or `$RESEARCH_STORE`. An optional remote, a directory or an S3-compatible bucket, is configured in `~/.research/store.toml`. Nothing in the store is ever overwritten. The SQLite catalog is disposable: `research data reindex` rebuilds it from the stored objects.

An artifact is **preserved** when the remote holds its manifest and every blob, each at the right size and with its content checked. The check is either the object's MD5 ETag or a read-back compared by sha256, and the replica record says which. Nothing counts as preserved without a remote. `research data preserved RUN` is the durability gate: the attempt manifest, its artifacts and its labels must all be on the remote.

### Artifact kinds

Each artifact has a kind, `<name>/v<n>`. Common kinds include:

- **`bench-result/v1`:** a result file, with its measurements, validation and fingerprint
- **`proof/v1`:** proof bytes, with the statement digest, backend and parameters
- **`verification-verdict/v1`:** a verifier's PASS or FAIL, with references to the proof and the verifier's own attempt
- **`dataset-snapshot/v1`:** a frozen set of artifacts
- **`fixture/v1`:** an input replicated in the repo, such as golden records or input sets
- **`tc-evidence/v1`:** one tensor-core probe capture
- **`run-files/v1`, `run-record/v1` and `telemetry/v1`:** a run's listed files, all its files with logs, and its telemetry

## Reviewing results

Review starts from the run records and ends in labels that reviewers attach in the store. The commands are:

- **`research status`:** recent runs, with state, exit code, failure class, whether `result.json` is valid, reported validation, project and where each ran. `--refresh` fetches the records of remote runs first.
- **`research inspect RUN`:** one run, with its four facts, source tree, expected and observed fingerprints, measurements, tool identity, cost and timing.
- **`research compare BASELINE CANDIDATE`:** what differs between two runs, and each measurement's candidate-to-baseline ratio.
- **`research data select`:** artifacts by kind, metadata, label, tool, derivation or attempt. `research data show` prints one artifact with the attempts that produced it.
- **`research data lookup --tool NAME`:** earlier attempts with the same reuse key.
- **`research data snapshot`:** freezes a set of artifacts as a `dataset-snapshot/v1` artifact, identified by its content.

`research compare` is descriptive only. The workload's contract decides which differences invalidate a comparison: a changed binary may be the point of an experiment, and a changed relation isn't. One pair of runs gives one measured ratio, not a confidence interval.

### Labels

A label records one assertion: `research data label TARGET KEY VALUE --by WHO`, with an optional `--ref` to the evidence. Labels are append-only, one file per assertion, and conflicting assertions coexist. The store never picks a winner; the decision tables do, for example by selecting on who asserted a label.

The label vocabulary, which `research data vocab` prints, pins every key and groups it by who may assert it:

- **Result:** the producer, about its own result
- **Verification:** an independent verifier, never the producer. The `verified` key takes `accepted`, `rejected`, `not-transferable` or `no-dumps`.
- **Evidence:** probe captures and input sets

`research data label` refuses a key outside the vocabulary unless you pass `--off-vocab`. A producer never carries the verifier's truth: a proof artifact holds the proof bytes, the claimed statement and prover metadata. The verifier takes its specification and keys from its own sources, or from an explicit trusted input.

## Notes

Research runs can be accompanied by written notes and reports. `research notes` keeps them in `~/.research/notes`, or `$RESEARCH_NOTES`, apart from the evidence store.

## Related pages

- [Hardware](/hardware) and [Workloads](/workloads): the fixed quantities results are computed against
- [Performance](/proof-systems/performance): the published results
- [Contributing guidelines](/contributing): how reference entries are sourced and cited, and where measured values name their artifacts
