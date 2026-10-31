"""The low-risk lane (drive.toml's `lowrisk_lane`, `Driver.land_lowrisk`): after the reviewed prefix, a tick lands up to
`lowrisk_per_tick` members of `next` onto `checked`, never `main`, on their ready mark alone, each whose merge onto `checked`'s
tip changes nothing `lowrisk_excludes` names, merges with no conflict, contains no unlanded PR and compiles."""
from __future__ import annotations

import time

import pytest

from research.drive import FIX_WAIT_S, LEAN_STEP
from research.queue import lowrisk
from test_drive_checked import _checked
from test_drive_review import Review, _main, _subject
from test_queue import World, _git
from test_queue_drive import _steps_run, _tip

#: drive.toml's `lowrisk_excludes`
EXCLUDES = ("*.lean", "lean-audit.json", "lakefile.*", "lean-toolchain", "lake-manifest.json", "TRUSTED.sha256",
            "verity/core/", "verity/ml/circuits/", "verity/ml/kernels/", "verity/ml/commitments/", "verity/ml/crypto/",
            "verity/ml/randomness/")
TAG = "(low-risk lane: no Lean, lock or soundness-path change)"


@pytest.fixture
def world(tmp_path):
    return World(tmp_path)


def _lane(world: World, monkeypatch, per_tick: int = 20, **kw) -> Review:
    into = kw.pop("land_into", "checked")
    if into == "checked":
        _git(world.origin, "update-ref", "refs/heads/checked", _main(world))
    h = Review(world, monkeypatch, land_into=into, **kw)
    h.d.lowrisk_lane, h.d.lowrisk_per_tick, h.d.lowrisk_excludes = True, per_tick, EXCLUDES
    return h


def _landed(world: World) -> list[str]:
    return [x for x in world.logs if x.endswith(TAG)]


def _skipped(world: World) -> list[str]:
    return [x for x in world.logs if "low-risk lane skipped" in x]


@pytest.mark.parametrize("files, low", [
    (["tools/research/src/research/drive.py", "README.md"], True),
    (["integrations/vllm/verity_vllm/serve.py", "verity/ml/flock/x.py", "verity/ml/definitions/y.py"], True),
    (["Security/Proofs/Core/X.lean"], False),
    (["docs/a.md", "verity/core/protocols/pous/lean/lean-audit.json"], False),
    (["verity/core/service/flock/lakefile.toml"], False),
    (["x/lean-toolchain"], False), (["x/lake-manifest.json"], False), (["x/TRUSTED.sha256"], False),
    (["verity/core/claims.py"], False),
    (["verity/ml/circuits/ops/add.py"], False), (["verity/ml/kernels/k.cu"], False),
    (["verity/ml/commitments/c.py"], False), (["verity/ml/crypto/c.py"], False), (["verity/ml/randomness/r.py"], False),
    (["verity/ml/circuitsx/a.py"], True),                   # a directory entry is a whole path component
    ([], False),                                            # nothing to land
])
def test_the_class_is_no_file_drive_toml_excludes(files, low):
    assert lowrisk(files, EXCLUDES) is low


def test_no_excludes_is_no_low_risk_change():
    assert not lowrisk(["README.md"], ())


def test_a_tick_lands_up_to_lowrisk_per_tick_low_risk_members_in_next_order_onto_checked_never_main(world, monkeypatch):
    h = _lane(world, monkeypatch, per_tick=2)
    main = _main(world)
    world.gh.put(1, world.change({"verity/core/v.py": "1\n"}))            # a verifier: waits for its review
    world.gh.put(2, world.change({"x.txt": "2\n"}))
    world.gh.put(3, world.change({"y.txt": "3\n"}))
    world.gh.put(4, world.change({"z.txt": "4\n"}))
    assert h.tick().endswith("landed #2 #3 on the low-risk lane"), world.logs
    tip = _checked(world)
    assert _subject(world, "checked") == "Queue: #3 change 3" and _subject(world, "checked^1") == "Queue: #2 change 2"
    assert _git(world.origin, "rev-parse", "checked^1^1") == main and _main(world) == main
    assert _landed(world) == [f"research queue drive: landed #{n} on `checked` at {c[:12]} {TAG}"
                              for n, c in ((2, _git(world.origin, "rev-parse", "checked^1")), (3, tip))]
    assert h.postland()["pending"] == [_git(world.origin, "rev-parse", "checked^1"), tip]
    h.tick()                                                    # `next` rebuilt on `checked` without them; #4 lands
    assert _subject(world, "checked") == "Queue: #4 change 4" and _main(world) == main
    h.tick()                                                    # and rebuilt again without #4
    assert world.on_next(h.q) == [1] and _subject(world, "checked") == "Queue: #4 change 4"


def test_off_drive_lands_only_on_review(world, monkeypatch):
    h = _lane(world, monkeypatch)
    h.d.lowrisk_lane = False
    world.gh.put(1, world.change({"x.txt": "1\n"}))
    checked = _checked(world)
    assert h.tick().startswith("nothing reviewed lands"), world.logs
    assert _checked(world) == checked and not _landed(world) and not _skipped(world)
    h.review(1)
    assert h.tick().startswith("landed #1") and not _landed(world)


def test_a_member_containing_an_unlanded_pr_waits_and_lands_once_that_pr_lands_in_the_same_tick(world, monkeypatch):
    h = _lane(world, monkeypatch)
    world.gh.put(1, one := world.change({"verity/core/v.py": "1\n"}))
    world.gh.put(2, world.change({"x.txt": "2\n"}, base=one))           # its own change is low-risk; it holds #1's
    h.tick()
    assert not _landed(world)
    assert _skipped(world)[-1] == "research queue drive: low-risk lane skipped #2 (contains #1, which isn't landed)"
    h.review(1)
    assert h.tick() == "landed #1; landed #2 on the low-risk lane", world.logs
    assert _subject(world, "checked") == "Queue: #2 change 2" and _subject(world, "checked^1") == "Queue: #1 change 1"


def test_a_conflict_on_checkeds_tip_is_skipped_and_the_rest_land(world, monkeypatch):
    """`checked` moved under `next` within the tick (here between the reviewed landing and the lane): #1 no longer merges onto
    its tip, and is skipped; #2 lands."""
    h = _lane(world, monkeypatch)
    world.gh.put(1, world.change({"a.txt": "1\n"}))
    world.gh.put(2, world.change({"x.txt": "2\n"}))
    real = h.d._stack_lean

    def move(drive, dry_run):
        _git(world.dev, "push", "-q", "origin", f"{world.change({'a.txt': 'other\n'}, base='origin/checked')}:refs/heads/checked")
        h.q.fetch()
        return real(drive, dry_run)

    monkeypatch.setattr(h.d, "_stack_lean", move)
    assert h.tick().endswith("landed #2 on the low-risk lane"), world.logs
    assert _skipped(world) == ["research queue drive: low-risk lane skipped #1 (conflict in a.txt)"]


def test_a_member_that_doesnt_compile_is_skipped(world, monkeypatch):
    h = _lane(world, monkeypatch)
    world.gh.put(1, world.change({"tools/x.py": "def (:\n"}))
    world.gh.put(2, world.change({"tools/y.py": "y = 1\n"}))
    assert h.tick().endswith("landed #2 on the low-risk lane"), world.logs
    (line,) = _skipped(world)
    assert line.startswith("research queue drive: low-risk lane skipped #1 (compile: tools/x.py: SyntaxError")


def test_a_hold_verdict_or_a_withdrawn_mark_keeps_a_member_off_the_lane(world, monkeypatch):
    h = _lane(world, monkeypatch)
    world.gh.put(1, world.change({"x.txt": "1\n"}))
    world.gh.put(2, world.change({"y.txt": "2\n"}))
    world.gh.put(3, three := world.change({"z.txt": "3\n"}))
    h.review(1, "hold", ref="wait")
    real = h.d._stack_lean

    def withdraw(drive, dry_run):
        world.gh.ready.discard((3, three))                     # after the sync that kept it on `next`
        return real(drive, dry_run)

    monkeypatch.setattr(h.d, "_stack_lean", withdraw)
    assert h.tick().endswith("landed #2 on the low-risk lane"), world.logs
    assert _skipped(world) == [f"research queue drive: low-risk lane skipped #1 (held by reviewer (wait)), "
                               f"#3 (no ready mark at {three[:8]})"]


def _carried(world: World) -> list[str]:
    return [x for x in world.logs if "(the low-risk lane's), and trees that differ in no file `lowrisk_excludes` names" in x]


def _lean(h: Review) -> dict:
    return h.d.q.load_state()["drive"]["lean"]


def test_a_running_lean_check_moves_across_a_low_risk_landing_and_lands_there(world, monkeypatch):
    """#2 lands off `next` under the running Lean check of #1: `next` is rebuilt on `checked` and the check holds #1's new
    commit, whose tree differs from the one it checks by #2's file alone, so it isn't cancelled or launched again."""
    h = _lane(world, monkeypatch)
    world.gh.put(1, world.change({"pkg/T.lean": "theorem T : True := trivial\n"}))
    h.review(1)
    h.tick()
    one = _tip(world)
    assert [c for c, *_ in h.launched] == [one], world.logs
    world.gh.put(2, world.change({"x.txt": "2\n"}))
    assert h.tick().endswith("landed #2 on the low-risk lane"), world.logs
    assert _subject(world, "checked") == "Queue: #2 change 2" and world.on_next(h.q) == [1]
    new = _tip(world)
    assert _git(world.origin, "rev-parse", f"{new}^1") == _checked(world)
    (rid,) = h.lean_ids()
    assert _carried(world) == [f"research queue drive: the Lean check {rid} of {one[:12]} (running) holds {new[:12]} of `next` "
                               f"rebuilt on `checked` {_checked(world)[:12]}: the same PRs up to #1 at the same heads less #2 (the "
                               "low-risk lane's), and trees that differ in no file `lowrisk_excludes` names"]
    rec = _lean(h)[new]
    assert list(_lean(h)) == [new] and rec["members"] == [[1, world.gh.prs[1].head]] and rec["rekeyed_from"] == one
    assert not any("low-risk lane waits" in x for x in world.logs)
    h.tick()
    assert h.cancelled == [] and len(h.launched) == 1 and list(_lean(h)) == [new], world.logs
    h.run_state[rid] = ("done", 0, None)
    h.evidence = [_steps_run(world.tmp, rid, {LEAN_STEP: "passed"})]
    assert h.tick().startswith("landed #1"), world.logs
    assert _checked(world) == new and len(h.launched) == 1


def test_a_passed_lean_check_awaiting_its_verdict_moves_too_and_the_lane_doesnt_wait(world, monkeypatch):
    h = _lane(world, monkeypatch)
    world.gh.put(1, world.change({"pkg/T.lean": "theorem T : True := trivial\n"}))
    h.tick()
    one = _tip(world)
    h.d.hand_lean(one, "ci")                                    # drive's own record: it moves
    (rid,) = h.lean_ids()
    h.run_state[rid] = ("done", 0, None)
    h.evidence = [_steps_run(world.tmp, rid, {LEAN_STEP: "passed"})]
    world.gh.put(2, world.change({"x.txt": "2\n"}))
    assert h.tick().endswith("landed #2 on the low-risk lane"), world.logs
    new = _tip(world)
    assert len(_carried(world)) == 1 and _lean(h)[new]["state"] == "passed" and list(_lean(h)) == [new], world.logs
    h.review(1)
    assert h.tick().startswith("landed #1"), world.logs
    assert _checked(world) == new and len(h.launched) == 1


def test_a_lean_check_isnt_moved_across_a_change_lowrisk_excludes_names_and_the_lane_waits(world, monkeypatch):
    """(b): `checked` moved within the tick by a verifier's file (`verity/core/`), so #1's commit rebuilt on the lane's
    landing differs from the one its check runs on by more than the lane's change."""
    h = _lane(world, monkeypatch)
    world.gh.put(1, world.change({"pkg/T.lean": "theorem T : True := trivial\n"}))
    h.review(1)
    h.tick()
    one = _tip(world)
    world.gh.put(2, world.change({"x.txt": "2\n"}))
    real, moved = h.d._stack_lean, []

    def move(drive, dry_run):
        _git(world.dev, "push", "-q", "origin",
             f"{world.change({'verity/core/v.py': 'v = 1\n'}, base='origin/checked')}:refs/heads/checked")
        h.q.fetch()
        moved.append(_checked(world))
        return real(drive, dry_run)

    monkeypatch.setattr(h.d, "_stack_lean", move)
    h.tick()
    assert _checked(world) == moved[0] and not _landed(world) and not _carried(world), world.logs
    assert list(_lean(h)) == [one] and _git(world.origin, "rev-parse", "next^1") == one
    (line,) = [x for x in world.logs if "low-risk lane waits" in x]
    assert line.startswith(f"research queue drive: low-risk lane waits: a landing off `next` rebuilds it, and (b) can't be "
                           f"shown for the Lean check {h.lean_ids()[0]} of {one[:12]}: its tree and that of "), line
    assert line.endswith("differ in verity/core/v.py, which `lowrisk_excludes` names"), line


def test_the_lane_waits_while_a_lean_check_drive_didnt_launch_runs(world, monkeypatch):
    """A hand check's run is of the commit it runs on, which a landing off `next` takes off it: (a) can't be shown for it."""
    h = _lane(world, monkeypatch)
    h.d.lowrisk_lane = False
    world.gh.put(1, world.change({"x.txt": "1\n"}))
    h.tick()
    tip = _git(world.origin, "rev-parse", "next")
    h.hand[tip] = ["r-hand"]                                    # ci's hand Lean check of `next`'s tip
    h.run_state["r-hand"] = ("running", None, None)
    h.d.lowrisk_lane = True
    checked = _checked(world)
    h.tick()
    assert _checked(world) == checked and not _landed(world), world.logs
    assert f"research queue drive: low-risk lane waits: a landing off `next` rebuilds it, and the Lean check of {tip[:12]}, " \
           "which drive didn't launch, runs, and its run is of that commit" in world.logs


def test_the_lane_never_lands_on_main(world, monkeypatch):
    h = _lane(world, monkeypatch, land_into="main")
    main = _main(world)
    world.gh.put(1, world.change({"x.txt": "1\n"}))
    h.tick()
    assert _main(world) == main and not _landed(world)


#: a fix of red `suite pkg`, by its body (`Driver._fixes`)
FIX_BODY = "Lane `lane-{n}`. Fixes suite `pkg`."


def _red(h: Review, key: str = "suite pkg") -> None:
    """``key`` red on `checked` with no culprit named, so nothing reverts it (`Driver._red_clock`)."""
    state = h.q.load_state()
    pl = state["drive"]["postland"]
    pl["red"] = {key: {"tip": pl["verified"], "ids": ["r-red"], "first": "x", "culprit": None}}
    h.q.save_state(state)


def _fixes_only(world: World) -> list[str]:
    return [x for x in world.logs if "each a fix of a red on `checked`, without rebuilding `next`" in x]


def test_a_fix_of_a_red_lands_while_a_lean_check_cant_move_and_the_next_after_landing_run_holds_it(world, monkeypatch):
    """A hand Lean check of #2 runs, so no Lean check moves across a low-risk landing (`_keep_lean`) and the lane waits; #3,
    a fix of red `suite pkg` above every check's prefix, lands anyway, onto `checked` with `next` left as it is, and the
    after-landing run checks it.  #2, low-risk but no fix, waits.  `next` stays on its base while the checks run; once they
    end it is rebuilt without #3, and drive's passed check of #1 moves with #1 across #3's file (`_rekey_lean`)."""
    h = _lane(world, monkeypatch, nonlean_first=False)
    h.d.lowrisk_lane = False
    world.gh.put(1, world.change({"pkg/T.lean": "theorem T : True := trivial\n"}))
    world.gh.put(2, world.change({"x.txt": "2\n"}))
    world.gh.put(3, world.change({"pkg/tests/test_x.py": "def test_y():\n    pass\n"}), body=FIX_BODY.format(n=3))
    h.review(1)
    h.tick()
    one, two, _ = (m.commit for m in h.q.chain())
    assert [c for c, *_ in h.launched] == [one], world.logs
    h.hand[two] = ["r-hand"]
    h.run_state["r-hand"] = ("running", None, None)
    _red(h)
    h.d.lowrisk_lane = True
    checked, nxt = _checked(world), _tip(world)
    assert h.tick().endswith("landed #3 on the low-risk lane"), world.logs
    tip = _checked(world)
    assert _subject(world, "checked") == "Queue: #3 change 3" and _git(world.origin, "rev-parse", "checked^1") == checked
    assert _tip(world) == nxt and _landed(world) == [f"research queue drive: landed #3 on `checked` at {tip[:12]} {TAG}"]
    assert any("low-risk lane waits" in x for x in world.logs) and len(_fixes_only(world)) == 1, world.logs
    assert h.posted[-1][0] == tip and "pkg/tests/test_x.py" in _git(world.origin, "ls-tree", "-r", "--name-only", tip)
    h.tick()
    assert _tip(world) == nxt and _checked(world) == tip and h.cancelled == [], world.logs
    (rid,) = [r for r in h.lean_ids() if r != "r-hand"]
    h.run_state.update({rid: ("done", 0, None), "r-hand": ("done", 0, None)})
    h.evidence = [_steps_run(world.tmp, rid, {LEAN_STEP: "passed"})]
    assert h.tick().startswith("landed #1"), world.logs
    assert len(h.launched) == 1 and h.cancelled == []
    assert any(f"the Lean check {rid} of {one[:12]} holds " in x and x.endswith(
        "trees that differ in no file `lowrisk_excludes` names (pkg/tests/test_x.py)") for x in world.logs), world.logs
    assert "Queue: #1 change 1" in _git(world.origin, "log", "--format=%s", "checked")


@pytest.mark.parametrize("excludes", ["drive.toml's", "without *.lean"])
def test_a_fix_whose_merge_changes_lean_doesnt_land_while_a_lean_check_cant_move(world, monkeypatch, excludes):
    """drive.toml's `lowrisk_excludes` keep a change to Lean off the lane; with `*.lean` missing from them, the lane's rule for
    fixes refuses it by name: a Lean check of `next` reads it."""
    h = _lane(world, monkeypatch)
    if excludes != "drive.toml's":
        h.d.lowrisk_excludes = tuple(x for x in EXCLUDES if x != "*.lean")
    h.d.lowrisk_lane = False
    world.gh.put(1, world.change({"verity/core/v.py": "1\n"}))
    world.gh.put(2, world.change({"pkg/U.lean": "theorem U : True := trivial\n"}), body=FIX_BODY.format(n=2))
    h.tick()
    h.hand[h.q.chain()[0].commit] = ["r-hand"]
    h.run_state["r-hand"] = ("running", None, None)
    _red(h)
    h.d.lowrisk_lane = True
    checked = _checked(world)
    h.tick()
    assert _checked(world) == checked and not _landed(world) and not _fixes_only(world), world.logs
    refused = [x for x in world.logs if "low-risk lane (fixes of reds only) skipped" in x]
    if excludes == "drive.toml's":
        assert refused == [] and not any("low-risk lane waits" in x for x in world.logs), world.logs
    else:
        assert refused == ["research queue drive: low-risk lane (fixes of reds only) skipped #2 (a fix of suite pkg, but its "
                           "merge changes what a Lean check reads: pkg/U.lean)"], world.logs


def test_the_after_landing_run_waits_for_a_fresh_low_risk_fix_of_a_red_and_launches_fix_wait_s_after_its_mark(world, monkeypatch):
    """#1 lands on review; #2, a fix of red `suite pkg` marked just now, lies in a running Lean check's prefix, so the lane
    doesn't land it yet: the after-landing run of #1 waits for it, and launches `FIX_WAIT_S` after #2's mark without it."""
    h = _lane(world, monkeypatch)
    h.d.lowrisk_lane = False
    world.gh.put(1, world.change({"x.txt": "1\n"}))
    world.gh.put(2, two := world.change({"pkg/tests/test_x.py": "def test_y():\n    pass\n"}), body=FIX_BODY.format(n=2))
    h.tick()
    h.hand[h.q.chain()[1].commit] = ["r-hand"]
    h.run_state["r-hand"] = ("running", None, None)
    _red(h)
    marked = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(h.clock))
    h.q.marked_at = lambda n, head: marked if (n, head) == (2, two) else None
    h.review(1)
    h.d.lowrisk_lane = True
    assert h.tick().startswith("landed #1"), world.logs
    tip = _checked(world)
    assert h.posted == [] and not _landed(world), world.logs
    assert f"research queue drive: the after-landing run of `checked` {tip[:12]} waits: #2 at {two[:8]}, a low-risk fix of " \
           f"suite pkg marked 0 min ago, isn't landed yet: it launches once that lands, or {FIX_WAIT_S // 60} min after its " \
           "mark" in world.logs, world.logs
    h.clock += FIX_WAIT_S
    h.tick()
    assert [c for c, *_ in h.posted] == [tip] and _checked(world) == tip, world.logs
