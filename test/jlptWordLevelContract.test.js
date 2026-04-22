const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    auditWordStudyEntriesAgainstContract,
    buildStarterWordGovernanceSummary,
    buildInventoryCountsFromWordLevels,
    buildJlptWordLevelContract,
    getJlptWordLevel,
    loadJlptWordLevelContract,
} = require("../src/datasets/jlptWordLevelContract");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-level-contract-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildJlptWordLevelContract computes inventory counts from canonical word levels", () => {
    const contract = buildJlptWordLevelContract({
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 4 },
        },
    });

    assert.equal(contract.inventoryCounts["5"], 1);
    assert.equal(contract.inventoryCounts["4"], 1);
    assert.equal(contract.inventoryCounts["3"], 0);
});

test("loadJlptWordLevelContract parses a tracked contract file", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "jlpt_word_level_contract.json");
        fs.writeFileSync(filePath, JSON.stringify({
            version: 1,
            inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            },
        }), "utf-8");

        const contract = loadJlptWordLevelContract(filePath);
        assert.equal(getJlptWordLevel(contract, "今日|きょう"), 5);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("loadJlptWordLevelContract rejects stale derived inventory counts", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "jlpt_word_level_contract.json");
        fs.writeFileSync(filePath, JSON.stringify({
            version: 1,
            inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 99 },
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            },
        }), "utf-8");

        assert.throws(
            () => loadJlptWordLevelContract(filePath),
            /inventoryCounts\.5 is stale/i,
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("tracked JLPT word contract now includes the first governed N4 starter batch", () => {
    const contract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));

    assert.equal(contract.inventoryCounts["4"] >= 6, true);
    assert.equal(contract.inventoryCounts["5"], 271);
    assert.equal(getJlptWordLevel(contract, "安心|あんしん"), 4);
    assert.equal(getJlptWordLevel(contract, "急ぐ|いそぐ"), 4);
    assert.equal(getJlptWordLevel(contract, "海岸|かいがん"), 4);
    assert.equal(getJlptWordLevel(contract, "世界|せかい"), 4);
    assert.equal(getJlptWordLevel(contract, "花見|はなみ"), 4);
    assert.equal(getJlptWordLevel(contract, "開く|ひらく"), 4);
    assert.equal(getJlptWordLevel(contract, "七日|なのか"), 5);
    assert.equal(getJlptWordLevel(contract, "十日|とおか"), 5);
});

test("auditWordStudyEntriesAgainstContract reports starter drift against the canonical word contract", () => {
    const audit = auditWordStudyEntriesAgainstContract({
        "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 4 },
    }, {
        inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 },
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 5 },
        },
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.mismatchCount, 1);
    assert.equal(audit.mismatches[0].key, "仕事|しごと");
    assert.equal(audit.mismatches[0].expected.jlpt, 5);
    assert.equal(audit.mismatches[0].actual.jlpt, 4);
});

test("buildInventoryCountsFromWordLevels totals all jlpt buckets", () => {
    const counts = buildInventoryCountsFromWordLevels({
        "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        "公園|こうえん": { written: "公園", reading: "こうえん", jlpt: 5 },
        "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 4 },
    });

    assert.deepEqual(counts, {
        1: 0,
        2: 0,
        3: 0,
        4: 1,
        5: 2,
    });
});

test("buildStarterWordGovernanceSummary distinguishes canonical starter entries from curated-only and excluded ones", () => {
    const summary = buildStarterWordGovernanceSummary({
        "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5, tags: ["starter"] },
        "今年|ことし": { written: "今年", reading: "ことし", jlpt: 4, tags: ["starter"] },
        "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, tags: ["starter", "phrase"] },
    }, {
        inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        },
    });

    assert.equal(summary.defaultDeckStarterCount, 2);
    assert.equal(summary.canonicalStarterCount, 1);
    assert.equal(summary.curatedOnlyStarterCount, 1);
    assert.equal(summary.mismatchStarterCount, 0);
    assert.equal(summary.excludedPhraseCount, 1);
    assert.equal(summary.overallCoverage, 50);
    assert.equal(summary.coverageByLevel[5], 100);
    assert.equal(summary.coverageByLevel[4], 0);
});

test("auditWordStudyEntriesAgainstContract includes reading-coverage contract tracking summary", () => {
    const audit = auditWordStudyEntriesAgainstContract({
        "今日|きょう": {
            written: "今日",
            reading: "きょう",
            jlpt: 5,
            coverage: {
                role: "both",
                focusKanji: ["今", "日"],
                coversReadings: {
                    今: "いま",
                    日: "ひ",
                },
            },
        },
    }, {
        inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        },
    });

    assert.equal(audit.readingCoverageContract.totalExplicitCoverageEntries, 1);
    assert.equal(audit.readingCoverageContract.totalExplicitReadingTargets, 2);
    assert.equal(audit.readingCoverageContract.explicitCoveragePercentByLevel[5], 100);
});
