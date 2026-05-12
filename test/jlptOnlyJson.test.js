const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    assertJlptOnlyJsonMatchesContract,
    buildJlptOnlyJsonDriftMessage,
    loadJlptOnlyJson,
    parseJlptOnlyJson,
} = require("../src/datasets/jlptOnlyJson");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("parseJlptOnlyJson accepts JLPT entries with passthrough fields", () => {
    const parsed = parseJlptOnlyJson({
        日: { jlpt: 5, meanings: ["day"] },
    });

    assert.equal(parsed.日.jlpt, 5);
    assert.deepEqual(parsed.日.meanings, ["day"]);
});

test("loadJlptOnlyJson rejects malformed JLPT entries with a clear validation error", (t) => {
    const tempDir = fs.mkdtempSync(path.join(__dirname, "tmp-jlpt-only-malformed-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const filePath = path.join(tempDir, "kanji_jlpt_only.json");
    fs.writeFileSync(filePath, JSON.stringify({
        日: { level: 5 },
    }), "utf-8");

    assert.throws(
        () => loadJlptOnlyJson(filePath),
        /jlpt/
    );
});

test("JLPT-only loader can enforce contract alignment for runtime datasets", (t) => {
    const tempDir = fs.mkdtempSync(path.join(__dirname, "tmp-jlpt-only-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const datasetPath = path.join(tempDir, "kanji_jlpt_only.json");
    const contractPath = path.join(tempDir, "jlpt_level_contract.json");

    writeJson(datasetPath, {
        日: { jlpt: 5 },
        語: { jlpt: 4 },
    });
    writeJson(contractPath, {
        version: 1,
        inventoryCounts: {
            1: 0,
            2: 0,
            3: 0,
            4: 1,
            5: 1,
        },
        kanjiLevels: {
            日: 5,
            語: 4,
        },
    });

    const data = loadJlptOnlyJson(datasetPath, {
        contractPath,
        requireContractAlignment: true,
    });

    assert.equal(data.日.jlpt, 5);
    assert.equal(assertJlptOnlyJsonMatchesContract(data, { datasetPath, contractPath }).valid, true);
});

test("JLPT-only loader rejects stale runtime datasets with a remediation message", (t) => {
    const tempDir = fs.mkdtempSync(path.join(__dirname, "tmp-jlpt-only-drift-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const datasetPath = path.join(tempDir, "kanji_jlpt_only.json");
    const contractPath = path.join(tempDir, "jlpt_level_contract.json");

    writeJson(datasetPath, {
        日: { jlpt: 4 },
        火: { jlpt: 5 },
    });
    writeJson(contractPath, {
        version: 1,
        inventoryCounts: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 1,
        },
        kanjiLevels: {
            日: 5,
        },
    });

    assert.throws(() => loadJlptOnlyJson(datasetPath, {
        contractPath,
        requireContractAlignment: true,
    }), /JLPT runtime dataset is out of sync/);

    const unguarded = loadJlptOnlyJson(datasetPath, { contractPath: null });
    assert.equal(unguarded.日.jlpt, 4);
    assert.match(buildJlptOnlyJsonDriftMessage({
        audit: {
            missingKanji: [],
            unexpectedKanji: ["火"],
            levelMismatches: [{ kanji: "日" }],
            countMismatches: [{ level: 4 }],
        },
        datasetPath,
        contractPath,
    }), /npm run data:sync:jlpt/);
});
