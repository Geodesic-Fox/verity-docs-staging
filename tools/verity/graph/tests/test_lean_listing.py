"""The lean-module and lean-lock listings on a toy checkout of Lake packages laid out as Security's are: a package whose
`srcDir` is its parent, a requirement by path, a `proved_in`, every import form, transitive reads, and the trees that make
no graph."""
from __future__ import annotations

import json

import pytest
from conftest import toy_tree

from verity_graph import ROOT, graph
from verity_graph.families import lean_lock, lean_module

LISTERS = {"lean-module": lean_module.tasks, "lean-lock": lean_lock.tasks}
TOOLCHAIN = "leanprover/lean4:v4.34.0\n"


def manifest(name: str, *paths: tuple[str, str]) -> str:
    return json.dumps({"version": "1.1.0", "packagesDir": ".lake/packages", "name": name, "lakeDir": ".lake",
                       "packages": [{"type": "path", "scope": "", "name": n, "manifestFile": "lake-manifest.json",
                                     "inherited": False, "dir": d, "configFile": "lakefile.toml"} for n, d in paths]})


FILES = {
    "Sec/lakefile.toml": 'name = "sec"\ndefaultTargets = ["Definitions"]\n\n[leanOptions]\nautoImplicit = false\n\n'
                         '[[lean_lib]]\nname = "Definitions"\n',
    "Sec/lake-manifest.json": manifest("sec"),
    "Sec/lean-toolchain": TOOLCHAIN,
    "Sec/lean-audit.json": json.dumps({"guarantees": [], "proved_in": ["Proofs"]}),
    "Sec/Definitions.lean": "import Definitions.A\n",
    "Sec/Definitions/A.lean": "/- a comment /- nested -/ -/\nimport Mathlib.Logic.Basic\n\ndef a := 1\n",
    "Sec/Scratch.lean": "def scratch := 0\n",
    "Sec/Proofs/lakefile.toml": 'name = "proofs"\nsrcDir = ".."\ndefaultTargets = ["Proofs"]\n\n[[require]]\nname = "sec"\n'
                                'path = ".."\n\n[[lean_lib]]\nname = "Proofs"\n',
    "Sec/Proofs/lake-manifest.json": manifest("proofs", ("sec", "..")),
    "Sec/Proofs/lean-toolchain": TOOLCHAIN,
    "Sec/Proofs/lean-audit.json": json.dumps({"guarantees": []}),
    "Sec/Proofs.lean": "import Proofs.B\nimport Proofs.E\n",
    "Sec/Proofs/B.lean": "module -- the module system\n/-! docs -/\npublic import Definitions.A\nmeta import Proofs.C\n"
                         "import all Proofs.D\npublic meta import Init.Data.List\n\ntheorem b : True := trivial\n",
    "Sec/Proofs/C.lean": "import Definitions\nimport Proofs.D\n",
    "Sec/Proofs/D.lean": "prelude\n",
    "Sec/Proofs/E.lean": "import Scratch\nimport Proofs.Missing\n",
    "tools/verity/lean/tests/fixtures/ctl/lakefile.toml": 'name = "ctl"\n\n[[lean_lib]]\nname = "Ctl"\n',
    "tools/verity/lean/tests/fixtures/ctl/lean-audit.json": "{}",
    "tools/verity/lean/tests/fixtures/ctl/Ctl.lean": "def c := 0\n",
    "tools/verity/lean/check.py": "",
    "tools/verity/check/common.py": "",
    f"{graph.RUNNERS}/lean_module.py": "",
    f"{graph.RUNNERS}/lean_lock.py": "",
}


def listed(tmp_path, **changes) -> dict:
    tree = toy_tree(tmp_path / "tree", (ROOT / graph.SPEC).read_text(), {**FILES, **changes})
    return {t["id"]: t for t in graph.listing(tree, listers=LISTERS)["tasks"]}


def olean(*files: str) -> list[dict]:
    return [{"task": f"lean-module:{f}", "output": "olean"} for f in sorted(files)]


def test_modules_of_packages_with_a_parent_src_dir_read_their_imports_transitively(tmp_path):
    ts = listed(tmp_path)
    assert sorted(i for i in ts if i.startswith("lean-module:")) == [f"lean-module:Sec/{f}" for f in (
        "Definitions.lean", "Definitions/A.lean", "Proofs.lean", "Proofs/B.lean", "Proofs/C.lean", "Proofs/D.lean",
        "Proofs/E.lean")], "a file no library claims (Scratch) and the auditor's fixtures have no task"
    b = ts["lean-module:Sec/Proofs/B.lean"]
    assert b["vars"] == {"module": "Proofs.B", "package": "proofs", "options": "{}"}
    assert ts["lean-module:Sec/Definitions/A.lean"]["vars"]["options"] == '{"autoImplicit":false}'
    assert b["inputs"] == sorted(["Sec/Proofs/B.lean", "Sec/Proofs/lakefile.toml", *graph.runner_sources("lean-module")])
    assert b["reads"] == olean("Sec/Definitions.lean", "Sec/Definitions/A.lean", "Sec/Proofs/C.lean", "Sec/Proofs/D.lean"), \
        "public, meta and all imports are read, each with what it imports; the toolchain's and Mathlib's are the env's"
    assert b["outputs"] == [{"name": "axioms", "path": "out/axioms/Proofs/B.json"},
                            {"name": "ilean", "path": "out/lean/Proofs/B.ilean"},
                            {"name": "olean", "path": "out/lean/Proofs/B.olean"}]
    assert b["about"] == "compile and kernel-replay Sec/Proofs/B.lean" and b["env"] == "lean" and b["key"] is None
    assert ts["lean-module:Sec/Proofs/E.lean"]["reads"] == [], \
        "an import no package claims (Scratch) or no file holds (Proofs.Missing) is left for the compile to fail on"
    assert ts["lean-module:Sec/Proofs/D.lean"]["key"] is not None, "a module that reads nothing is keyed when listed"
    assert {r["task"] for r in ts["lean-module:Sec/Proofs.lean"]["reads"]} == {
        f"lean-module:Sec/{f}" for f in ("Definitions.lean", "Definitions/A.lean", "Proofs/B.lean", "Proofs/C.lean",
                                         "Proofs/D.lean", "Proofs/E.lean")}


def test_a_lock_reads_every_package_its_records_read(tmp_path):
    ts = listed(tmp_path)
    assert sorted(i for i in ts if i.startswith("lean-lock:")) == ["lean-lock:Sec", "lean-lock:Sec/Proofs"]
    for pkg in ("Sec", "Sec/Proofs"):
        t = ts[f"lean-lock:{pkg}"]
        assert t["reads"] == olean(*(i.removeprefix("lean-module:") for i in ts if i.startswith("lean-module:"))), \
            "Sec names Sec/Proofs as proved_in, and Sec/Proofs requires Sec by path: each reads both builds"
        assert {"Sec/Proofs/B.lean", "Sec/Definitions/A.lean", "Sec/lean-audit.json", "Sec/Proofs/lean-audit.json",
                "tools/verity/lean/check.py", "tools/verity/check/common.py"} <= set(t["inputs"])
        assert t["outputs"] == [{"name": "records", "path": f"out/{pkg}/lean-audit.json"}]


@pytest.mark.parametrize("changes, refusal", [
    ({"Sec/Proofs/D.lean": "import Proofs.C\n"}, "an import cycle"),
    ({"Sec/Other/lakefile.toml": 'name = "other"\nsrcDir = ".."\n\n[[lean_lib]]\nname = "Definitions"\n',
      "Sec/Other/lake-manifest.json": manifest("other"), "Sec/Other/lean-toolchain": TOOLCHAIN}, "a module of both"),
    ({"Sec/Proofs/lakefile.lean": "import Lake\n"}, "lakefile.toml only"),
    ({"Sec/lakefile.toml": 'name = "sec"\nmoreLeanArgs = ["-DmaxHeartbeats=0"]\n\n[[lean_lib]]\nname = "Definitions"\n'},
     "moreLeanArgs changes how Lake compiles"),
    ({"Sec/lakefile.toml": 'name = "sec"\n\n[[lean_lib]]\nname = "Definitions"\nglobs = ["Definitions.+"]\n'},
     "globs of its own"),
])
def test_trees_that_make_no_graph(tmp_path, changes, refusal):
    with pytest.raises(graph.GraphError, match=refusal):
        listed(tmp_path, **changes)
