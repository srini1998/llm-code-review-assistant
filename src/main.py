#!/usr/bin/env python3
"""CLI for LLM Code Review Assistant."""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from reviewer import CodeReviewer, Severity
from formatter import format_terminal, format_markdown, format_json

SEVERITY_ORDER = [Severity.INFO, Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]


def main():
    p = argparse.ArgumentParser(description="LLM Code Review — AI-powered git diff analysis")
    p.add_argument("--diff", help="Path to diff file, or '-' for stdin")
    p.add_argument("--format", choices=["terminal", "markdown", "json"], default="terminal",
                   help="Output format (default: terminal)")
    p.add_argument("--output", help="Write formatted output to this file (default: stdout)")
    p.add_argument("--json-output", help="Also save a JSON report to this file")
    p.add_argument("--fail-on", metavar="SEVERITY",
                   choices=["critical", "high", "medium", "low", "info"],
                   help="Exit code 1 if any issues at this severity or above are found")
    p.add_argument("--mock", action="store_true", help="Force mock mode (no API key needed)")
    args = p.parse_args()

    if args.diff == "-":
        diff_text = sys.stdin.read()
    elif args.diff:
        with open(args.diff) as f:
            diff_text = f.read()
    else:
        diff_text = """diff --git a/src/auth.py b/src/auth.py
--- a/src/auth.py
+++ b/src/auth.py
@@ -40,6 +40,12 @@ class AuthService:
+    def verify_password(self, plain, hashed):
+        return plain == hashed
+    def get_user_from_db(self, email):
+        query = f"SELECT * FROM users WHERE email='{email}'"
+        return self.db.execute(query)
"""
        print("No diff provided — using built-in sample.\n")

    reviewer = CodeReviewer(mock_mode=args.mock)
    result = reviewer.review_diff(diff_text)

    # Format output
    if args.format == "terminal":
        output = format_terminal(result)
    elif args.format == "markdown":
        output = format_markdown(result)
    else:
        output = json.dumps(format_json(result), indent=2)

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w") as f:
            f.write(output)
    else:
        print(output)

    # Side JSON report
    if args.json_output:
        os.makedirs(os.path.dirname(os.path.abspath(args.json_output)), exist_ok=True)
        with open(args.json_output, "w") as f:
            json.dump(format_json(result), f, indent=2)

    # CI gate — exit 1 if issues found at or above the specified severity
    if args.fail_on:
        target = Severity(args.fail_on)
        threshold_idx = SEVERITY_ORDER.index(target)
        blocking = [
            c for c in result.comments
            if SEVERITY_ORDER.index(c.severity) >= threshold_idx
        ]
        if blocking:
            print(
                f"\n[GATE] {len(blocking)} issue(s) at or above '{args.fail_on}' severity. "
                "Failing CI.",
                file=sys.stderr,
            )
            sys.exit(1)


if __name__ == "__main__":
    main()
