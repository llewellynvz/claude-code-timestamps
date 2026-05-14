# Changelog

All notable changes to the **timestamps** plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project aims to follow [Semantic Versioning](https://semver.org/).

> **Versioning note for maintainers:** `plugin.json` declares an explicit
> `version`. Claude Code only ships an update to users when that string
> changes — so bump it on every release (and add an entry here).

## [1.0.0] — 2026-05-14

First public release.

### Added

- **Live timestamp hooks.** A `UserPromptSubmit` hook prints a timestamp line
  the moment you send a message; a `Stop` hook prints one when Claude finishes
  the turn, including how long the turn took. Both activate automatically the
  moment the plugin is enabled — no command, no per-session setup.
- **Date + time + seconds** on every line, e.g.
  `⏱ 14:23:01 · Tue 14 May 2026 · you`. Times use the machine's local timezone.
- **Per-turn elapsed time** on the "Claude finished" line (e.g. `· 46s`),
  tracked via a tiny per-session state file.
- **`/timestamps:log` skill** — a retrospective, date-grouped timeline of recent
  messages in the current conversation, parsed from Claude Code's own
  transcript. Replaces the Python script of the project this was inspired by:
  pure Node, cross-platform, works on Windows out of the box, and shows seconds.
- **Zero-config defaults**, with an optional `config.json` to customise time
  format (12h/24h), seconds, date display, the line prefix/separator, the gap
  between exchanges, indentation, colour, and the `you` / `Claude` labels.
- **Optional opt-in status-line clock** (`extras/statusline.js`) for a live
  ticking clock at the bottom of the terminal.
- **Self-installable marketplace.** The repository is its own Claude Code
  plugin marketplace, so it can be added and installed directly from GitHub.
- Full test suite (`test/run-tests.js`) — 41 checks covering config validation,
  rendering, state handling, path-traversal safety, the hook safety contract,
  and manifest validity.

### Safety & non-interference

- **Hook safety contract:** every hook script is wrapped so it *always* exits 0,
  never blocks or delays a prompt, and finishes well under the 5-second hook
  timeout. Worst case on any internal error: it prints nothing and exits cleanly.
- **Additive only:** the plugin's hooks merge alongside any hooks you already
  have. It registers nothing globally, writes no files outside its own data
  directory, and sets no main status line.
- **Path-traversal safe:** session ids are sanitised before being used as
  filenames; transcript paths are validated to live inside `~/.claude/projects/`.

### Known limitations

- Live timestamps mark **prompt** and **turn-completion** boundaries (one line
  when you send, one when Claude finishes) — not every individual sub-message
  or tool call. This is the clean, non-noisy boundary set; per-tool lines were
  considered and deliberately left out.
- A plugin cannot set the main terminal status line without overriding the
  user's own, so the live status-line clock is shipped as an opt-in extra
  rather than being forced on.

## [Unreleased]

Ideas under consideration for a future release:

- `dateMode: "daily"` — show the date only on the first message of each day.
- A `/timestamps:config` helper skill for editing settings without hand-editing
  JSON.
