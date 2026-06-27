import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__),'..','src'))
import pytest
from reviewer import CodeReviewer, ReviewResult, Severity, Category, parse_diff

SAMPLE_DIFF = """diff --git a/src/auth.py b/src/auth.py
--- a/src/auth.py
+++ b/src/auth.py
@@ -1,3 +1,8 @@
+def verify_password(plain, hashed):
+    return plain == hashed
+def login(email):
+    query = f"SELECT * FROM users WHERE email='{email}'"
"""

class TestParseDiff:
    def test_parses_filename(self):
        files = parse_diff(SAMPLE_DIFF)
        assert len(files) == 1
        assert files[0].filename == "src/auth.py"

    def test_counts_additions(self):
        files = parse_diff(SAMPLE_DIFF)
        assert files[0].additions == 4

    def test_empty_diff_returns_empty(self):
        assert parse_diff("") == []

class TestCodeReviewer:
    @pytest.fixture
    def reviewer(self):
        return CodeReviewer(mock_mode=True)

    def test_mock_mode_active(self, reviewer):
        assert reviewer.mock_mode is True

    def test_review_returns_result(self, reviewer):
        assert isinstance(reviewer.review_diff(SAMPLE_DIFF), ReviewResult)

    def test_review_has_summary(self, reviewer):
        assert len(reviewer.review_diff(SAMPLE_DIFF).summary) > 0

    def test_score_in_range(self, reviewer):
        r = reviewer.review_diff(SAMPLE_DIFF)
        assert 0 <= r.score <= 100

    def test_has_comments(self, reviewer):
        assert len(reviewer.review_diff(SAMPLE_DIFF).comments) > 0

    def test_critical_issue_detected(self, reviewer):
        r = reviewer.review_diff(SAMPLE_DIFF)
        assert len(r.by_severity(Severity.CRITICAL)) >= 1

    def test_not_approved_with_critical(self, reviewer):
        assert reviewer.review_diff(SAMPLE_DIFF).approved is False

    def test_empty_raises(self, reviewer):
        with pytest.raises(ValueError):
            reviewer.review_diff("   ")

    def test_valid_severities(self, reviewer):
        for c in reviewer.review_diff(SAMPLE_DIFF).comments:
            assert c.severity in Severity

    def test_valid_categories(self, reviewer):
        for c in reviewer.review_diff(SAMPLE_DIFF).comments:
            assert c.category in Category

    def test_by_severity_filter(self, reviewer):
        r = reviewer.review_diff(SAMPLE_DIFF)
        for c in r.by_severity(Severity.HIGH):
            assert c.severity == Severity.HIGH
