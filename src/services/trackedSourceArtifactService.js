const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const {
    auditKanjiCardFieldSourceContract,
    loadKanjiCardFieldSourceContract,
} = require("../datasets/kanjiCardFieldSourceContract");
const {
    auditKanjiReadingReferenceContract,
    loadKanjiReadingReferenceContract,
} = require("../datasets/kanjiReadingReferenceContract");
const { countComponentCoverageForLevel, loadKanjiComponentContract } = require("../datasets/kanjiComponentContract");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadJlptLevelContract } = require("../datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { loadPlatinumCardSourceManifest } = require("../datasets/platinumCardSourceManifest");
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

const N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE = Object.freeze({
    type: "n5-tracked-source-kanji-preflight",
    level: 5,
    validates: [
        "tracked source availability for N5 kanji TSV certification",
        "JLPT kanji inventory count from tracked contract",
        "absence of silent certification when governed card-field source data is incomplete",
    ],
    doesNotValidate: [
        "fresh tracked-source kanji TSV generation",
        "fresh .apkg product artifacts",
        "managed media packaging or listening QA",
        "manual Anki import review",
        "mobile or screen-reader QA",
    ],
    sourceBoundary: "Inspects tracked templates only; ignored local data/ kanji, KRAD, cache, and media inputs are not read.",
    followUp: "Pair this preflight with fresh tracked-source kanji TSV generation, .apkg packaging, managed media QA, and manual import review before public release.",
});

function buildTrackedKanjiCertificationRequirements({
    componentsTracked = false,
    readingsTracked = false,
    richSourceProvenanceTracked = false,
} = {}) {
    return [
        {
            id: "jlpt-level",
            label: "tracked JLPT kanji level",
            trackedToday: true,
            source: "templates/jlpt_level_contract.json",
        },
        {
            id: "meaning",
            label: "learner-facing kanji meaning",
            trackedToday: true,
            source: "templates/starter_curated_study_data*.json",
        },
        {
            id: "on-readings",
            label: "explicit on-yomi readings",
            trackedToday: readingsTracked,
            source: readingsTracked
                ? "templates/kanji_reading_reference_contract.json"
                : "currently derived from local kanji input or API fallback",
        },
        {
            id: "kun-readings",
            label: "explicit kun-yomi readings",
            trackedToday: readingsTracked,
            source: readingsTracked
                ? "templates/kanji_reading_reference_contract.json"
                : "currently derived from local kanji input or API fallback",
        },
        {
            id: "components",
            label: "component/radical source data",
            trackedToday: componentsTracked,
            source: componentsTracked
                ? "templates/kanji_component_contract.json"
                : "currently derived from local KRAD-style input",
        },
        {
            id: "rich-source-provenance",
            label: "rich kanji source provenance",
            trackedToday: richSourceProvenanceTracked,
            source: richSourceProvenanceTracked
                ? "templates/kanji_card_field_source_contract.json"
                : "no tracked release contract yet",
        },
    ];
}

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
        starterCuratedStudyDataPath: path.join(templateDir, "starter_curated_study_data.json"),
        starterSentenceCorpusPath: path.join(templateDir, "starter_sentence_corpus.json"),
        starterWordStudyDataPath: path.join(templateDir, "starter_word_study_data.json"),
        wordPitchAccentDataPath: path.join(templateDir, "word_pitch_accent_data.json"),
        kanjiComponentContractPath: path.join(templateDir, "kanji_component_contract.json"),
        kanjiReadingReferenceContractPath: path.join(templateDir, "kanji_reading_reference_contract.json"),
        kanjiCardFieldSourceContractPath: path.join(templateDir, "kanji_card_field_source_contract.json"),
        platinumCardSourceManifestPath: path.join(templateDir, "platinum_card_source_manifest.json"),
    };
}

function countKanjiByLevel(jlptLevelContract = {}, level = 5) {
    return Object.values(jlptLevelContract.kanjiLevels || {})
        .filter((entryLevel) => Number(entryLevel) === Number(level))
        .length;
}

function countCuratedMeaningsForLevel(jlptLevelContract = {}, curatedStudyData = {}, level = 5) {
    return Object.entries(jlptLevelContract.kanjiLevels || {})
        .filter(([, entryLevel]) => Number(entryLevel) === Number(level))
        .filter(([kanji]) => Boolean(curatedStudyData[kanji]?.englishMeaning))
        .length;
}

function countReadingReferenceEntriesForLevel(jlptLevelContract = {}, readingReferenceContract = null, level = 5) {
    const targetKanji = Object.entries(jlptLevelContract.kanjiLevels || {})
        .filter(([, entryLevel]) => Number(entryLevel) === Number(level))
        .map(([kanji]) => kanji);
    const entries = readingReferenceContract?.entries || {};
    const covered = targetKanji.filter((kanji) => entries[kanji]);
    const withOnReading = covered.filter((kanji) => entries[kanji].onReadings.length > 0);
    const withKunReading = covered.filter((kanji) => entries[kanji].kunReadings.length > 0);

    return {
        expected: targetKanji.length,
        covered: covered.length,
        missing: targetKanji.length - covered.length,
        withOnReading: withOnReading.length,
        withKunReading: withKunReading.length,
    };
}

function countCardFieldSourceEntriesForLevel(jlptLevelContract = {}, fieldSourceContract = null, level = 5) {
    const targetKanji = Object.entries(jlptLevelContract.kanjiLevels || {})
        .filter(([, entryLevel]) => Number(entryLevel) === Number(level))
        .map(([kanji]) => kanji);
    const entries = fieldSourceContract?.entries || {};
    const covered = targetKanji.filter((kanji) => entries[kanji]);

    return {
        expected: targetKanji.length,
        covered: covered.length,
        missing: targetKanji.length - covered.length,
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

function evaluateTrackedSourceKanjiPreflight({
    jlptLevelContract = {},
    curatedStudyData = {},
    componentContract = null,
    readingReferenceContract = null,
    readingReferenceAudit = null,
    fieldSourceContract = null,
    fieldSourceAudit = null,
    level = 5,
} = {}) {
    const expectedKanji = jlptLevelContract.inventoryCounts?.[String(level)] || 0;
    const contractKanji = countKanjiByLevel(jlptLevelContract, level);
    const curatedMeanings = countCuratedMeaningsForLevel(jlptLevelContract, curatedStudyData, level);
    const componentCoverage = componentContract
        ? countComponentCoverageForLevel({ componentContract, jlptLevelContract, level })
        : { expected: contractKanji, covered: 0, missing: contractKanji };
    const readingReferenceCoverage = countReadingReferenceEntriesForLevel(
        jlptLevelContract,
        readingReferenceContract,
        level
    );
    const fieldSourceCoverage = countCardFieldSourceEntriesForLevel(
        jlptLevelContract,
        fieldSourceContract,
        level
    );
    const readingsTracked = Boolean(
        readingReferenceContract
        && readingReferenceAudit?.passed
        && readingReferenceCoverage.expected > 0
        && readingReferenceCoverage.missing === 0
    );
    const richSourceProvenanceTracked = Boolean(
        fieldSourceContract
        && fieldSourceAudit?.passed
        && fieldSourceCoverage.expected > 0
        && fieldSourceCoverage.missing === 0
    );
    const requirements = buildTrackedKanjiCertificationRequirements({
        componentsTracked: componentCoverage.expected > 0 && componentCoverage.missing === 0,
        readingsTracked,
        richSourceProvenanceTracked,
    });
    const missingRequirements = requirements
        .filter((requirement) => !requirement.trackedToday);
    const failures = [];

    if (contractKanji !== expectedKanji) {
        failures.push(`tracked JLPT N${level} kanji count ${contractKanji} did not match inventory count ${expectedKanji}`);
    }
    if (readingReferenceAudit && !readingReferenceAudit.passed) {
        failures.push(...readingReferenceAudit.failures.map((failure) => `kanji reading reference: ${failure}`));
    }
    if (fieldSourceAudit && !fieldSourceAudit.passed) {
        failures.push(...fieldSourceAudit.failures.map((failure) => `kanji card field source: ${failure}`));
    }

    return {
        passed: failures.length === 0,
        certifiable: failures.length === 0 && missingRequirements.length === 0,
        failures,
        blockers: missingRequirements.map((requirement) => ({
            id: requirement.id,
            label: requirement.label,
            currentSource: requirement.source,
        })),
        requirements: requirements.map((requirement) => ({ ...requirement })),
        counts: {
            expectedKanji,
            contractKanji,
            curatedMeanings,
            componentContractKanji: componentCoverage.covered,
            readingReferenceKanji: readingReferenceCoverage.covered,
            readingReferenceMissing: readingReferenceCoverage.missing,
            readingReferenceWithOnReading: readingReferenceCoverage.withOnReading,
            readingReferenceWithKunReading: readingReferenceCoverage.withKunReading,
            cardFieldSourceKanji: fieldSourceCoverage.covered,
            cardFieldSourceMissing: fieldSourceCoverage.missing,
            missingTrackedRequirements: missingRequirements.length,
        },
    };
}

function buildTrackedSourceKanjiPreflight({
    level = 5,
    cwd = process.cwd(),
    paths = buildDefaultTrackedSourcePaths({ cwd }),
} = {}) {
    if (level !== 5) {
        throw new Error("Tracked-source kanji preflight currently supports N5 only.");
    }

    const jlptLevelContract = loadJlptLevelContract(paths.jlptLevelContractPath);
    const curatedStudyData = loadCuratedStudyData(null, {
        starterPath: paths.starterCuratedStudyDataPath,
    });
    const componentContract = loadKanjiComponentContract(paths.kanjiComponentContractPath);
    const readingReferenceContract = loadKanjiReadingReferenceContract(paths.kanjiReadingReferenceContractPath);
    const fieldSourceContract = loadKanjiCardFieldSourceContract(paths.kanjiCardFieldSourceContractPath);
    const platinumCardSourceManifest = loadPlatinumCardSourceManifest(paths.platinumCardSourceManifestPath);
    const readingReferenceAudit = auditKanjiReadingReferenceContract({
        readingReferenceContract,
        jlptLevelContract,
        platinumCardSourceManifest,
    });
    const fieldSourceAudit = auditKanjiCardFieldSourceContract({
        fieldSourceContract,
        jlptLevelContract,
        platinumCardSourceManifest,
        readingReferenceContract,
        level,
    });
    const evaluation = evaluateTrackedSourceKanjiPreflight({
        jlptLevelContract,
        curatedStudyData,
        componentContract,
        readingReferenceContract,
        readingReferenceAudit,
        fieldSourceContract,
        fieldSourceAudit,
        level,
    });

    return {
        generatedAt: new Date().toISOString(),
        passed: evaluation.passed,
        certifiable: evaluation.certifiable,
        scope: N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE,
        sourceFiles: {
            jlptLevelContractPath: paths.jlptLevelContractPath,
            starterCuratedStudyDataPath: paths.starterCuratedStudyDataPath,
            kanjiComponentContractPath: paths.kanjiComponentContractPath,
            kanjiReadingReferenceContractPath: paths.kanjiReadingReferenceContractPath,
            kanjiCardFieldSourceContractPath: paths.kanjiCardFieldSourceContractPath,
            platinumCardSourceManifestPath: paths.platinumCardSourceManifestPath,
        },
        kanji: evaluation,
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
    const curatedStudyData = loadCuratedStudyData(null, {
        starterPath: paths.starterCuratedStudyDataPath,
    });
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

function formatTrackedSourceKanjiPreflightReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder N5 Tracked-Source Kanji Preflight",
        "",
        `Preflight result: ${report.passed ? "complete" : "failing"}`,
        `Tracked-source kanji TSV certifiable: ${report.certifiable ? "yes" : "no"}`,
        `Scope: ${report.scope?.type || "unknown"}`,
        `Source boundary: ${report.scope?.sourceBoundary || "not specified"}`,
        "",
        "Tracked inventory:",
        `- expected N5 kanji: ${report.kanji?.counts?.expectedKanji || 0}`,
        `- contract N5 kanji: ${report.kanji?.counts?.contractKanji || 0}`,
        `- starter curated meanings: ${report.kanji?.counts?.curatedMeanings || 0}`,
        `- component contract entries: ${report.kanji?.counts?.componentContractKanji || 0}`,
        `- reading reference entries: ${report.kanji?.counts?.readingReferenceKanji || 0}`,
        `- card field source entries: ${report.kanji?.counts?.cardFieldSourceKanji || 0}`,
        "",
        "Certification requirements:",
        ...(report.kanji?.requirements || []).map((requirement) => `- ${requirement.trackedToday ? "tracked" : "blocked"}: ${requirement.label} (${requirement.source})`),
    ];

    if (Array.isArray(report.kanji?.failures) && report.kanji.failures.length > 0) {
        lines.push("", "Failures:", ...report.kanji.failures.map((failure) => `- ${failure}`));
    }

    if (Array.isArray(report.kanji?.blockers) && report.kanji.blockers.length > 0) {
        lines.push(
            "",
            "Certification blockers:",
            ...report.kanji.blockers.map((blocker) => `- ${blocker.label}: ${blocker.currentSource}`)
        );
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
    N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE,
    buildJlptOnlyJsonFromContract,
    buildTrackedSourceKanjiPreflight,
    buildTrackedSourceWordArtifact,
    countCardFieldSourceEntriesForLevel,
    countReadingReferenceEntriesForLevel,
    evaluateTrackedSourceKanjiPreflight,
    evaluateWordArtifact,
    formatTrackedSourceArtifactReport,
    formatTrackedSourceKanjiPreflightReport,
};
