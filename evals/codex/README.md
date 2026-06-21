# Codex Capability Evaluations

These scenarios prove whether a Codex capability change is necessary and
effective.

## Required Cycle

1. Run the scenario unchanged in a fresh session.
2. Preserve raw output under `.local/paios-sessions/evals/`.
3. Score the baseline against every assertion.
4. Stop if the baseline passes.
5. If RED, make the smallest capability change.
6. Re-run the identical scenario under equivalent settings.
7. Accept only a GREEN result and record regressions or model variance.

Scenario JSON is versioned. Curated reports live in
`docs/audits/codex-evals/`; raw transcripts remain local.

## Scenario Fields

- `id`, `version`, `capability`, and `purpose`
- `prompt`
- `fixture`
- `environment`
- `assertions`
- `prohibited`
- `scoring`
