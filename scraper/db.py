"""
Supabase data-access layer for the ETL pipeline.

Replaces the original SQLite writes. All writes are idempotent upserts against
the UNIQUE keys defined in supabase/migrations/0001_init.sql, so re-running the
scraper never creates duplicates (NFR-5).
"""

import os
import time
from datetime import datetime, timezone

from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

from normalize import normalize_school_name, slugify

# Load repo-root .env.local / .env so scraper works from scraper/ without a duplicate file.
_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env.local")
load_dotenv(_root / ".env")
load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_client: Client | None = None
_program_cache: dict[str, int] = {}
_region_cache: dict[str, int] = {}
_school_cache: dict[str, int] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _execute(req, *, attempts: int = 6):
    """Retry transient Supabase/HTTP failures during long ETL runs."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            return req.execute()
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError, OSError) as exc:
            last = exc
            if i + 1 >= attempts:
                raise
            time.sleep(5 * (i + 1))
    raise last  # pragma: no cover


def client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SERVICE_KEY:
            raise RuntimeError(
                "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. "
                "Copy .env.example to .env and fill in your Supabase keys."
            )
        _client = create_client(SUPABASE_URL, SERVICE_KEY)
    return _client


# ─── Programs ────────────────────────────────────────────────────────────────
def get_program_id(exam_code: str) -> int:
    if exam_code in _program_cache:
        return _program_cache[exam_code]
    res = _execute(client().table("programs").select("id").eq("exam_code", exam_code).limit(1))
    if not res.data:
        raise RuntimeError(f"Program '{exam_code}' not in DB. Run supabase/seed/seed.sql first.")
    pid = res.data[0]["id"]
    _program_cache[exam_code] = pid
    return pid


# ─── Regions ─────────────────────────────────────────────────────────────────
def get_region_id(region_name: str | None) -> int | None:
    if not region_name:
        return None
    key = region_name.strip().lower()
    if key in _region_cache:
        return _region_cache[key]
    res = (
        client().table("regions").select("id,name,code")
        .or_(f"name.ilike.%{region_name}%,code.ilike.%{region_name}%")
        .limit(1).execute()
    )
    rid = res.data[0]["id"] if res.data else None
    if rid:
        _region_cache[key] = rid
    return rid


# ─── Schools ─────────────────────────────────────────────────────────────────
def get_or_create_school(name: str, region: str | None = None) -> int | None:
    clean = normalize_school_name(name)
    if not clean:
        return None
    key = clean.lower()
    if key in _school_cache:
        return _school_cache[key]

    existing = client().table("schools").select("id").eq("name", clean).limit(1).execute()
    if existing.data:
        sid = existing.data[0]["id"]
        _school_cache[key] = sid
        return sid

    base_slug = slugify(clean)
    # PRC lists the same campus under slightly different spellings; reuse slug match.
    slug_match = (
        client().table("schools").select("id").eq("slug", base_slug).limit(1).execute()
    )
    if slug_match.data:
        sid = slug_match.data[0]["id"]
        _school_cache[key] = sid
        return sid

    slug = base_slug
    for n in range(2, 20):
        try:
            row = {
                "name": clean,
                "slug": slug,
                "region_id": get_region_id(region),
            }
            created = client().table("schools").insert(row).execute()
            sid = created.data[0]["id"]
            _school_cache[key] = sid
            return sid
        except Exception as exc:
            msg = str(exc).lower()
            if "schools_name_key" in msg or "duplicate key" in msg and "name" in msg:
                again = client().table("schools").select("id").eq("name", clean).limit(1).execute()
                if again.data:
                    sid = again.data[0]["id"]
                    _school_cache[key] = sid
                    return sid
            if "schools_slug_key" in msg or "slug" in msg:
                slug = f"{base_slug}-{n}"
                continue
            raise
    return None


# ─── Exam results ────────────────────────────────────────────────────────────
def get_exam_result(exam_code: str, month: str | None, year: int) -> dict | None:
    """Fetch one exam_results row by program + cycle, or None."""
    program_id = get_program_id(exam_code)
    q = (
        client()
        .table("exam_results")
        .select("id, month, year, total_takers, total_passers, pass_rate, source_url")
        .eq("program_id", program_id)
        .eq("year", year)
    )
    if month is None:
        q = q.is_("month", "null")
    else:
        q = q.eq("month", month)
    res = _execute(q.limit(1))
    return res.data[0] if res.data else None


def list_exam_cycles(exam_code: str, start_year: int, end_year: int) -> list[dict]:
    """Return existing exam_results rows for a program within a year range."""
    program_id = get_program_id(exam_code)
    res = (
        client()
        .table("exam_results")
        .select("id, month, year, total_takers, total_passers, pass_rate, source_url")
        .eq("program_id", program_id)
        .gte("year", start_year)
        .lte("year", end_year)
        .order("year")
        .order("month")
    )
    res = _execute(res)
    return res.data or []


def list_placeholder_cycles(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
) -> list[dict]:
    """exam_results shells (total_takers=0) within a year range."""
    rows: list[dict] = []
    for code in exam_codes:
        for row in list_exam_cycles(code, start_year, end_year):
            if (row.get("total_takers") or 0) <= 0:
                rows.append({**row, "exam_code": code})
    return rows


def missing_cycles(
    exam_code: str,
    start_year: int,
    end_year: int,
) -> list[dict]:
    """
    Expected cycles from EXAM_CYCLES minus rows already in exam_results.

    Gaps are OK when no exam was held that cycle; this is a soft guide for
  --fill-gaps, not a guarantee every month should exist.
    """
    from programs import EXAM_CYCLES

    existing = {
        (r.get("month"), r["year"])
        for r in list_exam_cycles(exam_code, start_year, end_year)
        if r.get("total_takers")
    }
    months = EXAM_CYCLES.get(exam_code, ["March", "June", "September", "December"])
    missing: list[dict] = []
    for year in range(start_year, end_year + 1):
        for month in months:
            if (month, year) not in existing:
                missing.append({"exam_code": exam_code, "year": year, "month": month})
    return missing


def years_without_stats(
    exam_code: str,
    start_year: int,
    end_year: int,
) -> list[int]:
    """Years with no exam_results row that has real national stats (hard gap)."""
    by_year: dict[int, bool] = {}
    for row in list_exam_cycles(exam_code, start_year, end_year):
        if (row.get("total_takers") or 0) > 0 and row.get("pass_rate") is not None:
            by_year[row["year"]] = True
    return [y for y in range(start_year, end_year + 1) if not by_year.get(y)]


def gap_report(
    exam_code: str,
    start_year: int,
    end_year: int,
) -> dict:
    """
    Distinguish hard gaps (no stats for entire year) vs soft gaps
    (registry EXAM_CYCLES month missing but other months may exist).
    """
    rows = list_exam_cycles(exam_code, start_year, end_year)
    with_stats = [r for r in rows if (r.get("total_takers") or 0) > 0]
    years_with_data = {r["year"] for r in with_stats}
    hard = [y for y in range(start_year, end_year + 1) if y not in years_with_data]
    soft = missing_cycles(exam_code, start_year, end_year)
    return {
        "exam_code": exam_code,
        "cycles_with_stats": len(with_stats),
        "hard_gap_years": hard,
        "soft_gap_cycles": soft,
    }


def missing_cycles_from_index(index_rows: list[dict]) -> list[dict]:
    """Index rows with no complete national stats in the DB yet."""
    missing: list[dict] = []
    for row in index_rows:
        existing = get_exam_result(row["exam_code"], row.get("month"), row["year"])
        if existing is None:
            missing.append(row)
            continue
        if existing.get("total_takers") is None or existing.get("pass_rate") is None:
            missing.append(row)
    return missing


def upsert_exam_result(exam_code: str, month: str | None, year: int, stats: dict, url: str) -> int:
    program_id = get_program_id(exam_code)
    row = {
        "program_id": program_id,
        "month": month,
        "year": year,
        "total_takers": stats.get("total_takers"),
        "total_passers": stats.get("total_passers"),
        "pass_rate": stats.get("pass_rate"),
        "source_url": url,
        "scraped_at": now_iso(),
    }
    res = _execute(
        client().table("exam_results").upsert(row, on_conflict="program_id,month,year")
    )
    return res.data[0]["id"]


# ─── School performance ──────────────────────────────────────────────────────
def upsert_school_performance(exam_result_id: int, rows: list[dict]) -> int:
    saved = 0
    failed = 0

    def to_int(v):
        try:
            return int(str(v).replace(",", "").strip())
        except (ValueError, TypeError):
            return None

    def to_float(v):
        try:
            return float(str(v).replace("%", "").replace(",", "").strip())
        except (ValueError, TypeError):
            return None

    for r in rows:
        try:
            sid = get_or_create_school(str(r.get("school", "")), r.get("region"))
            if not sid:
                failed += 1
                continue

            row = {
                "exam_result_id": exam_result_id,
                "school_id": sid,
                "takers": to_int(r.get("takers")),
                "passers": to_int(r.get("passers")),
                "pass_rate": to_float(r.get("pass_rate")),
                "rank": to_int(r.get("rank")),
                "scraped_at": now_iso(),
            }
            client().table("school_performance").upsert(
                row, on_conflict="exam_result_id,school_id"
            ).execute()
            saved += 1
        except Exception as exc:
            failed += 1
            print(f"  [WARN] Skipped school row '{r.get('school', '')}': {exc}")
    if failed:
        print(f"  [WARN] {failed} school rows failed to save")
    return saved


# ─── Topnotchers ─────────────────────────────────────────────────────────────
def upsert_topnotchers(exam_result_id: int, rows: list[dict]) -> int:
    payload = []
    for t in rows[:10]:
        payload.append({
            "exam_result_id": exam_result_id,
            "rank": t.get("rank"),
            "name": t.get("name"),
            "school": t.get("school"),
            "rating": t.get("rating"),
            "scraped_at": now_iso(),
        })
    if payload:
        client().table("topnotchers").upsert(payload, on_conflict="exam_result_id,rank").execute()
    return len(payload)


# ─── Admin: import jobs + audit ──────────────────────────────────────────────
def start_import_job(exam_code: str, year: int) -> int:
    row = {
        "program_id": get_program_id(exam_code),
        "year": year,
        "status": "running",
        "started_at": now_iso(),
    }
    res = _execute(client().table("import_jobs").insert(row))
    return res.data[0]["id"]


def finish_import_job(job_id: int, status: str, rows_affected: int, notes: str = "") -> None:
    _execute(client().table("import_jobs").update({
        "status": status,
        "rows_affected": rows_affected,
        "finished_at": now_iso(),
        "notes": notes,
    }).eq("id", job_id))


def audit(action: str, entity: str, entity_id: int | None, detail: dict) -> None:
    client().table("audit_logs").insert({
        "actor": "scraper",
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "detail": detail,
        "created_at": now_iso(),
    }).execute()

