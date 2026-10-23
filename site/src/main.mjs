import '@fontsource/unifrakturcook/700.css';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/700.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import './style.css';
import { staticReview, llmPayload, dedupe } from './review.mjs';
import { fetchPrDiff } from './github.mjs';
import { RULES } from './rules.mjs';
import { CASES } from '../eval/cases.mjs';
import { prepare } from '../eval/lib.mjs';
import results from '../eval/results.json';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const SOURCE = { pattern: 'Pattern rule', 'syntax-tree': 'Syntax tree', llm: 'Model, anchor-checked' };
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circ = (i) => CIRCLED[i] ?? `(${i + 1})`;
const specimens = CASES.filter((c) => c.set === 'dev' || c.set === 'test');
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const pct = (v) => (v == null ? 'n/a' : v.toFixed(1) + '%');
const row = (label, m) => `<tr><th scope="row">${label}</th><td>${m.findings}</td><td>${pct(m.precision)}</td><td>${m.found}/${m.bugs}</td><td>${pct(m.recall)}</td></tr>`;
const bench = (set, name, note) => `<div class="bench-block"><h3>${name}</h3><p class="note">${note}</p><table><thead><tr><th scope="col">Passes</th><th scope="col">Findings</th><th scope="col">Precision</th><th scope="col">Found</th><th scope="col">Recall</th></tr></thead><tbody>${row('Pattern + syntax tree', set.offline)}${row('Model alone', set.llm)}${row('All passes together', set.combined)}</tbody></table></div>`;

$('#app').innerHTML = `
<a class="skip" href="#desk">Skip to the copy desk</a>
<header class="masthead">
  <p class="dateline"><span>${esc(today)}</span><span>Free edition · Reviewed in your browser</span><span>No paid services</span></p>
  <h1><span class="blackletter">The Galley Proof</span></h1>
  <p class="tagline">A pull request, read once by machines and marked up in red.</p>
</header>
<main>
<section class="desk" id="desk" aria-labelledby="desk-h">
  <div class="rule-title"><h2 id="desk-h">The copy desk</h2><span>Set your copy</span></div>
  <div class="desk-grid">
    <form id="form" novalidate>
      <div class="tabs" role="tablist" aria-label="Input type">
        <button type="button" role="tab" id="t-diff" aria-selected="true" aria-controls="p-diff">Paste a diff</button>
        <button type="button" role="tab" id="t-pr" aria-selected="false" aria-controls="p-pr" tabindex="-1">Public PR link</button>
        <button type="button" role="tab" id="t-spec" aria-selected="false" aria-controls="p-spec" tabindex="-1">Seeded specimens</button>
      </div>
      <div id="p-diff" role="tabpanel" aria-labelledby="t-diff"><label for="diff">Unified diff (git diff, or a pull request .diff)</label><textarea id="diff" rows="10" spellcheck="false" maxlength="150000" placeholder="diff --git a/app.js b/app.js&#10;--- a/app.js&#10;+++ b/app.js&#10;@@ -1,3 +1,4 @@&#10; ..."></textarea></div>
      <div id="p-pr" role="tabpanel" aria-labelledby="t-pr" hidden><label for="pr">Public pull request URL</label><input id="pr" type="url" inputmode="url" maxlength="200" placeholder="https://github.com/owner/repo/pull/123" autocomplete="off"><p class="note">One unauthenticated GitHub request from your browser (GitHub allows 60 an hour per IP). Private repositories will not load.</p></div>
      <div id="p-spec" role="tabpanel" aria-labelledby="t-spec" hidden><label for="spec">Hand-written test diffs with known planted bugs</label><select id="spec">${specimens.map((c) => `<option value="${c.id}">${esc(c.id.toUpperCase())} · ${esc(c.title)}${c.set === 'test' ? ' (held-out)' : ''}</option>`).join('')}</select><p class="note">Synthetic specimens from the benchmark below. After review, the answer key shows which planted lines were caught.</p></div>
      <div class="send"><label class="check"><input type="checkbox" id="use-model"> <span id="model-label">Ask the model too</span></label><button type="submit" class="press" id="go">Send to the desk</button></div>
      <p id="error" role="alert" hidden></p>
    </form>
    <aside class="how" aria-label="How the passes work">
      <h3>Three readers, one line number</h3>
      <ol>
        <li><b>Pattern rules.</b> ${RULES.length} line-level rules for JavaScript, TypeScript and Python, run on added lines only.</li>
        <li><b>Syntax tree.</b> JavaScript hunks are parsed with acorn: constant assignments, NaN tests, dead code, broken new files.</li>
        <li><b>Model.</b> Optional. Added lines go to a free hosted model; any finding whose line or quoted text is not really in your diff is thrown away.</li>
      </ol>
      <p class="note">The pattern and syntax passes need no network and no model.</p>
    </aside>
  </div>
</section>
<section id="proof" aria-live="polite" aria-label="Review results" hidden></section>
<section class="benchmark" aria-labelledby="bench-h">
  <div class="rule-title"><h2 id="bench-h">The planted-bug benchmark</h2><span>Measured, ${esc(new Date(results.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</span></div>
  <p class="lede">24 short diffs, written by hand for this page, with 25 deliberately planted bugs and 4 clean diffs. A finding scores only if it sits on the exact planted line; real problems nobody labeled count against precision, so precision is a floor. The rules were written while looking at the 10 development diffs. The 14 held-out diffs came after, but by the same author, so treat the numbers as an upper bound for real-world code.</p>
  <div class="bench-grid">
    ${bench(results.sets.test, 'Held-out set', `${results.sets.test.cases} diffs · ${results.sets.test.offline.bugs} planted bugs`)}
    ${bench(results.sets.dev, 'Development set', `${results.sets.dev.cases} diffs · ${results.sets.dev.offline.bugs} planted bugs · rules were tuned here`)}
  </div>
  <p class="note">Model column: ${esc(results.model)} on Groq’s free plan, recorded ${esc(new Date(results.generatedAt).toISOString().slice(0, 10))} with the production prompt; it varies from run to run. The offline columns are recomputed by the test suite.</p>
</section>
<section class="limits" aria-labelledby="lim-h">
  <div class="rule-title"><h2 id="lim-h">Corrections and limits</h2><span>Read before relying</span></div>
  <ul>
    <li>Pattern rules read one line at a time. They know no types, no data flow and no framework, and they miss anything not on their list.</li>
    <li>Only JavaScript is parsed into a syntax tree, and only hunks that stand alone as code. TypeScript is tried and skipped if it does not parse. Python gets pattern rules only.</li>
    <li>The model sees only the added lines (at most 160 lines, 6 files), not the rest of your repository. It is wrong often enough that every finding it raises is shown labeled and unverified as to truth: only its location is checked.</li>
    <li>“No findings” is not “correct”. This page is a second pair of eyes, not a test suite or a security audit.</li>
    <li>Free tier limits: 6 model reviews per 10 minutes per visitor, a daily cap for the site, no paid fallback. When it runs out the other passes still work.</li>
  </ul>
  <details><summary>All ${RULES.length} pattern rules</summary><ul class="rulelist">${RULES.map((r) => `<li><code>${esc(r.id)}</code> <span class="sev sev-${r.severity}">${r.severity}</span> ${esc(r.message)}</li>`).join('')}</ul></details>
</section>
</main>
<footer><p>Set in Libre Caslon, UnifrakturCook, Courier Prime and Caveat. Source: <a href="https://github.com/srini1998/llm-code-review-assistant">srini1998/llm-code-review-assistant</a>.</p></footer>`;

// ---- tabs
const tabs = ['diff', 'pr', 'spec'];
let mode = 'diff';
function setMode(m, focus) {
  mode = m;
  for (const t of tabs) {
    const sel = t === m;
    $('#t-' + t).setAttribute('aria-selected', sel); $('#t-' + t).tabIndex = sel ? 0 : -1; $('#p-' + t).hidden = !sel;
    if (sel && focus) $('#t-' + t).focus();
  }
}
for (const t of tabs) $('#t-' + t).addEventListener('click', () => setMode(t));
$('.tabs').addEventListener('keydown', (e) => {
  const i = tabs.indexOf(mode);
  if (e.key === 'ArrowRight') { e.preventDefault(); setMode(tabs[(i + 1) % 3], true); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); setMode(tabs[(i + 2) % 3], true); }
});

// ---- model availability (the product works without it)
let modelOn = false;
fetch('/api/review').then((r) => (r.ok ? r.json() : null)).then((j) => {
  modelOn = !!j?.enabled;
  const box = $('#use-model');
  box.disabled = !modelOn; box.checked = modelOn;
  $('#model-label').textContent = modelOn ? 'Ask the model too (free tier, 6 per 10 minutes)' : 'Model pass not connected (other passes still run)';
}).catch(() => { $('#use-model').disabled = true; $('#model-label').textContent = 'Model pass not connected (other passes still run)'; });
$('#use-model').disabled = true;

// ---- review
const err = (m) => { const e = $('#error'); e.textContent = m; e.hidden = !m; };
let busy = false;
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  err('');
  busy = true; $('#go').disabled = true; $('#go').textContent = 'At the desk…';
  try {
    let text, label, key = null;
    if (mode === 'diff') { text = $('#diff').value; label = 'Pasted diff'; if (!text.trim()) throw new Error('Paste a unified diff first.'); }
    else if (mode === 'pr') { const r = await fetchPrDiff($('#pr').value); text = r.text; label = `${r.owner}/${r.repo} pull request #${r.number}`; }
    else { const c = CASES.find((x) => x.id === $('#spec').value); const p = prepare(c); text = p.stripped; key = p.bugs; label = `Specimen ${c.id.toUpperCase()} · ${c.title}`; }
    const sr = staticReview(text);
    render(sr, label, key, { model: $('#use-model').checked && modelOn ? 'pending' : 'off' });
    if ($('#use-model').checked && modelOn) {
      let model;
      try { model = await askModel(sr); } catch (x) { model = { status: 'error', message: x.message }; }
      render(sr, label, key, model);
    }
  } catch (x) { err(x.message); }
  finally { busy = false; $('#go').disabled = false; $('#go').textContent = 'Send to the desk'; }
});

async function askModel(sr) {
  const payload = llmPayload(sr.files);
  if (!payload.files.length) return { status: 'error', message: 'There were no added lines to send.' };
  const r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: payload.files }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { status: 'error', message: j.error || 'The model pass failed (' + r.status + ').' };
  return { status: 'ok', findings: j.findings, dropped: j.droppedUnverified, truncated: payload.truncated, model: j.model };
}

function render(sr, label, key, model) {
  const all = dedupe([...sr.findings, ...(model.status === 'ok' ? model.findings : [])]);
  const byLine = new Map();
  all.forEach((f, i) => { f.n = i; const k = f.file + ':' + f.line; (byLine.get(k) ?? byLine.set(k, []).get(k)).push(f); });
  const counts = ['critical', 'high', 'medium', 'low'].map((s) => [s, all.filter((f) => f.severity === s).length]).filter(([, n]) => n);
  const keySet = key ? new Set(key.map((b) => b.file + ':' + b.line)) : null;
  const caught = key ? key.filter((b) => byLine.has(b.file + ':' + b.line)).length : 0;
  const files = sr.files.map((f) => {
    const lines = f.hunks.map((h) => `<div class="hunk-head">${esc(h.header)}</div>` + h.lines.map((l) => {
      const k = f.path + ':' + l.newNo, fs = l.kind === 'add' ? byLine.get(k) : null;
      const planted = keySet && l.kind === 'add' && keySet.has(k);
      const cls = ['ln', l.kind, fs ? 'flag lv-' + fs.reduce((m, x) => (['low', 'medium', 'high', 'critical'].indexOf(x.severity) > ['low', 'medium', 'high', 'critical'].indexOf(m) ? x.severity : m), 'low') : '', planted ? 'planted' : ''].join(' ');
      const marks = fs ? fs.map((x) => `<span class="mark" aria-hidden="true">${circ(x.n)}</span>`).join('') : '';
      const notes = fs ? fs.map((x) => `<aside class="note-red"><p><span class="no">${circ(x.n)}</span> <b>${esc(x.severity)} · ${esc(x.category)}</b> ${esc(x.message)}</p><p class="src">${(x.sources ?? [x.source]).map((s) => esc(SOURCE[s] ?? s)).join(' + ')}${x.rules?.length ? ' · <code>' + esc(x.rules.join(', ')) + '</code>' : ''}${(x.sources ?? []).length > 1 ? ' · <b>two readers agree</b>' : ''}</p></aside>`).join('') : '';
      return `<div class="${cls}"><span class="num" aria-hidden="true">${l.newNo ?? ''}</span><span class="sign" aria-hidden="true">${l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span><code class="src-line">${esc(l.text) || ' '}${marks}</code><div class="margin">${notes}</div></div>`;
    }).join('')).join('');
    return `<article class="galley"><h3><span class="fname">${esc(f.path)}</span><span class="lang">${f.language === 'other' ? 'pattern rules only' : f.language}${f.isNew ? ' · new file' : ''}</span></h3>${lines}</article>`;
  }).join('');
  const modelNote = { off: 'Not asked', pending: 'Reading…' }[model.status ?? model.model] ?? (model.status === 'ok' ? `${model.findings.length} kept${model.dropped ? ', ' + model.dropped + ' discarded as unverifiable' : ''}${model.truncated ? ' (input truncated)' : ''}` : model.message);
  const verdict = all.some((f) => f.severity === 'critical' || f.severity === 'high') ? ['Hold for revision', 'hold'] : all.length ? ['Marked for the writer', 'mark'] : ['No marks made', 'clear'];
  const proof = $('#proof'); proof.hidden = false;
  proof.innerHTML = `<div class="rule-title"><h2>The proof</h2><span>${esc(label)}</span></div>
  <div class="proof-grid"><div class="galleys">${files}</div>
  <aside class="editor" aria-label="Editor’s summary"><div class="stamp ${verdict[1]}" role="img" aria-label="${verdict[0]}">${verdict[0]}</div>
    <h3>Editor’s summary</h3>
    <p class="big">${all.length} <span>mark${all.length === 1 ? '' : 's'}</span></p>
    <p>${counts.length ? counts.map(([s, n]) => `<span class="sev sev-${s}">${n} ${s}</span>`).join(' ') : 'No pattern, syntax or model findings.'}</p>
    <dl class="passes"><dt>Pattern rules</dt><dd>${sr.findings.filter((f) => f.source === 'pattern').length} on ${sr.stats.addedLines} added lines</dd>
    <dt>Syntax tree</dt><dd>${sr.stats.parsed} hunk${sr.stats.parsed === 1 ? '' : 's'} parsed, ${sr.stats.skipped} skipped (not self-contained or not JavaScript)</dd>
    <dt>Model</dt><dd>${esc(modelNote)}</dd></dl>
    ${key ? `<div class="keybox"><b>Answer key</b><br>${caught} of ${key.length} planted bug${key.length === 1 ? '' : 's'} marked${caught < key.length ? '. Missed lines are boxed in the galley.' : '.'}</div>` : ''}
    <p class="note">A mark is a place to look, not a verdict. “No marks” does not mean correct.</p></aside></div>`;
  if (model.status !== 'pending') proof.querySelectorAll('.planted:not(.flag)').forEach((el) => el.classList.add('missed'));
  if (model.status === 'off' || model.status === 'pending') proof.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
