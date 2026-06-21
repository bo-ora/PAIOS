#!/usr/bin/env python3
"""Validate PAIOS knowledge artifacts without external dependencies."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Iterable


REQUIRED_SCENARIO_KEYS = {
    "id",
    "version",
    "capability",
    "purpose",
    "prompt",
    "fixture",
    "environment",
    "assertions",
    "prohibited",
    "scoring",
}

MARKDOWN_RULES = {
    "docs/architecture/decisions": [
        "## Context",
        "## Decision",
        "## Alternatives Considered",
        "## Consequences",
        "## Validation",
    ],
    "docs/sessions": [
        "## Objective",
        "## Outcome",
        "## Artifacts",
        "## Decisions",
        "## Verification",
        "## Blockers and Open Questions",
        "## Process Audit",
        "## Follow-up",
    ],
    "docs/audits": [
        "## Expected Behavior",
        "## Observed Behavior",
        "## Effective Patterns",
        "## Failures and Deviations",
        "## Root Causes",
        "## Improvements",
        "## Token Efficiency",
    ],
}


def _tracked_files(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []
    return [line for line in result.stdout.splitlines() if line]


def _validate_markdown(root: Path) -> list[str]:
    errors: list[str] = []
    for directory, headings in MARKDOWN_RULES.items():
        base = root / directory
        if not base.exists():
            continue
        for path in sorted(base.glob("*.md")):
            content = path.read_text(encoding="utf-8")
            for heading in headings:
                if heading not in content:
                    errors.append(f"{path.relative_to(root)}: missing {heading}")
    return errors


def _validate_scenarios(root: Path) -> list[str]:
    errors: list[str] = []
    base = root / "evals/codex/scenarios"
    if not base.exists():
        return errors
    for path in sorted(base.glob("*.json")):
        relative = path.relative_to(root)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{relative}: invalid JSON: {exc.msg}")
            continue
        missing = sorted(REQUIRED_SCENARIO_KEYS - set(data))
        if missing:
            errors.append(f"{relative}: missing keys: {', '.join(missing)}")
        if not isinstance(data.get("assertions"), list) or not data.get("assertions"):
            errors.append(f"{relative}: assertions must be a non-empty list")
        if not isinstance(data.get("prohibited"), list):
            errors.append(f"{relative}: prohibited must be a list")
    return errors


def _validate_tracked_files(tracked_files: Iterable[str]) -> list[str]:
    return [
        f"{path}: raw session file is tracked"
        for path in tracked_files
        if path == ".local/paios-sessions"
        or path.startswith(".local/paios-sessions/")
    ]


def validate_repository(
    root: Path, tracked_files: Iterable[str] | None = None
) -> list[str]:
    root = root.resolve()
    tracked = list(tracked_files) if tracked_files is not None else _tracked_files(root)
    return [
        *_validate_markdown(root),
        *_validate_scenarios(root),
        *_validate_tracked_files(tracked),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".", type=Path)
    args = parser.parse_args()
    errors = validate_repository(args.root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Repository knowledge validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
