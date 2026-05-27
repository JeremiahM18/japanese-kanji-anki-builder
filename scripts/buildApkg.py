import argparse
import hashlib
import json
import shutil
import sqlite3
import time
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DETERMINISTIC_ZIP_TIMESTAMP = (2024, 1, 1, 0, 0, 0)
DETERMINISTIC_MOD_EPOCH = 1_704_067_200
NOTE_SCHEMA_PATHS = {
    "kanji": REPO_ROOT / "src" / "config" / "ankiNoteSchema.json",
    "kanji-additional": REPO_ROOT / "src" / "config" / "ankiNoteSchema.json",
    "word": REPO_ROOT / "src" / "config" / "ankiWordNoteSchema.json",
}


def load_anki_note_schema(deck_kind: str):
    schema_path = NOTE_SCHEMA_PATHS.get(deck_kind)
    if not schema_path:
        raise RuntimeError(f"Unsupported deck kind: {deck_kind}")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    required_keys = {"noteTypeName", "cardTemplateName", "fieldNames", "cssLines", "qfmt", "afmtLines"}
    missing_keys = sorted(required_keys - set(schema.keys()))
    if missing_keys:
        raise RuntimeError("Anki note schema is missing keys: " + ", ".join(missing_keys))
    return schema


def parse_levels(value: str):
    levels = []
    for part in value.split(","):
        normalized = part.strip().upper().replace("N", "")
        if normalized.isdigit() and int(normalized) in {1, 2, 3, 4, 5}:
            levels.append(int(normalized))
    return levels or [5]


def build_deck_name(level: int, deck_kind: str) -> str:
    if deck_kind == "word":
        return f"Japanese Kanji Builder::Word Deck::JLPT N{level}"
    if deck_kind == "kanji-additional":
        return f"Japanese Kanji Builder::Additional Unverified::JLPT N{level}"
    return f"Japanese Kanji Builder::JLPT N{level}"


def build_apkg_file_name(levels, deck_kind: str):
    suffix = "-".join(f"n{level}" for level in levels) or "deck"
    if deck_kind == "word":
        prefix = "japanese-kanji-builder-words"
    elif deck_kind == "kanji-additional":
        prefix = "japanese-kanji-builder-additional-unverified"
    else:
        prefix = "japanese-kanji-builder"
    return f"{prefix}-{suffix}.apkg"


def build_export_file_name(level: int, deck_kind: str) -> str:
    if deck_kind == "word":
        return f"jlpt-n{level}-words.tsv"
    if deck_kind == "kanji-additional":
        return f"additional-unverified-n{level}.tsv"
    return f"jlpt-n{level}.tsv"


def parse_tsv(tsv_path: Path):
    lines = [line.rstrip("\n\r") for line in tsv_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not lines:
        return [], []
    return lines[0].split("\t"), [line.split("\t") for line in lines[1:]]


def build_css(note_schema) -> str:
    return "\n".join(note_schema["cssLines"])


def build_qfmt(note_schema) -> str:
    return note_schema["qfmt"]


def build_afmt(note_schema) -> str:
    return "".join(note_schema["afmtLines"])


def normalize_tsv_row(header, cols, field_names):
    if not header:
        return [(cols[i] if i < len(cols) else "") for i in range(len(field_names))]

    header_index = {name: index for index, name in enumerate(header)}
    fields = []
    for field_name in field_names:
        if field_name not in header_index:
            fields.append("")
            continue
        source_index = header_index[field_name]
        fields.append(cols[source_index] if source_index < len(cols) else "")
    return fields


def validate_tsv_header(header, level: int, field_names, deck_kind: str):
    if not header:
        return

    missing = []
    for field_name in field_names:
        if field_name in header:
            continue
        missing.append(field_name)

    extras = [name for name in header if name not in field_names]
    if missing or extras:
        details = []
        if missing:
            details.append(f"missing fields: {', '.join(missing)}")
        if extras:
            details.append(f"unexpected fields: {', '.join(extras)}")
        raise RuntimeError(
            f"Unexpected TSV header in {build_export_file_name(level, deck_kind)} ({'; '.join(details)})"
        )


def build_model(model_id: int, deck_id: int, mod: int, note_schema, field_names):
    fields = []
    for index, name in enumerate(field_names):
        fields.append({
            "name": name,
            "ord": index,
            "rtl": False,
            "sticky": False,
            "collapsed": False,
            "plainText": False,
            "font": "Arial",
            "size": 20,
            "description": "",
            "media": [],
            "id": mod + index + 1,
            "tag": None,
            "preventDeletion": False,
        })

    templates = [{
        "name": note_schema["cardTemplateName"],
        "ord": 0,
        "qfmt": build_qfmt(note_schema),
        "afmt": build_afmt(note_schema),
        "bqfmt": "",
        "bafmt": "",
        "did": None,
        "id": mod + 100,
    }]

    return {
        str(model_id): {
            "css": build_css(note_schema),
            "did": deck_id,
            "flds": fields,
            "id": model_id,
            "latexPost": "\\end{document}",
            "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}",
            "mod": mod,
            "name": note_schema["noteTypeName"],
            "req": [[0, "all", [0]]],
            "sortf": 0,
            "tags": [],
            "tmpls": templates,
            "type": 0,
            "usn": 0,
            "vers": [],
        }
    }


def build_decks(deck_ids_by_level, mod: int, deck_kind: str):
    decks = {}
    for level, deck_id in deck_ids_by_level.items():
        decks[str(deck_id)] = {
            "collapsed": False,
            "browserCollapsed": False,
            "conf": 1,
            "desc": "",
            "dyn": 0,
            "extendNew": 0,
            "extendRev": 0,
            "id": deck_id,
            "lrnToday": [0, 0],
            "mod": mod,
            "name": build_deck_name(level, deck_kind),
            "newToday": [0, 0],
            "revToday": [0, 0],
            "timeToday": [0, 0],
            "usn": 0,
        }
    return decks


def build_dconf(mod: int):
    return {
        "1": {
            "autoplay": True,
            "buryInterdayLearning": False,
            "buryNew": False,
            "buryReviews": False,
            "dyn": False,
            "id": 1,
            "lapse": {"delays": [10], "leechAction": 0, "leechFails": 8, "minInt": 1, "mult": 0},
            "maxTaken": 60,
            "mod": mod,
            "name": "Default",
            "new": {"bury": False, "delays": [1, 10], "initialFactor": 2500, "ints": [1, 4, 7], "order": 1, "perDay": 20},
            "replayq": True,
            "rev": {"bury": False, "ease4": 1.3, "fuzz": 0.05, "ivlFct": 1, "maxIvl": 36500, "perDay": 200},
            "timer": 0,
            "usn": 0,
        }
    }


def build_conf():
    return {
        "activeDecks": [1],
        "addToCur": True,
        "curDeck": 1,
        "currentModelId": 1,
        "collapseTime": 1200,
        "dueCounts": True,
        "estTimes": True,
        "newSpread": 0,
        "nightMode": False,
        "sortType": "noteFld",
        "timeLim": 0,
    }


def compute_checksum(value: str) -> int:
    return int(hashlib.sha1(value.encode("utf-8")).hexdigest()[:8], 16)


def build_guid(primary_field: str, level: int, deck_kind: str) -> str:
    return hashlib.sha1(f"{deck_kind}:{level}:{primary_field}".encode("utf-8")).hexdigest()[:10]


def update_hash_with_file(digest, file_path: Path, label: str):
    digest.update(label.encode("utf-8"))
    digest.update(b"\0")
    digest.update(str(file_path.name).encode("utf-8"))
    digest.update(b"\0")
    digest.update(file_path.read_bytes())
    digest.update(b"\0")


def update_hash_with_media_file(digest, file_path: Path, media_integrity):
    digest.update("media".encode("utf-8"))
    digest.update(b"\0")
    digest.update(str(file_path.name).encode("utf-8"))
    digest.update(b"\0")

    checksum = media_integrity.get(file_path.name, {}).get("sha256")
    if checksum:
        digest.update(b"sha256")
        digest.update(b"\0")
        digest.update(checksum.encode("utf-8"))
    else:
        digest.update(b"bytes")
        digest.update(b"\0")
        digest.update(file_path.read_bytes())
    digest.update(b"\0")


def is_safe_portable_relative_path(value: str) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or "\0" in value:
        return False
    parts = value.split("/")
    return all(part and part not in {".", ".."} for part in parts)


def is_path_inside(parent: Path, child: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def load_media_integrity(package_root: Path):
    integrity_path = package_root / "media-integrity.json"
    if not integrity_path.exists():
        return {}

    parsed = json.loads(integrity_path.read_text(encoding="utf-8"))
    files = parsed.get("files", [])
    if not isinstance(files, list):
        raise RuntimeError("media-integrity.json must contain a files array.")

    source_root_value = parsed.get("sourceRoot")
    source_root_path = None
    if source_root_value:
        source_root = str(source_root_value)
        if not is_safe_portable_relative_path(source_root):
            raise RuntimeError("media-integrity.json has an unsafe sourceRoot.")
        source_root_path = (REPO_ROOT / Path(*source_root.split("/"))).resolve()
        if not is_path_inside(REPO_ROOT, source_root_path):
            raise RuntimeError("media-integrity.json sourceRoot escapes the repository.")
        if not source_root_path.exists() or not source_root_path.is_dir():
            source_root_path = None

    media_integrity = {}
    for entry in files:
        if not isinstance(entry, dict):
            continue
        file_name = str(entry.get("fileName") or "")
        sha256 = str(entry.get("sha256") or "").lower()
        if not file_name or not sha256:
            continue
        if len(sha256) != 64 or any(char not in "0123456789abcdef" for char in sha256):
            raise RuntimeError(f"Invalid media-integrity checksum for {file_name}.")

        source_path = None
        source_relative_path = entry.get("sourceRelativePath")
        if source_root_path is not None and source_relative_path:
            source_relative_path = str(source_relative_path)
            if not is_safe_portable_relative_path(source_relative_path):
                raise RuntimeError(f"Unsafe media-integrity source path for {file_name}.")
            source_path = source_root_path / Path(*source_relative_path.split("/"))

        byte_size = entry.get("byteSize")
        media_integrity[file_name] = {
            "sha256": sha256,
            "sourcePath": source_path,
            "byteSize": byte_size if isinstance(byte_size, int) and byte_size >= 0 else None,
        }

    return media_integrity


def resolve_archive_media_path(package_media_path: Path, media_integrity):
    entry = media_integrity.get(package_media_path.name, {})
    source_path = entry.get("sourcePath")
    if source_path:
        return source_path

    return package_media_path


def list_package_media_files(media_dir: Path, media_integrity):
    if media_integrity:
        return [media_dir / file_name for file_name in sorted(media_integrity.keys())]

    return sorted([item for item in media_dir.iterdir() if item.is_file()]) if media_dir.exists() else []


def capture_timing(timings_ms, key: str, started_at: float):
    if timings_ms is not None:
        timings_ms[key] = round((time.perf_counter() - started_at) * 1000, 2)


def build_package_fingerprint(levels, package_exports_dir: Path, media_dir: Path, deck_kind: str, note_schema, media_integrity=None) -> str:
    digest = hashlib.sha256()
    digest.update(deck_kind.encode("utf-8"))
    digest.update(b"\0")
    digest.update(",".join(str(level) for level in levels).encode("utf-8"))
    digest.update(b"\0")
    digest.update(json.dumps(note_schema, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    digest.update(b"\0")

    for level in levels:
        update_hash_with_file(digest, package_exports_dir / build_export_file_name(level, deck_kind), f"export:N{level}")

    if media_integrity:
        for file_name in sorted(media_integrity.keys()):
            update_hash_with_media_file(digest, media_dir / file_name, media_integrity)
    elif media_dir.exists():
        for file_path in sorted([item for item in media_dir.iterdir() if item.is_file()]):
            update_hash_with_media_file(digest, file_path, media_integrity or {})

    return digest.hexdigest()


def build_deterministic_seed(fingerprint: str) -> int:
    return int(fingerprint[:15], 16)


def build_deterministic_mod(seed: int) -> int:
    return DETERMINISTIC_MOD_EPOCH + (seed % 31_536_000)


def create_collection_db(db_path: Path, levels, package_exports_dir: Path, deck_kind: str, timings_ms=None, media_integrity=None):
    db_path.parent.mkdir(parents=True, exist_ok=True)

    schema_started_at = time.perf_counter()
    note_schema = load_anki_note_schema(deck_kind)
    capture_timing(timings_ms, "collection.loadNoteSchema", schema_started_at)

    fingerprint_started_at = time.perf_counter()
    fingerprint = build_package_fingerprint(levels, package_exports_dir, package_exports_dir.parent / "media", deck_kind, note_schema, media_integrity)
    capture_timing(timings_ms, "collection.buildFingerprint", fingerprint_started_at)

    unique_seed = build_deterministic_seed(fingerprint)
    mod = build_deterministic_mod(unique_seed)
    now_ms = mod * 1000
    model_id = unique_seed
    deck_ids_by_level = {level: unique_seed + 1000 + index for index, level in enumerate(levels)}
    field_names = note_schema["fieldNames"]

    note_rows = []
    card_rows = []
    order = 1

    rows_started_at = time.perf_counter()
    for level in levels:
        header, rows = parse_tsv(package_exports_dir / build_export_file_name(level, deck_kind))
        validate_tsv_header(header, level, field_names, deck_kind)

        for cols in rows:
            fields = normalize_tsv_row(header, cols, field_names)
            note_id = unique_seed + 2000 + len(note_rows)
            note_rows.append((
                note_id,
                build_guid(fields[0], level, deck_kind),
                model_id,
                mod,
                0,
                "",
                "\x1f".join(fields),
                fields[0],
                compute_checksum(fields[0]),
                0,
                "",
            ))
            card_rows.append((
                unique_seed + 5000 + len(card_rows),
                note_id,
                deck_ids_by_level[level],
                0,
                mod,
                0,
                0,
                0,
                order,
                0,
                2500,
                0,
                0,
                0,
                0,
                0,
                0,
                "",
            ))
            order += 1
    capture_timing(timings_ms, "collection.parseRows", rows_started_at)

    sqlite_started_at = time.perf_counter()
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=OFF")
        cur.execute("PRAGMA synchronous=OFF")
        cur.execute("PRAGMA temp_store=MEMORY")
        cur.executescript(
            """
            CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
            CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
            CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
            CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
            CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
            CREATE INDEX ix_notes_usn on notes (usn);
            CREATE INDEX ix_cards_usn on cards (usn);
            CREATE INDEX ix_cards_nid on cards (nid);
            CREATE INDEX ix_cards_sched on cards (did, queue, due);
            """
        )
        cur.execute(
            "INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                1,
                mod,
                mod,
                now_ms,
                11,
                0,
                0,
                0,
                json.dumps(build_conf(), ensure_ascii=False),
                json.dumps(build_model(model_id, deck_ids_by_level[levels[0]], mod, note_schema, field_names), ensure_ascii=False),
                json.dumps(build_decks(deck_ids_by_level, mod, deck_kind), ensure_ascii=False),
                json.dumps(build_dconf(mod), ensure_ascii=False),
                "{}",
            ),
        )
        cur.executemany("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", note_rows)
        cur.executemany("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", card_rows)
        conn.commit()
    finally:
        conn.close()
    capture_timing(timings_ms, "collection.writeSqlite", sqlite_started_at)

    return len(note_rows), len(deck_ids_by_level)


def write_deterministic_archive_file(archive, file_path: Path, arcname: str, compression=zipfile.ZIP_DEFLATED):
    info = zipfile.ZipInfo(arcname, date_time=DETERMINISTIC_ZIP_TIMESTAMP)
    info.compress_type = compression
    info.external_attr = 0o644 << 16
    archive.writestr(info, file_path.read_bytes())


def build_apkg(out_dir: Path, levels, deck_kind: str):
    total_started_at = time.perf_counter()
    timings_ms = {}
    result = None
    package_root = out_dir / "package"
    exports_dir = package_root / "exports"
    media_dir = package_root / "media"
    apkg_path = package_root / build_apkg_file_name(levels, deck_kind)
    stage_dir = package_root / ".apkg-staging"

    validate_started_at = time.perf_counter()
    missing_exports = [level for level in levels if not (exports_dir / build_export_file_name(level, deck_kind)).exists()]
    capture_timing(timings_ms, "validateExports", validate_started_at)
    if missing_exports:
        missing_list = ", ".join(f"N{level}" for level in missing_exports)
        raise RuntimeError(
            "Missing packaged TSV exports for " + missing_list + ". Run `npm run "
            + ("deck:words:ready" if deck_kind == "word" else "deck:ready")
            + " -- --levels="
            + ",".join(str(level) for level in levels)
            + "` before `npm run "
            + ("deck:words:apkg" if deck_kind == "word" else "deck:apkg")
            + " -- --levels="
            + ",".join(str(level) for level in levels)
            + "`."
        )

    stage_started_at = time.perf_counter()
    if stage_dir.exists():
        shutil.rmtree(stage_dir, ignore_errors=True)
    stage_dir.mkdir(parents=True, exist_ok=True)
    capture_timing(timings_ms, "prepareStage", stage_started_at)

    try:
        collection_path = stage_dir / "collection.anki2"
        media_index_path = stage_dir / "media"

        integrity_started_at = time.perf_counter()
        media_integrity = load_media_integrity(package_root)
        capture_timing(timings_ms, "loadMediaIntegrity", integrity_started_at)

        collection_started_at = time.perf_counter()
        note_count, deck_count = create_collection_db(collection_path, levels, exports_dir, deck_kind, timings_ms, media_integrity)
        capture_timing(timings_ms, "createCollectionDb", collection_started_at)

        media_list_started_at = time.perf_counter()
        media_files = list_package_media_files(media_dir, media_integrity)
        media_map = {}
        for index, file_path in enumerate(media_files):
            media_map[str(index)] = file_path.name
        capture_timing(timings_ms, "listMediaFiles", media_list_started_at)

        media_index_started_at = time.perf_counter()
        media_index_path.write_text(json.dumps(media_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        capture_timing(timings_ms, "writeMediaIndex", media_index_started_at)

        remove_started_at = time.perf_counter()
        if apkg_path.exists():
            apkg_path.unlink()
        capture_timing(timings_ms, "removeExistingApkg", remove_started_at)

        archive_started_at = time.perf_counter()
        with zipfile.ZipFile(apkg_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            write_deterministic_archive_file(archive, collection_path, "collection.anki2")
            write_deterministic_archive_file(archive, media_index_path, "media")
            for index, file_path in enumerate(media_files):
                write_deterministic_archive_file(
                    archive,
                    resolve_archive_media_path(file_path, media_integrity),
                    str(index),
                    compression=zipfile.ZIP_STORED,
                )
        capture_timing(timings_ms, "writeArchive", archive_started_at)

        timings_ms["totalBeforeCleanup"] = round((time.perf_counter() - total_started_at) * 1000, 2)
        result = {
            "filePath": str(apkg_path),
            "skipped": False,
            "skipReason": "",
            "noteCount": note_count,
            "deckCount": deck_count,
            "mediaFileCount": len(media_files),
            "timingsMs": timings_ms,
        }
        return result
    finally:
        cleanup_started_at = time.perf_counter()
        shutil.rmtree(stage_dir, ignore_errors=True)
        capture_timing(timings_ms, "cleanupStage", cleanup_started_at)
        timings_ms["total"] = round((time.perf_counter() - total_started_at) * 1000, 2)
        if result is not None:
            result["timingsMs"] = timings_ms


def main():
    parser = argparse.ArgumentParser(description="Build an Anki .apkg from packaged TSV/media artifacts.")
    parser.add_argument("--out-dir", default="out/build", help="Build output directory containing the package folder.")
    parser.add_argument("--levels", default="5", help="Comma-separated JLPT levels, for example 5 or 5,4.")
    parser.add_argument("--deck-kind", default="kanji", choices=["kanji", "kanji-additional", "word"], help="Packaged deck type to build.")
    parser.add_argument("--json", action="store_true", help="Emit a machine-readable JSON summary instead of plain text.")
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    levels = parse_levels(args.levels)
    result = build_apkg(out_dir, levels, args.deck_kind)

    if args.json:
        print(json.dumps(result, ensure_ascii=False))
        return

    print("Japanese Kanji Builder APKG")
    print("")
    print(f"Output: {result['filePath']}")
    print(f"Decks: {result['deckCount']}")
    print(f"Notes: {result['noteCount']}")
    print(f"Media files: {result['mediaFileCount']}")


if __name__ == "__main__":
    main()

