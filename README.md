# git-scribe

`git-scribe` drafts accurate git commit messages from your staged changes, applies guardrails to avoid hallucinations, and lets you approve or edit the draft before committing.

## Requirements

- Node.js 18 or newer
- A git repository with staged changes
- Access to an OpenAI-compatible API (OpenRouter by default)

## Quickstart

```bash
git clone https://github.com/Mister-Meeseeks/git-scribe
cd git-scribe
npm install
npm link
git scribe --version
```

`npm link` makes the `git scribe` executable available globally from this checkout. Re-run it whenever you pull new changes. Prefer not to link? Run `npx ./bin/git-scribe.js --help` directly instead.

## Environment setup

`git-scribe` prefers environment variables so you can keep secrets out of shell history. Set these once in your shell profile or export them before running `git scribe`.

| Purpose | Primary env var | Fallback | Default |
| --- | --- | --- | --- |
| API key | `SCRIBE_OPENAI_API_KEY` | `OPENAI_API_KEY` | _required_ |
| Base URL | `SCRIBE_OPENAI_BASE_URL` | `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1/` |
| Model | `SCRIBE_OPENAI_MODEL` | `OPENAI_MODEL` | `minimax/minimax-m2.5` |
| Diff cap | `SCRIBE_MAX_DIFF_CHARS` | — | `20000` |

Example (bash/zsh):

```bash
export SCRIBE_OPENAI_API_KEY="sk-live-..."
export SCRIBE_OPENAI_BASE_URL="https://openrouter.ai/api/v1/"
export SCRIBE_OPENAI_MODEL="minimax/minimax-m2.5"
```

You can also rely on the standard `OPENAI_*` variables if you already have them configured for other tooling. Set `SCRIBE_MAX_DIFF_CHARS` when you need a higher diff cap and `SCRIBE_DEBUG_STACK=1` when you want stack traces.

## Basic usage

Stage changes with `git add` (or rely on `git scribe -a` if you only touch tracked files), then choose the flow you need:

- `git scribe` – draft a commit from staged changes and decide whether to accept, edit, or regenerate.
- `git scribe --dry-run` – print the proposed message without touching git; perfect for quick previews.
- `git scribe -a --detail-level 4` – include tracked unstaged edits and nudge the model toward a more thorough explanation.
- `git scribe --prompt-note "Write in French"` – force a particular style/tone for the final output.
- `git scribe --history-depth 5 --guidance docs/COMMIT_STYLE.md` – share extra repository guidance and shorten commit history context.

Regardless of flags, the workflow is the same: the tool gathers the diff, builds the prompt (plus any guidance), calls your configured LLM, and prints the draft for review. You will always be asked what to do next:

- `y` – accept and run `git commit -F` with the draft
- `n` – abort (no commit is made)
- `e` – open the draft in `$EDITOR` (or `vi` if unset); save/close to return to the prompt
- `+` – ask git-scribe to draft a more detailed commit message (bumps the detail level)
- `-` – ask for a more succinct message (lowers the detail level)
- `i` – supply new instructions (e.g., “Highlight the API rename”); they’re appended to the prompt and the model sees the rejected draft + feedback

The editor is only opened when you choose `e`, matching the “editor-on-demand” requirement.
Use `--yes` (or `-y`) only when you explicitly want to skip this approval prompt and commit immediately.

## Flags

```
git-scribe [options] [-- git commit args]
```

- `-R, --dry-run` – print the draft message and exit
- `-X, --debug` – print JSON metadata about the collected context
- `-B, --no-body` – request a subject-only commit message
- `-a, --all` – include tracked unstaged changes (mirrors `git commit -a`)
- `-L, --detail-level <1-5>` – set how detailed you want the commit (1 = terse, 5 = verbose; default 3)
- `-P, --prompt-note <text>` – add a one-off note that directly shapes the final commit message (e.g., “Mention this was a major refactor”)
- `-M, --model <name>` – override the model for this run without touching env vars
- `--trace-prompt` – print the full prompt sent to the model (useful for debugging)
- `-V, --version` – print the installed git-scribe version and exit
- `-y, --yes` – skip the approval prompt and commit immediately (opt-in)
- `-i, --instruction <text>` – add repeatable general instructions/context hints for the model
- `-D, --history-depth <n>` – number of recent commit subjects to include (default 10)
- `-G, --guidance <path>` – add a custom guidance file (repeatable)
- `-N, --no-guidance` – skip the automatic `AGENTS.md`/`CLAUDE.md` lookup
- `-E, --editor <command>` – override the editor used when choosing `e`
- `-K, --max-diff-chars <n>` – cap staged diff characters sent to the LLM (env var override available)
- `--` – pass everything after `--` directly to `git commit`

Unknown flags/args that come before `--` automatically flow through to `git commit`, so commands like `git scribe --amend` work without extra ceremony.

## Guidance files

By default, `git-scribe` includes the contents of `AGENTS.md` and `CLAUDE.md` (if they exist in the repo root) in the prompt. Use `--no-guidance` to skip them entirely or `--guidance path/to/file` to add your own files (repeat the flag for multiple files). Oversized guidance files are truncated to keep prompts lean.

## Diff safety

Only staged changes are read and sent to the model. When you pass `-a/--all`, git-scribe mirrors `git commit -a` inside a temporary index so the diff still reflects exactly what would be committed. The staged diff is truncated when it exceeds the configured character cap, and the prompt explicitly instructs the model not to invent details. Use `--detail-level` to tell the model how much explanation you want (scale 1–5), `-i/--instruction` for contextual hints, and `--prompt-note` when you want a final-message reminder; `--prompt-note` is echoed in the output rules so the model treats it as non-negotiable. All of these hints are appended to the prompt, never substituted for the diff itself.

## Debugging

Use `--debug` to inspect what the tool collected (staged files, whether guidance was truncated, resolved model name, etc.). To print stack traces on fatal errors, set `SCRIBE_DEBUG_STACK=1`.

## Development

- Source: `src/*`
- Entry point: `bin/git-scribe.js`
- Tests: `npm test` (runs the `node:test` suite under `test/`)

Contributions should preserve the hard rules in `AGENTS.md` (staged diff only, editor-first approval, no hallucinations, environment-driven config, etc.).
