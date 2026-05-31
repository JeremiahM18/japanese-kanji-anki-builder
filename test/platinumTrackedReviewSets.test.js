const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_KANJI_PLATINUM_STATUSES,
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");
const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_WORD_PLATINUM_STATUSES,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
} = require("../src/services/platinumReviewService");
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

function activeEntries(entries = [], activeStatuses = []) {
    return entries.filter((entry) => activeStatuses.includes(entry.status));
}

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

function buildSyntheticWordRows(entries = [], wordPitchAccentData = {}) {
    return activeEntries(entries, ACTIVE_WORD_PLATINUM_STATUSES).map((entry) => {
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const wordKey = buildWordStudyEntryKey({ written: entry.word, reading });
        const pitchEntry = wordPitchAccentData.entries?.[wordKey] || {};
        const pitchPattern = pitchEntry.pattern || "";
        const sourceLabel = isGeneratedPitchAccentSource({
            sourceId: pitchEntry.sourceId,
            source: wordPitchAccentData.sources?.[pitchEntry.sourceId],
        }) ? GENERATED_PITCH_LABEL : "";

        return {
            word: entry.word,
            reading,
            readingBreakdown: normalizeList(entry.breakdownIncludes).join(" / "),
            audio: `[sound:${entry.word}-word-reading-${entry.word}-${reading}.wav]`,
            pitchAccent: buildPitchAccentHtml({ pattern: pitchPattern, reading, sourceLabel }),
            meaning: normalizeList(entry.meaningIncludes).join(" / "),
            jlptLevel: normalizeList(entry.jlptLevelIncludes).join(" / "),
            coverageRole: normalizeList(entry.coverageRoleIncludes).join(" / "),
            focusKanji: normalizeList(entry.focusIncludes).join(" / "),
            coversReading: normalizeList(entry.coversReadingIncludes).join(" / "),
            kanjiBreakdown: normalizeList(entry.breakdownIncludes).join(" / "),
            exampleSentence: normalizeList(entry.exampleIncludes).join(" / "),
            notes: normalizeList(entry.notesIncludes).join(" / "),
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

        assert.equal(report.passed, true, `${fileName}\n${formatPlatinumKanjiReviewReport(report)}`);
    }
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

test("active N1 kanji platinum entries include structured card audit evidence", () => {
    const entries = loadJson(path.join("templates", "platinum_n1_review_set.json"));
    const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);

    assert.ok(manifestActiveEntries.length > 0, "N1 must have active Platinum entries before audit evidence can be checked");

    for (const entry of manifestActiveEntries) {
        const label = `platinum_n1_review_set.json ${entry.kanji}`;
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const audit = entry.platinumReviewAudit;

        assert.ok(audit && typeof audit === "object", `${label} must include platinumReviewAudit`);
        assert.equal(audit.schemaVersion, 1, `${label} audit schema version`);
        assert.equal(audit.auditType, "n1-structural-platinum-card-review", `${label} audit type`);
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
        assert.match(levelPlacement.reviewerDecision || "", /structural Platinum/i, `${label} level placement boundary must say structural Platinum`);
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
        assert.equal(rubricReview.structuralPlatinum, true, `${label} structural Platinum`);
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

        const activeWordKeys = manifestActiveEntries.map((entry) =>
            buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeList(entry.readingIncludes)[0],
            })
        );

        for (const wordKey of activeWordKeys) {
            assert.ok(wordPitchAccentData.entries[wordKey], `${fileName} missing pitch source for ${wordKey}`);
        }

        const report = evaluatePlatinumWordReviewSet({
            rows: buildSyntheticWordRows(manifestActiveEntries, wordPitchAccentData),
            entries: manifestActiveEntries,
            wordPitchAccentData,
        });

        assert.equal(report.passed, true, `${fileName}\n${formatPlatinumWordReviewReport(report)}`);
    }
});
