import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { resetForTests } from '../api/review.js';
import { validateRequest, buildMessages, parseAndVerify } from '../api/_review.js';

const body = { files: [{ path: 'a.js', lines: [{ n: 3, t: 'if (x = 1) {' }, { n: 4, t: '  return eval(s);' }] }] };
const res = () => { const r = { headers: {}, code: 200, json(b) { r.body = b; return r; }, status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const call = async (method, b, ip = '1.1.1.1') => { const r = res(); await handler({ method, body: b, headers: { 'x-forwarded-for': ip } }, r); return r; };
const env = (on) => { if (on) { process.env.GROQ_API_KEY = 'test-key'; process.env.GROQ_FREE_PLAN_CONFIRMED = 'true'; } else { delete process.env.GROQ_API_KEY; delete process.env.GROQ_FREE_PLAN_CONFIRMED; } };
const withFetch = (impl, fn) => async () => { const orig = globalThis.fetch; globalThis.fetch = impl; try { await fn(); } finally { globalThis.fetch = orig; } };
const groq = (content, status = 200) => async () => ({ ok: status === 200, status, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content } }] }) });

test('fails closed without key: 503 and no outbound request', withFetch(async () => { throw new Error('must not be called'); }, async () => {
  env(false); resetForTests();
  assert.equal((await call('POST', body)).code, 503);
  assert.equal((await call('GET')).body.enabled, false);
}));
test('input validation rejects malformed and oversized requests', () => {
  assert.ok(validateRequest({}));
  assert.ok(validateRequest({ files: [{ path: 'a', lines: [{ n: 0, t: 'x' }] }] }));
  assert.ok(validateRequest({ files: [{ path: 'a\nb', lines: [{ n: 1, t: 'x' }] }] }));
  assert.ok(validateRequest({ files: [{ path: 'a', lines: [{ n: 1, t: 'x'.repeat(221) }] }] }));
  assert.ok(validateRequest({ files: [{ path: 'a', lines: Array.from({ length: 161 }, (_, i) => ({ n: i + 1, t: 'x' })) }] }));
  assert.equal(validateRequest(body), null);
});
test('method and validation errors', async () => {
  env(true); resetForTests();
  assert.equal((await call('PUT', body)).code, 405);
  assert.equal((await call('POST', { files: [] })).code, 400);
});
test('anchor verification drops unanchored, misquoted, and out-of-request findings', () => {
  const files = body.files;
  const good = { file: 'a.js', line: 3, severity: 'high', category: 'bug', message: 'assignment', evidence: 'if (x = 1)' };
  const out = parseAndVerify(JSON.stringify({ findings: [good, { ...good, line: 99 }, { ...good, evidence: 'not on the line' }, { ...good, file: 'zzz.js' }, { ...good, severity: 'apocalyptic' }, { ...good, evidence: 'ab' }] }), files);
  assert.equal(out.findings.length, 1); assert.equal(out.dropped.length, 5);
  assert.equal(parseAndVerify('{}', files).findings.length, 0);
  assert.ok(parseAndVerify('not json', files).error);
  assert.ok(parseAndVerify('{"findings":"x"}', files).error);
});
test('prompt marks code as untrusted and lists only supplied lines', () => {
  const m = buildMessages(body.files);
  assert.match(m[0].content, /untrusted data/);
  assert.match(m[1].content, /a\.js:3\| if \(x = 1\)/);
});
test('happy path returns only verified findings and never echoes the key', withFetch(groq(JSON.stringify({ findings: [{ file: 'a.js', line: 4, severity: 'critical', category: 'security', message: 'eval runs text', evidence: 'eval(s)' }, { file: 'a.js', line: 400, severity: 'low', category: 'bug', message: 'x', evidence: 'xxxx' }] })), async () => {
  env(true); resetForTests();
  const r = await call('POST', body);
  assert.equal(r.code, 200); assert.equal(r.body.findings.length, 1); assert.equal(r.body.droppedUnverified, 1);
  assert.ok(!JSON.stringify(r.body).includes('test-key'));
}));
test('provider 429 maps to quota message, bad JSON to 502', async () => {
  env(true); resetForTests();
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = groq('', 429); let r = await call('POST', body); assert.equal(r.code, 429); assert.match(r.body.error, /no paid fallback/i);
    globalThis.fetch = groq('nope'); r = await call('POST', body); assert.equal(r.code, 502);
    globalThis.fetch = async () => { throw new Error('boom'); }; r = await call('POST', body); assert.equal(r.code, 502);
  } finally { globalThis.fetch = orig; }
});
test('per-IP limit trips at 6 per window with a free-quota message', withFetch(groq('{"findings":[]}'), async () => {
  env(true); resetForTests();
  for (let i = 0; i < 6; i++) assert.equal((await call('POST', body, '9.9.9.9')).code, 200);
  const r = await call('POST', body, '9.9.9.9'); assert.equal(r.code, 429); assert.equal(r.headers['Retry-After'], '600');
  assert.equal((await call('POST', body, '8.8.8.8')).code, 200);
}));
