// Unified diff parser. Tolerant of hand-edited hunk counts: line numbers come from the @@ header start
// and are advanced line by line, never trusted from the counts.
export const LIMITS = { chars: 150000, files: 40, changedLines: 3000 };

export function languageOf(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'js';
  if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) return 'ts';
  if (ext === 'py') return 'py';
  return 'other';
}

export function parseDiff(text) {
  if (typeof text !== 'string') throw new Error('Diff must be text.');
  if (text.length > LIMITS.chars) throw new Error(`Diff is over ${LIMITS.chars.toLocaleString('en-US')} characters. Review a smaller change.`);
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const files = [];
  let file = null, hunk = null, oldNo = 0, newNo = 0, changed = 0;
  const open = (path) => { file = { path, isNew: false, isDeleted: false, hunks: [] }; files.push(file); hunk = null; };
  for (const row of rows) {
    if (row.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(row);
      open(m ? m[2] : '');
      continue;
    }
    if (!hunk && row.startsWith('--- ')) {
      if (!file || file.hunks.length) open('');
      if (row.startsWith('--- /dev/null')) file.isNew = true;
      else if (!file.path) file.path = row.replace(/^--- (a\/)?/, '').split('\t')[0];
      continue;
    }
    if (row.startsWith('+++ ') && file && !file.hunks.length) {
      if (row.startsWith('+++ /dev/null')) file.isDeleted = true;
      else file.path = row.replace(/^\+\+\+ (b\/)?/, '').split('\t')[0];
      continue;
    }
    if (row.startsWith('new file mode') && file) { file.isNew = true; continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(row);
    if (h) {
      if (!file) open('');
      oldNo = Number(h[1]); newNo = Number(h[2]);
      hunk = { header: row, section: h[3].trim(), lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (row.startsWith('\\')) continue;
    const c = row[0];
    if (c === '+') { hunk.lines.push({ kind: 'add', text: row.slice(1), oldNo: null, newNo: newNo++ }); changed++; }
    else if (c === '-') { hunk.lines.push({ kind: 'del', text: row.slice(1), oldNo: oldNo++, newNo: null }); changed++; }
    else if (c === ' ' || row === '') {
      if (row === '' && hunk.lines.length === 0) continue;
      hunk.lines.push({ kind: 'ctx', text: row.slice(1), oldNo: oldNo++, newNo: newNo++ });
    }
    if (changed > LIMITS.changedLines) throw new Error(`Diff changes more than ${LIMITS.changedLines} lines. Review a smaller change.`);
  }
  // Trailing blank context rows created by the final newline are not source lines.
  for (const f of files) for (const hk of f.hunks) while (hk.lines.length && hk.lines.at(-1).kind === 'ctx' && hk.lines.at(-1).text === '' && rows.at(-1) === '') { hk.lines.pop(); break; }
  const real = files.filter((f) => f.path && f.hunks.length && !f.isDeleted);
  if (!real.length) throw new Error('No reviewable hunks found. Paste a unified diff (git diff or a PR .diff).');
  if (real.length > LIMITS.files) throw new Error(`Diff touches more than ${LIMITS.files} files. Review a smaller change.`);
  return real.map((f) => ({ ...f, language: languageOf(f.path) }));
}

export const addedLines = (file) => file.hunks.flatMap((h) => h.lines.filter((l) => l.kind === 'add'));
