"""
Supabase data-access layer for the ETL pipeline.

Replaces the original SQLite writes. All writes are idempotent upserts against
the UNIQUE keys defined in supabase/migrations/0001_init.sql, so re-running the
scraper never creates duplicates (NFR-5).
"""

import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client, Client

from normalize import normalize_school_name, slugify

load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_client: Client | None = None
_program_cache: dict[str, int] = {}
_region_cache: dict[str, int] = {}
_school_cache: dict[str, int] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    res = client().table("programs").select("id").eq("exam_code", exam_code).limit(1).execute()
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
    else:
        row = {
            "name": clean,
            "slug": slugify(clean),
            "region_id": get_region_id(region),
        }
        created = client().table("schools").upsert(row, on_conflict="name").execute()
        sid = created.data[0]["id"]
    _school_cache[key] = sid
    return sid


# ─── Exam results ────────────────────────────────────────────────────────────
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
    res = client().table("exam_results").upsert(row, on_conflict="program_id,month,year").execute()
    return res.data[0]["id"]


# ─── School performance ──────────────────────────────────────────────────────
def upsert_school_performance(exam_result_id: int, rows: list[dict]) -> int:
    saved = 0
    for r in rows:
        sid = get_or_create_school(str(r.get("school", "")), r.get("region"))
        if not sid:
            continue

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
    res = client().table("import_jobs").insert(row).execute()
    return res.data[0]["id"]


def finish_import_job(job_id: int, status: str, rows_affected: int, notes: str = "") -> None:
    client().table("import_jobs").update({
        "status": status,
        "rows_affected": rows_affected,
        "finished_at": now_iso(),
        "notes": notes,
    }).eq("id", job_id).execute()


def audit(action: str, entity: str, entity_id: int | None, detail: dict) -> None:
    client().table("audit_logs").insert({
        "actor": "scraper",
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "detail": detail,
        "created_at": now_iso(),
    }).execute()
