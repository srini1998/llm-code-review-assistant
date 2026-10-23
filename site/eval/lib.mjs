import { parseDiff } from '../src/diff.mjs';
import { MARK } from './cases.mjs';

export function prepare(c) {
  const stripped = c.diff.split('\n').map((l) => l.replace(MARK, '')).join('\n');
  const bugs = [];
  const marked = c.diff.split('\n');
  const files = parseDiff(stripped);
  // Map marked rows to file:newLine by walking both in lockstep.
  let idx = 0;
  for (const f of files) for (const h of f.hunks) for (const l of h.lines) {
    while (idx < marked.length && !marked[idx].startsWith(l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ')) idx++;
    // advance to the exact row for this line
    idx = marked.findIndex((r, i) => i >= idx && r.replace(MARK, '') === (l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ') + l.text);
    if (l.kind === 'add' && marked[idx].endsWith(MARK)) bugs.push({ file: f.path, line: l.newNo });
    idx++;
  }
  return { stripped, bugs };
}

export function score(findings, bugs) {
  const hit = new Set(), matched = new Set();
  findings.forEach((f, i) => bugs.forEach((b, j) => { if (f.file === b.file && f.line === b.line) { matched.add(i); hit.add(j); } }));
  return { findings: findings.length, tp: matched.size, fp: findings.length - matched.size, bugs: bugs.length, found: hit.size };
}
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
export function summarise(rows) {
  const s = rows.reduce((t, r) => ({ findings: t.findings + r.findings, tp: t.tp + r.tp, fp: t.fp + r.fp, bugs: t.bugs + r.bugs, found: t.found + r.found }), { findings: 0, tp: 0, fp: 0, bugs: 0, found: 0 });
  return { ...s, precision: pct(s.tp, s.findings), recall: pct(s.found, s.bugs) };
}

