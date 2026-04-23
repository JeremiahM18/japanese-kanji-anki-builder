const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordDeckCompletionReport,
    buildWordDeckInventorySummary,
    buildWordDeckPolicyAudit,
    buildWordDeckSentenceOrthographyAudit,
    buildWordDeckReadiness,
    formatWordDeckCompletionReport,
} = require("../src/services/wordDeckCompletionService");

test("buildWordDeckInventorySummary keeps excluded phrase rows out of canonical inventory", () => {
    const summary = buildWordDeckInventorySummary({
        level: 5,
        starterEntries: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5, tags: ["starter", "core"] },
            "赤い花|あかいはな": { written: "赤い花", reading: "あかいはな", jlpt: 5, tags: ["starter", "common"] },
            "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, tags: ["starter", "phrase"] },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
                "赤い花|あかいはな": { written: "赤い花", reading: "あかいはな", jlpt: 5 },
            },
            excludedWordLevels: {
                "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, exclusionReason: "phrase" },
            },
        },
        builtWordRows: [
            { Word: "今日", Reading: "きょう" },
        ],
    });

    assert.equal(summary.canonicalInventoryCount, 2);
    assert.equal(summary.starterEligibleCount, 2);
    assert.equal(summary.builtEligibleCount, 1);
    assert.equal(summary.excludedSourceCount, 1);
    assert.equal(summary.missingEligibleCount, 1);
    assert.equal(summary.missingEligibleEntries[0].key, "赤い花|あかいはな");
    assert.equal(summary.excludedSourceEntries[0].key, "高い山|たかいやま");
    assert.equal(summary.excludedSourceEntries[0].exclusionReason, "phrase");
});

test("buildWordDeckCompletionReport combines canonical inventory and reading coverage", () => {
    const report = buildWordDeckCompletionReport({
        level: 5,
        starterEntries: {
            "今日|きょう": {
                written: "今日",
                reading: "きょう",
                jlpt: 5,
                tags: ["starter", "core"],
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            },
            excludedWordLevels: {},
        },
        kanjiTsv: [
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tOnReading\tKunReading\tStrokeOrder\tStrokeOrderImage\tStrokeOrderAnimation\tAudio\tRadical\tNotes\tExampleSentence",
            "今\t今\t今 （いま） ／ now\tいま\t\tくん: いま\t\t\t\t\t\t今日 （きょう） - today\t",
            "日\t日\t日 （ひ） ／ day\tひ\t\tくん: ひ\t\t\t\t\t\t今日 （きょう） - today\t",
        ].join("\n"),
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "今日\tきょう\t\ttoday\tJLPT N5\tJLPT core + reading coverage\t今、日\t今: いま ／ 日: ひ\t\t\t",
        ].join("\n"),
        coverageWordTsvByLevel: {
            5: [
                "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
                "今日\tきょう\t\ttoday\tJLPT N5\tJLPT core + reading coverage\t今、日\t今: いま ／ 日: ひ\t\t\t",
            ].join("\n"),
        },
    });

    assert.equal(report.inventory.starterEligibleCount, 1);
    assert.equal(report.inventory.builtEligibleCount, 1);
    assert.equal(report.readingCoverage.coveredReadings, 2);
    assert.equal(report.coverageScope.label, "N5");
    assert.equal(report.readiness.status, "complete");
});

test("buildWordDeckCompletionReport reuses easier-deck coverage before asking for duplicate higher-level rows", () => {
    const report = buildWordDeckCompletionReport({
        level: 4,
        starterEntries: {
            "会費|かいひ": {
                written: "会費",
                reading: "かいひ",
                jlpt: 4,
                tags: ["starter", "support"],
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "会費|かいひ": { written: "会費", reading: "かいひ", jlpt: 4 },
            },
            excludedWordLevels: {},
        },
        jlptLevelContract: {
            kanjiLevels: {
                会: 4,
            },
        },
        kanjiTsv: [
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tOnReading\tKunReading\tStrokeOrder\tStrokeOrderImage\tStrokeOrderAnimation\tAudio\tRadical\tNotes\tExampleSentence",
            "会\t会う\t会う ／ meet\tあう\tオン: カイ\tくん: あ.う\t\t\t\t\t\t会う （あう） - meet\t",
        ].join("\n"),
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "会費\tかいひ\t\tmembership fee\tJLPT N4\tReading coverage support\t会\t会: かい\t\t\t",
        ].join("\n"),
        coverageWordTsvByLevel: {
            5: [
                "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
                "会う\tあう\t\tmeet\tJLPT N5\tJLPT core + reading coverage\t会\t会: あう\t\t\t",
            ].join("\n"),
            4: [
                "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
                "会費\tかいひ\t\tmembership fee\tJLPT N4\tReading coverage support\t会\t会: かい\t\t\t",
            ].join("\n"),
        },
    });

    assert.equal(report.readingCoverage.coveredReadings, 2);
    assert.equal(report.readingCoverage.priorLevelCoveredReadings, 1);
    assert.equal(report.readingCoverage.currentLevelCoveredReadings, 1);
    assert.equal(report.coverageScope.label, "N5 + N4");
});

test("buildWordDeckReadiness distinguishes deferred-variant readiness from active backlog", () => {
    const readyWithDeferredVariants = buildWordDeckReadiness({
        inventory: { missingEligibleCount: 0 },
        readingCoverage: { totalReadings: 100, coveredReadings: 84 },
        triage: {
            totalItems: 12,
            editorialReviewItems: 0,
            promoteCuratedExampleItems: 0,
            deferVariantItems: 12,
        },
        policyAudit: {
            valid: true,
        },
    });
    assert.equal(readyWithDeferredVariants.status, "ready_with_deferred_variants");
    assert.equal(readyWithDeferredVariants.allOpenItemsDeferred, true);

    const incomplete = buildWordDeckReadiness({
        inventory: { missingEligibleCount: 0 },
        readingCoverage: { totalReadings: 100, coveredReadings: 84 },
        triage: {
            totalItems: 3,
            editorialReviewItems: 2,
            promoteCuratedExampleItems: 0,
            deferVariantItems: 1,
        },
        policyAudit: {
            valid: true,
        },
    });
    assert.equal(incomplete.status, "incomplete");
    assert.equal(incomplete.hasActiveTriageItems, true);
});

test("buildWordDeckReadiness stays incomplete when deck policy violations remain", () => {
    const report = buildWordDeckReadiness({
        inventory: { missingEligibleCount: 0 },
        readingCoverage: { totalReadings: 100, coveredReadings: 90 },
        triage: {
            totalItems: 0,
            editorialReviewItems: 0,
            promoteCuratedExampleItems: 0,
            deferVariantItems: 0,
        },
        policyAudit: {
            valid: false,
        },
    });

    assert.equal(report.status, "incomplete");
    assert.equal(report.hasPolicyViolations, true);
});

test("buildWordDeckPolicyAudit rejects standalone higher-level cards and missing constituent badges", () => {
    const audit = buildWordDeckPolicyAudit({
        level: 5,
        wordRows: [
            {
                Word: "兄",
                KanjiBreakdown: "<div></div>",
            },
            {
                Word: "子猫",
                KanjiBreakdown: "<div class=\"kanji-breakdown-item\">子</div>",
            },
        ],
        jlptLevelContract: {
            kanjiLevels: {
                子: 5,
                兄: 4,
                猫: 4,
            },
        },
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.standaloneViolationCount, 1);
    assert.equal(audit.badgeViolationCount, 1);
    assert.equal(audit.standaloneViolations[0].word, "兄");
    assert.equal(audit.badgeViolations[0].word, "子猫");
    assert.equal(audit.badgeViolations[0].expectedLabel, "JLPT N4 kanji");
});

test("buildWordDeckPolicyAudit treats okurigana words as labeled support cases instead of standalone violations", () => {
    const audit = buildWordDeckPolicyAudit({
        level: 5,
        wordRows: [
            {
                Word: "安い",
                KanjiBreakdown: "<div class=\"kanji-level-badge\">JLPT N4 kanji</div>",
            },
        ],
        jlptLevelContract: {
            kanjiLevels: {
                安: 4,
            },
        },
    });

    assert.equal(audit.valid, true);
    assert.equal(audit.standaloneViolationCount, 0);
    assert.equal(audit.badgeViolationCount, 0);
});

test("buildWordDeckSentenceOrthographyAudit flags likely kana-only example regressions without failing natural kanji usage", () => {
    const audit = buildWordDeckSentenceOrthographyAudit({
        wordRows: [
            {
                Word: "猫",
                Reading: "ねこ",
                ExampleSentence: "白いねこがいます。 ／ しろいねこがいます。 ／ There is a white cat.",
            },
            {
                Word: "白い",
                Reading: "しろい",
                ExampleSentence: "白い猫がいます。 ／ しろいねこがいます。 ／ There is a white cat.",
            },
            {
                Word: "学校",
                Reading: "がっこう",
                ExampleSentence: "きょうは休みです。 ／ きょうはやすみです。 ／ Today is a day off.",
            },
        ],
    });

    assert.equal(audit.suspiciousKanaOnlyCount, 1);
    assert.equal(audit.flaggedRows[0].word, "猫");
    assert.equal(audit.flaggedRows[0].reading, "ねこ");
});

test("formatWordDeckCompletionReport renders missing rows and source-only exclusions clearly", () => {
    const text = formatWordDeckCompletionReport({
        level: 5,
        readiness: {
            status: "ready_with_deferred_variants",
            hasActiveTriageItems: false,
            allOpenItemsDeferred: true,
            readingCoveragePercent: 84.9,
        },
        coverageScope: {
            label: "N5 + N4",
        },
        inventory: {
            canonicalInventoryCount: 2,
            starterEligibleCount: 2,
            builtEligibleCount: 1,
            starterEligibleCoveragePercent: 50,
            excludedSourceCount: 1,
            missingEligibleCount: 1,
            extraBuiltCount: 0,
            missingEligibleEntries: [{ written: "赤い花", reading: "あかいはな" }],
            excludedSourceEntries: [{ written: "高い山", reading: "たかいやま", exclusionReason: "phrase" }],
        },
        policyAudit: {
            standaloneViolationCount: 0,
            badgeViolationCount: 0,
        },
        sentenceOrthographyAudit: {
            suspiciousKanaOnlyCount: 1,
            flaggedRows: [{ word: "猫", reading: "ねこ", sentence: "白いねこがいます。" }],
        },
        readingCoverage: {
            totalReadings: 10,
            coveredReadings: 4,
            coreCoveredReadings: 4,
            supportCoveredReadings: 0,
            priorLevelCoveredReadings: 1,
            currentLevelCoveredReadings: 3,
            missingWordCardReadings: 0,
            missingExampleReadings: 6,
        },
    });

    assert.match(text, /Status: ready_with_deferred_variants/);
    assert.match(text, /Coverage counted from decks: N5 \+ N4/);
    assert.match(text, /Remaining open items are deferred variants only: yes/);
    assert.match(text, /Built starter-eligible rows: 1 \(50%\)/);
    assert.match(text, /Standalone wrong-level cards: 0/);
    assert.match(text, /Missing cross-level\/outside-level badges: 0/);
    assert.match(text, /Suspicious kana-only examples: 1/);
    assert.match(text, /Covered by earlier decks: 1/);
    assert.match(text, /Covered by this deck level: 3/);
    assert.match(text, /Missing starter-eligible N-level rows:/);
    assert.match(text, /赤い花 \(あかいはな\)/);
    assert.match(text, /Tracked source-only exclusions outside canonical inventory:/);
    assert.match(text, /高い山 \(たかいやま\) — phrase/);
    assert.match(text, /猫 \(ねこ\) — 白いねこがいます。/);
});
