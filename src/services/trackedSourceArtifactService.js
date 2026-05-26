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
const { pickMainComponent } = require("../datasets/kradfile");
const { createWordExportService } = require("./wordExportService");
const { ensureDir } = require("../utils/fs");
const { escapeHtml, labelKunReading, labelOnReading, tsvEscape } = require("../utils/text");
const { normalizeJapaneseReading } = require("../utils/japanese");

const JLPT_LEVELS = Object.freeze([5, 4, 3, 2, 1]);

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

function buildTrackedSourceKanjiPreflightScope(level = 5) {
    return Object.freeze({
        type: `n${level}-tracked-source-kanji-preflight`,
        level,
        validates: [
            `tracked source availability for N${level} kanji TSV certification`,
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
}

function buildTrackedSourceKanjiTsvScope(level = 5) {
    return Object.freeze({
        type: `n${level}-tracked-source-kanji-tsv`,
        level,
        validates: [
            `fresh N${level} kanji TSV generation from governed tracked source contracts only`,
            "kanji note schema header",
            "canonical JLPT kanji row count from the tracked level contract",
            "primary reading presence in the governed reading-reference contract",
            "card-field provenance from the governed kanji field-source contract",
            "deterministic repeated TSV output",
            "network-disabled source-derived artifact generation",
        ],
        doesNotValidate: [
            "fresh .apkg product artifacts",
            "managed media packaging or listening QA",
            "manual Anki import review",
            "mobile or screen-reader QA",
            "Obsidian rereview proof",
        ],
        sourceBoundary: "Uses tracked JLPT, reading-reference, card-field source, and component contracts only; ignored local data/ kanji, KRAD, cache, and media inputs are not read.",
        followUp: "Run the tracked-source kanji release QA gate, then package APKG/media artifacts and complete manual import, mobile, screen-reader, and listening QA before public release.",
    });
}

const TRACKED_SOURCE_KANJI_RELEASE_QA_SCOPE = Object.freeze({
    type: "tracked-source-kanji-release-qa",
    levels: JLPT_LEVELS,
    validates: [
        "per-level tracked-source kanji TSV artifact presence",
        "fail-closed APKG/media/manual QA readiness posture",
        "absence of release-ready claims when packaging or human QA evidence is missing",
    ],
    doesNotValidate: [
        "automatic APKG import success",
        "automatic mobile review",
        "automatic screen-reader review",
        "automatic listening QA",
        "VOICEVOX or Docker runtime status",
    ],
    sourceBoundary: "Reads tracked-source kanji artifact summaries and tracked contracts only; ignored local source data and media caches are not release truth.",
    followUp: "Add governed APKG/media/manual QA evidence before any kanji level can be called release-ready.",
});

const N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE = buildTrackedSourceKanjiPreflightScope(5);
const N5_TRACKED_SOURCE_KANJI_TSV_SCOPE = buildTrackedSourceKanjiTsvScope(5);

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

function parseTsvRows(tsv) {
    const lines = String(tsv || "").trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(1).map((line) => line.split("\t"));
}

function normalizeTrackedSourceLevel(level = 5) {
    const normalized = Number(level);
    if (!JLPT_LEVELS.includes(normalized)) {
        throw new Error(`Unsupported JLPT level for tracked-source kanji artifact gate: ${level}`);
    }
    return normalized;
}

function normalizeTrackedSourceLevels({ level = null, levels = null } = {}) {
    if (Array.isArray(levels) && levels.length > 0) {
        return [...new Set(levels.map(normalizeTrackedSourceLevel))];
    }
    if (level !== null && level !== undefined) {
        return [normalizeTrackedSourceLevel(level)];
    }
    return [...JLPT_LEVELS];
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

function auditKanjiCardFieldSourceContractForLevel({
    fieldSourceContract = {},
    jlptLevelContract = {},
    platinumCardSourceManifest = {},
    readingReferenceContract = null,
    level = 5,
} = {}) {
    const contractLevel = Number(fieldSourceContract.scope?.level);
    if (Number.isInteger(contractLevel) && contractLevel !== Number(level)) {
        const expected = listKanjiForLevel(jlptLevelContract, level).length;
        return {
            passed: false,
            failures: [
                `Kanji card field source contract is scoped to N${contractLevel}, not N${level}.`,
            ],
            counts: {
                expectedKanji: expected,
                entries: 0,
                missing: expected,
                extra: 0,
            },
        };
    }

    return auditKanjiCardFieldSourceContract({
        fieldSourceContract,
        jlptLevelContract,
        platinumCardSourceManifest,
        readingReferenceContract,
        level,
    });
}

function listKanjiForLevel(jlptLevelContract = {}, level = 5) {
    return Object.entries(jlptLevelContract.kanjiLevels || {})
        .filter(([, entryLevel]) => Number(entryLevel) === Number(level))
        .map(([kanji]) => kanji)
        .sort((a, b) => a.localeCompare(b, "ja"));
}

function buildReadingReferenceSet(readingReferenceEntry = {}) {
    return new Set([
        ...(readingReferenceEntry.onReadings || []),
        ...(readingReferenceEntry.kunReadings || []),
        ...(readingReferenceEntry.normalizedOnReadings || []),
        ...(readingReferenceEntry.normalizedKunReadings || []),
    ].map((reading) => normalizeJapaneseReading(reading)).filter(Boolean));
}

function formatKanjiSourceDerivedTsv({
    level = 5,
    expectedHeader = loadAnkiNoteSchema("kanji").fieldNames,
    jlptLevelContract = {},
    componentContract = {},
    readingReferenceContract = {},
    fieldSourceContract = {},
} = {}) {
    const rows = [expectedHeader.join("\t")];
    const components = componentContract.components || {};
    const readingEntries = readingReferenceContract.entries || {};
    const fieldEntries = fieldSourceContract.entries || {};

    for (const kanji of listKanjiForLevel(jlptLevelContract, level)) {
        const readingEntry = readingEntries[kanji];
        const fieldEntry = fieldEntries[kanji];
        if (!readingEntry || !fieldEntry) {
            throw new Error(`Cannot build N${level} tracked-source kanji TSV row for ${kanji}: missing governed source contract entry.`);
        }

        const primaryReading = String(fieldEntry.fieldValues?.primaryReading || "").trim();
        const primaryMeaning = String(fieldEntry.fieldValues?.primaryMeaning || "").trim();
        const readingReferenceSet = buildReadingReferenceSet(readingEntry);
        if (!readingReferenceSet.has(normalizeJapaneseReading(primaryReading))) {
            throw new Error(`Cannot build N${level} tracked-source kanji TSV row for ${kanji}: primary reading is not in the governed reading-reference contract.`);
        }

        rows.push([
            kanji,
            kanji,
            primaryMeaning,
            primaryReading,
            (fieldEntry.fieldValues?.kanjiMeanings || []).join(" / "),
            "",
            labelOnReading(readingEntry.onReadings),
            labelKunReading(readingEntry.kunReadings),
            "",
            "",
            pickMainComponent(components[kanji] || []),
            (fieldEntry.fieldValues?.supportNotes || []).join(" / "),
            (fieldEntry.fieldValues?.exampleSentences || []).join(" / "),
        ].map((field) => tsvEscape(escapeHtml(field))).join("\t"));
    }

    return rows.join("\n");
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

function evaluateKanjiTsvArtifact({
    tsv,
    repeatTsv,
    expectedHeader,
    expectedRows,
    preflight = null,
} = {}) {
    const failures = [];
    const header = parseTsvHeader(tsv);
    const rows = parseTsvRows(tsv);
    const rowCount = countTsvRows(tsv);
    const deterministic = String(tsv || "") === String(repeatTsv || "");
    const headerIndex = new Map((expectedHeader || []).map((fieldName, index) => [fieldName, index]));
    const requiredTextFields = [
        "Kanji",
        "DisplayWord",
        "MeaningJP",
        "PrimaryReading",
        "KanjiMeanings",
        "Radical",
        "Notes",
        "ExampleSentence",
    ];

    if (preflight && preflight.certifiable !== true) {
        failures.push("tracked-source kanji preflight is not certifiable");
    }
    if (JSON.stringify(header) !== JSON.stringify(expectedHeader || [])) {
        failures.push("kanji TSV header does not match the tracked kanji note schema");
    }
    if (rowCount !== expectedRows) {
        failures.push(`kanji TSV row count ${rowCount} did not match expected rows ${expectedRows}`);
    }
    if (!deterministic) {
        failures.push("repeated tracked-source kanji TSV generation was not deterministic");
    }

    rows.forEach((row, rowIndex) => {
        if (row.length !== (expectedHeader || []).length) {
            failures.push(`kanji TSV row ${rowIndex + 1} has ${row.length} fields, expected ${(expectedHeader || []).length}`);
        }
        for (const fieldName of requiredTextFields) {
            const value = row[headerIndex.get(fieldName)] || "";
            if (!String(value).trim()) {
                failures.push(`kanji TSV row ${rowIndex + 1} has blank required field ${fieldName}`);
            }
        }
        const onReading = String(row[headerIndex.get("OnReading")] || "").trim();
        const kunReading = String(row[headerIndex.get("KunReading")] || "").trim();
        if (!onReading && !kunReading) {
            failures.push(`kanji TSV row ${rowIndex + 1} has neither OnReading nor KunReading`);
        }
        if (String(row[headerIndex.get("Kanji")] || "") !== String(row[headerIndex.get("DisplayWord")] || "")) {
            failures.push(`kanji TSV row ${rowIndex + 1} does not keep DisplayWord anchored to the bare kanji`);
        }
    });

    return {
        passed: failures.length === 0,
        failures,
        rowCount,
        header,
        deterministic,
        sha256: sha256Text(tsv),
        repeatSha256: sha256Text(repeatTsv),
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
    const targetLevel = normalizeTrackedSourceLevel(level);

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
    const fieldSourceAudit = auditKanjiCardFieldSourceContractForLevel({
        fieldSourceContract,
        jlptLevelContract,
        platinumCardSourceManifest,
        readingReferenceContract,
        level: targetLevel,
    });
    const evaluation = evaluateTrackedSourceKanjiPreflight({
        jlptLevelContract,
        curatedStudyData,
        componentContract,
        readingReferenceContract,
        readingReferenceAudit,
        fieldSourceContract,
        fieldSourceAudit,
        level: targetLevel,
    });

    return {
        generatedAt: new Date().toISOString(),
        passed: evaluation.passed,
        certifiable: evaluation.certifiable,
        scope: targetLevel === 5
            ? N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE
            : buildTrackedSourceKanjiPreflightScope(targetLevel),
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

async function buildTrackedSourceKanjiArtifact({
    level = 5,
    cwd = process.cwd(),
    outDir = path.join(process.cwd(), "out", "product-readiness", `n${level}-tracked-source-kanji`),
    paths = buildDefaultTrackedSourcePaths({ cwd }),
} = {}) {
    const targetLevel = normalizeTrackedSourceLevel(level);
    const rootDir = path.resolve(outDir);
    const exportsDir = path.join(rootDir, "exports");
    const reportsDir = path.join(rootDir, "reports");
    const kanjiTsvPath = path.join(exportsDir, `jlpt-n${targetLevel}-kanji.tsv`);
    const summaryPath = path.join(reportsDir, "tracked-source-kanji-artifact-summary.json");
    const preflight = buildTrackedSourceKanjiPreflight({
        level: targetLevel,
        cwd,
        paths,
    });

    ensureDir(reportsDir);

    if (!preflight.certifiable) {
        const summary = {
            generatedAt: new Date().toISOString(),
            passed: false,
            certifiable: false,
            scope: targetLevel === 5
                ? N5_TRACKED_SOURCE_KANJI_TSV_SCOPE
                : buildTrackedSourceKanjiTsvScope(targetLevel),
            outDir: rootDir,
            artifacts: {
                kanjiTsvPath: null,
                kanjiTsvSha256: null,
            },
            sourceFiles: preflight.sourceFiles,
            preflight,
            kanji: {
                passed: false,
                failures: ["tracked-source kanji preflight is not certifiable"],
                rowCount: 0,
                deterministic: false,
                sha256: null,
                repeatSha256: null,
            },
        };

        fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
        return {
            ...summary,
            reports: {
                summaryPath,
            },
        };
    }

    const jlptLevelContract = loadJlptLevelContract(paths.jlptLevelContractPath);
    const componentContract = loadKanjiComponentContract(paths.kanjiComponentContractPath);
    const readingReferenceContract = loadKanjiReadingReferenceContract(paths.kanjiReadingReferenceContractPath);
    const fieldSourceContract = loadKanjiCardFieldSourceContract(paths.kanjiCardFieldSourceContractPath);
    const expectedHeader = loadAnkiNoteSchema("kanji").fieldNames;
    const buildOptions = {
        level: targetLevel,
        expectedHeader,
        jlptLevelContract,
        componentContract,
        readingReferenceContract,
        fieldSourceContract,
    };
    const tsv = formatKanjiSourceDerivedTsv(buildOptions);
    const repeatTsv = formatKanjiSourceDerivedTsv(buildOptions);
    const expectedRows = jlptLevelContract.inventoryCounts?.[String(targetLevel)] || 0;
    const evaluation = evaluateKanjiTsvArtifact({
        tsv,
        repeatTsv,
        expectedHeader,
        expectedRows,
        preflight,
    });

    ensureDir(exportsDir);
    fs.writeFileSync(kanjiTsvPath, `${tsv}\n`, "utf8");

    const summary = {
        generatedAt: new Date().toISOString(),
        passed: evaluation.passed,
        certifiable: evaluation.passed,
        scope: targetLevel === 5
            ? N5_TRACKED_SOURCE_KANJI_TSV_SCOPE
            : buildTrackedSourceKanjiTsvScope(targetLevel),
        outDir: rootDir,
        artifacts: {
            kanjiTsvPath,
            kanjiTsvSha256: evaluation.sha256,
        },
        sourceFiles: preflight.sourceFiles,
        preflight,
        kanji: evaluation,
    };

    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    return {
        ...summary,
        reports: {
            summaryPath,
        },
    };
}

async function buildTrackedSourceKanjiArtifacts({
    levels = JLPT_LEVELS,
    cwd = process.cwd(),
    outDir = null,
    paths = buildDefaultTrackedSourcePaths({ cwd }),
} = {}) {
    const targetLevels = normalizeTrackedSourceLevels({ levels });
    const reports = [];

    for (const level of targetLevels) {
        reports.push(await buildTrackedSourceKanjiArtifact({
            level,
            cwd,
            outDir: outDir ? path.join(path.resolve(outDir), `n${level}-tracked-source-kanji`) : undefined,
            paths,
        }));
    }

    return {
        generatedAt: new Date().toISOString(),
        passed: reports.every((report) => report.passed),
        certifiable: reports.every((report) => report.certifiable),
        scope: {
            type: "tracked-source-kanji-tsv-multi-level",
            levels: targetLevels,
            sourceBoundary: "Runs each selected kanji level through the governed tracked-source TSV gate without ignored local data inputs.",
        },
        levels: reports,
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

function defaultKanjiArtifactSummaryPath({ cwd = process.cwd(), level = 5 } = {}) {
    return path.join(
        cwd,
        "out",
        "product-readiness",
        `n${level}-tracked-source-kanji`,
        "reports",
        "tracked-source-kanji-artifact-summary.json"
    );
}

function readKanjiArtifactSummary({ cwd = process.cwd(), level = 5, summaryPath = null } = {}) {
    const resolvedPath = summaryPath || defaultKanjiArtifactSummaryPath({ cwd, level });
    if (!fs.existsSync(resolvedPath)) {
        return {
            path: resolvedPath,
            exists: false,
            summary: null,
        };
    }

    return {
        path: resolvedPath,
        exists: true,
        summary: JSON.parse(fs.readFileSync(resolvedPath, "utf8")),
    };
}

function buildQaRequirement({ id, label, status, evidence = "", blocker = "" }) {
    return {
        id,
        label,
        status,
        evidence,
        blocker,
        passed: status === "passed",
    };
}

function buildTrackedSourceKanjiReleaseQaGate({
    levels = JLPT_LEVELS,
    cwd = process.cwd(),
    artifactSummaries = null,
} = {}) {
    const targetLevels = normalizeTrackedSourceLevels({ levels });
    const providedSummaries = new Map(
        (Array.isArray(artifactSummaries) ? artifactSummaries : [])
            .map((summary) => [Number(summary?.scope?.level), summary])
            .filter(([level]) => Number.isInteger(level))
    );
    const levelReports = targetLevels.map((level) => {
        const artifactSummary = providedSummaries.get(level)
            || readKanjiArtifactSummary({ cwd, level }).summary;
        const artifactPath = artifactSummary?.reports?.summaryPath
            || defaultKanjiArtifactSummaryPath({ cwd, level });
        const tsvPassed = Boolean(artifactSummary?.passed && artifactSummary?.artifacts?.kanjiTsvPath);
        const requirements = [
            buildQaRequirement({
                id: "tracked-source-kanji-tsv",
                label: `N${level} tracked-source kanji TSV artifact`,
                status: tsvPassed ? "passed" : "blocked",
                evidence: tsvPassed ? artifactSummary.artifacts.kanjiTsvPath : artifactPath,
                blocker: tsvPassed
                    ? ""
                    : `N${level} has no passing tracked-source kanji TSV artifact summary.`,
            }),
            buildQaRequirement({
                id: "apkg-package",
                label: `N${level} governed APKG package approval`,
                status: "manual-required",
                blocker: "No governed tracked-source kanji APKG package approval is recorded by this automated gate.",
            }),
            buildQaRequirement({
                id: "managed-media-provenance",
                label: `N${level} managed stroke-order and audio media QA`,
                status: "manual-required",
                blocker: "Managed media provenance, packaging, and listening QA must be reviewed outside the source-derived TSV gate.",
            }),
            buildQaRequirement({
                id: "manual-anki-import",
                label: `N${level} manual Anki import review`,
                status: "manual-required",
                blocker: "A human must import the deck into Anki and review field rendering before release approval.",
            }),
            buildQaRequirement({
                id: "mobile-screen-reader-listening",
                label: `N${level} mobile, screen-reader, and listening QA`,
                status: "manual-required",
                blocker: "Accessibility, mobile, and listening checks are mandatory release evidence and cannot be inferred from green unit tests.",
            }),
        ];

        return {
            level,
            passed: requirements.every((requirement) => requirement.passed),
            artifactSummaryPath: artifactPath,
            requirements,
        };
    });

    return {
        generatedAt: new Date().toISOString(),
        passed: levelReports.every((report) => report.passed),
        certifiable: false,
        scope: TRACKED_SOURCE_KANJI_RELEASE_QA_SCOPE,
        levels: levelReports,
    };
}

function formatTrackedSourceKanjiPreflightReport(report = {}) {
    const level = report.scope?.level || 5;
    const lines = [
        `Japanese Kanji Builder N${level} Tracked-Source Kanji Preflight`,
        "",
        `Preflight result: ${report.passed ? "complete" : "failing"}`,
        `Tracked-source kanji TSV certifiable: ${report.certifiable ? "yes" : "no"}`,
        `Scope: ${report.scope?.type || "unknown"}`,
        `Source boundary: ${report.scope?.sourceBoundary || "not specified"}`,
        "",
        "Tracked inventory:",
        `- expected N${level} kanji: ${report.kanji?.counts?.expectedKanji || 0}`,
        `- contract N${level} kanji: ${report.kanji?.counts?.contractKanji || 0}`,
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

function formatTrackedSourceKanjiArtifactReport(report = {}) {
    const level = report.scope?.level || 5;
    const lines = [
        `Japanese Kanji Builder N${level} Tracked-Source Kanji TSV Artifact Gate`,
        "",
        `Overall result: ${report.passed ? "passing" : "failing"}`,
        `Tracked-source kanji TSV certifiable: ${report.certifiable ? "yes" : "no"}`,
        `Scope: ${report.scope?.type || "unknown"}`,
        `Source boundary: ${report.scope?.sourceBoundary || "not specified"}`,
        "",
        "Kanji TSV:",
        `- rows: ${report.kanji?.rowCount || 0}`,
        `- deterministic repeat: ${report.kanji?.deterministic ? "yes" : "no"}`,
        `- sha256: ${report.kanji?.sha256 || ""}`,
        `- output: ${report.artifacts?.kanjiTsvPath || "(not generated)"}`,
        "",
        "Source preflight:",
        `- result: ${report.preflight?.passed ? "complete" : "failing"}`,
        `- certifiable: ${report.preflight?.certifiable ? "yes" : "no"}`,
        `- card field source entries: ${report.preflight?.kanji?.counts?.cardFieldSourceKanji || 0}`,
        `- reading reference entries: ${report.preflight?.kanji?.counts?.readingReferenceKanji || 0}`,
    ];

    if (Array.isArray(report.kanji?.failures) && report.kanji.failures.length > 0) {
        lines.push("", "Failures:", ...report.kanji.failures.map((failure) => `- ${failure}`));
    }

    if (Array.isArray(report.preflight?.kanji?.blockers) && report.preflight.kanji.blockers.length > 0) {
        lines.push(
            "",
            "Certification blockers:",
            ...report.preflight.kanji.blockers.map((blocker) => `- ${blocker.label}: ${blocker.currentSource}`)
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

function formatTrackedSourceKanjiArtifactsReport(report = {}) {
    const isPreflight = String(report.scope?.type || "").includes("preflight");
    const lines = [
        isPreflight
            ? "Japanese Kanji Builder Tracked-Source Kanji Preflight Gates"
            : "Japanese Kanji Builder Tracked-Source Kanji TSV Artifact Gates",
        "",
        `Overall result: ${report.passed ? "passing" : "failing"}`,
        `All selected levels certifiable: ${report.certifiable ? "yes" : "no"}`,
        `Source boundary: ${report.scope?.sourceBoundary || "not specified"}`,
        "",
        "Level results:",
        ...(report.levels || []).map((levelReport) => (
            isPreflight
                ? `- N${levelReport.scope?.level || "?"}: ${levelReport.certifiable ? "certifiable" : "blocked"}; card field source ${levelReport.kanji?.counts?.cardFieldSourceKanji || 0}/${levelReport.kanji?.counts?.expectedKanji || 0}; reading reference ${levelReport.kanji?.counts?.readingReferenceKanji || 0}/${levelReport.kanji?.counts?.expectedKanji || 0}`
                : `- N${levelReport.scope?.level || "?"}: ${levelReport.passed ? "passing" : "blocked"}; rows ${levelReport.kanji?.rowCount || 0}; output ${levelReport.artifacts?.kanjiTsvPath || "(not generated)"}`
        )),
    ];

    const blocked = (report.levels || []).filter((levelReport) => !levelReport.passed);
    if (blocked.length > 0) {
        lines.push(
            "",
            "Blocked levels:",
            ...blocked.map((levelReport) => {
                const blockers = levelReport.preflight?.kanji?.blockers || [];
                const blockerText = blockers.length
                    ? blockers.map((blocker) => blocker.id).join(", ")
                    : (levelReport.kanji?.failures || []).join("; ");
                return `- N${levelReport.scope?.level || "?"}: ${blockerText || "see artifact summary"}`;
            })
        );
    }

    return `${lines.join("\n")}\n`;
}

function formatTrackedSourceKanjiReleaseQaReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Tracked-Source Kanji APKG/Media/Manual QA Gate",
        "",
        `Overall result: ${report.passed ? "passing" : "blocked"}`,
        `Release certifiable: ${report.certifiable ? "yes" : "no"}`,
        `Scope: ${report.scope?.type || "unknown"}`,
        `Source boundary: ${report.scope?.sourceBoundary || "not specified"}`,
        "",
        "Level QA:",
    ];

    for (const levelReport of report.levels || []) {
        lines.push(`- N${levelReport.level}: ${levelReport.passed ? "passing" : "blocked"}`);
        for (const requirement of levelReport.requirements || []) {
            lines.push(`  - ${requirement.status}: ${requirement.label}${requirement.blocker ? ` (${requirement.blocker})` : ""}`);
        }
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
    N5_TRACKED_SOURCE_KANJI_TSV_SCOPE,
    TRACKED_SOURCE_KANJI_RELEASE_QA_SCOPE,
    buildJlptOnlyJsonFromContract,
    buildTrackedSourceKanjiArtifact,
    buildTrackedSourceKanjiArtifacts,
    buildTrackedSourceKanjiPreflight,
    buildTrackedSourceKanjiReleaseQaGate,
    buildTrackedSourceWordArtifact,
    countCardFieldSourceEntriesForLevel,
    countReadingReferenceEntriesForLevel,
    evaluateKanjiTsvArtifact,
    evaluateTrackedSourceKanjiPreflight,
    evaluateWordArtifact,
    formatKanjiSourceDerivedTsv,
    formatTrackedSourceArtifactReport,
    formatTrackedSourceKanjiArtifactReport,
    formatTrackedSourceKanjiArtifactsReport,
    formatTrackedSourceKanjiPreflightReport,
    formatTrackedSourceKanjiReleaseQaReport,
    normalizeTrackedSourceLevels,
};
