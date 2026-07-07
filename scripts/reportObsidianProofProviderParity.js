const fs = require("node:fs");
const path = require("node:path");

const {
    loadConfig,
} = require("../src/config");
const {
    loadCuratedStudyData,
} = require("../src/datasets/curatedStudyData");
const {
    parseLevelsArgument,
} = require("../src/services/buildPipeline");
const {
    KANJI_BATCH_QUEUE_MODES,
    buildPlatinumKanjiBatchReport,
    normalizeQueueMode,
} = require("../src/services/platinumKanjiBatchReportService");
const {
    WORD_BATCH_QUEUE_MODES,
    buildPlatinumWordBatchReport,
    normalizeQueueMode: normalizeWordBatchQueueMode,
} = require("../src/services/platinumWordBatchReportService");
const {
    buildPlatinumKanjiRereviewStatusReport,
} = require("../src/services/platinumKanjiRereviewStatusService");
const {
    evaluatePlatinumKanjiReviewSet,
} = require("../src/services/platinumKanjiReviewService");
const {
    evaluatePlatinumWordReviewSet,
} = require("../src/services/platinumReviewService");
const {
    loadJlptLevelContract,
} = require("../src/datasets/jlptLevelContract");
const {
    loadWordPitchAccentData,
} = require("../src/datasets/wordPitchAccentData");
const {
    parseSapphireKanjiReviewSet,
} = require("../src/datasets/sapphireKanjiReviewSet");
const {
    parseSapphireWordReviewSet,
} = require("../src/datasets/sapphireWordReviewSet");
const {
    evaluateSapphireWordReviewSet,
} = require("../src/services/sapphireWordReviewService");
const {
    loadPlatinumCardSourceManifest,
} = require("../src/datasets/platinumCardSourceManifest");
const {
    DEFAULT_CHECKED_AT,
    buildKanjiCardFieldSourceContract,
} = require("../src/services/kanjiCardFieldSourceContractService");
const {
    buildManifestGovernancePosture,
    evaluatePlatinumGovernanceGate,
} = require("../src/services/platinumGovernanceGateService");
const {
    loadKanjiSourceOriginEvidence,
    resolveKanjiSourceOriginIdsForEntry,
} = require("../src/services/platinumKanjiSourceOriginService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    applyObsidianProofProvider,
    loadReviewSetWithObsidianProof,
} = require("../src/services/obsidianProofProviderService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseCsvOption,
    parseNumericOption,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildKanjiRowsForLevel,
} = require("../src/services/kanjiGeneratedRowsService");
const {
    buildWordRowsForLevel,
} = require("../src/services/wordGeneratedRowsService");
const {
    parseWordIdentities,
} = require("./platinumWordBatchReport");
const {
    buildPlatinumWordRereviewStatusReport,
} = require("../src/services/platinumWordRereviewStatusService");
const {
    buildObsidianWordCertificationStatusSummary,
} = require("../src/services/obsidianWordCertificationStatusService");
const {
    buildPlatinumWordSourcePostureReport,
    buildPlatinumWordSourcePostureSummary,
} = require("../src/services/platinumWordSourcePostureService");

const SUPPORTED_CONSUMERS = Object.freeze({
    KANJI_BATCH_REPORT: "kanji-batch-report",
    KANJI_FIELD_SOURCE_CONTRACT: "kanji-field-source-contract",
    KANJI_PLATINUM_LEVEL: "kanji-platinum-level",
    KANJI_REREVIEW_STATUS: "kanji-rereview-status",
    PLATINUM_GOVERNANCE_GATE: "platinum-governance-gate",
    WORD_BATCH_REPORT: "word-batch-report",
    WORD_CERTIFY_STATUS: "word-certify-status",
    WORD_GOVERNANCE_INPUTS: "word-governance-inputs",
    WORD_PLATINUM_LEVEL: "word-platinum-level",
    WORD_REREVIEW_STATUS: "word-rereview-status",
});

const ROW_SOURCES = Object.freeze({
    GENERATED: "generated",
    TRACKED_REVIEW_SET: "tracked-review-set",
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function stableJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableJson(value[key])}`
        )).join(",")}}`;
    }
    return JSON.stringify(value);
}

function parseArgs(argv) {
    let consumerProvided = false;
    const options = {
        consumer: SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS,
        deckKind: "kanji",
        json: false,
        kanji: [],
        levels: [3],
        limit: 12,
        queue: KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
        requireAllRows: true,
        requireCurrentReviewStandard: true,
        allowEmpty: false,
        rowSource: ROW_SOURCES.TRACKED_REVIEW_SET,
        unknownArgs: [],
        words: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--allow-empty") {
            options.allowEmpty = true;
        } else if (arg === "--allow-legacy-standard") {
            options.requireCurrentReviewStandard = false;
        } else if (arg === "--require-all") {
            options.requireAllRows = true;
        } else if (arg.startsWith("--consumer=")) {
            options.consumer = parseStringOption(arg, "consumer");
            consumerProvided = true;
        } else if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind").trim();
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = parseCsvOption(arg, "kanji");
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--queue=")) {
            options.queue = normalizeQueueMode(parseStringOption(arg, "queue"));
        } else if (arg.startsWith("--row-source=")) {
            options.rowSource = normalizeRowSource(parseStringOption(arg, "row-source"));
        } else if (arg.startsWith("--words=")) {
            options.words = parseWordIdentities(arg, "words");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (!consumerProvided && options.deckKind === "word") {
        options.consumer = SUPPORTED_CONSUMERS.WORD_REREVIEW_STATUS;
    }

    return options;
}

function assertConsumerDeckKind({ consumer, deckKind }) {
    const wordConsumers = new Set([
        SUPPORTED_CONSUMERS.WORD_BATCH_REPORT,
        SUPPORTED_CONSUMERS.WORD_CERTIFY_STATUS,
        SUPPORTED_CONSUMERS.WORD_GOVERNANCE_INPUTS,
        SUPPORTED_CONSUMERS.WORD_PLATINUM_LEVEL,
        SUPPORTED_CONSUMERS.WORD_REREVIEW_STATUS,
    ]);
    const expectedDeckKind = wordConsumers.has(consumer) ? "word" : "kanji";
    if (deckKind !== expectedDeckKind) {
        throw new Error(`Consumer ${consumer} requires --deck-kind=${expectedDeckKind}.`);
    }
}

function assertSupportedConsumer(consumer) {
    if (!Object.values(SUPPORTED_CONSUMERS).includes(consumer)) {
        throw new Error(`Unsupported Obsidian proof provider parity consumer: ${consumer}.`);
    }
}

function normalizeRowSource(rowSource = ROW_SOURCES.TRACKED_REVIEW_SET) {
    const normalized = normalizeText(rowSource);
    if (Object.values(ROW_SOURCES).includes(normalized)) {
        return normalized;
    }
    throw new Error(`Unsupported Obsidian proof provider parity row source: ${rowSource}.`);
}

function loadJsonIfExists(filePath, fallback = []) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return fallback;
        }
        throw error;
    }
}

function loadSapphireKanjiEntries({ cwd = process.cwd(), level } = {}) {
    const relativePath = `templates/sapphire_n${level}_review_set.json`;
    return parseSapphireKanjiReviewSet(
        loadJsonIfExists(path.join(cwd, relativePath), []),
        relativePath
    );
}

function loadSapphireWordEntries({ cwd = process.cwd(), level } = {}) {
    const relativePath = `templates/sapphire_n${level}_word_review_set.json`;
    return parseSapphireWordReviewSet(
        loadJsonIfExists(path.join(cwd, relativePath), []),
        relativePath
    );
}

function loadGoldenWordExpectations({ cwd = process.cwd(), level } = {}) {
    return loadJsonIfExists(path.join(cwd, "templates", `golden_n${level}_word_review_set.json`), []);
}

function loadWordPriorLaneInputs({ cwd = process.cwd(), level, rows = [] } = {}) {
    const goldenExpectations = loadGoldenWordExpectations({ cwd, level });
    const sapphireEntries = loadSapphireWordEntries({ cwd, level });
    const sapphireReport = evaluateSapphireWordReviewSet({
        rows,
        entries: sapphireEntries,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
        allowEmpty: true,
    });
    return {
        goldenExpectations,
        sapphireEntries,
        sapphireResults: sapphireReport.results,
    };
}

function firstString(values = []) {
    return (Array.isArray(values) ? values : [])
        .map(normalizeText)
        .find(Boolean) || "";
}

function joinStrings(values = [], separator = " / ") {
    return (Array.isArray(values) ? values : [])
        .map(normalizeText)
        .filter(Boolean)
        .join(separator);
}

function buildTrackedReviewSetRow(entry = {}, level = 3) {
    const kanji = normalizeText(entry.kanji);
    const primaryReading = firstString(entry.readingIncludes);
    return {
        kanji,
        levelLabel: Number.isInteger(level) ? `N${level}` : "",
        displayWord: kanji,
        meaningJP: joinStrings(entry.meaningIncludes),
        primaryReading,
        kanjiMeanings: joinStrings(entry.kanjiMeaningsIncludes),
        studyWordKanji: "",
        onReading: primaryReading ? `On: ${primaryReading}` : "",
        kunReading: "",
        strokeOrder: kanji ? `<img src="${kanji}-stroke-order.gif" />` : "",
        audio: kanji && primaryReading ? `[sound:${kanji}-kanji-reading-${kanji}-${primaryReading}.wav]` : "",
        radical: "",
        notes: joinStrings(entry.notesIncludes, " ／ "),
        exampleSentence: joinStrings(entry.exampleIncludes, " ／ "),
    };
}

function buildTrackedReviewSetRows(entries = [], level = 3) {
    const rows = [];
    const seen = new Set();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const kanji = normalizeText(entry.kanji);
        if (!kanji || seen.has(kanji)) {
            continue;
        }
        seen.add(kanji);
        rows.push(buildTrackedReviewSetRow(entry, level));
    }

    return rows;
}

function buildTrackedWordReviewSetRow(entry = {}, level = 5) {
    const word = normalizeText(entry.word || entry.written || entry.displayWord);
    const reading = firstString(entry.readingIncludes);
    return {
        word,
        reading,
        readingBreakdown: joinStrings(entry.breakdownIncludes) || reading,
        audio: word && reading ? `[sound:${word}-word-reading-${word}-${reading}.wav]` : "",
        pitchAccent: joinStrings(entry.pitchAccentIncludes) || "Pitch 1",
        meaning: joinStrings(entry.meaningIncludes),
        jlptLevel: joinStrings(entry.jlptLevelIncludes) || `JLPT N${level}`,
        coverageRole: joinStrings(entry.coverageRoleIncludes),
        focusKanji: joinStrings(entry.focusIncludes),
        coversReading: joinStrings(entry.coversReadingIncludes),
        kanjiBreakdown: joinStrings(entry.breakdownIncludes),
        exampleSentence: joinStrings(entry.exampleIncludes),
        notes: joinStrings(entry.notesIncludes, " / "),
    };
}

function buildTrackedWordReviewSetRows(entries = [], level = 5) {
    const rows = [];
    const seen = new Set();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const word = normalizeText(entry.word || entry.written || entry.displayWord);
        const reading = firstString(entry.readingIncludes);
        const identity = `${word}|${reading}`;
        if (!word || !reading || seen.has(identity)) {
            continue;
        }
        seen.add(identity);
        rows.push(buildTrackedWordReviewSetRow(entry, level));
    }

    return rows;
}

async function buildRowsForParity({ level, deckKind = "kanji", rowSource, rawEntries, config } = {}) {
    const normalizedRowSource = normalizeRowSource(rowSource);
    if (normalizedRowSource === ROW_SOURCES.GENERATED) {
        if (deckKind === "word") {
            return buildWordRowsForLevel({ level, config });
        }
        return buildKanjiRowsForLevel({ level, config });
    }
    if (deckKind === "word") {
        return buildTrackedWordReviewSetRows(rawEntries, level);
    }
    return buildTrackedReviewSetRows(rawEntries, level);
}

function sampleKanji(cards = [], predicate, limit = 24) {
    return cards
        .filter(predicate)
        .map((card) => card.kanji)
        .filter(Boolean)
        .slice(0, limit);
}

function sampleValues(values = [], limit = 24) {
    return (Array.isArray(values) ? values : [])
        .filter(Boolean)
        .slice(0, limit);
}

function sampleWordIdentities(cards = [], predicate, limit = 24) {
    return cards
        .filter(predicate)
        .map((card) => card.identity)
        .filter(Boolean)
        .slice(0, limit);
}

function countInlineProofs(entries = []) {
    return (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry.rereviewProvenance && typeof entry.rereviewProvenance === "object")
        .length;
}

function buildProviderParityOutcome({
    inlineProofCount = 0,
    ledgerProvider = {},
    inlineProjection = {},
    ledgerProjection = {},
    buildDualReadMismatch,
} = {}) {
    const canonicalLedgerMode = inlineProofCount === 0
        && Number(ledgerProvider.summary?.ledgerProofEvents || 0) > 0;

    if (canonicalLedgerMode) {
        const ledgerProofEvents = Number(ledgerProvider.summary?.ledgerProofEvents || 0);
        const ledgerProofTargets = Number(ledgerProvider.summary?.ledgerProofTargets || ledgerProofEvents);
        const ledgerProofsApplied = Number(ledgerProvider.summary?.ledgerProofsApplied || 0);
        const ledgerProofEventsSuperseded = Number(ledgerProvider.summary?.ledgerProofEventsSuperseded || 0);
        const inlineProofsOmitted = Number(ledgerProvider.summary?.inlineProofsOmitted || 0);
        const passed = ledgerProofTargets === ledgerProofsApplied
            && ledgerProofEvents === ledgerProofsApplied + ledgerProofEventsSuperseded
            && inlineProofsOmitted === 0;
        return {
            comparisonMode: "canonical-ledger-integrity",
            passed,
            mismatch: passed ? null : {
                ledgerProviderIntegrity: {
                    ledgerProofEvents,
                    ledgerProofTargets,
                    ledgerProofsApplied,
                    ledgerProofEventsSuperseded,
                    inlineProofsOmitted,
                },
            },
        };
    }

    const passed = stableJson(inlineProjection) === stableJson(ledgerProjection);
    return {
        comparisonMode: "dual-read-parity",
        passed,
        mismatch: passed ? null : buildDualReadMismatch(),
    };
}

function projectKanjiBatchReport(report = {}) {
    const cards = Array.isArray(report.cards) ? report.cards : [];
    return {
        level: report.level,
        scope: report.scope,
        queue: report.queue,
        summary: report.summary,
        reviewRubricSummary: report.reviewRubricSummary,
        queueSamples: {
            nextMissingKanji: sampleValues(report.nextMissingKanji),
            nextSubstantiveRereviewKanji: sampleValues(report.nextSubstantiveRereviewKanji),
        },
        cards: cards.map((card) => ({
            kanji: card.kanji,
            reviewStatus: card.reviewStatus,
            existingStatuses: card.existingStatuses,
            hardChecksPassed: card.hardChecksPassed,
            generatedFailures: card.generatedFailures,
            riskFlags: card.riskFlags,
            reviewRubricResult: card.reviewRubric?.result,
            reviewRubricItemStatusCounts: card.reviewRubric?.itemStatusCounts,
        })),
    };
}

function projectKanjiPlatinumLevelReport(report = {}) {
    const results = Array.isArray(report.results) ? report.results : [];
    return {
        totalEntries: report.totalEntries,
        activePlatinumCount: report.activePlatinumCount,
        activePlatinumStatusCount: report.activePlatinumStatusCount,
        currentReviewStandard: report.currentReviewStandard,
        currentStandardPlatinumCount: report.currentStandardPlatinumCount,
        legacyOrUnversionedPlatinumCount: report.legacyOrUnversionedPlatinumCount,
        revalidationBacklogCount: report.revalidationBacklogCount,
        nonShippingCount: report.nonShippingCount,
        needsRevalidationCount: report.needsRevalidationCount,
        needsReviewCount: report.needsReviewCount,
        verificationLimitationCount: report.verificationLimitationCount,
        verificationLimitationKanjiCount: report.verificationLimitationKanjiCount,
        verificationLimitationFieldCounts: report.verificationLimitationFieldCounts,
        passedCount: report.passedCount,
        failedCount: report.failedCount,
        passed: report.passed,
        coverageFailures: report.coverageFailures,
        duplicateActiveEntries: report.duplicateActiveEntries,
        missingPlatinumRows: report.missingPlatinumRows,
        missingCurrentStandardRows: report.missingCurrentStandardRows,
        results: results.map((result) => ({
            kanji: result.kanji,
            status: result.status,
            passed: result.passed,
            failures: result.failures,
            verificationLimitations: result.verificationLimitations,
        })),
    };
}

function projectWordPlatinumLevelReport(report = {}) {
    const results = Array.isArray(report.results) ? report.results : [];
    return {
        totalEntries: report.totalEntries,
        activePlatinumCount: report.activePlatinumCount,
        currentReviewStandard: report.currentReviewStandard,
        currentStandardPlatinumCount: report.currentStandardPlatinumCount,
        legacyOrUnversionedPlatinumCount: report.legacyOrUnversionedPlatinumCount,
        nonShippingCount: report.nonShippingCount,
        needsReviewCount: report.needsReviewCount,
        verificationLimitationCount: report.verificationLimitationCount,
        verificationLimitationWordCount: report.verificationLimitationWordCount,
        verificationLimitationFieldCounts: report.verificationLimitationFieldCounts,
        passedCount: report.passedCount,
        failedCount: report.failedCount,
        passed: report.passed,
        coverageFailures: report.coverageFailures,
        duplicateActiveEntries: report.duplicateActiveEntries,
        missingPlatinumRows: report.missingPlatinumRows,
        missingCurrentStandardRows: report.missingCurrentStandardRows,
        results: results.map((result) => ({
            label: result.label,
            word: result.word,
            reading: result.reading,
            status: result.status,
            passed: result.passed,
            failures: result.failures,
            verificationLimitations: result.verificationLimitations,
        })),
    };
}

function projectKanjiRereviewStatusReport(report = {}) {
    const cards = Array.isArray(report.cards) ? report.cards : [];
    return {
        level: report.level,
        generatedRows: report.generatedRows,
        reviewEntries: report.reviewEntries,
        counts: report.counts,
        passed: report.passed,
        structuralReviewPassed: report.structuralReviewPassed,
        structuralCoverageFailures: report.structuralCoverageFailures,
        queueSamples: {
            proven: sampleKanji(cards, (card) => card.substantiveRereviewProven),
            needsSubstantiveRereview: sampleKanji(cards, (card) => card.needsSubstantiveRereview),
            blockedOrFailing: sampleKanji(cards, (card) => card.blockedOrFailing),
        },
        cards: cards.map((card) => ({
            kanji: card.kanji,
            status: card.status,
            structuralPassed: card.structuralPassed,
            substantiveRereviewProven: card.substantiveRereviewProven,
            needsSubstantiveRereview: card.needsSubstantiveRereview,
            blockedOrFailing: card.blockedOrFailing,
            reasons: card.reasons,
        })),
    };
}

function projectWordRereviewStatusReport(report = {}) {
    const cards = Array.isArray(report.cards) ? report.cards : [];
    return {
        level: report.level,
        generatedRows: report.generatedRows,
        reviewEntries: report.reviewEntries,
        counts: report.counts,
        passed: report.passed,
        structuralReviewPassed: report.structuralReviewPassed,
        structuralCoverageFailures: report.structuralCoverageFailures,
        queueSamples: {
            proven: sampleWordIdentities(cards, (card) => card.substantiveRereviewProven),
            needsSubstantiveRereview: sampleWordIdentities(cards, (card) => card.needsSubstantiveRereview),
            blockedOrFailing: sampleWordIdentities(cards, (card) => card.blockedOrFailing),
        },
        cards: cards.map((card) => ({
            identity: card.identity,
            word: card.word,
            reading: card.reading,
            status: card.status,
            structuralPassed: card.structuralPassed,
            substantiveRereviewProven: card.substantiveRereviewProven,
            needsSubstantiveRereview: card.needsSubstantiveRereview,
            blockedOrFailing: card.blockedOrFailing,
            reasons: card.reasons,
        })),
    };
}

function projectWordBatchReport(report = {}) {
    const cards = Array.isArray(report.cards) ? report.cards : [];
    return {
        level: report.level,
        scope: report.scope,
        queue: report.queue,
        scopedToRequestedWords: report.scopedToRequestedWords,
        summary: report.summary,
        requestedMissing: report.requestedMissing,
        queueSamples: {
            nextMissingWords: sampleValues(report.nextMissingWords),
            nextSubstantiveRereviewWords: sampleValues(report.nextSubstantiveRereviewWords),
        },
        cards: cards.map((card) => ({
            identity: card.identity,
            word: card.word,
            reading: card.reading,
            reviewStatus: card.reviewStatus,
            existingStatuses: card.existingStatuses,
            hardChecksPassed: card.hardChecksPassed,
            riskFlags: card.riskFlags,
            suggestedReviewStep: card.suggestedReviewStep,
        })),
    };
}

function projectWordCertificationStatusReport(summary = {}) {
    return {
        passed: summary.passed,
        currentReviewStandard: summary.currentReviewStandard,
        totals: summary.totals,
        certificationGate: summary.certificationGate,
        failureCount: summary.failureCount,
        levels: (summary.levels || []).map((levelReport) => ({
            level: levelReport.level,
            generatedRows: levelReport.generatedRows,
            reviewEntries: levelReport.reviewEntries,
            counts: levelReport.counts,
            passed: levelReport.passed,
            structuralReviewPassed: levelReport.structuralReviewPassed,
            structuralCoverageFailures: levelReport.structuralCoverageFailures,
        })),
        failures: (summary.failures || []).map((failure) => ({
            level: failure.level,
            card: failure.card,
            category: failure.category,
            field: failure.field,
            expected: failure.expected,
            actual: failure.actual,
            evidenceLane: failure.evidenceLane,
            reviewerAction: failure.reviewerAction,
        })),
    };
}

function projectPlatinumGovernanceGateReport(report = {}) {
    return {
        passed: report.passed,
        issues: report.issues,
        warnings: report.warnings,
        kanjiRereviewReports: (report.summaries?.kanjiRereviewReports || []).map(projectKanjiRereviewStatusReport),
        wordRereviewReports: (report.summaries?.wordRereviewReports || []).map(projectWordRereviewStatusReport),
        manifestPostures: report.summaries?.manifestPostures || [],
        wordSourcePostureSummary: report.summaries?.wordSourcePostureSummary || {},
    };
}

function buildPlatinumGovernanceGateProviderParityForLevel({
    rows = [],
    rawEntries = [],
    cwd = process.cwd(),
    ledgerDir,
    level = 3,
    sourceReviewSetPath,
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const inlineKanjiReport = buildPlatinumKanjiRereviewStatusReport({
        rows,
        entries: inlineProvider.entries,
        level,
    });
    const ledgerKanjiReport = buildPlatinumKanjiRereviewStatusReport({
        rows,
        entries: ledgerProvider.entries,
        level,
    });
    const inlineReport = evaluatePlatinumGovernanceGate({
        kanjiRereviewReports: [inlineKanjiReport],
        wordRereviewReports: [],
        wordSourcePostureSummary: { totals: {} },
        manifestPostures: [buildManifestGovernancePosture({
            kind: "kanji",
            level,
            entries: inlineProvider.entries,
        })],
    });
    const ledgerReport = evaluatePlatinumGovernanceGate({
        kanjiRereviewReports: [ledgerKanjiReport],
        wordRereviewReports: [],
        wordSourcePostureSummary: { totals: {} },
        manifestPostures: [buildManifestGovernancePosture({
            kind: "kanji",
            level,
            entries: ledgerProvider.entries,
        })],
    });
    const inlineProjection = projectPlatinumGovernanceGateReport(inlineReport);
    const ledgerProjection = projectPlatinumGovernanceGateReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineGate: {
                passed: inlineProjection.passed,
                issues: inlineProjection.issues,
                warnings: inlineProjection.warnings,
            },
            ledgerGate: {
                passed: ledgerProjection.passed,
                issues: ledgerProjection.issues,
                warnings: ledgerProjection.warnings,
            },
            inlineCounts: inlineProjection.kanjiRereviewReports[0]?.counts || {},
            ledgerCounts: ledgerProjection.kanjiRereviewReports[0]?.counts || {},
        }),
    });

    return {
        level,
        consumer: SUPPORTED_CONSUMERS.PLATINUM_GOVERNANCE_GATE,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildWordGovernanceInputsProviderParityForLevel({
    rows = [],
    rawEntries = [],
    goldenExpectations,
    sapphireEntries,
    sapphireResults,
    cwd = process.cwd(),
    ledgerDir,
    level = 5,
    sourceReviewSetPath,
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const reportOptions = {
        rows,
        level,
        goldenExpectations,
        sapphireEntries,
        sapphireResults,
        requireLanePreconditions: true,
        wordPitchAccentData,
        kanjiLevelData,
    };
    const inlineWordReport = buildPlatinumWordRereviewStatusReport({
        ...reportOptions,
        entries: inlineProvider.entries,
    });
    const ledgerWordReport = buildPlatinumWordRereviewStatusReport({
        ...reportOptions,
        entries: ledgerProvider.entries,
    });
    const inlineSourcePostureReport = buildPlatinumWordSourcePostureReport({
        entries: inlineProvider.entries,
        level,
    });
    const ledgerSourcePostureReport = buildPlatinumWordSourcePostureReport({
        entries: ledgerProvider.entries,
        level,
    });
    const inlineReport = evaluatePlatinumGovernanceGate({
        kanjiRereviewReports: [],
        wordRereviewReports: [inlineWordReport],
        wordSourcePostureSummary: buildPlatinumWordSourcePostureSummary([inlineSourcePostureReport]),
        manifestPostures: [buildManifestGovernancePosture({
            kind: "word",
            level,
            entries: inlineProvider.entries,
        })],
    });
    const ledgerReport = evaluatePlatinumGovernanceGate({
        kanjiRereviewReports: [],
        wordRereviewReports: [ledgerWordReport],
        wordSourcePostureSummary: buildPlatinumWordSourcePostureSummary([ledgerSourcePostureReport]),
        manifestPostures: [buildManifestGovernancePosture({
            kind: "word",
            level,
            entries: ledgerProvider.entries,
        })],
    });
    const inlineProjection = projectPlatinumGovernanceGateReport(inlineReport);
    const ledgerProjection = projectPlatinumGovernanceGateReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineGate: {
                passed: inlineProjection.passed,
                issues: inlineProjection.issues,
                warnings: inlineProjection.warnings,
            },
            ledgerGate: {
                passed: ledgerProjection.passed,
                issues: ledgerProjection.issues,
                warnings: ledgerProjection.warnings,
            },
            inlineCounts: inlineProjection.wordRereviewReports[0]?.counts || {},
            ledgerCounts: ledgerProjection.wordRereviewReports[0]?.counts || {},
            inlineCoverage: inlineProjection.wordSourcePostureSummary?.totals || {},
            ledgerCoverage: ledgerProjection.wordSourcePostureSummary?.totals || {},
        }),
    });

    return {
        level,
        deckKind: "word",
        consumer: SUPPORTED_CONSUMERS.WORD_GOVERNANCE_INPUTS,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildKanjiPlatinumLevelProviderParityForLevel({
    rows = [],
    rawEntries = [],
    cwd = process.cwd(),
    ledgerDir,
    level = 3,
    sourceReviewSetPath,
    requireCurrentReviewStandard = true,
    requireAllRows = true,
    allowEmpty = false,
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const reportOptions = {
        rows,
        level,
        requireCurrentReviewStandard,
        requireAllRows,
        allowEmpty,
    };
    const inlineReport = evaluatePlatinumKanjiReviewSet({
        ...reportOptions,
        entries: inlineProvider.entries,
    });
    const ledgerReport = evaluatePlatinumKanjiReviewSet({
        ...reportOptions,
        entries: ledgerProvider.entries,
    });
    const inlineProjection = projectKanjiPlatinumLevelReport(inlineReport);
    const ledgerProjection = projectKanjiPlatinumLevelReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineGate: {
                passed: inlineProjection.passed,
                passedCount: inlineProjection.passedCount,
                failedCount: inlineProjection.failedCount,
                coverageFailures: inlineProjection.coverageFailures,
            },
            ledgerGate: {
                passed: ledgerProjection.passed,
                passedCount: ledgerProjection.passedCount,
                failedCount: ledgerProjection.failedCount,
                coverageFailures: ledgerProjection.coverageFailures,
            },
            inlineFailedKanji: sampleValues(inlineProjection.results.filter((result) => !result.passed).map((result) => result.kanji)),
            ledgerFailedKanji: sampleValues(ledgerProjection.results.filter((result) => !result.passed).map((result) => result.kanji)),
        }),
    });

    return {
        level,
        consumer: SUPPORTED_CONSUMERS.KANJI_PLATINUM_LEVEL,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildWordPlatinumLevelProviderParityForLevel({
    rows = [],
    rawEntries = [],
    goldenExpectations,
    sapphireEntries,
    sapphireResults,
    cwd = process.cwd(),
    ledgerDir,
    level = 5,
    sourceReviewSetPath,
    wordPitchAccentData = {},
    kanjiLevelData = null,
    requireCurrentReviewStandard = true,
    requireAllRows = true,
    allowEmpty = false,
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const reportOptions = {
        rows,
        level,
        wordPitchAccentData,
        kanjiLevelData,
        goldenExpectations,
        requireGoldPrecondition: true,
        sapphireEntries,
        sapphireResults,
        requireSapphirePrecondition: true,
        requireCurrentReviewStandard,
        requireAllRows,
        allowEmpty,
    };
    const inlineReport = evaluatePlatinumWordReviewSet({
        ...reportOptions,
        entries: inlineProvider.entries,
    });
    const ledgerReport = evaluatePlatinumWordReviewSet({
        ...reportOptions,
        entries: ledgerProvider.entries,
    });
    const inlineProjection = projectWordPlatinumLevelReport(inlineReport);
    const ledgerProjection = projectWordPlatinumLevelReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineGate: {
                passed: inlineProjection.passed,
                passedCount: inlineProjection.passedCount,
                failedCount: inlineProjection.failedCount,
                coverageFailures: inlineProjection.coverageFailures,
            },
            ledgerGate: {
                passed: ledgerProjection.passed,
                passedCount: ledgerProjection.passedCount,
                failedCount: ledgerProjection.failedCount,
                coverageFailures: ledgerProjection.coverageFailures,
            },
            inlineFailedWords: sampleValues(inlineProjection.results.filter((result) => !result.passed).map((result) => result.label)),
            ledgerFailedWords: sampleValues(ledgerProjection.results.filter((result) => !result.passed).map((result) => result.label)),
        }),
    });

    return {
        level,
        deckKind: "word",
        consumer: SUPPORTED_CONSUMERS.WORD_PLATINUM_LEVEL,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function projectKanjiFieldSourceContract(contract = {}) {
    return {
        version: contract.version,
        contractType: contract.contractType,
        standard: contract.standard,
        checkedAt: contract.checkedAt,
        scope: contract.scope,
        sourceUse: contract.sourceUse,
        sourceFiles: contract.sourceFiles,
        provenancePolicy: contract.provenancePolicy,
        coverage: contract.coverage,
        entries: Object.fromEntries(Object.entries(contract.entries || {}).map(([kanji, entry]) => [
            kanji,
            {
                kanji: entry.kanji,
                level: entry.level,
                cardKey: entry.cardKey,
                fieldValues: entry.fieldValues,
                sourceOriginIds: entry.sourceOriginIds,
                fieldEvidence: entry.fieldEvidence,
                reviewBinding: entry.reviewBinding,
            },
        ])),
    };
}

function loadKanjiFieldSourceContractInputs({ cwd = process.cwd() } = {}) {
    return {
        jlptLevelContract: loadJlptLevelContract(path.join(cwd, "templates", "jlpt_level_contract.json")),
        platinumCardSourceManifest: loadPlatinumCardSourceManifest(path.join(cwd, "templates", "platinum_card_source_manifest.json")),
        sourceOriginEvidence: loadKanjiSourceOriginEvidence(path.join(cwd, "templates", "jlpt_kanji_source_evidence.json")),
    };
}

function buildSourceOriginIdsByKanji({ entries = [], sourceOriginEvidence = {} } = {}) {
    return Object.fromEntries((Array.isArray(entries) ? entries : []).map((entry) => [
        entry.kanji,
        resolveKanjiSourceOriginIdsForEntry({
            evidence: sourceOriginEvidence,
            entry,
        }),
    ]));
}

function buildKanjiFieldSourceContractFromEntries({
    entries = [],
    level = 3,
    sourceReviewSetPath = "",
    fieldSourceInputs = {},
} = {}) {
    return buildKanjiCardFieldSourceContract({
        jlptLevelContract: fieldSourceInputs.jlptLevelContract,
        platinumEntries: entries,
        platinumCardSourceManifest: fieldSourceInputs.platinumCardSourceManifest,
        sourceOriginIdsByKanji: buildSourceOriginIdsByKanji({
            entries,
            sourceOriginEvidence: fieldSourceInputs.sourceOriginEvidence,
        }),
        level,
        checkedAt: DEFAULT_CHECKED_AT,
        reviewSetPath: sourceReviewSetPath,
        jlptLevelContractPath: "templates/jlpt_level_contract.json",
        sourceManifestPath: "templates/platinum_card_source_manifest.json",
        sourceOriginEvidencePath: "templates/jlpt_kanji_source_evidence.json",
    });
}

function buildKanjiFieldSourceContractProviderParityForLevel({
    rawEntries = [],
    cwd = process.cwd(),
    ledgerDir,
    level = 3,
    sourceReviewSetPath,
    fieldSourceInputs = loadKanjiFieldSourceContractInputs({ cwd }),
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const inlineContract = buildKanjiFieldSourceContractFromEntries({
        entries: inlineProvider.entries,
        level,
        sourceReviewSetPath: inlineProvider.summary.sourceReviewSetPath,
        fieldSourceInputs,
    });
    const ledgerContract = buildKanjiFieldSourceContractFromEntries({
        entries: ledgerProvider.entries,
        level,
        sourceReviewSetPath: ledgerProvider.summary.sourceReviewSetPath,
        fieldSourceInputs,
    });
    const inlineProjection = projectKanjiFieldSourceContract(inlineContract);
    const ledgerProjection = projectKanjiFieldSourceContract(ledgerContract);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineCoverage: inlineProjection.coverage,
            ledgerCoverage: ledgerProjection.coverage,
            inlineRereviewBindings: Object.fromEntries(Object.entries(inlineProjection.entries || {}).map(([kanji, entry]) => [
                kanji,
                entry.reviewBinding,
            ])),
            ledgerRereviewBindings: Object.fromEntries(Object.entries(ledgerProjection.entries || {}).map(([kanji, entry]) => [
                kanji,
                entry.reviewBinding,
            ])),
        }),
    });

    return {
        level,
        consumer: SUPPORTED_CONSUMERS.KANJI_FIELD_SOURCE_CONTRACT,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildKanjiBatchReportProviderParityForLevel({
    rows = [],
    rawEntries = [],
    sapphireEntries = [],
    cwd = process.cwd(),
    ledgerDir,
    level = 3,
    sourceReviewSetPath,
    curatedStudyData = {},
    kanji = [],
    limit = 12,
    queue = KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
} = {}) {
    const queueMode = normalizeQueueMode(queue);
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const inlineReport = buildPlatinumKanjiBatchReport({
        rows,
        entries: inlineProvider.entries,
        sapphireEntries,
        level,
        kanji,
        limit,
        queue: queueMode,
        curatedStudyData,
    });
    const ledgerReport = buildPlatinumKanjiBatchReport({
        rows,
        entries: ledgerProvider.entries,
        sapphireEntries,
        level,
        kanji,
        limit,
        queue: queueMode,
        curatedStudyData,
    });
    const inlineProjection = projectKanjiBatchReport(inlineReport);
    const ledgerProjection = projectKanjiBatchReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineSummary: inlineProjection.summary,
            ledgerSummary: ledgerProjection.summary,
            inlineQueueSamples: inlineProjection.queueSamples,
            ledgerQueueSamples: ledgerProjection.queueSamples,
            inlineSelectedKanji: inlineProjection.cards.map((card) => card.kanji),
            ledgerSelectedKanji: ledgerProjection.cards.map((card) => card.kanji),
        }),
    });

    return {
        level,
        consumer: SUPPORTED_CONSUMERS.KANJI_BATCH_REPORT,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildKanjiRereviewStatusProviderParityForLevel({
    rows = [],
    rawEntries = [],
    cwd = process.cwd(),
    ledgerDir,
    level = 3,
    kanjiSourceEvidence,
    sourceReviewSetPath,
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "kanji",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const inlineReport = buildPlatinumKanjiRereviewStatusReport({
        rows,
        entries: inlineProvider.entries,
        level,
        kanjiSourceEvidence,
    });
    const ledgerReport = buildPlatinumKanjiRereviewStatusReport({
        rows,
        entries: ledgerProvider.entries,
        level,
        kanjiSourceEvidence,
    });
    const inlineProjection = projectKanjiRereviewStatusReport(inlineReport);
    const ledgerProjection = projectKanjiRereviewStatusReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineCounts: inlineProjection.counts,
            ledgerCounts: ledgerProjection.counts,
            inlineQueueSamples: inlineProjection.queueSamples,
            ledgerQueueSamples: ledgerProjection.queueSamples,
        }),
    });

    return {
        level,
        consumer: SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildWordRereviewStatusProviderParityForLevel({
    rows = [],
    rawEntries = [],
    goldenExpectations,
    sapphireEntries,
    sapphireResults,
    cwd = process.cwd(),
    ledgerDir,
    level = 5,
    sourceReviewSetPath,
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const reportOptions = {
        rows,
        level,
        goldenExpectations,
        sapphireEntries,
        sapphireResults,
        requireLanePreconditions: true,
        wordPitchAccentData,
        kanjiLevelData,
    };
    const inlineReport = buildPlatinumWordRereviewStatusReport({
        ...reportOptions,
        entries: inlineProvider.entries,
    });
    const ledgerReport = buildPlatinumWordRereviewStatusReport({
        ...reportOptions,
        entries: ledgerProvider.entries,
    });
    const inlineProjection = projectWordRereviewStatusReport(inlineReport);
    const ledgerProjection = projectWordRereviewStatusReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineCounts: inlineProjection.counts,
            ledgerCounts: ledgerProjection.counts,
            inlineQueueSamples: inlineProjection.queueSamples,
            ledgerQueueSamples: ledgerProjection.queueSamples,
        }),
    });

    return {
        level,
        deckKind: "word",
        consumer: SUPPORTED_CONSUMERS.WORD_REREVIEW_STATUS,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildWordBatchReportProviderParityForLevel({
    rows = [],
    rawEntries = [],
    goldenExpectations,
    sapphireEntries = [],
    sapphireResults,
    cwd = process.cwd(),
    ledgerDir,
    level = 5,
    sourceReviewSetPath,
    wordPitchAccentData = {},
    words = [],
    limit = 8,
    queue = WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
} = {}) {
    const queueMode = normalizeWordBatchQueueMode(queue);
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const reportOptions = {
        rows,
        goldenExpectations,
        sapphireEntries,
        sapphireResults,
        wordPitchAccentData,
        level,
        words,
        limit,
        queue: queueMode,
    };
    const inlineReport = buildPlatinumWordBatchReport({
        ...reportOptions,
        entries: inlineProvider.entries,
    });
    const ledgerReport = buildPlatinumWordBatchReport({
        ...reportOptions,
        entries: ledgerProvider.entries,
    });
    const inlineProjection = projectWordBatchReport(inlineReport);
    const ledgerProjection = projectWordBatchReport(ledgerReport);
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineSummary: inlineProjection.summary,
            ledgerSummary: ledgerProjection.summary,
            inlineQueueSamples: inlineProjection.queueSamples,
            ledgerQueueSamples: ledgerProjection.queueSamples,
            inlineSelectedWords: inlineProjection.cards.map((card) => card.identity),
            ledgerSelectedWords: ledgerProjection.cards.map((card) => card.identity),
        }),
    });

    return {
        level,
        deckKind: "word",
        consumer: SUPPORTED_CONSUMERS.WORD_BATCH_REPORT,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

function buildWordCertificationStatusProviderParityForLevel({
    rows = [],
    rawEntries = [],
    goldenExpectations,
    sapphireEntries,
    sapphireResults,
    cwd = process.cwd(),
    ledgerDir,
    level = 5,
    sourceReviewSetPath,
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    const inlineProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });
    const ledgerProvider = applyObsidianProofProvider({
        entries: rawEntries,
        cwd,
        ledgerDir,
        deckKind: "word",
        level,
        sourceReviewSetPath,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
    });
    const reportOptions = {
        rows,
        level,
        goldenExpectations,
        sapphireEntries,
        sapphireResults,
        requireLanePreconditions: true,
        wordPitchAccentData,
        kanjiLevelData,
    };
    const inlineRereviewReport = buildPlatinumWordRereviewStatusReport({
        ...reportOptions,
        entries: inlineProvider.entries,
    });
    const ledgerRereviewReport = buildPlatinumWordRereviewStatusReport({
        ...reportOptions,
        entries: ledgerProvider.entries,
    });
    const inlineProjection = projectWordCertificationStatusReport(
        buildObsidianWordCertificationStatusSummary([inlineRereviewReport])
    );
    const ledgerProjection = projectWordCertificationStatusReport(
        buildObsidianWordCertificationStatusSummary([ledgerRereviewReport])
    );
    const inlineProofCount = countInlineProofs(rawEntries);
    const parity = buildProviderParityOutcome({
        inlineProofCount,
        inlineProvider,
        ledgerProvider,
        inlineProjection,
        ledgerProjection,
        buildDualReadMismatch: () => ({
            inlineCounts: inlineProjection.totals,
            ledgerCounts: ledgerProjection.totals,
            inlineGate: {
                passed: inlineProjection.passed,
                failureCount: inlineProjection.failureCount,
                failures: inlineProjection.failures,
            },
            ledgerGate: {
                passed: ledgerProjection.passed,
                failureCount: ledgerProjection.failureCount,
                failures: ledgerProjection.failures,
            },
        }),
    });

    return {
        level,
        deckKind: "word",
        consumer: SUPPORTED_CONSUMERS.WORD_CERTIFY_STATUS,
        comparisonMode: parity.comparisonMode,
        passed: parity.passed,
        inlineProofCount,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: parity.mismatch,
    };
}

async function buildObsidianProofProviderParityReport({
    cwd = process.cwd(),
    levels = [3],
    consumer = SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS,
    deckKind = "kanji",
    kanji = [],
    words = [],
    limit = 12,
    queue = KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
    requireCurrentReviewStandard = true,
    requireAllRows = true,
    allowEmpty = false,
    rowSource = ROW_SOURCES.TRACKED_REVIEW_SET,
    config = loadConfig(),
} = {}) {
    assertSupportedConsumer(consumer);
    assertConsumerDeckKind({ consumer, deckKind });
    const normalizedRowSource = normalizeRowSource(rowSource);
    const scopes = [];
    const curatedStudyData = consumer === SUPPORTED_CONSUMERS.KANJI_BATCH_REPORT
        ? loadCuratedStudyData(config.curatedStudyDataPath)
        : {};
    const fieldSourceInputs = consumer === SUPPORTED_CONSUMERS.KANJI_FIELD_SOURCE_CONTRACT
        ? loadKanjiFieldSourceContractInputs({ cwd })
        : {};
    const wordPitchAccentData = [
        SUPPORTED_CONSUMERS.WORD_BATCH_REPORT,
        SUPPORTED_CONSUMERS.WORD_CERTIFY_STATUS,
        SUPPORTED_CONSUMERS.WORD_GOVERNANCE_INPUTS,
        SUPPORTED_CONSUMERS.WORD_PLATINUM_LEVEL,
        SUPPORTED_CONSUMERS.WORD_REREVIEW_STATUS,
    ].includes(consumer)
        ? loadWordPitchAccentData(path.join(cwd, "templates", "word_pitch_accent_data.json"))
        : {};

    for (const level of levels) {
        const rawReviewSet = loadReviewSetWithObsidianProof({
            cwd,
            deckKind,
            level,
            proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
        });
        const rows = await buildRowsForParity({
            level,
            deckKind,
            rowSource: normalizedRowSource,
            rawEntries: rawReviewSet.entries,
            config,
        });
        const wordPriorLaneInputs = deckKind === "word"
            ? loadWordPriorLaneInputs({ cwd, level, rows })
            : {};
        if (consumer === SUPPORTED_CONSUMERS.WORD_BATCH_REPORT) {
            scopes.push(buildWordBatchReportProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                ...wordPriorLaneInputs,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                wordPitchAccentData,
                words,
                limit,
                queue,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.WORD_CERTIFY_STATUS) {
            scopes.push(buildWordCertificationStatusProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                ...wordPriorLaneInputs,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                wordPitchAccentData,
                kanjiLevelData: null,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.WORD_REREVIEW_STATUS) {
            scopes.push(buildWordRereviewStatusProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                ...wordPriorLaneInputs,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                wordPitchAccentData,
                kanjiLevelData: null,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.WORD_PLATINUM_LEVEL) {
            scopes.push(buildWordPlatinumLevelProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                ...wordPriorLaneInputs,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                wordPitchAccentData,
                kanjiLevelData: null,
                requireCurrentReviewStandard,
                requireAllRows,
                allowEmpty,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.WORD_GOVERNANCE_INPUTS) {
            scopes.push(buildWordGovernanceInputsProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                ...wordPriorLaneInputs,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                wordPitchAccentData,
                kanjiLevelData: null,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.KANJI_BATCH_REPORT) {
            scopes.push(buildKanjiBatchReportProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                sapphireEntries: loadSapphireKanjiEntries({ cwd, level }),
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                curatedStudyData,
                kanji,
                limit,
                queue,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.KANJI_FIELD_SOURCE_CONTRACT) {
            scopes.push(buildKanjiFieldSourceContractProviderParityForLevel({
                rawEntries: rawReviewSet.entries,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                fieldSourceInputs,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.KANJI_PLATINUM_LEVEL) {
            scopes.push(buildKanjiPlatinumLevelProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                requireCurrentReviewStandard,
                requireAllRows,
                allowEmpty,
            }));
        } else if (consumer === SUPPORTED_CONSUMERS.PLATINUM_GOVERNANCE_GATE) {
            scopes.push(buildPlatinumGovernanceGateProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
            }));
        } else {
            scopes.push(buildKanjiRereviewStatusProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
            }));
        }
    }

    return {
        passed: scopes.every((scope) => scope.passed),
        consumer,
        deckKind,
        levels,
        rowSource: normalizedRowSource,
        scopes,
    };
}

function formatObsidianProofProviderParityReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Obsidian Proof Provider Dual-Read Parity",
        "",
        `Consumer: ${report.consumer || SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS}`,
        `Deck kind: ${report.deckKind || "kanji"}`,
        `Levels: ${(report.levels || []).map((level) => `N${level}`).join(", ") || "(none)"}`,
        `Row source: ${report.rowSource || ROW_SOURCES.TRACKED_REVIEW_SET}`,
        `Result: ${report.passed ? "passing" : "failing"}`,
        "",
        "Parity contract:",
        "- During dual-read transition, inline rereviewProvenance and canonical JSONL-derived rereviewProvenance must produce identical consumer counts.",
        "- After inline proof is removed, canonical ledger integrity must prove every scoped ledger event binds to a tracked review-set entry, with older same-target events explicitly counted as superseded proof history.",
        "- Queue samples, selected cards, classifications, and card-level Obsidian statuses must match before a consumer is switched.",
        "- Word batch report queue samples, selected word identities, summaries, review statuses, and risk flags must match before deck:words:platinum:batch reads the proof provider by default.",
        "- Word certification status totals, zero-failure gate posture, and failure objects must match before deck:words:obsidian:certify-status reads the proof provider by default.",
        "- Word Platinum level gate structural projections must match before deck:words:platinum:n<level> reads the proof provider by default.",
        "- Platinum governance gate word rereview, word source posture, and manifest projections must match before deck:platinum:governance-gate reads word proof through the provider.",
        "- Structural Platinum gate projections must match before deck:platinum:n<level> reads the proof provider by default.",
        "- Kanji card-field source contract projections must match before data:build:kanji-field-source-contract reads the proof provider by default.",
        "- Platinum governance gate kanji proof-provider projections must match before deck:platinum:governance-gate reads the proof provider by default.",
        "- tracked-review-set row source is CI-safe proof-provider parity; generated row source is local live-row parity and may require ignored data/* inputs.",
        "- This command does not certify cards, repair proof, read generated TSV/APKG output, or claim release readiness.",
    ];

    for (const scope of report.scopes || []) {
        lines.push(
            "",
            `${scope.deckKind || "kanji"}:N${scope.level}`,
            `- Result: ${scope.passed ? "passing" : "failing"}`,
            `- Comparison mode: ${scope.comparisonMode || "dual-read-parity"}`,
            `- Source entries: ${scope.inlineProvider?.sourceEntries || 0}`,
            `- Inline proofs in source: ${scope.inlineProofCount || 0}`,
            `- Ledger proof events: ${scope.ledgerProvider?.ledgerProofEvents || 0}`,
            `- Ledger proof targets: ${scope.ledgerProvider?.ledgerProofTargets || scope.ledgerProvider?.ledgerProofEvents || 0}`,
            `- Ledger proofs applied: ${scope.ledgerProvider?.ledgerProofsApplied || 0}`,
            `- Superseded ledger events: ${scope.ledgerProvider?.ledgerProofEventsSuperseded || 0}`,
            `- Inline proofs omitted by ledger provider: ${scope.ledgerProvider?.inlineProofsOmitted || 0}`
        );
        if (!scope.passed && scope.mismatch) {
            lines.push(
                `- Inline counts: ${JSON.stringify(scope.mismatch.inlineCounts || scope.mismatch.inlineSummary)}`,
                `- Ledger counts: ${JSON.stringify(scope.mismatch.ledgerCounts || scope.mismatch.ledgerSummary)}`,
                `- Inline gate: ${JSON.stringify(scope.mismatch.inlineGate || {})}`,
                `- Ledger gate: ${JSON.stringify(scope.mismatch.ledgerGate || {})}`,
                `- Inline queue samples: ${JSON.stringify(scope.mismatch.inlineQueueSamples)}`,
                `- Ledger queue samples: ${JSON.stringify(scope.mismatch.ledgerQueueSamples)}`,
                `- Inline selected kanji: ${JSON.stringify(scope.mismatch.inlineSelectedKanji || [])}`,
                `- Ledger selected kanji: ${JSON.stringify(scope.mismatch.ledgerSelectedKanji || [])}`,
                `- Inline selected words: ${JSON.stringify(scope.mismatch.inlineSelectedWords || [])}`,
                `- Ledger selected words: ${JSON.stringify(scope.mismatch.ledgerSelectedWords || [])}`,
                `- Inline failed kanji: ${JSON.stringify(scope.mismatch.inlineFailedKanji || [])}`,
                `- Ledger failed kanji: ${JSON.stringify(scope.mismatch.ledgerFailedKanji || [])}`,
                `- Inline failed words: ${JSON.stringify(scope.mismatch.inlineFailedWords || [])}`,
                `- Ledger failed words: ${JSON.stringify(scope.mismatch.ledgerFailedWords || [])}`,
                `- Inline coverage: ${JSON.stringify(scope.mismatch.inlineCoverage || {})}`,
                `- Ledger coverage: ${JSON.stringify(scope.mismatch.ledgerCoverage || {})}`,
                `- Inline governance gate: ${JSON.stringify(scope.mismatch.inlineGate || {})}`,
                `- Ledger governance gate: ${JSON.stringify(scope.mismatch.ledgerGate || {})}`
            );
        }
    }

    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:obsidian:proof:provider-parity", options.unknownArgs);
    const report = await buildObsidianProofProviderParityReport({
        levels: options.levels,
        consumer: options.consumer,
        deckKind: options.deckKind,
        kanji: options.kanji,
        words: options.words,
        limit: options.limit,
        queue: options.queue,
        requireCurrentReviewStandard: options.requireCurrentReviewStandard,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
        rowSource: options.rowSource,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianProofProviderParityReport(report));
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    ROW_SOURCES,
    SUPPORTED_CONSUMERS,
    buildKanjiBatchReportProviderParityForLevel,
    buildKanjiFieldSourceContractProviderParityForLevel,
    buildKanjiPlatinumLevelProviderParityForLevel,
    buildKanjiRereviewStatusProviderParityForLevel,
    buildObsidianProofProviderParityReport,
    buildPlatinumGovernanceGateProviderParityForLevel,
    buildTrackedReviewSetRows,
    buildTrackedWordReviewSetRows,
    buildWordBatchReportProviderParityForLevel,
    buildWordCertificationStatusProviderParityForLevel,
    buildWordGovernanceInputsProviderParityForLevel,
    buildWordPlatinumLevelProviderParityForLevel,
    buildWordRereviewStatusProviderParityForLevel,
    formatObsidianProofProviderParityReport,
    main,
    normalizeRowSource,
    parseArgs,
    projectKanjiFieldSourceContract,
    projectKanjiBatchReport,
    projectKanjiPlatinumLevelReport,
    projectKanjiRereviewStatusReport,
    projectWordBatchReport,
    projectWordCertificationStatusReport,
    projectWordPlatinumLevelReport,
    projectWordRereviewStatusReport,
    projectPlatinumGovernanceGateReport,
};
