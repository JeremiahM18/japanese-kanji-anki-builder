const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_KANJI_PLATINUM_STATUSES,
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");
const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    loadObsidianProofLedger,
} = require("../src/datasets/obsidianProofLedger");
const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_WORD_PLATINUM_STATUSES,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
} = require("../src/services/platinumReviewService");
const {
    evaluateSapphireWordReviewSet,
} = require("../src/services/sapphireWordReviewService");
const {
    validatePlatinumLaneAuthorityBoundary,
} = require("../src/services/reviewLanePreconditionService");
const { buildPitchAccentHtml } = require("../src/services/pitchAccentRenderService");
const {
    GENERATED_PITCH_LABEL,
    isGeneratedPitchAccentSource,
} = require("../src/services/wordPitchAccentVerificationService");
const { buildWordStudyEntryKey } = require("../src/datasets/wordStudyData");
const { normalizeJapaneseReading } = require("../src/utils/japanese");

const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

const KNOWN_KANJI_PRIMARY_READING_REGRESSION_GUARDS = Object.freeze([
    { level: 3, kanji: "久", rejectedReading: "ひさしぶり", expectedReading: "ひさしい" },
    { level: 3, kanji: "亡", rejectedReading: "なくなる", expectedReading: "ぼう" },
    { level: 3, kanji: "信", rejectedReading: "しんじる", expectedReading: "しん" },
    { level: 3, kanji: "察", rejectedReading: "さっする", expectedReading: "さつ" },
    { level: 3, kanji: "常", rejectedReading: "つねに", expectedReading: "じょう" },
    { level: 3, kanji: "感", rejectedReading: "かんじる", expectedReading: "かん" },
    { level: 3, kanji: "礼", rejectedReading: "おれい", expectedReading: "れい" },
    { level: 3, kanji: "腹", rejectedReading: "おなか", expectedReading: "はら" },
    { level: 4, kanji: "好", rejectedReading: "すき", expectedReading: "このむ" },
]);

const N1_PLATINUM_AUDIT_TYPE = "n1-platinum-review";
const N1_ALLOWED_AUDIT_TYPES = Object.freeze([
    N1_PLATINUM_AUDIT_TYPE,
]);
const N1_REQUIRED_ACTUAL_CARD_DATA_REVIEW_FIELDS = Object.freeze([
    "target kanji identity and deck fit",
    "DisplayWord",
    "PrimaryReading and reading rationale",
    "MeaningJP",
    "KanjiMeanings",
    "notes and support vocabulary",
    "example sentence, reading, and translation",
    "example naturalness, learner usefulness, level fit, release quality, and support-only status",
    "governed Japanese-source field evidence",
    "source-origin independence",
    "exact primary-reading audio identity",
    "stroke-order media target and provenance",
    "NLP support packet and tokenization signals",
    "verification limitations",
    "learner usefulness and product fit",
]);

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function normalizeList(values = []) {
    return (Array.isArray(values) ? values : []).filter(Boolean);
}

function normalizeAuditText(value) {
    return String(value ?? "")
        .replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gu, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function auditTextIncludes(haystack, needle) {
    return normalizeAuditText(haystack).includes(normalizeAuditText(needle));
}

function normalizeProofText(value) {
    return normalizeAuditText(value).replace(/[_-]+/g, " ");
}

function buildKanjiCardKey(kanji, reading) {
    return `${kanji}|${reading}`;
}

function assertProofTextPattern(text, pattern, message) {
    assert.match(normalizeProofText(text), pattern, message);
}

function assertAuditIncludes(label, haystack, needle) {
    assert.ok(auditTextIncludes(haystack, needle), `${label} missing reviewed card value: ${needle}`);
}

function activeEntries(entries = [], activeStatuses = []) {
    return entries.filter((entry) => activeStatuses.includes(entry.status));
}

function platinumDeckKindForFile(fileName = "") {
    return /_word_review_set\.json$/.test(fileName) ? "word" : "kanji";
}

function platinumActiveStatusesForFile(fileName = "") {
    return platinumDeckKindForFile(fileName) === "word"
        ? ACTIVE_WORD_PLATINUM_STATUSES
        : ACTIVE_KANJI_PLATINUM_STATUSES;
}

function assertN1PlatinumResetToZero(entries = []) {
    assert.equal(entries.length, 8, "N1 reset should retain exactly the prior eight records as non-certifying history");

    for (const entry of entries) {
        const label = `platinum_n1_review_set.json ${entry.kanji}`;
        assert.equal(entry.status, "needs_revalidation", `${label} must not count as active Platinum`);
        assert.ok(
            ["platinum", "fixed_then_platinum"].includes(entry.previousStatus),
            `${label} must record the previous active status that was reset`
        );
        assert.match(entry.reviewedAt || "", /^\d{4}-\d{2}-\d{2}$/, `${label} reset reviewedAt`);
        assert.equal(entry.reviewer, "codex-platinum-reset", `${label} reset reviewer`);
        assert.match(entry.decisionReason || "", /reset to zero/i, `${label} must document the zero reset`);
        assert.match(entry.decisionReason || "", /square zero/i, `${label} must require square-zero rereview`);
        assert.equal(
            entry.previousReviewStandard,
            CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
            `${label} must preserve the prior claimed standard as historical context`
        );
    }
}

function loadKanjiObsidianProofEvents(level) {
    return loadObsidianProofLedger({
        cwd: ROOT_DIR,
        files: [path.join("templates", "obsidian_proof_ledger", `kanji_n${level}.jsonl`)],
    }).events.filter((event) => event.target.deckKind === "kanji" && event.target.level === level);
}

const LEDGER_GRADE_KANJI_EVIDENCE_REQUIREMENTS = Object.freeze([
    {
        label: "generated card surface",
        pattern: /\b(live generated|generated surface)\b/,
    },
    {
        label: "tracked review-set context",
        pattern: /platinum review set checked|platinum expectations checked|source origin independence|starter source data checked|source data checked/,
    },
    {
        label: "tracked artifacts are not proof authority",
        pattern: /not obsidian proof authority|not source evidence|not source authority|proof authority/,
    },
    {
        label: "governed Japanese source review",
        pattern: /governed japanese source|japanese source evidence|source evidence|kanjipedia/,
    },
    {
        label: "primary reading and meaning decision",
        pattern: /primary reading|primary field|reading\/meaning|primary fields/,
    },
    {
        label: "notes and support review",
        pattern: /notes\/support review|notes support review|support review|supporting notes|notes field|pedagogy\/product review|pedagogy product review/,
    },
    {
        label: "example sentence quality review",
        pattern: /actual example sentence quality review|example sentence quality review|example review/,
    },
    {
        label: "NLP support packet review",
        pattern: /\bnlp\b/,
    },
    {
        label: "assistive-only NLP boundary",
        pattern: /assistive only|did not override|does not treat nlp output/,
    },
    {
        label: "audio identity review",
        pattern: /audio identity|audio\/.*kanji reading/,
    },
    {
        label: "stroke-order identity review",
        pattern: /stroke order identity|stroke order/,
    },
    {
        label: "evidence lane separation",
        pattern: /evidence lanes checked separately|evidence lanes/,
    },
    {
        label: "quality gate review",
        pattern: /quality gate|quality gates|current gate/,
    },
    {
        label: "verification limitation decision",
        pattern: /verification limitations|limitation/,
    },
    {
        label: "release-readiness boundary",
        pattern: /release readiness|release evidence|release tasks|not claimed|does not treat.*release/,
    },
]);

function buildKanjiReadingReferenceSet(entry = {}) {
    return new Set([
        ...normalizeList(entry.normalizedOnReadings),
        ...normalizeList(entry.normalizedKunReadings),
    ]);
}

function buildSyntheticKanjiRows(entries = [], levelLabel = "") {
    return activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES).map((entry) => {
        const kanji = entry.kanji;
        const primaryReading = normalizeList(entry.readingIncludes)[0] || "";

        return {
            kanji,
            levelLabel,
            displayWord: kanji,
            meaningJP: normalizeList(entry.meaningIncludes).join(" / "),
            primaryReading,
            kanjiMeanings: normalizeList(entry.kanjiMeaningsIncludes).join(" / "),
            studyWordKanji: "",
            onReading: "",
            kunReading: "",
            strokeOrder: `<img src="${kanji}-stroke-order.gif" />`,
            audio: `[sound:${kanji}-kanji-reading-${kanji}-${primaryReading}.wav]`,
            radical: "",
            notes: normalizeList(entry.notesIncludes).join(" / "),
            exampleSentence: normalizeList(entry.exampleIncludes).join(" / "),
        };
    });
}

function assertLedgerGradeKanjiProofEvent({ level, entry, event }) {
    const reading = normalizeList(entry.readingIncludes)[0] || "";
    const cardKey = buildKanjiCardKey(entry.kanji, reading);
    const label = `N${level} Obsidian proof ${cardKey}`;
    const evidenceText = [
        ...normalizeList(event.proof?.evidenceChecked),
        event.proof?.limitationDecision,
        JSON.stringify(event.proof?.sentenceQualityReview || {}),
        event.authority?.boundary,
    ].join("\n");

    assert.equal(event.schemaVersion, 1, `${label} schema version`);
    assert.equal(event.recordType, "obsidian-proof-event", `${label} record type`);
    assert.equal(event.target.deckKind, "kanji", `${label} target deck kind`);
    assert.equal(event.target.level, level, `${label} target level`);
    assert.equal(event.target.written, entry.kanji, `${label} target written`);
    assert.equal(event.target.reading, reading, `${label} target reading`);
    assert.equal(event.target.cardReviewed, cardKey, `${label} target card identity`);
    assert.equal(event.proof.cardReviewed, cardKey, `${label} proof card identity`);
    assert.equal(event.proof.type, "substantive current standard rereview", `${label} proof type`);
    assert.equal(event.proof.reviewStandard, CURRENT_KANJI_PLATINUM_REVIEW_STANDARD, `${label} proof standard`);
    assert.equal(event.proof.reviewedAfterStandard, true, `${label} reviewed after current standard`);
    assert.equal(event.proof.mechanicalMigration, false, `${label} must be non-mechanical proof`);
    assert.match(event.proof.result, /^approved_/, `${label} proof result`);
    assert.match(event.proof.scope, /full kanji card rereview/i, `${label} proof scope`);
    assert.ok(event.proof.reviewedAt, `${label} proof reviewedAt`);
    assert.ok(event.proof.reviewer, `${label} proof reviewer`);
    assert.deepEqual(event.authority, OBSIDIAN_PROOF_LEDGER_AUTHORITY, `${label} proof authority boundary`);
    assert.equal(
        event.ledger.sourceReviewSetPath,
        `templates/platinum_n${level}_review_set.json`,
        `${label} source review set path`
    );

    for (const requirement of LEDGER_GRADE_KANJI_EVIDENCE_REQUIREMENTS) {
        assertProofTextPattern(evidenceText, requirement.pattern, `${label} missing ${requirement.label}`);
    }

    assertAuditIncludes(label, evidenceText, entry.kanji);
    assertAuditIncludes(label, evidenceText, reading);
    for (const meaning of normalizeList(entry.meaningIncludes)) {
        assertAuditIncludes(label, evidenceText, meaning);
    }
    for (const meaning of normalizeList(entry.kanjiMeaningsIncludes)) {
        assertAuditIncludes(label, evidenceText, meaning);
    }
    for (const note of normalizeList(entry.notesIncludes)) {
        assertAuditIncludes(label, evidenceText, note);
    }
    for (const example of normalizeList(entry.exampleIncludes)) {
        assertAuditIncludes(label, evidenceText, example);
    }

    const sentenceReview = event.proof.sentenceQualityReview || {};
    assert.ok(sentenceReview.example, `${label} sentence review example`);
    assert.ok(sentenceReview.reading, `${label} sentence review reading`);
    assert.ok(sentenceReview.translation, `${label} sentence review translation`);
    assert.equal(sentenceReview.naturalJapanese, true, `${label} sentence review naturalJapanese`);
    assert.equal(sentenceReview.learnerUseful, true, `${label} sentence review learnerUseful`);
    assert.equal(sentenceReview.levelAppropriate, true, `${label} sentence review levelAppropriate`);
    assert.equal(sentenceReview.supportOnly, true, `${label} sentence review supportOnly`);
    assert.ok(sentenceReview.reviewerJudgment, `${label} sentence review reviewer judgment`);
}

function assertKanjiLedgerGradeForLevel(level) {
    const entries = loadJson(path.join("templates", `platinum_n${level}_review_set.json`));
    const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);
    const events = loadKanjiObsidianProofEvents(level);
    const eventsByCardKey = new Map();

    assert.ok(manifestActiveEntries.length > 0, `N${level} must have active Platinum entries before Obsidian proof can be checked`);
    assert.equal(events.length, manifestActiveEntries.length, `N${level} proof ledger count must equal active Platinum count`);

    for (const event of events) {
        assert.equal(eventsByCardKey.has(event.target.cardReviewed), false, `N${level} duplicate proof target ${event.target.cardReviewed}`);
        eventsByCardKey.set(event.target.cardReviewed, event);
    }

    for (const entry of manifestActiveEntries) {
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const cardKey = buildKanjiCardKey(entry.kanji, reading);
        const event = eventsByCardKey.get(cardKey);

        assert.ok(event, `N${level} missing Obsidian proof event for active Platinum card ${cardKey}`);
        assertLedgerGradeKanjiProofEvent({ level, entry, event });
    }
}

function assertN1PlatinumAuditMeetsLedgerGradeFloor(entry) {
    const reading = normalizeList(entry.readingIncludes)[0] || "";
    const cardKey = buildKanjiCardKey(entry.kanji, reading);
    const label = `N1 Platinum audit ${cardKey}`;
    const audit = entry.platinumReviewAudit || {};
    const isPlatinumAudit = audit.auditType === N1_PLATINUM_AUDIT_TYPE;
    const evidenceText = [
        ...normalizeList(audit.commandsReviewed),
        audit.sourceFieldReview?.sourceEvidenceDetail,
        audit.sourceFieldReview?.sourceOriginReview,
        audit.levelPlacementReview?.sourceConfidenceNote,
        audit.levelPlacementReview?.reviewerDecision,
        audit.exampleSentenceReview?.reviewerJudgment,
        audit.nlpReview?.reviewerDecision,
        JSON.stringify(audit.nlpReview?.authority || {}),
        audit.mediaReview?.releaseQaBoundary,
        audit.limitationDecision?.reviewerDecision,
        audit.rubricReview?.reviewerDecision,
        audit.trackedSourceContractBoundary?.reason,
    ].join("\n");

    if (isPlatinumAudit) {
        const actualCardDataReview = audit.actualCardDataReview || {};
        assert.equal(
            actualCardDataReview.actualCardDataReviewed,
            true,
            `${label} must explicitly record actual card-data review`
        );
        assert.equal(
            actualCardDataReview.reviewStandard,
            CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
            `${label} actual card-data review standard`
        );
        const checklist = normalizeList(actualCardDataReview.checklist);
        for (const requiredField of N1_REQUIRED_ACTUAL_CARD_DATA_REVIEW_FIELDS) {
            assert.ok(
                checklist.includes(requiredField),
                `${label} actual card-data checklist missing ${requiredField}`
            );
        }
        assert.doesNotMatch(
            JSON.stringify(audit),
            /structural Platinum evidence only|structural Platinum card review only|structural Platinum-only|structure-only|cardSurfacePlatinum/i,
            `${label} must not use structural-Platinum or pseudo-lane marker wording`
        );
    }

    assert.equal(audit.generatedSurface?.hardChecksPassed, true, `${label} generated hard checks`);
    assert.equal(audit.sourceFieldReview?.supports?.targetKanji, true, `${label} source target support`);
    assert.equal(audit.sourceFieldReview?.supports?.primaryReading, true, `${label} source reading support`);
    assert.equal(audit.sourceFieldReview?.supports?.primaryMeaning, true, `${label} source meaning support`);
    assert.equal(audit.sourceFieldReview?.supports?.broaderMeanings, true, `${label} source broader meaning support`);
    assert.equal(audit.sourceFieldReview?.independentFromPlacementOrigins, true, `${label} source-origin independence`);
    assert.equal(audit.exampleSentenceReview?.naturalJapanese, true, `${label} example naturalJapanese`);
    assert.equal(audit.exampleSentenceReview?.learnerUseful, true, `${label} example learnerUseful`);
    assert.equal(audit.exampleSentenceReview?.levelAppropriate, true, `${label} example levelAppropriate`);
    assert.equal(audit.exampleSentenceReview?.supportOnly, true, `${label} example supportOnly`);
    assert.equal(audit.exampleSentenceReview?.releaseQuality, true, `${label} example releaseQuality`);
    assert.equal(audit.nlpReview?.packetFound, true, `${label} NLP packet found`);
    assert.equal(audit.nlpReview?.authority?.outputAuthority, "assistive_only", `${label} NLP authority`);
    assert.equal(audit.nlpReview?.authority?.writesTrackedTemplates, false, `${label} NLP no template writes`);
    assert.equal(audit.nlpReview?.authority?.certifiesCards, false, `${label} NLP no certification`);
    assert.equal(audit.nlpReview?.authority?.claimsReleaseReadiness, false, `${label} NLP no release claim`);
    assert.equal(audit.mediaReview?.audio?.exactPrimaryReading, true, `${label} audio exact reading`);
    assert.equal(audit.mediaReview?.strokeOrder?.targetVerified, true, `${label} stroke-order target`);
    assert.equal(audit.limitationDecision?.obsidianProofClaimed, false, `${label} no Obsidian proof claim`);
    assert.equal(audit.rubricReview?.substantiveProofRecorded, false, `${label} no substantive proof claim`);
    assert.equal(audit.rubricReview?.obsidianProofEligibleFromThisAudit, false, `${label} no Obsidian eligibility claim`);

    assertAuditIncludes(label, evidenceText, entry.kanji);
    assertAuditIncludes(label, evidenceText, reading);
    for (const requirement of [
        { label: "generated card command", pattern: /deck:ready|deck:platinum:batch/ },
        { label: "NLP command", pattern: /deck:kanji:nlp signals|deck:kanji:nlp-signals/ },
        { label: "audio command", pattern: /media:review:audio/ },
        { label: "stroke-order command", pattern: /data:audit:stroke order|data:audit:stroke-order/ },
        { label: "card-field source boundary", pattern: /card field verification|card-field verification/ },
        { label: "source-origin independence", pattern: /independent.*source|source.*independent|source origin/ },
        { label: "assistive-only NLP boundary", pattern: /assistive only|assistive_only|human review required/ },
        { label: "release-readiness boundary", pattern: /release readiness|release tasks|not claimed/ },
        { label: "Obsidian reset boundary", pattern: /obsidian proof.*reset|0\/1230|not obsidian proof/i },
    ]) {
        assertProofTextPattern(evidenceText, requirement.pattern, `${label} missing ${requirement.label}`);
    }
}

function buildSyntheticWordRows(entries = [], wordPitchAccentData = {}, goldenExpectations = []) {
    const goldenExpectationByKey = new Map((Array.isArray(goldenExpectations) ? goldenExpectations : [])
        .map((entry) => [
            buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeList(entry.readingIncludes)[0],
            }),
            entry,
        ]));

    return activeEntries(entries, ACTIVE_WORD_PLATINUM_STATUSES).map((entry) => {
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const wordKey = buildWordStudyEntryKey({ written: entry.word, reading });
        const goldExpectation = goldenExpectationByKey.get(wordKey) || {};
        const pitchEntry = wordPitchAccentData.entries?.[wordKey] || {};
        const pitchPattern = pitchEntry.pattern || "";
        const sourceLabel = isGeneratedPitchAccentSource({
            sourceId: pitchEntry.sourceId,
            source: wordPitchAccentData.sources?.[pitchEntry.sourceId],
        }) ? GENERATED_PITCH_LABEL : "";

        return {
            word: entry.word,
            reading,
            readingBreakdown: normalizeList(goldExpectation.breakdownIncludes || entry.breakdownIncludes).join(" / "),
            audio: `[sound:${entry.word}-word-reading-${entry.word}-${reading}.wav]`,
            pitchAccent: buildPitchAccentHtml({ pattern: pitchPattern, reading, sourceLabel }),
            meaning: normalizeList(goldExpectation.meaningIncludes || entry.meaningIncludes).join(" / "),
            jlptLevel: normalizeList(goldExpectation.jlptLevelIncludes || entry.jlptLevelIncludes).join(" / "),
            coverageRole: normalizeList(goldExpectation.coverageRoleIncludes || entry.coverageRoleIncludes).join(" / "),
            focusKanji: normalizeList(goldExpectation.focusIncludes || entry.focusIncludes).join(" / "),
            coversReading: normalizeList(goldExpectation.coversReadingIncludes || entry.coversReadingIncludes).join(" / "),
            kanjiBreakdown: normalizeList(goldExpectation.breakdownIncludes || entry.breakdownIncludes).join(" / "),
            exampleSentence: normalizeList(goldExpectation.exampleIncludes || entry.exampleIncludes).join(" / "),
            notes: normalizeList(goldExpectation.notesIncludes || entry.notesIncludes).join(" / "),
        };
    });
}

test("tracked populated kanji platinum manifests bind evidence to protected fields", () => {
    const platinumFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => (
            /^platinum_n[1-5]_review_set\.json$/.test(name)
            || /^platinum_additional_unverified_n[1-5]_review_set\.json$/.test(name)
        ))
        .sort();

    for (const fileName of platinumFiles) {
        const entries = loadJson(path.join("templates", fileName));
        if (entries.length === 0) {
            continue;
        }

        const level = fileName.match(/^platinum_(?:additional_unverified_)?n([1-5])_review_set\.json$/)?.[1];
        const report = evaluatePlatinumKanjiReviewSet({
            rows: buildSyntheticKanjiRows(entries, `N${level}`),
            entries,
        });

        if (fileName === "platinum_n1_review_set.json" && report.activePlatinumCount === 0) {
            assert.equal(report.activePlatinumCount, 0, "N1 reset must have zero active Platinum cards");
            assert.equal(report.currentStandardPlatinumCount, 0, "N1 reset must have zero current-standard Platinum cards");
            assertN1PlatinumResetToZero(entries);
            continue;
        }

        assert.equal(report.passed, true, `${fileName}\n${formatPlatinumKanjiReviewReport(report)}`);
    }
});

test("tracked active Platinum manifests do not use Sapphire as Platinum authority", () => {
    const platinumFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => (
            /^platinum_n[1-5]_review_set\.json$/.test(name)
            || /^platinum_n[1-5]_word_review_set\.json$/.test(name)
        ))
        .sort();

    for (const fileName of platinumFiles) {
        const deckKind = platinumDeckKindForFile(fileName);
        const entries = loadJson(path.join("templates", fileName));
        const manifestActiveEntries = activeEntries(entries, platinumActiveStatusesForFile(fileName));

        for (const entry of manifestActiveEntries) {
            assert.deepEqual(
                validatePlatinumLaneAuthorityBoundary({ deckKind, entry }),
                [],
                `${fileName} active Platinum entry must be lane-native, not copied from Sapphire authority`
            );
        }
    }
});

test("N1 kanji platinum manifest is either reset-zero history or active current-standard coverage", () => {
    const entries = loadJson(path.join("templates", "platinum_n1_review_set.json"));
    const report = evaluatePlatinumKanjiReviewSet({
        rows: buildSyntheticKanjiRows(entries, "N1"),
        entries,
    });

    if (report.activePlatinumCount === 0) {
        assert.equal(activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES).length, 0);
        assert.equal(report.currentStandardPlatinumCount, 0);
        assert.equal(report.passed, false);
        assert.ok(
            report.coverageFailures.some((failure) => /no Platinum entries have been reviewed/i.test(failure)),
            "N1 zero reset must fail closed until real active Platinum entries are restored"
        );
        assertN1PlatinumResetToZero(entries);
        return;
    }

    const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);
    assert.ok(
        manifestActiveEntries.length >= 8,
        "N1 active current-standard coverage must retain at least the governed restart batch"
    );
    assert.equal(report.activePlatinumCount, manifestActiveEntries.length);
    assert.equal(report.currentStandardPlatinumCount, manifestActiveEntries.length);
    assert.equal(report.passed, true, formatPlatinumKanjiReviewReport(report));
});

test("tracked kanji platinum manifests do not regress known support-word primary readings", () => {
    for (const guard of KNOWN_KANJI_PRIMARY_READING_REGRESSION_GUARDS) {
        const fileName = `platinum_n${guard.level}_review_set.json`;
        const entries = loadJson(path.join("templates", fileName));
        const entry = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES)
            .find((candidate) => candidate.kanji === guard.kanji);
        const primaryReading = normalizeList(entry?.readingIncludes)[0] || "";

        assert.ok(entry, `${fileName} missing active tracked regression guard for ${guard.kanji}`);
        assert.notEqual(
            primaryReading,
            guard.rejectedReading,
            `${fileName} ${guard.kanji} must not regress to support-word primary reading ${guard.rejectedReading}`
        );
        assert.equal(
            primaryReading,
            guard.expectedReading,
            `${fileName} ${guard.kanji} must keep its tracked corrected primary reading; update this guard only with governed reading evidence`
        );
    }
});

test("tracked kanji fixed-then-platinum entries document generated-surface fixes", () => {
    const platinumFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => /^platinum_n[1-5]_review_set\.json$/.test(name))
        .sort();

    for (const fileName of platinumFiles) {
        const entries = loadJson(path.join("templates", fileName));
        const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);

        for (const entry of manifestActiveEntries) {
            const hasFixSummary = typeof entry.fixSummary === "string" && entry.fixSummary.trim().length > 0;
            const fixEvidenceText = [
                entry.fixSummary,
                ...normalizeList(entry.internalChecks).map((check) => check.detail),
                ...normalizeList(entry.reviewEvidence).map((evidence) => evidence.detail),
                ...normalizeList(entry.sourceEvidence).map((evidence) => evidence.detail),
            ].filter(Boolean).join("\n");

            if (entry.status === "fixed_then_platinum") {
                assert.ok(
                    hasFixSummary,
                    `${fileName} ${entry.kanji} is fixed_then_platinum and must document the generated-surface fix`
                );
                assert.ok(
                    fixEvidenceText.length >= 20,
                    `${fileName} ${entry.kanji} fixed_then_platinum evidence must explain what was fixed before promotion`
                );
                continue;
            }

            assert.equal(
                hasFixSummary,
                false,
                `${fileName} ${entry.kanji} has a fixSummary but is not marked fixed_then_platinum`
            );
        }
    }
});

test("active N1 kanji platinum entries include structured card audit evidence when present", () => {
    const entries = loadJson(path.join("templates", "platinum_n1_review_set.json"));
    const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);

    if (manifestActiveEntries.length === 0) {
        assertN1PlatinumResetToZero(entries);
        return;
    }

    for (const entry of manifestActiveEntries) {
        const label = `platinum_n1_review_set.json ${entry.kanji}`;
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const audit = entry.platinumReviewAudit;

        assert.ok(audit && typeof audit === "object", `${label} must include platinumReviewAudit`);
        assert.equal(audit.schemaVersion, 1, `${label} audit schema version`);
        assert.ok(N1_ALLOWED_AUDIT_TYPES.includes(audit.auditType), `${label} audit type`);
        assert.equal(audit.batch?.level, 1, `${label} audit batch level`);
        assert.equal(audit.batch?.reviewedAt, entry.revalidatedAt, `${label} audit reviewedAt must match revalidation`);
        assert.equal(audit.batch?.reviewer, entry.reviewer, `${label} audit reviewer must match revalidation`);

        const commands = normalizeList(audit.commandsReviewed);
        for (const requiredCommand of [
            "deck:ready",
            "deck:platinum:batch",
            "deck:kanji:nlp-signals",
            "media:review:audio",
            "data:audit:stroke-order",
        ]) {
            assert.ok(
                commands.some((command) => command.includes(requiredCommand)),
                `${label} audit must record command ${requiredCommand}`
            );
        }

        const surface = audit.generatedSurface || {};
        assert.equal(surface.artifact, "out/build/exports/jlpt-n1.tsv", `${label} generated surface artifact`);
        assert.equal(surface.kanji, entry.kanji, `${label} generated surface kanji`);
        assert.equal(surface.displayWord, entry.kanji, `${label} generated surface DisplayWord`);
        assert.equal(surface.primaryReading, reading, `${label} generated surface PrimaryReading`);
        assert.equal(surface.studyWordKanji, "", `${label} generated surface StudyWordKanji`);
        assert.equal(surface.hardChecksPassed, true, `${label} generated surface hard checks`);
        for (const [checkName, passed] of Object.entries(surface.hardChecks || {})) {
            assert.equal(passed, true, `${label} generated surface hard check must pass: ${checkName}`);
        }
        for (const meaning of normalizeList(entry.meaningIncludes)) {
            assert.ok(auditTextIncludes(surface.meaningJP, meaning), `${label} generated surface missing meaning ${meaning}`);
        }
        for (const meaning of normalizeList(entry.kanjiMeaningsIncludes)) {
            assert.ok(auditTextIncludes(surface.kanjiMeanings, meaning), `${label} generated surface missing kanji meaning ${meaning}`);
        }
        for (const note of normalizeList(entry.notesIncludes)) {
            assert.ok(auditTextIncludes(surface.notes, note), `${label} generated surface missing note ${note}`);
        }
        for (const example of normalizeList(entry.exampleIncludes)) {
            assert.ok(auditTextIncludes(surface.exampleSentence, example), `${label} generated surface missing example ${example}`);
        }
        assert.ok(surface.audio?.includes(`kanji-reading-${entry.kanji}-${reading}`), `${label} generated surface audio must bind exact reading`);
        assert.ok(surface.strokeOrder?.includes(`Stroke order for ${entry.kanji}`), `${label} generated surface stroke order must bind target`);

        const source = audit.sourceFieldReview || {};
        assert.equal(source.sourceId, "kanjipedia", `${label} source review sourceId`);
        assert.equal(source.sourceStatus, "active", `${label} source review active source`);
        assert.ok(normalizeList(source.allowedUse).includes("kanji-field-verification"), `${label} source review allowed use`);
        assert.equal(source.supports?.targetKanji, true, `${label} source review target kanji support`);
        assert.equal(source.supports?.primaryReading, true, `${label} source review primary reading support`);
        assert.equal(source.supports?.primaryMeaning, true, `${label} source review primary meaning support`);
        assert.equal(source.supports?.broaderMeanings, true, `${label} source review broader meaning support`);
        assert.equal(source.supports?.cardFieldOnly, true, `${label} source review card-field boundary`);
        assert.equal(source.supports?.jlptPlacementTruth, false, `${label} source review must not claim JLPT placement truth`);
        assert.ok(normalizeList(source.sourceOriginIds).length > 0, `${label} source review must record placement source origins`);
        assert.equal(source.independentFromPlacementOrigins, true, `${label} source review must record source-origin independence`);

        const levelPlacement = audit.levelPlacementReview || {};
        assert.equal(levelPlacement.currentContractLevel, "N1", `${label} level placement current contract`);
        assert.equal(levelPlacement.sourceConsensusLevel, "N1", `${label} source consensus level`);
        assert.ok(levelPlacement.sourceConfidence, `${label} source confidence must be recorded`);
        assert.equal(typeof levelPlacement.releaseBlockedBySourceConfidence, "boolean", `${label} source confidence release boundary`);
        assert.match(levelPlacement.reviewerDecision || "", /current N1 Platinum/i, `${label} level placement boundary must say current N1 Platinum`);
        assert.match(levelPlacement.reviewerDecision || "", /release readiness/i, `${label} level placement boundary must mention release readiness`);

        const exampleReview = audit.exampleSentenceReview || {};
        assert.ok(auditTextIncludes(exampleReview.sentence, normalizeList(entry.exampleIncludes)[0]), `${label} example review sentence`);
        assert.ok(exampleReview.reading, `${label} example review reading`);
        assert.ok(exampleReview.translation, `${label} example review translation`);
        for (const flag of [
            "naturalJapanese",
            "learnerUseful",
            "learnerFriendly",
            "levelAppropriate",
            "releaseQuality",
            "supportOnly",
            "anchorPreserved",
        ]) {
            assert.equal(exampleReview[flag], true, `${label} example review flag must be true: ${flag}`);
        }

        const nlpReview = audit.nlpReview || {};
        assert.equal(nlpReview.packetFound, true, `${label} NLP packet must be found`);
        assert.equal(nlpReview.priority, "routine", `${label} NLP packet priority`);
        assert.equal(nlpReview.suggestionCount, 0, `${label} NLP suggestion count`);
        assert.ok(normalizeList(nlpReview.tokenizationSignalKinds).includes("routine-tokenization-review"), `${label} NLP routine signal`);
        assert.equal(nlpReview.authority?.outputAuthority, "assistive_only", `${label} NLP authority`);
        assert.equal(nlpReview.authority?.writesTrackedTemplates, false, `${label} NLP must not write templates`);
        assert.equal(nlpReview.authority?.certifiesCards, false, `${label} NLP must not certify cards`);
        assert.equal(nlpReview.nlpNonCertifying, true, `${label} NLP non-certifying boundary`);
        assert.match(nlpReview.reviewerDecision || "", /no tracked card change (?:is )?required/i, `${label} NLP reviewer decision`);

        const mediaReview = audit.mediaReview || {};
        assert.equal(mediaReview.audio?.text, entry.kanji, `${label} audio text`);
        assert.equal(mediaReview.audio?.reading, reading, `${label} audio reading`);
        assert.equal(mediaReview.audio?.source, "voicevox-nemo", `${label} audio source`);
        assert.equal(mediaReview.audio?.exactPrimaryReading, true, `${label} audio exact reading`);
        assert.equal(mediaReview.audio?.exists, true, `${label} audio exists`);
        assert.equal(mediaReview.strokeOrder?.targetVerified, true, `${label} stroke-order target`);
        assert.equal(mediaReview.strokeOrder?.imageExists, true, `${label} stroke-order image exists`);
        assert.equal(mediaReview.strokeOrder?.animationExists, true, `${label} stroke-order animation exists`);
        assert.match(mediaReview.releaseQaBoundary || "", /not claimed here/i, `${label} media release QA boundary`);

        const limitationDecision = audit.limitationDecision || {};
        assert.deepEqual(entry.verificationLimitations, [], `${label} tracked limitations must be explicit and empty`);
        assert.deepEqual(limitationDecision.activeVerificationLimitations, [], `${label} audit limitations must be explicit and empty`);
        assert.equal(limitationDecision.coreUncertainty, false, `${label} core uncertainty`);
        assert.equal(limitationDecision.noActiveLimitations, true, `${label} no active limitations`);
        assert.equal(limitationDecision.releaseReadinessClaimed, false, `${label} release readiness boundary`);
        assert.equal(limitationDecision.obsidianProofClaimed, false, `${label} Obsidian boundary`);

        const rubricReview = audit.rubricReview || {};
        assert.equal(rubricReview.rubricVersion, "kanji-platinum-rereview-rubric-v1", `${label} rubric version`);
        assert.equal(rubricReview.rubricResult, "ready_for_substantive_review", `${label} rubric result`);
        assert.equal(Object.hasOwn(rubricReview, "structuralPlatinum"), false, `${label} must not use structuralPlatinum in active Platinum audit`);
        assert.equal(Object.hasOwn(rubricReview, "cardSurfacePlatinum"), false, `${label} must not invent cardSurfacePlatinum as a separate marker`);
        assert.equal(rubricReview.substantiveProofRecorded, false, `${label} substantive proof boundary`);
        assert.equal(rubricReview.obsidianProofEligibleFromThisAudit, false, `${label} Obsidian proof boundary`);

        const sourceContractBoundary = audit.trackedSourceContractBoundary || {};
        assert.equal(
            sourceContractBoundary.result,
            "blocked_until_obsidian_rereview_binding_exists",
            `${label} tracked source contract boundary`
        );
        assert.match(
            sourceContractBoundary.reason || "",
            /N1 Obsidian proof is intentionally reset to 0\/1230/i,
            `${label} source contract boundary must explain why no N1 contract is committed`
        );
    }
});

test("active N1 kanji Platinum audit preserves ledger-grade review breadth without claiming Obsidian proof when present", () => {
    const entries = loadJson(path.join("templates", "platinum_n1_review_set.json"));
    const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);

    if (manifestActiveEntries.length === 0) {
        assertN1PlatinumResetToZero(entries);
        return;
    }

    for (const entry of manifestActiveEntries) {
        assertN1PlatinumAuditMeetsLedgerGradeFloor(entry);
    }
});

test("active N2 kanji platinum entries bind to ledger-grade Obsidian proof evidence", () => {
    assertKanjiLedgerGradeForLevel(2);
});

test("active N3 kanji platinum entries bind to ledger-grade Obsidian proof evidence", () => {
    assertKanjiLedgerGradeForLevel(3);
});

test("active N4 kanji platinum entries bind to ledger-grade Obsidian proof evidence", () => {
    assertKanjiLedgerGradeForLevel(4);
});

test("active N5 kanji platinum entries bind to ledger-grade Obsidian proof evidence", () => {
    assertKanjiLedgerGradeForLevel(5);
});

test("tracked active N3 through N5 kanji platinum primary readings are exact governed on/kun readings", () => {
    const readingReference = loadJson(path.join("templates", "kanji_reading_reference_contract.json"));

    for (const level of [3, 4, 5]) {
        const fileName = `platinum_n${level}_review_set.json`;
        const entries = loadJson(path.join("templates", fileName));
        const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);

        for (const entry of manifestActiveEntries) {
            const primaryReading = normalizeJapaneseReading(normalizeList(entry.readingIncludes)[0] || "");
            const sourceReadings = buildKanjiReadingReferenceSet(readingReference.entries?.[entry.kanji]);

            assert.ok(sourceReadings.size > 0, `${fileName} missing governed KANJIDIC2 reading reference for ${entry.kanji}`);
            assert.ok(
                sourceReadings.has(primaryReading),
                `${fileName} ${entry.kanji}|${normalizeList(entry.readingIncludes)[0] || ""} must be an exact governed KANJIDIC2 on/kun reading`
            );
        }
    }
});

test("tracked populated word platinum manifests bind evidence to protected fields and pitch sources", () => {
    const wordPitchAccentData = loadJson(path.join("templates", "word_pitch_accent_data.json"));
    const platinumFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => /^platinum_n[1-5]_word_review_set\.json$/.test(name))
        .sort();

    for (const fileName of platinumFiles) {
        const entries = loadJson(path.join("templates", fileName));
        const manifestActiveEntries = activeEntries(entries, ACTIVE_WORD_PLATINUM_STATUSES);
        if (manifestActiveEntries.length === 0) {
            continue;
        }
        const levelMatch = fileName.match(/^platinum_n([1-5])_word_review_set\.json$/);
        assert.ok(levelMatch, `${fileName} must encode a word JLPT level`);
        const level = Number(levelMatch[1]);

        const activeWordKeys = manifestActiveEntries.map((entry) =>
            buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeList(entry.readingIncludes)[0],
            })
        );

        for (const wordKey of activeWordKeys) {
            assert.ok(wordPitchAccentData.entries[wordKey], `${fileName} missing pitch source for ${wordKey}`);
        }

        const activeWordKeySet = new Set(activeWordKeys);
        const goldenExpectations = loadJson(path.join("templates", `golden_n${level}_word_review_set.json`))
            .filter((entry) => activeWordKeySet.has(buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeList(entry.readingIncludes)[0],
            })));
        const rows = buildSyntheticWordRows(manifestActiveEntries, wordPitchAccentData, goldenExpectations);
        const sapphireEntries = loadJson(path.join("templates", `sapphire_n${level}_word_review_set.json`))
            .filter((entry) => activeWordKeySet.has(buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeList(entry.readingIncludes)[0],
            })));
        const sapphireReport = evaluateSapphireWordReviewSet({
            rows,
            entries: sapphireEntries,
            goldenExpectations,
            requireGoldPrecondition: true,
            requireCurrentReviewStandard: true,
            allowEmpty: true,
        });
        const report = evaluatePlatinumWordReviewSet({
            rows,
            entries: manifestActiveEntries,
            goldenExpectations,
            requireGoldPrecondition: true,
            sapphireEntries,
            sapphireResults: sapphireReport.results,
            requireSapphirePrecondition: true,
            wordPitchAccentData,
        });

        assert.equal(report.passed, true, `${fileName}\n${formatPlatinumWordReviewReport(report)}`);
    }
});
