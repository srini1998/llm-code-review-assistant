# LLM Code Review Assistant

A provider outage must not produce a convincing canned review unrelated to submitted code.

Submit a bounded diff to local Ollama. Invalid/unavailable responses fail explicitly. Critical findings prevent approval.

See [review](docs/review.md) and [actual checks](docs/test-results.txt) for data, validation and limitations.

```sh
python -m pytest tests -q
```

No production-readiness or independent model-quality guarantee is claimed.

## Galley Proof (web version, `site/`)

A browser product around the same idea: paste a unified diff or a public GitHub pull request URL and get findings anchored to the exact added line, from three independent passes.

1. 23 line-level pattern rules (JavaScript, TypeScript, Python) over added lines only.
2. A syntax-tree pass (acorn) for JavaScript hunks: const reassignment, NaN comparison, typeof typos, dead code, duplicate keys, unparsable new files.
3. An optional model pass through a server function (`api/review.js`, Groq free plan, key server-side only, input validation, 160-line / 512-token caps, per-IP and daily limits, fails closed). Findings whose file/line/quoted text is not really in the diff are discarded.

The first two passes run with no network. Tests: `cd site && npm test` (21 tests). Benchmark: `npm run eval` (offline) and `npm run eval:llm` (needs `GROQ_API_KEY` in the environment). Benchmark corpus: 24 hand-written diffs with 25 planted bugs; results in `site/eval/results.json`. The cases are synthetic and written by the same author as the rules, so the numbers are an upper bound for real code. The original Python module in `src/` is unchanged (`python -m pytest tests -q`, 16 tests).
