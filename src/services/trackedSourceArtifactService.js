const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadJlptLevelContract } = require("../datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { loadSentenceCorpus } = require("../datasets/sentenceCorpus");
const { loadWordPitchAccentData } = require("../datasets/wordPitchAccentData");
const { loadWordStudyData } = require("../datasets/wordStudyData");
const { createWordExportService } = require("./wordExportService");
const { ensureDir } = require("../utils/fs");

const N5_TRACKED_SOURCE_ARTIFACT_SCOPE = Object.freeze({
    type: "n5-tracked-source-word-tsv",
    level: 5,
    validates: [
        "fresh N5 word TSV generation from tracked templates only",
        "word note schema header",
        "canonical N5 word row count",
        "canonical-only word governance",
        "deterministic repeated TSV output",
        "network-disabled word artifact generation",
    ],
    doesNotValidate: [
        "tracked-source kanji TSV artifacts",
        "fresh .apkg product artifacts",
        "managed media packaging or listening QA",
        "manual Anki import review",
        "mobile or screen-reader QA",
    ],
    sourceBoundary: "Uses tracked templates and generated in-memory JLPT level data only; ignored local data/ word, sentence, JLPT, cache, and media inputs are not read.",
    followUp: "Add tracked rich kanji source data and managed media provenance before extending this checkpoint to kanji TSV and .apkg artifacts.",
});

function sha256Text(text) {
    return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function parseTsvHeader(tsv) {
    const [header = ""] = String(tsv || "").split(/\r?\n/, 1);
    return header.split("\t");
}

function countTsvRows(tsv) {
    const lines = String(tsv || "").trim().split(/\r?\n/).filter(Boolean);
    return Math.max(0, lines.length - 1);
}

function buildJlptOnlyJsonFromContract(jlptLevelContract = {}) {
    return Object.fromEntries(
        Object.entries(jlptLevelContract.kanjiLevels || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([kanji, level]) => [kanji, { jlpt: level }])
    );
}

function createNetworkDisabledKanjiApiClient() {
    return {
        async getKanji(kanji) {
            throw new Error(`Network inference is disabled for tracked-source artifact generation: ${kanji}`);
        },

        async getWords(kanji) {
            throw new Error(`Network inference is disabled for tracked-source artifact generation: ${kanji}`);
        },
    };
}

function buildDefaultTrackedSourcePaths({ cwd = process.cwd() } = {}) {
    const templateDir = path.join(cwd, "templates");
    return {
        jlptLevelContractPath: path.join(templateDir, "jlpt_level_contract.json"),
        jlptWordLevelContractPath: path.join(templateDir, "jlpt_word_level_contract.json"),
        starterSentenceCorpusPath: path.join(templateDir, "starter_sentence_corpus.json"),
        starterWordStudyDataPath: path.join(templateDir, "starter_word_study_data.json"),
        wordPitchAccentDataPath: path.join(templateDir, "word_pitch_accent_data.json"),
    };
}

function evaluateWordArtifact({
    tsv,
    repeatTsv,
    governance = {},
    expectedHeader,
    expectedCanonicalRows,
} = {}) {
    const failures = [];
    const header = parseTsvHeader(tsv);
    const rowCount = countTsvRows(tsv);
    const deterministic = String(tsv || "") === String(repeatTsv || "");

    if (JSON.stringify(header) !== JSON.stringify(expectedHeader || [])) {
        failures.push("word TSV header does not match the tracked word note schema");
    }
    if (rowCount !== expectedCanonicalRows) {
        failures.push(`word TSV row count ${rowCount} did not match expected canonical rows ${expectedCanonicalRows}`);
    }
    if ((governance.canonicalRows || 0) !== expectedCanonicalRows) {
        failures.push(`canonical row count ${governance.canonicalRows || 0} did not match expected ${expectedCanonicalRows}`);
    }
    if ((governance.curatedOnlyRows || 0) !== 0) {
        failures.push(`curated-only rows must not ship from the tracked-source N5 word artifact: ${governance.curatedOnlyRows}`);
    }
    if ((governance.inferredOnlyRows || 0) !== 0) {
        failures.push(`inferred-only rows must not ship from the tracked-source N5 word artifact: ${governance.inferredOnlyRows}`);
    }
    if (!deterministic) {
        failures.push("repeated tracked-source word TSV generation was not deterministic");
    }

    return {
        passed: failures.length === 0,
        failures,
        rowCount,
        header,
        deterministic,
        sha256: sha256Text(tsv),
        repeatSha256: sha256Text(repeatTsv),
        governance: {
            rowCount: governance.rowCount || 0,
            canonicalRows: governance.canonicalRows || 0,
            curatedOnlyRows: governance.curatedOnlyRows || 0,
            inferredOnlyRows: governance.inferredOnlyRows || 0,
        },
    };
}

async function buildTrackedSourceWordArtifact({
    level = 5,
    cwd = process.cwd(),
    outDir = path.join(process.cwd(), "out", "product-readiness", "n5-tracked-source"),
    paths = buildDefaultTrackedSourcePaths({ cwd }),
    createWordExportServiceFn = createWordExportService,
    createKanjiApiClientFn = createNetworkDisabledKanjiApiClient,
} = {}) {
    if (level !== 5) {
        throw new Error("Tracked-source artifact checkpoint currently supports N5 only.");
    }

    const jlptLevelContract = loadJlptLevelContract(paths.jlptLevelContractPath);
    const jlptWordLevelContract = loadJlptWordLevelContract(paths.jlptWordLevelContractPath);
    const jlptOnlyJson = buildJlptOnlyJsonFromContract(jlptLevelContract);
    const sentenceCorpus = loadSentenceCorpus(paths.starterSentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(null);
    const wordStudyData = loadWordStudyData({
        localPath: null,
        starterPath: paths.starterWordStudyDataPath,
    });
    const wordPitchAccentData = loadWordPitchAccentData(paths.wordPitchAccentDataPath);
    const wordExportService = createWordExportServiceFn({
        sentenceCorpus,
        curatedStudyData,
        wordStudyData,
        wordPitchAccentData,
    });
    const kanjiApiClient = createKanjiApiClientFn();
    const buildOptions = {
        levelNumber: level,
        jlptOnlyJson,
        jlptWordLevelContract,
        kanjiApiClient,
        strokeOrderService: null,
        audioService: null,
        includeInferred: false,
        concurrency: 8,
    };
    const result = await wordExportService.buildWordTsvForJlptLevel(buildOptions);
    const repeatResult = await wordExportService.buildWordTsvForJlptLevel(buildOptions);
    const expectedCanonicalRows = jlptWordLevelContract.inventoryCounts[String(level)] || 0;
    const expectedHeader = loadAnkiNoteSchema("word").fieldNames;
    const evaluation = evaluateWordArtifact({
        tsv: result.tsv,
        repeatTsv: repeatResult.tsv,
        governance: result.governance,
        expectedHeader,
        expectedCanonicalRows,
    });

    const rootDir = path.resolve(outDir);
    const exportsDir = path.join(rootDir, "exports");
    const reportsDir = path.join(rootDir, "reports");
    const wordTsvPath = path.join(exportsDir, `jlpt-n${level}-words.tsv`);
    const summaryPath = path.join(reportsDir, "tracked-source-artifact-summary.json");

    ensureDir(exportsDir);
    ensureDir(reportsDir);
    fs.writeFileSync(wordTsvPath, `${result.tsv}\n`, "utf8");

    const summary = {
        generatedAt: new Date().toISOString(),
        passed: evaluation.passed,
        scope: N5_TRACKED_SOURCE_ARTIFACT_SCOPE,
        outDir: rootDir,
        artifacts: {
            wordTsvPath,
            wordTsvSha256: evaluation.sha256,
        },
        sourceFiles: paths,
        word: evaluation,
    };

    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    return {
        ...summary,
        reports: {
            summaryPath,
        },
    };
}

function formatTrackedSourceArtifactReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder N5 Tracked-Source Artifact Checkpoint",
        "",
        `Overall result: ${report.passed ? "passing" : "failing"}`,
        `Scope: ${report.scope?.type || "unknown"}`,
        `Source boundary: ${report.scope?.sourceBoundary || "not specified"}`,
        "",
        "Word TSV:",
        `- rows: ${report.word?.rowCount || 0}`,
        `- canonical rows: ${report.word?.governance?.canonicalRows || 0}`,
        `- curated-only rows: ${report.word?.governance?.curatedOnlyRows || 0}`,
        `- inferred-only rows: ${report.word?.governance?.inferredOnlyRows || 0}`,
        `- deterministic repeat: ${report.word?.deterministic ? "yes" : "no"}`,
        `- sha256: ${report.word?.sha256 || ""}`,
        `- output: ${report.artifacts?.wordTsvPath || ""}`,
    ];

    if (Array.isArray(report.word?.failures) && report.word.failures.length > 0) {
        lines.push("", "Failures:", ...report.word.failures.map((failure) => `- ${failure}`));
    }

    lines.push(
        "",
        "Does not validate:",
        ...(report.scope?.doesNotValidate || []).map((item) => `- ${item}`),
        "",
        `Follow-up: ${report.scope?.followUp || "not specified"}`
    );

    return `${lines.join("\n")}\n`;
}

module.exports = {
    N5_TRACKED_SOURCE_ARTIFACT_SCOPE,
    buildDefaultTrackedSourcePaths,
    buildJlptOnlyJsonFromContract,
    buildTrackedSourceWordArtifact,
    createNetworkDisabledKanjiApiClient,
    evaluateWordArtifact,
    formatTrackedSourceArtifactReport,
    parseTsvHeader,
};
