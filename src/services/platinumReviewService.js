const { evaluateGoldenWordReviewSet } = require("./goldenReviewService");
const {
    buildCurrentStandardPreconditionFailuresByKey,
    buildWordEntryIdentity,
    buildWordGoldPreconditionFailuresByKey,
    mergeFailuresIntoResult,
    validatePlatinumLaneAuthorityBoundary,
} = require("./reviewLanePreconditionService");
const {
    buildResolvedWordFields,
    resolveCurrentStandardWordSapphireEntry,
    resolveWordGoldExpectation,
} = require("./reviewLaneContextService");
const {
    extractRenderedPitchAccentPattern,
    parsePitchAccentPattern,
} = require("./pitchAccentRenderService");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const {
    GENERATED_PITCH_LABEL,
    arraysMatch,
    isGeneratedPitchAccentSource,
    validateWordPitchAccentSource,
} = require("./wordPitchAccentVerificationService");
const {
    normalizeEvidenceEntries,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
} = require("./platinumEvidenceService");
const {
    buildWordLevelAnchorResult,
    formatWordLevelAnchorFailure,
} = require("./wordLevelAnchorAuditService");
const { decodeHtmlEntities } = require("../utils/text");

const ACTIVE_PLATINUM_STATUSES = Object.freeze(["platinum", "fixed_then_platinum"]);
const NON_SHIPPING_STATUSES = Object.freeze(["deferred", "removed"]);
const REVIEW_ONLY_STATUSES = Object.freeze(["needs_review"]);
const ALLOWED_PLATINUM_STATUSES = Object.freeze([
    ...ACTIVE_PLATINUM_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const CURRENT_WORD_PLATINUM_REVIEW_STANDARD = "word-platinum-v3-evidence-lanes";
const PRIOR_WORD_SAPPHIRE_REVIEW_STANDARD = "word-sapphire-v1-evidence-lanes";
const ACTIVE_WORD_SAPPHIRE_PRECONDITION_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);

const CURRENT_STANDARD_REVALIDATION_SUMMARY_CHECKS = Object.freeze([
    Object.freeze({ label: "evidence lanes", requiredPatterns: [/evidence/i, /lanes?/i] }),
    Object.freeze({ label: "generated surface", requiredPatterns: [/generated/i, /surface/i] }),
    Object.freeze({ label: "Japanese source evidence", requiredPatterns: [/japanese[- ]source/i, /evidence/i] }),
    Object.freeze({ label: "example sentence", requiredPatterns: [/example/i, /sentence/i] }),
    Object.freeze({ label: "notes/support surface", requiredPatterns: [/notes?/i, /support/i, /surface/i] }),
    Object.freeze({ label: "reading breakdown", requiredPatterns: [/reading/i, /breakdown/i] }),
    Object.freeze({ label: "labels", requiredPatterns: [/labels?/i] }),
    Object.freeze({ label: "audio", requiredPatterns: [/audio/i] }),
    Object.freeze({ label: "pitch accent", requiredPatterns: [/pitch/i, /accent/i] }),
    Object.freeze({ label: "media provenance", requiredPatterns: [/media/i, /provenance/i] }),
    Object.freeze({ label: "verification limitations", requiredPatterns: [/verification/i, /limitations?/i] }),
]);

const REQUIRED_WORD_QUALITY_GATES = Object.freeze([
    "belongsInWordDeck",
    "commonOrUseful",
    "learnerFriendly",
    "writtenFormVerified",
    "readingVerified",
    "japaneseVerified",
    "meaningReleaseQuality",
    "exampleReleaseQuality",
    "exampleReadingVerified",
    "breakdownVerified",
    "levelPlacementVerified",
    "labelsVerified",
    "audioExactWordReading",
    "audioArtifactVerified",
    "pitchAccentVerified",
    "pitchAccentSourceVerified",
    "mediaProvenanceVerified",
    "noSilentFallback",
]);

const REQUIRED_WORD_SOURCE_EVIDENCE_TYPES = Object.freeze([
    "japanese-source",
]);

const REQUIRED_WORD_INTERNAL_CHECK_TYPES = Object.freeze([
    "generated-surface",
    "golden-regression",
    "level-contract",
    "media-audit",
    "audio-review",
    "pitch-accent-review",
    "label-review",
]);

const REQUIRED_WORD_REVIEW_EVIDENCE_TYPES = Object.freeze([
    "example-review",
    "manual-review",
    "current-standard-review",
]);

const BLOCKED_WORD_EVIDENCE_TYPES = Object.freeze([
    "golden-review",
    ...REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    ...REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
]);

const ALLOWED_WORD_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "audioNaturalness",
    "exampleSupportNuance",
    "notesSupportNuance",
    "pitchAccent",
    "sourceAvailability",
]);

const BLOCKED_WORD_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "word",
    "writtenForm",
    "reading",
    "meaning",
    "exampleSentence",
    "productFit",
]);

const ALLOWED_WORD_VERIFICATION_LIMITATION_STATUSES = Object.freeze([
    "externally_unverified",
    "limited_source",
    "manual_review_only",
]);

const SINGLE_KANJI_WORD_RE = /^\p{Script=Han}$/u;

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

function normalizeLiteralCompare(value) {
    return normalizeText(value)
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function includesAll(haystack, needles = []) {
    const normalizedHaystack = normalizeForCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => normalizedHaystack.includes(normalizeForCompare(needle)));
}

function includesAllLiteral(haystack, needles = []) {
    const normalizedHaystack = normalizeLiteralCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => normalizedHaystack.includes(normalizeLiteralCompare(needle)));
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function normalizeWordVerificationLimitations(value) {
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

function validateCurrentWordPlatinumReviewStandard(entry = {}) {
    const failures = [];
    const reviewStandard = normalizeReviewStandard(entry.reviewStandard);
    const revalidatedAt = normalizeText(entry.revalidatedAt);
    const revalidationSummary = normalizeText(entry.revalidationSummary);
    const reviewEvidence = normalizeEvidenceEntries(entry.reviewEvidence);
    const reviewEvidenceTypes = new Set(reviewEvidence.map((evidence) => evidence.type));

    if (reviewStandard !== CURRENT_WORD_PLATINUM_REVIEW_STANDARD) {
        failures.push(`reviewStandard must be ${CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revalidatedAt)) {
        failures.push("revalidatedAt must be YYYY-MM-DD for the current word platinum standard");
    }
    if (!revalidationSummary) {
        failures.push("revalidationSummary is required for the current word platinum standard");
    } else {
        for (const check of CURRENT_STANDARD_REVALIDATION_SUMMARY_CHECKS) {
            if (!check.requiredPatterns.every((pattern) => pattern.test(revalidationSummary))) {
                failures.push(`revalidationSummary must mention ${check.label}`);
            }
        }
    }
    if (!reviewEvidenceTypes.has("current-standard-review")) {
        failures.push("reviewEvidence must include evidence type: current-standard-review for the current word platinum standard");
    }

    return failures;
}

function entryUsesCurrentWordPlatinumStandard(entry = {}) {
    return validateCurrentWordPlatinumReviewStandard(entry).length === 0;
}

function buildWordReviewStandardSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const currentStandardEntries = activeEntries.filter(entryUsesCurrentWordPlatinumStandard);
    const legacyEntries = activeEntries.filter((entry) => !entryUsesCurrentWordPlatinumStandard(entry));

    return {
        currentStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        currentStandardCount: currentStandardEntries.length,
        legacyOrUnversionedCount: legacyEntries.length,
        currentStandardWords: currentStandardEntries
            .map((entry) => formatWordReviewLabel(entry.word, buildExpectedReadingText(entry)))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ja")),
        legacyOrUnversionedWords: legacyEntries
            .map((entry) => formatWordReviewLabel(entry.word, buildExpectedReadingText(entry)))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ja")),
    };
}

function buildWordVerificationLimitationSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const limitationRows = [];
    const fieldCounts = {};

    for (const entry of activeEntries) {
        const limitations = normalizeWordVerificationLimitations(entry.verificationLimitations);
        for (const limitation of limitations) {
            limitationRows.push({
                word: normalizeText(entry.word),
                reading: buildExpectedReadingText(entry),
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
        wordCount: new Set(limitationRows.map((limitation) => `${limitation.word}|${limitation.reading}`).filter(Boolean)).size,
        fieldCounts,
        limitations: limitationRows.sort((left, right) => (
            formatWordReviewLabel(left.word, left.reading).localeCompare(formatWordReviewLabel(right.word, right.reading), "ja")
            || left.field.localeCompare(right.field)
            || left.label.localeCompare(right.label)
        )),
    };
}

function buildExpectedReadingText(entry = {}) {
    return normalizeStringArray(entry.readingIncludes).join(" / ");
}

function buildPlatinumReviewKey({ word = "", reading = "" } = {}) {
    return `${normalizeForCompare(word)}|${normalizeForCompare(reading)}`;
}

function formatWordReviewLabel(word, reading = "") {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord} (${normalizedReading})` : normalizedWord;
}

function wordRowMatchesEntry(row = {}, entry = {}) {
    if (row.word !== entry.word) {
        return false;
    }
    const expectedReadings = normalizeStringArray(entry.readingIncludes);
    if (expectedReadings.length === 0) {
        return true;
    }
    return includesAll(row.reading, expectedReadings);
}

function findWordRowForEntry(rows = [], entry = {}) {
    const matches = rows.filter((row) => wordRowMatchesEntry(row, entry));
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        return {
            word: entry.word,
            error: `ambiguous generated word rows: ${matches.map((row) => formatWordReviewLabel(row.word, row.reading)).join(", ")}`,
        };
    }
    return null;
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

function resolveEvidenceLane(entry = {}, sapphireEntry = {}, laneName = "") {
    return Array.isArray(entry[laneName]) ? entry[laneName] : sapphireEntry?.[laneName];
}

function validateActivePlatinumEntry(entry = {}, {
    goldExpectation = null,
    requireCurrentReviewStandard = false,
    sapphireEntry = null,
} = {}) {
    const failures = [];
    const resolvedFields = buildResolvedWordFields({
        entry,
        goldExpectation,
        sapphireEntry,
    });

    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    if (normalizeStringArray(entry.readingIncludes).length === 0) {
        failures.push("readingIncludes must name the exact reviewed reading");
    }
    if (resolvedFields.meaningIncludes.length === 0) {
        failures.push("Gold-owned meaningIncludes must protect the learner-facing meaning");
    }
    if (resolvedFields.jlptLevelIncludes.length === 0) {
        failures.push("Gold-owned jlptLevelIncludes must protect the displayed level label");
    }
    if (resolvedFields.coverageRoleIncludes.length === 0) {
        failures.push("Gold-owned coverageRoleIncludes must protect the card role");
    }
    if (resolvedFields.breakdownIncludes.length === 0) {
        failures.push("Gold-owned breakdownIncludes must protect the reading and kanji breakdown");
    }
    if (resolvedFields.focusIncludes.length === 0) {
        failures.push("Gold-owned focusIncludes must protect the reviewed focus kanji");
    }
    if (resolvedFields.coversReadingIncludes.length === 0) {
        failures.push("Gold-owned coversReadingIncludes must protect the reviewed reading-coverage labels");
    }
    if (resolvedFields.exampleIncludes.length === 0) {
        failures.push("Gold-owned exampleIncludes must protect the release-quality example");
    }
    if (normalizeStringArray(resolvedFields.pitchAccentIncludes).length === 0) {
        failures.push("pitchAccentIncludes must protect the reviewed pitch accent");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required");
    }
    if (!normalizeText(entry.selectionRationale)) {
        failures.push("selectionRationale must explain why this word ships in the reviewed level");
    }
    failures.push(...validatePlatinumLaneAuthorityBoundary({ deckKind: "word", entry }));

    const sourceEvidenceLane = resolveEvidenceLane(entry, sapphireEntry, "sourceEvidence");
    const internalChecksLane = resolveEvidenceLane(entry, sapphireEntry, "internalChecks");
    const reviewEvidenceLane = resolveEvidenceLane(entry, sapphireEntry, "reviewEvidence");
    const sourceEvidence = normalizeEvidenceEntries(sourceEvidenceLane);
    failures.push(...validateStructuredEvidenceLane(sourceEvidenceLane, {
        fieldName: "sourceEvidence",
        requiredTypes: REQUIRED_WORD_SOURCE_EVIDENCE_TYPES,
        blockedTypes: BLOCKED_WORD_EVIDENCE_TYPES,
    }));
    failures.push(...validateStructuredEvidenceLane(internalChecksLane, {
        fieldName: "internalChecks",
        requiredTypes: REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    }));
    failures.push(...validateStructuredEvidenceLane(reviewEvidenceLane, {
        fieldName: "reviewEvidence",
        requiredTypes: REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
        blockedTypes: ["golden-review"],
    }));
    failures.push(...validateJapaneseSourceEvidence(sourceEvidence, {
        context: "word card accuracy",
        alternativeRequiredUses: SINGLE_KANJI_WORD_RE.test(normalizeText(entry.word))
            ? ["single-kanji-word-field-verification"]
            : [],
        requiredUse: "word-field-verification",
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
        failures.push(...validateCurrentWordPlatinumReviewStandard(entry));
    }
    failures.push(...validateWordVerificationLimitations(entry));

    const gates = entry.qualityGates || {};
    for (const gate of REQUIRED_WORD_QUALITY_GATES) {
        if (gates[gate] !== true) {
            failures.push(`quality gate must be true: ${gate}`);
        }
    }

    return failures;
}

function validateWordVerificationLimitations(entry = {}) {
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

        const limitation = normalizeWordVerificationLimitations([rawLimitation])[0] || {};
        const prefix = `verificationLimitations[${index}]`;
        if (!limitation.field) {
            failures.push(`${prefix}.field is required`);
        } else if (BLOCKED_WORD_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field cannot be a core word-card truth field: ${limitation.field}`);
        } else if (!ALLOWED_WORD_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field must be one of: ${ALLOWED_WORD_VERIFICATION_LIMITATION_FIELDS.join(", ")}`);
        }
        if (!limitation.status) {
            failures.push(`${prefix}.status is required`);
        } else if (!ALLOWED_WORD_VERIFICATION_LIMITATION_STATUSES.includes(limitation.status)) {
            failures.push(`${prefix}.status must be one of: ${ALLOWED_WORD_VERIFICATION_LIMITATION_STATUSES.join(", ")}`);
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

function validateWordEvidenceBindings({
    entry = {},
    goldExpectation = null,
    requireCurrentReviewStandard = false,
    row = {},
    sapphireEntry = null,
    sourcePitchAccent = null,
} = {}) {
    const failures = [];
    const resolvedFields = buildResolvedWordFields({
        entry,
        goldExpectation,
        sapphireEntry,
    });
    const readings = normalizeStringArray(entry.readingIncludes);
    const reading = readings[0] || row.reading;
    const wordLabel = `${entry.word}|${reading}`;
    const expectedAudioFragment = `word-reading-${entry.word}-${reading}`;
    const sourceEvidence = resolveEvidenceLane(entry, sapphireEntry, "sourceEvidence") || [];
    const internalChecks = resolveEvidenceLane(entry, sapphireEntry, "internalChecks") || [];
    const reviewEvidence = resolveEvidenceLane(entry, sapphireEntry, "reviewEvidence") || [];
    const requiresCurrentStandardEvidence = (
        requireCurrentReviewStandard
        || entry.reviewStandard !== undefined
        || entry.revalidatedAt !== undefined
        || entry.revalidationSummary !== undefined
    );

    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "generated-surface",
        label: "generated word surface",
        snippets: [wordLabel, "word", "reading", "meaning", "example", "audio"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "japanese-source",
        label: "written form, reading, meaning, and example",
        snippets: [wordLabel, ...readings, ...resolvedFields.meaningIncludes, ...resolvedFields.exampleIncludes],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "level-contract",
        label: "word level placement",
        snippets: [wordLabel, ...resolvedFields.jlptLevelIncludes],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: reviewEvidence,
        type: "example-review",
        label: "example sentence and reading",
        snippets: [wordLabel, ...readings, ...resolvedFields.exampleIncludes],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "golden-regression",
        label: "separate golden regression gate",
        snippets: [wordLabel, "separate", "regression", "not", "source"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "media-audit",
        label: "managed media provenance",
        snippets: [wordLabel, expectedAudioFragment, "media"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "audio-review",
        label: "exact word-reading audio",
        snippets: [wordLabel, expectedAudioFragment],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "pitch-accent-review",
        label: "pitch accent source and rendered value",
        snippets: [
            wordLabel,
            sourcePitchAccent?.sourceId,
            sourcePitchAccent?.pattern,
            ...normalizeStringArray(resolvedFields.pitchAccentIncludes),
        ],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: internalChecks,
        type: "label-review",
        label: "JLPT, coverage, focus, and reading labels",
        snippets: [
            wordLabel,
            ...resolvedFields.jlptLevelIncludes,
            ...resolvedFields.coverageRoleIncludes,
            ...resolvedFields.focusIncludes,
            ...resolvedFields.coversReadingIncludes,
        ],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence: reviewEvidence,
        type: "manual-review",
        label: "final word-card product judgment",
        snippets: [wordLabel, "common", "learner"],
    }));
    if (requiresCurrentStandardEvidence) {
        const currentStandardSnippets = [
            wordLabel,
            ...readings,
            ...resolvedFields.meaningIncludes,
            ...resolvedFields.exampleIncludes,
            ...resolvedFields.breakdownIncludes,
            ...resolvedFields.jlptLevelIncludes,
            ...resolvedFields.coverageRoleIncludes,
            ...resolvedFields.focusIncludes,
            ...resolvedFields.coversReadingIncludes,
            ...resolvedFields.notesIncludes,
            ...normalizeStringArray(resolvedFields.pitchAccentIncludes),
            sourcePitchAccent?.sourceId,
            sourcePitchAccent?.pattern,
            expectedAudioFragment,
            "generated surface",
            "Japanese-source",
            "example sentence",
            "notes/support surface",
            "reading breakdown",
            "meaning",
            "labels",
            "audio",
            "pitch accent",
            "media",
            "release",
            "common",
            "useful",
            "learner-friendly",
            "level-appropriate",
            "natural",
            "verification limitations",
        ];
        const limitations = normalizeWordVerificationLimitations(entry.verificationLimitations);
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
    for (const limitation of normalizeWordVerificationLimitations(entry.verificationLimitations)) {
        failures.push(...validateEvidenceSnippets({
            sourceEvidence: reviewEvidence,
            type: "manual-review",
            label: `verification limitation ${limitation.field}`,
            snippets: [wordLabel, limitation.label],
        }));
        if (!includesAll(row.notes, [limitation.label])) {
            failures.push(`Notes must include verification limitation label: ${limitation.label}`);
        }
    }

    return failures;
}

function validateNonShippingEntry(entry = {}) {
    const failures = [];

    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    if (normalizeStringArray(entry.readingIncludes).length === 0) {
        failures.push("readingIncludes must identify the deferred or removed row");
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

function validateGeneratedPlatinumRow(row = {}) {
    const failures = [];

    if (!normalizeText(row.readingBreakdown)) {
        failures.push("reading breakdown is empty");
    }
    if (!normalizeText(row.audio)) {
        failures.push("audio field is empty");
    }
    if (!normalizeText(row.pitchAccent)) {
        failures.push("pitch accent field is empty");
    }
    if (!normalizeText(row.jlptLevel)) {
        failures.push("JLPT level is empty");
    }
    if (!normalizeText(row.coverageRole)) {
        failures.push("coverage role is empty");
    }
    if (!normalizeText(row.exampleSentence)) {
        failures.push("example sentence is empty");
    }

    return failures;
}

function parseJlptLevelLabel(value) {
    const match = String(value || "").match(/N([1-5])/i);
    return match ? Number(match[1]) : null;
}

function resolvePlatinumDeckLevel({ row = {}, entry = {} } = {}) {
    const rowLevel = parseJlptLevelLabel(row.jlptLevel);
    if (Number.isInteger(rowLevel)) {
        return rowLevel;
    }

    for (const value of normalizeStringArray(entry.jlptLevelIncludes)) {
        const entryLevel = parseJlptLevelLabel(value);
        if (Number.isInteger(entryLevel)) {
            return entryLevel;
        }
    }

    return null;
}

function validateSameLevelWordAnchor({ row = {}, entry = {}, kanjiLevelData = null } = {}) {
    if (!kanjiLevelData) {
        return [];
    }

    const deckLevel = resolvePlatinumDeckLevel({ row, entry });
    const result = buildWordLevelAnchorResult({
        written: row.word || entry.word,
        deckLevel,
        placementMode: entry.levelPlacement?.mode || entry.levelPlacementMode || "",
        learnerFitReason: entry.levelPlacement?.reason || entry.levelPlacementReason || entry.selectionRationale || "",
        kanjiLevelData,
    });

    return result.valid ? [] : [formatWordLevelAnchorFailure(result)];
}

function evaluatePlatinumEntry({
    goldExpectation = null,
    requireCurrentReviewStandard = false,
    rows = [],
    entry = {},
    sapphireEntry = null,
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    const status = normalizeText(entry.status);
    const label = formatWordReviewLabel(entry.word, buildExpectedReadingText(entry));
    const failures = [];

    if (!ALLOWED_PLATINUM_STATUSES.includes(status)) {
        failures.push(`unsupported platinum status: ${status || "(blank)"}`);
    }

    if (ACTIVE_PLATINUM_STATUSES.includes(status)) {
        failures.push(...validateActivePlatinumEntry(entry, {
            goldExpectation,
            requireCurrentReviewStandard,
            sapphireEntry,
        }));
        const row = findWordRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (!row) {
            failures.push("active platinum word could not be generated");
        } else {
            const resolvedFields = buildResolvedWordFields({
                entry,
                goldExpectation,
                sapphireEntry,
            });
            failures.push(...validateGeneratedPlatinumRow(row));
            failures.push(...validateSameLevelWordAnchor({ row, entry, kanjiLevelData }));
            // Golden word review is regression coverage for exported fields, not Japanese-source truth.
            if (!goldExpectation) {
                failures.push("active Platinum word requires resolved Gold expectation for field regression");
            } else {
                const goldenRegressionFieldReport = evaluateGoldenWordReviewSet({ rows, expectations: [goldExpectation] });
                const goldenRegressionFieldResult = goldenRegressionFieldReport.results?.[0];
                if (goldenRegressionFieldResult && !goldenRegressionFieldResult.passed) {
                    failures.push(...goldenRegressionFieldResult.failures);
                }
                if (goldenRegressionFieldReport.coverageFailures?.length > 0) {
                    failures.push(...goldenRegressionFieldReport.coverageFailures);
                }
            }
            if (!includesAllLiteral(row.pitchAccent, normalizeStringArray(resolvedFields.pitchAccentIncludes))) {
                failures.push(`pitch accent did not include: ${normalizeStringArray(resolvedFields.pitchAccentIncludes).join(", ")}`);
            }
            for (const reading of normalizeStringArray(entry.readingIncludes)) {
                const expectedAudioFragment = `word-reading-${entry.word}-${reading}`;
                if (!normalizeText(row.audio).includes(expectedAudioFragment)) {
                    failures.push(`audio field did not include exact word-reading asset fragment: ${expectedAudioFragment}`);
                }
            }
            const wordKey = buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeStringArray(entry.readingIncludes)[0] || row.reading,
            });
            const sourcePitchAccent = wordPitchAccentData?.entries?.[wordKey] || null;
            failures.push(...validateWordEvidenceBindings({
                entry,
                goldExpectation,
                requireCurrentReviewStandard,
                row,
                sapphireEntry,
                sourcePitchAccent,
            }));
            const expectedAccents = parsePitchAccentPattern(sourcePitchAccent?.pattern || "");
            const renderedAccents = extractRenderedPitchAccentPattern(row.pitchAccent);
            if (!sourcePitchAccent?.sourceId) {
                failures.push(`pitch accent source entry missing for reviewed word: ${wordKey}`);
            } else if (expectedAccents.length === 0) {
                failures.push(`pitch accent source pattern is invalid for reviewed word: ${wordKey}`);
            } else if (!arraysMatch(renderedAccents, expectedAccents)) {
                failures.push(`pitch accent rendered output did not match source pattern for ${wordKey}: expected ${expectedAccents.join("/")}, rendered ${renderedAccents.join("/") || "(none)"}`);
            }
            if (sourcePitchAccent?.sourceId) {
                const sourceIdentityFailures = validateWordPitchAccentSource({
                    word: entry.word,
                    reading: normalizeStringArray(entry.readingIncludes)[0] || row.reading,
                    sourceEntry: sourcePitchAccent,
                    sources: wordPitchAccentData?.sources || {},
                });
                for (const failure of sourceIdentityFailures) {
                    failures.push(`pitch accent source validation failed for ${wordKey}: ${failure}`);
                }
                if (
                    isGeneratedPitchAccentSource({
                        sourceId: sourcePitchAccent.sourceId,
                        source: wordPitchAccentData?.sources?.[sourcePitchAccent.sourceId],
                    })
                    && !includesAllLiteral(row.pitchAccent, [GENERATED_PITCH_LABEL])
                ) {
                    failures.push(`generated pitch accent source must be visibly labeled on the card: ${wordKey}`);
                }
            }
        }
    } else if (NON_SHIPPING_STATUSES.includes(status)) {
        failures.push(...validateNonShippingEntry(entry));
        const row = findWordRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (row) {
            failures.push(`${status} word still appears in the generated export`);
        }
    } else if (REVIEW_ONLY_STATUSES.includes(status)) {
        failures.push("entry is still needs_review and cannot pass platinum");
    }

    return {
        label,
        identity: buildWordEntryIdentity(entry),
        word: entry.word,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
        verificationLimitations: ACTIVE_PLATINUM_STATUSES.includes(status)
            ? normalizeWordVerificationLimitations(entry.verificationLimitations)
            : [],
    };
}

function buildMissingPlatinumRows({ rows = [], activeEntries = [] } = {}) {
    return rows
        .filter((row) => !activeEntries.some((entry) => wordRowMatchesEntry(row, entry)))
        .map((row) => formatWordReviewLabel(row.word, row.reading))
        .sort();
}

function buildDuplicateActiveEntryLabels(activeEntries = []) {
    const labelsByKey = new Map();
    const keys = [];

    for (const entry of activeEntries) {
        const reading = buildExpectedReadingText(entry);
        const key = buildPlatinumReviewKey({ word: entry.word, reading });
        keys.push(key);
        labelsByKey.set(key, formatWordReviewLabel(entry.word, reading));
    }

    return findDuplicateValues(keys).map((key) => labelsByKey.get(key) || key);
}

function evaluatePlatinumWordReviewSet({
    rows = [],
    entries = [],
    goldenExpectations,
    requireGoldPrecondition = false,
    sapphireEntries,
    sapphireResults = [],
    requireSapphirePrecondition = false,
    wordPitchAccentData = {},
    kanjiLevelData = null,
    requireCurrentReviewStandard = false,
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeEntries = reviewEntries.filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const reviewStandardSummary = buildWordReviewStandardSummary(activeEntries);
    const currentStandardEntries = activeEntries.filter(entryUsesCurrentWordPlatinumStandard);
    const nonShippingEntries = reviewEntries.filter((entry) => NON_SHIPPING_STATUSES.includes(normalizeText(entry.status)));
    const needsReviewEntries = reviewEntries.filter((entry) => REVIEW_ONLY_STATUSES.includes(normalizeText(entry.status)));
    const goldPreconditionFailures = requireGoldPrecondition
        ? buildWordGoldPreconditionFailuresByKey({
            rows: generatedRows,
            entries: currentStandardEntries,
            goldenExpectations,
            laneName: "Platinum",
        })
        : new Map();
    const sapphirePreconditionFailures = requireSapphirePrecondition
        ? buildCurrentStandardPreconditionFailuresByKey({
            entries: currentStandardEntries,
            priorEntries: sapphireEntries,
            priorResults: sapphireResults,
            laneName: "Platinum",
            priorLaneName: "Sapphire",
            getEntryKey: buildWordEntryIdentity,
            getPriorEntryKey: buildWordEntryIdentity,
            getResultKey: (result) => result.identity || buildWordEntryIdentity(result),
            isCurrentStandardPriorEntry: (entry) => (
                ACTIVE_WORD_SAPPHIRE_PRECONDITION_STATUSES.includes(normalizeText(entry.status))
                && entry.reviewStandard === PRIOR_WORD_SAPPHIRE_REVIEW_STANDARD
            ),
        })
        : new Map();
    const results = reviewEntries.map((entry) => {
        const identity = buildWordEntryIdentity(entry);
        const goldContext = resolveWordGoldExpectation({
            entry,
            goldenExpectations,
        });
        const sapphireContext = resolveCurrentStandardWordSapphireEntry({
            entry,
            sapphireEntries,
        });
        const preconditionFailures = [
            ...(goldPreconditionFailures.get(identity) || []),
            ...(sapphirePreconditionFailures.get(identity) || []),
        ];
        return mergeFailuresIntoResult(evaluatePlatinumEntry({
            rows: generatedRows,
            entry,
            goldExpectation: goldContext.entry,
            sapphireEntry: sapphireContext.entry,
            wordPitchAccentData,
            kanjiLevelData,
            requireCurrentReviewStandard,
        }), preconditionFailures);
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
        coverageFailures.push(`missing Platinum entries for generated words: ${missingPlatinumRows.length}`);
    }
    if (missingCurrentStandardRows.length > 0) {
        coverageFailures.push(`missing current-standard Platinum entries for generated words: ${missingCurrentStandardRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;
    const verificationLimitationSummary = buildWordVerificationLimitationSummary(activeEntries);

    return {
        totalEntries: reviewEntries.length,
        generatedRowCount: generatedRows.length,
        activePlatinumCount: activeEntries.length,
        currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        currentStandardPlatinumCount: reviewStandardSummary.currentStandardCount,
        legacyOrUnversionedPlatinumCount: reviewStandardSummary.legacyOrUnversionedCount,
        currentStandardWords: reviewStandardSummary.currentStandardWords,
        legacyOrUnversionedWords: reviewStandardSummary.legacyOrUnversionedWords,
        nonShippingCount: nonShippingEntries.length,
        needsReviewCount: needsReviewEntries.length,
        verificationLimitationCount: verificationLimitationSummary.limitationCount,
        verificationLimitationWordCount: verificationLimitationSummary.wordCount,
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

function resolveActiveDenominator(report = {}, activeCount = 0) {
    return Number.isInteger(report.generatedRowCount) ? report.generatedRowCount : activeCount;
}

function formatPlatinumWordResultDisposition(result = {}) {
    const status = normalizeText(result.status);
    if (NON_SHIPPING_STATUSES.includes(status)) {
        return `inactive decision ${result.passed ? "valid" : "invalid"}`;
    }
    if (REVIEW_ONLY_STATUSES.includes(status)) {
        return `review-only status ${result.passed ? "valid" : "invalid"}`;
    }
    return `Platinum gate ${result.passed ? "pass" : "fail"}`;
}

function formatPlatinumWordReviewReport(report = {}, { title = "Japanese Kanji Builder Platinum Word Review" } = {}) {
    const activePlatinumCount = report.activePlatinumCount || 0;
    const generatedRowCount = resolveActiveDenominator(report, activePlatinumCount);
    const currentStandardCount = report.currentStandardPlatinumCount || 0;
    const lines = [
        title,
        "",
        `Active generated rows: ${generatedRowCount}`,
        "Tier: Platinum (current-standard card-surface inspection; not Obsidian certification)",
        `Platinum cards: ${activePlatinumCount}/${generatedRowCount}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`,
        `Current-standard Platinum cards: ${currentStandardCount}/${generatedRowCount}`,
        `Legacy/unversioned platinum cards: ${report.legacyOrUnversionedPlatinumCount || 0}`,
        `Active cards with verification limitations: ${report.verificationLimitationWordCount || 0}`,
        `Verification limitations: ${report.verificationLimitationCount || 0}`,
        `Review ledger entries: ${report.totalEntries || 0}`,
        `Deferred/removed tracked: ${report.nonShippingCount || 0} (audit-only; not active backlog)`,
        `Needs review: ${report.needsReviewCount || 0}`,
        `Ledger validation failures: ${report.failedCount || 0}`,
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
        lines.push("", `Missing Platinum row sample (${sample.length}/${report.missingPlatinumRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (report.missingPlatinumRows.length > sampleSize) {
            lines.push(`- ... ${report.missingPlatinumRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.missingCurrentStandardRows) && report.missingCurrentStandardRows.length > 0) {
        const sampleSize = 30;
        const sample = report.missingCurrentStandardRows.slice(0, sampleSize);
        lines.push("", `Missing current-standard Platinum row sample (${sample.length}/${report.missingCurrentStandardRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (report.missingCurrentStandardRows.length > sampleSize) {
            lines.push(`- ... ${report.missingCurrentStandardRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${formatWordReviewLabel(limitation.word, limitation.reading)} ${limitation.field}: ${limitation.label} (${limitation.status})`);
        }
    }

    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: manifest status=${result.status}; ${formatPlatinumWordResultDisposition(result)}`);
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
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
    REQUIRED_WORD_SOURCE_EVIDENCE_TYPES,
    REVIEW_ONLY_STATUSES,
    buildWordReviewStandardSummary,
    buildWordVerificationLimitationSummary,
    entryUsesCurrentWordPlatinumStandard,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
};
