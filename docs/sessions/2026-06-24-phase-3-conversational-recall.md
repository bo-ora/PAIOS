# Session: Testing/Implementation — Phase 3 Conversational Recall completion

Date: 2026-06-24
Role: testing (with review-driven fixes and closeout)
Status: completed

## Objective

Finish Phase 3 ("Conversational Recall") to completion: independent code review
of the implemented range with test-first fixes, the mandatory live local smoke
tests (voice tier A/B + Ollama multi-turn), recorded evidence, and roadmap
closeout. Capabilities A–D were already implemented TDD-style and committed; the
remaining work was Verification (plan V1–V3) and the close. Done criteria: full
faked gate green on Node 24, all Critical/Important review findings fixed,
live-validated voice tier chosen by the user, ROADMAP flipped to `completed`
with a dated roadmap/vision review.

## Outcome

- **Independent code review** (range `079c6ab~1..7295b55`) found **no Critical**
  issues, **one Important** (the assist `personalFactPattern` over-routed
  ordinary advice questions to grounded lookup), and three Minor items. All
  hard constraints (no personal-data egress; dialogue/mode/summary never
  persisted; grounded mode byte-for-byte Phase 2; callback allowlist enforced on
  both `chat.id` and `from.id`; leak-free logs; no new runtime dep) were
  verified met.
- **Two real defects found and fixed test-first** (one by the review, one by
  live smoke):
  1. `personalFactPattern` over-routing — narrowed to possessives, interrogative
     recall (`do/does/did I have/note/…`), first-person declarative recall, and
     `have/had I`; dropped advice modals and bare "I have/had". Fails safe
     (genuine recall still routes to grounded). Commit `a11b934`.
  2. **Summarize refusal** — clicking *Summarize* on the user's own voice note
     returned a model safety refusal ("cannot summarize … personal information
     … sensitive details"), defeating the product's purpose. Root cause: the
     summary prompt had no anti-refusal instruction and its heavy
     personal/private/sensitive framing primed llama3.1:8b's refusal reflex.
     Reframed as a neutral faithful text-condensation task; **live-verified**
     against Ollama (same record now summarizes, no refusal). Commit `9e499d3`.
- **Voice tier chosen by the user on live A/B evidence: `large-v3-turbo-q5_0`**
  (see Decisions + Verification). Updated ADR-0008, `.env.example`,
  `credentials.md`, and the live `.local/secrets.env`.
- Minor review findings recorded as TD-005/006/007 in `docs/TECH_DEBT.md`.

## Artifacts

- Code/tests: `src/paios/telegram/ask.ts` (heuristic), `src/paios/synthesis/provider.ts`
  (summary prompt), `tests/paios/telegram.test.ts`, `tests/paios/synthesis.test.ts`.
- Docs: `docs/architecture/decisions/0008-phase-3-conversational-surface.md`
  (Voice section resolved), `.env.example`, `docs/operations/credentials.md`,
  `docs/TECH_DEBT.md`, this session doc, `docs/ROADMAP.md`,
  `docs/reviews/2026-06-24-phase-3-roadmap-vision-review.md`.
- Commits: `a11b934` (heuristic fix + tech-debt), `9e499d3` (summarize fix),
  plus closeout commits for the tier docs, evidence, and roadmap flip.
- Models pulled (one-time, user-consented, into git-ignored `.local/models/`):
  `ggml-small.bin` (SHA-256 `1be3a9b2…ea987b`, matches the pinned harness value),
  `ggml-medium-q5_0.bin` (`19fea4b3…34220f`), `ggml-medium.bin` (`6c14d5ad…56208`),
  `ggml-large-v3-turbo-q5_0.bin` (`39422170…fa7e2`).

## Decisions

- **Voice tier = `large-v3-turbo-q5_0`** (authoritative: ADR-0008, Voice
  section). Chosen by the user from live A/B evidence on real Ukrainian voice
  notes. This supersedes the earlier "`small` default / `large-v3` ruled out"
  framing: that ruling was about plain large-v3's CPU *latency*, which the user
  explicitly relaxed (accuracy-first, longer processing acceptable); the turbo
  distill delivers near-large-v3 accuracy at ~2.9 s/note. Plain `large-v3`
  (non-turbo) stays unused.
- The summarize prompt must avoid foregrounding personal/private/sensitive
  framing (it primes refusals) while keeping the no-fabrication guarantee
  (ADR-0007).

## Verification

### V1 — Full faked-boundary gate (Node 24.17.0), after all fixes

- `npm run lint` → `ESLint: No issues found`.
- `npm run typecheck` → clean (the editor LSP `.at` warnings are a lib-target
  mismatch; project `tsc` passes).
- `npm test` → **166 tests, 166 pass, 0 fail** (was 163; +3 regression tests).
- `npm run build` → compiles (exit 0).
- `python3 scripts/validate_repository.py .` → "Repository knowledge validation passed."
- `git diff --check` → clean.
- (All test/build/lint runs pinned to Node v24.17.0; the default shell node is
  v22 and spuriously fails ~12 tests.)

### V2 — Live local smoke (mandatory per AGENTS.md)

**Voice A/B** — real CPU, whisper-cli + ffmpeg, language `auto`, same normalized
16 kHz mono PCM WAV per model. Sample 1: a real ~18.7 s Ukrainian voice note
(record `d09fd328`). Ground truth (user-supplied, punctuation/case ignored):
"Ось приклад аудіотранскрипту, який я хочу залишити на розпізнавання і для
тестування українською мовою. Я Борис, я українець, я живу з дружиною та
донькою двох років Зоряною, дружину звуть Ганна, в Ов'єдо, в Іспанії."

| Tier | Size | Latency | Accuracy notes |
| --- | --- | --- | --- |
| base | 147 MB | (cold) | Worst — `Українись`, `заріаную`, `таганна`, `вов'єдув і спанії`. |
| small | 488 MB | 1.9 s | Good; got `Зоряною` ✓ but `новою`/`звує`/town wrong. |
| medium-q5 | 514 MB | 3.3 s | Good; `звуть` ✓ but split name `з Оряною`, `новою`. |
| medium (full) | 1.46 GB | 3.9 s | Worse than turbo; `Україниць`, `з Оряною`, `новою`. |
| **large-v3-turbo-q5_0** | **547 MB** | **2.9 s** | **Best**: `мовою` ✓, `українець` ✓, `Зоряною` ✓, `звуть` ✓; only misses = two declension endings + foreign toponym `Oviedo` (no tier got it). |

Sample 2: ~9.0 s Ukrainian rhyme (record `718352aa`), ground truth ends
"…а ми українці, злізем по драбинці." Results: small ✗ (`зліземо потрабинці`),
medium-q5 ✗ (`по дробинці`), **turbo ✓** (`злізем по драбинці`, exact). Turbo
was consistently most accurate across both samples; size did not predict
accuracy (full medium < turbo).

**Ollama multi-turn (both modes)** — real Ollama (`llama3.1:8b`), prior session,
recorded as real evidence: grounded refusal holds on an unknown question; assist
general reply labelled `[assist]` with no personal fabrication; assist
personal-fact question answered only via grounded retrieval
(`[assist · grounded lookup]` + sources) or the no-source reply. That smoke
caught a real bug — imperative "me" in "give me…" misrouted to grounded lookup —
fixed with a regression test (commit `7295b55`).

**Summarize refusal (this session)** — live against Ollama (`llama3.1:8b`):
before the fix the summary of record `d09fd328` returned "I cannot summarize the
content of a personal audio recording…"; after the reframed prompt the same
record returns a faithful summary with no refusal.

**Live logging privacy** — the running `telegram serve` process logged only
`telegram message telegram:217578849 handled` (bounded workspace id + outcome) —
no message body, transcript, summary, or audio content. Real-world confirmation
of the leak-free-logs constraint.

## Blockers and Open Questions

- The foreign toponym *Oviedo* was transcribed imperfectly by every tier
  (turbo: `вов'єдов`). Inherent difficulty of foreign proper nouns in speech;
  plain `large-v3` was not pursued (latency) and is unlikely to fully resolve it.
- llama3.1:8b sometimes renders a Ukrainian summary in English despite the
  "same language" instruction — minor quality nuance, not a refusal; not chased.

## Process Audit

- First `serve` attempt used the wrong subcommand (`serve` vs `telegram serve`);
  corrected after one usage-error.
- The user fed audio via the live bot rather than a file path; this worked
  because `addAudio` persists raw source bytes before transcription, so the
  `.ogg` fixture is captured regardless of the bot's ingest model. It also
  doubled as a live end-to-end ingestion test.
- Model downloads (~2.6 GB total across four files) were one-time and
  user-consented; small's SHA matched the pinned harness value.

## Follow-up

- TD-005/006/007 in `docs/TECH_DEBT.md` are accepted low-severity items for a
  future multi-workspace deployment / ASCII-only callback assumption.
- The bot is running on the turbo tier with the rebuilt code; restart with
  `set -a; . ./.local/secrets.env; set +a; ./paios telegram serve` (Node 24).
- Durable findings already promoted to ADR-0008; no further promotion needed.
