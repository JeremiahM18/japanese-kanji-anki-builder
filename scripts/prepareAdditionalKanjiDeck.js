const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { loadGovernedComponentMap, pickMainComponent } = require("../src/datasets/kradfile");
const { createInferenceEngine } = require("../src/inference/inferenceEngine");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { createExportService } = require("../src/services/exportService");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { buildDeckPackage } = require("../src/services/deckPackageService");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const {
    CANDIDATE_SCOPES,
    buildKanjiDeckPartitionPlan,
} = require("../src/services/kanjiDeckPartitionPlanService");
const {
    ADDITIONAL_KANJI_DECK_KIND,
    annotateAdditionalKanjiTsv,
    buildAdditionalJlptDataset,
    buildAdditionalKanjiExportPath,
    parseTsv,
    selectPhysicalAdditionalEntries,
} = require("../src/services/additionalKanjiDeckService");
const {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_INPUTS,
    buildSourceLevelDeltaReportFromPaths,
} = require("./auditJlptKanjiSourceLevelDeltas");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        candidateScope: CANDIDATE_SCOPES.ALL_SOURCE_CLAIMS,
        concurrency: null,
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        includeDisputed: false,
        json: false,
        levels: [5, 4, 3, 2, 1],
        outDir: null,
        sourceInputs: DEFAULT_SOURCE_INPUTS,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--include-disputed") {
            options.includeDisputed = true;
        } else if (arg.startsWith("--candidate-scope=")) {
            options.candidateScope = parseStringOption(arg, "candidate-scope");
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = parseNumericOption(arg, "concurrency");
        } else if (arg.startsWith("--contract=")) {
            options.contract = parseStringOption(arg, "contract");
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = parseStringOption(arg, "evidence");
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else if (arg.startsWith("--source-inputs=")) {
            options.sourceInputs = parseStringOption(arg, "source-inputs");
        } else if (arg === "--no-source-inputs") {
            options.sourceInputs = null;
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, text) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, text, "utf8");
}

function countBlankFields(tsv, fieldName) {
    const parsed = parseTsv(tsv);
    const fieldIndex = parsed.header.indexOf(fieldName);
    if (fieldIndex === -1) {
        throw new Error(`Generated additional kanji TSV is missing ${fieldName} field.`);
    }
    return parsed.rows.filter((row) => !String(row[fieldIndex] || "").trim()).length;
}

function buildEmptyTsv() {
    return loadAnkiNoteSchema().fieldNames.join("\t");
}

function buildEntriesByKanji(entries = []) {
    return new Map(entries.map((entry) => [entry.kanji, entry]));
}

function resolveExistingPath(filePath, label) {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Missing ${label}: ${resolvedPath}`);
    }
    return resolvedPath;
}

function formatReport(summary) {
    const lines = [
        "Japanese Kanji Builder Additional Kanji Deck Ready",
        "",
        `Output directory: ${summary.outDir}`,
        `Package directory: ${summary.package.rootDir}`,
        `Anki package: ${summary.package.ankiPackage.filePath || "skipped"}`,
        `Candidate scope: ${summary.candidateScope}`,
        `Disputed rows included: ${summary.includeDisputed ? "yes" : "no"}`,
        `Raw additional claims: ${summary.rawAdditionalEntries}`,
        `Selected unique additional cards: ${summary.selectedAdditionalEntries}`,
        `Quarantined duplicate kanji: ${summary.quarantinedDuplicateKanji}`,
        `Quarantined duplicate claims: ${summary.quarantinedDuplicateClaims}`,
        "",
        "Exports:",
    ];

    for (const row of summary.exports) {
        lines.push(
            `- additional_unverified_N${row.level}: ${row.rows} rows; `
            + `blank audio ${row.blankAudioRows}; blank stroke-order ${row.blankStrokeOrderRows}`
        );
    }

    lines.push(
        "",
        "Packaged media:",
        `- Unique packaged media files: ${summary.package.mediaAssetCount}`,
        `- Stroke-order field references: ${summary.package.mediaCounts.strokeOrder}`,
        `- Audio fields: ${summary.package.mediaCounts.audio}`
    );

    if (summary.blankAudioRows > 0 || summary.blankStrokeOrderRows > 0) {
        lines.push("", "Result: failing");
        lines.push("Next step: acquire missing kanji media, then rerun this command.");
    } else {
        lines.push("", "Result: passing");
        lines.push("Next step: run additional-kanji golden review before release use.");
    }

    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:kanji:additional:ready", options.unknownArgs);

    const config = loadConfig();
    const outDir = path.resolve(options.outDir || path.join(config.buildOutDir, "additional_unverified"));
    const exportsDir = path.join(outDir, "exports");
    fs.rmSync(exportsDir, { recursive: true, force: true });
    ensureDir(exportsDir);

    const contractPath = resolveExistingPath(options.contract, "JLPT level contract");
    const evidencePath = resolveExistingPath(options.evidence, "JLPT kanji source evidence file");
    const sourceInputsPath = options.sourceInputs
        ? resolveExistingPath(options.sourceInputs, "JLPT kanji source input config")
        : null;
    const { contract, report: deltaReport } = buildSourceLevelDeltaReportFromPaths({
        contractPath,
        evidencePath,
        sourceInputsPath,
    });
    const plan = buildKanjiDeckPartitionPlan({
        contract,
        deltaReport,
        levels: options.levels,
        includeDisputed: options.includeDisputed,
        candidateScope: options.candidateScope,
    });
    const physicalSelection = selectPhysicalAdditionalEntries(plan.additionalDecks);
    const selectedLevels = options.levels;

    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const kradMap = loadGovernedComponentMap({
        kanjiComponentContractPath: config.kanjiComponentContractPath,
        kradfilePath: config.kradfilePath,
    });
    const inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData });
    const exportService = createExportService({ inferenceEngine, curatedStudyData, sentenceCorpus });
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const concurrency = options.concurrency || config.exportConcurrency;

    const exports = [];
    const kanjiByLevel = {};
    for (const level of selectedLevels) {
        const entries = physicalSelection.entriesByLevel.get(level) || [];
        const additionalDataset = buildAdditionalJlptDataset({
            baseJlptOnlyJson: jlptOnlyJson,
            entries,
        });
        const rawTsv = entries.length > 0
            ? await exportService.buildTsvForJlptLevel({
                levelNumber: level,
                jlptOnlyJson: additionalDataset,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                strokeOrderService,
                audioService,
                concurrency,
            })
            : buildEmptyTsv();
        const tsv = annotateAdditionalKanjiTsv({
            tsv: rawTsv,
            entriesByKanji: buildEntriesByKanji(entries),
        });
        const filePath = buildAdditionalKanjiExportPath(outDir, level);
        writeTextFile(filePath, `${tsv}\n`);
        kanjiByLevel[level] = entries.map((entry) => entry.kanji);
        exports.push({
            level,
            filePath,
            rows: entries.length,
            blankAudioRows: countBlankFields(tsv, "Audio"),
            blankStrokeOrderRows: countBlankFields(tsv, "StrokeOrder"),
            mediaKanji: entries.map((entry) => entry.kanji),
        });
    }

    const deckPackage = await buildDeckPackage({
        outDir,
        exports,
        kanjiByLevel,
        mediaRootDir: config.mediaRootDir,
        strokeOrderService,
        audioService,
        deckKind: ADDITIONAL_KANJI_DECK_KIND,
    });
    const blankAudioRows = exports.reduce((sum, row) => sum + row.blankAudioRows, 0);
    const blankStrokeOrderRows = exports.reduce((sum, row) => sum + row.blankStrokeOrderRows, 0);
    const summary = {
        outDir,
        candidateScope: options.candidateScope,
        includeDisputed: options.includeDisputed,
        rawAdditionalEntries: plan.additionalDecks.reduce((sum, deck) => sum + deck.count, 0),
        selectedAdditionalEntries: physicalSelection.selectedEntries.length,
        excludedDuplicateClaims: physicalSelection.excludedDuplicateClaims.length,
        quarantinedDuplicateKanji: physicalSelection.quarantinedDuplicateKanji.length,
        quarantinedDuplicateClaims: physicalSelection.quarantinedDuplicateClaims.length,
        exports,
        blankAudioRows,
        blankStrokeOrderRows,
        package: {
            rootDir: deckPackage.rootDir,
            mediaAssetCount: deckPackage.mediaAssetCount,
            mediaCounts: deckPackage.mediaCounts,
            ankiPackage: deckPackage.ankiPackage,
        },
    };

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        process.stdout.write(formatReport(summary));
    }

    if (blankAudioRows > 0 || blankStrokeOrderRows > 0) {
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
    formatReport,
    main,
    parseArgs,
};
