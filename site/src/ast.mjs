// Syntax-tree pass for JavaScript. TypeScript syntax is not parsed (acorn is JS only), so .ts/.tsx files
// are only attempted and silently skipped when they do not parse. Each hunk is parsed as its new-side text;
// hunks that are not self-contained fragments are skipped and counted.
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const OPTS = { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true };
const VALID_TYPEOF = new Set(['undefined', 'object', 'boolean', 'number', 'string', 'function', 'symbol', 'bigint']);

function tryParse(src) {
  try { return { ast: acorn.parse(src, OPTS), offset: 0 }; } catch (e) { /* try wrapped */ }
  try { return { ast: acorn.parse('(async function __hunk__(){\n' + src + '\n})', OPTS), offset: 1 }; } catch (e) { /* skip */ }
  return null;
}

const sameSimple = (a, b) => a.type === 'Identifier' && b.type === 'Identifier' && a.name === b.name;
const isNaNNode = (n) => (n.type === 'Identifier' && n.name === 'NaN') || (n.type === 'MemberExpression' && n.object.name === 'Number' && n.property.name === 'NaN');

export function runAst(files) {
  const findings = [], stats = { parsed: 0, skipped: 0, syntaxErrors: 0 };
  for (const f of files) {
    if (f.language !== 'js' && f.language !== 'ts') continue;
    for (const h of f.hunks) {
      const rows = h.lines.filter((l) => l.kind !== 'del');
      if (!rows.some((l) => l.kind === 'add')) continue;
      const src = rows.map((l) => l.text).join('\n');
      const res = tryParse(src);
      if (!res) {
        stats.skipped++;
        if (f.isNew && f.language === 'js') {
          try { acorn.parse(src, OPTS); } catch (e) {
            stats.syntaxErrors++;
            const l = rows[Math.min(rows.length - 1, (e.loc?.line ?? 1) - 1)];
            findings.push({ file: f.path, line: l.newNo, severity: 'high', category: 'bug', rule: 'js-syntax', source: 'syntax-tree', message: 'This new file does not parse: ' + String(e.message).replace(/\s*\(\d+:\d+\)$/, '') + '.', evidence: l.text.trim().slice(0, 160) });
          }
        }
        continue;
      }
      stats.parsed++;
      const at = (node) => { const l = rows[node.loc.start.line - 1 - res.offset]; return l && l.kind === 'add' ? l : null; };
      const push = (node, rule, severity, category, message) => { const l = at(node); if (l) findings.push({ file: f.path, line: l.newNo, severity, category, rule, source: 'syntax-tree', message, evidence: l.text.trim().slice(0, 160) }); };

      const unreachable = (body) => {
        let dead = false;
        for (const s of body) {
          if (dead && s.type !== 'FunctionDeclaration' && !(s.type === 'VariableDeclaration' && s.kind === 'var')) { push(s, 'js-unreachable', 'medium', 'bug', 'Code after return / throw / break can never run.'); break; }
          if (['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'].includes(s.type)) dead = true;
        }
      };
      walk.full(res.ast, (node) => {
        if (node.type === 'BlockStatement' || node.type === 'Program') unreachable(node.body);
        if (node.type === 'SwitchCase') unreachable(node.consequent);
        if (node.type === 'BinaryExpression') {
          if (['===', '!==', '==', '!='].includes(node.operator) && (isNaNNode(node.left) || isNaNNode(node.right))) push(node, 'js-nan-compare', 'high', 'bug', 'Nothing equals NaN, not even NaN. This comparison is always the same; use Number.isNaN().');
          if (['===', '!==', '==', '!='].includes(node.operator)) {
            const [a, b] = [node.left, node.right];
            if (sameSimple(a, b)) push(node, 'js-self-compare', 'medium', 'bug', 'A value compared with itself; probably the wrong variable on one side.');
            const lit = a.type === 'Literal' ? a : b.type === 'Literal' ? b : null, other = lit === a ? b : a;
            if (lit && typeof lit.value === 'string' && other.type === 'UnaryExpression' && other.operator === 'typeof' && !VALID_TYPEOF.has(lit.value)) push(node, 'js-typeof-typo', 'high', 'bug', `typeof never returns "${lit.value}". This check is always ${node.operator.startsWith('!') ? 'true' : 'false'}.`);
          }
        }
        if (node.type === 'IfStatement' || node.type === 'ConditionalExpression') {
          if (node.test.type === 'Literal') push(node, 'js-constant-cond', 'medium', 'bug', 'Condition is a constant, so one branch is dead.');
        }
        if (node.type === 'ObjectExpression') {
          const seen = new Set();
          for (const p of node.properties) {
            if (p.type !== 'Property' || p.computed) continue;
            const k = p.key.name ?? String(p.key.value);
            if (seen.has(k)) push(p, 'js-dup-key', 'medium', 'bug', `Duplicate key "${k}": the later value silently wins.`);
            seen.add(k);
          }
        }
      });
      // const reassignment within the same hunk (same name, any later assignment). Scope-naive by design.
      const consts = new Map();
      walk.full(res.ast, (node) => { if (node.type === 'VariableDeclaration' && node.kind === 'const') for (const d of node.declarations) if (d.id.type === 'Identifier') consts.set(d.id.name, d.id.start); });
      walk.full(res.ast, (node) => {
        const target = node.type === 'AssignmentExpression' ? node.left : node.type === 'UpdateExpression' ? node.argument : null;
        if (target && target.type === 'Identifier' && consts.has(target.name) && target.start > consts.get(target.name)) push(node, 'js-const-assign', 'high', 'bug', `"${target.name}" is declared const; this assignment throws a TypeError at runtime.`);
      });
    }
  }
  return { findings, stats };
}
