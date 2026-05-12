const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildKanjiDeckGeneratedSurfaceAudit,
    buildLevelAuditRow,
    formatKanjiDeckGeneratedSurfaceAudit,
    parseKanjiTsv,
} = require("../src/services/kanjiDeckGeneratedSurfaceAuditService");
const { parseArgs } = require("../scripts/auditKanjiDeckGeneratedSurface");

test("parseKanjiTsv extracts generated Kanji rows", () => {
    assert.deepEqual(parseKanjiTsv("Kanji\tMeaning\n日\tday\n本\tbook\n").kanji, ["日", "本"]);
    assert.throws(() => parseKanjiTsv("Word\tMeaning\n日\tday\n"), /missing required Kanji header/);
});

test("buildLevelAuditRow fails stale generated TSVs against contract and golden surfaces", () => {
    const row = buildLevelAuditRow({
        level: 5,
        contractSet: new Set(["日", "本"]),
        goldenReviewSet: [{ kanji: "日" }, { kanji: "本" }],
        exportPath: "out/build/exports/jlpt-n5.tsv",
        exportExists: true,
        exportText: "Kanji\tMeaning\n日\tday\n月\tmoon\n",
    });

    assert.equal(row.passed, false);
    assert.deepEqual(row.generatedMissingContract, ["本"]);
    assert.deepEqual(row.generatedExtraVsContract, ["月"]);
    assert.deepEqual(row.generatedMissingGolden, ["本"]);
    assert.deepEqual(row.generatedExtraVsGolden, ["月"]);
});

test("buildKanjiDeckGeneratedSurfaceAudit reports generated TSV parity", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-surface-audit-"));
    const outDir = path.join(rootDir, "out", "build");
    const exportPath = path.join(outDir, "exports", "jlpt-n5.tsv");
    fs.mkdirSync(path.dirname(exportPath), { recursive: true });
    fs.writeFileSync(exportPath, "Kanji\tMeaning\n日\tday\n本\tbook\n", "utf8");

    const report = buildKanjiDeckGeneratedSurfaceAudit({
        rootDir,
        outDir,
        levels: [5],
        contract: {
            kanjiLevels: {
                日: 5,
                本: 5,
            },
        },
        goldenReviewSetsByLevel: {
            5: [{ kanji: "日" }, { kanji: "本" }],
        },
    });

    assert.equal(report.passed, true);
    assert.equal(report.issueCount, 0);
    assert.match(formatKanjiDeckGeneratedSurfaceAudit(report), /Result: passing/);
});

test("parseArgs accepts level, levels, out-dir, json, and unsupported flags", () => {
    const options = parseArgs([
        "--level=4",
        "--levels=5,3",
        "--out-dir=out/build",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options.levels, [5, 3]);
    assert.equal(options.outDir, "out/build");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});
