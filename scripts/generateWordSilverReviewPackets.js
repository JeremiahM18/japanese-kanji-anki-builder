"use strict";

const path = require("node:path");

const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadJlptWordSourceEvidence } = require("../src/datasets/jlptWordSourceEvidence");
const { loadWordSourceManifest } = require("../src/datasets/wordSourceManifest");
const {
    auditJlptWordSourceEvidence,
    buildSourceAccessReport,
    buildSourceAdequacyByLevel,
} = require("../src/services/jlptWordSourceEvidenceService");
const {
    DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
    DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    buildExtraSourceAccessByLevel,
    buildWordCommonExpansionSelectorReport,
    normalizeCommonPoolQueueMode,
} = require("../src/services/wordCommonExpansionSelectorService");
const { normalizePlacementMode } = require("../src/services/wordCandidateAgreementService");
const {
    WORD_SILVER_PACKET_SCHEMA_VERSION,
    buildWordSilverReviewPacketArtifact,
    formatWordSilverReviewPacketMarkdown,
    writeWordSilverReviewPacketArtifact,
} = require("../src/services/wordSilverReviewPipelineService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    loadSharedInputs,
    loadTriageDecisionsByLevelSource,
    resolveManifestPath,
} = require("./reportWordCandidateAgreement");
const {
    buildSelectorManifestForSource,
    hasStrictFailure,
    validateCommonPoolOptions,
    validateLevels,
} = require("./reportWordCommonExpansionSelector");
const { buildWordExpansionSignalReport } = require("./reportWordExpansionSignals");

const DEFAULT_PACKET_DIR = "out/word-silver-review-packets";

function parseArgs(argv) {
    const options = {
        batchId: "",
        dryRun: false,
        json: false,
        markdown: false,
        levels: [5, 4, 3, 2, 1],
        limit: 25,
        manifest: DEFAULT_WORD_SOURCE_MANIFEST,
        out: "",
        markdownOut: "",
        placementMode: "vocabulary-level",
        source: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        commonPoolLimit: DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
        commonPoolMode: "editorial",
        frequencySource: "tubelex-ja-frequency",
        queueMode: "silver",
        sourceEvidence: "templates/jlpt_word_source_evidence.json",
        strict: false,
        triage: "templates/word_inventory_expansion_triage.json",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--dry-run") {
            options.dryRun = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg === "--markdown") {
            options.markdown = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--batch-id=")) {
            options.batchId = parseStringOption(arg, "batch-id").trim();
        } else if (arg.startsWith("--level=")) {
            options.levels = [parseNumericOption(arg, "level")];
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels").map((level) => Number(level));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--manifest=")) {
            options.manifest = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--out=")) {
            options.out = parseStringOption(arg, "out").trim();
        } else if (arg.startsWith("--markdown-out=")) {
            options.markdownOut = parseStringOption(arg, "markdown-out").trim();
        } else if (arg.startsWith("--placement-mode=")) {
            options.placementMode = parseStringOption(arg, "placement-mode").trim();
        } else if (arg.startsWith("--placement=")) {
            options.placementMode = parseStringOption(arg, "placement").trim();
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source").trim();
        } else if (arg.startsWith("--candidate-source=")) {
            options.source = parseStringOption(arg, "candidate-source").trim();
        } else if (arg.startsWith("--common-pool-limit=")) {
            options.commonPoolLimit = parseNumericOption(arg, "common-pool-limit");
        } else if (arg.startsWith("--pool-limit=")) {
            options.commonPoolLimit = parseNumericOption(arg, "pool-limit");
        } else if (arg.startsWith("--common-pool-mode=")) {
            options.commonPoolMode = parseStringOption(arg, "common-pool-mode").trim();
        } else if (arg.startsWith("--pool-mode=")) {
            options.commonPoolMode = parseStringOption(arg, "pool-mode").trim();
        } else if (arg.startsWith("--queue=")) {
            options.queueMode = parseStringOption(arg, "queue").trim();
        } else if (arg.startsWith("--queue-mode=")) {
            options.queueMode = parseStringOption(arg, "queue-mode").trim();
        } else if (arg.startsWith("--frequency-source=")) {
            options.frequencySource = parseStringOption(arg, "frequency-source").trim();
        } else if (arg.startsWith("--source-evidence=")) {
            options.sourceEvidence = parseStringOption(arg, "source-evidence").trim();
        } else if (arg.startsWith("--triage=")) {
            options.triage = parseStringOption(arg, "triage").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolveBatchId(options) {
    if (options.batchId) {
        return options.batchId;
    }

    const levelLabel = options.levels.map((level) => `n${level}`).join("-");
    const sourceLabel = options.source || "configured-source";
    return `word-silver-${sourceLabel}-${options.queueMode}-${levelLabel}`;
}

function resolvePacketOutPath(options) {
    if (options.out) {
        return path.resolve(process.cwd(), options.out);
    }

    return path.resolve(process.cwd(), DEFAULT_PACKET_DIR, `${resolveBatchId(options)}.json`);
}

function buildSelectorReport(options) {
    validateLevels(options.levels);
    validateCommonPoolOptions(options);

    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Word Silver packet limit must be a positive integer.");
    }

    const manifest = loadWordSourceManifest(resolveManifestPath(options.manifest));
    const expansionSignalReport = buildWordExpansionSignalReport({ levels: options.levels });
    const readingExpansionSignalsByLevel = Object.fromEntries(
        expansionSignalReport.signals.map((signal) => [signal.level, signal])
    );
    const sharedInputs = loadSharedInputs();
    const wordSourceEvidence = loadJlptWordSourceEvidence(
        path.resolve(process.cwd(), options.sourceEvidence)
    );
    const selectorManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence,
        sourceId: options.source,
        levels: options.levels,
        commonPoolLimit: options.commonPoolLimit,
        commonPoolMode: options.commonPoolMode,
        frequencySource: options.frequencySource,
        queueMode: normalizeCommonPoolQueueMode(options.queueMode),
    });
    const wordSourceEvidenceReport = auditJlptWordSourceEvidence({
        contract: loadJlptWordLevelContract(
            path.join(process.cwd(), "templates", "jlpt_word_level_contract.json")
        ),
        evidence: wordSourceEvidence,
        limit: Number.MAX_SAFE_INTEGER,
    });
    const sourceAccessReport = buildSourceAccessReport({
        evidence: wordSourceEvidence,
    });

    return buildWordCommonExpansionSelectorReport({
        levels: options.levels,
        manifest: selectorManifest,
        limit,
        placementMode: normalizePlacementMode(options.placementMode),
        triageDecisionsByLevelSource: loadTriageDecisionsByLevelSource(options.triage),
        readingExpansionSignalsByLevel,
        sourceAdequacyByLevel: buildSourceAdequacyByLevel(wordSourceEvidenceReport),
        extraSourceAccessByLevel: buildExtraSourceAccessByLevel({
            sourceAccessReport,
            manifest,
            levels: options.levels,
        }),
        enforceReadingExpansionGate: true,
        includeRoutingSupportLevels: !options.source,
        ...sharedInputs,
    });
}

function buildPacket(options) {
    const selectorReport = buildSelectorReport(options);
    return {
        selectorReport,
        packet: buildWordSilverReviewPacketArtifact({
            selectorReport,
            batchId: resolveBatchId(options),
            limit: Number(options.limit),
            queueMode: options.queueMode,
            placementMode: options.placementMode,
            source: options.source,
        }),
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:silver:packets", options.unknownArgs);

    const { selectorReport, packet } = buildPacket(options);
    const outPath = resolvePacketOutPath(options);
    const markdownPath = options.markdownOut
        ? path.resolve(process.cwd(), options.markdownOut)
        : outPath.replace(/\.json$/i, ".md");

    if (!options.dryRun) {
        writeWordSilverReviewPacketArtifact({
            packet,
            outPath,
            markdownPath,
            writeMarkdown: options.markdown,
        });
    }

    if (options.json) {
        process.stdout.write(
            `${JSON.stringify({
                schemaVersion: WORD_SILVER_PACKET_SCHEMA_VERSION,
                batchId: packet.batchId,
                dryRun: options.dryRun,
                outPath,
                markdownPath: options.markdown ? markdownPath : null,
                totals: packet.totals,
                selectorHadStrictFailure: hasStrictFailure(selectorReport),
            }, null, 2)}\n`
        );
    } else if (options.dryRun && options.markdown) {
        process.stdout.write(formatWordSilverReviewPacketMarkdown(packet));
    } else {
        process.stdout.write(
            [
                `Word Silver review packet: ${packet.batchId}`,
                `Schema: ${packet.schemaVersion}`,
                `Rows: ${packet.totals.rows}`,
                `Mode: ${options.dryRun ? "dry-run" : "write"}`,
                `JSON: ${outPath}`,
                options.markdown ? `Markdown: ${markdownPath}` : "Markdown: not requested",
                "Authority: packet only; no tracked templates, card approval, source proof, or release evidence.",
            ].join("\n") + "\n"
        );
    }

    if (options.strict && hasStrictFailure(selectorReport)) {
        throw new Error("Word Silver packet selector strict mode failed.");
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_PACKET_DIR,
    buildPacket,
    buildSelectorReport,
    main,
    parseArgs,
    resolveBatchId,
    resolvePacketOutPath,
};
