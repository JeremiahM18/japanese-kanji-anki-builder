import argparse
import json
import os
import sqlite3
import sys


SCHEMA_VERSION = 1


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Build the generated local SQLite mirror for Obsidian proof ledger records."
    )
    parser.add_argument("--input-json", required=True)
    parser.add_argument("--output-db", required=True)
    return parser.parse_args(argv)


def require_text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value


def load_payload(input_json):
    with open(input_json, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if payload.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"Unsupported SQLite payload schema version: {payload.get('schemaVersion')}")
    events = payload.get("events")
    if not isinstance(events, list):
        raise ValueError("SQLite payload events must be an array")
    return payload


def assert_safe_output_path(db_path):
    if not db_path.lower().endswith((".sqlite", ".db")):
        raise ValueError(f"Output database must end in .sqlite or .db: {db_path}")
    parent = os.path.dirname(os.path.abspath(db_path))
    if not parent:
        raise ValueError("Output database path must include a parent directory")
    if os.path.islink(db_path):
        raise ValueError(f"Refusing to replace symlinked SQLite output: {db_path}")
    if os.path.exists(db_path) and not os.path.isfile(db_path):
        raise ValueError(f"Refusing to replace non-file SQLite output: {db_path}")
    os.makedirs(parent, exist_ok=True)


def initialize_schema(conn):
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(
        """
        CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE proof_events (
            proof_id TEXT PRIMARY KEY,
            target_key TEXT NOT NULL UNIQUE,
            deck_kind TEXT NOT NULL,
            level INTEGER NOT NULL,
            written TEXT NOT NULL,
            reading TEXT NOT NULL,
            card_reviewed TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            batch_sequence INTEGER,
            review_standard TEXT NOT NULL,
            reviewed_at TEXT NOT NULL,
            reviewer TEXT NOT NULL,
            result TEXT NOT NULL,
            scope TEXT NOT NULL,
            limitation_decision TEXT NOT NULL,
            recorded_at TEXT NOT NULL,
            recorded_by TEXT NOT NULL,
            source_review_set_path TEXT NOT NULL,
            source_commit TEXT NOT NULL,
            representation_migration INTEGER NOT NULL CHECK (representation_migration IN (0, 1)),
            event_json TEXT NOT NULL,
            sentence_quality_json TEXT NOT NULL,
            authority_json TEXT NOT NULL,
            ledger_json TEXT NOT NULL
        );

        CREATE INDEX idx_proof_events_target
            ON proof_events(deck_kind, level, written, reading);

        CREATE INDEX idx_proof_events_batch
            ON proof_events(batch_id, batch_sequence);

        CREATE TABLE evidence_checks (
            proof_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            detail TEXT NOT NULL,
            PRIMARY KEY (proof_id, position),
            FOREIGN KEY (proof_id) REFERENCES proof_events(proof_id) ON DELETE CASCADE
        );
        """
    )


def insert_metadata(conn, payload):
    rows = [
        ("schemaVersion", str(SCHEMA_VERSION)),
        ("sourceOfTruth", require_text(payload.get("sourceOfTruth"), "sourceOfTruth")),
        ("ledgerDir", require_text(payload.get("ledgerDir"), "ledgerDir")),
        ("authority", json.dumps(payload.get("authority", {}), ensure_ascii=False, sort_keys=True)),
    ]
    conn.executemany("INSERT INTO metadata(key, value) VALUES (?, ?)", rows)


def build_target_key(event):
    target = event["target"]
    return f"{target['deckKind']}:n{target['level']}:{target['cardReviewed']}"


def insert_event(conn, event):
    proof_id = require_text(event.get("proofId"), "proofId")
    target = event.get("target") or {}
    batch = event.get("batch") or {}
    proof = event.get("proof") or {}
    ledger = event.get("ledger") or {}
    authority = event.get("authority") or {}
    evidence_checked = proof.get("evidenceChecked")
    if not isinstance(evidence_checked, list) or len(evidence_checked) < 1:
        raise ValueError(f"event {proof_id} must include evidenceChecked array")

    conn.execute(
        """
        INSERT INTO proof_events(
            proof_id, target_key, deck_kind, level, written, reading, card_reviewed,
            batch_id, batch_sequence, review_standard, reviewed_at, reviewer, result,
            scope, limitation_decision, recorded_at, recorded_by, source_review_set_path,
            source_commit, representation_migration, event_json, sentence_quality_json,
            authority_json, ledger_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            proof_id,
            build_target_key(event),
            require_text(target.get("deckKind"), f"{proof_id}.target.deckKind"),
            int(target.get("level")),
            require_text(target.get("written"), f"{proof_id}.target.written"),
            require_text(target.get("reading"), f"{proof_id}.target.reading"),
            require_text(target.get("cardReviewed"), f"{proof_id}.target.cardReviewed"),
            require_text(batch.get("id"), f"{proof_id}.batch.id"),
            batch.get("sequence"),
            require_text(proof.get("reviewStandard"), f"{proof_id}.proof.reviewStandard"),
            require_text(proof.get("reviewedAt"), f"{proof_id}.proof.reviewedAt"),
            require_text(proof.get("reviewer"), f"{proof_id}.proof.reviewer"),
            require_text(proof.get("result"), f"{proof_id}.proof.result"),
            require_text(proof.get("scope"), f"{proof_id}.proof.scope"),
            require_text(proof.get("limitationDecision"), f"{proof_id}.proof.limitationDecision"),
            require_text(ledger.get("recordedAt"), f"{proof_id}.ledger.recordedAt"),
            require_text(ledger.get("recordedBy"), f"{proof_id}.ledger.recordedBy"),
            require_text(ledger.get("sourceReviewSetPath"), f"{proof_id}.ledger.sourceReviewSetPath"),
            require_text(ledger.get("sourceCommit"), f"{proof_id}.ledger.sourceCommit"),
            1 if ledger.get("representationMigration") else 0,
            json.dumps(event, ensure_ascii=False, sort_keys=True),
            json.dumps(proof.get("sentenceQualityReview", {}), ensure_ascii=False, sort_keys=True),
            json.dumps(authority, ensure_ascii=False, sort_keys=True),
            json.dumps(ledger, ensure_ascii=False, sort_keys=True),
        ),
    )

    conn.executemany(
        "INSERT INTO evidence_checks(proof_id, position, detail) VALUES (?, ?, ?)",
        [
            (proof_id, index + 1, require_text(detail, f"{proof_id}.evidenceChecked[{index}]"))
            for index, detail in enumerate(evidence_checked)
        ],
    )


def build_sqlite_mirror(payload, db_path):
    assert_safe_output_path(db_path)
    tmp_path = f"{db_path}.tmp"
    if os.path.islink(tmp_path):
        raise ValueError(f"Refusing to replace symlinked SQLite temp output: {tmp_path}")
    if os.path.exists(tmp_path):
        if not os.path.isfile(tmp_path):
            raise ValueError(f"Refusing to replace non-file SQLite temp output: {tmp_path}")
        os.remove(tmp_path)

    conn = sqlite3.connect(tmp_path)
    try:
        initialize_schema(conn)
        insert_metadata(conn, payload)
        for event in payload["events"]:
            insert_event(conn, event)
        conn.commit()
    finally:
        conn.close()

    os.replace(tmp_path, db_path)
    return {
        "sqliteVersion": sqlite3.sqlite_version,
        "proofEvents": len(payload["events"]),
        "evidenceChecks": sum(len(event["proof"]["evidenceChecked"]) for event in payload["events"]),
        "outputDb": os.path.abspath(db_path),
        "tables": ["metadata", "proof_events", "evidence_checks"],
    }


def main(argv):
    args = parse_args(argv)
    payload = load_payload(args.input_json)
    summary = build_sqlite_mirror(payload, args.output_db)
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
