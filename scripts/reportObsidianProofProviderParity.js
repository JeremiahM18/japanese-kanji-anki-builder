const {
    loadConfig,
} = require("../src/config");
const {
    parseLevelsArgument,
} = require("../src/services/buildPipeline");
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
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildKanjiRowsForLevel,
} = require("./reviewPlatinumKanjiLevel");

const SUPPORTED_CONSUMERS = Object.freeze({
    KANJI_REREVIEW_STATUS: "kanji-rereview-status",
});

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
        levels: [3],
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--consumer=")) {
            options.consumer = parseStringOption(arg, "consumer");
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
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

function sampleKanji(cards = [], predicate, limit = 24) {
    return cards
        .filter(predicate)
        .map((card) => card.kanji)
        .filter(Boolean)
        .slice(0, limit);
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
    config = loadConfig(),
} = {}) {
    assertSupportedConsumer(consumer);
    const scopes = [];

    for (const level of levels) {
        const rawReviewSet = loadReviewSetWithObsidianProof({
            cwd,
            deckKind: "kanji",
            level,
            proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
        });
        const rows = await buildKanjiRowsForLevel({ level, config });
        scopes.push(buildKanjiRereviewStatusProviderParityForLevel({
            rows,
            rawEntries: rawReviewSet.entries,
            cwd,
            level,
            sourceReviewSetPath: rawReviewSet.summary.sourceReviewSetPath,
        }));
    }

    return {
        passed: scopes.every((scope) => scope.passed),
        consumer,
        levels,
        scopes,
    };
}

function formatObsidianProofProviderParityReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Obsidian Proof Provider Dual-Read Parity",
        "",
        `Consumer: ${report.consumer || SUPPORTED_CONSUMERS.KANJI_REREVIEW_STATUS}`,
        `Levels: ${(report.levels || []).map((level) => `N${level}`).join(", ") || "(none)"}`,
        `Result: ${report.passed ? "passing" : "failing"}`,
        "",
        "Parity contract:",
        "- Inline rereviewProvenance and canonical JSONL-derived rereviewProvenance must produce identical consumer counts.",
        "- Queue samples, blocked/failing classifications, and card-level Obsidian statuses must match before a consumer is switched.",
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
                `- Inline counts: ${JSON.stringify(scope.mismatch.inlineCounts)}`,
                `- Ledger counts: ${JSON.stringify(scope.mismatch.ledgerCounts)}`,
                `- Inline queue samples: ${JSON.stringify(scope.mismatch.inlineQueueSamples)}`,
                `- Ledger queue samples: ${JSON.stringify(scope.mismatch.ledgerQueueSamples)}`
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
    SUPPORTED_CONSUMERS,
    buildKanjiRereviewStatusProviderParityForLevel,
    buildObsidianProofProviderParityReport,
    formatObsidianProofProviderParityReport,
    main,
    parseArgs,
    projectKanjiRereviewStatusReport,
};
