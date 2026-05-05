const test = require("node:test");
const assert = require("node:assert/strict");

const {
    auditWordLevelAnchors,
    buildWordLevelAnchorResult,
    formatKanjiLevelList,
} = require("../src/services/wordLevelAnchorAuditService");

test("buildWordLevelAnchorResult accepts the highest-numbered constituent kanji level", () => {
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
    assert.equal(result.anchorLevel, 5);
    assert.deepEqual(result.anchorKanji, ["子"]);
    assert.equal(result.placementStatus, "anchor_level");
    assert.equal(formatKanjiLevelList(result.kanjiLevels), "子:N5, 猫:N4");
});

test("buildWordLevelAnchorResult accepts later placement when learner fit is explained", () => {
    const result = buildWordLevelAnchorResult({
        written: "子猫",
        deckLevel: 4,
        learnerFitReason: "Useful word, but better introduced after basic N5 animal vocabulary.",
        kanjiLevelData: {
            子: { jlpt: 5 },
            猫: { jlpt: 4 },
        },
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.sameLevelKanji, ["猫"]);
    assert.equal(result.anchorLevel, 5);
    assert.deepEqual(result.anchorKanji, ["子"]);
    assert.equal(result.placementStatus, "later_with_learner_fit_reason");
    assert.equal(formatKanjiLevelList(result.kanjiLevels), "子:N5, 猫:N4");
});

test("buildWordLevelAnchorResult rejects later placement without a learner-fit reason", () => {
    const result = buildWordLevelAnchorResult({
        written: "子猫",
        deckLevel: 4,
        kanjiLevelData: {
            子: { jlpt: 5 },
            猫: { jlpt: 4 },
        },
    });

    assert.equal(result.valid, false);
    assert.equal(result.anchorLevel, 5);
    assert.equal(result.placementStatus, "later_missing_learner_fit_reason");
});

test("buildWordLevelAnchorResult rejects words assigned to an easier deck than their kanji anchor", () => {
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
    assert.equal(result.anchorLevel, 4);
    assert.deepEqual(result.anchorKanji, ["魚", "料", "理"]);
    assert.equal(result.placementStatus, "too_easy_for_kanji");
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

test("auditWordLevelAnchors accepts later learner-fit placements with tracked reasons", () => {
    const report = auditWordLevelAnchors({
        kanjiLevelData: {
            人: { jlpt: 5 },
            気: { jlpt: 5 },
        },
        wordStudyData: {
            "人気|にんき": {
                levelPlacement: {
                    reason: "Common and useful, but N4 is a better learner-fit introduction than N5.",
                },
            },
        },
        wordLevels: {
            "人気|にんき": { written: "人気", reading: "にんき", jlpt: 4 },
        },
    });

    assert.equal(report.valid, true);
    assert.equal(report.violationCount, 0);
});
