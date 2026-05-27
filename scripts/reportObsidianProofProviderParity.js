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
    buildPlatinumKanjiRereviewStatusReport,
} = require("../src/services/platinumKanjiRereviewStatusService");
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
} = require("./reviewPlatinumKanjiLevel");

const SUPPORTED_CONSUMERS = Object.freeze({
    KANJI_BATCH_REPORT: "kanji-batch-report",
    KANJI_REREVIEW_STATUS: "kanji-rereview-status",
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
    const options = {
        consumer: SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS,
        json: false,
        kanji: [],
        levels: [3],
        limit: 12,
        queue: KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
        rowSource: ROW_SOURCES.TRACKED_REVIEW_SET,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--consumer=")) {
            options.consumer = parseStringOption(arg, "consumer");
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
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
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

async function buildRowsForParity({ level, rowSource, rawEntries, config } = {}) {
    const normalizedRowSource = normalizeRowSource(rowSource);
    if (normalizedRowSource === ROW_SOURCES.GENERATED) {
        return buildKanjiRowsForLevel({ level, config });
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

function buildKanjiBatchReportProviderParityForLevel({
    rows = [],
    rawEntries = [],
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
        level,
        kanji,
        limit,
        queue: queueMode,
        curatedStudyData,
    });
    const ledgerReport = buildPlatinumKanjiBatchReport({
        rows,
        entries: ledgerProvider.entries,
        level,
        kanji,
        limit,
        queue: queueMode,
        curatedStudyData,
    });
    const inlineProjection = projectKanjiBatchReport(inlineReport);
    const ledgerProjection = projectKanjiBatchReport(ledgerReport);
    const passed = stableJson(inlineProjection) === stableJson(ledgerProjection);

    return {
        level,
        consumer: SUPPORTED_CONSUMERS.KANJI_BATCH_REPORT,
        passed,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: passed ? null : {
            inlineSummary: inlineProjection.summary,
            ledgerSummary: ledgerProjection.summary,
            inlineQueueSamples: inlineProjection.queueSamples,
            ledgerQueueSamples: ledgerProjection.queueSamples,
            inlineSelectedKanji: inlineProjection.cards.map((card) => card.kanji),
            ledgerSelectedKanji: ledgerProjection.cards.map((card) => card.kanji),
        },
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
    const passed = stableJson(inlineProjection) === stableJson(ledgerProjection);

    return {
        level,
        consumer: SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS,
        passed,
        inlineProvider: inlineProvider.summary,
        ledgerProvider: ledgerProvider.summary,
        inlineProjection,
        ledgerProjection,
        mismatch: passed ? null : {
            inlineCounts: inlineProjection.counts,
            ledgerCounts: ledgerProjection.counts,
            inlineQueueSamples: inlineProjection.queueSamples,
            ledgerQueueSamples: ledgerProjection.queueSamples,
        },
    };
}

async function buildObsidianProofProviderParityReport({
    cwd = process.cwd(),
    levels = [3],
    consumer = SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS,
    kanji = [],
    limit = 12,
    queue = KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
    rowSource = ROW_SOURCES.TRACKED_REVIEW_SET,
    config = loadConfig(),
} = {}) {
    assertSupportedConsumer(consumer);
    const normalizedRowSource = normalizeRowSource(rowSource);
    const scopes = [];
    const curatedStudyData = consumer === SUPPORTED_CONSUMERS.KANJI_BATCH_REPORT
        ? loadCuratedStudyData(config.curatedStudyDataPath)
        : {};

    for (const level of levels) {
        const rawReviewSet = loadReviewSetWithObsidianProof({
            cwd,
            deckKind: "kanji",
            level,
            proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
        });
        const rows = await buildRowsForParity({
            level,
            rowSource: normalizedRowSource,
            rawEntries: rawReviewSet.entries,
            config,
        });
        if (consumer === SUPPORTED_CONSUMERS.KANJI_BATCH_REPORT) {
            scopes.push(buildKanjiBatchReportProviderParityForLevel({
                rows,
                rawEntries: rawReviewSet.entries,
                cwd,
                level,
                sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
                curatedStudyData,
                kanji,
                limit,
                queue,
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
        `Levels: ${(report.levels || []).map((level) => `N${level}`).join(", ") || "(none)"}`,
        `Row source: ${report.rowSource || ROW_SOURCES.TRACKED_REVIEW_SET}`,
        `Result: ${report.passed ? "passing" : "failing"}`,
        "",
        "Parity contract:",
        "- Inline rereviewProvenance and canonical JSONL-derived rereviewProvenance must produce identical consumer counts.",
        "- Queue samples, selected cards, classifications, and card-level Obsidian statuses must match before a consumer is switched.",
        "- tracked-review-set row source is CI-safe proof-provider parity; generated row source is local live-row parity and may require ignored data/* inputs.",
        "- This command does not certify cards, repair proof, read generated TSV/APKG output, or claim release readiness.",
    ];

    for (const scope of report.scopes || []) {
        lines.push(
            "",
            `kanji:N${scope.level}`,
            `- Result: ${scope.passed ? "passing" : "failing"}`,
            `- Source entries: ${scope.inlineProvider?.sourceEntries || 0}`,
            `- Ledger proof events: ${scope.ledgerProvider?.ledgerProofEvents || 0}`,
            `- Ledger proofs applied: ${scope.ledgerProvider?.ledgerProofsApplied || 0}`,
            `- Inline proofs omitted by ledger provider: ${scope.ledgerProvider?.inlineProofsOmitted || 0}`
        );
        if (!scope.passed && scope.mismatch) {
            lines.push(
                `- Inline counts: ${JSON.stringify(scope.mismatch.inlineCounts || scope.mismatch.inlineSummary)}`,
                `- Ledger counts: ${JSON.stringify(scope.mismatch.ledgerCounts || scope.mismatch.ledgerSummary)}`,
                `- Inline queue samples: ${JSON.stringify(scope.mismatch.inlineQueueSamples)}`,
                `- Ledger queue samples: ${JSON.stringify(scope.mismatch.ledgerQueueSamples)}`,
                `- Inline selected kanji: ${JSON.stringify(scope.mismatch.inlineSelectedKanji || [])}`,
                `- Ledger selected kanji: ${JSON.stringify(scope.mismatch.ledgerSelectedKanji || [])}`
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
        kanji: options.kanji,
        limit: options.limit,
        queue: options.queue,
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
    buildKanjiRereviewStatusProviderParityForLevel,
    buildObsidianProofProviderParityReport,
    buildTrackedReviewSetRows,
    formatObsidianProofProviderParityReport,
    main,
    normalizeRowSource,
    parseArgs,
    projectKanjiBatchReport,
    projectKanjiRereviewStatusReport,
};
