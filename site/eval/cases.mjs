// Seeded-bug benchmark. Every diff below was written by hand for this project (synthetic, not mined from
// real repositories). A line ending in the marker is a seeded bug; the marker is stripped before any
// reviewer sees the text. "dev" cases were used while writing the rules; "test" cases were written after
// the rules were frozen and are the headline numbers. Clean cases have no seeded bug: any finding there is a false positive.
export const MARK = '⟦B⟧';
const D = (s) => s.replace(/^\n/, '');

export const CASES = [
// ---------------- dev ----------------
{ id: 'd01', set: 'dev', title: 'JS auth: hardcoded key, assignment in condition', diff: D(`
diff --git a/src/auth.js b/src/auth.js
--- a/src/auth.js
+++ b/src/auth.js
@@ -1,6 +1,14 @@
 import jwt from 'jsonwebtoken';
+const JWT_SECRET = 'sk_live_9fA3kLm2Xq81ZpQwErTy';${MARK}
 
 export function sign(user) {
-  return jwt.sign({ id: user.id }, process.env.JWT_SECRET);
+  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
 }
+
+export function isAdmin(user) {
+  if (user.role = 'admin') {${MARK}
+    return true;
+  }
+  return false;
+}
`) },
{ id: 'd02', set: 'dev', title: 'Python: mutable default and bare except', diff: D(`
diff --git a/app/cart.py b/app/cart.py
--- a/app/cart.py
+++ b/app/cart.py
@@ -10,6 +10,16 @@ class Cart:
     def total(self):
         return sum(i.price for i in self.items)
 
+    def add_all(self, products, bucket=[]):${MARK}
+        for p in products:
+            bucket.append(p)
+        self.items.extend(bucket)
+
+    def load(self, path):
+        try:
+            return open(path).read()
+        except:${MARK}
+            pass
`) },
{ id: 'd03', set: 'dev', title: 'JS: SQL built by concatenation', diff: D(`
diff --git a/server/users.js b/server/users.js
--- a/server/users.js
+++ b/server/users.js
@@ -22,3 +22,8 @@ export async function byId(db, id) {
   return rows[0];
 }
+
+export async function byName(db, name) {
+  const sql = "SELECT * FROM users WHERE name = '" + name + "'";${MARK}
+  return (await db.query(sql)).rows;
+}
`) },
{ id: 'd04', set: 'dev', title: 'JS: loop runs past the end', diff: D(`
diff --git a/lib/sum.js b/lib/sum.js
--- a/lib/sum.js
+++ b/lib/sum.js
@@ -1,4 +1,10 @@
 export const double = (n) => n * 2;
+
+export function total(items) {
+  let t = 0;
+  for (let i = 0; i <= items.length; i++) {${MARK}
+    t += items[i].price;
+  }
+  return t;
+}
`) },
{ id: 'd05', set: 'dev', title: 'Python: shell command from user input', diff: D(`
diff --git a/tools/convert.py b/tools/convert.py
--- a/tools/convert.py
+++ b/tools/convert.py
@@ -1,5 +1,11 @@
 import subprocess
+import sys
+
+def convert(filename):
+    cmd = "ffmpeg -i " + filename + " out.mp4"
+    subprocess.run(cmd, shell=True, check=True)${MARK}
+
+if __name__ == "__main__":
+    convert(sys.argv[1])
`) },
{ id: 'd06', set: 'dev', title: 'TS: forEach with async callback', diff: D(`
diff --git a/src/sync.ts b/src/sync.ts
--- a/src/sync.ts
+++ b/src/sync.ts
@@ -5,3 +5,10 @@ import { upload } from './api';
 export const BATCH = 20;
+
+export async function syncAll(files: string[]) {
+  files.forEach(async (f) => {${MARK}
+    await upload(f);
+  });
+  console.log('done');
+}
`) },
{ id: 'd07', set: 'dev', title: 'JS: pagination returns one extra row (logic)', diff: D(`
diff --git a/src/page.js b/src/page.js
--- a/src/page.js
+++ b/src/page.js
@@ -1,3 +1,8 @@
 export const PAGE_SIZE = 25;
+
+export function pageOf(rows, page) {
+  const start = (page - 1) * PAGE_SIZE;
+  const end = start + PAGE_SIZE + 1;${MARK}
+  return rows.slice(start, end);
+}
`) },
{ id: 'd08', set: 'dev', title: 'Python: is with a string, HTTP without timeout', diff: D(`
diff --git a/svc/client.py b/svc/client.py
--- a/svc/client.py
+++ b/svc/client.py
@@ -1,4 +1,12 @@
 import requests
+
+def fetch_role(user):
+    if user.role is 'admin':${MARK}
+        return 'all'
+    return 'none'
+
+def ping(url):
+    return requests.get(url).status_code${MARK}
`) },
{ id: 'd09', set: 'dev', title: 'JS: user comment written with innerHTML', diff: D(`
diff --git a/web/comments.js b/web/comments.js
--- a/web/comments.js
+++ b/web/comments.js
@@ -8,3 +8,7 @@ const list = document.querySelector('#comments');
 export const clear = () => { list.textContent = ''; };
+
+export function show(comment) {
+  list.innerHTML += '<li>' + comment.body + '</li>';${MARK}
+}
`) },
{ id: 'd10', set: 'dev', title: 'Clean JS refactor (null check is deliberate)', diff: D(`
diff --git a/src/format.js b/src/format.js
--- a/src/format.js
+++ b/src/format.js
@@ -1,9 +1,12 @@
-export function label(user) {
-  return user.name ? user.name : 'anonymous';
-}
+export function label(user) {
+  if (user == null) return 'anonymous';
+  return user.name ?? 'anonymous';
+}
+
+export function initials(user) {
+  return label(user).split(' ').map((p) => p[0]).join('').toUpperCase();
+}
`) },
// ---------------- test (held out) ----------------
{ id: 't01', set: 'test', title: 'JS: eval on a query parameter', diff: D(`
diff --git a/server/calc.js b/server/calc.js
--- a/server/calc.js
+++ b/server/calc.js
@@ -3,3 +3,8 @@ import express from 'express';
 const app = express();
+
+app.get('/calc', (req, res) => {
+  const result = eval(req.query.expr);${MARK}
+  res.json({ result });
+});
`) },
{ id: 't02', set: 'test', title: 'Python: yaml.load and md5 password hash', diff: D(`
diff --git a/app/config.py b/app/config.py
--- a/app/config.py
+++ b/app/config.py
@@ -1,5 +1,13 @@
 import yaml
 import hashlib
+
+def load_config(path):
+    with open(path) as fh:
+        return yaml.load(fh.read())${MARK}
+
+def hash_password(pw):
+    return hashlib.md5(pw.encode()).hexdigest()${MARK}
`) },
{ id: 't03', set: 'test', title: 'JS: swallowed payment error', diff: D(`
diff --git a/src/pay.js b/src/pay.js
--- a/src/pay.js
+++ b/src/pay.js
@@ -14,3 +14,11 @@ import { charge } from './gateway';
 const RETRIES = 2;
+
+export async function pay(order) {
+  try {
+    await charge(order.card, order.total);
+  } catch (e) {}${MARK}
+  order.status = 'paid';
+  return order;
+}
`) },
{ id: 't04', set: 'test', title: 'JS: password reset token from Math.random', diff: D(`
diff --git a/src/reset.js b/src/reset.js
--- a/src/reset.js
+++ b/src/reset.js
@@ -1,2 +1,6 @@
 import { store } from './db';
+
+export function makeResetToken(user) {
+  const token = Math.random().toString(36).slice(2);${MARK}
+  return store.save(user.id, token);
+}
`) },
{ id: 't05', set: 'test', title: 'JS: typeof typo and dead code', diff: D(`
diff --git a/src/guard.js b/src/guard.js
--- a/src/guard.js
+++ b/src/guard.js
@@ -1,3 +1,12 @@
 export const isNil = (v) => v === null || v === undefined;
+
+export function normalise(v) {
+  if (typeof v === 'strnig') {${MARK}
+    return v.trim();
+  }
+  return String(v);
+  console.warn('unreachable');${MARK}
+}
`) },
{ id: 't06', set: 'test', title: 'Python: SQL via f-string', diff: D(`
diff --git a/app/repo.py b/app/repo.py
--- a/app/repo.py
+++ b/app/repo.py
@@ -20,3 +20,7 @@ class Repo:
         self.conn = conn
+
+    def find(self, email):
+        cur = self.conn.cursor()
+        cur.execute(f"SELECT id FROM users WHERE email = '{email}'")${MARK}
+        return cur.fetchone()
`) },
{ id: 't07', set: 'test', title: 'JS: assignment to a const', diff: D(`
diff --git a/src/cart.js b/src/cart.js
--- a/src/cart.js
+++ b/src/cart.js
@@ -1,3 +1,10 @@
 export const TAX = 0.08;
+
+export function checkout(items) {
+  const total = 0;
+  for (const it of items) {
+    total += it.price * it.qty;${MARK}
+  }
+  return total * (1 + TAX);
+}
`) },
{ id: 't08', set: 'test', title: 'JS: comparison with NaN', diff: D(`
diff --git a/src/parse.js b/src/parse.js
--- a/src/parse.js
+++ b/src/parse.js
@@ -1,3 +1,9 @@
 export const toInt = (s) => parseInt(s, 10);
+
+export function ageOf(input) {
+  const n = toInt(input);
+  if (n === NaN) {${MARK}
+    throw new Error('not a number');
+  }
+  return n;
+}
`) },
{ id: 't09', set: 'test', title: 'Python: range(len)+1', diff: D(`
diff --git a/app/stats.py b/app/stats.py
--- a/app/stats.py
+++ b/app/stats.py
@@ -4,3 +4,8 @@ def mean(xs):
     return sum(xs) / len(xs)
+
+def deltas(xs):
+    out = []
+    for i in range(len(xs) + 1):${MARK}
+        out.append(xs[i] - xs[i - 1])
+    return out
`) },
{ id: 't10', set: 'test', title: 'JS: missing await before responding (logic)', diff: D(`
diff --git a/server/orders.js b/server/orders.js
--- a/server/orders.js
+++ b/server/orders.js
@@ -9,3 +9,9 @@ import { saveOrder } from './store';
 const router = express.Router();
+
+router.post('/orders', async (req, res) => {
+  const order = { id: Date.now(), items: req.body.items };
+  saveOrder(order);${MARK}
+  res.status(201).json(order);
+});
`) },
{ id: 't11', set: 'test', title: 'JS: discount applied with wrong precedence (logic)', diff: D(`
diff --git a/src/price.js b/src/price.js
--- a/src/price.js
+++ b/src/price.js
@@ -1,3 +1,7 @@
 export const cents = (n) => Math.round(n * 100);
+
+export function finalPrice(price, qty, discountPct) {
+  return price * qty - discountPct / 100;${MARK}
+}
`) },
{ id: 't12', set: 'test', title: 'Clean Python: type hints and logging (TODO is a comment only)', diff: D(`
diff --git a/app/jobs.py b/app/jobs.py
--- a/app/jobs.py
+++ b/app/jobs.py
@@ -1,6 +1,14 @@
-def run(job):
-    job.start()
+import logging
+
+log = logging.getLogger(__name__)
+
+def run(job) -> bool:
+    log.info("starting %s", job.id)
+    job.start()
+    # TODO: report duration once metrics land
+    return job.ok
`) },
{ id: 't13', set: 'test', title: 'Clean JS: checked fetch with logged failure', diff: D(`
diff --git a/web/load.js b/web/load.js
--- a/web/load.js
+++ b/web/load.js
@@ -1,3 +1,14 @@
 const API = '/api/items';
+
+export async function loadItems() {
+  try {
+    const r = await fetch(API);
+    if (!r.ok) throw new Error('HTTP ' + r.status);
+    return await r.json();
+  } catch (err) {
+    console.error('load failed', err);
+    return [];
+  }
+}
`) },
{ id: 't14', set: 'test', title: 'Clean TS: pure helper with a comment about SQL', diff: D(`
diff --git a/src/slug.ts b/src/slug.ts
--- a/src/slug.ts
+++ b/src/slug.ts
@@ -1,2 +1,9 @@
 export const MAX = 60;
+
+// We never build SELECT statements here; this only prepares URL segments.
+export function slug(title: string): string {
+  return title.toLowerCase().trim()
+    .replace(/[^a-z0-9]+/g, '-')
+    .replace(/^-|-$/g, '')
+    .slice(0, MAX);
+}
`) },
];
