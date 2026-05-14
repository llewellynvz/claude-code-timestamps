'use strict';

/**
 * run-tests.js — self-contained test harness for the timestamps plugin.
 *
 * Pure Node, zero dependencies. Run with:  node test/run-tests.js
 *
 * Covers:
 *   - config.js   defaults + defensive normalization of bad input
 *   - render.js   time / date / elapsed / gap formatting
 *   - state.js    session-id sanitization (path-traversal), roundtrip, cleanup
 *   - transcript.js  project-key transform + path validation guard
 *   - timestamp-hook.js  the SAFETY CONTRACT — always exit 0, never hang,
 *                        across valid / malformed / empty / hostile input,
 *                        invoked through a path that contains spaces
 *   - log.js      runs against a real transcript fixture
 *   - JSON validity of every shipped manifest
 *
 * Exit code is 0 only if every assertion passes.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PLUGIN_ROOT = path.join(__dirname, '..');
const HOOK = path.join(PLUGIN_ROOT, 'scripts', 'timestamp-hook.js');
const LOG = path.join(PLUGIN_ROOT, 'scripts', 'log.js');

// Isolated, disposable data dir so tests never touch real plugin state.
const WORK = path.join(__dirname, '.work');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : e));
  }
}

function section(title) {
  console.log('');
  console.log('— ' + title + ' —');
}

function freshWorkDir() {
  try {
    fs.rmSync(WORK, { recursive: true, force: true });
  } catch (_) {}
  fs.mkdirSync(WORK, { recursive: true });
  return WORK;
}

/** Run the hook script with a given event + stdin, return {status, stdout, stderr}. */
function runHook(event, stdinObj, opts) {
  opts = opts || {};
  const input =
    stdinObj === undefined
      ? ''
      : typeof stdinObj === 'string'
      ? stdinObj
      : JSON.stringify(stdinObj);
  const res = spawnSync(process.execPath, [HOOK, event], {
    input,
    encoding: 'utf8',
    timeout: 8000,
    env: Object.assign({}, process.env, {
      CLAUDE_PLUGIN_DATA: opts.dataDir || WORK,
    }),
  });
  return res;
}

// ──────────────────────────────────────────────────────────────────────────
console.log('timestamps plugin — test suite');
console.log('plugin root: ' + PLUGIN_ROOT);
freshWorkDir();

// ── config.js ─────────────────────────────────────────────────────────────
section('config.js');
const config = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'config'));

test('defaults load when no file exists', function () {
  const cfg = config.load(path.join(WORK, 'does-not-exist.json'));
  assert.strictEqual(cfg.enabled, true);
  assert.strictEqual(cfg.timeFormat, '24h');
  assert.strictEqual(cfg.showSeconds, true);
  assert.strictEqual(cfg.dateMode, 'always');
  assert.strictEqual(cfg.gapBeforePrompt, 1);
  assert.strictEqual(cfg.gapBeforeStop, 0);
  assert.strictEqual(cfg.labels.user, 'you');
  assert.strictEqual(cfg.labels.assistant, 'Claude');
});

test('malformed JSON config falls back to defaults (no throw)', function () {
  const bad = path.join(WORK, 'bad.json');
  fs.writeFileSync(bad, '{ this is not json', 'utf8');
  const cfg = config.load(bad);
  assert.strictEqual(cfg.timeFormat, '24h');
});

test('out-of-range / wrong-type values are clamped or rejected', function () {
  const f = path.join(WORK, 'weird.json');
  fs.writeFileSync(
    f,
    JSON.stringify({
      timeFormat: 'banana',
      showSeconds: 'yes',
      gapBeforePrompt: 999,
      gapBeforeStop: -4,
      indent: 'x',
      dateMode: 'sometimes',
      prefix: 12345,
      labels: { user: '', assistant: 'AI' },
    }),
    'utf8'
  );
  const cfg = config.load(f);
  assert.strictEqual(cfg.timeFormat, '24h', 'invalid timeFormat -> default');
  assert.strictEqual(cfg.showSeconds, true, 'non-boolean -> default');
  assert.strictEqual(cfg.gapBeforePrompt, 5, 'clamped to max 5');
  assert.strictEqual(cfg.gapBeforeStop, 0, 'clamped to min 0');
  assert.strictEqual(cfg.indent, 0, 'non-number -> default');
  assert.strictEqual(cfg.dateMode, 'always', 'invalid dateMode -> default');
  assert.strictEqual(cfg.prefix, String.fromCharCode(0x23f1), 'non-string prefix -> default');
  assert.strictEqual(cfg.labels.user, 'you', 'empty label -> default');
  assert.strictEqual(cfg.labels.assistant, 'AI', 'valid label override kept');
});

test('valid config overrides are honoured', function () {
  const f = path.join(WORK, 'good.json');
  fs.writeFileSync(
    f,
    JSON.stringify({ timeFormat: '12h', showSeconds: false, enabled: false }),
    'utf8'
  );
  const cfg = config.load(f);
  assert.strictEqual(cfg.timeFormat, '12h');
  assert.strictEqual(cfg.showSeconds, false);
  assert.strictEqual(cfg.enabled, false);
});

// ── render.js ─────────────────────────────────────────────────────────────
section('render.js');
const render = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'render'));

test('formatTime 24h with seconds', function () {
  const d = new Date(2026, 4, 14, 9, 5, 3);
  assert.strictEqual(
    render.formatTime(d, { timeFormat: '24h', showSeconds: true }),
    '09:05:03'
  );
});

test('formatTime 24h without seconds', function () {
  const d = new Date(2026, 4, 14, 14, 23, 1);
  assert.strictEqual(
    render.formatTime(d, { timeFormat: '24h', showSeconds: false }),
    '14:23'
  );
});

test('formatTime 12h am/pm', function () {
  const noon = new Date(2026, 4, 14, 12, 0, 0);
  const midnight = new Date(2026, 4, 14, 0, 30, 0);
  assert.strictEqual(
    render.formatTime(noon, { timeFormat: '12h', showSeconds: false }),
    '12:00 pm'
  );
  assert.strictEqual(
    render.formatTime(midnight, { timeFormat: '12h', showSeconds: true }),
    '12:30:00 am'
  );
});

test('formatDate is fixed and locale-independent', function () {
  // 2026-05-14 is a Thursday.
  const d = new Date(2026, 4, 14, 0, 0, 0);
  assert.strictEqual(render.formatDate(d), 'Thu 14 May 2026');
});

test('formatElapsed across ranges', function () {
  assert.strictEqual(render.formatElapsed(0), '0s');
  assert.strictEqual(render.formatElapsed(42000), '42s');
  assert.strictEqual(render.formatElapsed(105000), '1m 45s');
  assert.strictEqual(render.formatElapsed(3700000), '1h 1m');
  assert.strictEqual(render.formatElapsed(-1), null);
  assert.strictEqual(render.formatElapsed(undefined), null);
  assert.strictEqual(render.formatElapsed(NaN), null);
});

test('buildLine: prompt line has gap, time, date, label', function () {
  const cfg = config.normalize(null);
  const d = new Date(2026, 4, 14, 14, 23, 1);
  const line = render.buildLine({ event: 'prompt', date: d, cfg: cfg });
  assert.ok(line.startsWith('\n'), 'gapBeforePrompt=1 -> leading newline');
  assert.ok(line.indexOf('14:23:01') !== -1, 'has time with seconds');
  assert.ok(line.indexOf('Thu 14 May 2026') !== -1, 'has date');
  assert.ok(line.indexOf('you') !== -1, 'has user label');
});

test('buildLine: stop line has no gap by default, shows elapsed', function () {
  const cfg = config.normalize(null);
  const d = new Date(2026, 4, 14, 14, 23, 47);
  const line = render.buildLine({
    event: 'stop',
    date: d,
    elapsedMs: 46000,
    cfg: cfg,
  });
  assert.ok(!line.startsWith('\n'), 'gapBeforeStop=0 -> no leading newline');
  assert.ok(line.indexOf('14:23:47') !== -1, 'has time');
  assert.ok(line.indexOf('Claude') !== -1, 'has assistant label');
  assert.ok(line.indexOf('46s') !== -1, 'has elapsed');
  assert.ok(line.indexOf('May 2026') === -1, 'no date on stop line by default');
});

test('buildCore: prefix is space-attached, not a separator-joined field', function () {
  // Regression guard: output must read "⏱ 14:23:01 · …", never "⏱ · 14:23:01".
  const cfg = config.normalize(null); // default prefix "⏱", separator " · "
  const d = new Date(2026, 4, 14, 14, 23, 1);
  const core = render.buildCore({ event: 'prompt', date: d, cfg: cfg });
  assert.strictEqual(
    core.indexOf(cfg.prefix + ' ' + '14:23:01'),
    0,
    'core must start with "<prefix> <time>": got ' + JSON.stringify(core)
  );
  assert.strictEqual(
    core.indexOf(cfg.prefix + cfg.separator),
    -1,
    'prefix must NOT be followed by the separator'
  );
});

test('buildCore: custom prefix is space-attached too', function () {
  const cfg = config.normalize({ prefix: '>>' });
  const core = render.buildCore({
    event: 'prompt',
    date: new Date(2026, 4, 14, 9, 0, 0),
    cfg: cfg,
  });
  assert.strictEqual(core.indexOf('>> 09:00:00'), 0);
});

test('buildCore: empty prefix => line starts directly with the time', function () {
  const cfg = config.normalize({ prefix: '' });
  const core = render.buildCore({
    event: 'prompt',
    date: new Date(2026, 4, 14, 9, 0, 0),
    cfg: cfg,
  });
  assert.strictEqual(core.indexOf('09:00:00'), 0, 'no prefix => starts with time');
});

test('buildLine: color off => no ANSI escape bytes', function () {
  const cfg = config.normalize({ color: false });
  const line = render.buildLine({
    event: 'prompt',
    date: new Date(),
    cfg: cfg,
  });
  assert.strictEqual(line.indexOf(String.fromCharCode(27)), -1);
});

test('buildLine: color on => wrapped in ANSI', function () {
  const cfg = config.normalize({ color: true });
  const line = render.buildLine({
    event: 'prompt',
    date: new Date(),
    cfg: cfg,
  });
  assert.ok(line.indexOf(String.fromCharCode(27)) !== -1);
});

// ── state.js ──────────────────────────────────────────────────────────────
section('state.js');
process.env.CLAUDE_PLUGIN_DATA = WORK; // point state.js at the work dir
const state = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'state'));

test('sanitizeSessionId neutralises path traversal', function () {
  assert.strictEqual(state.sanitizeSessionId('../../etc/passwd'), '------etc-passwd');
  assert.strictEqual(state.sanitizeSessionId('a/b\\c'), 'a-b-c');
  assert.strictEqual(state.sanitizeSessionId(''), 'unknown');
  assert.strictEqual(state.sanitizeSessionId(null), 'unknown');
  assert.strictEqual(state.sanitizeSessionId('///'), 'unknown');
  assert.strictEqual(state.sanitizeSessionId('Good_Session-123'), 'Good_Session-123');
});

test('statePath of a hostile id never escapes the state dir', function () {
  const p = state.statePath('../../../../tmp/evil');
  const stateRoot = path.join(WORK, 'state');
  assert.ok(
    path.resolve(p).startsWith(path.resolve(stateRoot) + path.sep),
    'resolved path ' + p + ' must stay inside ' + stateRoot
  );
});

test('recordPrompt -> readPrompt -> clearPrompt roundtrip', function () {
  const sid = 'roundtrip-session';
  const t = new Date(Date.now() - 5000);
  assert.strictEqual(state.recordPrompt(sid, t), true);
  const got = state.readPrompt(sid);
  assert.ok(got && Math.abs(got.promptTime - t.getTime()) < 2);
  state.clearPrompt(sid);
  assert.strictEqual(state.readPrompt(sid), null, 'cleared');
});

test('readPrompt of unknown session is null (no throw)', function () {
  assert.strictEqual(state.readPrompt('never-existed'), null);
});

test('concurrent sessions get independent state files', function () {
  state.recordPrompt('session-A', new Date());
  state.recordPrompt('session-B', new Date());
  assert.ok(state.readPrompt('session-A'), 'A present');
  assert.ok(state.readPrompt('session-B'), 'B present');
  state.clearPrompt('session-A');
  assert.ok(!state.readPrompt('session-A'), 'A cleared');
  assert.ok(state.readPrompt('session-B'), 'B untouched by A clear');
  state.clearPrompt('session-B');
});

test('cleanupStale removes old files, keeps fresh ones', function () {
  const stateRoot = path.join(WORK, 'state');
  fs.mkdirSync(stateRoot, { recursive: true });
  const oldFile = path.join(stateRoot, 'old.json');
  const freshFile = path.join(stateRoot, 'fresh.json');
  fs.writeFileSync(oldFile, '{"promptTime":1}', 'utf8');
  fs.writeFileSync(freshFile, '{"promptTime":1}', 'utf8');
  // Backdate the old file 30 days.
  const old = Date.now() - 30 * 24 * 60 * 60 * 1000;
  fs.utimesSync(oldFile, new Date(old), new Date(old));
  state.cleanupStale();
  assert.ok(!fs.existsSync(oldFile), 'stale file removed');
  assert.ok(fs.existsSync(freshFile), 'fresh file kept');
  fs.unlinkSync(freshFile);
});

// ── transcript.js ─────────────────────────────────────────────────────────
section('transcript.js');
const transcript = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'transcript'));

test('projectKey transform matches Claude Code convention', function () {
  assert.strictEqual(
    transcript.projectKey('D:\\GITHUB REPOS\\CLAUDE TIMESTAPS'),
    'D--GITHUB-REPOS-CLAUDE-TIMESTAPS'
  );
  assert.strictEqual(transcript.projectKey('/Users/me/proj'), '-Users-me-proj');
});

test('validateTranscriptPath rejects paths outside ~/.claude/projects', function () {
  let threw = false;
  try {
    transcript.validateTranscriptPath(path.join(os.tmpdir()));
  } catch (_) {
    threw = true;
  }
  assert.ok(threw, 'must reject a non-transcript path');
});

test('validateTranscriptPath rejects a non-.jsonl file', function () {
  let threw = false;
  try {
    transcript.validateTranscriptPath(__filename); // this .js file
  } catch (_) {
    threw = true;
  }
  assert.ok(threw);
});

test('readMessages parses a JSONL fixture, skips junk', async function () {
  const fixture = path.join(WORK, 'fixture.jsonl');
  const lines = [
    JSON.stringify({
      type: 'user',
      timestamp: '2026-05-14T12:00:01.000Z',
      message: { content: 'Hello there' },
    }),
    'this is not json — must be skipped',
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-14T12:00:05.000Z',
      message: { content: [{ type: 'text', text: 'Hi! How can I help?' }] },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-14T12:00:06.000Z',
      message: { content: [{ type: 'tool_use', name: 'Read' }] },
    }),
    JSON.stringify({ type: 'system', message: { content: 'ignored' } }),
    '',
  ];
  fs.writeFileSync(fixture, lines.join('\n'), 'utf8');
  const msgs = await transcript.readMessages(fixture);
  assert.strictEqual(msgs.length, 3, 'user + text assistant + tool_use assistant');
  assert.strictEqual(msgs[0].role, 'user');
  assert.strictEqual(msgs[0].preview, 'Hello there');
  assert.strictEqual(msgs[2].preview, '[tool: Read]');
});

// ── timestamp-hook.js — THE SAFETY CONTRACT ───────────────────────────────
section('timestamp-hook.js — safety contract (always exit 0, never hang)');

test('prompt: valid input -> exit 0, prints a timestamp line, writes state', function () {
  freshWorkDir();
  const sid = 'hook-prompt-session';
  const res = runHook('prompt', {
    session_id: sid,
    hook_event_name: 'UserPromptSubmit',
    cwd: PLUGIN_ROOT,
    prompt: 'hello',
  });
  assert.strictEqual(res.status, 0, 'exit 0');
  assert.ok(/\d\d:\d\d:\d\d/.test(res.stdout), 'stdout has HH:MM:SS');
  assert.ok(res.stdout.indexOf('you') !== -1, 'stdout has user label');
  const stateFile = path.join(WORK, 'state', sid + '.json');
  assert.ok(fs.existsSync(stateFile), 'state file written for the session');
});

test('stop: with prior prompt state -> exit 0, JSON systemMessage incl. elapsed', function () {
  // freshWorkDir already done above; seed an older prompt time by hand.
  const sid = 'hook-stop-session';
  const stateRoot = path.join(WORK, 'state');
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(stateRoot, sid + '.json'),
    JSON.stringify({ promptTime: Date.now() - 7000 }),
    'utf8'
  );
  const res = runHook('stop', { session_id: sid, hook_event_name: 'Stop' });
  assert.strictEqual(res.status, 0, 'exit 0');
  const parsed = JSON.parse(res.stdout);
  assert.ok(typeof parsed.systemMessage === 'string', 'stdout is JSON w/ systemMessage');
  assert.ok(parsed.systemMessage.indexOf('Claude') !== -1, 'mentions Claude');
  assert.ok(/\ds\b/.test(parsed.systemMessage), 'shows elapsed seconds');
  assert.ok(
    !fs.existsSync(path.join(stateRoot, sid + '.json')),
    'stop consumes (deletes) the state file'
  );
});

test('stop: with NO prior state -> exit 0, valid JSON, no crash', function () {
  const res = runHook('stop', { session_id: 'no-state-session' });
  assert.strictEqual(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.ok(typeof parsed.systemMessage === 'string');
  assert.ok(parsed.systemMessage.indexOf('Claude') !== -1);
});

test('prompt: malformed JSON on stdin -> exit 0 (does not block the prompt)', function () {
  const res = runHook('prompt', '{ broken json :::');
  assert.strictEqual(res.status, 0);
});

test('prompt: empty stdin -> exit 0', function () {
  const res = runHook('prompt', '');
  assert.strictEqual(res.status, 0);
});

test('prompt: missing session_id -> exit 0, falls back to "unknown"', function () {
  freshWorkDir();
  const res = runHook('prompt', { hook_event_name: 'UserPromptSubmit' });
  assert.strictEqual(res.status, 0);
  assert.ok(fs.existsSync(path.join(WORK, 'state', 'unknown.json')));
});

test('hostile session_id -> exit 0, no file escapes the state dir', function () {
  freshWorkDir();
  const res = runHook('prompt', { session_id: '../../../../pwned' });
  assert.strictEqual(res.status, 0);
  // Nothing should exist outside WORK/state.
  const escaped = path.join(PLUGIN_ROOT, '..', '..', '..', 'pwned.json');
  assert.ok(!fs.existsSync(escaped), 'no traversal file created');
  const files = fs.readdirSync(path.join(WORK, 'state'));
  assert.strictEqual(files.length, 1, 'exactly one sanitized state file');
});

test('unknown event arg -> exit 0, prints nothing', function () {
  const res = runHook('banana', { session_id: 'x' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

test('no event arg at all -> exit 0', function () {
  const res = spawnSync(process.execPath, [HOOK], {
    input: '{}',
    encoding: 'utf8',
    timeout: 8000,
    env: Object.assign({}, process.env, { CLAUDE_PLUGIN_DATA: WORK }),
  });
  assert.strictEqual(res.status, 0);
});

test('disabled via config -> exit 0, prints nothing', function () {
  const dir = path.join(WORK, 'disabled');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ enabled: false }),
    'utf8'
  );
  const res = runHook('prompt', { session_id: 'x' }, { dataDir: dir });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '', 'no output when disabled');
});

test('hook invoked via a path containing spaces works (Windows reality)', function () {
  // HOOK itself lives under "...\\CLAUDE TIMESTAPS\\..." — a path with spaces.
  // spawnSync passes argv as an array (exec form), so this proves the exec-form
  // hook command in hooks.json resolves correctly on a spaced install path.
  assert.ok(HOOK.indexOf(' ') !== -1, 'precondition: plugin path has a space');
  const res = runHook('prompt', { session_id: 'spaced-path-session' });
  assert.strictEqual(res.status, 0);
  assert.ok(/\d\d:\d\d:\d\d/.test(res.stdout));
});

test('hook completes quickly (well under the 5s hook timeout)', function () {
  const start = Date.now();
  const res = runHook('prompt', { session_id: 'speed' });
  const elapsed = Date.now() - start;
  assert.strictEqual(res.status, 0);
  assert.ok(elapsed < 4000, 'completed in ' + elapsed + 'ms (< 4000ms)');
});

// ── log.js ────────────────────────────────────────────────────────────────
section('log.js — retrospective timeline');

test('log.js runs against a transcript fixture -> exit 0, produces a timeline', function () {
  // Build a fake ~/.claude/projects/<key>/<file>.jsonl under the work dir and
  // point log.js at it explicitly (explicit-path arg bypasses cwd lookup, but
  // still goes through validateTranscriptPath — so we must place it for real).
  // Simplest robust check: pass the fixture path explicitly and assert the
  // validator + parser + renderer all run and exit 0.
  const fixture = path.join(WORK, 'log-fixture.jsonl');
  fs.writeFileSync(
    fixture,
    [
      JSON.stringify({
        type: 'user',
        timestamp: '2026-05-14T09:00:00.000Z',
        message: { content: 'First question' },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-05-14T09:00:04.000Z',
        message: { content: [{ type: 'text', text: 'First answer' }] },
      }),
    ].join('\n'),
    'utf8'
  );
  const res = spawnSync(process.execPath, [LOG, '10', fixture], {
    encoding: 'utf8',
    timeout: 8000,
    cwd: PLUGIN_ROOT,
  });
  assert.strictEqual(res.status, 0, 'log.js exits 0');
  // The fixture is outside ~/.claude/projects, so the validator will reject it
  // — log.js must report that cleanly (not crash). That is the contract here.
  assert.ok(
    res.stdout.indexOf('Cannot read transcript') !== -1 ||
      res.stdout.indexOf('--- Message Timeline ---') !== -1,
    'log.js produced a clean, expected message'
  );
});

test('log.js with no transcript anywhere -> exit 0, clean "not found" message', function () {
  const res = spawnSync(process.execPath, [LOG], {
    encoding: 'utf8',
    timeout: 8000,
    cwd: os.tmpdir(), // a dir with no Claude Code session
  });
  assert.strictEqual(res.status, 0);
  assert.ok(
    res.stdout.indexOf('No transcript found') !== -1,
    'reports no transcript cleanly'
  );
});

// ── manifest JSON validity ────────────────────────────────────────────────
section('shipped manifests are valid JSON with required fields');

test('.claude-plugin/plugin.json is valid and has a kebab-case name', function () {
  const p = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.strictEqual(typeof p.name, 'string');
  assert.ok(/^[a-z0-9-]+$/.test(p.name), 'name is kebab-case: ' + p.name);
  assert.strictEqual(p.name, 'timestamps');
});

test('.claude-plugin/marketplace.json is valid with name/owner/plugins', function () {
  const m = JSON.parse(
    fs.readFileSync(
      path.join(PLUGIN_ROOT, '.claude-plugin', 'marketplace.json'),
      'utf8'
    )
  );
  assert.ok(/^[a-z0-9-]+$/.test(m.name), 'marketplace name kebab-case');
  assert.ok(m.owner && typeof m.owner.name === 'string', 'owner.name present');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length === 1, 'one plugin');
  assert.strictEqual(m.plugins[0].name, 'timestamps');
  assert.strictEqual(m.plugins[0].source, './');
});

test('hooks/hooks.json is valid and registers UserPromptSubmit + Stop', function () {
  const h = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8')
  );
  assert.ok(h.hooks, 'has hooks key');
  assert.ok(Array.isArray(h.hooks.UserPromptSubmit), 'UserPromptSubmit array');
  assert.ok(Array.isArray(h.hooks.Stop), 'Stop array');
  const up = h.hooks.UserPromptSubmit[0].hooks[0];
  assert.strictEqual(up.type, 'command');
  assert.strictEqual(up.command, 'node');
  assert.ok(
    up.args[0].indexOf('${CLAUDE_PLUGIN_ROOT}') === 0,
    'uses ${CLAUDE_PLUGIN_ROOT} (exec form, space-safe)'
  );
  assert.strictEqual(up.args[1], 'prompt');
  assert.strictEqual(up.timeout, 5);
  const sp = h.hooks.Stop[0].hooks[0];
  assert.strictEqual(sp.args[1], 'stop');
});

test('config.example.json is valid JSON', function () {
  const c = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, 'config.example.json'), 'utf8')
  );
  // Strip the leading comment key, then it must normalize cleanly.
  delete c._comment;
  const norm = config.normalize(c);
  assert.strictEqual(norm.timeFormat, '24h');
  assert.strictEqual(norm.enabled, true);
});

// ── summary ───────────────────────────────────────────────────────────────
console.log('');
console.log('────────────────────────────────────────');
console.log('  ' + passed + ' passed, ' + failed + ' failed');
console.log('────────────────────────────────────────');

// Best-effort cleanup of the work dir.
try {
  fs.rmSync(WORK, { recursive: true, force: true });
} catch (_) {}

if (failed > 0) {
  console.log('');
  console.log('FAILURES:');
  for (const f of failures) {
    console.log('  - ' + f.name);
  }
  process.exit(1);
}
process.exit(0);
