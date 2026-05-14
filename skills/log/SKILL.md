---
description: Show a timestamped timeline of recent messages in the current Claude Code conversation. Use when the user asks to see when messages were sent, review conversation timing, or wants a history of the session with timestamps.
argument-hint: [count]
allowed-tools: Bash(node:*)
model: haiku
---

# Message Timeline

Display a retrospective, timestamped timeline of the current conversation by
reading Claude Code's own transcript file for this project.

## What to do

1. Run the timeline script. It locates the current project's transcript
   automatically and prints the formatted timeline to stdout:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/log.js" $ARGUMENTS
   ```

2. Show the script's output to the user **inside a fenced code block** so the
   columns stay aligned. Do not add commentary, analysis, or summary beyond the
   timeline itself.

## Notes

- `$ARGUMENTS` is an optional message count (e.g. `50`). If omitted, the script
  shows the last 20 messages. Any non-numeric argument is treated as an explicit
  transcript path; a bare number is the count.
- The script is self-contained: it finds the transcript, validates that the
  path is a real `.jsonl` file inside `~/.claude/projects/`, parses it, and
  prints the result. It never reads the transcript with the Read tool (these
  files can be very large).
- If the script reports that no transcript was found, relay that message to the
  user as-is — it means this command was not run from a directory with an
  active Claude Code session.
- This `/timestamps:log` skill is the *retrospective* view. The plugin also adds
  *live* timestamp lines to every message automatically via its hooks — that
  part needs no command.
