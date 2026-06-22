from __future__ import annotations

from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "lde.sh"


class LocalDevelopmentEnvironmentTests(unittest.TestCase):
    def test_well_configured_environment_has_no_required_failures(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bin_dir = Path(directory)
            self._write_required_commands(bin_dir, include_node=True)
            result = subprocess.run(
                [str(SCRIPT)],
                cwd=ROOT,
                env={"PATH": str(bin_dir)},
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Summary: 0 failure(s)", result.stdout)
        self.assertIn(
            "Details: docs/operations/development-environment.md",
            result.stdout,
        )

    def test_missing_node_is_a_failure_while_optional_tools_are_warnings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bin_dir = Path(directory)
            self._write_required_commands(bin_dir, include_node=False)

            result = subprocess.run(
                [str(SCRIPT)],
                cwd=ROOT,
                env={"PATH": str(bin_dir)},
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 1)
        self.assertIn("FAIL  Node.js is required", result.stdout)
        self.assertIn("WARN  Docker", result.stdout)
        self.assertIn("1 failure(s)", result.stdout)

    def _write_required_commands(
        self, bin_dir: Path, *, include_node: bool
    ) -> None:
        self._write_command(
            bin_dir / "uname",
            'if [ "$1" = "-s" ]; then echo TestOS; else echo x86_64; fi',
        )
        self._write_command(
            bin_dir / "git",
            'if [ "$1" = "config" ]; then echo configured; '
            'else echo "git version test"; fi',
        )
        if include_node:
            self._write_command(bin_dir / "node", 'echo "v24.0.0"')
        self._write_command(bin_dir / "npm", 'echo "11.0.0"')
        self._write_command(
            bin_dir / "python3",
            'if [ "$1" = "--version" ]; then echo "Python 3.9.0"; '
            'else exit 0; fi',
        )

    @staticmethod
    def _write_command(path: Path, body: str) -> None:
        path.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)


if __name__ == "__main__":
    unittest.main()
