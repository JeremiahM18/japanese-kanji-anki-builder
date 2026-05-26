const fs = require("node:fs");
const { z } = require("zod");

const { normalizeJapaneseReading } = require("../utils/japanese");

const FIELD_SOURCE_CONTRACT_TYPE = "kanji-card-field-source";
const FIELD_SOURCE_STANDARD = "kanji-card-field-source-v1";
const FIELD_SOURCE_ALLOWED_USE = "kanji-field-verification";
const REQUIRED_DISALLOWED_USES = Object.freeze([
    "word-field-verification",
    "placement-claim-origin",
    "level-truth",
    "generated-surface",
    "golden-regression",
    "media-provenance",
    "audio-provenance",
    "review-certification",
]);
const BLOCKED_SOURCE_TEXT_RE = /data\/|kanji_jlpt_only|starter_curated|golden_|generated|local cache|kanjidic2_reading_reference/iu;

const sourceUseSchema = z.object({
    allowedUse: z.array(z.string().min(1)).default([]),
    disallowedUse: z.array(z.string().min(1)).default([]),
}).strict();

const fieldEvidenceSchema = z.object({
    type: z.literal("japanese-source"),
    evidenceUse: z.literal(FIELD_SOURCE_ALLOWED_USE),
    citationMode: z.enum(["manual-field-bound-citation", "approved-derived-use"]),
    source: z.string().min(1),
    detail: z.string().min(1),
    sourceIds: z.array(z.string().min(1)).default([]),
    fieldVerifierSourceIds: z.array(z.string().min(1)).default([]),
    supportingSourceIds: z.array(z.string().min(1)).default([]),
    validationFailures: z.array(z.string()).default([]),
}).strict();

const contractEntrySchema = z.object({
    kanji: z.string().min(1),
    level: z.number().int().min(1).max(5),
    cardKey: z.string().min(1),
    fieldValues: z.object({
        primaryReading: z.string().min(1),
        primaryMeaning: z.string().min(1),
        kanjiMeanings: z.array(z.string().min(1)).min(1),
        supportNotes: z.array(z.string().min(1)).min(1),
        exampleSentences: z.array(z.string().min(1)).min(1),
    }).strict(),
    sourceOriginIds: z.array(z.string().min(1)).default([]),
    fieldEvidence: z.array(fieldEvidenceSchema).min(1),
    reviewBinding: z.object({
        sourceReviewSetPath: z.string().min(1),
        status: z.string().min(1),
        reviewedAt: z.string().min(1),
        reviewer: z.string().min(1),
        reviewStandard: z.string().min(1),
        revalidatedAt: z.string().min(1),
        rereviewReviewedAt: z.string().min(1),
        rereviewReviewer: z.string().min(1),
        rereviewResult: z.string().min(1),
        mechanicalMigration: z.boolean(),
    }).strict(),
}).strict();

const kanjiCardFieldSourceContractSchema = z.object({
    version: z.number().int().min(1),
    contractType: z.literal(FIELD_SOURCE_CONTRACT_TYPE),
    standard: z.literal(FIELD_SOURCE_STANDARD),
    checkedAt: z.string().min(1),
    scope: z.object({
        level: z.number().int().min(1).max(5),
        levelLabel: z.string().min(1),
        sourceReviewSetPath: z.string().min(1),
        sourceReviewStandard: z.string().min(1),
        sourceBoundary: z.string().min(1),
    }).strict(),
    sourceUse: sourceUseSchema,
    sourceFiles: z.object({
        jlptLevelContractPath: z.string().min(1),
        sourceReviewSetPath: z.string().min(1),
        platinumCardSourceManifestPath: z.string().min(1),
        sourceOriginEvidencePath: z.string().min(1),
    }).strict(),
    provenancePolicy: z.object({
        evidenceType: z.literal("japanese-source"),
        requiredSourceUse: z.literal(FIELD_SOURCE_ALLOWED_USE),
        restrictedSourceHandling: z.string().min(1),
        requiresCurrentPlatinumStandard: z.boolean(),
        requiresIndependentFromPlacementOrigins: z.boolean(),
        doesNotCertify: z.array(z.string().min(1)).min(1),
    }).strict(),
    coverage: z.object({
        expectedKanjiCount: z.number().int().min(0),
        entryCount: z.number().int().min(0),
        missingEntryCount: z.number().int().min(0),
        missingKanji: z.array(z.string()).default([]),
    }).strict(),
    entries: z.record(z.string().min(1), contractEntrySchema),
}).strict();

function hasRequiredUse(source = {}, use = "") {
    return source.status === "active" && (source.allowedUse || []).includes(use);
}

function buildReadingReferenceSet(readingReferenceEntry = {}) {
    return new Set([
        ...(readingReferenceEntry.onReadings || []),
        ...(readingReferenceEntry.kunReadings || []),
        ...(readingReferenceEntry.normalizedOnReadings || []),
        ...(readingReferenceEntry.normalizedKunReadings || []),
    ].map((reading) => normalizeJapaneseReading(reading)).filter(Boolean));
}

function parseKanjiCardFieldSourceContract(value) {
    return kanjiCardFieldSourceContractSchema.parse(value);
}

function loadKanjiCardFieldSourceContract(filePath) {
    return parseKanjiCardFieldSourceContract(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function auditKanjiCardFieldSourceContract({
    fieldSourceContract = {},
    jlptLevelContract = {},
    platinumCardSourceManifest = {},
    readingReferenceContract = null,
    level = fieldSourceContract.scope?.level,
} = {}) {
    const failures = [];
    const allowedUse = fieldSourceContract.sourceUse?.allowedUse || [];
    const disallowedUse = fieldSourceContract.sourceUse?.disallowedUse || [];

    if (!allowedUse.includes(FIELD_SOURCE_ALLOWED_USE)) {
        failures.push(`sourceUse.allowedUse must include ${FIELD_SOURCE_ALLOWED_USE}.`);
    }
    for (const blockedUse of REQUIRED_DISALLOWED_USES) {
        if (!disallowedUse.includes(blockedUse)) {
            failures.push(`sourceUse.disallowedUse must include ${blockedUse}.`);
        }
    }
    if (fieldSourceContract.provenancePolicy?.restrictedSourceHandling !== "manual field-bound citations only; no copied source entries or bulk source data") {
        failures.push("provenancePolicy.restrictedSourceHandling must preserve manual field-bound citation limits.");
    }
    if (fieldSourceContract.provenancePolicy?.requiresIndependentFromPlacementOrigins !== true) {
        failures.push("provenancePolicy.requiresIndependentFromPlacementOrigins must be true.");
    }

    const targetKanji = Object.entries(jlptLevelContract.kanjiLevels || {})
        .filter(([, entryLevel]) => Number(entryLevel) === Number(level))
        .map(([kanji]) => kanji)
        .sort((a, b) => a.localeCompare(b));
    const targetSet = new Set(targetKanji);
    const entries = fieldSourceContract.entries || {};
    const entryKeys = Object.keys(entries).sort((a, b) => a.localeCompare(b));
    const missingKanji = targetKanji.filter((kanji) => !entries[kanji]);
    const extraKanji = entryKeys.filter((kanji) => !targetSet.has(kanji));

    if (fieldSourceContract.coverage?.expectedKanjiCount !== targetKanji.length) {
        failures.push(`coverage.expectedKanjiCount ${fieldSourceContract.coverage?.expectedKanjiCount} did not match JLPT N${level} count ${targetKanji.length}.`);
    }
    if (fieldSourceContract.coverage?.entryCount !== entryKeys.length) {
        failures.push(`coverage.entryCount ${fieldSourceContract.coverage?.entryCount} did not match entries count ${entryKeys.length}.`);
    }
    if (fieldSourceContract.coverage?.missingEntryCount !== missingKanji.length) {
        failures.push(`coverage.missingEntryCount ${fieldSourceContract.coverage?.missingEntryCount} did not match missing entries ${missingKanji.length}.`);
    }
    if (missingKanji.length > 0) {
        failures.push(`Missing N${level} field-source contract entries: ${missingKanji.join(", ")}`);
    }
    if (extraKanji.length > 0) {
        failures.push(`Field-source contract includes kanji outside N${level}: ${extraKanji.join(", ")}`);
    }

    for (const [kanji, entry] of Object.entries(entries)) {
        const prefix = `entries.${kanji}`;
        if (entry.kanji !== kanji) {
            failures.push(`${prefix}.kanji must match its entries key.`);
        }
        if (entry.level !== Number(level)) {
            failures.push(`${prefix}.level must be ${level}.`);
        }
        if (entry.cardKey !== `${kanji}|${entry.fieldValues.primaryReading}`) {
            failures.push(`${prefix}.cardKey must bind kanji and primary reading.`);
        }
        if (!entry.reviewBinding.reviewStandard || entry.reviewBinding.reviewStandard !== fieldSourceContract.scope.sourceReviewStandard) {
            failures.push(`${prefix}.reviewBinding.reviewStandard must match contract source review standard.`);
        }
        if (entry.reviewBinding.mechanicalMigration) {
            failures.push(`${prefix}.reviewBinding.mechanicalMigration must be false.`);
        }

        const readingReferenceEntry = readingReferenceContract?.entries?.[kanji];
        if (readingReferenceContract && !readingReferenceEntry) {
            failures.push(`${prefix} has no governed reading-reference entry.`);
        } else if (readingReferenceEntry) {
            const readingReferenceSet = buildReadingReferenceSet(readingReferenceEntry);
            if (!readingReferenceSet.has(normalizeJapaneseReading(entry.fieldValues.primaryReading))) {
                failures.push(`${prefix}.fieldValues.primaryReading is not present in the governed reading-reference contract.`);
            }
        }

        for (const [evidenceIndex, evidence] of entry.fieldEvidence.entries()) {
            const evidencePrefix = `${prefix}.fieldEvidence[${evidenceIndex}]`;
            if (evidence.validationFailures.length > 0) {
                failures.push(...evidence.validationFailures.map((failure) => `${evidencePrefix}: ${failure}`));
            }
            if (evidence.citationMode !== "manual-field-bound-citation") {
                failures.push(`${evidencePrefix}.citationMode must be manual-field-bound-citation for restricted Japanese-source review notes.`);
            }
            if (BLOCKED_SOURCE_TEXT_RE.test(`${evidence.source} ${evidence.detail}`)) {
                failures.push(`${evidencePrefix} must not cite generated, ignored local, or reading-reference-only artifacts as field source evidence.`);
            }
            if (evidence.fieldVerifierSourceIds.length === 0) {
                failures.push(`${evidencePrefix}.fieldVerifierSourceIds must include at least one governed kanji-field verifier.`);
            }

            for (const sourceId of evidence.sourceIds) {
                const manifestSource = platinumCardSourceManifest.sources?.[sourceId];
                if (!manifestSource) {
                    failures.push(`${evidencePrefix}.sourceIds references unknown source ${sourceId}.`);
                    continue;
                }
                if (manifestSource.allowedUse.includes("placement-claim-origin") || manifestSource.allowedUse.includes("level-truth")) {
                    failures.push(`${evidencePrefix}.sourceIds ${sourceId} must not be a placement/level-truth source.`);
                }
            }

            for (const sourceId of evidence.fieldVerifierSourceIds) {
                const manifestSource = platinumCardSourceManifest.sources?.[sourceId];
                if (!hasRequiredUse(manifestSource, FIELD_SOURCE_ALLOWED_USE)) {
                    failures.push(`${evidencePrefix}.fieldVerifierSourceIds ${sourceId} is not active for ${FIELD_SOURCE_ALLOWED_USE}.`);
                }
            }
        }
    }

    return {
        passed: failures.length === 0,
        failures,
        counts: {
            expectedKanji: targetKanji.length,
            entries: entryKeys.length,
            missing: missingKanji.length,
            extra: extraKanji.length,
        },
    };
}

module.exports = {
    FIELD_SOURCE_ALLOWED_USE,
    FIELD_SOURCE_CONTRACT_TYPE,
    FIELD_SOURCE_STANDARD,
    auditKanjiCardFieldSourceContract,
    kanjiCardFieldSourceContractSchema,
    loadKanjiCardFieldSourceContract,
    parseKanjiCardFieldSourceContract,
};
