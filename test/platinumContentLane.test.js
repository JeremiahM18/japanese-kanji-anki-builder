const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CURRENT_KANJI_PLATINUM_CONTENT_REVIEW_STANDARD,
    evaluatePlatinumKanjiContentReviewSet,
    formatPlatinumKanjiContentReviewReport,
} = require("../src/services/platinumKanjiContentReviewService");
const {
    CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD,
    evaluatePlatinumWordContentReviewSet,
} = require("../src/services/platinumWordContentReviewService");
const {
    parsePlatinumKanjiContentReviewSet,
} = require("../src/datasets/platinumKanjiContentReviewSet");
const {
    parsePlatinumWordContentReviewSet,
} = require("../src/datasets/platinumWordContentReviewSet");

const ROOT_DIR = path.resolve(__dirname, "..");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function buildKanjiRow(overrides = {}) {
    return {
        kanji: "日",
        levelLabel: "N5",
        displayWord: "日",
        primaryReading: "ひ",
        meaningJP: "day",
        kanjiMeanings: "day / sun",
        exampleSentence: "今日はいい日です。 ／ きょうはいいひです。 ／ Today is a good day.",
        notes: "日 （ひ） - day",
        audio: "[sound:65E5_日-kanji-reading-日-ひ.wav]",
        strokeOrder: "<img src=\"65E5_日-stroke-order.gif\" />",
        ...overrides,
    };
}

function buildSapphireKanjiEntry(overrides = {}) {
    return {
        kanji: "日",
        status: "sapphire",
        reviewStandard: "kanji-sapphire-v1-evidence-lanes",
        reviewedAt: "2026-06-08",
        reviewer: "fixture-reviewer",
        readingIncludes: ["ひ"],
        meaningIncludes: ["day"],
        kanjiMeaningsIncludes: ["day"],
        levelIncludes: ["N5"],
        exampleIncludes: ["いい日"],
        notesIncludes: ["日"],
        primaryReadingRationale: "Fixture Sapphire structural review.",
        sourceEvidence: [{ type: "japanese-source", source: "fixture source", detail: "日 ひ day" }],
        internalChecks: [{ type: "generated-surface", source: "fixture", detail: "日 generated surface" }],
        reviewEvidence: [{ type: "manual-review", source: "fixture", detail: "日 structural review" }],
        sapphireReviewAudit: { auditType: "sapphire-card" },
        ...overrides,
    };
}

function buildPlatinumKanjiEntry(overrides = {}) {
    return {
        kanji: "日",
        status: "platinum",
        reviewStandard: CURRENT_KANJI_PLATINUM_CONTENT_REVIEW_STANDARD,
        reviewedAt: "2026-06-08",
        reviewer: "fixture-expert",
        sapphireBinding: {
            manifest: "templates/sapphire_n5_review_set.json",
            reviewStandard: "kanji-sapphire-v1-evidence-lanes",
        },
        expertContentReview: {
            learnerValue: "Useful individual-kanji anchor for early learners.",
            readingChoice: "Primary reading ひ is appropriate for this card surface.",
            meaningChoice: "Primary meaning day is learner-facing and accurate.",
            exampleUsefulness: "Example is natural and reinforces the target kanji.",
            levelFit: "Fits the reviewed N5 card.",
            sourceInterpretation: "Sapphire evidence is interpreted as sufficient structural prerequisite only.",
            limitationDecision: "No active content limitations.",
            finalJudgment: "Expert content certification passes.",
        },
        evidenceChecked: {
            sapphireCurrentStandard: true,
            learnerValueReviewed: true,
            readingMeaningChoiceReviewed: true,
            exampleUsefulnessReviewed: true,
            levelFitReviewed: true,
            sourceInterpretationReviewed: true,
            limitationsReviewed: true,
            noObsidianProofClaim: true,
        },
        expertReviewEvidence: [{
            type: "expert-content-review",
            reviewer: "fixture-expert",
            detail: "Reviewed learner value, reading choice, meaning choice, example usefulness, level fit, source interpretation, limitations, and final judgment for 日.",
        }],
        platinumReviewAudit: {
            schemaVersion: 1,
            auditType: "expert-content-platinum",
            authority: "Platinum content certification only; does not create Sapphire or Obsidian proof.",
        },
        ...overrides,
    };
}

function buildWordRow(overrides = {}) {
    return {
        word: "今日",
        reading: "きょう",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        exampleSentence: "今日は図書館へ行きます。 ／ きょうはとしょかんへいきます。 ／ I go to the library today.",
        audio: "[sound:word-reading-今日-きょう.wav]",
        pitchAccent: "<div aria-label=\"Pitch 1: 0\"></div>",
        notes: "Common word.",
        ...overrides,
    };
}

function buildSapphireWordEntry(overrides = {}) {
    return {
        word: "今日",
        status: "sapphire",
        reviewStandard: "word-sapphire-v1-evidence-lanes",
        reviewedAt: "2026-06-08",
        reviewer: "fixture-reviewer",
        readingIncludes: ["きょう"],
        meaningIncludes: ["today"],
        jlptLevelIncludes: ["JLPT N5"],
        coverageRoleIncludes: ["JLPT core"],
        breakdownIncludes: ["今日"],
        focusIncludes: ["今", "日"],
        coversReadingIncludes: ["日: ひ"],
        exampleIncludes: ["今日は"],
        notesIncludes: ["Common word"],
        pitchAccentIncludes: ["0"],
        selectionRationale: "Fixture Sapphire word structural review.",
        sourceEvidence: [{ type: "japanese-source", source: "fixture source", detail: "今日 きょう today" }],
        internalChecks: [{ type: "generated-surface", source: "fixture", detail: "今日 generated surface" }],
        reviewEvidence: [{ type: "manual-review", source: "fixture", detail: "今日 structural review" }],
        sapphireReviewAudit: { auditType: "word-sapphire-card" },
        ...overrides,
    };
}

function buildPlatinumWordEntry(overrides = {}) {
    return {
        word: "今日",
        readingIncludes: ["きょう"],
        status: "platinum",
        reviewStandard: CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD,
        reviewedAt: "2026-06-08",
        reviewer: "fixture-expert",
        sapphireBinding: {
            manifest: "templates/sapphire_n5_word_review_set.json",
            reviewStandard: "word-sapphire-v1-evidence-lanes",
        },
        expertContentReview: {
            learnerValue: "High-value common word.",
            wordChoice: "Appropriate written-reading identity.",
            meaningChoice: "Meaning is learner-facing and accurate.",
            exampleUsefulness: "Example is natural and useful.",
            levelFit: "Fits the reviewed N5 word card.",
            sourceInterpretation: "Sapphire evidence is prerequisite structure only.",
            limitationDecision: "No active content limitations.",
            finalJudgment: "Expert content certification passes.",
        },
        evidenceChecked: {
            sapphireCurrentStandard: true,
            learnerValueReviewed: true,
            wordMeaningChoiceReviewed: true,
            exampleUsefulnessReviewed: true,
            levelFitReviewed: true,
            sourceInterpretationReviewed: true,
            limitationsReviewed: true,
            noObsidianProofClaim: true,
        },
        expertReviewEvidence: [{
            type: "expert-content-review",
            reviewer: "fixture-expert",
            detail: "Reviewed learner value, word choice, meaning choice, example usefulness, level fit, source interpretation, limitations, and final judgment for 今日|きょう.",
        }],
        platinumReviewAudit: {
            schemaVersion: 1,
            auditType: "expert-content-platinum",
            authority: "Platinum content certification only; does not create Sapphire or Obsidian proof.",
        },
        ...overrides,
    };
}

test("native Platinum content manifests exist separately from legacy structural manifests", () => {
    for (const level of [1, 2, 3, 4, 5]) {
        assert.deepEqual(readJson(`templates/platinum_n${level}_content_review_set.json`), []);
        assert.deepEqual(readJson(`templates/platinum_n${level}_word_content_review_set.json`), []);
    }
});

test("forward Platinum npm commands route to native content scripts", () => {
    const pkg = readJson("package.json");
    const scripts = pkg.scripts || {};

    assert.equal(scripts["deck:platinum:batch"], "node scripts/platinumKanjiContentBatchReport.js");
    assert.equal(scripts["deck:platinum:n1"], "node scripts/reviewPlatinumKanjiContentLevel.js --level=1 --require-all");
    assert.equal(scripts["deck:words:platinum:batch"], "node scripts/platinumWordContentBatchReport.js");
    assert.equal(scripts["deck:words:platinum:n5"], "node scripts/reviewPlatinumWordContentLevel.js --level=5 --require-all");

    assert.equal(scripts["deck:legacy-platinum:batch"], "node scripts/platinumKanjiBatchReport.js");
    assert.equal(scripts["deck:legacy-platinum:governance-gate"], "node scripts/runPlatinumGovernanceGate.js");
    assert.equal(scripts["deck:legacy-platinum:rereview-status"], "node scripts/reportPlatinumKanjiRereviewStatus.js");
    assert.equal(scripts["deck:legacy-platinum:n1"], "node scripts/reviewPlatinumKanjiLevel.js --level=1 --require-all");
    assert.equal(scripts["deck:words:legacy-platinum:batch"], "node scripts/platinumWordBatchReport.js");
    assert.equal(scripts["deck:words:legacy-platinum:certify-status"], "node scripts/reportPlatinumWordCertificationStatus.js");
    assert.equal(scripts["deck:words:legacy-platinum:n5"], "node scripts/reviewPlatinumWordLevel.js --level=5 --require-all");
    assert.equal(scripts["deck:words:legacy-platinum:rereview-status"], "node scripts/reportPlatinumWordRereviewStatus.js");
    assert.equal(scripts["deck:words:legacy-platinum:source-posture"], "node scripts/reportPlatinumWordSourcePosture.js");

    for (const staleAlias of [
        "deck:platinum:governance-gate",
        "deck:platinum:rereview-status",
        "deck:kanji:platinum:certify-status",
        "deck:words:platinum:certify-status",
        "deck:words:platinum:rereview-status",
        "deck:words:platinum:source-posture",
    ]) {
        assert.equal(scripts[staleAlias], undefined, `${staleAlias} must not remain a forward Platinum command`);
    }
});

test("native Platinum kanji fails closed for empty content coverage and requires Sapphire prerequisite", () => {
    const emptyReport = evaluatePlatinumKanjiContentReviewSet({
        rows: [buildKanjiRow()],
        platinumEntries: [],
        sapphireEntries: [buildSapphireKanjiEntry()],
        requireAllRows: true,
    });

    assert.equal(emptyReport.passed, false);
    assert.equal(emptyReport.currentStandardPlatinumCount, 0);
    assert.deepEqual(emptyReport.missingPlatinumRows, ["日"]);
    assert.match(formatPlatinumKanjiContentReviewReport(emptyReport), /Tier: Platinum \(expert content certification after Sapphire\)/);

    const missingSapphireReport = evaluatePlatinumKanjiContentReviewSet({
        rows: [buildKanjiRow()],
        platinumEntries: [buildPlatinumKanjiEntry()],
        sapphireEntries: [],
        requireAllRows: true,
    });

    assert.equal(missingSapphireReport.passed, false);
    assert.deepEqual(missingSapphireReport.missingSapphirePrerequisiteRows, ["日"]);
    assert.match(missingSapphireReport.results[0].failures.join("\n"), /current-standard Sapphire prerequisite is missing/);
});

test("native Platinum kanji accepts expert content evidence without Obsidian proof", () => {
    const report = evaluatePlatinumKanjiContentReviewSet({
        rows: [buildKanjiRow()],
        platinumEntries: [buildPlatinumKanjiEntry()],
        sapphireEntries: [buildSapphireKanjiEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.currentReviewStandard, CURRENT_KANJI_PLATINUM_CONTENT_REVIEW_STANDARD);
    assert.equal(report.currentStandardPlatinumCount, 1);
});

test("native Platinum schemas reject Sapphire audit and Obsidian proof fields", () => {
    assert.throws(
        () => parsePlatinumKanjiContentReviewSet([buildPlatinumKanjiEntry({
            sapphireReviewAudit: {},
        })], "bad kanji Platinum"),
        /bad kanji Platinum failed schema validation/i
    );
    assert.throws(
        () => parsePlatinumWordContentReviewSet([buildPlatinumWordEntry({
            rereviewProvenance: {},
        })], "bad word Platinum"),
        /bad word Platinum failed schema validation/i
    );
    assert.throws(
        () => parsePlatinumWordContentReviewSet([buildPlatinumWordEntry({
            readingIncludes: ["きょう", "こんにち"],
        })], "ambiguous word Platinum"),
        /readingIncludes must contain exactly one reviewed reading/i
    );
});

test("native Platinum word content gate is separate from Sapphire structure", () => {
    const report = evaluatePlatinumWordContentReviewSet({
        rows: [buildWordRow()],
        platinumEntries: [buildPlatinumWordEntry()],
        sapphireEntries: [buildSapphireWordEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.currentReviewStandard, CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD);
    assert.equal(report.currentStandardPlatinumCount, 1);

    const emptyReport = evaluatePlatinumWordContentReviewSet({
        rows: [buildWordRow()],
        platinumEntries: [],
        sapphireEntries: [buildSapphireWordEntry()],
        requireAllRows: true,
    });

    assert.equal(emptyReport.passed, false);
    assert.deepEqual(emptyReport.missingPlatinumRows, ["今日|きょう"]);
});
