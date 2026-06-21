import json
import tempfile
import unittest
from pathlib import Path

from scripts.capture_codex_session import (
    build_codex_command,
    build_session_paths,
    extract_metrics,
    sanitize_session_name,
)


class CaptureCodexSessionTests(unittest.TestCase):
    def test_session_name_is_safe_and_stable(self) -> None:
        self.assertEqual(
            sanitize_session_name("Architecture Review: Phase 0"),
            "architecture-review-phase-0",
        )

    def test_empty_session_name_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            sanitize_session_name(" !!! ")

    def test_paths_remain_under_local_session_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            paths = build_session_paths(root, "Research Run", timestamp="20260621T120000Z")

            expected = (
                root.resolve()
                / ".local/paios-sessions/20260621T120000Z-research-run"
            )
            self.assertEqual(paths.directory, expected)
            self.assertEqual(paths.events, expected / "events.jsonl")
            self.assertEqual(paths.final_message, expected / "final.md")
            self.assertEqual(paths.metrics, expected / "metrics.json")

    def test_metrics_count_events_tools_and_usage(self) -> None:
        events = [
            {"type": "thread.started", "thread_id": "thread-1"},
            {
                "type": "item.completed",
                "item": {"type": "command_execution", "command": "git status"},
            },
            {
                "type": "item.completed",
                "item": {"type": "agent_message", "text": "Done"},
            },
            {
                "type": "turn.completed",
                "usage": {
                    "input_tokens": 100,
                    "cached_input_tokens": 60,
                    "output_tokens": 20,
                },
            },
        ]

        metrics = extract_metrics(events)

        self.assertEqual(metrics["thread_id"], "thread-1")
        self.assertEqual(metrics["event_count"], 4)
        self.assertEqual(metrics["tool_counts"], {"command_execution": 1})
        self.assertEqual(metrics["usage"]["input_tokens"], 100)
        self.assertEqual(metrics["final_message"], "Done")

    def test_metrics_ignore_malformed_json_lines(self) -> None:
        lines = ['{"type":"thread.started","thread_id":"x"}', "not-json"]
        events = []
        for line in lines:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue

        metrics = extract_metrics(events)

        self.assertEqual(metrics["event_count"], 1)

    def test_codex_global_options_precede_exec_subcommand(self) -> None:
        command = build_codex_command(
            "inspect repository", sandbox="read-only", ephemeral=True
        )

        self.assertEqual(
            command,
            [
                "codex",
                "--ask-for-approval",
                "never",
                "exec",
                "--json",
                "--sandbox",
                "read-only",
                "--ephemeral",
                "inspect repository",
            ],
        )


if __name__ == "__main__":
    unittest.main()
