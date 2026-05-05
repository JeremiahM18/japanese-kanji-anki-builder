const test = require("node:test");
const assert = require("node:assert/strict");

const {
    auditWordLevelAnchors,
    buildWordLevelAnchorResult,
    formatKanjiLevelList,
} = require("../src/services/wordLevelAnchorAuditService");

test("buildWordLevelAnchorResult accepts higher-level support kanji when a same-level anchor exists", () => {
    const result = buildWordLevelAnchorResult({
        written: "子猫",
        deckLevel: 5,
        kanjiLevelData: {
            子: { jlpt: 5 },
            猫: { jlpt: 4 },
        },
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.sameLevelKanji, ["子"]);
    assert.equal(formatKanjiLevelList(result.kanjiLevels), "子:N5, 猫:N4");
});

test("buildWordLevelAnchorResult rejects words without a same-level kanji anchor", () => {
    const result = buildWordLevelAnchorResult({
        written: "魚料理",
        deckLevel: 5,
        kanjiLevelData: {
            魚: { jlpt: 4 },
            料: { jlpt: 4 },
            理: { jlpt: 4 },
        },
    });

    assert.equal(result.valid, false);
    assert.deepEqual(result.sameLevelKanji, []);
    assert.equal(formatKanjiLevelList(result.kanjiLevels), "魚:N4, 料:N4, 理:N4");
});

test("auditWordLevelAnchors reports canonical rows assigned to the wrong deck level", () => {
    const report = auditWordLevelAnchors({
        level: 5,
        kanjiLevelData: {
            今: { jlpt: 5 },
            日: { jlpt: 5 },
            魚: { jlpt: 4 },
            料: { jlpt: 4 },
            理: { jlpt: 4 },
        },
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            "魚料理|さかなりょうり": { written: "魚料理", reading: "さかなりょうり", jlpt: 5 },
        },
    });

    assert.equal(report.valid, false);
    assert.equal(report.checked, 2);
    assert.equal(report.violationCount, 1);
    assert.equal(report.byLevel[5].violations, 1);
    assert.equal(report.violations[0].key, "魚料理|さかなりょうり");
});
