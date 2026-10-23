import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASES } from '../eval/cases.mjs';
import { staticReview } from '../src/review.mjs';

test('benchmark corpus shape: 24 hand-written cases, 4 clean, seeded line markers resolve to added lines', async () => {
  assert.equal(CASES.length, 24);
  assert.equal(CASES.filter((c) => c.set === 'test').length, 14);
  const { prepare } = await import('../eval/lib.mjs');
  let seeded = 0;
  for (const c of CASES) {
    const { stripped, bugs } = prepare(c);
    assert.ok(!stripped.includes('⟦B⟧'));
    seeded += bugs.length;
    const files = staticReview(stripped).files;
    for (const b of bugs) assert.ok(files.find((f) => f.path === b.file).hunks.some((h) => h.lines.some((l) => l.kind === 'add' && l.newNo === b.line)));
  }
  assert.equal(seeded, 25);
});
test('offline passes keep zero false positives on clean cases and the recorded floor on held-out recall', async () => {
  const { prepare, score, summarise } = await import('../eval/lib.mjs');
  const rows = CASES.filter((c) => c.set === 'test').map((c) => { const p = prepare(c); return score(staticReview(p.stripped).findings, p.bugs); });
  const s = summarise(rows);
  assert.ok(s.precision >= 90, 'precision ' + s.precision);
  assert.ok(s.recall >= 80, 'recall ' + s.recall);
  for (const c of CASES.filter((x) => x.id.match(/t1[234]/))) assert.equal(staticReview(prepare(c).stripped).findings.length, 0, c.id);
});
test('recorded results file exists, is labeled, and has the held-out set', () => {
  const r = JSON.parse(readFileSync(new URL('../eval/results.json', import.meta.url), 'utf8'));
  assert.match(r.note, /Synthetic/);
  assert.ok(r.sets.test.llm && r.sets.test.combined);
});
