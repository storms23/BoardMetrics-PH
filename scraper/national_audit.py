"""
National exam_results audit checks for verify_data.py and cleanup_national.py.

Each finding is a dict:
  check_id, severity, exam_code, month, year, id, detail, source_url, action
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

import db
from national_validate import infer_exam_from_content
from programs import ALL_CODES, EXAM_CYCLES, PRCBOARD_SLUGS, PROGRAMS_DICT

Severity = Literal["critical", "warning", "info", "check"]

YEAR_RE = re.compile(r"\b(20\d{2})\b")

SEVERITY_ORDER = {"critical": 0, "warning": 1, "check": 2, "info": 3}

ACTIONS = {
    "rate_mismatch": "Delete or re-ingest from official source",
    "url_year_mismatch": "Delete row; re-ingest with correct cycle",
    "exam_content_mismatch": "Delete row; fix index and re-ingest",
    "slug_mismatch": "Verify source URL matches program; delete if wrong exam",
    "duplicate_stats": "Spot-check both cycles; delete duplicate if same exam mislabeled",
    "placeholder_row": "Delete placeholder or re-ingest with summary stats",
    "unexpected_month": "Confirm exam was held that month; fix month label if wrong",
    "mirror_only_program": "Prefer prc.gov.ph source when available",
    "soft_coverage_gap": "Run national_gap_fill.py for missing cycle",
    "hard_coverage_gap": "Run national_gap_fill.py — no stats for entire year",
    "index_not_ingested": "Run national_ingest.py --from-index or --fill-gaps",
    "rate_outlier": "Verify against official PRC announcement",
}


def parse_url_year(source_url: str | None) -> int | None:
    if not source_url:
        return None
    matches = YEAR_RE.findall(source_url)
    if not matches:
        return None
    for m in reversed(matches):
        y = int(m)
        if 2010 <= y <= 2030:
            return y
    return None


def _finding(
    check_id: str,
    severity: Severity,
    *,
    exam_code: str | None = None,
    month: str | None = None,
    year: int | None = None,
    row_id: int | None = None,
    detail: str = "",
    source_url: str | None = None,
    action: str | None = None,
) -> dict:
    return {
        "check_id": check_id,
        "severity": severity,
        "exam_code": exam_code,
        "month": month,
        "year": year,
        "id": row_id,
        "detail": detail,
        "source_url": source_url,
        "action": action or ACTIONS.get(check_id, "Review manually"),
    }


def _slug_owner(url: str) -> str | None:
    lower = url.lower()
    best: tuple[int, str] | None = None
    for code, slug in PRCBOARD_SLUGS.items():
        if not slug:
            continue
        s = slug.lower()
        # Match slug as path segment (e.g. /cele-results- or -cele-)
        if re.search(rf"[-/]{re.escape(s)}[-/]", lower) or re.search(rf"[-/]{re.escape(s)}$", lower):
            score = len(s)
            if best is None or score > best[0]:
                best = (score, code)
    return best[1] if best else None


def _has_real_stats(row: dict) -> bool:
    return (row.get("total_takers") or 0) > 0 and row.get("pass_rate") is not None


def _row_keep_score(exam_code: str, row: dict) -> int:
    """Higher = prefer keeping this row when deduping identical stats."""
    score = 0
    url = row.get("source_url") or ""
    month = (row.get("month") or "").lower()
    if "prc.gov.ph" in url:
        score += 20
    expected = {m.lower() for m in EXAM_CYCLES.get(exam_code, [])}
    if month in expected:
        score += 10
    url_year = parse_url_year(url)
    if url_year and url_year == row.get("year"):
        score += 5
    return score


def find_placeholder_rows(start_year: int = 2015, end_year: int = 2026) -> list[dict]:
    rows_out: list[dict] = []
    for exam_code in ALL_CODES:
        for row in db.list_exam_cycles(exam_code, start_year, end_year):
            if (row.get("total_takers") or 0) == 0:
                rows_out.append({
                    "exam_code": exam_code,
                    "id": row["id"],
                    "month": row.get("month"),
                    "year": row["year"],
                    "source_url": row.get("source_url") or "",
                    "reasons": ["placeholder_row (total_takers=0)"],
                })
    return rows_out


def find_exam_mismatch_rows(start_year: int = 2015, end_year: int = 2026) -> list[dict]:
    rows_out: list[dict] = []
    for f in audit_national(start_year, end_year):
        if f["check_id"] != "exam_content_mismatch" or not f.get("id"):
            continue
        rows_out.append({
            "exam_code": f["exam_code"],
            "id": f["id"],
            "month": f.get("month"),
            "year": f["year"],
            "source_url": f.get("source_url") or "",
            "reasons": [f["detail"]],
        })
    return rows_out


def find_duplicate_rows_to_prune(start_year: int = 2015, end_year: int = 2026) -> list[dict]:
    """Within identical-stats groups, mark lower-scored cycles for deletion."""
    prune: list[dict] = []
    for exam_code in ALL_CODES:
        rows = db.list_exam_cycles(exam_code, start_year, end_year)
        by_stats: dict[tuple, list[dict]] = {}
        for row in rows:
            if not _has_real_stats(row):
                continue
            key = (
                row.get("total_takers"),
                row.get("total_passers"),
                round(float(row.get("pass_rate") or 0), 2),
            )
            by_stats.setdefault(key, []).append(row)

        for group in by_stats.values():
            if len(group) < 2:
                continue
            ranked = sorted(group, key=lambda r: _row_keep_score(exam_code, r), reverse=True)
            keeper = ranked[0]
            for loser in ranked[1:]:
                prune.append({
                    "exam_code": exam_code,
                    "id": loser["id"],
                    "month": loser.get("month"),
                    "year": loser["year"],
                    "source_url": loser.get("source_url") or "",
                    "reasons": [
                        f"duplicate_stats (keeping {keeper.get('month')} {keeper['year']})"
                    ],
                })
    return prune


def find_suspect_rows(start_year: int = 2015, end_year: int = 2026) -> list[dict]:
    """Rows with rate_mismatch or url_year_mismatch (for cleanup_national.py)."""
    findings = audit_national(start_year, end_year)
    critical_ids = {"rate_mismatch", "url_year_mismatch"}
    suspects: list[dict] = []
    for f in findings:
        if f["check_id"] not in critical_ids:
            continue
        reasons = [f["detail"]]
        if f["check_id"] == "url_year_mismatch" and f.get("source_url") and "prcboard" in f["source_url"]:
            reasons.append("prcboard_wrong_year")
        suspects.append({
            "exam_code": f["exam_code"],
            "id": f["id"],
            "month": f.get("month"),
            "year": f["year"],
            "source_url": f.get("source_url") or "",
            "reasons": reasons,
        })
    return suspects


def audit_national(
    start_year: int = 2015,
    end_year: int = 2026,
    *,
    program_filter: str | None = None,
    index_path: Path | None = None,
) -> list[dict]:
    """Run all national exam_results checks; return flat findings list."""
    codes = [program_filter] if program_filter else ALL_CODES
    findings: list[dict] = []
    all_rows: dict[str, list[dict]] = {}

    for exam_code in codes:
        rows = db.list_exam_cycles(exam_code, start_year, end_year)
        all_rows[exam_code] = rows
        findings.extend(_check_rows(exam_code, rows))
        findings.extend(_check_duplicate_stats(exam_code, rows))
        findings.extend(_check_rate_outliers(exam_code, rows))
        findings.extend(_check_mirror_only(exam_code, rows, start_year, end_year))
        findings.extend(_check_hard_gaps(exam_code, start_year, end_year))
        findings.extend(_check_soft_gaps(exam_code, start_year, end_year))

    if index_path and index_path.is_file():
        findings.extend(_check_index_gaps(index_path, codes))

    return findings


def _check_rows(exam_code: str, rows: list[dict]) -> list[dict]:
    findings: list[dict] = []
    expected_months = {m.lower() for m in EXAM_CYCLES.get(exam_code, [])}

    for row in rows:
        url = row.get("source_url") or ""
        month = row.get("month")
        year = row["year"]
        row_id = row["id"]
        takers = row.get("total_takers") or 0
        passers = row.get("total_passers") or 0
        rate = row.get("pass_rate")

        url_year = parse_url_year(url)
        if url_year and url_year != year:
            findings.append(_finding(
                "url_year_mismatch", "critical",
                exam_code=exam_code, month=month, year=year, row_id=row_id,
                detail=f"url_year={url_year} != stored={year}",
                source_url=url,
            ))

        if takers > 0 and rate is not None:
            expected = round(passers / takers * 100, 2)
            if abs(float(rate) - expected) > 1.0:
                findings.append(_finding(
                    "rate_mismatch", "critical",
                    exam_code=exam_code, month=month, year=year, row_id=row_id,
                    detail=f"stored rate {rate}% vs computed {expected}%",
                    source_url=url,
                ))

        if takers == 0:
            findings.append(_finding(
                "placeholder_row", "warning",
                exam_code=exam_code, month=month, year=year, row_id=row_id,
                detail="total_takers=0 (list-of-passers shell; may pollute charts)",
                source_url=url,
            ))
            continue

        if url and "prcboard" in url:
            inferred = infer_exam_from_content(url, url)
            if inferred not in ("UNKNOWN", exam_code):
                findings.append(_finding(
                    "exam_content_mismatch", "critical",
                    exam_code=exam_code, month=month, year=year, row_id=row_id,
                    detail=f"URL/content infers {inferred}, stored as {exam_code}",
                    source_url=url,
                ))

            slug_owner = _slug_owner(url)
            if slug_owner and slug_owner != exam_code:
                findings.append(_finding(
                    "slug_mismatch", "warning",
                    exam_code=exam_code, month=month, year=year, row_id=row_id,
                    detail=f"URL slug matches {slug_owner}, stored as {exam_code}",
                    source_url=url,
                ))

        if month and expected_months and month.lower() not in expected_months:
            findings.append(_finding(
                "unexpected_month", "info",
                exam_code=exam_code, month=month, year=year, row_id=row_id,
                detail=f"{month} not in EXAM_CYCLES ({', '.join(EXAM_CYCLES.get(exam_code, []))})",
                source_url=url,
            ))

    return findings


def _check_duplicate_stats(exam_code: str, rows: list[dict]) -> list[dict]:
    findings: list[dict] = []
    by_stats: dict[tuple, list[dict]] = {}

    for row in rows:
        if not _has_real_stats(row):
            continue
        key = (
            row.get("total_takers"),
            row.get("total_passers"),
            round(float(row.get("pass_rate") or 0), 2),
        )
        by_stats.setdefault(key, []).append(row)

    for key, group in by_stats.items():
        if len(group) < 2:
            continue
        cycles = [f"{r.get('month')} {r['year']}" for r in group]
        findings.append(_finding(
            "duplicate_stats", "warning",
            exam_code=exam_code,
            detail=f"Same stats {key[1]}/{key[0]} ({key[2]}%) on cycles: {', '.join(cycles)}",
            action="Spot-check both cycles; delete duplicate if mislabeled",
        ))
    return findings


def _check_rate_outliers(exam_code: str, rows: list[dict]) -> list[dict]:
    findings: list[dict] = []
    real = [r for r in rows if _has_real_stats(r)]
    real.sort(key=lambda r: (r["year"], r.get("month") or ""))

    for i in range(1, len(real)):
        prev = real[i - 1]
        curr = real[i]
        prev_rate = float(prev["pass_rate"])
        curr_rate = float(curr["pass_rate"])
        delta = abs(curr_rate - prev_rate)
        if delta > 30:
            findings.append(_finding(
                "rate_outlier", "warning",
                exam_code=exam_code,
                month=curr.get("month"),
                year=curr["year"],
                row_id=curr["id"],
                detail=(
                    f"Pass rate {curr_rate}% vs prior {prev_rate}% "
                    f"(change {round(delta, 1)}pp) at {prev.get('month')} {prev['year']}"
                ),
                source_url=curr.get("source_url"),
            ))
    return findings


def _check_mirror_only(exam_code: str, rows: list[dict], start_year: int, end_year: int) -> list[dict]:
    real = [r for r in rows if _has_real_stats(r)]
    if not real:
        return []
    official = sum(1 for r in real if r.get("source_url") and "prc.gov.ph" in r["source_url"])
    if official == 0:
        return [_finding(
            "mirror_only_program", "info",
            exam_code=exam_code,
            detail=f"{len(real)} cycles with stats, 0 from prc.gov.ph ({start_year}-{end_year})",
        )]
    return []


def _check_hard_gaps(exam_code: str, start_year: int, end_year: int) -> list[dict]:
    findings: list[dict] = []
    for year in db.years_without_stats(exam_code, start_year, end_year):
        findings.append(_finding(
            "hard_coverage_gap", "warning",
            exam_code=exam_code,
            year=year,
            detail=f"No national stats for any cycle in {year}",
            action="Run national_gap_fill.py for this program/year",
        ))
    return findings


def _check_soft_gaps(exam_code: str, start_year: int, end_year: int) -> list[dict]:
    findings: list[dict] = []
    for gap in db.missing_cycles(exam_code, start_year, end_year):
        findings.append(_finding(
            "soft_coverage_gap", "check",
            exam_code=exam_code,
            month=gap["month"],
            year=gap["year"],
            detail="Expected cycle missing real stats in DB",
            action="Run national_ingest.py --fill-gaps if exam was held",
        ))
    return findings


def _check_index_gaps(index_path: Path, codes: list[str]) -> list[dict]:
    findings: list[dict] = []
    with index_path.open(encoding="utf-8") as f:
        index_rows = json.load(f)

    code_set = set(codes)
    for row in index_rows:
        if row.get("exam_code") not in code_set:
            continue
        existing = db.get_exam_result(row["exam_code"], row.get("month"), row["year"])
        if existing is None or not _has_real_stats(existing):
            findings.append(_finding(
                "index_not_ingested", "check",
                exam_code=row["exam_code"],
                month=row.get("month"),
                year=row["year"],
                detail=f"Indexed but not ingested: {row.get('title', row.get('url', ''))[:80]}",
                source_url=row.get("url"),
                action="Run national_ingest.py --from-index or --fill-gaps",
            ))
    return findings


def coverage_by_program(
    start_year: int = 2015,
    end_year: int = 2026,
    *,
    program_filter: str | None = None,
) -> list[dict]:
    """Per-program coverage summary for report tables."""
    codes = [program_filter] if program_filter else ALL_CODES
    rows_out: list[dict] = []

    for exam_code in codes:
        rows = db.list_exam_cycles(exam_code, start_year, end_year)
        with_stats = [r for r in rows if _has_real_stats(r)]
        official = sum(1 for r in with_stats if r.get("source_url") and "prc.gov.ph" in r["source_url"])
        mirror = sum(1 for r in with_stats if r.get("source_url") and "prcboard" in r["source_url"])
        years = sorted({r["year"] for r in with_stats})
        year_span = f"{min(years)}-{max(years)}" if years else "—"
        gaps = len(db.missing_cycles(exam_code, start_year, end_year))
        hard = len(db.years_without_stats(exam_code, start_year, end_year))

        rows_out.append({
            "exam_code": exam_code,
            "rows": len(rows),
            "with_stats": len(with_stats),
            "year_span": year_span,
            "official": official,
            "mirror": mirror,
            "soft_gaps": gaps,
            "hard_gap_years": hard,
        })
    return rows_out
