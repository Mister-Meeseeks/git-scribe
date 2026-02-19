# git-scribe

`git-scribe` drafts accurate git commit messages from your staged changes, applies guardrails to avoid hallucinations, and lets you approve or edit the draft before committing.

## Requirements

- Node.js 18 or newer
- A git repository with staged changes
- Access to an OpenAI-compatible API (OpenRouter by default)

## Installation

Clone the repo, then install dependencies (there are no runtime dependencies, but install ensures lockfiles are created if you add any later):

```bash
npm install
```

Link the CLI locally or run it with `npx`:

```bash
npm link
# or
npx ./bin/git-scribe.js --help
```

## Configuration

`git-scribe` prefers environment variables so you can keep secrets out of shell history.

| Purpose | Primary env var | Fallback | Default |
| --- | --- | --- | --- |
| API key | `SCRIBE_OPENAI_API_KEY` | `OPENAI_API_KEY` | _required_ |
| Base URL | `SCRIBE_OPENAI_BASE_URL` | `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1/` |
| Model | `SCRIBE_OPENAI_MODEL` | `OPENAI_MODEL` | `minimax/minimax-m2.5` |
| Diff cap | `SCRIBE_MAX_DIFF_CHARS` | — | `20000` |

If neither API key variable is set the CLI will abort.

## Usage

Stage your changes, then run:

```bash
git scribe
```

The tool gathers the staged diff, builds an instruction prompt (optionally enriched by `AGENTS.md`/`CLAUDE.md`), calls your configured LLM, and shows the draft commit message. You will always be asked what to do next:

- `y` – accept and run `git commit -F` with the draft
- `n` – abort (no commit is made)
- `e` – open the draft in `$EDITOR` (or `vi` if unset); save/close to return to the prompt

The editor is only opened when you choose `e`, matching the “editor-on-demand” requirement.
Use `--yes` (or `-y`) only when you explicitly want to skip this approval prompt and commit immediately.

## Flags

```
git-scribe [options] [-- git commit args]
```

- `--dry-run` – print the draft message and exit
- `--debug` – print JSON metadata about the collected context
- `--no-body` – request a subject-only commit message
- `-y, --yes` – skip the approval prompt and commit immediately (opt-in)
- `-i, --instruction <text>` – add extra instruction(s) for the model
- `--history-depth <n>` – number of recent commit subjects to include (default 10)
- `--guidance <path>` – add a custom guidance file (repeatable)
- `--no-guidance` – skip the automatic `AGENTS.md`/`CLAUDE.md` lookup
- `--editor <command>` – override the editor used when choosing `e`
- `--max-diff-chars <n>` – cap staged diff characters sent to the LLM (env var override available)
- `--` – pass everything after `--` directly to `git commit`

Unknown flags/args that come before `--` automatically flow through to `git commit`, so commands like `git scribe --amend` work without extra ceremony.

## Guidance files

By default, `git-scribe` includes the contents of `AGENTS.md` and `CLAUDE.md` (if they exist in the repo root) in the prompt. Use `--no-guidance` to skip them entirely or `--guidance path/to/file` to add your own files (repeat the flag for multiple files). Oversized guidance files are truncated to keep prompts lean.

## Diff safety

Only staged changes are read and sent to the model. The staged diff is truncated when it exceeds the configured character cap, and the prompt explicitly instructs the model not to invent details.

## Debugging

Use `--debug` to inspect what the tool collected (staged files, whether guidance was truncated, resolved model name, etc.). To print stack traces on fatal errors, set `SCRIBE_DEBUG_STACK=1`.

## Development

- Source: `src/*`
- Entry point: `bin/git-scribe.js`
- Tests: `npm test` (runs the `node:test` suite under `test/`)

Contributions should preserve the hard rules in `AGENTS.md` (staged diff only, editor-first approval, no hallucinations, environment-driven config, etc.).
