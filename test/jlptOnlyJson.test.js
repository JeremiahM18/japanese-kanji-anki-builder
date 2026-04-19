const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadJlptOnlyJson, parseJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");

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
