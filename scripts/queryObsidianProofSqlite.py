import argparse
import json
from pathlib import Path
import sqlite3
import sys


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Query the generated Obsidian proof SQLite mirror."
    )
    parser.add_argument("--db", required=True)
    parser.add_argument("--deck-kind")
    parser.add_argument("--level", type=int)
    parser.add_argument("--batch")
    parser.add_argument("--target")
    parser.add_argument("--limit", type=int, default=20)
    return parser.parse_args(argv)


def build_where(args):
    clauses = []
    params = []
    if args.deck_kind:
        clauses.append("deck_kind = ?")
        params.append(args.deck_kind)
    if args.level is not None:
        clauses.append("level = ?")
        params.append(args.level)
    if args.batch:
        clauses.append("batch_id = ?")
        params.append(args.batch)
    if args.target:
        clauses.append("card_reviewed = ?")
        params.append(args.target)
    return clauses, params


def query_rows(conn, args):
    clauses, params = build_where(args)
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    limit = max(1, min(args.limit, 500))
    rows = conn.execute(
        f"""
        SELECT proof_id, deck_kind, level, written, reading, card_reviewed,
               obsidian_standard_version,
               batch_id, batch_sequence, reviewed_at, reviewer, result,
               limitation_decision
        FROM proof_events
        {where_sql}
        ORDER BY deck_kind, level, batch_sequence, card_reviewed, obsidian_standard_version, proof_id
        LIMIT ?
        """,
        [*params, limit],
    ).fetchall()
    return [
        {
            "proofId": row[0],
            "deckKind": row[1],
            "level": row[2],
            "written": row[3],
            "reading": row[4],
            "cardReviewed": row[5],
            "obsidianStandardVersion": row[6],
            "batchId": row[7],
            "batchSequence": row[8],
            "reviewedAt": row[9],
            "reviewer": row[10],
            "result": row[11],
            "limitationDecision": row[12],
        }
        for row in rows
    ]


def count_rows(conn, args):
    clauses, params = build_where(args)
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return conn.execute(
        f"SELECT count(*) FROM proof_events {where_sql}",
        params,
    ).fetchone()[0]


def query_batch_counts(conn):
    rows = conn.execute(
        """
        SELECT deck_kind, level, batch_id, count(*)
        FROM proof_events
        GROUP BY deck_kind, level, batch_id
        ORDER BY deck_kind, level, batch_id
        """
    ).fetchall()
    return [
        {
            "deckKind": row[0],
            "level": row[1],
            "batchId": row[2],
            "proofEvents": row[3],
        }
        for row in rows
    ]


def main(argv):
    args = parse_args(argv)
    db_uri = f"{Path(args.db).resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(db_uri, uri=True)
    try:
        result = {
            "matchedProofEvents": count_rows(conn, args),
            "rows": query_rows(conn, args),
            "batchCounts": query_batch_counts(conn),
        }
    finally:
        conn.close()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
