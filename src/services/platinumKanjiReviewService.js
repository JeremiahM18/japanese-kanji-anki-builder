const ACTIVE_PLATINUM_STATUSES = Object.freeze(["platinum", "fixed_then_platinum"]);
const {
    normalizeEvidenceEntries,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
} = require("./platinumEvidenceService");
const {
    buildCurrentStandardPreconditionFailuresByKey,
    buildKanjiGoldPreconditionFailuresByKey,
    mergeFailuresIntoResult,
    validatePlatinumLaneAuthorityBoundary,
} = require("./reviewLanePreconditionService");
const {
    getDefaultJlptKanjiSourceEvidence,
    resolveKanjiSourceOriginIdsForEntry,
} = require("./platinumKanjiSourceOriginService");
const {
    buildResolvedKanjiFields,
    resolveKanjiLaneContext,
} = require("./reviewLaneContextService");
const { decodeHtmlEntities } = require("../utils/text");
const { normalizeJapaneseReading } = require("../utils/japanese");
const NON_SHIPPING_STATUSES = Object.freeze(["deferred", "removed"]);
const REVALIDATION_STATUSES = Object.freeze(["needs_revalidation"]);
const REVIEW_ONLY_STATUSES = Object.freeze(["needs_review", ...REVALIDATION_STATUSES]);
const ALLOWED_PLATINUM_STATUSES = Object.freeze([
    ...ACTIVE_PLATINUM_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const CURRENT_KANJI_PLATINUM_REVIEW_STANDARD = "kanji-platinum-v3-evidence-lanes";
const PRIOR_KANJI_SAPPHIRE_REVIEW_STANDARD = "kanji-sapphire-v1-evidence-lanes";
const ACTIVE_SAPPHIRE_PRECONDITION_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);

const CURRENT_STANDARD_REVALIDATION_SUMMARY_CHECKS = Object.freeze([
    Object.freeze({ label: "evidence lanes", requiredPatterns: [/evidence/i, /lanes?/i] }),
    Object.freeze({ label: "generated surface", requiredPatterns: [/generated/i, /surface/i] }),
    Object.freeze({ label: "Japanese source evidence", requiredPatterns: [/japanese[- ]source/i, /evidence/i] }),
    Object.freeze({ label: "example sentence", requiredPatterns: [/example/i, /sentence/i] }),
    Object.freeze({ label: "notes/support surface", requiredPatterns: [/notes?/i, /support/i, /surface/i] }),
    Object.freeze({ label: "audio", requiredPatterns: [/audio/i] }),
    Object.freeze({ label: "stroke-order media", requiredPatterns: [/stroke[- ]order/i, /media/i] }),
    Object.freeze({ label: "verification limitations", requiredPatterns: [/verification/i, /limitations?/i] }),
]);

const REQUIRED_KANJI_QUALITY_GATES = Object.freeze([
    "belongsInKanjiDeck",
    "individualKanjiAnchor",
    "displayWordIsTargetKanji",
    "japaneseVerified",
    "primaryReadingVerified",
    "primaryMeaningVerified",
    "broaderMeaningsVerified",
    "exampleReleaseQuality",
    "exampleSupportOnly",
    "studyWordSuppressed",
    "levelPlacementVerified",
    "audioExactPrimaryReading",
    "audioArtifactVerified",
    "strokeOrderVerified",
    "strokeOrderTargetVerified",
    "noSilentFallback",
]);

const REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES = Object.freeze([
    "japanese-source",
]);

const REQUIRED_KANJI_INTERNAL_CHECK_TYPES = Object.freeze([
    "generated-surface",
    "golden-regression",
    "media-audit",
    "audio-review",
    "stroke-order-review",
]);

const REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES = Object.freeze([
    "manual-review",
    "current-standard-review",
]);

const BLOCKED_KANJI_SOURCE_EVIDENCE_TYPES = Object.freeze([
    "golden-review",
    ...REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    ...REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
]);

const ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "audioNaturalness",
    "exampleSupportNuance",
    "notesSupportNuance",
    "sourceAvailability",
    "strokeOrderSequence",
    "strokeOrderSourceDepth",
]);

const BLOCKED_KANJI_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "kanji",
    "displayWord",
    "primaryReading",
    "meaningJP",
    "kanjiMeanings",
    "exampleSentence",
    "productFit",
]);

const ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES = Object.freeze([
    "externally_unverified",
    "limited_source",
    "manual_review_only",
]);

const SINGLE_KANJI_RE = /^\p{Script=Han}$/u;

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForCompare(value) {
    return decodeHtmlEntities(normalizeText(value)
        .replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gu, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/:\s+/g, ":")
        .replace(/\s+/g, " "))
        .toLowerCase();
}

function includesAll(haystack, needles = []) {
    const normalizedHaystack = normalizeForCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => normalizedHaystack.includes(normalizeForCompare(needle)));
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function splitGeneratedKanjiReadings(value) {
    return String(value ?? "")
        .replace(/\b(?:On|Kun):/giu, " ")
        .split(/[、,\/／;；\s]+/u)
        .map((reading) => normalizeJapaneseReading(reading))
        .filter(Boolean);
}

function buildGeneratedKanjiReadingSet(row = {}) {
    return new Set([
        ...splitGeneratedKanjiReadings(row.onReading),
        ...splitGeneratedKanjiReadings(row.kunReading),
    ]);
}

function normalizeKanjiVerificationLimitations(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((limitation) => limitation && typeof limitation === "object" && !Array.isArray(limitation))
        .map((limitation) => ({
            field: normalizeText(limitation.field),
            status: normalizeText(limitation.status),
            label: normalizeText(limitation.label),
            reviewNote: normalizeText(limitation.reviewNote),
        }));
}

function normalizeReviewStandard(value) {
    return normalizeText(value);
}

function validateStructuredEvidenceLane(value, {
    fieldName = "sourceEvidence",
    requiredTypes = [],
    blockedTypes = [],
} = {}) {
    const failures = [];
    const entries = normalizeEvidenceEntries(value);
    if (entries.length === 0) {
        failures.push(`${fieldName} must contain structured evidence entries`);
    }
    for (const evidence of entries) {
        if (!evidence.type || !evidence.source || !evidence.detail) {
            failures.push(`${fieldName} entries must include type, source, and detail`);
        }
    }
    const evidenceTypes = new Set(entries.map((evidence) => evidence.type));
    for (const blockedType of blockedTypes) {
        if (evidenceTypes.has(blockedType)) {
            failures.push(`${blockedType} must not be used in ${fieldName}`);
        }
    }
    for (const requiredType of requiredTypes) {
        if (!evidenceTypes.has(requiredType)) {
            failures.push(`${fieldName} must include evidence type: ${requiredType}`);
        }
    }

    return failures;
}

function validateCurrentKanjiEvidenceLaneStructure(entry = {}) {
    return [
        ...validateStructuredEvidenceLane(entry.sourceEvidence, {
            fieldName: "sourceEvidence",
            requiredTypes: REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
            blockedTypes: BLOCKED_KANJI_SOURCE_EVIDENCE_TYPES,
        }),
        ...validateStructuredEvidenceLane(entry.internalChecks, {
            fieldName: "internalChecks",
            requiredTypes: REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
        }),
        ...validateStructuredEvidenceLane(entry.reviewEvidence, {
            fieldName: "reviewEvidence",
            requiredTypes: REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
            blockedTypes: ["golden-review"],
        }),
    ];
}

function entryUsesCurrentKanjiPlatinumStandard(entry = {}) {
    return validateCurrentKanjiPlatinumReviewStandard(entry).length === 0
        && validateCurrentKanjiEvidenceLaneStructure(entry).length === 0;
}

function hasActivePlatinumStatus(entry = {}) {
    return ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status));
}

function isCurrentStandardPlatinumEntry(entry = {}) {
    return hasActivePlatinumStatus(entry) && entryUsesCurrentKanjiPlatinumStandard(entry);
}

function isLegacyOrUnversionedKanjiReviewHistoryEntry(entry = {}) {
    const status = normalizeText(entry.status);
    return REVALIDATION_STATUSES.includes(status)
        || (hasActivePlatinumStatus(entry) && !entryUsesCurrentKanjiPlatinumStandard(entry));
}

function validateCurrentKanjiPlatinumReviewStandard(entry = {}) {
    const failures = [];
    const reviewStandard = normalizeReviewStandard(entry.reviewStandard);
    const revalidatedAt = normalizeText(entry.revalidatedAt);
    const revalidationSummary = normalizeText(entry.revalidationSummary);
    const reviewEvidence = normalizeEvidenceEntries(entry.reviewEvidence);
    const evidenceTypes = new Set(reviewEvidence.map((evidence) => evidence.type));

    if (reviewStandard !== CURRENT_KANJI_PLATINUM_REVIEW_STANDARD) {
        failures.push(`reviewStandard must be ${CURRENT_KANJI_PLATINUM_REVIEW_STANDARD}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revalidatedAt)) {
        failures.push("revalidatedAt must be YYYY-MM-DD for the current kanji platinum standard");
    }
    if (!revalidationSummary) {
        failures.push("revalidationSummary is required for the current kanji platinum standard");
    } else {
        for (const check of CURRENT_STANDARD_REVALIDATION_SUMMARY_CHECKS) {
            if (!check.requiredPatterns.every((pattern) => pattern.test(revalidationSummary))) {
                failures.push(`revalidationSummary must mention ${check.label}`);
            }
        }
    }
    if (!evidenceTypes.has("current-standard-review")) {
        failures.push("reviewEvidence must include evidence type: current-standard-review for the current kanji platinum standard");
    }

    return failures;
}

function buildKanjiReviewStandardSummary(entries = []) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeStatusEntries = reviewEntries.filter(hasActivePlatinumStatus);
    const currentStandardEntries = activeStatusEntries.filter(entryUsesCurrentKanjiPlatinumStandard);
    const legacyEntries = reviewEntries.filter(isLegacyOrUnversionedKanjiReviewHistoryEntry);

    return {
        currentStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        currentStandardCount: currentStandardEntries.length,
        activeStatusCount: activeStatusEntries.length,
        revalidationBacklogCount: legacyEntries.length,
        legacyOrUnversionedCount: legacyEntries.length,
        currentStandardKanji: currentStandardEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
        revalidationBacklogKanji: legacyEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
        legacyOrUnversionedKanji: legacyEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
    };
}

function buildKanjiVerificationLimitationSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : [])
        .filter(isCurrentStandardPlatinumEntry);
    const limitationRows = [];
    const fieldCounts = {};

    for (const entry of activeEntries) {
        const limitations = normalizeKanjiVerificationLimitations(entry.verificationLimitations);
        for (const limitation of limitations) {
            limitationRows.push({
                kanji: normalizeText(entry.kanji),
                field: limitation.field,
                status: limitation.status,
                label: limitation.label,
                reviewNote: limitation.reviewNote,
            });
            fieldCounts[limitation.field] = (fieldCounts[limitation.field] || 0) + 1;
        }
    }

    return {
        limitationCount: limitationRows.length,
        kanjiCount: new Set(limitationRows.map((limitation) => limitation.kanji).filter(Boolean)).size,
        fieldCounts,
        limitations: limitationRows.sort((left, right) => (
            left.kanji.localeCompare(right.kanji, "ja")
            || left.field.localeCompare(right.field)
            || left.label.localeCompare(right.label)
        )),
    };
}

function findDuplicateValues(values = []) {
    const seen = new Set();
    const duplicates = new Set();

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
        }
        seen.add(value);
    }

    return [...duplicates].sort();
}

function buildPlatinumReviewKey({ kanji = "" } = {}) {
    return normalizeForCompare(kanji);
}

function findKanjiRowForEntry(rows = [], entry = {}) {
    const matches = rows.filter((row) => row.kanji === entry.kanji);
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        return {
            kanji: entry.kanji,
            error: `ambiguous generated kanji rows: ${matches.map((row) => row.kanji).join(", ")}`,
        };
    }
    return null;
}

function validateActivePlatinumEntry(entry = {}, {
    goldExpectation,
    requireCurrentReviewStandard = false,
    sapphireEntry,
    sourceOriginIds = [],
} = {}) {
    const failures = [];
    const resolvedFields = buildResolvedKanjiFields({ entry, goldExpectation, sapphireEntry });

    if (!SINGLE_KANJI_RE.test(normalizeText(entry.kanji))) {
        failures.push("kanji must be one target kanji");
    }
    if (normalizeStringArray(resolvedFields.readingIncludes).length === 0) {
        failures.push("readingIncludes must protect the exact primary reading");
    }
    if (normalizeStringArray(resolvedFields.meaningIncludes).length === 0) {
        failures.push("meaningIncludes must protect the generated meaning text");
    }
    if (normalizeStringArray(resolvedFields.kanjiMeaningsIncludes).length === 0) {
        failures.push("kanjiMeaningsIncludes must protect the broader meaning list");
    }
    if (normalizeStringArray(resolvedFields.levelIncludes).length === 0) {
        failures.push("levelIncludes must protect the reviewed JLPT level");
    }
    if (normalizeStringArray(resolvedFields.exampleIncludes).length === 0) {
        failures.push("exampleIncludes must protect the support example");
    }
    if (normalizeStringArray(resolvedFields.notesIncludes).length === 0) {
        failures.push("notesIncludes must protect supporting vocabulary/examples");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required");
    }
    if (!normalizeText(entry.primaryReadingRationale)) {
        failures.push("primaryReadingRationale must explain why this individual-kanji reading was chosen");
    }
    failures.push(...validatePlatinumLaneAuthorityBoundary({ deckKind: "kanji", entry }));

    const sourceEvidence = normalizeEvidenceEntries(entry.sourceEvidence);
    failures.push(...validateStructuredEvidenceLane(entry.sourceEvidence, {
        fieldName: "sourceEvidence",
        requiredTypes: REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
        blockedTypes: BLOCKED_KANJI_SOURCE_EVIDENCE_TYPES,
    }));
    failures.push(...validateStructuredEvidenceLane(entry.internalChecks, {
        fieldName: "internalChecks",
        requiredTypes: REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    }));
    failures.push(...validateStructuredEvidenceLane(entry.reviewEvidence, {
        fieldName: "reviewEvidence",
        requiredTypes: REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
        blockedTypes: ["golden-review"],
    }));
    failures.push(...validateJapaneseSourceEvidence(sourceEvidence, {
        context: "kanji card accuracy",
        requiredUse: "kanji-field-verification",
        sourceOriginIds,
    }));
    if (entry.status === "fixed_then_platinum" && !normalizeText(entry.fixSummary)) {
        failures.push("fixed_then_platinum entries must include fixSummary");
    }
    if (
        requireCurrentReviewStandard
        || entry.reviewStandard !== undefined
        || entry.revalidatedAt !== undefined
        || entry.revalidationSummary !== undefined
    ) {
        failures.push(...validateCurrentKanjiPlatinumReviewStandard(entry));
    }
    failures.push(...validateKanjiVerificationLimitations(entry));

    const gates = entry.qualityGates || {};
    for (const gate of REQUIRED_KANJI_QUALITY_GATES) {
        if (gates[gate] !== true) {
            failures.push(`quality gate must be true: ${gate}`);
        }
    }

    return failures;
}

function validateKanjiVerificationLimitations(entry = {}) {
    const failures = [];

    if (entry.verificationLimitations === undefined) {
        return failures;
    }
    if (!Array.isArray(entry.verificationLimitations)) {
        return ["verificationLimitations must be an array when present"];
    }

    for (const [index, rawLimitation] of entry.verificationLimitations.entries()) {
        if (!rawLimitation || typeof rawLimitation !== "object" || Array.isArray(rawLimitation)) {
            failures.push(`verificationLimitations[${index}] must be a structured object`);
            continue;
        }

        const limitation = normalizeKanjiVerificationLimitations([rawLimitation])[0] || {};
        const prefix = `verificationLimitations[${index}]`;
        if (!limitation.field) {
            failures.push(`${prefix}.field is required`);
        } else if (BLOCKED_KANJI_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field cannot be a core kanji-card truth field: ${limitation.field}`);
        } else if (!ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field must be one of: ${ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS.join(", ")}`);
        }
        if (!limitation.status) {
            failures.push(`${prefix}.status is required`);
        } else if (!ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES.includes(limitation.status)) {
            failures.push(`${prefix}.status must be one of: ${ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES.join(", ")}`);
        }
        if (!limitation.label) {
            failures.push(`${prefix}.label is required`);
        } else if (!/\bunverified\b|not verified|limited verification/i.test(limitation.label)) {
            failures.push(`${prefix}.label must visibly say what is unverified or has limited verification`);
        }
        if (!limitation.reviewNote) {
            failures.push(`${prefix}.reviewNote must describe the review attempt and limitation`);
        }
    }

    return failures;
}

function validateNonShippingEntry(entry = {}) {
    const failures = [];

    if (!SINGLE_KANJI_RE.test(normalizeText(entry.kanji))) {
        failures.push("kanji must be one target kanji");
    }
    if (!normalizeText(entry.reviewedAt)) {
        failures.push("reviewedAt is required for deferred and removed entries");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required for deferred and removed entries");
    }
    if (!normalizeText(entry.decisionReason)) {
        failures.push("decisionReason is required for deferred and removed entries");
    }

    return failures;
}

function validateRevalidationEntry(entry = {}) {
    const failures = [];

    if (!SINGLE_KANJI_RE.test(normalizeText(entry.kanji))) {
        failures.push("kanji must be one target kanji");
    }
    if (!ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.previousStatus))) {
        failures.push(`needs_revalidation entries must preserve previousStatus as one of: ${ACTIVE_PLATINUM_STATUSES.join(", ")}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD for needs_revalidation history");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required for needs_revalidation history");
    }
    if (!normalizeText(entry.decisionReason)) {
        failures.push("decisionReason is required for needs_revalidation history");
    }

    return failures;
}

function validateGeneratedKanjiRow(row = {}) {
    const failures = [];
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const audio = normalizeText(row.audio);
    const exactAudioFragment = `kanji-reading-${kanji}-${primaryReading}`;

    if (!SINGLE_KANJI_RE.test(kanji)) {
        failures.push("Kanji field is not one target kanji");
    }
    if (normalizeText(row.displayWord) !== kanji) {
        failures.push("DisplayWord does not equal the target kanji");
    }
    if (normalizeText(row.studyWordKanji)) {
        failures.push("StudyWordKanji must be blank for kanji cards");
    }
    if (!primaryReading) {
        failures.push("PrimaryReading is empty");
    } else {
        const sourceReadings = buildGeneratedKanjiReadingSet(row);
        if (sourceReadings.size > 0 && !sourceReadings.has(normalizeJapaneseReading(primaryReading))) {
            failures.push(`PrimaryReading is not an exact source/inventory on/kun reading: ${primaryReading} not in OnReading/KunReading`);
        }
    }
    if (!normalizeText(row.meaningJP)) {
        failures.push("MeaningJP is empty");
    }
    if (!normalizeText(row.kanjiMeanings)) {
        failures.push("KanjiMeanings is empty");
    }
    if (!normalizeText(row.notes)) {
        failures.push("Notes are empty");
    }
    if (normalizeText(row.notes).includes("Offline preview built from local data only.")) {
        failures.push("Notes still use the generic offline fallback");
    }
    if (!normalizeText(row.exampleSentence)) {
        failures.push("ExampleSentence is empty");
    }
    if (!normalizeText(row.strokeOrder)) {
        failures.push("StrokeOrder field is empty");
    }
    if (!audio) {
        failures.push("Audio field is empty");
    } else if (!audio.includes("kanji-reading")) {
        failures.push("Audio field is not kanji-reading audio");
    } else if (!audio.includes(exactAudioFragment)) {
        failures.push(`Audio field does not reference exact primary-reading audio: ${exactAudioFragment}`);
    }

    return failures;
}

function validateKanjiEvidenceBindings({
    entry = {},
    goldExpectation,
    requireCurrentReviewStandard = false,
    row = {},
    sapphireEntry,
} = {}) {
    const failures = [];
    const resolvedFields = buildResolvedKanjiFields({ entry, goldExpectation, sapphireEntry });
    const kanji = normalizeText(entry.kanji);
    const primaryReading = normalizeStringArray(resolvedFields.readingIncludes)[0] || row.primaryReading;
    const exactAudioFragment = `kanji-reading-${kanji}-${primaryReading}`;
    const sourceEvidence = entry.sourceEvidence || [];
    const internalChecks = entry.internalChecks || [];
    const reviewEvidence = entry.reviewEvidence || [];
    const requiresCurrentStandardEvidence = (
        requireCurrentReviewStandard
        || entry.reviewStandard !== undefined
        || entry.revalidatedAt !== undefined
        || entry.revalidationSummary !== undefined
    );

    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "generated-surface",
        label: "generated kanji surface",
        snippets: [kanji, primaryReading, "single-kanji", "meaning", "notes", "example", "audio", "stroke-order"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "japanese-source",
        label: "primary reading, primary meaning, and broader meanings",
        snippets: [
            kanji,
            primaryReading,
            ...normalizeStringArray(resolvedFields.meaningIncludes),
            ...normalizeStringArray(resolvedFields.kanjiMeaningsIncludes),
        ],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "golden-regression",
        label: "separate golden regression gate",
        snippets: [kanji, "separate", "regression", "not", "source"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "media-audit",
        label: "managed media provenance",
        snippets: [kanji, exactAudioFragment, "stroke-order", "media"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "audio-review",
        label: "exact kanji-reading audio",
        snippets: [kanji, exactAudioFragment],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "stroke-order-review",
        label: "stroke-order target and provenance",
        snippets: [kanji, "visual", "source"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: reviewEvidence,
        type: "manual-review",
        label: "final kanji-card product judgment",
        snippets: [kanji, "individual-kanji", "learner"],
    }));
    if (requiresCurrentStandardEvidence) {
        const exampleParts = normalizeText(row.exampleSentence)
            .split("／")
            .map((part) => normalizeText(part))
            .filter(Boolean);
        const currentStandardSnippets = [
            kanji,
            primaryReading,
            ...normalizeStringArray(resolvedFields.meaningIncludes),
            ...normalizeStringArray(resolvedFields.kanjiMeaningsIncludes),
            ...normalizeStringArray(resolvedFields.exampleIncludes),
            ...normalizeStringArray(resolvedFields.notesIncludes),
            exactAudioFragment,
            "evidence lanes",
            "generated surface",
            "Japanese-source",
            "example sentence",
            "notes/support surface",
            "reading",
            "translation",
            "audio",
            "stroke-order media",
            "release",
            "support",
            "learner-friendly",
            "useful",
            "level-appropriate",
            "natural",
            "verification limitations",
        ];
        if (exampleParts[1]) {
            currentStandardSnippets.push(exampleParts[1]);
        }
        if (exampleParts[2]) {
            currentStandardSnippets.push(exampleParts[2]);
        }
        const limitations = normalizeKanjiVerificationLimitations(entry.verificationLimitations);
        if (limitations.length === 0) {
            currentStandardSnippets.push("no active limitations");
        } else {
            currentStandardSnippets.push(...limitations.map((limitation) => limitation.label));
        }
        failures.push(...validateEvidenceSnippets({
            sourceEvidence: reviewEvidence,
            type: "current-standard-review",
            label: "current-standard whole-card revalidation",
            snippets: currentStandardSnippets,
        }));
    }
    for (const limitation of normalizeKanjiVerificationLimitations(entry.verificationLimitations)) {
        failures.push(...validateEvidenceSnippets({
            sourceEvidence: reviewEvidence,
            type: "manual-review",
            label: `verification limitation ${limitation.field}`,
            snippets: [kanji, limitation.label],
        }));
        if (!includesAll(row.notes, [limitation.label])) {
            failures.push(`Notes must include verification limitation label: ${limitation.label}`);
        }
    }

    return failures;
}

function evaluatePlatinumKanjiEntry({
    rows = [],
    entry = {},
    goldExpectation,
    sourceOriginFailures = [],
    sourceOriginIds = [],
    sapphireEntry,
} = {}) {
    const status = normalizeText(entry.status);
    const label = normalizeText(entry.kanji) || "(blank)";
    const failures = [];
    const resolvedFields = buildResolvedKanjiFields({ entry, goldExpectation, sapphireEntry });

    if (!ALLOWED_PLATINUM_STATUSES.includes(status)) {
        failures.push(`unsupported platinum status: ${status || "(blank)"}`);
    }

    if (ACTIVE_PLATINUM_STATUSES.includes(status)) {
        if (!entryUsesCurrentKanjiPlatinumStandard(entry)) {
            failures.push("active platinum status requires current-standard revalidation with required evidence lanes; use needs_revalidation for legacy/unversioned review history");
        }
        failures.push(...sourceOriginFailures);
        failures.push(...validateActivePlatinumEntry(entry, {
            goldExpectation,
            requireCurrentReviewStandard: true,
            sapphireEntry,
            sourceOriginIds,
        }));
        const row = findKanjiRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (!row) {
            failures.push("active platinum kanji could not be generated");
        } else {
            failures.push(...validateGeneratedKanjiRow(row));
            failures.push(...validateKanjiEvidenceBindings({
                entry,
                goldExpectation,
                requireCurrentReviewStandard: true,
                row,
                sapphireEntry,
            }));
            if (normalizeStringArray(resolvedFields.readingIncludes).length > 0 && !includesAll(row.primaryReading, resolvedFields.readingIncludes)) {
                failures.push(`primary reading did not include: ${resolvedFields.readingIncludes.join(", ")}`);
            }
            const generatedMeaningText = `${row.meaningJP || ""} ／ ${row.kanjiMeanings || ""}`;
            if (normalizeStringArray(resolvedFields.meaningIncludes).length > 0 && !includesAll(generatedMeaningText, resolvedFields.meaningIncludes)) {
                failures.push(`meaning fields did not include: ${resolvedFields.meaningIncludes.join(", ")}`);
            }
            if (normalizeStringArray(resolvedFields.kanjiMeaningsIncludes).length > 0 && !includesAll(row.kanjiMeanings, resolvedFields.kanjiMeaningsIncludes)) {
                failures.push(`kanji meanings did not include: ${resolvedFields.kanjiMeaningsIncludes.join(", ")}`);
            }
            if (normalizeStringArray(resolvedFields.levelIncludes).length > 0 && !includesAll(row.levelLabel, resolvedFields.levelIncludes)) {
                failures.push(`level label did not include: ${resolvedFields.levelIncludes.join(", ")}`);
            }
            if (normalizeStringArray(resolvedFields.exampleIncludes).length > 0 && !includesAll(row.exampleSentence, resolvedFields.exampleIncludes)) {
                failures.push(`example did not include: ${resolvedFields.exampleIncludes.join(", ")}`);
            }
            if (normalizeStringArray(resolvedFields.notesIncludes).length > 0 && !includesAll(row.notes, resolvedFields.notesIncludes)) {
                failures.push(`notes did not include: ${resolvedFields.notesIncludes.join(", ")}`);
            }
        }
    } else if (NON_SHIPPING_STATUSES.includes(status)) {
        failures.push(...validateNonShippingEntry(entry));
        const row = findKanjiRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (row) {
            failures.push(`${status} kanji still appears in the generated export`);
        }
    } else if (REVALIDATION_STATUSES.includes(status)) {
        failures.push(...validateRevalidationEntry(entry));
    } else if (REVIEW_ONLY_STATUSES.includes(status)) {
        failures.push("entry is still needs_review and cannot pass platinum");
    }

    return {
        label,
        kanji: entry.kanji,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
        verificationLimitations: isCurrentStandardPlatinumEntry(entry)
            ? normalizeKanjiVerificationLimitations(entry.verificationLimitations)
            : [],
    };
}

function buildMissingPlatinumRows({ rows = [], activeEntries = [] } = {}) {
    return rows
        .filter((row) => !activeEntries.some((entry) => entry.kanji === row.kanji))
        .map((row) => row.kanji)
        .sort();
}

function buildDuplicateActiveEntryLabels(activeEntries = []) {
    const labelsByKey = new Map();
    const keys = [];

    for (const entry of activeEntries) {
        const key = buildPlatinumReviewKey({ kanji: entry.kanji });
        keys.push(key);
        labelsByKey.set(key, entry.kanji || key);
    }

    return findDuplicateValues(keys).map((key) => labelsByKey.get(key) || key);
}

function evaluatePlatinumKanjiReviewSet({
    rows = [],
    entries = [],
    goldenExpectations,
    requireGoldPrecondition = false,
    sapphireEntries,
    sapphireResults = [],
    requireSapphirePrecondition = false,
    kanjiSourceEvidence = getDefaultJlptKanjiSourceEvidence(),
    requireCurrentReviewStandard = false,
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeStatusEntries = reviewEntries.filter(hasActivePlatinumStatus);
    const activeEntries = reviewEntries.filter(isCurrentStandardPlatinumEntry);
    const reviewStandardSummary = buildKanjiReviewStandardSummary(reviewEntries);
    const currentStandardEntries = activeEntries;
    const nonShippingEntries = reviewEntries.filter((entry) => NON_SHIPPING_STATUSES.includes(normalizeText(entry.status)));
    const needsRevalidationEntries = reviewEntries.filter((entry) => REVALIDATION_STATUSES.includes(normalizeText(entry.status)));
    const needsReviewEntries = reviewEntries.filter((entry) => normalizeText(entry.status) === "needs_review");
    const goldPreconditionFailures = requireGoldPrecondition
        ? buildKanjiGoldPreconditionFailuresByKey({
            rows: generatedRows,
            entries: activeEntries,
            goldenExpectations,
            laneName: "Platinum",
        })
        : new Map();
    const sapphirePreconditionFailures = requireSapphirePrecondition
        ? buildCurrentStandardPreconditionFailuresByKey({
            entries: activeEntries,
            priorEntries: sapphireEntries,
            priorResults: sapphireResults,
            laneName: "Platinum",
            priorLaneName: "Sapphire",
            getEntryKey: (entry) => entry.kanji,
            getResultKey: (result) => result.kanji,
            isCurrentStandardPriorEntry: (entry) => (
                ACTIVE_SAPPHIRE_PRECONDITION_STATUSES.includes(normalizeText(entry.status))
                && entry.reviewStandard === PRIOR_KANJI_SAPPHIRE_REVIEW_STANDARD
            ),
        })
        : new Map();
    const results = reviewEntries.map((entry) => {
        const laneContext = resolveKanjiLaneContext({
            entry,
            goldenExpectations,
            sapphireEntries,
            sapphireResults,
        });
        const preconditionFailures = [
            ...(goldPreconditionFailures.get(entry.kanji) || []),
            ...(sapphirePreconditionFailures.get(entry.kanji) || []),
            ...laneContext.failures,
        ];
        try {
            const sourceOriginIds = resolveKanjiSourceOriginIdsForEntry({
                evidence: kanjiSourceEvidence,
                entry,
            });
            return mergeFailuresIntoResult(evaluatePlatinumKanjiEntry({
                rows: generatedRows,
                entry,
                goldExpectation: laneContext.goldExpectation,
                sourceOriginIds,
                sapphireEntry: laneContext.sapphireEntry,
            }), preconditionFailures);
        } catch (error) {
            return mergeFailuresIntoResult(evaluatePlatinumKanjiEntry({
                rows: generatedRows,
                entry,
                goldExpectation: laneContext.goldExpectation,
                sourceOriginFailures: [`could not resolve kanji source-claim origin ids: ${error.message}`],
                sapphireEntry: laneContext.sapphireEntry,
            }), preconditionFailures);
        }
    });
    const coverageFailures = [];
    const duplicateActiveEntries = buildDuplicateActiveEntryLabels(activeEntries);
    const missingPlatinumRows = requireAllRows
        ? buildMissingPlatinumRows({ rows: generatedRows, activeEntries })
        : [];
    const missingCurrentStandardRows = requireAllRows && requireCurrentReviewStandard
        ? buildMissingPlatinumRows({ rows: generatedRows, activeEntries: currentStandardEntries })
        : [];

    if (!allowEmpty && activeEntries.length === 0) {
        coverageFailures.push("no Platinum entries have been reviewed");
    }
    if (duplicateActiveEntries.length > 0) {
        coverageFailures.push(`duplicate active platinum entries: ${duplicateActiveEntries.join(", ")}`);
    }
    if (missingPlatinumRows.length > 0) {
        coverageFailures.push(`missing Platinum entries for generated kanji: ${missingPlatinumRows.length} (Platinum coverage requires current-standard revalidation)`);
    }
    if (missingCurrentStandardRows.length > 0 && missingCurrentStandardRows.length !== missingPlatinumRows.length) {
        coverageFailures.push(`missing current-standard Platinum entries for generated kanji: ${missingCurrentStandardRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;
    const verificationLimitationSummary = buildKanjiVerificationLimitationSummary(activeEntries);

    return {
        totalEntries: reviewEntries.length,
        activePlatinumCount: activeEntries.length,
        activePlatinumStatusCount: activeStatusEntries.length,
        currentReviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        currentStandardPlatinumCount: reviewStandardSummary.currentStandardCount,
        legacyOrUnversionedPlatinumCount: reviewStandardSummary.legacyOrUnversionedCount,
        revalidationBacklogCount: reviewStandardSummary.revalidationBacklogCount,
        currentStandardKanji: reviewStandardSummary.currentStandardKanji,
        legacyOrUnversionedKanji: reviewStandardSummary.legacyOrUnversionedKanji,
        revalidationBacklogKanji: reviewStandardSummary.revalidationBacklogKanji,
        nonShippingCount: nonShippingEntries.length,
        needsRevalidationCount: needsRevalidationEntries.length,
        needsReviewCount: needsReviewEntries.length,
        verificationLimitationCount: verificationLimitationSummary.limitationCount,
        verificationLimitationKanjiCount: verificationLimitationSummary.kanjiCount,
        verificationLimitationFieldCounts: verificationLimitationSummary.fieldCounts,
        verificationLimitations: verificationLimitationSummary.limitations,
        passedCount,
        failedCount,
        passed: failedCount === 0 && coverageFailures.length === 0,
        coverageFailures,
        duplicateActiveEntries,
        missingPlatinumRows,
        missingCurrentStandardRows,
        results,
    };
}

function formatPlatinumKanjiReviewReport(report = {}, { title = "Japanese Kanji Builder Platinum Kanji Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        "Tier: Platinum (current-standard card-surface inspection; not Obsidian certification)",
        `Platinum cards: ${report.activePlatinumCount || 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_KANJI_PLATINUM_REVIEW_STANDARD}`,
        `Current-standard Platinum cards: ${report.currentStandardPlatinumCount || 0}`,
        `Revalidation backlog/history cards: ${report.revalidationBacklogCount ?? report.legacyOrUnversionedPlatinumCount ?? 0}`,
        `Active cards with verification limitations: ${report.verificationLimitationKanjiCount || 0}`,
        `Verification limitations: ${report.verificationLimitationCount || 0}`,
        `Deferred/removed tracked: ${report.nonShippingCount || 0}`,
        `Needs revalidation: ${report.needsRevalidationCount || 0}`,
        `Needs review: ${report.needsReviewCount || 0}`,
        `Passed entries: ${report.passedCount || 0}`,
        `Failed entries: ${report.failedCount || 0}`,
        `Overall result: ${report.passed ? "passing" : "failing"}`,
    ];

    if (Array.isArray(report.coverageFailures) && report.coverageFailures.length > 0) {
        lines.push("", "Coverage failures:");
        for (const failure of report.coverageFailures) {
            lines.push(`- ${failure}`);
        }
    }

    if (Array.isArray(report.missingPlatinumRows) && report.missingPlatinumRows.length > 0) {
        const sampleSize = 30;
        const sample = report.missingPlatinumRows.slice(0, sampleSize);
        lines.push("", `Missing Platinum kanji sample (${sample.length}/${report.missingPlatinumRows.length}):`);
        for (const kanji of sample) {
            lines.push(`- ${kanji}`);
        }
        if (report.missingPlatinumRows.length > sampleSize) {
            lines.push(`- ... ${report.missingPlatinumRows.length - sampleSize} more`);
        }
    }

    if (
        Array.isArray(report.missingCurrentStandardRows)
        && report.missingCurrentStandardRows.length > 0
        && report.missingCurrentStandardRows.length !== (report.missingPlatinumRows || []).length
    ) {
        const sampleSize = 30;
        const sample = report.missingCurrentStandardRows.slice(0, sampleSize);
        lines.push("", `Missing current-standard Platinum sample (${sample.length}/${report.missingCurrentStandardRows.length}):`);
        for (const kanji of sample) {
            lines.push(`- ${kanji}`);
        }
        if (report.missingCurrentStandardRows.length > sampleSize) {
            lines.push(`- ... ${report.missingCurrentStandardRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${limitation.kanji}: ${limitation.field} (${limitation.status}) - ${limitation.label}`);
        }
    }

    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: manifest status=${result.status}; Platinum gate ${result.passed ? "pass" : "fail"}`);
        if (!result.passed) {
            for (const failure of result.failures) {
                lines.push(`  ${failure}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    ACTIVE_PLATINUM_STATUSES,
    ALLOWED_PLATINUM_STATUSES,
    ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS,
    ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES,
    BLOCKED_KANJI_VERIFICATION_LIMITATION_FIELDS,
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REVALIDATION_STATUSES,
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
    REVIEW_ONLY_STATUSES,
    buildKanjiReviewStandardSummary,
    buildKanjiVerificationLimitationSummary,
    entryUsesCurrentKanjiPlatinumStandard,
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
    isCurrentStandardPlatinumEntry,
    normalizeKanjiVerificationLimitations,
    validateGeneratedKanjiRow,
    validateCurrentKanjiPlatinumReviewStandard,
    validateKanjiVerificationLimitations,
};
