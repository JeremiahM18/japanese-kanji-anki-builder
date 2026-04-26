const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, readKanjiTsvForLevels } = require("../scripts/reportAudioReview");

test("reportAudioReview parseArgs supports levels, kanji, limit, and json", () => {
    const result = parseArgs([
        "--levels=5,4",
        "--kanji=日,月",
        "--limit=12",
        "--json",
    ]);

    assert.deepEqual(result.levels, [5, 4]);
    assert.deepEqual(result.kanji, ["日", "月"]);
    assert.equal(result.limit, 12);
    assert.equal(result.json, true);
});

test("reportAudioReview parseArgs records unsupported flags", () => {
    const result = parseArgs(["--wat"]);
    assert.deepEqual(result.unknownArgs, ["--wat"]);
});

test("readKanjiTsvForLevels combines requested level exports without duplicate headers", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-review-script-test-"));

    try {
        const exportsDir = path.join(rootDir, "exports");
        fs.mkdirSync(exportsDir, { recursive: true });
        fs.writeFileSync(
            path.join(exportsDir, "jlpt-n5.tsv"),
            "Kanji\tDisplayWord\tPrimaryReading\n日\t日\tひ\n",
            "utf-8"
        );
        fs.writeFileSync(
            path.join(exportsDir, "jlpt-n4.tsv"),
            "Kanji\tDisplayWord\tPrimaryReading\n仕\t仕\tし\n",
            "utf-8"
        );

        const content = readKanjiTsvForLevels({
            buildOutDir: rootDir,
            levels: [5, 4],
        });

        assert.equal(
            content,
            "Kanji\tDisplayWord\tPrimaryReading\n日\t日\tひ\n仕\t仕\tし"
        );
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
