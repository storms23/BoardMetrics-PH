#!/usr/bin/env python3
"""
Delete all exam_results (and cascaded school_performance / topnotchers) for one program.

Usage:
  python cleanup_program.py CELE --dry-run
  python cleanup_program.py CELE --delete
"""

from __future__ import annotations

import argparse
import sys

import db
from programs import resolve_exam_code


def list_cycles(exam_code: str, start_year: int, end_year: int) -> list[dict]:
    return db.list_exam_cycles(exam_code, start_year, end_year)


def delete_program(exam_code: str, start_year: int, end_year: int, *, dry_run: bool) -> int:
    cycles = list_cycles(exam_code, start_year, end_year)
    if not cycles:
        print(f"No exam_results rows for {exam_code} in {start_year}–{end_year}")
        return 0

    print(f"\n{exam_code}: {len(cycles)} cycle(s) to remove\n")
    for row in cycles:
        label = f"{row.get('month') or '?'} {row['year']} (id={row['id']})"
        if dry_run:
            print(f"  [dry-run] would delete {label}")
            continue
        db.client().table("exam_results").delete().eq("id", row["id"]).execute()
        db.audit("delete", "exam_results", row["id"], {
            "exam_code": exam_code,
            "reason": "cleanup_program",
            "month": row.get("month"),
            "year": row["year"],
            "source_url": row.get("source_url"),
        })
        print(f"  deleted {label}")

    return len(cycles)


def main() -> None:
    parser = argparse.ArgumentParser(description="Wipe all exam cycles for one program")
    parser.add_argument("exam_code", help="Exam code e.g. CELE")
    parser.add_argument("--start", type=int, default=2000)
    parser.add_argument("--end", type=int, default=2030)
    parser.add_argument("--dry-run", action="store_true", help="List rows only")
    parser.add_argument("--delete", action="store_true", help="Delete rows")
    args = parser.parse_args()

    if not args.dry_run and not args.delete:
        print("Specify --dry-run or --delete")
        sys.exit(1)

    if not db.SUPABASE_URL or not db.SERVICE_KEY:
        print("SUPABASE env not configured")
        sys.exit(1)

    exam_code = resolve_exam_code(args.exam_code)
    if not exam_code:
        print(f"Unknown exam code: {args.exam_code}")
        sys.exit(1)
    n = delete_program(exam_code, args.start, args.end, dry_run=args.dry_run)
    action = "Would delete" if args.dry_run else "Deleted"
    print(f"\n{action} {n} cycle(s) for {exam_code}")


if __name__ == "__main__":
    main()
