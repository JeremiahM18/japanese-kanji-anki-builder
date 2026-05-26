const {
    resolvePlatinumCardSourceMatches,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
} = require("./platinumEvidenceService");
const {
    ACTIVE_PLATINUM_STATUSES,
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    entryUsesCurrentKanjiPlatinumStandard,
} = require("./platinumKanjiReviewService");

const DEFAULT_CHECKED_AT = "2026-05-26";
const DEFAULT_LEVEL = 5;
const FIELD_SOURCE_CONTRACT_TYPE = "kanji-card-field-source";
const FIELD_SOURCE_STANDARD = "kanji-card-field-source-v1";
const FIELD_SOURCE_ALLOWED_USE = "kanji-field-verification";
const FIELD_SOURCE_DISALLOWED_USES = Object.freeze([
    "word-field-verification",
    "kanji-reading-reference-only",
    "placement-claim-origin",
    "level-truth",
    "generated-surface",
    "golden-regression",
    "media-provenance",
    "audio-provenance",
    "review-certification",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function normalizeJlptLevel(value) {
    if (Number.isInteger(value) && value >= 1 && value <= 5) {
        return value;
    }

    const match = normalizeText(value).match(/^(?:jlpt\s*)?n?\s*([1-5])$/i);
    return match ? Number(match[1]) : null;
}

function normalizeLevelFromEntry(entry = {}) {
    for (const levelText of normalizeArray(entry.levelIncludes)) {
        const level = normalizeJlptLevel(levelText);
        if (Number.isInteger(level)) {
            return level;
        }
    }
    return null;
}

function buildCardKey({ kanji = "", primaryReading = "" } = {}) {
    return `${normalizeText(kanji)}|${normalizeText(primaryReading)}`;
}

function getSourceCitationMode(source = {}) {
    if (source.licenseUse?.status === "restricted") {
        return "manual-field-bound-citation";
    }
    return "approved-derived-use";
}

function buildSourceEvidenceContractEntry(evidence = {}, {
    manifest = {},
    sourceOriginIds = [],
    sourceEvidence = [],
    kanji = "",
    primaryReading = "",
    primaryMeaning = "",
    kanjiMeanings = [],
} = {}) {
    const matches = resolvePlatinumCardSourceMatches([evidence], { manifest });
    const sourceIds = matches.map(({ sourceId }) => sourceId).sort();
    const fieldVerifierSourceIds = matches
        .filter(({ source }) => source.status === "active" && (source.allowedUse || []).includes(FIELD_SOURCE_ALLOWED_USE))
        .map(({ sourceId }) => sourceId)
        .sort();
    const supportingSourceIds = sourceIds
        .filter((sourceId) => !fieldVerifierSourceIds.includes(sourceId))
        .sort();
    const citationModes = [...new Set(matches.map(({ source }) => getSourceCitationMode(source)))].sort();

    const validationFailures = [
        ...validateJapaneseSourceEvidence(sourceEvidence, {
            context: `kanji card-field source contract ${kanji}`,
            manifest,
            requiredUse: FIELD_SOURCE_ALLOWED_USE,
            sourceOriginIds,
        }),
        ...validateEvidenceSnippets({
            sourceEvidence,
            type: "japanese-source",
            label: "contracted primary reading, primary meaning, and broader meanings",
            snippets: [kanji, primaryReading, primaryMeaning, ...kanjiMeanings],
        }),
    ];

    return {
        type: "japanese-source",
        evidenceUse: FIELD_SOURCE_ALLOWED_USE,
        citationMode: citationModes.includes("manual-field-bound-citation")
            ? "manual-field-bound-citation"
            : "approved-derived-use",
        source: normalizeText(evidence.source),
        detail: normalizeText(evidence.detail),
        sourceIds,
        fieldVerifierSourceIds,
        supportingSourceIds,
        validationFailures,
    };
}

function buildEntryFromPlatinumReview(entry = {}, {
    level = DEFAULT_LEVEL,
    manifest,
    reviewSetPath = "",
    sourceOriginIds = [],
} = {}) {
    const kanji = normalizeText(entry.kanji);
    const primaryReading = normalizeArray(entry.readingIncludes)[0] || "";
    const primaryMeaning = normalizeArray(entry.meaningIncludes)[0] || "";
    const kanjiMeanings = normalizeArray(entry.kanjiMeaningsIncludes);
    const sourceEvidence = Array.isArray(entry.sourceEvidence)
        ? entry.sourceEvidence.filter((sourceEntry) => sourceEntry && typeof sourceEntry === "object" && !Array.isArray(sourceEntry))
        : [];
    const fieldEvidence = sourceEvidence
        .filter((sourceEntry) => normalizeText(sourceEntry.type) === "japanese-source")
        .map((sourceEntry) => buildSourceEvidenceContractEntry(sourceEntry, {
            manifest,
            sourceOriginIds,
            sourceEvidence,
            kanji,
            primaryReading,
            primaryMeaning,
            kanjiMeanings,
        }));

    return {
        kanji,
        level,
        cardKey: buildCardKey({ kanji, primaryReading }),
        fieldValues: {
            primaryReading,
            primaryMeaning,
            kanjiMeanings,
            supportNotes: normalizeArray(entry.notesIncludes),
            exampleSentences: normalizeArray(entry.exampleIncludes),
        },
        sourceOriginIds,
        fieldEvidence,
        reviewBinding: {
            sourceReviewSetPath: reviewSetPath,
            status: normalizeText(entry.status),
            reviewedAt: normalizeText(entry.reviewedAt),
            reviewer: normalizeText(entry.reviewer),
            reviewStandard: normalizeText(entry.reviewStandard),
            revalidatedAt: normalizeText(entry.revalidatedAt),
            rereviewReviewedAt: normalizeText(entry.rereviewProvenance?.reviewedAt),
            rereviewReviewer: normalizeText(entry.rereviewProvenance?.reviewer),
            rereviewResult: normalizeText(entry.rereviewProvenance?.result),
            mechanicalMigration: Boolean(entry.rereviewProvenance?.mechanicalMigration),
        },
    };
}

function buildKanjiCardFieldSourceContract({
    jlptLevelContract = {},
    platinumEntries = [],
    platinumCardSourceManifest = {},
    sourceOriginIdsByKanji = {},
    level = DEFAULT_LEVEL,
    checkedAt = DEFAULT_CHECKED_AT,
    reviewSetPath = `templates/platinum_n${DEFAULT_LEVEL}_review_set.json`,
    jlptLevelContractPath = "templates/jlpt_level_contract.json",
    sourceManifestPath = "templates/platinum_card_source_manifest.json",
    sourceOriginEvidencePath = "templates/jlpt_kanji_source_evidence.json",
} = {}) {
    const targetKanji = Object.entries(jlptLevelContract.kanjiLevels || {})
        .filter(([, entryLevel]) => Number(entryLevel) === Number(level))
        .map(([kanji]) => kanji)
        .sort((a, b) => a.localeCompare(b));
    const entriesByKanji = new Map();

    for (const entry of platinumEntries) {
        const status = normalizeText(entry.status);
        const entryLevel = normalizeLevelFromEntry(entry);
        if (!ACTIVE_PLATINUM_STATUSES.includes(status) || entryLevel !== Number(level)) {
            continue;
        }
        if (!entryUsesCurrentKanjiPlatinumStandard(entry)) {
            continue;
        }
        const kanji = normalizeText(entry.kanji);
        entriesByKanji.set(kanji, buildEntryFromPlatinumReview(entry, {
            level: Number(level),
            manifest: platinumCardSourceManifest,
            reviewSetPath,
            sourceOriginIds: sourceOriginIdsByKanji[kanji] || [],
        }));
    }

    const entries = {};
    const missingKanji = [];
    for (const kanji of targetKanji) {
        const entry = entriesByKanji.get(kanji);
        if (!entry) {
            missingKanji.push(kanji);
        } else {
            entries[kanji] = entry;
        }
    }

    return {
        version: 1,
        contractType: FIELD_SOURCE_CONTRACT_TYPE,
        standard: FIELD_SOURCE_STANDARD,
        checkedAt,
        scope: {
            level: Number(level),
            levelLabel: `N${level}`,
            sourceReviewSetPath: reviewSetPath,
            sourceReviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
            sourceBoundary: "Tracked kanji card-field provenance extracted from current-standard Platinum japanese-source evidence only.",
        },
        sourceUse: {
            allowedUse: [FIELD_SOURCE_ALLOWED_USE],
            disallowedUse: [...FIELD_SOURCE_DISALLOWED_USES],
        },
        sourceFiles: {
            jlptLevelContractPath,
            sourceReviewSetPath: reviewSetPath,
            platinumCardSourceManifestPath: sourceManifestPath,
            sourceOriginEvidencePath,
        },
        provenancePolicy: {
            evidenceType: "japanese-source",
            requiredSourceUse: FIELD_SOURCE_ALLOWED_USE,
            restrictedSourceHandling: "manual field-bound citations only; no copied source entries or bulk source data",
            requiresCurrentPlatinumStandard: true,
            requiresIndependentFromPlacementOrigins: true,
            doesNotCertify: [
                "JLPT placement truth",
                "generated TSV correctness",
                "golden regression",
                "audio provenance",
                "stroke-order provenance",
                "Obsidian rereview proof",
                "release readiness",
            ],
        },
        coverage: {
            expectedKanjiCount: targetKanji.length,
            entryCount: Object.keys(entries).length,
            missingEntryCount: missingKanji.length,
            missingKanji,
        },
        entries,
    };
}

module.exports = {
    DEFAULT_CHECKED_AT,
    DEFAULT_LEVEL,
    FIELD_SOURCE_ALLOWED_USE,
    FIELD_SOURCE_CONTRACT_TYPE,
    FIELD_SOURCE_DISALLOWED_USES,
    FIELD_SOURCE_STANDARD,
    buildKanjiCardFieldSourceContract,
};
