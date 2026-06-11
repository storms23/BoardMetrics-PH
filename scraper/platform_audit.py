"""
Full-platform audit checks (school_performance, schools) for verify_data.py.

Mirrors aggregate logic in src/lib/admin.ts but returns row-level findings.
"""

from __future__ import annotations

from typing import Literal

import db

Severity = Literal["critical", "warning", "info", "check"]

ACTIONS = {
    "dup_school_name": "Merge or dedupe schools in DB manually",
    "dup_school_performance": "Delete duplicate performance row",
    "exam_no_schools": "Run school scraper for this cycle if data exists",
    "perf_passers_gt_takers": "Re-scrape or fix performance row",
    "perf_rate_out_of_range": "Re-scrape or fix performance row",
    "perf_missing_rate": "Re-scrape or recompute pass_rate",
}


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


def _fetch_all(table: str, select: str, *, page_size: int = 1000) -> list[dict]:
    """Paginate past Supabase's default 1000-row cap."""
    sb = db.client()
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table(table)
            .select(select)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _load_platform_data() -> tuple[list[dict], list[dict], list[dict], dict[int, str]]:
    perf_rows = _fetch_all(
        "school_performance",
        "id, takers, passers, pass_rate, exam_result_id, school_id",
    )
    exam_rows = _fetch_all(
        "exam_results",
        "id, program_id, month, year, total_takers, total_passers, pass_rate",
    )
    school_rows = _fetch_all("schools", "id, name")
    prog_res = db.client().table("programs").select("id, exam_code").execute()
    prog_map = {p["id"]: p["exam_code"] for p in (prog_res.data or [])}

    return perf_rows, exam_rows, school_rows, prog_map


def _exam_label(exam: dict, prog_map: dict[int, str]) -> tuple[str | None, str | None, int | None]:
    code = prog_map.get(exam.get("program_id"))
    return code, exam.get("month"), exam.get("year")


def audit_platform() -> list[dict]:
    """Row-level school / platform checks."""
    findings: list[dict] = []
    perf_rows, exam_rows, school_rows, prog_map = _load_platform_data()

    exam_by_id = {e["id"]: e for e in exam_rows}
    school_by_id = {s["id"]: s["name"] for s in school_rows}

    # Duplicate school names
    name_groups: dict[str, list[int]] = {}
    for s in school_rows:
        key = (s.get("name") or "").strip().lower()
        if not key:
            continue
        name_groups.setdefault(key, []).append(s["id"])

    for name, ids in name_groups.items():
        if len(ids) < 2:
            continue
        findings.append(_finding(
            "dup_school_name", "warning",
            detail=f"'{name}' appears on {len(ids)} school ids: {ids}",
        ))

    # Duplicate performance rows (same exam_result_id + school_id)
    perf_keys: dict[str, list[dict]] = {}
    for p in perf_rows:
        key = f"{p['exam_result_id']}:{p['school_id']}"
        perf_keys.setdefault(key, []).append(p)

    for key, group in perf_keys.items():
        if len(group) < 2:
            continue
        er_id, school_id = key.split(":", 1)
        exam = exam_by_id.get(int(er_id), {})
        code, month, year = _exam_label(exam, prog_map)
        school_name = school_by_id.get(int(school_id), f"school_id={school_id}")
        findings.append(_finding(
            "dup_school_performance", "critical",
            exam_code=code, month=month, year=year,
            detail=f"Duplicate perf for {school_name} in cycle (ids: {[g['id'] for g in group]})",
            action="Delete duplicate performance row",
        ))

    exam_ids_with_schools = {p["exam_result_id"] for p in perf_rows}

    for exam in exam_rows:
        code, month, year = _exam_label(exam, prog_map)
        if exam["id"] not in exam_ids_with_schools and (exam.get("total_takers") or 0) > 0:
            findings.append(_finding(
                "exam_no_schools", "info",
                exam_code=code, month=month, year=year, row_id=exam["id"],
                detail="National stats present but no per-school performance rows",
                action="Run school scraper for this cycle if data exists",
            ))

    for p in perf_rows:
        exam = exam_by_id.get(p["exam_result_id"], {})
        code, month, year = _exam_label(exam, prog_map)
        school_name = school_by_id.get(p["school_id"], f"id={p['school_id']}")

        if p.get("pass_rate") is None:
            findings.append(_finding(
                "perf_missing_rate", "warning",
                exam_code=code, month=month, year=year, row_id=p["id"],
                detail=f"Missing pass_rate for {school_name}",
            ))

        rate = p.get("pass_rate")
        if rate is not None and (rate < 0 or rate > 100):
            findings.append(_finding(
                "perf_rate_out_of_range", "critical",
                exam_code=code, month=month, year=year, row_id=p["id"],
                detail=f"{school_name}: pass_rate={rate} out of 0-100",
            ))

        takers = p.get("takers")
        passers = p.get("passers")
        if takers is not None and passers is not None and passers > takers:
            findings.append(_finding(
                "perf_passers_gt_takers", "critical",
                exam_code=code, month=month, year=year, row_id=p["id"],
                detail=f"{school_name}: passers ({passers}) > takers ({takers})",
            ))

    return findings
