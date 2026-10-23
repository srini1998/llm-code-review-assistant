// Optional LLM review pass. The key stays on the server. Groq free plan only: when quota is used up we answer 429, never a paid fallback.
// The whole product works without this endpoint (static passes run in the browser).
import { MODEL, validateRequest, buildMessages, parseAndVerify, callGroq } from './_review.js';

const enabled = () => Boolean(process.env.GROQ_API_KEY) && process.env.GROQ_FREE_PLAN_CONFIRMED === 'true';
const WINDOW_MS = 10 * 60 * 1000, PER_IP = 6, DAILY_CAP = 150;
const hits = new Map();
let day = new Date().toISOString().slice(0, 10), dayCount = 0;

function limited(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_CAP) return 'daily';
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= PER_IP) return 'ip';
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  dayCount++;
  return null;
}
export function resetForTests() { hits.clear(); dayCount = 0; }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ enabled: enabled(), model: MODEL, perIpPer10Min: PER_IP });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!enabled()) return res.status(503).json({ error: 'The model pass is not connected. No model request was made; the other passes still work.' });
  const problem = validateRequest(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  const lim = limited(ip);
  if (lim) {
    res.setHeader('Retry-After', lim === 'ip' ? '600' : '3600');
    return res.status(429).json({ error: lim === 'ip' ? 'Free quota reached for now (6 model reviews per 10 minutes). No paid fallback.' : 'Free daily quota reached. No paid fallback; the other passes still work.' });
  }
  const { files } = req.body;
  try {
    const r = await callGroq(process.env.GROQ_API_KEY, buildMessages(files));
    if (r.status === 429) { res.setHeader('Retry-After', r.retryAfter || '60'); return res.status(429).json({ error: 'Free quota reached at the model provider. No paid fallback; try later.' }); }
    if (r.status !== 200) return res.status(502).json({ error: 'The model provider could not complete this request.' });
    const parsed = parseAndVerify(r.text, files);
    if (parsed.error) return res.status(502).json({ error: parsed.error });
    return res.status(200).json({ model: MODEL, findings: parsed.findings, droppedUnverified: parsed.dropped.length });
  } catch {
    return res.status(502).json({ error: 'Model request timed out or could not connect.' });
  }
}
