#!/usr/bin/env python3
"""Run a Codex session and keep raw JSONL evidence outside Git."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class SessionPaths:
    directory: Path
    events: Path
    final_message: Path
    metrics: Path


def sanitize_session_name(value: str) -> str:
    safe = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not safe:
        raise ValueError("session name must contain a letter or number")
    return safe


def build_session_paths(
    root: Path, name: str, timestamp: str | None = None
) -> SessionPaths:
    stamp = timestamp or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    directory = root.resolve() / ".local/paios-sessions" / (
        f"{stamp}-{sanitize_session_name(name)}"
    )
    return SessionPaths(
        directory=directory,
        events=directory / "events.jsonl",
        final_message=directory / "final.md",
        metrics=directory / "metrics.json",
    )


def extract_metrics(events: Iterable[dict]) -> dict:
    event_list = list(events)
    tool_counts: Counter[str] = Counter()
    thread_id = None
    usage: dict = {}
    final_message = ""
    for event in event_list:
        if event.get("type") == "thread.started":
            thread_id = event.get("thread_id")
        item = event.get("item")
        if isinstance(item, dict) and event.get("type") == "item.completed":
            item_type = item.get("type")
            if item_type == "agent_message":
                final_message = item.get("text", final_message)
            elif item_type:
                tool_counts[item_type] += 1
        if event.get("type") == "turn.completed" and isinstance(
            event.get("usage"), dict
        ):
            usage = event["usage"]
    return {
        "thread_id": thread_id,
        "event_count": len(event_list),
        "tool_counts": dict(sorted(tool_counts.items())),
        "usage": usage,
        "final_message": final_message,
    }


def build_codex_command(
    prompt: str, sandbox: str = "read-only", ephemeral: bool = True
) -> list[str]:
    command = [
        "codex",
        "--ask-for-approval",
        "never",
        "exec",
        "--json",
        "--sandbox",
        sandbox,
    ]
    if ephemeral:
        command.append("--ephemeral")
    command.append(prompt)
    return command


def run_session(
    root: Path,
    name: str,
    prompt: str,
    sandbox: str = "read-only",
    ephemeral: bool = True,
) -> tuple[int, SessionPaths]:
    paths = build_session_paths(root, name)
    paths.directory.mkdir(parents=True, exist_ok=False)
    command = build_codex_command(prompt, sandbox=sandbox, ephemeral=ephemeral)

    process = subprocess.Popen(
        command,
        cwd=root,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
    )
    events: list[dict] = []
    assert process.stdout is not None
    with paths.events.open("w", encoding="utf-8") as output:
        for line in process.stdout:
            output.write(line)
            output.flush()
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            events.append(event)
            if event.get("type") == "item.completed":
                item = event.get("item", {})
                if item.get("type") == "agent_message":
                    print(item.get("text", ""))
    return_code = process.wait()
    metrics = extract_metrics(events)
    paths.final_message.write_text(
        metrics["final_message"].rstrip() + "\n", encoding="utf-8"
    )
    paths.metrics.write_text(
        json.dumps(
            {
                "session_name": name,
                "sandbox": sandbox,
                "exit_code": return_code,
                **metrics,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return return_code, paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", help="Short label used in the local directory name")
    parser.add_argument("prompt", help="Prompt sent to codex exec")
    parser.add_argument(
        "--root", type=Path, default=Path.cwd(), help="Git repository root"
    )
    parser.add_argument(
        "--sandbox",
        choices=["read-only", "workspace-write", "danger-full-access"],
        default="read-only",
    )
    parser.add_argument(
        "--persist-session",
        action="store_true",
        help="Allow Codex to retain its normal session rollout in addition to local capture",
    )
    args = parser.parse_args()
    try:
        return_code, paths = run_session(
            args.root,
            args.name,
            args.prompt,
            sandbox=args.sandbox,
            ephemeral=not args.persist_session,
        )
    except ValueError as exc:
        parser.error(str(exc))
    print(f"Raw events: {paths.events}", file=sys.stderr)
    print(f"Metrics: {paths.metrics}", file=sys.stderr)
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
