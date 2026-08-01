#!/usr/bin/env python3
"""Fail-closed structural inspection for release-candidate Anki packages."""

import argparse
import json
import re
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


FIELD_SEPARATOR = "\x1f"
SOUND_REFERENCE = re.compile(r"\[sound:([^\]\r\n]+)\]")
HTML_MEDIA_REFERENCE = re.compile(r"(?:src|href)=[\"']([^\"']+)[\"']", re.IGNORECASE)
REQUIRED_TABLES = {"col", "notes", "cards", "revlog", "graves"}


def fail(message):
    raise RuntimeError(message)


def expected_deck_names(deck_kind, levels):
    if deck_kind == "word":
        return {f"Japanese Kanji Builder::Word Deck::JLPT N{level}" for level in levels}
    if deck_kind == "kanji":
        return {f"Japanese Kanji Builder::JLPT N{level}" for level in levels}
    fail(f"unsupported release deck kind: {deck_kind}")


def validate_archive_name(name):
    parsed = PurePosixPath(name)
    if not name or parsed.is_absolute() or "\\" in name or "\x00" in name:
        fail(f"unsafe APKG archive member name: {name!r}")
    if any(part in {"", ".", ".."} for part in parsed.parts):
        fail(f"unsafe APKG archive member path: {name}")
    if len(parsed.parts) != 1:
        fail(f"APKG archive members must be top-level files: {name}")


def inspect_collection(database_path, artifact, media_names):
    connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
        quick_check = connection.execute("PRAGMA quick_check").fetchone()
        if quick_check != ("ok",):
            fail(f"SQLite quick_check failed: {quick_check}")

        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        missing_tables = sorted(REQUIRED_TABLES - tables)
        if missing_tables:
            fail("Anki collection is missing required tables: " + ", ".join(missing_tables))

        collection_rows = connection.execute("SELECT ver, models, decks FROM col").fetchall()
        if len(collection_rows) != 1:
            fail(f"Anki collection must contain exactly one col row; found {len(collection_rows)}")
        collection_version, models_json, decks_json = collection_rows[0]
        if collection_version != 11:
            fail(f"unsupported Anki collection version: {collection_version}")
        models = json.loads(models_json)
        decks = json.loads(decks_json)
        if not isinstance(models, dict) or not models:
            fail("Anki collection models must be a nonempty object")
        if not isinstance(decks, dict) or not decks:
            fail("Anki collection decks must be a nonempty object")

        actual_deck_names = {deck.get("name") for deck in decks.values()}
        required_deck_names = expected_deck_names(artifact["deckKind"], artifact["levels"])
        if actual_deck_names != required_deck_names:
            fail(
                "Anki deck names do not match release scope: "
                f"expected {sorted(required_deck_names)}, actual {sorted(actual_deck_names)}"
            )

        note_rows = connection.execute("SELECT id, guid, mid, flds FROM notes ORDER BY id").fetchall()
        card_rows = connection.execute("SELECT id, nid, did FROM cards ORDER BY id").fetchall()
        if len(note_rows) != artifact["notes"]:
            fail(f"note count mismatch: expected {artifact['notes']}, actual {len(note_rows)}")
        if len(card_rows) != artifact["cards"]:
            fail(f"card count mismatch: expected {artifact['cards']}, actual {len(card_rows)}")

        note_ids = {row[0] for row in note_rows}
        guids = [row[1] for row in note_rows]
        if any(not guid for guid in guids) or len(set(guids)) != len(guids):
            fail("Anki notes must have nonempty unique GUIDs")
        model_field_counts = {
            int(model_id): len(model.get("flds", []))
            for model_id, model in models.items()
        }
        media_references = set()
        for note_id, _guid, model_id, fields in note_rows:
            if model_id not in model_field_counts:
                fail(f"note {note_id} references unknown model {model_id}")
            split_fields = fields.split(FIELD_SEPARATOR)
            if len(split_fields) != model_field_counts[model_id]:
                fail(
                    f"note {note_id} field count mismatch: expected "
                    f"{model_field_counts[model_id]}, actual {len(split_fields)}"
                )
            for field in split_fields:
                media_references.update(SOUND_REFERENCE.findall(field))
                media_references.update(HTML_MEDIA_REFERENCE.findall(field))

        deck_ids = {int(deck_id) for deck_id in decks}
        seen_card_ids = set()
        for card_id, note_id, deck_id in card_rows:
            if card_id in seen_card_ids:
                fail(f"duplicate card id: {card_id}")
            seen_card_ids.add(card_id)
            if note_id not in note_ids:
                fail(f"card {card_id} references unknown note {note_id}")
            if deck_id not in deck_ids:
                fail(f"card {card_id} references unknown deck {deck_id}")
        missing_media = sorted(media_references - media_names)
        if missing_media:
            fail("Anki fields reference media absent from the APKG: " + ", ".join(missing_media[:20]))

        return {
            "collectionVersion": collection_version,
            "notes": len(note_rows),
            "cards": len(card_rows),
            "decks": sorted(actual_deck_names),
            "models": len(models),
            "referencedMedia": len(media_references),
        }
    finally:
        connection.close()


def inspect_apkg(apkg_path, artifact):
    if not apkg_path.is_file() or apkg_path.is_symlink():
        fail(f"release APKG must be a regular non-symbolic-link file: {apkg_path}")
    with zipfile.ZipFile(apkg_path, "r") as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(names) != len(set(names)):
            fail("APKG archive contains duplicate member names")
        for info in infos:
            validate_archive_name(info.filename)
            if info.is_dir():
                fail(f"APKG archive must not contain directory entries: {info.filename}")
            if info.flag_bits & 0x1:
                fail(f"APKG archive member must not be encrypted: {info.filename}")
        corrupt_member = archive.testzip()
        if corrupt_member:
            fail(f"APKG CRC validation failed for {corrupt_member}")
        if "collection.anki2" not in names or "media" not in names:
            fail("APKG must contain collection.anki2 and media")

        media_map = json.loads(archive.read("media").decode("utf-8"))
        if not isinstance(media_map, dict):
            fail("APKG media index must be a JSON object")
        expected_keys = [str(index) for index in range(len(media_map))]
        if list(media_map.keys()) != expected_keys:
            fail("APKG media index keys must be contiguous canonical decimal strings")
        media_values = list(media_map.values())
        if any(not isinstance(name, str) or not name or Path(name).name != name for name in media_values):
            fail("APKG media index values must be nonempty basenames")
        if len(media_values) != len(set(media_values)):
            fail("APKG media index contains duplicate target names")
        if len(media_map) != artifact["mediaEntries"]:
            fail(
                f"media count mismatch: expected {artifact['mediaEntries']}, "
                f"actual {len(media_map)}"
            )
        expected_members = {"collection.anki2", "media", *media_map.keys()}
        if set(names) != expected_members:
            missing = sorted(expected_members - set(names))
            extra = sorted(set(names) - expected_members)
            fail(f"APKG archive membership mismatch: missing={missing}, extra={extra}")

        with tempfile.TemporaryDirectory(prefix="release-apkg-inspection-") as temp_dir:
            database_path = Path(temp_dir) / "collection.anki2"
            database_path.write_bytes(archive.read("collection.anki2"))
            collection = inspect_collection(database_path, artifact, set(media_values))

    return {
        "deckKind": artifact["deckKind"],
        "levels": artifact["levels"],
        "releaseAssetName": artifact["releaseAssetName"],
        "archiveMembers": len(names),
        "mediaEntries": len(media_map),
        **collection,
    }


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True, help="Release QA evidence packet path")
    parser.add_argument("--artifact-dir", required=True, help="Directory containing release APKG assets")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    return parser.parse_args()


def main():
    args = parse_args()
    packet_path = Path(args.packet).resolve()
    artifact_directory = Path(args.artifact_dir).resolve()
    packet = json.loads(packet_path.read_text(encoding="utf-8"))
    artifacts = packet.get("scope", {}).get("artifacts", [])
    if not isinstance(artifacts, list) or not artifacts:
        fail("release packet scope.artifacts must be a nonempty array")

    inspections = []
    for artifact in artifacts:
        asset_name = artifact.get("releaseAssetName", "")
        if (
            not isinstance(asset_name, str)
            or not asset_name
            or "/" in asset_name
            or "\\" in asset_name
            or "\x00" in asset_name
            or Path(asset_name).name != asset_name
        ):
            fail(f"invalid releaseAssetName: {asset_name!r}")
        inspections.append(inspect_apkg(artifact_directory / asset_name, artifact))

    report = {
        "status": "pass",
        "packet": str(packet_path),
        "artifactDirectory": str(artifact_directory),
        "releaseCandidateId": packet.get("scope", {}).get("releaseCandidateId", ""),
        "artifacts": inspections,
    }
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("Release APKG structural inspection")
        print("Status: pass")
        print(f"Release candidate: {report['releaseCandidateId']}")
        for inspection in inspections:
            print(
                f"- {inspection['releaseAssetName']}: {inspection['notes']} notes, "
                f"{inspection['cards']} cards, {inspection['mediaEntries']} media entries"
            )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - CLI must fail closed with one clear message.
        print(f"Release APKG structural inspection failed: {error}", file=sys.stderr)
        sys.exit(1)
