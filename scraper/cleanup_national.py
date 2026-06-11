#!/usr/bin/env python3
"""
Audit and remove bad national exam_results rows.

Usage:
  python cleanup_national.py --audit
  python cleanup_national.py --delete --dry-run
  python cleanup_national.py --delete
  python cleanup_national.py --delete-placeholders --dry-run
  python cleanup_national.py --delete-all-bad --dry-run   # placeholders + mismatches + dupes + rate/year
"""

from __future__ import annotations

import argparse
import sys

import db
from national_audit import (
    find_duplicate_rows_to_prune,
    find_exam_mismatch_rows,
    find_placeholder_rows,
    find_suspect_rows,
)


def _dedupe_by_id(rows: list[dict]) -> list[dict]:
    seen: set[int] = set()
    out: list[dict] = []
    for row in rows:
        rid = row["id"]
        if rid in seen:
            continue
        seen.add(rid)
        out.append(row)
    return out


def collect_bad_rows(
    start_year: int,
    end_year: int,
    *,
    placeholders: bool = False,
    mismatches: bool = False,
    duplicates: bool = False,
    rate_year: bool = False,
) -> list[dict]:
    rows: list[dict] = []
    if rate_year:
        rows.extend(find_suspect_rows(start_year, end_year))
    if placeholders:
        rows.extend(find_placeholder_rows(start_year, end_year))
    if mismatches:
        rows.extend(find_exam_mismatch_rows(start_year, end_year))
    if duplicates:
        rows.extend(find_duplicate_rows_to_prune(start_year, end_year))
    return _dedupe_by_id(rows)


def delete_rows(rows: list[dict], *, dry_run: bool) -> int:
    deleted = 0
    for row in rows:
        label = f"{row['exam_code']} {row.get('month')} {row['year']} (id={row['id']})"
        if dry_run:
            print(f"  [dry-run] would delete {label}: {', '.join(row['reasons'])}")
            deleted += 1
            continue
        db.client().table("exam_results").delete().eq("id", row["id"]).execute()
        db.audit("delete", "exam_results", row["id"], {
            "exam_code": row["exam_code"],
            "reasons": row["reasons"],
            "source_url": row.get("source_url"),
        })
        print(f"  deleted {label}: {', '.join(row['reasons'])}")
        deleted += 1
    return deleted


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean bad national exam_results")
    parser.add_argument("--audit", action="store_true", help="Report rate/year suspect rows only")
    parser.add_argument("--delete", action="store_true", help="Delete rate/year suspect rows")
    parser.add_argument("--delete-placeholders", action="store_true", help="Delete total_takers=0 rows")
    parser.add_argument("--delete-mismatches", action="store_true", help="Delete exam_content_mismatch rows")
    parser.add_argument("--delete-duplicates", action="store_true", help="Prune duplicate_stats losers")
    parser.add_argument(
        "--delete-all-bad",
        action="store_true",
        help="Delete placeholders, mismatches, duplicates, and rate/year suspects",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show without deleting")
    parser.add_argument("--start", type=int, default=2015)
    parser.add_argument("--end", type=int, default=2026)
    args = parser.parse_args()

    actions = [
        args.delete,
        args.delete_placeholders,
        args.delete_mismatches,
        args.delete_duplicates,
        args.delete_all_bad,
    ]
    if not args.audit and not any(actions):
        parser.print_help()
        sys.exit(1)

    try:
        if args.audit:
            suspects = find_suspect_rows(args.start, args.end)
            print(f"\nFound {len(suspects)} rate/year suspect row(s)\n")
            for row in suspects:
                print(
                    f"  {row['exam_code']} {row.get('month')} {row['year']} "
                    f"id={row['id']}: {', '.join(row['reasons'])}"
                )
            return

        if args.delete_all_bad:
            to_delete = collect_bad_rows(
                args.start, args.end,
                placeholders=True, mismatches=True, duplicates=True, rate_year=True,
            )
        else:
            to_delete = collect_bad_rows(
                args.start, args.end,
                placeholders=args.delete_placeholders,
                mismatches=args.delete_mismatches,
                duplicates=args.delete_duplicates,
                rate_year=args.delete,
            )

        print(f"\nFound {len(to_delete)} row(s) to delete\n")
        for row in to_delete:
            print(
                f"  {row['exam_code']} {row.get('month')} {row['year']} "
                f"id={row['id']}: {', '.join(row['reasons'])}"
            )

        n = delete_rows(to_delete, dry_run=args.dry_run)
        print(f"\n{'Would delete' if args.dry_run else 'Deleted'} {n} row(s)")

    except RuntimeError as exc:
        print(f"DB not configured: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
