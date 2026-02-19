# AGENTS.md

This document defines behavioral and architectural expectations for AI agents or contributors modifying `git-scribe`.

---

# Project Purpose

`git-scribe` is a CLI tool that drafts high-quality git commit messages based solely on staged changes.

Core principles:

- Operates only on staged changes.
- Never auto-commits without human review (editor-first workflow).
- Prefers clarity and accuracy over cleverness.
- Avoids hallucinating changes not present in the diff.
- Matches existing repository commit style when consistent.

This tool is intentionally simple, fast, and reliable.

---

# Architectural Overview

Entry point:
- `bin/git-scribe.js`

Core modules:
- `src/index.js` — orchestration
- `src/git.js` — git interaction layer
- `src/prompt.js` — prompt construction
- `src/llm.js` — OpenAI-compatible API client
- `src/editor.js` — editor invocation
- `src/read_guidance.js` — reads AGENTS.md / CLAUDE.md
- `src/parse_args.js` — CLI argument parsing

Execution flow:

1. Ensure inside git repo.
2. Ensure staged changes exist.
3. Collect:
   - staged diff
   - staged file list
   - recent commit subjects
   - optional guidance files
4. Build prompt.
5. Call LLM.
6. Write draft to temp file.
7. Open editor.
8. Run `git commit -F`.

---

# Hard Rules

Agents modifying this repository MUST preserve:

1. **No unstaged changes may ever be included.**
2. **No automatic commits without explicit user intent.**
3. **The model must be instructed not to hallucinate.**
4. **Editor review must remain default behavior.**
5. **Environment variables must remain the primary config mechanism.**

---

# LLM Design Philosophy

The model must:

- Output only a commit message.
- Follow conventional git formatting:
  - ≤ 72 char subject
  - blank line
  - optional body
- Focus on *what* and *why*, not raw diff summary.
- Imitate existing commit subject style if consistent.

We intentionally use low temperature (~0.2) to bias toward accuracy.

---

# Security & Privacy

- Only staged diff is sent.
- Diff size is capped.
- Guidance files are capped.
- No local files beyond explicit guidance files are sent.
- No unstaged files are accessed.

Future improvements may include:
- Diff summarization for large patches
- Local-only inference mode
- Redaction hooks

---

# CLI Behavior Contracts

Flags:

- `--dry-run` → print draft only
- `--debug` → print context metadata
- `--no-body` → subject only
- `-i / --instruction` → add extra instruction
- `--` → passthrough to `git commit`

Unknown flags are passed through to `git commit`.

---

# Extensibility Guidelines

Future enhancements must:

- Preserve subcommand ergonomics (`git scribe`)
- Keep startup fast
- Avoid heavy dependencies
- Maintain minimal configuration surface

If the tool grows significantly in complexity or performance sensitivity, a rewrite in Rust or Go may be considered.

---

# Commit Style of This Repository

- Imperative mood subjects.
- Clear intent.
- No trailing periods.
- Concise but meaningful bodies.

Agents should follow this style when contributing changes.

---

