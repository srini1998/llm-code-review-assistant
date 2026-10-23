// Pattern rules over ADDED lines only. These are heuristics: they read one line at a time, know nothing
// about types or data flow, and are listed in the UI exactly as written here.
const JS = ['js', 'ts'];
const strip = (s) => s.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, (m) => m[0] + 'x'.repeat(Math.max(0, m.length - 2)) + m[0]);

export const RULES = [
  { id: 'secret-literal', langs: null, severity: 'critical', category: 'security',
    test: (t) => /(api[_-]?key|secret|passwd|password|token|auth)\w*\s*[:=]\s*['"][A-Za-z0-9_\-/+=.]{12,}['"]/i.test(t) || /\bAKIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{20,}|\bsk[_-](live|test)?[_-]?[A-Za-z0-9]{16,}/.test(t),
    message: 'Credential-looking string committed to source. Move it to an environment variable and rotate it.' },
  { id: 'tls-verify-off', langs: null, severity: 'high', category: 'security',
    test: (t) => /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED/.test(t),
    message: 'Certificate verification is switched off, which allows man-in-the-middle attacks.' },
  { id: 'weak-hash', langs: null, severity: 'medium', category: 'security',
    test: (t) => /createHash\(\s*['"](md5|sha1)['"]\s*\)|hashlib\.(md5|sha1)\(/i.test(t),
    message: 'MD5 and SHA-1 are broken for passwords and signatures. Use a slow password hash or SHA-256+.' },
  { id: 'js-eval', langs: JS, severity: 'critical', category: 'security',
    test: (t) => /(^|[^.\w])eval\s*\(|new\s+Function\s*\(/.test(strip(t)),
    message: 'eval / new Function runs text as code. Parse the data instead.' },
  { id: 'js-html-sink', langs: JS, severity: 'high', category: 'security',
    test: (t) => /\.(innerHTML|outerHTML)\s*(\+?=)(?!=)/.test(t) && !/=\s*(['"`])[^$'"`]*\1\s*;?\s*$/.test(t) || /insertAdjacentHTML\(|document\.write\(/.test(t),
    message: 'Non-constant HTML written into the page. Anything user-controlled here is a cross-site scripting hole; use textContent.' },
  { id: 'js-sql-concat', langs: JS, severity: 'high', category: 'security',
    test: (t) => /\b(SELECT\s.+\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(t) && (/['"`]\s*\+\s*[\w(]/.test(t) || /\$\{/.test(t)),
    message: 'SQL assembled from variables. Use placeholders / parameterised queries.' },
  { id: 'js-shell-exec', langs: JS, severity: 'critical', category: 'security',
    test: (t) => /\b(exec|execSync)\s*\(\s*(`[^`]*\$\{|['"][^'"]*['"]\s*\+)/.test(t),
    message: 'Shell command built from variables. Use execFile with an argument array.' },
  { id: 'js-loose-eq', langs: JS, severity: 'medium', category: 'bug',
    test: (t) => { const s = strip(t).replace(/\/\/.*$/, ''); return /(?<![=!<>])(==|!=)(?!=)/.test(s) && !/(==|!=)\s*null\b|\bnull\s*(==|!=)/.test(s); },
    message: 'Loose equality coerces types (0 == "", "1" == 1). Use === / !==.' },
  { id: 'js-assign-in-cond', langs: JS, severity: 'high', category: 'bug',
    test: (t) => /\b(if|while)\s*\(\s*[\w.$[\]]+\s=(?![=>])/.test(strip(t)),
    message: 'Assignment inside a condition. This overwrites the value and is almost always meant to be a comparison.' },
  { id: 'js-length-overrun', langs: JS, severity: 'high', category: 'bug',
    test: (t) => /\bfor\s*\([^;]*;\s*\w+\s*<=\s*[\w.$]+\.length\s*;/.test(t),
    message: 'Loop runs one past the end (<= length). The last iteration reads undefined.' },
  { id: 'js-empty-catch', langs: JS, severity: 'medium', category: 'bug',
    test: (t) => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(t),
    message: 'Empty catch hides failures. Log or rethrow.' },
  { id: 'js-foreach-async', langs: JS, severity: 'medium', category: 'bug',
    test: (t) => /\.forEach\(\s*async\b/.test(t),
    message: 'forEach does not await async callbacks, so errors and ordering are lost. Use for...of or Promise.all.' },
  { id: 'js-math-random-secret', langs: JS, severity: 'medium', category: 'security',
    test: (t) => /Math\.random\(\)/.test(t) && /(token|secret|password|reset|session|nonce|key)/i.test(t),
    message: 'Math.random is predictable. Use crypto.getRandomValues / crypto.randomBytes for tokens.' },
  { id: 'py-mutable-default', langs: ['py'], severity: 'high', category: 'bug',
    test: (t) => /\bdef\s+\w+\s*\(.*=\s*(\[\]|\{\}|set\(\)|dict\(\)|list\(\))\s*[,)]/.test(t),
    message: 'Mutable default argument is created once and shared between calls. Default to None.' },
  { id: 'py-bare-except', langs: ['py'], severity: 'medium', category: 'bug',
    test: (t) => /^\s*except\s*(Exception\s*)?(as \w+\s*)?:\s*(pass)?\s*$/.test(t),
    message: 'Catch-all except swallows every error, including bugs and KeyboardInterrupt. Catch the specific exception.' },
  { id: 'py-shell-true', langs: ['py'], severity: 'high', category: 'security',
    test: (t) => /shell\s*=\s*True/.test(t),
    message: 'shell=True with a built string allows command injection. Pass an argument list.' },
  { id: 'py-yaml-load', langs: ['py'], severity: 'high', category: 'security',
    test: (t) => /\byaml\.load\(/.test(t) && !/Loader\s*=\s*(yaml\.)?(Safe|CSafe)Loader/.test(t),
    message: 'yaml.load without SafeLoader can construct arbitrary objects. Use yaml.safe_load.' },
  { id: 'py-eval-exec', langs: ['py'], severity: 'critical', category: 'security',
    test: (t) => /(^|[^.\w])(eval|exec)\s*\(/.test(strip(t)),
    message: 'eval / exec on data runs it as code. Use ast.literal_eval or a parser.' },
  { id: 'py-sql-format', langs: ['py'], severity: 'high', category: 'security',
    test: (t) => /\.execute\(\s*(f['"]|['"][^'"]*['"]\s*(%|\+|\.format))/.test(t),
    message: 'SQL built with string formatting. Use parameterised queries (execute(sql, params)).' },
  { id: 'py-is-literal', langs: ['py'], severity: 'medium', category: 'bug',
    test: (t) => /\b(is|is not)\s+(['"]|\d)/.test(strip(t)),
    message: '`is` compares identity, not value. Comparing to a literal works by accident of interning. Use ==.' },
  { id: 'py-eq-none', langs: ['py'], severity: 'low', category: 'style',
    test: (t) => /(==|!=)\s*None\b/.test(t),
    message: 'Compare to None with `is` / `is not`.' },
  { id: 'py-range-len-plus', langs: ['py'], severity: 'high', category: 'bug',
    test: (t) => /range\(\s*len\([^)]*\)\s*\+\s*1\s*\)/.test(t),
    message: 'range(len(x) + 1) runs one past the end, giving an IndexError on the last iteration.' },
  { id: 'py-requests-timeout', langs: ['py'], severity: 'medium', category: 'bug',
    test: (t) => /\brequests\.(get|post|put|delete|patch|head)\(/.test(t) && !/timeout\s*=/.test(t),
    message: 'requests has no default timeout; a stalled server hangs this call forever.' },
];

export function runRules(files) {
  const out = [];
  for (const f of files) {
    for (const h of f.hunks) for (const l of h.lines) {
      if (l.kind !== 'add' || !l.text.trim()) continue;
      for (const r of RULES) {
        if (r.langs && !r.langs.includes(f.language)) continue;
        if (r.test(l.text)) out.push({ file: f.path, line: l.newNo, severity: r.severity, category: r.category, rule: r.id, source: 'pattern', message: r.message, evidence: l.text.trim().slice(0, 160) });
      }
    }
  }
  return out;
}
