const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    auditGoldenReviewSetsAgainstContract,
    auditJlptInventoryAgainstContract,
    auditStarterEntriesAgainstContract,
    buildInventoryCountsFromKanjiLevels,
    buildJlptLevelContract,
    loadJlptLevelContract,
    syncJlptInventoryToContract,
} = require("../src/datasets/jlptLevelContract");
const { parseArgs: parseAuditArgs } = require("../scripts/auditJlptAlignment");
const { parseArgs: parseSyncArgs } = require("../scripts/syncJlptInventoryFromContract");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-level-contract-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildInventoryCountsFromKanjiLevels counts canonical levels", () => {
    const counts = buildInventoryCountsFromKanjiLevels({
        日: 5,
        本: 5,
        学: 4,
    });

    assert.deepEqual(counts, {
        1: 0,
        2: 0,
        3: 0,
        4: 1,
        5: 2,
    });
});

test("buildJlptLevelContract computes counts from kanji levels", () => {
    const contract = buildJlptLevelContract({
        kanjiLevels: {
            日: 5,
            本: 5,
            学: 4,
        },
    });

    assert.equal(contract.version, 1);
    assert.equal(contract.inventoryCounts["4"], 1);
    assert.equal(contract.inventoryCounts["5"], 2);
});

test("loadJlptLevelContract parses a tracked contract file", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "jlpt_level_contract.json");
        fs.writeFileSync(filePath, JSON.stringify({
            version: 1,
            inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 2 },
            kanjiLevels: {
                日: 5,
                本: 5,
                学: 4,
            },
        }), "utf-8");

        const contract = loadJlptLevelContract(filePath);
        assert.equal(contract.kanjiLevels.学, 4);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("auditJlptInventoryAgainstContract reports level mismatches and missing kanji", () => {
    const contract = buildJlptLevelContract({
        kanjiLevels: {
            日: 5,
            本: 5,
            学: 4,
            分: 5,
        },
    });
    const audit = auditJlptInventoryAgainstContract({
        日: { jlpt: 5 },
        本: { jlpt: 4 },
        学: { jlpt: 4 },
    }, contract);

    assert.equal(audit.valid, false);
    assert.deepEqual(audit.missingKanji, ["分"]);
    assert.deepEqual(audit.levelMismatches, [{
        kanji: "本",
        expectedLevel: 5,
        actualLevel: 4,
    }]);
});

test("auditStarterEntriesAgainstContract reports jlpt and tag drift", () => {
    const contract = buildJlptLevelContract({
        kanjiLevels: {
            日: 5,
            学: 4,
        },
    });
    const audit = auditStarterEntriesAgainstContract({
        日: { jlpt: 5, tags: ["starter", "n5"] },
        学: { jlpt: 3, tags: ["starter", "n3"] },
    }, contract);

    assert.equal(audit.valid, false);
    assert.equal(audit.mismatchCount, 1);
    assert.equal(audit.mismatches[0].kanji, "学");
    assert.equal(audit.mismatches[0].expectedLevel, 4);
    assert.equal(audit.mismatches[0].actualLevel, 3);
});

test("auditGoldenReviewSetsAgainstContract reports misplaced review entries", () => {
    const contract = buildJlptLevelContract({
        kanjiLevels: {
            日: 5,
            学: 4,
        },
    });
    const audit = auditGoldenReviewSetsAgainstContract({
        4: [{ kanji: "日" }],
        5: [{ kanji: "学" }],
    }, contract);

    assert.equal(audit.valid, false);
    assert.deepEqual(audit.mismatches, [
        { kanji: "日", reviewLevel: 4, expectedLevel: 5 },
        { kanji: "学", reviewLevel: 5, expectedLevel: 4 },
    ]);
});

test("syncJlptInventoryToContract rewrites mismatched jlpt levels", () => {
    const contract = buildJlptLevelContract({
        kanjiLevels: {
            日: 5,
            学: 4,
        },
    });
    const result = syncJlptInventoryToContract({
        日: { jlpt: 4, meanings: ["day"] },
        学: { jlpt: 4, meanings: ["study"] },
    }, contract);

    assert.deepEqual(result.updates, [{
        kanji: "日",
        previousLevel: 4,
        nextLevel: 5,
    }]);
    assert.equal(result.syncedDataset.日.jlpt, 5);
    assert.deepEqual(result.syncedDataset.日.meanings, ["day"]);
});

test("auditJlptAlignment parseArgs accepts json strict tracked-only and limit", () => {
    const options = parseAuditArgs(["--json", "--strict", "--tracked-only", "--limit=10"]);

    assert.equal(options.json, true);
    assert.equal(options.strict, true);
    assert.equal(options.trackedOnly, true);
    assert.equal(options.limit, 10);
    assert.deepEqual(options.unknownArgs, []);
});

test("syncJlptInventoryFromContract parseArgs accepts json", () => {
    const options = parseSyncArgs(["--json"]);

    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, []);
});
