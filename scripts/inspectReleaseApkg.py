#!/usr/bin/env python3
"""Fail-closed structural inspection for release-candidate Anki packages."""

import argparse
import html
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
HTML_TAG = re.compile(r"<[^>]+>")
RUBY_TEXT = re.compile(r"<ruby>(.*?)<rt>.*?</rt></ruby>", re.IGNORECASE | re.DOTALL)
WHITESPACE = re.compile(r"\s+")


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


def normalize_for_compare(value):
    text = RUBY_TEXT.sub(r"\1", str(value or ""))
    text = HTML_TAG.sub(" ", text)
    text = re.sub(r":\s+", ":", text)
    return html.unescape(WHITESPACE.sub(" ", text).strip()).lower()


def includes_all(value, expected_values):
    normalized_value = normalize_for_compare(value)
    return all(normalize_for_compare(expected) in normalized_value for expected in expected_values or [])


def load_golden_expectations(golden_directory, deck_kind, levels):
    expectations = []
    for level in levels:
        file_name = (
            f"golden_n{level}_word_review_set.json"
            if deck_kind == "word"
            else f"golden_n{level}_review_set.json"
        )
        manifest_path = golden_directory / file_name
        if not manifest_path.is_file() or manifest_path.is_symlink():
            fail(f"required tracked Golden manifest is missing or unsafe: {manifest_path}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, list) or not manifest:
            fail(f"tracked Golden manifest must be a nonempty array: {manifest_path}")
        expectations.extend(manifest)
    return expectations


def inspect_kanji_golden_fields(note_fields, expectations):
    notes_by_kanji = {}
    for fields in note_fields:
        kanji = fields.get("Kanji", "")
        if not kanji or kanji in notes_by_kanji:
            fail(f"kanji release notes must have unique nonempty Kanji fields: {kanji!r}")
        notes_by_kanji[kanji] = fields

    failures = []
    expected_kanji = set()
    for expectation in expectations:
        kanji = expectation.get("kanji", "")
        if not kanji or kanji in expected_kanji:
            failures.append(f"invalid or duplicate kanji expectation: {kanji!r}")
            continue
        expected_kanji.add(kanji)
        fields = notes_by_kanji.get(kanji)
        if fields is None:
            failures.append(f"missing APKG note for Golden kanji {kanji}")
            continue
        reading = " / ".join([
            fields.get("PrimaryReading", ""),
            fields.get("OnReading", ""),
            fields.get("KunReading", ""),
        ])
        meaning = " / ".join([fields.get("MeaningJP", ""), fields.get("KanjiMeanings", "")])
        checks = [
            ("reading", reading, expectation.get("readingIncludes", [])),
            ("primary reading", fields.get("PrimaryReading", ""), expectation.get("readingIncludes", [])),
            ("meaning", meaning, expectation.get("meaningIncludes", [])),
            ("example", fields.get("ExampleSentence", ""), expectation.get("exampleIncludes", [])),
            ("notes", fields.get("Notes", ""), expectation.get("notesIncludes", [])),
        ]
        for label, actual, expected in checks:
            if not actual or not includes_all(actual, expected):
                failures.append(f"{kanji} {label} does not satisfy tracked Golden expectations")

    unexpected = sorted(set(notes_by_kanji) - expected_kanji)
    if unexpected:
        failures.append(f"APKG has kanji notes without Golden expectations: {', '.join(unexpected[:20])}")
    if failures:
        fail("tracked Golden APKG field inspection failed: " + "; ".join(failures[:20]))


def inspect_word_golden_fields(note_fields, expectations):
    failures = []
    matched_note_indexes = set()
    expectation_keys = set()
    for expectation in expectations:
        word = expectation.get("word", "")
        expected_readings = expectation.get("readingIncludes", [])
        if not isinstance(expected_readings, list) or len(expected_readings) != 1:
            failures.append(f"word expectation must declare exactly one identity reading: {word!r}")
            continue
        expected_reading = expected_readings[0]
        expectation_key = (normalize_for_compare(word), tuple(map(normalize_for_compare, expected_readings)))
        if not word or expectation_key in expectation_keys:
            failures.append(f"invalid or duplicate word expectation: {word!r}")
            continue
        expectation_keys.add(expectation_key)
        candidates = [
            (index, fields)
            for index, fields in enumerate(note_fields)
            if fields.get("Word", "") == word
            and normalize_for_compare(fields.get("Reading", "")) == normalize_for_compare(expected_reading)
        ]
        if len(candidates) != 1:
            failures.append(f"expected one APKG note for Golden word {word}; found {len(candidates)}")
            continue
        note_index, fields = candidates[0]
        if note_index in matched_note_indexes:
            failures.append(f"APKG word note matched multiple Golden expectations: {word}")
            continue
        matched_note_indexes.add(note_index)
        checks = [
            ("reading", "Reading", "readingIncludes"),
            ("meaning", "Meaning", "meaningIncludes"),
            ("JLPT level", "JLPTLevel", "jlptLevelIncludes"),
            ("coverage role", "CoverageRole", "coverageRoleIncludes"),
            ("focus", "FocusKanji", "focusIncludes"),
            ("covered reading", "CoversReading", "coversReadingIncludes"),
            ("breakdown", "KanjiBreakdown", "breakdownIncludes"),
            ("example", "ExampleSentence", "exampleIncludes"),
            ("notes", "Notes", "notesIncludes"),
        ]
        for label, field_name, expectation_name in checks:
            actual = fields.get(field_name, "")
            if not actual or not includes_all(actual, expectation.get(expectation_name, [])):
                failures.append(f"{word} {label} does not satisfy tracked Golden expectations")

    if len(matched_note_indexes) != len(note_fields):
        failures.append(
            f"APKG has {len(note_fields) - len(matched_note_indexes)} word notes without Golden expectations"
        )
    if failures:
        fail("tracked Golden APKG field inspection failed: " + "; ".join(failures[:20]))


def inspect_golden_fields(note_fields, artifact, golden_directory):
    expectations = load_golden_expectations(
        golden_directory,
        artifact["deckKind"],
        artifact["levels"],
    )
    if len(expectations) != len(note_fields):
        fail(
            "tracked Golden expectation count does not match APKG notes: "
            f"expected {len(expectations)}, actual {len(note_fields)}"
        )
    if artifact["deckKind"] == "word":
        inspect_word_golden_fields(note_fields, expectations)
    else:
        inspect_kanji_golden_fields(note_fields, expectations)
    return len(expectations)


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
        model_field_names = {
            int(model_id): [field.get("name", "") for field in model.get("flds", [])]
            for model_id, model in models.items()
        }
        media_references = set()
        note_fields = []
        for note_id, _guid, model_id, fields in note_rows:
            if model_id not in model_field_names:
                fail(f"note {note_id} references unknown model {model_id}")
            split_fields = fields.split(FIELD_SEPARATOR)
            field_names = model_field_names[model_id]
            if any(not name for name in field_names) or len(set(field_names)) != len(field_names):
                fail(f"note model {model_id} must have unique nonempty field names")
            if len(split_fields) != len(field_names):
                fail(
                    f"note {note_id} field count mismatch: expected "
                    f"{len(field_names)}, actual {len(split_fields)}"
                )
            note_fields.append(dict(zip(field_names, split_fields)))
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
            "_noteFields": note_fields,
        }
    finally:
        connection.close()


def inspect_apkg(apkg_path, artifact, golden_directory=None):
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

    note_fields = collection.pop("_noteFields")
    golden_expectations = (
        inspect_golden_fields(note_fields, artifact, golden_directory)
        if golden_directory is not None
        else 0
    )

    return {
        "deckKind": artifact["deckKind"],
        "levels": artifact["levels"],
        "releaseAssetName": artifact["releaseAssetName"],
        "archiveMembers": len(names),
        "mediaEntries": len(media_map),
        "goldenExpectations": golden_expectations,
        **collection,
    }


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True, help="Release QA evidence packet path")
    parser.add_argument("--artifact-dir", required=True, help="Directory containing release APKG assets")
    parser.add_argument("--require-golden", action="store_true", help="Fail unless every APKG note satisfies the tracked full-level Golden manifest")
    parser.add_argument("--golden-dir", help="Golden manifest directory override for tests")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    return parser.parse_args()


def main():
    args = parse_args()
    packet_path = Path(args.packet).resolve()
    artifact_directory = Path(args.artifact_dir).resolve()
    if args.golden_dir and not args.require_golden:
        fail("--golden-dir requires --require-golden")
    golden_directory = (
        Path(args.golden_dir).resolve()
        if args.golden_dir
        else Path(__file__).resolve().parent.parent / "templates"
    ) if args.require_golden else None
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
        inspections.append(inspect_apkg(
            artifact_directory / asset_name,
            artifact,
            golden_directory=golden_directory,
        ))

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
                f"{inspection['cards']} cards, {inspection['mediaEntries']} media entries, "
                f"{inspection['goldenExpectations']} Golden expectations"
            )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - CLI must fail closed with one clear message.
        print(f"Release APKG structural inspection failed: {error}", file=sys.stderr)
        sys.exit(1)
