import json
import tempfile
import unittest
from pathlib import Path

from scripts.validate_repository import validate_repository


class ValidateRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "docs/architecture/decisions").mkdir(parents=True)
        (self.root / "docs/sessions").mkdir(parents=True)
        (self.root / "docs/audits").mkdir(parents=True)
        (self.root / "evals/codex/scenarios").mkdir(parents=True)

        (self.root / "docs/architecture/decisions/0001-test.md").write_text(
            "# ADR-0001: Test\n\n"
            "Status: Proposed\nDate: 2026-06-21\n\n"
            "## Context\nx\n## Decision\nx\n## Alternatives Considered\nx\n"
            "## Consequences\nx\n## Validation\nx\n",
            encoding="utf-8",
        )
        (self.root / "docs/sessions/2026-06-21-1200-research-test.md").write_text(
            "# Session: Research — Test\n\nDate: 2026-06-21\n"
            "Role: research\nStatus: completed\n\n"
            "## Objective\nx\n## Outcome\nx\n## Artifacts\nx\n## Decisions\nx\n"
            "## Verification\nx\n## Blockers and Open Questions\nx\n"
            "## Process Audit\nx\n## Follow-up\nx\n",
            encoding="utf-8",
        )
        scenario = {
            "id": "test-001",
            "version": 1,
            "capability": "test",
            "purpose": "test",
            "prompt": "test",
            "fixture": {},
            "environment": {},
            "assertions": ["test"],
            "prohibited": ["test"],
            "scoring": {"pass": "test", "repeat_runs": 1},
        }
        (self.root / "evals/codex/scenarios/test.json").write_text(
            json.dumps(scenario), encoding="utf-8"
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_valid_repository_has_no_errors(self) -> None:
        self.assertEqual(validate_repository(self.root), [])

    def test_missing_required_markdown_heading_is_reported(self) -> None:
        path = self.root / "docs/architecture/decisions/0001-test.md"
        path.write_text("# ADR-0001: Test\n\n## Context\nx\n", encoding="utf-8")

        errors = validate_repository(self.root)

        self.assertTrue(any("## Decision" in error for error in errors))

    def test_invalid_scenario_json_is_reported(self) -> None:
        path = self.root / "evals/codex/scenarios/test.json"
        path.write_text("{not-json", encoding="utf-8")

        errors = validate_repository(self.root)

        self.assertTrue(any("invalid JSON" in error for error in errors))

    def test_tracked_raw_session_path_is_rejected(self) -> None:
        tracked = [".local/paios-sessions/session.jsonl"]

        errors = validate_repository(self.root, tracked_files=tracked)

        self.assertTrue(any("raw session file is tracked" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
