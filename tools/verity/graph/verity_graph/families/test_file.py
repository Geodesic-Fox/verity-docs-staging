"""The test-file family: one task per test file of every suite, which `runners/test_file.py` runs alone under the suites' read guard.

Suites are what `tools/verity/check/suites.py` finds (`discover`): each directory whose `pyproject.toml` configures pytest, the
repository's own at the root. A suite's test files are its `test_*.py` under its `testpaths`, outside a data directory
(`DATA_DIRS`) and the suites nested in it (`suites.test_files`). A task's inputs are what running its one file reads, found from
the commit's files alone:

- the test file and each `conftest.py` from its directory up to its suite's, with the `__init__.py` files pytest's import of them
  runs (its default `prepend` mode: a module in a package is imported from the first directory above it that isn't one);
- their import closure over the repository's Python (`Imports`): each `import` and `from ... import` in a file, wherever it is
  (a function's, a `TYPE_CHECKING` block's), relative ones from the file's package, absolute ones where the workspace's packages
  put their names (`Layout`), where pytest puts them (each imported file's directory above its packages, the suite's
  `pythonpath`), and a name neither has from the importing file's own directory; a constant name given to `import_module`,
  `__import__`, `importorskip` or `run_module`, a conftest's `pytest_plugins`, and a `.py` file a path loader is given that a
  string in the call names (from the file's directory or one above it). A computed name can't be followed
  (`Info.unfollowed`); what it loads is an undeclared read when the runner meets it;
- the closures of what the test file and its conftests start or load: each `.py` file a string in them names (a script a test
  runs), each module they run as `python -m NAME`, and where they load a module by a path they build, each name a string gives
  that a `.py` file has;
- the suite's declared inputs (`[tool.verity.tests] inputs`, a directory as its files) less their Python, which the closure has
  where it is imported, and less Markdown under a directory unless the suite lists a `.md` (`suites.markdown`); the fixture
  registry when an entry of it that git doesn't hold (a fetched fixture) is under the suite's directory or its inputs;
- each `pyproject.toml` from the test file's directory up to the root;
- the read guard the runner loads into pytest (`GUARD`); the core adds the runner itself.

A task names its suite's directory in `vars` (`suite`), where the runner runs pytest. Its memory is the suite's `[tool.verity.tests]
worker_gb` and its timeout the suite's `timeout_s` where it declares them, else `[family.test-file]`'s.
"""
from __future__ import annotations

import ast
import bisect
import json
import math
import posixpath
import re
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

KIND = "test-file"
#: the read guard the runner loads into pytest, the one `suites.py` loads
GUARD = ("tools/verity/check/guard/verity_suite_guard.py", "tools/verity/check/guard/child/sitecustomize.py",
         "tools/verity/check/guard/child/verity_suite_reads.py")
REGISTRY = "fixtures/artifacts.json"
#: directories whose `test_*.py` files are data a test hands on, not tests (`suites._DATA_DIRS`)
DATA_DIRS = frozenset({"fixtures", "data", "expected", "testdata"})
STDLIB = frozenset(sys.stdlib_module_names)

#: the start of an import statement on a line of its own (or after `try:`, `else:`, `finally:`), read to the end of its logical
#: line (`_statement`): parsing every file whole takes 20 s for the tree, reading its import statements well under one
_STMT = re.compile(r"^[ \t]*(?:(?:try|else|finally)[ \t]*:[ \t]*)?(from[ \t]+\.*[\w.]*[ \t]+import\b|import[ \t]+(?=[\w.]))", re.M)
_NAME = r"[A-Za-z_]\w*"
_DOTTED = rf"{_NAME}(?:\s*\.\s*{_NAME})*"
_AS = rf"(?:\s+as\s+{_NAME})?"
_IMPORT = re.compile(rf"import\s+({_DOTTED}{_AS}(?:\s*,\s*{_DOTTED}{_AS})*)\s*")
_FROM = re.compile(rf"from\s+(\.*)\s*({_DOTTED})?\s+import\s+(\*|\(?\s*{_NAME}{_AS}(?:\s*,\s*{_NAME}{_AS})*\s*,?\s*\)?)\s*")
_AS_SPLIT = re.compile(r"\s+as\s+")
#: calls that import a module by its name, and those that load one from its path
_BY_NAME = ("import_module", "__import__", "importorskip", "run_module")
_CALLS = (*_BY_NAME, "spec_from_file_location", "run_path", "SourceFileLoader")
_CALL = re.compile(rf"\b({'|'.join(_CALLS)})[ \t]*\(")
_CONSTANT = re.compile(r"""\s*[rRuU]?(['"])([\w.]+)\1\s*[,)]""")
#: a string naming a `.py` file
_PYFILE = re.compile(r"""["']([\w./-]*[\w-]\.py)["']""")
#: a module a test runs as `python -m NAME`, in a command's list
_DASH_M = re.compile(r"""["']-m["']\s*,\s*[rRuU]?["']([A-Za-z_][\w.]*)["']""")
_BARE = re.compile(r"""["']([A-Za-z_]\w*)["']""")
_PLUGINS = re.compile(r"^pytest_plugins[ \t]*=", re.M)


def _parent(path: str) -> str:
    """The directory holding ``path``, "" for the root."""
    return path.rpartition("/")[0]


def _join(d: str, name: str) -> str:
    return f"{d}/{name}" if d else name


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


@dataclass(frozen=True)
class Suite:
    name: str
    path: str                      # its directory, "." for the repository's own
    testpaths: tuple[str, ...]     # root-relative
    pythonpath: tuple[str, ...]    # root-relative: `[tool.pytest.ini_options] pythonpath`, from its rootdir
    inputs: tuple[str, ...]        # `[tool.verity.tests] inputs`
    timeout_s: int | None          # `[tool.verity.tests] timeout_s`
    mem_gb: float | None           # `[tool.verity.tests] worker_gb`: one test process's peak

    @property
    def dir(self) -> str:
        return "" if self.path == "." else self.path


class Tree:
    """The commit's files, read from ``root``: which are files, which directories, what each directory holds."""

    def __init__(self, root: Path, files: list[str]):
        self.root = root
        self.sorted = sorted(files)
        self.files = frozenset(self.sorted)
        self.children: dict[str, set[str]] = {}
        for f in self.sorted:
            d, _, name = f.rpartition("/")
            while True:
                kids = self.children.setdefault(d, set())
                if name in kids:
                    break
                kids.add(name)
                if not d:
                    break
                d, _, name = d.rpartition("/")
        self.dirs = frozenset(self.children)

    def text(self, path: str) -> str:
        return (self.root / path).read_bytes().decode("utf-8", "replace")

    def toml(self, path: str) -> dict:
        return tomllib.loads(self.text(path))

    def under(self, d: str) -> list[str]:
        """The files at or under ``d`` ("" or "." for the root)."""
        if d in ("", "."):
            return self.sorted
        if d in self.files:
            return [d]
        lo = bisect.bisect_left(self.sorted, d + "/")
        hi = bisect.bisect_left(self.sorted, d + "0")         # "0" sorts just after "/"
        return self.sorted[lo:hi]

    def has(self, base: str, name: str) -> bool:
        """Whether a directory on `sys.path` serves import name ``name``: a module file or a directory (a package, or a namespace
        package's portion)."""
        return _join(base, name + ".py") in self.files or _join(base, name) in self.dirs

    def names(self, base: str) -> set[str]:
        """The import names directory ``base`` serves."""
        out = set()
        for n in self.children.get(base, ()):
            if n.endswith(".py"):
                out.add(n[:-3])
            elif _join(base, n) in self.dirs:
                out.add(n)
        return out


def _wheel(data: dict) -> dict:
    hatch = data.get("tool", {}).get("hatch", {}).get("build", {})
    return {**hatch, **hatch.get("targets", {}).get("wheel", {})}


class Layout:
    """Where the workspace's packages put import names in the environment `uv sync` installs (each member editable, by hatch): an
    exact editable (`dev-mode-exact`) serves its packages alone, by name; any other puts each package's parent directory (or its
    `dev-mode-dirs`) on `sys.path`, which then serves every name in it. A virtual member (`[tool.uv] package = false`) serves none."""

    def __init__(self, tree: Tree):
        self.tree = tree
        root = tree.toml("pyproject.toml")
        members = [""] + [m.strip("/") for m in root.get("tool", {}).get("uv", {}).get("workspace", {}).get("members", [])]
        self.exact: dict[str, list[str]] = {}
        paths: set[str] = set()
        for m in members:
            data = tree.toml(_join(m, "pyproject.toml"))
            if data.get("tool", {}).get("uv", {}).get("package") is False or "build-system" not in data or "project" not in data:
                continue
            wheel = _wheel(data)
            module = _norm(data["project"]["name"]).replace("-", "_")
            packages = wheel.get("packages") or [p for p in (f"src/{module}", module) if _join(_join(m, p), "__init__.py")
                                                  in tree.files][:1]
            full = [_join(m, p.strip("/")) for p in packages]
            if wheel.get("dev-mode-exact"):
                for p in full:
                    self.exact.setdefault(p.rpartition("/")[2].removesuffix(".py"), []).append(_parent(p))
            elif wheel.get("dev-mode-dirs"):
                paths.update(_join(m, d.strip("/")).rstrip("/") for d in wheel["dev-mode-dirs"] if d.strip("/") != ".")
                paths.update(m for d in wheel["dev-mode-dirs"] if d.strip("/") == ".")
            else:
                paths.update(_parent(p) for p in full)
        self.paths = tuple(sorted(paths))

    def bases(self, top: str) -> list[str]:
        """The `sys.path` directories that serve top-level name ``top``."""
        return [*self.exact.get(top, ()), *(b for b in self.paths if self.tree.has(b, top))]

    def serves(self, top: str) -> bool:
        return top in self.exact or any(self.tree.has(b, top) for b in self.paths)


def _statement(text: str, start: int) -> str:
    """The logical line from ``start``: to a newline outside brackets that no backslash continues, comments left out."""
    end = text.find("\n", start)
    end = len(text) if end < 0 else end
    line = text[start:end]
    if "(" not in line and "#" not in line and not line.endswith("\\"):
        return line
    out, depth, i, n = [], 0, start, len(text)
    while i < n:
        c = text[i]
        if c == "#":
            i = text.find("\n", i)
            if i < 0:
                break
            continue
        if c == "\\" and text.startswith("\n", i + 1):
            out.append(" ")
            i += 2
            continue
        if c == "\n" and depth <= 0:
            break
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        out.append(" " if c == "\n" else c)
        i += 1
    return "".join(out)


def _requests(stmt: str) -> list[tuple[int, str, tuple[str, ...]]] | None:
    """The imports one statement makes, each (level, module, names imported from it), or None when it isn't an import statement
    of the forms the regular expressions read (the caller parses it)."""
    out = []
    for part in stmt.split(";"):
        part = part.strip()
        if not part:
            continue
        if part.startswith("import"):
            if not (m := _IMPORT.fullmatch(part)):
                return None
            out += [(0, re.sub(r"\s", "", _AS_SPLIT.split(a)[0]), ()) for a in re.split(r"\s*,\s*", m.group(1))]
        elif part.startswith("from"):
            if not (m := _FROM.fullmatch(part)):
                return None
            names = () if m.group(3) == "*" else tuple(
                _AS_SPLIT.split(n.strip())[0] for n in m.group(3).strip("() \t").split(",") if n.strip())
            out.append((len(m.group(1)), re.sub(r"\s", "", m.group(2) or ""), names))
        elif out:
            break                                           # code after the imports on their line
        else:
            return None
    return out


def _parsed(text: str) -> list[tuple[int, str, tuple[str, ...]]]:
    """Every import statement of a whole file, by its syntax tree."""
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return []
    out = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            out += [(0, a.name, ()) for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            out.append((n.level, n.module or "", tuple(a.name for a in n.names if a.name != "*")))
    return out


@dataclass
class Info:
    """What one file imports: the files that resolves to wherever it is imported (`fixed`), and its absolute imports of names the
    workspace doesn't serve (`local`: top-level name -> [(module, names)]), which the directories pytest puts on `sys.path` may;
    and what it may start: the `.py` files its strings name (`scripts`) and the modules it runs as `python -m NAME` (`modules`)."""
    fixed: tuple[str, ...]
    local: dict[str, list[tuple[str, tuple[str, ...]]]]
    unfollowed: int
    scripts: tuple[str, ...]
    modules: tuple[str, ...]


class Imports:
    """The repository's Python files' imports, each file read once, and the closure of a task's files."""

    def __init__(self, tree: Tree, layout: Layout):
        self.tree, self.layout = tree, layout
        self._info: dict[str, Info] = {}
        self._serves: dict[str, bool] = {}
        self._closed: dict[str, frozenset[str]] = {}            # file -> what its `fixed` edges reach, itself included
        self._by_top: dict[str, set[str]] = {}                  # top-level name -> the files importing it absolutely
        self.fallbacks = 0              # files whose statements the regular expressions couldn't read, parsed whole

    def serves(self, top: str) -> bool:
        if top not in self._serves:
            self._serves[top] = self.layout.serves(top)
        return self._serves[top]

    def walk(self, base: str, module: str, names: tuple[str, ...]) -> list[str]:
        """The files importing ``module`` from ``base`` (a `sys.path` directory, or a package's for a relative import) runs: each
        package's `__init__.py` on the way and the module's file, then each of ``names`` that is a submodule."""
        out, d = [], base
        parts = [p for p in module.split(".") if p]
        for i, p in enumerate(parts):
            d = _join(d, p)
            if d in self.tree.dirs:
                if (init := d + "/__init__.py") in self.tree.files:
                    out.append(init)
                if d + ".py" in self.tree.files:            # a namespace directory beside a module of its name
                    out.append(d + ".py")
            elif d + ".py" in self.tree.files:
                out.append(d + ".py")
                return out
            else:
                return out
        for n in names:
            sub = _join(d, n)
            if sub + ".py" in self.tree.files:
                out.append(sub + ".py")
            elif (init := sub + "/__init__.py") in self.tree.files:
                out.append(init)
        return out

    def _named(self, path: str, name: str) -> str | None:
        """The repository file a `.py` string in ``path`` names: from its directory, or the nearest one above it."""
        d = _parent(path)
        while True:
            p = posixpath.normpath(_join(d, name))
            if not p.startswith("../") and p in self.tree.files:
                return p
            if not d:
                return None
            d = _parent(d)

    def info(self, path: str) -> Info:
        if (got := self._info.get(path)) is not None:
            return got
        text = self.tree.text(path)
        reqs: list[tuple[int, str, tuple[str, ...]]] = []
        for m in _STMT.finditer(text):
            r = _requests(_statement(text, m.start(1)))
            if r is None:
                try:
                    r = _parsed(_statement(text, m.start(1)).strip())
                except RecursionError:
                    r = None
                if not r:
                    self.fallbacks += 1
                    reqs = _parsed(text)
                    break
            reqs += r
        unfollowed, by_path = 0, False
        fixed: list[str] = []
        for m in _CALL.finditer(text) if any(k in text for k in _CALLS) else ():
            call = _statement(text, m.end() - 1)
            if m.group(1) in _BY_NAME:
                if c := _CONSTANT.match(text, m.end()):
                    reqs.append((0, c.group(2), ()))
                else:
                    unfollowed += 1
            elif loaded := [p for s in _PYFILE.findall(call) if (p := self._named(path, s))]:
                fixed += loaded
            else:
                unfollowed, by_path = unfollowed + 1, True
        for line in _PLUGINS.finditer(text) if "pytest_plugins" in text else ():
            for s in re.findall(r"""["']([\w.]+)["']""", _statement(text, line.start())):
                reqs.append((0, s, ()))
        local: dict[str, list[tuple[str, tuple[str, ...]]]] = {}
        here = _parent(path)
        for level, module, names in reqs:
            if level:
                base = here
                for _ in range(level - 1):
                    base = _parent(base)
                fixed += self.walk(base, module, names)
                continue
            top = module.partition(".")[0]
            if not top or top in STDLIB or top == "__future__":
                continue
            local.setdefault(top, []).append((module, names))
            if self.serves(top):
                for b in self.layout.bases(top):
                    fixed += self.walk(b, module, names)
            elif self.tree.has(here, top):
                fixed += self.walk(here, module, names)
        scripts = {p for s in _PYFILE.findall(text) if (p := self._named(path, s))} if ".py'" in text or '.py"' in text else set()
        if by_path:                     # a module loaded by a path it builds from a name (`_load("gamma")`): each name with a file
            scripts |= {p for s in set(_BARE.findall(text)) if (p := self._named(path, s + ".py"))}
        modules = set(_DASH_M.findall(text)) if "-m" in text else set()
        got = self._info[path] = Info(tuple(sorted(set(fixed) - {path})), local, unfollowed, tuple(sorted(scripts - {path})),
                                      tuple(sorted(modules)))
        for top in local:
            self._by_top.setdefault(top, set()).add(path)
        return got

    def reached(self, start: str) -> frozenset[str]:
        """What ``start``'s `fixed` edges reach, itself included: one set per strongly connected component (Tarjan's, iterative),
        each from its members and its successors' sets, so every file's is computed once."""
        if (got := self._closed.get(start)) is not None:
            return got
        index: dict[str, int] = {}
        low: dict[str, int] = {}
        stack: list[str] = []
        on: set[str] = set()
        work = [(start, iter(self.info(start).fixed))]
        index[start] = low[start] = 0
        stack.append(start)
        on.add(start)
        while work:
            v, edges = work[-1]
            for w in edges:
                if w in self._closed:
                    continue
                if w not in index:
                    index[w] = low[w] = len(index)
                    stack.append(w)
                    on.add(w)
                    work.append((w, iter(self.info(w).fixed)))
                    break
                if w in on:
                    low[v] = min(low[v], index[w])
            else:
                work.pop()
                if work:
                    u = work[-1][0]
                    low[u] = min(low[u], low[v])
                if low[v] == index[v]:
                    members = set()
                    while True:
                        w = stack.pop()
                        on.discard(w)
                        members.add(w)
                        if w == v:
                            break
                    out = set(members)
                    for m in members:
                        for w in self.info(m).fixed:
                            if w not in members:
                                out |= self._closed[w]
                    done = frozenset(out)
                    for m in members:
                        self._closed[m] = done
        return self._closed[start]

    def closure(self, seeds: list[str], bases: list[str], starters: list[str]) -> set[str]:
        """The Python files importing ``seeds`` with ``bases`` on `sys.path` (pytest's) can run, ``seeds`` among them, and those
        the scripts and modules ``starters`` (a test file and its conftests) name can (`Info.scripts`, `Info.modules`): what their
        `fixed` edges reach (`reached`), and what those files' absolute imports of a name one of ``bases`` serves reach from it.
        What a module further in starts isn't followed: across the tree that joins most of it into one closure."""
        roots = [s for s in seeds if s.endswith(".py")]
        for s in starters:
            info = self.info(s)
            roots += info.scripts
            for m in info.modules:
                top = m.partition(".")[0]
                for b in dict.fromkeys([*self.layout.bases(top), *(b for b in bases if self.tree.has(b, top))]):
                    roots += self.walk(b, m, ("__main__",))
        bases = [b for b in dict.fromkeys(bases) if b not in self.layout.paths]
        served = {n: [b for b in bases if self.tree.has(b, n)] for b in bases for n in self.tree.names(b)}
        out = set().union(*(self.reached(s) for s in roots))
        while served:
            new = set()
            for top in served.keys() & self._by_top.keys():
                for f in self._by_top[top] & out:
                    for b in served[top]:
                        for module, names in self._info[f].local[top]:
                            new.update(self.walk(b, module, names))
            new -= out
            if not new:
                break
            for g in new:
                out |= self.reached(g)
        return out


def discover(tree: Tree) -> list[Suite]:
    """Every suite, as `suites.discover` finds them: each directory whose `pyproject.toml` configures pytest."""
    out = []
    for f in tree.sorted:
        if f != "pyproject.toml" and not f.endswith("/pyproject.toml"):
            continue
        data = tree.toml(f)
        if "pytest" not in data.get("tool", {}):
            continue
        path = _parent(f) or "."
        base = "" if path == "." else path
        project = data.get("project", {})
        cfg = data["tool"]["pytest"].get("ini_options", {})
        tests = data["tool"].get("verity", {}).get("tests", {})
        testpaths = tuple(_join(base, t.strip("/")) if t not in (".", "") else base for t in cfg.get("testpaths", ["."]))
        pythonpath = tuple("" if (p := posixpath.normpath(_join(base, x))) == "." else p for x in cfg.get("pythonpath", []))
        out.append(Suite("repository" if path == "." else _norm(project["name"]) if project else path, path, testpaths,
                         pythonpath, tuple(tests.get("inputs", [])), math.ceil(tests["timeout_s"]) if tests.get("timeout_s") else None,
                         tests.get("worker_gb") or None))
    return out


def _under(path: str, d: str) -> bool:
    return d in ("", ".") or path == d or path.startswith(d + "/")


def test_files(tree: Tree, suite: Suite, suites: list[Suite]) -> list[str]:
    """``suite``'s test files: its `test_*.py` under its test paths, outside a data directory and the suites nested in it."""
    nested = [s.dir for s in suites if s.path != suite.path and suite.path != "." and _under(s.dir, suite.dir)]
    out = []
    for t in suite.testpaths:
        for f in tree.under(t):
            parts = f.split("/")
            if (parts[-1].startswith("test_") and parts[-1].endswith(".py") and not DATA_DIRS.intersection(parts[:-1])
                    and not any(_under(f, n) for n in nested)):
                out.append(f)
    return sorted(set(out))


def declared(tree: Tree, suite: Suite, fixtures: list[str]) -> list[str]:
    """The suite's declared inputs less their Python (and their directories' Markdown unless it lists a `.md`), and the fixture
    registry when a fetched fixture is under the suite or one of them."""
    markdown = any(p.endswith(".md") for p in suite.inputs)
    out: set[str] = set()
    for p in suite.inputs:
        p = p.strip("/")
        if p in tree.files:
            if not p.endswith(".py"):
                out.add(p)
            continue
        out.update(f for f in tree.under(p) if not f.endswith(".py") and (markdown or not f.endswith(".md")))
    if fetches(suite, fixtures):
        out.add(REGISTRY)
    return sorted(out)


def fetches(suite: Suite, fixtures: list[str]) -> list[str]:
    """The fetched fixtures under ``suite``'s directory or its declared inputs, the root's aside (`suites.py`: the repository's
    own suite reads tracked files only)."""
    dirs = [d for d in (p.strip("/") for p in (suite.dir, *suite.inputs)) if d not in ("", ".")]
    return [f for f in fixtures if any(_under(f, d) for d in dirs)]


def _basedir(tree: Tree, path: str) -> tuple[str, list[str]]:
    """Where pytest's `prepend` import puts module ``path`` on `sys.path`, the first directory above it that isn't a package,
    and the packages' `__init__.py` files the import runs."""
    d, inits = _parent(path), []
    while d and (init := d + "/__init__.py") in tree.files:
        inits.append(init)
        d = _parent(d)
    return d, inits


def task(tree: Tree, imports: Imports, suite: Suite, path: str, data: list[str]) -> dict:
    conftests, d = [], _parent(path)
    while True:
        if (c := _join(d, "conftest.py")) in tree.files:
            conftests.append(c)
        if d == suite.dir or not d:
            break
        d = _parent(d)
    seeds, bases = [path, *conftests], list(suite.pythonpath)
    for f in [path, *conftests]:
        base, inits = _basedir(tree, f)
        bases.append(base)
        seeds += inits
    d, pyprojects = _parent(path), []
    while True:
        if (p := _join(d, "pyproject.toml")) in tree.files:
            pyprojects.append(p)
        if not d:
            break
        d = _parent(d)
    inputs = {*imports.closure(seeds, bases, [path, *conftests]), *seeds, *data, *pyprojects, *GUARD}
    out = {"id": f"{KIND}:{path}", "vars": {"suite": suite.path}, "inputs": sorted(inputs)}
    if suite.mem_gb:
        out["resources"] = {"mem_gb": suite.mem_gb}
    if suite.timeout_s:
        out["timeout_s"] = suite.timeout_s
    return out


def fetched(tree: Tree) -> list[str]:
    """The fixture registry's paths that git doesn't hold: fetched before a test reads them (`suites.fetched_fixtures`)."""
    if REGISTRY not in tree.files:
        return []
    reg = json.loads(tree.text(REGISTRY))
    return sorted(v for k, v in reg.items() if k.startswith("art:") and isinstance(v, str) and v not in tree.files)


def tasks(root: Path, files: list[str]) -> list[dict]:
    tree = Tree(root, files)
    imports = Imports(tree, Layout(tree))
    suites = discover(tree)
    fixtures = fetched(tree)
    out = []
    for s in suites:
        data = declared(tree, s, fixtures)
        out += [task(tree, imports, s, f, data) for f in test_files(tree, s, suites)]
    return sorted(out, key=lambda t: t["id"])
