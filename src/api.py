"""FastAPI interface for LLM Code Reviewer."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
from reviewer import CodeReviewer
from formatter import format_json

app = FastAPI(title="LLM Code Review Assistant", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

reviewer = CodeReviewer()

class ReviewRequest(BaseModel):
    diff: str
    context: Optional[str] = None

@app.get("/", response_class=HTMLResponse)
async def root():
    return """<html><head><title>LLM Code Review</title>
    <style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:60px auto;padding:20px;background:#0d1117;color:#e6edf3}
    h1{color:#58a6ff}pre{background:#161b22;padding:16px;border-radius:8px;border:1px solid #30363d}
    a{color:#58a6ff}.badge{background:#238636;color:#fff;padding:2px 8px;border-radius:12px;font-size:12px}</style></head>
    <body><h1>🤖 LLM Code Review Assistant</h1>
    <p><span class="badge">Claude-powered</span> Automated PR review that catches bugs, security issues, and code smells.</p>
    <h2>API</h2>
    <pre>POST /review   — Submit a git diff for review
GET  /sample   — Run on a built-in sample diff
GET  /health   — Health check
GET  /docs     — Swagger UI</pre>
    <h2>Example</h2>
    <pre>curl -X POST /review -H "Content-Type: application/json" \
  -d '{"diff": "diff --git a/src/auth.py..."}'</pre>
    <p><a href="/docs">📖 API Docs</a> | <a href="/sample">▶ Sample Review</a></p>
    </body></html>"""

@app.get("/health")
async def health(): return {"status":"ok","mode":"mock" if reviewer.mock_mode else "live"}

@app.post("/review")
async def review(req: ReviewRequest):
    try:
        result = reviewer.review_diff(req.diff, req.context)
        return format_json(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/sample")
async def sample():
    sample_diff = """diff --git a/src/auth.py b/src/auth.py
--- a/src/auth.py
+++ b/src/auth.py
@@ -40,6 +40,12 @@ class AuthService:
+    def verify_password(self, plain, hashed):
+        return plain == hashed  # timing attack vulnerability
+
+    def get_user_from_db(self, email):
+        query = f"SELECT * FROM users WHERE email='{email}'"
+        return self.db.execute(query)
"""
    result = reviewer.review_diff(sample_diff)
    return format_json(result)
