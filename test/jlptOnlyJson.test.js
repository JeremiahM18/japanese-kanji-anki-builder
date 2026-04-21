const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildJlptInventorySummary,
    loadJlptOnlyJson,
    parseJlptOnlyJson,
    validateCanonicalJlptInventory,
} = require("../src/datasets/jlptOnlyJson");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-only-json-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("parseJlptOnlyJson accepts JLPT entries with passthrough fields", () => {
    const parsed = parseJlptOnlyJson({
        日: { jlpt: 5, meanings: ["day"] },
    });

    assert.equal(parsed.日.jlpt, 5);
    assert.deepEqual(parsed.日.meanings, ["day"]);
});

test("loadJlptOnlyJson rejects malformed JLPT entries with a clear validation error", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "kanji_jlpt_only.json");
        fs.writeFileSync(filePath, JSON.stringify({
            日: { level: 5 },
        }), "utf-8");

        assert.throws(
            () => loadJlptOnlyJson(filePath),
            /jlpt/
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildJlptInventorySummary counts entries by JLPT level", () => {
    const summary = buildJlptInventorySummary({
        日: { jlpt: 5 },
        本: { jlpt: 5 },
        学: { jlpt: 4 },
    });

    assert.equal(summary.totalKanji, 3);
    assert.deepEqual(summary.counts, {
        1: 0,
        2: 0,
        3: 0,
        4: 1,
        5: 2,
    });
});

test("validateCanonicalJlptInventory reports missing canonical kanji and count drift", () => {
    const result = validateCanonicalJlptInventory({
        日: { jlpt: 5 },
        本: { jlpt: 5 },
        学: { jlpt: 4 },
    });

    assert.equal(result.valid, false);
    assert.match(result.errors[0], /JLPT N1 count mismatch/);
    assert.ok(result.errors.some((error) => /分 should be present at JLPT N5/.test(error)));
});
