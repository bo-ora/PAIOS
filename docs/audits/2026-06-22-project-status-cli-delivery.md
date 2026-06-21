# Project Status CLI Delivery Audit

Date: 2026-06-22
Scope: Phase 0 Project Status CLI delivery cycle

## Expected Behavior

The delivery cycle should move an approved product change through a detailed
plan, strict RED–GREEN implementation, automated verification, current
documentation, independent review, and a resumable closeout. The resulting CLI
must remain read-only, deterministic, offline, portable, and free of runtime
npm dependencies.

## Observed Behavior

The implementation followed two initial RED–GREEN cycles: status derivation
tests failed because production modules were absent, then CLI behavior tests
failed because the formatter, entry point, and wrapper were absent. Real
repository acceptance use exposed wrapped Markdown truncation, which received a
failing regression test before the parser fix.

An independent read-only review identified a Python runtime dependency,
malformed-row gaps, missing read-only acceptance coverage, and possible absolute
path disclosure. Each finding received a focused fix and regression coverage.
A second review found empty-cell handling, which was also corrected test-first.
The final review reported no remaining critical, high, or material findings.

## Effective Patterns

- Approved requirements and ADRs were converted into one executable plan before
  production code changed.
- Disposable Git repositories made Git and Markdown behavior testable without
  mutating the working repository.
- Running the CLI against the real repository found wrapped-list behavior that
  simplified fixtures had not exposed.
- Independent review materially improved portability, malformed-input handling,
  privacy, and acceptance evidence.
- Before/after Git-status and tracked-file hashes provided direct read-only
  evidence for both output modes.

## Failures and Deviations

- The first verification run exposed a pre-existing Python 3.9 incompatibility
  in `scripts/capture_codex_session.py`; the existing test was RED before the
  minimal `timezone.utc` compatibility fix.
- The first implementation delegated knowledge validation to Python even though
  Phase 0 portability requires only Git, Node.js, and npm for the CLI. The final
  implementation performs equivalent checks natively in Node.
- Initial list parsing treated wrapped Markdown lines as separate or truncated
  content. Real-repository acceptance use caught the issue before commit.
- Exact session token metrics are unavailable because this interactive session
  was not launched through the capture utility.

## Root Causes

- The architecture requirement allowed invoking the Python validator, while the
  broader Phase 0 portability requirement was stricter. The initial plan did
  not resolve that tension in favor of portability.
- Initial fixtures represented one-line Markdown and did not capture the
  repository's normal wrapped formatting.
- Missing and malformed-document coverage initially emphasized absent files and
  active-phase counts rather than every malformed row shape.

## Improvements

- Keep the native Node validator aligned with
  `scripts/validate_repository.py`; add parity tests if either validator gains
  new rules.
- Include wrapped Markdown, empty cells, short rows, and missing sections in
  parser fixtures from the start.
- Run real-repository smoke checks immediately after the first GREEN integration
  build, before documentation and final verification.
- Reassess TD-003 now that stable executable validation commands exist.

## Token Efficiency

Targeted reads and one independent reviewer kept exploration bounded. The main
avoidable work was the first Python-backed validation implementation and the
extra review cycle it caused. Explicitly reconciling portability requirements
with permissive ADR language during plan review would have avoided that branch.
