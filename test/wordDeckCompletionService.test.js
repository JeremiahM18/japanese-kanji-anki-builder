const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordDeckCardBackAudit,
    buildWordDeckCompletionReport,
    buildWordDeckExampleReadingAlignmentAudit,
    buildWordDeckInventorySummary,
    buildWordDeckPitchAccentAudit,
    buildWordDeckPolicyAudit,
    buildWordDeckReadingBreakdownAudit,
    buildWordDeckSentenceOrthographyAudit,
    buildWordDeckReadiness,
    formatWordDeckCompletionReport,
} = require("../src/services/wordDeckCompletionService");

function buildPitchAccentData(entries = {}) {
    return {
        sources: {
            "kanjium-cc-by-sa-4.0": {
                name: "Kanjium pitch accent database",
                license: "CC BY-SA 4.0",
            },
        },
        entries,
    };
}

function buildKanjiumPitchEntry({ pattern = "1 [atamadaka]", word = "雨", reading = "あめ", sourceAccent = "1" } = {}) {
    return {
        pattern,
        sourceId: "kanjium-cc-by-sa-4.0",
        sourceWord: word,
        sourceReading: reading,
        sourceAccent,
    };
}

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

test("buildWordDeckPitchAccentAudit reports learner-facing pitch coverage from built rows", () => {
    const audit = buildWordDeckPitchAccentAudit({
        wordRows: [
            { Word: "雨", Reading: "あめ", PitchAccent: "あ＼め [atamadaka]" },
            { Word: "飴", Reading: "あめ", PitchAccent: "" },
        ],
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.fieldPresent, true);
    assert.equal(audit.totalWords, 2);
    assert.equal(audit.annotatedWords, 1);
    assert.equal(audit.missingPitchAccent, 1);
    assert.equal(audit.coveragePercent, 50);
    assert.deepEqual(audit.annotatedRows, [
        { word: "雨", reading: "あめ", pitchAccent: "あ＼め [atamadaka]", sourceId: "", sourcePattern: "", expectedAccents: [], renderedAccents: [] },
    ]);
    assert.equal(audit.ungovernedPitchAccent, 1);
});

test("buildWordDeckPitchAccentAudit reports governed pitch accent sources", () => {
    const audit = buildWordDeckPitchAccentAudit({
        wordRows: [
            { Word: "雨", Reading: "あめ", PitchAccent: "1 [atamadaka]" },
        ],
        wordPitchAccentData: buildPitchAccentData({
            "雨|あめ": buildKanjiumPitchEntry(),
        }),
    });

    assert.equal(audit.annotatedWords, 1);
    assert.equal(audit.ungovernedPitchAccent, 0);
    assert.equal(audit.sourceMismatchPitchAccent, 0);
    assert.equal(audit.invalidSourcePattern, 0);
    assert.equal(audit.sourceIdentityIssues, 0);
    assert.equal(audit.valid, true);
    assert.deepEqual(audit.sourceCounts, { "kanjium-cc-by-sa-4.0": 1 });
});

test("buildWordDeckPitchAccentAudit flags rendered pitch that disagrees with governed source pattern", () => {
    const audit = buildWordDeckPitchAccentAudit({
        wordRows: [
            { Word: "雨", Reading: "あめ", PitchAccent: "<div aria-label=\"Pitch 1: 2\">あめ</div>" },
        ],
        wordPitchAccentData: buildPitchAccentData({
            "雨|あめ": buildKanjiumPitchEntry(),
        }),
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.sourceMismatchPitchAccent, 1);
    assert.deepEqual(audit.sourceMismatchRows[0].expectedAccents, [1]);
    assert.deepEqual(audit.sourceMismatchRows[0].renderedAccents, [2]);
});

test("buildWordDeckPitchAccentAudit flags governed source data that belongs to a different word-reading", () => {
    const audit = buildWordDeckPitchAccentAudit({
        wordRows: [
            { Word: "雨", Reading: "あめ", PitchAccent: "<div aria-label=\"Pitch 1: 1\">あめ</div>" },
        ],
        wordPitchAccentData: buildPitchAccentData({
            "雨|あめ": buildKanjiumPitchEntry({ word: "飴" }),
        }),
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.sourceIdentityIssues, 1);
    assert.match(audit.sourceIdentityRows[0].failures.join("\n"), /sourceWord does not match/);
});

test("buildWordDeckPitchAccentAudit flags old word TSVs without the PitchAccent field", () => {
    const audit = buildWordDeckPitchAccentAudit({
        wordRows: [
            { Word: "雨", Reading: "あめ" },
        ],
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.fieldPresent, false);
    assert.equal(audit.totalWords, 1);
    assert.equal(audit.annotatedWords, 0);
});

test("buildWordDeckReadingBreakdownAudit flags mixed-script blanks and non-ruby kanji breakdowns", () => {
    const audit = buildWordDeckReadingBreakdownAudit({
        wordRows: [
            { Word: "生まれる", Reading: "うまれる", ReadingBreakdown: "" },
            { Word: "友だち", Reading: "ともだち", ReadingBreakdown: "友=とも ／ だち" },
            { Word: "食べ物", Reading: "たべもの", ReadingBreakdown: "<ruby>食<rt>た</rt></ruby>べ<ruby>物<rt>もの</rt></ruby>" },
            { Word: "学校", Reading: "がっこう", ReadingBreakdown: "<ruby>学<rt>がっ</rt></ruby><ruby>校<rt>こう</rt></ruby>" },
        ],
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.missingBreakdownCount, 1);
    assert.equal(audit.missingMixedBreakdownCount, 1);
    assert.equal(audit.nonRubyBreakdownCount, 1);
    assert.equal(audit.missingRows[0].word, "生まれる");
    assert.equal(audit.missingMixedRows[0].word, "生まれる");
    assert.equal(audit.nonRubyRows[0].word, "友だち");
});

test("buildWordDeckCardBackAudit proves required learner-facing back fields", () => {
    const audit = buildWordDeckCardBackAudit({
        wordRows: [
            {
                Word: "食べ物",
                Reading: "たべもの",
                ReadingBreakdown: "<ruby>食<rt>た</rt></ruby>べ<ruby>物<rt>もの</rt></ruby>",
                Audio: "[sound:food.wav]",
                PitchAccent: "<div>Pitch: 0 [heiban]</div>",
                Meaning: "food",
                JLPTLevel: "JLPT N5",
                CoverageRole: "JLPT core + reading coverage",
                FocusKanji: "食、物",
                CoversReading: "食: た ／ 物: もの",
                KanjiBreakdown: "<div>食</div><div>物</div>",
                ExampleSentence: "食べ物があります。 ／ たべものがあります。 ／ There is food.",
                Notes: "",
            },
            {
                Word: "生まれる",
                Reading: "うまれる",
                ReadingBreakdown: "",
                Audio: "",
                PitchAccent: "",
                Meaning: "to be born",
                JLPTLevel: "JLPT N5",
                CoverageRole: "Reading coverage support",
                FocusKanji: "生",
                CoversReading: "生: う",
                KanjiBreakdown: "<div>生</div>",
                ExampleSentence: "赤ちゃんが生まれます。 ／ あかちゃんがうまれます。 ／ A baby is born.",
                Notes: "",
            },
        ],
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.totalRows, 2);
    assert.equal(audit.fields.reading.readyCount, 2);
    assert.equal(audit.fields.readingBreakdown.readyCount, 1);
    assert.equal(audit.fields.readingBreakdown.totalCount, 2);
    assert.equal(audit.fields.audio.missingCount, 1);
    assert.equal(audit.fields.notes.required, false);
    assert.equal(audit.requiredMissingRows.some((row) => row.word === "生まれる" && row.field === "audio"), true);
});

test("buildWordDeckCardBackAudit keeps capped samples separate from validity counts", () => {
    const audit = buildWordDeckCardBackAudit({
        maxMissingRows: 1,
        wordRows: [
            { Word: "雨", Reading: "あめ" },
            { Word: "飴", Reading: "あめ" },
        ],
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.fields.audio.missingCount, 2);
    assert.equal(audit.fields.audio.missingRows.length, 1);
    assert.ok(audit.requiredMissingCount > audit.requiredMissingRows.length);
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
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
            "今\t今\tnow\tいま\tnow\t\t\tくん: いま\t\t\t\t今日 （きょう） - today\t",
            "日\t日\tday\tひ\tday\t\t\tくん: ひ\t\t\t\t今日 （きょう） - today\t",
        ].join("\n"),
        wordTsv: [
            "Word\tReading\tReadingBreakdown\tAudio\tPitchAccent\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "今日\tきょう\t<ruby>今日<rt>きょう</rt></ruby>\t[sound:today.wav]\t<div>Pitch: 1 [atamadaka]</div>\ttoday\tJLPT N5\tJLPT core + reading coverage\t今、日\t今: いま ／ 日: ひ\t<div>今</div><div>日</div>\t今日は休みです。 ／ きょうはやすみです。 ／ Today is a day off.\t",
        ].join("\n"),
        coverageWordTsvByLevel: {
            5: [
                "Word\tReading\tReadingBreakdown\tAudio\tPitchAccent\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
                "今日\tきょう\t<ruby>今日<rt>きょう</rt></ruby>\t[sound:today.wav]\t<div>Pitch: 1 [atamadaka]</div>\ttoday\tJLPT N5\tJLPT core + reading coverage\t今、日\t今: いま ／ 日: ひ\t<div>今</div><div>日</div>\t今日は休みです。 ／ きょうはやすみです。 ／ Today is a day off.\t",
            ].join("\n"),
        },
        wordPitchAccentData: buildPitchAccentData({
            "今日|きょう": buildKanjiumPitchEntry({ word: "今日", reading: "きょう" }),
        }),
    });

    assert.equal(report.inventory.starterEligibleCount, 1);
    assert.equal(report.inventory.builtEligibleCount, 1);
    assert.equal(report.readingCoverage.coveredReadings, 2);
    assert.equal(report.coverageScope.label, "N5");
    assert.equal(report.pitchAccentAudit.fieldPresent, true);
    assert.equal(report.pitchAccentAudit.sourceMismatchPitchAccent, 0);
    assert.equal(report.pitchAccentAudit.sourceIdentityIssues, 0);
    assert.equal(report.readingBreakdownAudit.valid, true);
    assert.equal(report.cardBackAudit.valid, true);
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
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
            "会\t会う\tmeet\tあう\tmeet\t\tオン: カイ\tくん: あ.う\t\t\t\t会う （あう） - meet\t",
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

test("buildWordDeckReadiness stays incomplete when reading breakdown audit fails", () => {
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
            valid: true,
        },
        readingBreakdownAudit: {
            valid: false,
        },
    });

    assert.equal(report.status, "incomplete");
    assert.equal(report.hasReadingBreakdownViolations, true);
});

test("buildWordDeckReadiness stays incomplete when card back fields are missing", () => {
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
            valid: true,
        },
        cardBackAudit: {
            valid: false,
        },
    });

    assert.equal(report.status, "incomplete");
    assert.equal(report.hasCardBackViolations, true);
});

test("buildWordDeckReadiness stays incomplete when example readings mismatch the card reading", () => {
    const report = buildWordDeckReadiness({
        inventory: { missingEligibleCount: 0 },
        readingCoverage: { coveredReadings: 1, totalReadings: 1 },
        triage: { totalItems: 0, editorialReviewItems: 0, promoteCuratedExampleItems: 0, deferVariantItems: 0 },
        policyAudit: { valid: true },
        readingBreakdownAudit: { valid: true },
        cardBackAudit: { valid: true },
        exampleReadingAlignmentAudit: {
            valid: false,
            mismatchedExampleReadingCount: 1,
        },
    });

    assert.equal(report.status, "incomplete");
    assert.equal(report.hasExampleReadingAlignmentViolations, true);
});

test("buildWordDeckReadiness stays incomplete when pitch accent source verification fails", () => {
    const report = buildWordDeckReadiness({
        inventory: { missingEligibleCount: 0 },
        readingCoverage: { coveredReadings: 1, totalReadings: 1 },
        triage: { totalItems: 0, editorialReviewItems: 0, promoteCuratedExampleItems: 0, deferVariantItems: 0 },
        policyAudit: { valid: true },
        readingBreakdownAudit: { valid: true },
        cardBackAudit: { valid: true },
        exampleReadingAlignmentAudit: { valid: true },
        pitchAccentAudit: {
            valid: false,
            sourceMismatchPitchAccent: 1,
        },
    });

    assert.equal(report.status, "incomplete");
    assert.equal(report.hasPitchAccentViolations, true);
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

test("buildWordDeckExampleReadingAlignmentAudit catches mismatched exact word readings", () => {
    const audit = buildWordDeckExampleReadingAlignmentAudit({
        wordRows: [
            {
                Word: "何",
                Reading: "なに",
                ExampleSentence: "これは何ですか。 ／ これはなんですか。 ／ What is this?",
            },
            {
                Word: "何ですか",
                Reading: "なんですか",
                ExampleSentence: "これは何ですか。 ／ これはなんですか。 ／ What is this?",
            },
            {
                Word: "食べる",
                Reading: "たべる",
                ExampleSentence: "パンを食べます。 ／ パンをたべます。 ／ I eat bread.",
            },
        ],
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.mismatchedExampleReadingCount, 1);
    assert.equal(audit.flaggedRows[0].word, "何");
    assert.equal(audit.flaggedRows[0].sentenceReading, "これはなんですか。");
});

test("buildWordDeckExampleReadingAlignmentAudit treats preserved katakana loanword readings as aligned", () => {
    const audit = buildWordDeckExampleReadingAlignmentAudit({
        wordRows: [
            {
                Word: "生ビール",
                Reading: "なまびーる",
                ExampleSentence: "父は店で生ビールを飲みました。 ／ ちちはみせでなまビールをのみました。 ／ My father drank draft beer.",
            },
        ],
    });

    assert.equal(audit.valid, true);
    assert.equal(audit.mismatchedExampleReadingCount, 0);
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
        readingBreakdownAudit: {
            missingBreakdownCount: 1,
            missingMixedBreakdownCount: 1,
            nonRubyBreakdownCount: 1,
            missingRows: [{ word: "生まれる", reading: "うまれる" }],
            missingMixedRows: [{ word: "生まれる", reading: "うまれる" }],
            nonRubyRows: [{ word: "友だち", reading: "ともだち", readingBreakdown: "友=とも ／ だち" }],
        },
        cardBackAudit: {
            requiredReadyCount: 118,
            requiredTotalCount: 120,
            requiredMissingCount: 2,
            fields: {
                reading: { label: "reading", readyCount: 10, totalCount: 10 },
                readingBreakdown: { label: "furigana breakdown", readyCount: 2, totalCount: 3 },
                audio: { label: "audio", readyCount: 9, totalCount: 10 },
            },
            requiredMissingRows: [
                { word: "生まれる", reading: "うまれる", field: "furigana breakdown" },
                { word: "雨", reading: "あめ", field: "audio" },
            ],
        },
        pitchAccentAudit: {
            annotatedWords: 9,
            totalWords: 10,
            missingPitchAccent: 1,
            ungovernedPitchAccent: 0,
            sourceMismatchPitchAccent: 1,
            invalidSourcePattern: 0,
            sourceMismatchRows: [
                {
                    word: "雨",
                    reading: "あめ",
                    sourcePattern: "1 [atamadaka]",
                    expectedAccents: [1],
                    renderedAccents: [2],
                },
            ],
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
    assert.match(text, /Rows missing reading breakdowns: 1/);
    assert.match(text, /Mixed kanji\/kana rows missing breakdowns: 1/);
    assert.match(text, /Non-ruby kanji breakdowns: 1/);
    assert.match(text, /Required back-side fields: 118\/120 \(2 missing\)/);
    assert.match(text, /Field coverage: reading 10\/10, furigana breakdown 2\/3, audio 9\/10/);
    assert.match(text, /Pitch accent review:/);
    assert.match(text, /Source\/render mismatches: 1/);
    assert.match(text, /Covered by earlier decks: 1/);
    assert.match(text, /Covered by this deck level: 3/);
    assert.match(text, /Missing starter-eligible N-level rows:/);
    assert.match(text, /赤い花 \(あかいはな\)/);
    assert.match(text, /Tracked source-only exclusions outside canonical inventory:/);
    assert.match(text, /高い山 \(たかいやま\) — phrase/);
    assert.match(text, /猫 \(ねこ\) — 白いねこがいます。/);
    assert.match(text, /生まれる \(うまれる\)/);
    assert.match(text, /友だち \(ともだち\) — 友=とも ／ だち/);
    assert.match(text, /生まれる \(うまれる\) — furigana breakdown/);
    assert.match(text, /雨 \(あめ\) — audio/);
    assert.match(text, /雨 \(あめ\) — expected 1 from 1 \[atamadaka\]; rendered 2/);
});
