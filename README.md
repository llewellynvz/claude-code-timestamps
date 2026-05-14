# ⏱ Timestamps — live date & time stamps for Claude Code

**See exactly when every message was sent — automatically, on every interaction, right inside Claude Code.**

A zero-dependency, cross-platform Claude Code **plugin**. Once enabled it adds a
clean timestamp line whenever you send a message and whenever Claude finishes
replying — including how long the turn took. No command to remember, no
per-session setup. It just runs.

```
⏱ 14:23:01 · Tue 14 May 2026 · you
  Can you refactor the auth module and add tests?

  …Claude works…

⏱ 14:23:47 · Claude · 46s
```

It also ships a `/timestamps:log` skill for a retrospective, date-grouped
timeline of the whole conversation.

---

## Why

Claude Code doesn't show timestamps on messages. In a long session you lose
track of *when* things happened — when you asked something, when a task
started, how long it took. The data exists in Claude Code's transcript files,
but it's buried in JSON. This plugin surfaces it, live, as you work.

> Inspired by [`s-a-s-k-i-a/claude-code-timestamps`](https://github.com/s-a-s-k-i-a/claude-code-timestamps),
> which provided a manual, Python-based `/timestamps` command. This project
> rebuilds the idea as an **automatic** plugin: live hooks instead of a manual
> command, pure Node instead of Python (so it works on Windows out of the box),
> with seconds, full dates, and per-turn elapsed time.

## What you get

| Feature | Detail |
| :------ | :----- |
| **Live timestamps** | A line when you submit a prompt, and a line when Claude finishes the turn. |
| **Date + time + seconds** | `⏱ 14:23:01 · Tue 14 May 2026 · you` — local timezone, configurable. |
| **Per-turn elapsed time** | The "Claude finished" line shows how long the turn took (`· 46s`, `· 2m 13s`). |
| **Clean separation** | A blank line before each new exchange makes message boundaries easy to scan; configurable. |
| **`/timestamps:log`** | Retrospective, date-grouped timeline of recent messages from the session transcript. |
| **Zero config** | Works immediately. An optional `config.json` customises everything. |
| **Self-contained** | Pure Node, no dependencies, no install step. Doesn't touch or interfere with your other hooks, scripts, or settings. |
| **Optional clock** | An opt-in status-line clock (`extras/statusline.js`) for a live ticking clock at the bottom of the terminal. |

---

## Install

> **Requirements:** Claude Code with plugin support, and Node.js — which ships
> with Claude Code, so it's already there. Works on Windows, macOS, and Linux.

### Option A — install from GitHub (recommended)

Once this repository is on GitHub (see [Before you publish](#before-you-publish-to-github)),
anyone can install it in two commands inside Claude Code:

```
/plugin marketplace add llewellynvz/claude-code-timestamps
/plugin install timestamps@claude-code-timestamps
```

Then restart Claude Code (or run `/reload-plugins`). That's it — timestamps now
appear automatically in every session.

### Option B — install from a local copy

If you have this repository cloned on disk and just want to use it yourself:

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

- Send any message — you should see the `⏱ … · you` line appear.
- When Claude finishes replying, you should see the `⏱ … · Claude · …` line.
- Run `/timestamps:log` to see the retrospective timeline.
- Run `claude plugin validate .` from this folder — it should report
  `Validation passed`.

---

## Usage

### Automatic — nothing to do

The two timestamp lines appear on their own, every turn, for the whole session.
There is no command to run and nothing to remember. This is the whole point.

### `/timestamps:log` — retrospective timeline

```
/timestamps:log         # last 20 messages, with timestamps, grouped by day
/timestamps:log 50      # last 50 messages
/timestamps:log 5       # just the last 5
```

Example output:

```
--- Message Timeline ---

Tue 14 May 2026
  14:02:09   you      Can you refactor the auth module?
  14:02:11   Claude   I'll start by reading the current auth implementation...
  14:05:33   Claude   I've refactored the auth module. Here's what changed...
  14:31:48   you      Looks good. Now add tests for the token refresh logic.
  14:32:02   Claude   I'll create tests for the token refresh functionality...

Showing 5 of 48 messages.
```

---

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
first time the plugin runs — if it doesn't exist yet, send one message and it
will appear.

Copy [`config.example.json`](./config.example.json) into that directory as
`config.json` and edit. **Every field is optional** — anything you leave out
keeps its default.

| Field | Default | What it does |
| :---- | :------ | :----------- |
| `enabled` | `true` | Master switch. `false` keeps the plugin installed but silent. |
| `timeFormat` | `"24h"` | `"24h"` → `14:23:01`, or `"12h"` → `2:23:01 pm`. |
| `showSeconds` | `true` | Include `:SS` in the time. |
| `dateMode` | `"always"` | `"always"` shows the date on every prompt line; `"never"` hides it. |
| `dateOnStopLine` | `false` | Also show the date on the "Claude finished" line. |
| `showElapsed` | `true` | Show per-turn elapsed time on the "Claude finished" line. |
| `prefix` | `"⏱"` | The leading glyph. Set to `""` for none, or any string you like. |
| `separator` | `" · "` | Text placed between fields. |
| `indent` | `0` | Spaces of left indentation (0–40). |
| `gapBeforePrompt` | `1` | Blank lines before the "you" line — the visual gap **between exchanges** (0–5). |
| `gapBeforeStop` | `0` | Blank lines before the "Claude finished" line — kept tight, since it belongs to the same exchange (0–5). |
| `color` | `false` | Wrap lines in ANSI "dim". Off by default for maximum terminal compatibility. |
| `labels.user` | `"you"` | Label for your messages. |
| `labels.assistant` | `"Claude"` | Label for Claude's messages. |

> **Tip — the spacing controls.** `gapBeforePrompt` and `gapBeforeStop` are how
> you tune message separation. The defaults (`1` before each new exchange, `0`
> within an exchange) give a small gap inside a turn and a slightly bigger one
> between turns, so distinct messages are easy to tell apart at a glance. Bump
> `gapBeforePrompt` to `2` for even more breathing room.

Bad or unrecognised values are ignored safely — the plugin falls back to the
default for that single field and never errors.

---

## Optional: a live clock in the status line

A plugin can't set the main Claude Code status line without overriding whatever
you already have there — so this is shipped as an **opt-in extra** you switch on
yourself. It gives you a clock that updates every second:

```
⏱ 14:23:01 · Tue 14 May 2026 · claude-opus-4-7 · my-project
```

Add this to your `~/.claude/settings.json` (adjust the path to where this plugin
lives — for a marketplace install it's under `~/.claude/plugins/cache/...`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<path-to-plugin>/extras/statusline.js\"",
    "refreshInterval": 1000
  }
}
```

It reuses the same `config.json`, so the time format, prefix, separator, and
colour settings all apply to the clock too.

---

## How it works

Claude Code lets plugins register **hooks** — small commands that run on session
events. This plugin registers two (`hooks/hooks.json`):

- **`UserPromptSubmit`** runs the moment you send a message. It prints the
  `⏱ … · you` line (a `UserPromptSubmit` hook's plain output is shown in the
  transcript) and records the time of this turn.
- **`Stop`** runs when Claude finishes the turn. It reads back that recorded
  time, works out how long the turn took, and shows the `⏱ … · Claude · …` line.

Both run `scripts/timestamp-hook.js` — plain Node, invoked in *exec form* so the
plugin path works even when it contains spaces. Per-turn timing is stored in a
tiny one-file-per-session state file inside the plugin's data directory.

The `/timestamps:log` skill (`scripts/log.js`) reads Claude Code's own
transcript `.jsonl` for the current project — the same data Claude Code already
records — and formats it. Nothing is collected, and nothing leaves your machine.

### Non-interference & safety

This plugin is built to be a quiet, well-behaved citizen of your setup:

- **It never blocks a prompt.** Every hook script has a safety contract: a hard
  timeout, a top-level catch, and an unconditional clean exit. Worst case on any
  internal error — it prints nothing and gets out of the way.
- **It's purely additive.** Plugin hooks *merge* with any hooks you already
  have; they don't replace them. It registers nothing globally and sets no main
  status line.
- **It stays in its lane.** The only files it writes are tiny state files in its
  own data directory, and stale ones are cleaned up automatically.
- **It's path-traversal safe.** Session ids are sanitised before use as
  filenames; transcript paths are validated to live inside `~/.claude/projects/`.

### What it does *not* do

Live timestamps mark **prompt** and **turn-completion** boundaries — one line
when you send, one when Claude finishes. They are not stamped onto every
individual tool call or sub-message; that boundary set was chosen deliberately
to stay clean and noise-free rather than spamming a line after every file read.

---

## Uninstall / rollback

The plugin is fully reversible and leaves nothing behind:

```
/plugin disable timestamps      # keep it installed but turn it off
/plugin uninstall timestamps    # remove it entirely
```

Or set `"enabled": false` in `config.json` to silence it without uninstalling.
Uninstalling also removes the plugin's data directory (its state files and your
`config.json`).

---

## Publishing to GitHub

This repository is ready to publish as-is — the metadata is already wired to
`github.com/llewellynvz/claude-code-timestamps`. Create that repository on
GitHub, then from this folder run:

```bash
git init
git add .
git commit -m "timestamps plugin v1.0.0"
git branch -M main
git remote add origin https://github.com/llewellynvz/claude-code-timestamps.git
git push -u origin main
```

(If you use a different repository name, update the `homepage`/`repository`
fields in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`,
and the Option A install command above, to match.)

The repository is **its own plugin marketplace** (`.claude-plugin/marketplace.json`),
so once it's on GitHub the two-command install in [Option A](#option-a--install-from-github-recommended)
works for anyone — no separate marketplace repo needed.

Before pushing, run the checks:

```bash
node test/run-tests.js     # 41 checks, must pass clean
claude plugin validate .   # must report "Validation passed"
```

---

## Project layout

```
.claude-plugin/
  plugin.json          plugin manifest
  marketplace.json     makes this repo its own installable marketplace
hooks/
  hooks.json           registers the UserPromptSubmit + Stop hooks
scripts/
  timestamp-hook.js    the live hook (handles both events; safety contract)
  log.js               the /timestamps:log retrospective timeline
  lib/
    paths.js           resolves a writable data directory
    config.js          loads + defensively validates config.json
    render.js          all time/date/elapsed/line formatting
    state.js           per-session prompt-time store (path-traversal safe)
    transcript.js      locate + validate + parse transcript .jsonl files
skills/
  log/SKILL.md         the /timestamps:log skill definition
extras/
  statusline.js        optional, opt-in live status-line clock
test/
  run-tests.js         self-contained test suite (41 checks, zero deps)
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
