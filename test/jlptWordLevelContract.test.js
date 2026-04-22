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
    assert.equal(contract.inventoryCounts["5"], 362);
    assert.equal(getJlptWordLevel(contract, "安心|あんしん"), 4);
    assert.equal(getJlptWordLevel(contract, "急ぐ|いそぐ"), 4);
    assert.equal(getJlptWordLevel(contract, "海岸|かいがん"), 4);
    assert.equal(getJlptWordLevel(contract, "世界|せかい"), 4);
    assert.equal(getJlptWordLevel(contract, "花見|はなみ"), 4);
    assert.equal(getJlptWordLevel(contract, "開く|ひらく"), 4);
    assert.equal(getJlptWordLevel(contract, "五月|ごがつ"), 5);
    assert.equal(getJlptWordLevel(contract, "四月|しがつ"), 5);
    assert.equal(getJlptWordLevel(contract, "七日|なのか"), 5);
    assert.equal(getJlptWordLevel(contract, "十日|とおか"), 5);
    assert.equal(getJlptWordLevel(contract, "有名|ゆうめい"), 5);
    assert.equal(getJlptWordLevel(contract, "帽子|ぼうし"), 5);
    assert.equal(getJlptWordLevel(contract, "彼女|かのじょ"), 5);
    assert.equal(getJlptWordLevel(contract, "中国|ちゅうごく"), 5);
    assert.equal(getJlptWordLevel(contract, "地下|ちか"), 5);
    assert.equal(getJlptWordLevel(contract, "上下|じょうげ"), 5);
    assert.equal(getJlptWordLevel(contract, "外す|はずす"), 5);
    assert.equal(getJlptWordLevel(contract, "二日|ふつか"), 5);
    assert.equal(getJlptWordLevel(contract, "二時|にじ"), 5);
    assert.equal(getJlptWordLevel(contract, "入学|にゅうがく"), 5);
    assert.equal(getJlptWordLevel(contract, "大変|たいへん"), 5);
    assert.equal(getJlptWordLevel(contract, "火山|かざん"), 5);
    assert.equal(getJlptWordLevel(contract, "社長|しゃちょう"), 5);
    assert.equal(getJlptWordLevel(contract, "十回|じっかい"), 5);
    assert.equal(getJlptWordLevel(contract, "土地|とち"), 5);
    assert.equal(getJlptWordLevel(contract, "名字|みょうじ"), 5);
    assert.equal(getJlptWordLevel(contract, "葉書|はがき"), 5);
    assert.equal(getJlptWordLevel(contract, "三百|さんびゃく"), 5);
    assert.equal(getJlptWordLevel(contract, "左右|さゆう"), 5);
    assert.equal(getJlptWordLevel(contract, "見学|けんがく"), 5);
    assert.equal(getJlptWordLevel(contract, "雨戸|あまど"), 5);
    assert.equal(getJlptWordLevel(contract, "北東|ほくとう"), 5);
    assert.equal(getJlptWordLevel(contract, "男子|だんし"), 5);
    assert.equal(getJlptWordLevel(contract, "手本|てほん"), 5);
    assert.equal(getJlptWordLevel(contract, "母校|ぼこう"), 5);
    assert.equal(getJlptWordLevel(contract, "雨天|うてん"), 5);
    assert.equal(getJlptWordLevel(contract, "八日|ようか"), 5);
    assert.equal(getJlptWordLevel(contract, "校長|こうちょう"), 5);
    assert.equal(getJlptWordLevel(contract, "長男|ちょうなん"), 5);
    assert.equal(getJlptWordLevel(contract, "白米|はくまい"), 5);
    assert.equal(getJlptWordLevel(contract, "後半|こうはん"), 5);
    assert.equal(getJlptWordLevel(contract, "一日|ついたち"), 5);
    assert.equal(getJlptWordLevel(contract, "後ほど|のちほど"), 5);
    assert.equal(getJlptWordLevel(contract, "行事|ぎょうじ"), 5);
    assert.equal(getJlptWordLevel(contract, "南北|なんぼく"), 5);
    assert.equal(getJlptWordLevel(contract, "父母|ふぼ"), 5);
    assert.equal(getJlptWordLevel(contract, "分かれる|わかれる"), 5);
    assert.equal(getJlptWordLevel(contract, "分ける|わける"), 5);
    assert.equal(getJlptWordLevel(contract, "休める|やすめる"), 5);
    assert.equal(getJlptWordLevel(contract, "下す|くだす"), 5);
    assert.equal(getJlptWordLevel(contract, "生える|はえる"), 5);
    assert.equal(getJlptWordLevel(contract, "休まる|やすまる"), 5);
    assert.equal(getJlptWordLevel(contract, "生け花|いけばな"), 5);
    assert.equal(getJlptWordLevel(contract, "西洋|せいよう"), 5);
    assert.equal(getJlptWordLevel(contract, "関西|かんさい"), 5);
    assert.equal(getJlptWordLevel(contract, "語る|かたる"), 5);
    assert.equal(getJlptWordLevel(contract, "下町|したまち"), 5);
    assert.equal(getJlptWordLevel(contract, "外科|げか"), 5);
    assert.equal(getJlptWordLevel(contract, "外れる|はずれる"), 5);
    assert.equal(getJlptWordLevel(contract, "行う|おこなう"), 5);
    assert.equal(getJlptWordLevel(contract, "生ビール|なまびーる"), 5);
    assert.equal(getJlptWordLevel(contract, "西瓜|すいか"), 5);
    assert.equal(getJlptWordLevel(contract, "手間|てま"), 5);
    assert.equal(getJlptWordLevel(contract, "白紙|はくし"), 5);
    assert.equal(getJlptWordLevel(contract, "音読|おんどく"), 5);
    assert.equal(getJlptWordLevel(contract, "万事|ばんじ"), 5);
    assert.equal(getJlptWordLevel(contract, "椅子|いす"), 5);
    assert.equal(getJlptWordLevel(contract, "気配|けはい"), 5);
    assert.equal(getJlptWordLevel(contract, "世間|せけん"), 5);
    assert.equal(getJlptWordLevel(contract, "半ば|なかば"), 5);
    assert.equal(getJlptWordLevel(contract, "小指|こゆび"), 5);
    assert.equal(getJlptWordLevel(contract, "木刀|ぼくとう"), 5);
    assert.equal(getJlptWordLevel(contract, "木陰|こかげ"), 5);
    assert.equal(getJlptWordLevel(contract, "春雨|はるさめ"), 5);
    assert.equal(getJlptWordLevel(contract, "女神|めがみ"), 5);
    assert.equal(getJlptWordLevel(contract, "子年|ねどし"), 5);
    assert.equal(getJlptWordLevel(contract, "午年|うまどし"), 5);
    assert.equal(getJlptWordLevel(contract, "天の川|あまのがわ"), 5);
    assert.equal(getJlptWordLevel(contract, "天気雨|てんきあめ"), 5);
    assert.equal(getJlptWordLevel(contract, "河川|かせん"), 5);
    assert.equal(getJlptWordLevel(contract, "白髪|しらが"), 5);
    assert.equal(getJlptWordLevel(contract, "話|はなし"), 5);
    assert.equal(getJlptWordLevel(contract, "後れる|おくれる"), 5);
    assert.equal(getJlptWordLevel(contract, "上り|のぼり"), 5);
    assert.equal(getJlptWordLevel(contract, "下り|くだり"), 5);
    assert.equal(getJlptWordLevel(contract, "左折|させつ"), 5);
    assert.equal(getJlptWordLevel(contract, "母語|ぼご"), 5);
    assert.equal(getJlptWordLevel(contract, "小川|おがわ"), 5);
    assert.equal(getJlptWordLevel(contract, "円高|えんだか"), 5);
    assert.equal(getJlptWordLevel(contract, "小雨|こさめ"), 5);
    assert.equal(getJlptWordLevel(contract, "来い|こい"), 5);
    assert.equal(getJlptWordLevel(contract, "金具|かなぐ"), 5);
    assert.equal(getJlptWordLevel(contract, "黄金|おうごん"), 5);
    assert.equal(getJlptWordLevel(contract, "食う|くう"), 5);
    assert.equal(getJlptWordLevel(contract, "上座|かみざ"), 5);
    assert.equal(getJlptWordLevel(contract, "女房|にょうぼう"), 5);
    assert.equal(getJlptWordLevel(contract, "白夜|びゃくや"), 5);
    assert.equal(getJlptWordLevel(contract, "足下|あしもと"), 5);
    assert.equal(getJlptWordLevel(contract, "出来上がり|できあがり"), 5);
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
