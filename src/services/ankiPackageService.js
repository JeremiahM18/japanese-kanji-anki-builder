const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ANKI_MEDIA_INDEX_FILE = "media";
const ANKI_COLLECTION_FILE = "collection.anki2";
const ANKI_NOTE_TYPE_NAME = "Japanese Kanji Builder";
const ANKI_CARD_TEMPLATE_NAME = "Recognition";

const DEFAULT_FIELD_NAMES = [
    "Kanji",
    "MeaningJP",
    "Reading",
    "StrokeOrder",
    "StrokeOrderImage",
    "StrokeOrderAnimation",
    "Audio",
    "Radical",
    "Notes",
    "ExampleSentence",
];

function shellEscapeSql(value) {
    return String(value ?? "").replace(/'/g, "''");
}

function normalizeDeckSlug(levels) {
    const normalized = (Array.isArray(levels) ? levels : [])
        .map((level) => `n${level}`)
        .join("-");

    return normalized || "deck";
}

function parseTsv(tsvText) {
    const lines = String(tsvText ?? "")
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);

    if (lines.length === 0) {
        return {
            header: [],
            rows: [],
        };
    }

    return {
        header: lines[0].split("\t"),
        rows: lines.slice(1).map((line) => line.split("\t")),
    };
}

function buildDeckName(level) {
    return `Japanese Kanji Builder::JLPT N${level}`;
}

function buildApkgFileName(levels) {
    return `japanese-kanji-builder-${normalizeDeckSlug(levels)}.apkg`;
}

function buildCss() {
    return [
        ".card {",
        "  font-family: \"Yu Gothic UI\", \"Hiragino Sans\", sans-serif;",
        "  font-size: 20px;",
        "  text-align: center;",
        "  color: #1f2933;",
        "  background: #f7f3ea;",
        "}",
        ".kanji {",
        "  font-size: 64px;",
        "  margin: 16px 0;",
        "}",
        ".reading, .meaning, .meta, .notes, .example, .media {",
        "  margin: 12px 0;",
        "  line-height: 1.5;",
        "}",
        ".media img {",
        "  max-width: 280px;",
        "  height: auto;",
        "}",
    ].join("\n");
}

function buildQfmt() {
    return "<div class=\"kanji\">{{Kanji}}</div>";
}

function buildAfmt() {
    return [
        "{{FrontSide}}",
        "<hr id=\"answer\">",
        "<div class=\"meaning\">{{MeaningJP}}</div>",
        "<div class=\"reading\">{{Reading}}</div>",
        "<div class=\"media\">{{StrokeOrder}}</div>",
        "<div class=\"meta\">Radical: {{Radical}}</div>",
        "<div class=\"notes\">{{Notes}}</div>",
        "<div class=\"example\">{{ExampleSentence}}</div>",
        "<div class=\"audio\">{{Audio}}</div>",
    ].join("");
}

function createFieldDefinitions(fieldNames, timestampSeconds) {
    return fieldNames.map((name, index) => ({
        name,
        ord: index,
        rtl: false,
        sticky: false,
        collapsed: false,
        plainText: false,
        font: "Arial",
        size: 20,
        description: "",
        media: [],
        id: timestampSeconds + index + 1,
        tag: null,
        preventDeletion: false,
    }));
}

function createTemplateDefinitions(timestampSeconds) {
    return [
        {
            name: ANKI_CARD_TEMPLATE_NAME,
            ord: 0,
            qfmt: buildQfmt(),
            afmt: buildAfmt(),
            bqfmt: "",
            bafmt: "",
            did: null,
            id: timestampSeconds + 100,
        },
    ];
}

function createModel({ modelId, deckId, mod, fieldNames }) {
    return {
        [String(modelId)]: {
            css: buildCss(),
            did: deckId,
            flds: createFieldDefinitions(fieldNames, mod),
            id: modelId,
            latexPost: "\\end{document}",
            latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}",
            mod,
            name: ANKI_NOTE_TYPE_NAME,
            req: [[0, "all", [0]]],
            sortf: 0,
            tags: [],
            tmpls: createTemplateDefinitions(mod),
            type: 0,
            usn: 0,
            vers: [],
        },
    };
}

function createDecks({ deckIdsByLevel, mod }) {
    const decks = {};

    for (const [level, deckId] of Object.entries(deckIdsByLevel)) {
        decks[String(deckId)] = {
            collapsed: false,
            browserCollapsed: false,
            conf: 1,
            desc: "",
            dyn: 0,
            extendNew: 0,
            extendRev: 0,
            id: deckId,
            lrnToday: [0, 0],
            mod,
            name: buildDeckName(level),
            newToday: [0, 0],
            revToday: [0, 0],
            timeToday: [0, 0],
            usn: 0,
        };
    }

    return decks;
}

function createDeckConfig(mod) {
    return {
        "1": {
            autoplay: true,
            buryInterdayLearning: false,
            buryNew: false,
            buryReviews: false,
            dyn: false,
            id: 1,
            lapse: {
                delays: [10],
                leechAction: 0,
                leechFails: 8,
                minInt: 1,
                mult: 0,
            },
            maxTaken: 60,
            mod,
            name: "Default",
            new: {
                bury: false,
                delays: [1, 10],
                initialFactor: 2500,
                ints: [1, 4, 7],
                order: 1,
                perDay: 20,
            },
            replayq: true,
            rev: {
                bury: false,
                ease4: 1.3,
                fuzz: 0.05,
                ivlFct: 1,
                maxIvl: 36500,
                perDay: 200,
            },
            timer: 0,
            usn: 0,
        },
    };
}

function createCollectionConfig() {
    return {
        activeDecks: [1],
        addToCur: true,
        curDeck: 1,
        currentModelId: 1,
        collapseTime: 1200,
        dueCounts: true,
        estTimes: true,
        newSpread: 0,
        nightMode: false,
        sortType: "noteFld",
        timeLim: 0,
    };
}

function computeChecksum(value) {
    const hash = crypto.createHash("sha1").update(String(value ?? ""), "utf8").digest("hex");
    return Number.parseInt(hash.slice(0, 8), 16);
}

function buildGuid(kanji, level) {
    return crypto.createHash("sha1").update(`${level}:${kanji}`, "utf8").digest("base64url").slice(0, 10);
}

function commandAvailable(command, versionArg = "--version") {
    const result = spawnSync(command, [versionArg], { stdio: "ignore" });
    return !result.error;
}

function runCommand(command, args, options = {}) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
        ...options,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${command} failed with exit code ${result.status}: ${result.stderr || result.stdout || ""}`.trim());
    }

    return result;
}

function buildSchemaSql({ colId, crt, mod, scm, modelId, deckIdsByLevel, notes, cards }) {
    const primaryDeckId = Number(Object.values(deckIdsByLevel)[0] || 1);
    const modelsJson = JSON.stringify(createModel({
        modelId,
        deckId: primaryDeckId,
        mod,
        fieldNames: DEFAULT_FIELD_NAMES,
    }));
    const decksJson = JSON.stringify(createDecks({ deckIdsByLevel, mod }));
    const dconfJson = JSON.stringify(createDeckConfig(mod));
    const confJson = JSON.stringify(createCollectionConfig());

    const statements = [
        "PRAGMA journal_mode=WAL;",
        "PRAGMA synchronous=OFF;",
        "CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);",
        "CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);",
        "CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);",
        "CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);",
        "CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);",
        "CREATE INDEX ix_notes_usn on notes (usn);",
        "CREATE INDEX ix_cards_usn on cards (usn);",
        "CREATE INDEX ix_cards_nid on cards (nid);",
        "CREATE INDEX ix_cards_sched on cards (did, queue, due);",
        `INSERT INTO col VALUES (${colId}, ${crt}, ${mod}, ${scm}, 11, 0, 0, 0, '${shellEscapeSql(confJson)}', '${shellEscapeSql(modelsJson)}', '${shellEscapeSql(decksJson)}', '${shellEscapeSql(dconfJson)}', '{}');`,
    ];

    for (const note of notes) {
        statements.push(
            `INSERT INTO notes VALUES (${note.id}, '${shellEscapeSql(note.guid)}', ${note.mid}, ${mod}, 0, '', '${shellEscapeSql(note.flds)}', '${shellEscapeSql(note.sfld)}', ${note.csum}, 0, '');`
        );
    }

    for (const card of cards) {
        statements.push(
            `INSERT INTO cards VALUES (${card.id}, ${card.nid}, ${card.did}, 0, ${mod}, 0, 0, 0, ${card.due}, 0, 2500, 0, 0, 0, 0, 0, 0, '');`
        );
    }

    statements.push("VACUUM;");
    return `${statements.join("\n")}\n`;
}

async function createArchiveWithTar({ workingDir, outputPath, fileNames }) {
    const zipPath = `${outputPath}.zip`;
    if (fs.existsSync(zipPath)) {
        await fsp.unlink(zipPath);
    }
    if (fs.existsSync(outputPath)) {
        await fsp.unlink(outputPath);
    }

    runCommand("tar", ["-a", "-c", "-f", zipPath, ...fileNames], { cwd: workingDir });
    await fsp.rename(zipPath, outputPath);
}

async function stageApkgMedia({ sourceMediaDir, tempDir, mediaFiles }) {
    const mediaMap = {};

    for (const [index, fileName] of mediaFiles.entries()) {
        const numericName = String(index);
        await fsp.copyFile(path.join(sourceMediaDir, fileName), path.join(tempDir, numericName));
        mediaMap[numericName] = fileName;
    }

    await fsp.writeFile(
        path.join(tempDir, ANKI_MEDIA_INDEX_FILE),
        `${JSON.stringify(mediaMap, null, 2)}\n`,
        "utf8"
    );
}

function buildAnkiRows({ exports }) {
    const rows = [];

    for (const artifact of exports) {
        const tsv = fs.readFileSync(artifact.filePath, "utf8");
        const parsed = parseTsv(tsv);
        const level = Number(artifact.level);

        for (const columns of parsed.rows) {
            rows.push({
                level,
                fields: DEFAULT_FIELD_NAMES.map((_, index) => columns[index] || ""),
            });
        }
    }

    return rows;
}

async function buildAnkiPackage({
    packageRootDir,
    exports,
    mediaDir,
    levels,
}) {
    if (!commandAvailable("sqlite3", "-version") || !commandAvailable("tar")) {
        return {
            filePath: null,
            skipped: true,
            skipReason: "Missing required system tools: sqlite3 and/or tar.",
            noteCount: 0,
            deckCount: 0,
            mediaFileCount: 0,
        };
    }

    const rows = buildAnkiRows({ exports });
    const mediaFiles = fs.existsSync(mediaDir)
        ? fs.readdirSync(mediaDir).filter((fileName) => fs.statSync(path.join(mediaDir, fileName)).isFile()).sort()
        : [];

    const now = Date.now();
    const mod = Math.floor(now / 1000);
    const crt = mod;
    const scm = now;
    const colId = 1;
    const modelId = now;
    const deckIdsByLevel = Object.fromEntries(
        (Array.isArray(levels) ? levels : []).map((level, index) => [level, now + 1000 + index])
    );

    const notes = rows.map((row, index) => ({
        id: now + 2000 + index,
        guid: buildGuid(row.fields[0], row.level),
        mid: modelId,
        flds: row.fields.join("\u001f"),
        sfld: row.fields[0],
        csum: computeChecksum(row.fields[0]),
    }));
    const cards = rows.map((row, index) => ({
        id: now + 5000 + index,
        nid: notes[index].id,
        did: deckIdsByLevel[row.level],
        due: index + 1,
    }));

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "kanji-apkg-"));
    const collectionPath = path.join(tempDir, ANKI_COLLECTION_FILE);
    const apkgPath = path.join(packageRootDir, buildApkgFileName(levels));

    try {
        const schemaSql = buildSchemaSql({
            colId,
            crt,
            mod,
            scm,
            modelId,
            deckIdsByLevel,
            notes,
            cards,
        });

        runCommand("sqlite3", [collectionPath], { input: schemaSql });
        await stageApkgMedia({ sourceMediaDir: mediaDir, tempDir, mediaFiles });
        await createArchiveWithTar({
            workingDir: tempDir,
            outputPath: apkgPath,
            fileNames: [
                ANKI_COLLECTION_FILE,
                ANKI_MEDIA_INDEX_FILE,
                ...mediaFiles.map((_, index) => String(index)),
            ],
        });

        return {
            filePath: apkgPath,
            skipped: false,
            skipReason: "",
            noteCount: notes.length,
            deckCount: Object.keys(deckIdsByLevel).length,
            mediaFileCount: mediaFiles.length,
        };
    } catch (error) {
        return {
            filePath: null,
            skipped: true,
            skipReason: error instanceof Error ? error.message : String(error),
            noteCount: 0,
            deckCount: 0,
            mediaFileCount: mediaFiles.length,
        };
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

module.exports = {
    ANKI_COLLECTION_FILE,
    ANKI_MEDIA_INDEX_FILE,
    ANKI_NOTE_TYPE_NAME,
    buildAnkiPackage,
    buildApkgFileName,
    buildDeckName,
    parseTsv,
};

