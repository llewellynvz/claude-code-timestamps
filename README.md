# ⏱ Timestamps — a clean conversation timeline for Claude Code

**See exactly when every message in your Claude Code session was sent.**

A zero-dependency, cross-platform Claude Code **plugin**. It adds a
`/timestamps:log` command that prints a clean, date-grouped timeline of your
conversation — every message with a full `[HH:MM:SS]` timestamp — plus an
optional always-on clock for the status bar.

```
--- Message Timeline ---

Thu 14 May 2026

[14:51:52] Llewellyn:
what is the time?

[14:51:55] Claude:
It's 2:51 PM, Thursday 14 May 2026.

Showing 2 of 48 messages.
```

## Why

Claude Code doesn't show timestamps on messages. In a long session you lose
track of *when* things happened — when you asked something, when a task
started, how long ago a decision was made. The data exists in Claude Code's
transcript files, but it's buried in JSON. This plugin surfaces it as a clean,
readable timeline whenever you want it.

### Why on-demand instead of live?

Honest answer: Claude Code's plugin system **cannot** put a clean timestamp on a
live message. Hooks can't modify message bubbles, and any visible hook output is
forced through a `⎿ <Event> says:` wrapper that clutters the transcript. Rather
than ship something noisy, this plugin does the part Claude Code *can* do
well — a clean, accurate timeline on demand — plus an optional status-bar clock
for an always-visible current time. See [How it works](#how-it-works) for the
detail.

> This plugin was inspired by [`s-a-s-k-i-a/claude-code-timestamps`](https://github.com/s-a-s-k-i-a/claude-code-timestamps).
> It is a ground-up rewrite: pure Node instead of Python (so it works on Windows
> out of the box), with seconds, full dates, date grouping, and the `[time] Name:`
> layout.

## What you get

| Feature | Detail |
| :------ | :----- |
| **`/timestamps:log`** | A clean, date-grouped timeline of recent messages, each with a `[HH:MM:SS] Name:` header. |
| **Full precision** | Hours, minutes, **and seconds**, plus a date header per day. Local timezone. |
| **Your name, automatically** | Your messages are labelled with your OS username by default (configurable). |
| **Optional status-bar clock** | An opt-in live clock for the bottom of the terminal: `⏱ 14:51:55 · Thu 14 May 2026`. |
| **Zero config** | Works immediately. An optional `config.json` customises everything. |
| **Self-contained** | Pure Node, no dependencies, no install step, no background processes. Doesn't register hooks, doesn't touch your other settings. |

## Install

> **Requirements:** Claude Code with plugin support, and Node.js — which ships
> with Claude Code, so it's already there. Works on Windows, macOS, and Linux.

### Option A — install from GitHub (recommended)

Inside Claude Code:

```
/plugin marketplace add llewellynvz/claude-code-timestamps
/plugin install timestamps@claude-code-timestamps
```

Then restart Claude Code (or run `/reload-plugins`). The `/timestamps:log`
command is now available in every session.

### Option B — install from a local copy

If you have this repository cloned on disk:

```
/plugin marketplace add "/path/to/claude-code-timestamps"
/plugin install timestamps@claude-code-timestamps
```

Replace `/path/to/claude-code-timestamps` with wherever you cloned this folder
(quote it if the path contains spaces). The marketplace name comes from
`marketplace.json` and is `claude-code-timestamps`.

### Option C — load it for a single session (development / trying it out)

```bash
claude --plugin-dir "/path/to/claude-code-timestamps"
```

This loads the plugin for that session only, without installing anything.

### Verify it's working

- Run `/timestamps:log` — you should see the timeline.
- Run `claude plugin validate .` from this folder — it should report
  `Validation passed`.

## Usage

```
/timestamps:log         # last 20 messages, with timestamps, grouped by day
/timestamps:log 50      # last 50 messages
/timestamps:log 5       # just the last 5
```

Each entry is rendered as:

```
[14:51:52] Llewellyn:
what is the time?
```

— a `[HH:MM:SS] Name:` header, the message text below it, and a blank line
before the next entry. Messages are grouped under a `Thu 14 May 2026` date
header. Long messages are trimmed to a readable preview length.

## Configuration

The plugin works with **no configuration at all**. To customise it, create a
file called `config.json` in the plugin's data directory.

**Where the data directory is:**

| Install method | `config.json` location |
| :------------- | :--------------------- |
| Installed from a marketplace | `~/.claude/plugins/data/timestamps-claude-code-timestamps/config.json` |
| Loaded via `--plugin-dir` | `~/.claude/plugins/data/timestamps-inline/config.json` |
| Fallback (if the above is unavailable) | `<your OS temp dir>/claude-timestamps/config.json` |

On Windows, `~` is `C:\Users\<you>`. The directory is created automatically the
first time the plugin runs.

Copy [`config.example.json`](./config.example.json) into that directory as
`config.json` and edit. **Every field is optional** — anything you leave out
keeps its default.

| Field | Default | What it does |
| :---- | :------ | :----------- |
| `timeFormat` | `"24h"` | `"24h"` → `[14:51:52]`, or `"12h"` → `[2:51:52 pm]`. |
| `showSeconds` | `true` | Include `:SS` in the time. |
| `labels.user` | `"auto"` | Name for your messages. `"auto"` uses your OS username; set any string to override (e.g. `"Llewellyn"`). |
| `labels.assistant` | `"Claude"` | Name for Claude's messages. |
| `dateHeaders` | `true` | Group timeline entries under a `Thu 14 May 2026` date header. |
| `previewLength` | `200` | Max characters of message text shown per entry (20–2000). |
| `prefix` | `"⏱"` | Leading glyph for the **status-bar clock**. Set to `""` for none. |
| `statuslineShowDate` | `true` | Whether the **status-bar clock** appends the date. |

Bad or unrecognised values are ignored safely — the plugin falls back to the
default for that single field and never errors.

## Optional: a live clock in the status line

A plugin can't set the main Claude Code status line without overriding whatever
you already have there — so this is shipped as an **opt-in extra** you switch on
yourself. It gives you a clock that updates every second:

```
⏱ 14:51:55 · Thu 14 May 2026
```

Add this to your `~/.claude/settings.json` (point the path at wherever the
plugin lives — for a marketplace install it's under
`~/.claude/plugins/cache/...`; `claude plugin list` shows the path):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<path-to-plugin>/extras/statusline.js\"",
    "refreshInterval": 1000
  }
}
```

It reuses the same `config.json`, so the time format, seconds, prefix, and
`statuslineShowDate` settings all apply to the clock.

## How it works

The `/timestamps:log` skill (`scripts/log.js`) reads Claude Code's own
transcript `.jsonl` for the current project — the same data Claude Code already
records, where every message carries an ISO timestamp — validates the path,
parses it, and formats the timeline. Nothing is collected, and nothing leaves
your machine.

The optional status-line clock (`extras/statusline.js`) is a small Node script
Claude Code re-runs on a timer to print the current time.

### A note on "live" per-message timestamps

If you came here hoping for a timestamp stamped onto every message *as it
happens*: that is **not possible** with Claude Code's current plugin system, and
no plugin can do it.

- Hooks cannot modify or prepend text to message bubbles — there is no
  per-message rendering API.
- Every *visible* hook line is forced through a `⎿ <Event> says: …` wrapper
  added by Claude Code itself, which no plugin can remove.
- A `UserPromptSubmit` hook's plain output is, in current versions, not shown to
  the user at all.

This plugin deliberately does **not** register hooks. It does the part Claude
Code supports cleanly — an accurate on-demand timeline — instead of shipping
noisy, half-working live output.

### Non-interference & safety

- **No hooks, no background processes.** The plugin registers nothing that runs
  automatically. It only acts when you invoke `/timestamps:log` (or when Claude
  Code refreshes the status line, if you opted into it).
- **It stays in its lane.** The only file it might write is an optional
  `config.json` *you* create; it reads transcripts read-only.
- **Path-traversal safe.** Transcript paths are validated to live inside
  `~/.claude/projects/` before being read.

## Uninstall

```
/plugin disable timestamps      # keep it installed but turn it off
/plugin uninstall timestamps    # remove it entirely
```

If you added the optional status-line clock, also remove the `statusLine` block
from `~/.claude/settings.json`.

## Publishing to GitHub

This repository is its own Claude Code plugin marketplace
(`.claude-plugin/marketplace.json`), and the metadata is wired to
`github.com/llewellynvz/claude-code-timestamps`. To publish, create that
repository on GitHub, then from this folder:

```bash
git add .
git commit -m "your message"
git push
```

(If you use a different repository name or owner, update the
`homepage`/`repository` fields in `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, and the Option A install command above.)

Before pushing, run the checks:

```bash
node test/run-tests.js     # must pass clean
claude plugin validate .   # must report "Validation passed"
```

## Project layout

```
.claude-plugin/
  plugin.json          plugin manifest
  marketplace.json     makes this repo its own installable marketplace
scripts/
  log.js               the /timestamps:log timeline (the core feature)
  lib/
    paths.js           resolves a directory for the optional config.json
    config.js          loads + defensively validates config.json
    render.js          time / date / clock formatting
    transcript.js      locate + validate + parse transcript .jsonl files
skills/
  log/SKILL.md         the /timestamps:log skill definition
extras/
  statusline.js        optional, opt-in live status-line clock
test/
  run-tests.js         self-contained test suite (zero deps)
config.example.json    copy to your data dir as config.json to customise
```

## Requirements

- Claude Code with plugin support.
- Node.js — bundled with Claude Code, so no separate install.
- Works on Windows, macOS, and Linux.

## Acknowledgements

Inspired by [`s-a-s-k-i-a/claude-code-timestamps`](https://github.com/s-a-s-k-i-a/claude-code-timestamps)
and the Claude Code community feature requests for message timestamps
([#2447](https://github.com/anthropics/claude-code/issues/2447),
[#30144](https://github.com/anthropics/claude-code/issues/30144),
[#31271](https://github.com/anthropics/claude-code/issues/31271)).
If native timestamp support ever lands in Claude Code, this plugin won't be
needed — and that would be a good thing.

## License

MIT — see [LICENSE](./LICENSE).
