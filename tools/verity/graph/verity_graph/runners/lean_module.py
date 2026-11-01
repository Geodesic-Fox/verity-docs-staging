"""lean-module's runner: compile one module in its work directory, its imports' artifacts there (`families/lean_module.py`
says where), kernel-replay it, and write its axioms summary. Until it is written every such task is an error, which no
executor takes for a result."""
from __future__ import annotations

from pathlib import Path


def run(task: dict, work: Path) -> dict:
    return {"status": "error", "detail": {"error": "the lean-module runner isn't written yet"}}
