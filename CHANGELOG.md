# Changelog

All notable changes to the **timestamps** plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/).

> **Versioning note for maintainers:** `plugin.json` declares an explicit
> `version`. Claude Code only ships an update to users when that string
> changes — so bump it on every release (and add an entry here).

## [2.0.0] — 2026-05-14

A focused rewrite. v1.0.0 tried to show timestamps *live* on every message via
hooks; testing in Claude Code v2.1.141 confirmed that approach can't be made
clean — visible hook output is forced through a `⎿ <Event> says: …` wrapper that
no plugin can remove, and `UserPromptSubmit` plain stdout isn't shown to the
user at all. v2.0.0 drops the live-hook approach entirely and does the part
Claude Code supports cleanly.

### Changed (breaking)

- **Removed all hooks.** The plugin no longer registers `UserPromptSubmit` or
  `Stop` hooks. There is no automatic live output and therefore no `⎿ … says:`
  clutter in the transcript. The plugin now runs only when you invoke
  `/timestamps:log` (or when Claude Code refreshes the optional status line).
- **`/timestamps:log` is now the core feature**, and its output was redesigned
  to a clean `[HH:MM:SS] Name:` header per message, with the message text below
  it and a blank line between entries, grouped under per-day date headers.
- **`labels.user` now defaults to `"auto"`** — your messages are labelled with
  your OS username automatically, with no config needed.
- **Status-line clock simplified** to `⏱ HH:MM:SS · <date>` to match the
  documented opt-in setup; model/cwd fields removed.
- **`config.json` schema trimmed** to what the timeline and clock actually use:
  `timeFormat`, `showSeconds`, `labels`, `dateHeaders`, `previewLength`,
  `prefix`, `statuslineShowDate`. All live-hook formatting options are gone.

### Removed

- `hooks/hooks.json`, `scripts/timestamp-hook.js`, and `scripts/lib/state.js`
  (the per-session elapsed-time state store) — no longer needed without hooks.

### Migration

If you installed v1.0.0, run `/plugin update timestamps` (or reinstall). No
config migration is required; an old v1 `config.json` is still read safely —
unrecognised keys are simply ignored.

## [1.0.0] — 2026-05-14

First release. Provided live timestamp hooks (`UserPromptSubmit` + `Stop`) and a
`/timestamps:log` retrospective timeline. The live-hook approach was superseded
by v2.0.0 — see above for why.
