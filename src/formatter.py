"""Formats ReviewResult for terminal output, markdown PR comments, and JSON export."""
from reviewer import ReviewResult, Severity

ICONS = {Severity.CRITICAL:"🔴",Severity.HIGH:"🟠",Severity.MEDIUM:"🟡",Severity.LOW:"🔵",Severity.INFO:"⚪"}
COLORS = {"red":"\033[91m","orange":"\033[93m","green":"\033[92m","blue":"\033[94m","reset":"\033[0m","bold":"\033[1m"}

def c(text,color): return f"{COLORS.get(color,'')}{text}{COLORS['reset']}"

def format_terminal(result: ReviewResult) -> str:
    lines=[]
    sep="="*60
    lines.append(c(sep,"bold"))
    lines.append(c("  LLM CODE REVIEW REPORT","bold"))
    lines.append(c(sep,"bold"))
    score_color = "green" if result.score>=75 else ("orange" if result.score>=50 else "red")
    status = c("✅ APPROVED","green") if result.approved else c("❌ CHANGES REQUESTED","red")
    lines.append(f"\n  Score  : {c(str(result.score)+'/100',score_color)}")
    lines.append(f"  Status : {status}")
    lines.append(f"\n  {result.summary}\n")
    lines.append(c("  ISSUES BY SEVERITY","bold"))
    for sev in Severity:
        items = result.by_severity(sev)
        if items:
            lines.append(f"\n  {ICONS[sev]} {sev.value.upper()} ({len(items)})")
            for item in items:
                loc = f":{item.line}" if item.line else ""
                lines.append(f"     [{item.file}{loc}] {item.message}")
                if item.suggestion:
                    lines.append(c(f"     → {item.suggestion}","blue"))
    lines.append(c("\n"+sep,"bold"))
    return "\n".join(lines)

def format_markdown(result: ReviewResult) -> str:
    """GitHub-flavored markdown suitable for a PR comment."""
    score_emoji = "🟢" if result.score >= 75 else ("🟡" if result.score >= 50 else "🔴")
    status = "✅ Approved" if result.approved else "❌ Changes Requested"

    lines = [
        "## 🤖 AI Code Review",
        "",
        f"**Score: {score_emoji} {result.score}/100** · {status}",
        "",
        f"> {result.summary}",
        "",
    ]

    # Summary table — only rows with at least one issue
    counts = [(s, len(result.by_severity(s))) for s in Severity if result.by_severity(s)]
    if counts:
        lines += ["| Severity | Count |", "|---|:---:|"]
        for sev, n in counts:
            lines.append(f"| {ICONS[sev]} {sev.value.capitalize()} | {n} |")
        lines.append("")

    # Issues grouped by severity
    for sev in Severity:
        items = result.by_severity(sev)
        if not items:
            continue
        lines.append(f"### {ICONS[sev]} {sev.value.capitalize()}")
        lines.append("")
        for item in items:
            loc = f":{item.line}" if item.line else ""
            lines.append(f"**`{item.file}{loc}`** — *{item.category.value}*  ")
            lines.append(item.message)
            if item.suggestion:
                lines.append(f"> 💡 {item.suggestion}")
            lines.append("")

    lines += [
        "---",
        "*Reviewed by [LLM Code Review](https://github.com/srinivas-venigalla) · "
        "Powered by Claude claude-sonnet-4-6*",
    ]
    return "\n".join(lines)


def format_json(result: ReviewResult) -> dict:
    return {
        "score":result.score,"approved":result.approved,"summary":result.summary,
        "issue_counts":{s.value:len(result.by_severity(s)) for s in Severity},
        "comments":[{
            "file":c.file,"line":c.line,"severity":c.severity.value,
            "category":c.category.value,"message":c.message,"suggestion":c.suggestion
        } for c in result.comments]
    }
