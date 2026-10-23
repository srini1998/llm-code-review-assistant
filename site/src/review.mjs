import { parseDiff, addedLines } from './diff.mjs';
import { runRules } from './rules.mjs';
import { runAst } from './ast.mjs';

export const SEV = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export function dedupe(findings) {
  const by = new Map();
  for (const f of findings) {
    const key = f.file + ':' + f.line + ':' + f.category;
    const prev = by.get(key);
    if (!prev) { by.set(key, { ...f, sources: [f.source], rules: f.rule ? [f.rule] : [] }); continue; }
    if (!prev.sources.includes(f.source)) prev.sources.push(f.source);
    if (f.rule && !prev.rules.includes(f.rule)) prev.rules.push(f.rule);
    if (SEV[f.severity] > SEV[prev.severity]) prev.severity = f.severity;
    if (f.source !== 'llm' && prev.source === 'llm') { prev.message = f.message; prev.source = f.source; }
  }
  return [...by.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || SEV[b.severity] - SEV[a.severity]);
}

/** Pass 1 + 2 run entirely in the browser (or Node). The LLM pass is separate and optional. */
export function staticReview(diffText) {
  const files = parseDiff(diffText);
  const ast = runAst(files);
  const findings = dedupe([...runRules(files), ...ast.findings]);
  const added = files.reduce((n, f) => n + addedLines(f).length, 0);
  return { files, findings, stats: { files: files.length, addedLines: added, ...ast.stats } };
}

/** Compact line list sent to the model: added lines only (plus nothing else), with their file line numbers. */
export function llmPayload(files, maxLines = 160, maxLineChars = 220) {
  const out = []; let n = 0, truncated = false;
  for (const f of files) {
    const lines = [];
    for (const l of addedLines(f)) {
      if (!l.text.trim()) continue;
      if (n >= maxLines) { truncated = true; break; }
      lines.push({ n: l.newNo, t: l.text.slice(0, maxLineChars) }); n++;
    }
    if (lines.length) out.push({ path: f.path.slice(0, 200), lines });
    if (truncated) break;
  }
  return { files: out.slice(0, 6), truncated: truncated || out.length > 6 };
}
