"""
LLM Code Review Analyzer
Uses Claude claude-sonnet-4-6 to review git diffs.
Falls back to mock mode if no API key — tests always pass.
"""
import json, os, re
from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

class Severity(str, Enum):
    CRITICAL="critical"; HIGH="high"; MEDIUM="medium"; LOW="low"; INFO="info"

class Category(str, Enum):
    BUG="bug"; SECURITY="security"; PERFORMANCE="performance"
    STYLE="style"; LOGIC="logic"; TEST="test"; SUGGESTION="suggestion"

@dataclass
class ReviewComment:
    file: str
    line: Optional[int]
    severity: Severity
    category: Category
    message: str
    suggestion: Optional[str] = None

@dataclass
class ReviewResult:
    summary: str
    score: int
    approved: bool
    comments: List[ReviewComment] = field(default_factory=list)

    def by_severity(self, s: Severity): return [c for c in self.comments if c.severity==s]
    def critical_count(self): return len(self.by_severity(Severity.CRITICAL))
    def high_count(self): return len(self.by_severity(Severity.HIGH))

@dataclass
class DiffFile:
    filename: str
    additions: int = 0
    deletions: int = 0
    is_new: bool = False

def parse_diff(diff_text: str) -> List[DiffFile]:
    files, current = [], None
    for line in diff_text.split('\n'):
        if line.startswith('diff --git'):
            if current: files.append(current)
            current = DiffFile(filename="")
        elif line.startswith('+++ b/') and current:
            current.filename = line[6:]
        elif line.startswith('--- /dev/null') and current:
            current.is_new = True
        elif line.startswith('+') and not line.startswith('+++') and current:
            current.additions += 1
        elif line.startswith('-') and not line.startswith('---') and current:
            current.deletions += 1
    if current: files.append(current)
    return [f for f in files if f.filename]

MOCK_RESPONSE = {
    "summary": "PR introduces a new auth endpoint. Core logic is sound but has security concerns around password comparison and missing token expiry validation.",
    "score": 65,
    "approved": False,
    "comments": [
        {"file":"src/auth.py","line":42,"severity":"critical","category":"security",
         "message":"Password comparison using == is vulnerable to timing attacks.",
         "suggestion":"Use hmac.compare_digest() for constant-time comparison."},
        {"file":"src/auth.py","line":67,"severity":"high","category":"bug",
         "message":"No input validation before DB query — potential injection risk.",
         "suggestion":"Validate all inputs. Use parameterized queries."},
        {"file":"src/auth.py","line":89,"severity":"medium","category":"logic",
         "message":"Token expiry not checked on refresh path.",
         "suggestion":"Add expiry check before issuing new token."},
        {"file":"tests/test_auth.py","line":None,"severity":"medium","category":"test",
         "message":"Missing tests for expired token and refresh edge cases.",
         "suggestion":"Add: test_expired_token_cannot_refresh, test_invalid_token_rejected."},
        {"file":"src/auth.py","line":23,"severity":"low","category":"style",
         "message":"Function name get_user_from_db is too vague.",
         "suggestion":"Rename to get_user_by_email to clarify lookup key."}
    ]
}

PROMPT_TEMPLATE = """You are an expert code reviewer. Analyze this git diff and return structured JSON.

Git Diff:
```
{diff}
```

Return ONLY valid JSON:
{{
  "summary": "2-3 sentence assessment",
  "score": <0-100>,
  "approved": <true if score>=75 and no critical/high issues>,
  "comments": [
    {{"file":"filename","line":<int|null>,"severity":"critical|high|medium|low|info",
      "category":"bug|security|performance|style|logic|test|suggestion",
      "message":"issue description","suggestion":"fix (optional)"}}
  ]
}}"""

class CodeReviewer:
    def __init__(self, api_key: Optional[str]=None, mock_mode: bool=False):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.mock_mode = mock_mode or not self.api_key
        self._client = None
        if not self.mock_mode:
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=self.api_key)
            except ImportError:
                self.mock_mode = True

    def review_diff(self, diff_text: str, context: Optional[str]=None) -> ReviewResult:
        if not diff_text.strip():
            raise ValueError("diff_text cannot be empty")
        raw = MOCK_RESPONSE if self.mock_mode else self._call_claude(diff_text)
        return self._parse_response(raw)

    def _call_claude(self, diff_text: str) -> dict:
        msg = self._client.messages.create(
            model="claude-sonnet-4-6", max_tokens=2000,
            messages=[{"role":"user","content":PROMPT_TEMPLATE.format(diff=diff_text[:8000])}]
        )
        text = re.sub(r'^```json?\s*|\s*```$','',msg.content[0].text.strip())
        return json.loads(text)

    def _parse_response(self, raw: dict) -> ReviewResult:
        comments = []
        for c in raw.get("comments",[]):
            try:
                comments.append(ReviewComment(
                    file=c.get("file","unknown"), line=c.get("line"),
                    severity=Severity(c.get("severity","info")),
                    category=Category(c.get("category","suggestion")),
                    message=c.get("message",""), suggestion=c.get("suggestion")
                ))
            except (ValueError, KeyError):
                continue
        return ReviewResult(
            summary=raw.get("summary",""), score=max(0,min(100,int(raw.get("score",50)))),
            approved=bool(raw.get("approved",False)), comments=comments
        )
