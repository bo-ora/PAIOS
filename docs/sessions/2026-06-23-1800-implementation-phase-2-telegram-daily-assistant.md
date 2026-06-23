# Session: Implementation — Phase 2 Telegram Daily Assistant

Date: 2026-06-23
Role: implementation (with the preceding architecture and planning steps)
Status: completed

## Objective

Implement Phase 2 (Telegram Daily Assistant) end to end from the approved
requirements (`docs/requirements/phase-2-telegram-daily-assistant.md`): record
the open architecture defaults as ADRs, write an execution plan, then build the
feature with TDD in independently committable chunks, satisfying the definition
of done and the acceptance criteria, and close the session.

## Outcome

Phase 2 is implemented and the roadmap marks it `completed`. From an authorized
Telegram workspace the assistant captures text, voice, and document inputs into
the existing Phase 1 local store (with Telegram provenance), transcribes voice
locally, answers natural-language questions from retrieved local records with
inline citations produced by a local model, and reports rather than fabricates
when no source matches. Telegram sits behind a `MessagingProvider` interface and
answer synthesis behind an `AnswerSynthesisProvider` interface; both are faked
in tests. The long-poll cursor is acknowledged only after a reply is sent
(commit-before-ack), so a crash re-delivers rather than drops. No state-changing
command path exists. 14 commits, all on `master` and pushed.

## Artifacts

Architecture and plan:
- `docs/architecture/decisions/0005-phase-2-telegram-messaging.md` (`35c7cce`)
- `docs/architecture/decisions/0006-phase-2-local-answer-synthesis.md` (`35c7cce`)
- `docs/plans/2026-06-23-phase-2-telegram-daily-assistant.md` (`59336ef`)

Implementation (new `src/paios/telegram/` and `src/paios/synthesis/` layers on
unchanged Phase 1 storage/transcription/search):
- `src/paios/knowledge/records.ts` — optional `CaptureProvenance` + persisted
  `external_reference_json` (`22983ea`)
- `src/paios/telegram/messaging.ts`, `intent.ts` (`8c587e7`)
- `src/paios/telegram/config.ts` (`99318d4`)
- `src/paios/http-fetch.ts`, `src/paios/telegram/cursor-store.ts`,
  `telegram-provider.ts` (`00c41db`)
- `src/paios/synthesis/provider.ts` (`df44e93`),
  `src/paios/synthesis/ollama-provider.ts` (`e42bf57`)
- `src/paios/telegram/ask.ts` (`c00ae74`), `capture.ts` (`0c09779`),
  `assistant.ts` (`bb44b0f`), `doctor.ts` + `src/paios/cli.ts` routing
  (`de5315d`)
- `tests/paios/telegram.test.ts`, `tests/paios/synthesis.test.ts`,
  `tests/paios/cli.test.ts`, `tests/paios/knowledge.test.ts`
- Retrieval/grounding refinement + run docs (`63c2b8f`)
- `docs/operations/development-environment.md`, `docs/ROADMAP.md`
  (`63c2b8f`, `f0d971a`)

## Decisions

Reversible architecture defaults recorded without an approval pause, within the
approved product boundary (authority: the two ADRs above):

1. Telegram client uses Node's built-in `fetch` (no third-party library),
   preserving the zero-runtime-dependency posture; replaceable behind
   `MessagingProvider` (ADR-0005).
2. Long-poll cursor persisted under `.local`; acknowledge only after a reply
   (commit-before-ack) for at-least-once delivery (ADR-0005).
3. Answer synthesis via local Ollama over its HTTP API; default model
   `llama3.1:8b`, overridable by `PAIOS_SYNTHESIS_MODEL`, never pulled
   implicitly; replaceable behind `AnswerSynthesisProvider` (ADR-0006).
4. Retrieval reuses Phase 1 lexical search; a natural-language question is
   converted to a stopword-filtered FTS5 OR query; empty retrieval returns
   no-sources without calling the model (ADR-0006).

## Verification

Full definition-of-done gate, run with Node 24 (`~/.nvm/versions/node/v24.17.0`)
after every chunk and at the end:

- `npm run lint` → "ESLint: No issues found"
- `npm run typecheck` → passes
- `npm test` → tests 123, pass 123, fail 0 (both provider boundaries faked; no
  live network or live model in the suite)
- `npm run build` → succeeds
- `python3 scripts/validate_repository.py .` → "Repository knowledge validation
  passed."
- `git diff --check` → clean

Live local smoke tests (local-only, no Telegram network, no personal data
committed):
- `./paios telegram doctor` with real `.local/secrets.env` → "Assistant: ready"
  (token configured, allowlist 1, Ollama reachable, `llama3.1:8b` present),
  exit 0.
- A disposable-data-root answer test against the real Ollama model: a seeded
  note was answered with the correct value and an inline `[record-id]` citation;
  an unrelated question returned `no-sources`. (This drove the `63c2b8f`
  refinement.)

Independent review (subagent, read-only) of the implementation diff against the
acceptance criteria found **no critical or high** privacy, data-loss,
authorization, or correctness issues; LOW notes (at-least-once double-reply,
ask retrieval not workspace-scoped) are acceptable within the approved Phase 2
boundary.

## Blockers and Open Questions

- `./paios status` reports `warnings: ["Malformed docs/ROADMAP.md: no current
  phase found"]`. This is **pre-existing** (verified by stashing the roadmap
  edit: HEAD already warned because the CLI counts only
  in-progress/blocked/refining/approved as "current", and Phase 2 was
  `proposed`). It now reflects that no actionable phase is open until Phase 3 is
  approved. Not introduced by this session; candidate tech-debt/ADR follow-up,
  not a Phase 2 defect.
- The live Telegram bot token was shared in chat history in a prior session;
  rotating it via BotFather `/token` remains advisable.
- `serve` runs an unbounded long-poll loop and was not exercised end to end
  against the live Telegram API in-session (only its config-refusal path is
  tested); a manual end-to-end chat smoke test is the recommended next check.

## Process Audit

- Strength: strict RED→GREEN TDD on every chunk; each chunk passed the full DoD
  gate before commit, keeping `master` green and progress resumable.
- Strength: the live local-model smoke test caught two real quality issues
  (stopword over-matching; model refusing the user's own data) that the unit
  suite could not, and both were fixed with new tests before completion.
- Strength: kept the existing zero-runtime-dependency posture by using built-in
  `fetch` for both adapters; reused Phase 1 storage/transcription/search with no
  duplication (only a small provenance extension).
- Minor friction: two lint-only failures (`prefer-optional-chain`,
  `no-unnecessary-type-assertion`) surfaced after green tests and required a
  follow-up edit before commit; running lint inside the per-chunk loop earlier
  would have caught them one step sooner.
- Minor rework: test helpers (`temporaryRoot`/`afterEach`) were added, removed
  to avoid an unused-symbol lint error in the chunk that did not yet use them,
  and re-added later — one extra edit cycle.
- Environment: the shell defaulted to Node 22; every command was prefixed to put
  Node 24 on `PATH`. No metrics from `scripts/capture_codex_session.py` were
  available (not a Codex-captured session).

## Follow-up

- Approve Phase 3 (Health Journal) requirements to set a new current phase and
  clear the "no current phase" status warning, or address the warning directly
  (decide whether `proposed`/`provisional` should count as current — an ADR or a
  small `markdown.ts` change with RED→GREEN).
- Run a manual end-to-end Telegram chat smoke test of `./paios telegram serve`
  (capture text/voice/document, ask, inspect) and record evidence.
- Consider rotating the Telegram bot token.
- See the Capability Harvest below for proposed durable promotions.

## Capability Harvest

Repository-local capability surfaces inventoried: skills
(`.agents/skills/paios-project-workflow`, `paios-session-close`), repository
scripts (`scripts/validate_repository.py`, `scripts/bootstrap.sh`,
`scripts/capture_codex_session.py`), evals (`evals/codex/`). No hooks, custom
agents, or prompts beyond these.

Tools/accesses introduced this session: **none new** — Ollama and the Telegram
token/allowlist were already provisioned and recorded
(`docs/operations/credentials.md`, `Brewfile`, `development-environment.md`);
this session only documented the run workflow and the chosen model, already
captured in ADR-0006 and the dev-environment doc.

| Item | Target | Action | Session evidence |
| --- | --- | --- | --- |
| Built-in `fetch` behind a `FetchLike` boundary as the default for external HTTP adapters (no runtime deps) | (none — implementation pattern, recorded in ADR-0005/0006) | Reject as a capability change | Used for both Telegram and Ollama adapters; already documented in the ADRs |
| Provider-interface + fake-boundary integration-test pattern | Existing TDD/definition-of-done discipline in `AGENTS.md` | Reject (already required) | All integration tests fake messaging and model boundaries |
| "Run a live local smoke test before declaring a model-dependent slice done" | (candidate `AGENTS.md` testing note) | Promote — propose, needs approval | The smoke test caught two issues the unit suite missed |
| `./paios status` "no current phase" when only completed/provisional phases exist | `src/paios/markdown.ts` or a roadmap-state ADR | Promote — propose, needs approval + RED→GREEN per `evals/codex/README.md` | Pre-existing warning confirmed; surfaced again at Phase 2 closeout |

No `docs/audits/` record created: no reusable process failure occurred, and the
two promote candidates are proposals requiring approval (and, for the CLI
change, the RED→GREEN protocol) before any capability edit.
