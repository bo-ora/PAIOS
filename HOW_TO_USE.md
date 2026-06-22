# How to Use PAIOS

This file lists only scenarios that are implemented and verified. Run commands
from the repository root.

## Prepare the CLI

Install the pinned development dependencies and build the ignored `dist/`
output:

```bash
./lde.sh
npm ci
npm run build
```

`./lde.sh` checks the local machine without installing or changing anything.

## Check Project Status

Use the human-readable view after returning to the project:

```bash
./paios status
```

Use JSON when another script or tool needs the same project state:

```bash
./paios status --json
```

Both status commands are read-only. They summarize Git state, repository
validation, roadmap position, technical debt, the latest session, and the next
recorded action.

## Capture a Note

Pipe note content through stdin. This is the preferred form for multiline or
private text because the content does not appear in the command arguments:

```bash
printf '%s\n' \
  "Remember to compare Telegram voice-message retry behavior." |
  ./paios knowledge add-note --title "Telegram follow-up"
```

The command returns a stable record identifier and managed source reference:

```text
Captured note 00000000-0000-0000-0000-000000000000
Source: sources/notes/00000000-0000-0000-0000-000000000000.txt
```

For short non-sensitive content, `--text` is also available:

```bash
./paios knowledge add-note \
  --title "Short reminder" \
  --text "Test the local knowledge workflow."
```

Byte-identical content is rejected as a duplicate and reports the existing
record identifier.

## Inspect a Captured Record

Pass the identifier returned by `add-note`:

```bash
./paios knowledge show RECORD_ID
```

The output includes source type, title, state, capture time, managed source
reference, checksum, byte length, source adapter, and normalized text.

## Use an Isolated Data Directory

Use `--data-root` to try knowledge commands without touching the default local
data:

```bash
data_root=$(mktemp -d)
output=$(printf '%s\n' "Disposable example" |
  ./paios knowledge add-note --data-root "$data_root")
record_id=$(printf '%s\n' "$output" | sed -n 's/^Captured note //p')
./paios knowledge show "$record_id" --data-root "$data_root"
rm -rf "$data_root"
```

For repeated commands, set `PAIOS_DATA_ROOT`:

```bash
export PAIOS_DATA_ROOT="$HOME/.local/share/paios/knowledge"
printf '%s\n' "Persistent local note" | ./paios knowledge add-note
```

Precedence is `--data-root`, then `PAIOS_DATA_ROOT`, then the default
`.local/paios/knowledge/`.

## Run Project Verification

Before committing implementation or documentation changes:

```bash
npm run lint
npm run typecheck
npm test
npm run build
python3 -m unittest discover -s tests -v
python3 scripts/validate_repository.py .
git diff --check
```

## Not Implemented Yet

The CLI reserves these Phase 1 commands, but they are not usable yet:

- `knowledge add-file`
- `knowledge add-audio`
- `knowledge index`
- `knowledge ingest-inbox`
- `knowledge search`
- `knowledge rebuild`

Add a scenario here only after its implementation and verification are
committed.
