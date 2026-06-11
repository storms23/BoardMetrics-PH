#!/usr/bin/env python3
"""
Data quality verification for Pasa Rate PH — national pass rates and/or full platform.

Usage:
  py -3 verify_data.py --scope national --start 2015 --end 2026
  py -3 verify_data.py --scope full
  py -3 verify_data.py --scope national --program CELE
  py -3 verify_data.py --scope national --index output/national_links.json
  py -3 verify_data.py --scope national --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from national_audit import SEVERITY_ORDER, audit_national, coverage_by_program
from platform_audit import audit_platform

CHECK_LABELS = {
    "rate_mismatch": "National rate mismatch",
    "url_year_mismatch": "URL year ≠ stored year",
    "exam_content_mismatch": "Exam content mismatch",
    "slug_mismatch": "URL slug mismatch",
    "duplicate_stats": "Duplicate stats across cycles",
    "placeholder_row": "Placeholder row (0 takers)",
    "unexpected_month": "Unexpected exam month",
    "mirror_only_program": "Mirror-only program",
    "soft_coverage_gap": "Soft coverage gap",
    "hard_coverage_gap": "Hard coverage gap (year with no data)",
    "index_not_ingested": "Index not ingested",
    "rate_outlier": "Pass rate outlier",
    "dup_school_name": "Duplicate school name",
    "dup_school_performance": "Duplicate school performance",
    "exam_no_schools": "Exam cycle without schools",
    "perf_passers_gt_takers": "Passers > takers (school)",
    "perf_rate_out_of_range": "Pass rate out of range (school)",
    "perf_missing_rate": "Missing pass rate (school)",
}


def _cycle_label(f: dict) -> str:
    parts = [f.get("month") or "?", str(f.get("year") or "?")]
    return " ".join(parts)


def _group_by_severity(findings: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for f in findings:
        groups[f["severity"]].append(f)
    for sev in groups:
        groups[sev].sort(key=lambda x: (
            x.get("exam_code") or "",
            x.get("year") or 0,
            x.get("month") or "",
            x.get("check_id") or "",
        ))
    return groups


def _summary_table(findings: list[dict]) -> list[dict]:
    by_check: dict[str, dict] = {}
    for f in findings:
        cid = f["check_id"]
        if cid not in by_check:
            by_check[cid] = {"check_id": cid, "count": 0, "highest_severity": f["severity"]}
        by_check[cid]["count"] += 1
        if SEVERITY_ORDER[f["severity"]] < SEVERITY_ORDER[by_check[cid]["highest_severity"]]:
            by_check[cid]["highest_severity"] = f["severity"]
    return sorted(by_check.values(), key=lambda x: (SEVERITY_ORDER[x["highest_severity"]], x["check_id"]))


def _md_table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "_None._\n"
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines) + "\n"


def format_markdown(
    findings: list[dict],
    coverage: list[dict] | None,
    *,
    scope: str,
    start_year: int,
    end_year: int,
) -> str:
    groups = _group_by_severity(findings)
    summary = _summary_table(findings)
    parts: list[str] = [
        f"# Data Quality Report - {scope} - {start_year}-{end_year}\n",
        "## Summary\n",
    ]

    summary_rows = [
        [
            CHECK_LABELS.get(s["check_id"], s["check_id"]),
            str(s["count"]),
            s["highest_severity"],
        ]
        for s in summary
    ]
    parts.append(_md_table(["Check", "Count", "Highest severity"], summary_rows))

    def finding_section(title: str, severity: str, next_step_col: str) -> None:
        items = groups.get(severity, [])
        parts.append(f"## {title}\n")
        if not items:
            parts.append("_None._\n")
            return
        rows = []
        for f in items:
            rows.append([
                f.get("exam_code") or "—",
                _cycle_label(f),
                CHECK_LABELS.get(f["check_id"], f["check_id"]),
                (f.get("detail") or "")[:120],
                f.get("action") or "Review manually",
            ])
        parts.append(_md_table(
            ["Program", "Cycle", "Issue", "Detail", next_step_col],
            rows,
        ))

    finding_section("Critical - fix before trusting charts", "critical", "Suggested action")
    finding_section("Warnings - suspicious, manual review", "warning", "Suggested action")
    finding_section("Needs check - gaps or incomplete ingest", "check", "Next step")

    info_items = groups.get("info", [])
    if info_items:
        parts.append("## Info\n")
        rows = [
            [
                f.get("exam_code") or "—",
                _cycle_label(f),
                CHECK_LABELS.get(f["check_id"], f["check_id"]),
                (f.get("detail") or "")[:120],
            ]
            for f in info_items
        ]
        parts.append(_md_table(["Program", "Cycle", "Issue", "Detail"], rows))

    if coverage is not None:
        parts.append("## Coverage by program\n")
        cov_rows = [
            [
                c["exam_code"],
                str(c["rows"]),
                str(c["with_stats"]),
                c["year_span"],
                str(c["official"]),
                str(c["mirror"]),
                str(c.get("hard_gap_years", c.get("hard_gaps", "—"))),
                str(c["soft_gaps"]),
            ]
            for c in coverage
        ]
        parts.append(_md_table(
            ["Program", "Rows", "With stats", "Year span", "Official", "Mirror", "Hard gap years", "Soft gaps"],
            cov_rows,
        ))

    return "\n".join(parts)


def run_audit(
    scope: str,
    start_year: int,
    end_year: int,
    *,
    program: str | None,
    index_path: Path | None,
) -> tuple[list[dict], list[dict] | None]:
    findings = audit_national(
        start_year, end_year,
        program_filter=program,
        index_path=index_path if scope in ("national", "full") else None,
    )
    coverage = coverage_by_program(start_year, end_year, program_filter=program)

    if scope == "full":
        findings.extend(audit_platform())
        return findings, coverage

    return findings, coverage


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify Pasa Rate PH data quality")
    parser.add_argument("--scope", choices=["national", "full"], default="national")
    parser.add_argument("--start", type=int, default=2015)
    parser.add_argument("--end", type=int, default=2026)
    parser.add_argument("--program", help="Limit national checks to one exam_code")
    parser.add_argument("--index", type=Path, help="Compare against national_links.json")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    args = parser.parse_args()

    try:
        findings, coverage = run_audit(
            args.scope,
            args.start,
            args.end,
            program=args.program,
            index_path=args.index,
        )
    except RuntimeError as exc:
        print(f"DB not configured: {exc}", file=sys.stderr)
        sys.exit(1)

    if args.format == "json":
        payload = {
            "scope": args.scope,
            "start_year": args.start,
            "end_year": args.end,
            "summary": _summary_table(findings),
            "findings": findings,
            "coverage": coverage,
        }
        print(json.dumps(payload, indent=2))
        return

    print(format_markdown(
        findings,
        coverage,
        scope=args.scope,
        start_year=args.start,
        end_year=args.end,
    ))


if __name__ == "__main__":
    main()
