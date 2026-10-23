// Seeded-bug benchmark runner. `node eval/run.mjs` scores the offline passes (pattern + syntax-tree).
// `node eval/run.mjs --llm` also calls Groq with the production prompt (needs GROQ_API_KEY in the environment; never printed).
import { writeFileSync } from 'node:fs';
import { staticReview, llmPayload } from '../src/review.mjs';
import { MODEL, buildMessages, parseAndVerify, callGroq } from '../api/_review.js';
import { CASES } from './cases.mjs';
import { prepare, score, summarise } from './lib.mjs';

const sets = { dev: CASES.filter((c) => c.set === 'dev'), test: CASES.filter((c) => c.set === 'test') };
const withLlm = process.argv.includes('--llm');
const result = { generatedAt: new Date().toISOString(), note: 'Synthetic hand-written diffs. A finding is a true positive only on the exact seeded line; real but unlabeled issues count as false positives, so precision is a lower bound.', model: withLlm ? MODEL : null, sets: {} };
const key = process.env.GROQ_API_KEY;
if (withLlm && !key) { console.error('GROQ_API_KEY is not set'); process.exit(1); }

for (const [name, cases] of Object.entries(sets)) {
  const per = { offline: [], llm: [], combined: [] }; const detail = [];
  for (const c of cases) {
    const { stripped, bugs } = prepare(c);
    const sr = staticReview(stripped);
    const off = sr.findings;
    per.offline.push(score(off, bugs));
    let llm = [], dropped = 0, err = null;
    if (withLlm) {
      const payload = llmPayload(sr.files);
      try {
        const r = await callGroq(key, buildMessages(payload.files));
        if (r.status !== 200) err = 'HTTP ' + r.status; else { const p = parseAndVerify(r.text, payload.files); if (p.error) err = p.error; else { llm = p.findings; dropped = p.dropped.length; } }
      } catch (e) { err = 'request failed'; }
      await new Promise((r) => setTimeout(r, 2500));
      per.llm.push(score(llm, bugs));
      const seen = new Set(off.map((f) => f.file + ':' + f.line));
      per.combined.push(score([...off, ...llm.filter((f) => !seen.has(f.file + ':' + f.line))], bugs));
    }
    detail.push({ id: c.id, title: c.title, seeded: bugs.length, offline: per.offline.at(-1), llm: withLlm ? per.llm.at(-1) : undefined, llmDroppedUnverified: withLlm ? dropped : undefined, llmError: err || undefined });
  }
  result.sets[name] = { cases: cases.length, offline: summarise(per.offline), ...(withLlm ? { llm: summarise(per.llm), combined: summarise(per.combined) } : {}), detail };
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.sets).map(([k, v]) => [k, { offline: v.offline, llm: v.llm, combined: v.combined }])), null, 1));
if (process.argv.includes('--write')) writeFileSync(new URL(withLlm ? './results.json' : './results-offline.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
