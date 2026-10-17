# Engineering review / October 17, 2026

## problem
A provider outage must not produce a convincing canned review unrelated to submitted code.

## example
Submit a bounded diff to local Ollama. Invalid/unavailable responses fail explicitly. Critical findings prevent approval.

## dataSource
Operator diffs; explicitly labeled fixed fixtures for adapter tests.

## verification
16 passing checks include provider error without fixture substitution and approval gating. No independent model-quality benchmark.

## limitations
Human review required. Scores are not correctness probabilities. No hosted API billing in this profile.

## Reproduce
Python 3.12, free project requirements and pytest: `python -m pytest tests -q`. Actual output: docs/test-results.txt. No paid API calls used. Optional local generation needs Ollama/qwen2.5:3b.
