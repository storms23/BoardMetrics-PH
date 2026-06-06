#!/usr/bin/env python3
"""
consistency.py — recompute the proprietary Consistency Score.

For each (school, program) with >= 2 cycles:
  score = clamp(0..100, 100 - (stdev(pass_rate) * 2)
                        + (times_above_national / cycles * 20))

Buckets: Excellent (>=85) · Very Good (>=70) · Good (>=55) · Fair (>=40) · Poor

Run after scraping:  python consistency.py
"""

import statistics
from collections import defaultdict

import db


def label_for(score: float) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Very Good"
    if score >= 55:
        return "Good"
    if score >= 40:
        return "Fair"
    return "Poor"


def recompute() -> int:
    cl = db.client()

    # Pull performance joined with the exam cycle's national rate + program.
    rows = cl.table("school_performance").select(
        "school_id, pass_rate, exam_results(program_id, pass_rate)"
    ).execute().data

    # group: (school_id, program_id) -> list of (school_rate, national_rate)
    grouped: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for r in rows:
        er = r.get("exam_results") or {}
        program_id = er.get("program_id")
        if program_id is None or r.get("pass_rate") is None:
            continue
        grouped[(r["school_id"], program_id)].append(
            (float(r["pass_rate"]), er.get("pass_rate"))
        )

    payload = []
    for (school_id, program_id), pairs in grouped.items():
        rates = [p[0] for p in pairs]
        cycles = len(rates)
        if cycles < 2:
            continue
        stdev = statistics.stdev(rates)
        above = sum(1 for s, n in pairs if n is not None and s > n)
        raw = 100 - (stdev * 2) + (above / cycles * 20)
        score = max(0.0, min(100.0, round(raw, 1)))
        payload.append({
            "school_id": school_id,
            "program_id": program_id,
            "avg_rate": round(sum(rates) / cycles, 2),
            "volatility": round(stdev, 2),
            "score": score,
            "label": label_for(score),
            "years": cycles,
            "computed_at": db.now_iso(),
        })

    if payload:
        cl.table("consistency_scores").upsert(
            payload, on_conflict="school_id,program_id"
        ).execute()
    return len(payload)


if __name__ == "__main__":
    n = recompute()
    print(f"Recomputed consistency scores for {n} (school x program) pairs.")
