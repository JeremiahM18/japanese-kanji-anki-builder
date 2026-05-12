const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolvePythonCommand } = require("../src/services/toolchainService");

function writeFile(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function sha256(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runBuildApkg(python, outDir, { deckKind = "kanji" } = {}) {
    const result = spawnSync(
        python.command,
        [
            ...python.argsPrefix,
            path.join(process.cwd(), "scripts", "buildApkg.py"),
            "--out-dir",
            outDir,
            "--levels=5",
            `--deck-kind=${deckKind}`,
            "--json",
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
        }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout || "buildApkg.py failed");
    return JSON.parse(result.stdout);
}

function parseTsv(text) {
    const lines = String(text || "").trim().split(/\r?\n/u);
    const header = lines[0].split("\t");
    return {
        header,
        rows: lines.slice(1).map((line) => {
            const cells = line.split("\t");
            assert.equal(cells.length, header.length);
            return cells;
        }),
    };
}

function inspectApkg(python, apkgPath) {
    const inspectScript = [
        "import json, sqlite3, sys, tempfile, zipfile",
        "apkg_path = sys.argv[1]",
        "with tempfile.TemporaryDirectory() as temp_dir:",
        "    with zipfile.ZipFile(apkg_path, 'r') as archive:",
        "        names = set(archive.namelist())",
        "        assert 'collection.anki2' in names",
        "        assert 'media' in names",
        "        media = json.loads(archive.read('media').decode('utf-8'))",
        "        archive.extract('collection.anki2', temp_dir)",
        "    conn = sqlite3.connect(f'{temp_dir}/collection.anki2')",
        "    try:",
        "        rows = conn.execute('SELECT guid, flds, sfld FROM notes ORDER BY id;').fetchall()",
        "        cards = conn.execute('SELECT nid, did, ord, due FROM cards ORDER BY id;').fetchall()",
        "        decks = json.loads(conn.execute('SELECT decks FROM col LIMIT 1;').fetchone()[0])",
        "    finally:",
        "        conn.close()",
        "    print(json.dumps({",
        "        'notes': [{'guid': row[0], 'fields': row[1].split('\\x1f'), 'sortField': row[2]} for row in rows],",
        "        'cards': [{'nid': row[0], 'did': row[1], 'ord': row[2], 'due': row[3]} for row in cards],",
        "        'deckNames': sorted(deck.get('name') for deck in decks.values()),",
        "        'media': media,",
        "    }))",
    ].join("\n");
    const result = spawnSync(
        python.command,
        [...python.argsPrefix, "-c", inspectScript, apkgPath],
        {
            cwd: process.cwd(),
            encoding: "utf8",
        }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout || "APKG inspection failed");
    return JSON.parse(result.stdout);
}

const python = resolvePythonCommand();

test("buildApkg.py produces byte-stable APKG output for unchanged package inputs", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-apkg-determinism-"));

    try {
        const outDir = path.join(tempRoot, "out", "build");
        const packageRoot = path.join(outDir, "package");
        const fixtureTsv = fs.readFileSync(
            path.join(process.cwd(), "examples", "n5-mini", "sample-kanji-output.tsv"),
            "utf8"
        );
        writeFile(path.join(packageRoot, "exports", "jlpt-n5.tsv"), fixtureTsv);
        writeFile(path.join(packageRoot, "media", "sample.txt"), "stable media\n");

        const first = runBuildApkg(python, outDir);
        const firstHash = sha256(first.filePath);
        const second = runBuildApkg(python, outDir);
        const secondHash = sha256(second.filePath);

        assert.equal(firstHash, secondHash);
        assert.equal(first.noteCount, 1);
        assert.equal(first.mediaFileCount, 1);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("buildApkg.py supports additional unverified kanji decks", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-additional-apkg-"));

    try {
        const outDir = path.join(tempRoot, "out", "build");
        const packageRoot = path.join(outDir, "package");
        const fixtureTsv = fs.readFileSync(
            path.join(process.cwd(), "examples", "n5-mini", "sample-kanji-output.tsv"),
            "utf8"
        );
        writeFile(path.join(packageRoot, "exports", "additional-unverified-n5.tsv"), fixtureTsv);
        writeFile(path.join(packageRoot, "media", "sample.txt"), "stable media\n");

        const build = runBuildApkg(python, outDir, { deckKind: "kanji-additional" });
        const inspected = inspectApkg(python, build.filePath);

        assert.match(build.filePath, /japanese-kanji-builder-additional-unverified-n5\.apkg$/);
        assert.deepEqual(inspected.deckNames, ["Japanese Kanji Builder::Additional Unverified::JLPT N5"]);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("buildApkg.py round-trips TSV fields into the Anki SQLite collection", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-apkg-roundtrip-"));

    try {
        const outDir = path.join(tempRoot, "out", "build");
        const packageRoot = path.join(outDir, "package");
        const fixtureTsv = fs.readFileSync(
            path.join(process.cwd(), "examples", "n5-mini", "sample-kanji-output.tsv"),
            "utf8"
        );
        const parsed = parseTsv(fixtureTsv);
        writeFile(path.join(packageRoot, "exports", "jlpt-n5.tsv"), fixtureTsv);
        writeFile(path.join(packageRoot, "media", "sample.txt"), "stable media\n");

        const build = runBuildApkg(python, outDir);
        const inspected = inspectApkg(python, build.filePath);

        assert.equal(inspected.notes.length, parsed.rows.length);
        assert.deepEqual(inspected.notes[0].fields, parsed.rows[0]);
        assert.equal(inspected.notes[0].sortField, parsed.rows[0][0]);
        assert.deepEqual(inspected.deckNames, ["Japanese Kanji Builder::JLPT N5"]);
        assert.deepEqual(inspected.media, { 0: "sample.txt" });
        assert.equal(inspected.cards.length, parsed.rows.length);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
