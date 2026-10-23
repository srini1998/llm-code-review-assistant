import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, addedLines } from '../src/diff.mjs';
import { runRules, RULES } from '../src/rules.mjs';
import { staticReview, dedupe, llmPayload } from '../src/review.mjs';
import { parsePrUrl, fetchPrDiff } from '../src/github.mjs';

const mk = (path, lines) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,${lines.length} @@\n` + lines.map((l) => '+' + l).join('\n') + '\n';

test('diff parser tracks new-side line numbers across hunks and ignores deletions', () => {
  const f = parseDiff('diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1,3 +1,3 @@\n keep\n-old\n+new\n keep2\n@@ -40,2 +40,3 @@\n ctx\n+added\n ctx2\n');
  assert.equal(f.length, 1);
  assert.deepEqual(addedLines(f[0]).map((l) => [l.newNo, l.text]), [[2, 'new'], [41, 'added']]);
});
test('new file, rename-free multi-file diff, and non-diff input', () => {
  const two = mk('a.py', ['x = 1']) + mk('b.js', ['let y']);
  assert.deepEqual(parseDiff(two).map((f) => f.path), ['a.py', 'b.js']);
  assert.throws(() => parseDiff('just some text'), /No reviewable hunks/);
  assert.throws(() => parseDiff('x'.repeat(200000)), /over 150,000/);
});
test('every rule fires on its positive example and not on its decoy', () => {
  const cases = {
    'secret-literal': ['const api_key = "abcd1234efgh5678ijkl";', 'const apiKey = process.env.KEY;', 'a.js'],
    'tls-verify-off': ['{ rejectUnauthorized: false }', '{ rejectUnauthorized: true }', 'a.js'],
    'weak-hash': ["crypto.createHash('md5')", "crypto.createHash('sha256')", 'a.js'],
    'js-eval': ['const r = eval(s);', 'const medieval = 1; // evaluate', 'a.js'],
    'js-html-sink': ['el.innerHTML = a + b;', "el.innerHTML = '<b>fixed</b>';", 'a.js'],
    'js-sql-concat': ['const q = "SELECT a FROM t WHERE id=" + id;', '// select the first item and from there continue', 'a.js'],
    'js-shell-exec': ['exec(`ls ${dir}`)', "execFile('ls', [dir])", 'a.js'],
    'js-loose-eq': ['if (a == b) {}', 'if (a == null) {}', 'a.js'],
    'js-assign-in-cond': ['if (user = getUser()) {', 'if (user === getUser()) {', 'a.js'],
    'js-length-overrun': ['for (let i = 0; i <= xs.length; i++) {', 'for (let i = 0; i < xs.length; i++) {', 'a.js'],
    'js-empty-catch': ['try { f() } catch (e) {}', 'try { f() } catch (e) { log(e) }', 'a.js'],
    'js-foreach-async': ['xs.forEach(async (x) => {', 'xs.forEach((x) => {', 'a.js'],
    'js-math-random-secret': ['const token = Math.random();', 'const jitter = Math.random();', 'a.js'],
    'py-mutable-default': ['def f(a, b=[]):', 'def f(a, b=None):', 'a.py'],
    'py-bare-except': ['    except:', '    except ValueError:', 'a.py'],
    'py-shell-true': ['subprocess.run(c, shell=True)', 'subprocess.run(c, shell=False)', 'a.py'],
    'py-yaml-load': ['yaml.load(s)', 'yaml.load(s, Loader=yaml.SafeLoader)', 'a.py'],
    'py-eval-exec': ['x = eval(s)', 'x = literal_eval(s)', 'a.py'],
    'py-sql-format': ['cur.execute(f"SELECT {x}")', 'cur.execute("SELECT ?", (x,))', 'a.py'],
    'py-is-literal': ["if a is 'x':", 'if a is None:', 'a.py'],
    'py-eq-none': ['if a == None:', 'if a is None:', 'a.py'],
    'py-range-len-plus': ['for i in range(len(xs) + 1):', 'for i in range(len(xs)):', 'a.py'],
    'py-requests-timeout': ['requests.get(u)', 'requests.get(u, timeout=5)', 'a.py'],
  };
  for (const r of RULES) assert.ok(cases[r.id], 'no test for rule ' + r.id);
  for (const [id, [bad, good, path]] of Object.entries(cases)) {
    const hit = (s) => runRules(parseDiff(mk(path, [s]))).some((f) => f.rule === id);
    assert.ok(hit(bad), id + ' should fire on: ' + bad);
    assert.ok(!hit(good), id + ' should not fire on: ' + good);
  }
});
test('findings only ever anchor to added lines, never context', () => {
  const d = 'diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1,3 +1,3 @@\n if (a = 1) {}\n-x\n+y\n z\n';
  assert.equal(staticReview(d).findings.length, 0);
});
test('syntax-tree pass finds const assignment, NaN compare, typeof typo, unreachable code, duplicate key', () => {
  const d = mk('a.js', ['const t = 0;', 'for (const i of xs) { t += i; }', 'if (v === NaN) {}', "if (typeof v === 'strnig') {}", 'function f() {', '  return 1;', '  g();', '}', 'const o = { a: 1, a: 2 };']);
  const ids = staticReview(d).findings.flatMap((f) => f.rules);
  for (const id of ['js-const-assign', 'js-nan-compare', 'js-typeof-typo', 'js-unreachable', 'js-dup-key']) assert.ok(ids.includes(id), id);
});
test('hunks that are not self-contained are skipped, never invented as syntax errors', () => {
  const r = staticReview('diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -5,2 +5,3 @@\n   foo();\n+  }\n   bar();\n');
  assert.equal(r.findings.length, 0);
  assert.equal(r.stats.skipped, 1);
});
test('a brand-new JS file that does not parse is reported on the offending line', () => {
  const d = 'diff --git a/n.js b/n.js\nnew file mode 100644\n--- /dev/null\n+++ b/n.js\n@@ -0,0 +1,3 @@\n+const a = 1;\n+const = 2;\n+a;\n';
  const f = staticReview(d).findings;
  assert.equal(f[0].rule, 'js-syntax'); assert.equal(f[0].line, 2);
});
test('dedupe merges same line and category, keeps higher severity and both sources', () => {
  const out = dedupe([{ file: 'a', line: 1, category: 'bug', severity: 'medium', source: 'pattern', rule: 'r', message: 'p' }, { file: 'a', line: 1, category: 'bug', severity: 'high', source: 'llm', message: 'l' }]);
  assert.equal(out.length, 1); assert.equal(out[0].severity, 'high'); assert.deepEqual(out[0].sources, ['pattern', 'llm']); assert.equal(out[0].message, 'p');
});
test('LLM payload carries only added lines, bounded', () => {
  const lines = Array.from({ length: 300 }, (_, i) => 'let v' + i + ' = 1;');
  const p = llmPayload(parseDiff(mk('a.js', lines)));
  assert.equal(p.files[0].lines.length, 160); assert.equal(p.truncated, true);
});
test('PR URL parsing is strict and fetch maps failures to clear messages', async () => {
  assert.deepEqual(parsePrUrl('https://github.com/a/b/pull/12/files'), { owner: 'a', repo: 'b', number: 12 });
  for (const bad of ['http://github.com/a/b/pull/1', 'https://evil.com/a/b/pull/1', 'https://github.com/a/b/issues/1', 'https://github.com/a/b/pull/x', 'javascript:alert(1)']) assert.throws(() => parsePrUrl(bad));
  const f = (status, body = '') => async () => ({ status, ok: status < 300, text: async () => body });
  assert.match(await fetchPrDiff('https://github.com/a/b/pull/1', f(200, 'diff')).then((r) => r.text), /diff/);
  await assert.rejects(fetchPrDiff('https://github.com/a/b/pull/1', f(404)), /not found/);
  await assert.rejects(fetchPrDiff('https://github.com/a/b/pull/1', f(403)), /limit/);
  await assert.rejects(fetchPrDiff('https://github.com/a/b/pull/1', async () => { throw new Error('net'); }), /Paste the diff/);
});
