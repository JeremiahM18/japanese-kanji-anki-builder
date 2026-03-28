import argparse
import hashlib
import json
import shutil
import sqlite3
import time
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ANKI_NOTE_SCHEMA_PATH = REPO_ROOT / "src" / "config" / "ankiNoteSchema.json"


def load_anki_note_schema():
    schema = json.loads(ANKI_NOTE_SCHEMA_PATH.read_text(encoding="utf-8"))
    required_keys = {"noteTypeName", "cardTemplateName", "fieldNames", "cssLines", "qfmt", "afmtLines"}
    missing_keys = sorted(required_keys - set(schema.keys()))
    if missing_keys:
        raise RuntimeError("Anki note schema is missing keys: " + ", ".join(missing_keys))
    return schema


ANKI_NOTE_SCHEMA = load_anki_note_schema()
FIELD_NAMES = ANKI_NOTE_SCHEMA["fieldNames"]
ANKI_NOTE_TYPE_NAME = ANKI_NOTE_SCHEMA["noteTypeName"]
ANKI_CARD_TEMPLATE_NAME = ANKI_NOTE_SCHEMA["cardTemplateName"]


def normalize_tsv_row(header, cols):
    if not header:
        return [(cols[i] if i < len(cols) else "") for i in range(len(FIELD_NAMES))]

    header_index = {name: index for index, name in enumerate(header)}
    fields = []
    for field_name in FIELD_NAMES:
        if field_name not in header_index:
            fields.append("")
            continue
        source_index = header_index[field_name]
        fields.append(cols[source_index] if source_index < len(cols) else "")
    return fields


def validate_tsv_header(header, level: int):
    if not header:
        return

    missing = []
    for field_name in FIELD_NAMES:
        if field_name in header:
            continue
        missing.append(field_name)

    extras = [name for name in header if name not in FIELD_NAMES]
    if missing or extras:
        details = []
        if missing:
            details.append(f"missing fields: {', '.join(missing)}")
        if extras:
            details.append(f"unexpected fields: {', '.join(extras)}")
        raise RuntimeError(f"Unexpected TSV header in jlpt-n{level}.tsv ({'; '.join(details)})")


def parse_levels(value: str):
    levels = []
    for part in value.split(","):
        normalized = part.strip().upper().replace("N", "")
        if normalized.isdigit() and int(normalized) in {1, 2, 3, 4, 5}:
            levels.append(int(normalized))
    return levels or [5]


def build_deck_name(level: int) -> str:
    return f"Japanese Kanji Builder::JLPT N{level}"


def build_apkg_file_name(levels):
    suffix = "-".join(f"n{level}" for level in levels) or "deck"
    return f"japanese-kanji-builder-{suffix}.apkg"


def parse_tsv(tsv_path: Path):
    lines = [line.rstrip("\n\r") for line in tsv_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not lines:
        return [], []
    return lines[0].split("\t"), [line.split("\t") for line in lines[1:]]


def build_css() -> str:
    return "\n".join(ANKI_NOTE_SCHEMA["cssLines"])


def build_qfmt() -> str:
    return ANKI_NOTE_SCHEMA["qfmt"]


def build_afmt() -> str:
    return "".join(ANKI_NOTE_SCHEMA["afmtLines"])


def build_model(model_id: int, deck_id: int, mod: int):
    fields = []
    for index, name in enumerate(FIELD_NAMES):
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
        "name": ANKI_CARD_TEMPLATE_NAME,
        "ord": 0,
        "qfmt": build_qfmt(),
        "afmt": build_afmt(),
        "bqfmt": "",
        "bafmt": "",
        "did": None,
        "id": mod + 100,
    }]

    return {
        str(model_id): {
            "css": build_css(),
            "did": deck_id,
            "flds": fields,
            "id": model_id,
            "latexPost": "\\end{document}",
            "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}",
            "mod": mod,
            "name": ANKI_NOTE_TYPE_NAME,
            "req": [[0, "all", [0]]],
            "sortf": 0,
            "tags": [],
            "tmpls": templates,
            "type": 0,
            "usn": 0,
            "vers": [],
        }
    }


def build_decks(deck_ids_by_level, mod: int):
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
            "name": build_deck_name(level),
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


def build_guid(kanji: str, level: int) -> str:
    return hashlib.sha1(f"{level}:{kanji}".encode("utf-8")).hexdigest()[:10]


def create_collection_db(db_path: Path, levels, package_exports_dir: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)

    now_ms = int(time.time() * 1000)
    mod = int(time.time())
    model_id = now_ms
    deck_ids_by_level = {level: now_ms + 1000 + index for index, level in enumerate(levels)}

    note_rows = []
    card_rows = []
    order = 1

    for level in levels:
        header, rows = parse_tsv(package_exports_dir / f"jlpt-n{level}.tsv")
        validate_tsv_header(header, level)

        for cols in rows:
            fields = normalize_tsv_row(header, cols)
            note_id = now_ms + 2000 + len(note_rows)
            note_rows.append((
                note_id,
                build_guid(fields[0], level),
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
                now_ms + 5000 + len(card_rows),
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

    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
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
                json.dumps(build_model(model_id, deck_ids_by_level[levels[0]], mod), ensure_ascii=False),
                json.dumps(build_decks(deck_ids_by_level, mod), ensure_ascii=False),
                json.dumps(build_dconf(mod), ensure_ascii=False),
                "{}",
            ),
        )
        cur.executemany("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", note_rows)
        cur.executemany("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", card_rows)
        conn.commit()
    finally:
        conn.close()

    return len(note_rows), len(deck_ids_by_level)


def build_apkg(out_dir: Path, levels):
    package_root = out_dir / "package"
    exports_dir = package_root / "exports"
    media_dir = package_root / "media"
    apkg_path = package_root / build_apkg_file_name(levels)
    stage_dir = package_root / ".apkg-staging"

    missing_exports = [level for level in levels if not (exports_dir / f"jlpt-n{level}.tsv").exists()]
    if missing_exports:
        missing_list = ", ".join(f"N{level}" for level in missing_exports)
        raise RuntimeError(
            "Missing packaged TSV exports for " + missing_list + ". Run `npm run deck:ready -- --levels="
            + ",".join(str(level) for level in levels)
            + "` before `npm run deck:apkg -- --levels="
            + ",".join(str(level) for level in levels)
            + "`."
        )

    if stage_dir.exists():
        shutil.rmtree(stage_dir, ignore_errors=True)
    stage_dir.mkdir(parents=True, exist_ok=True)

    try:
        collection_path = stage_dir / "collection.anki2"
        media_index_path = stage_dir / "media"

        note_count, deck_count = create_collection_db(collection_path, levels, exports_dir)

        media_files = sorted([item for item in media_dir.iterdir() if item.is_file()]) if media_dir.exists() else []
        media_map = {}
        for index, file_path in enumerate(media_files):
            staged_media_path = stage_dir / str(index)
            shutil.copyfile(file_path, staged_media_path)
            media_map[str(index)] = file_path.name

        media_index_path.write_text(json.dumps(media_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        if apkg_path.exists():
            apkg_path.unlink()

        with zipfile.ZipFile(apkg_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(collection_path, arcname="collection.anki2")
            archive.write(media_index_path, arcname="media")
            for index in range(len(media_files)):
                archive.write(stage_dir / str(index), arcname=str(index))

        return {
            "filePath": str(apkg_path),
            "noteCount": note_count,
            "deckCount": deck_count,
            "mediaFileCount": len(media_files),
        }
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Build an Anki .apkg from packaged TSV/media artifacts.")
    parser.add_argument("--out-dir", default="out/build", help="Build output directory containing the package folder.")
    parser.add_argument("--levels", default="5", help="Comma-separated JLPT levels, for example 5 or 5,4.")
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    levels = parse_levels(args.levels)
    result = build_apkg(out_dir, levels)

    print("Japanese Kanji Builder APKG")
    print("")
    print(f"Output: {result['filePath']}")
    print(f"Decks: {result['deckCount']}")
    print(f"Notes: {result['noteCount']}")
    print(f"Media files: {result['mediaFileCount']}")


if __name__ == "__main__":
    main()

