const platinumWordReview = require("./platinumReviewService");
const { decodeHtmlEntities } = require("../utils/text");
const {
    buildWordEntryIdentity,
    buildWordGoldPreconditionFailuresByKey,
    mergeFailuresIntoResult,
} = require("./reviewLanePreconditionService");
const {
    buildEntriesByIdentity,
    buildResolvedWordFields,
    resolveWordGoldExpectation,
} = require("./reviewLaneContextService");
const {
    normalizeLimitations,
    validateWordSapphireVerificationLimitations,
} = require("../datasets/sapphireVerificationLimitations");

const ACTIVE_WORD_SAPPHIRE_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);
const NON_SHIPPING_STATUSES = platinumWordReview.NON_SHIPPING_STATUSES;
const REVIEW_ONLY_STATUSES = platinumWordReview.REVIEW_ONLY_STATUSES;
const ALLOWED_WORD_SAPPHIRE_STATUSES = Object.freeze([
    ...ACTIVE_WORD_SAPPHIRE_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD = "word-sapphire-v1-evidence-lanes";
const REQUIRED_WORD_SAPPHIRE_SOURCE_EVIDENCE_TYPES = Object.freeze(["japanese-source"]);
const REQUIRED_WORD_SAPPHIRE_INTERNAL_CHECK_TYPES = Object.freeze([
    "generated-surface",
    "golden-regression",
    "level-contract",
    "media-audit",
    "audio-review",
    "pitch-accent-review",
    "label-review",
]);
const REQUIRED_WORD_SAPPHIRE_REVIEW_EVIDENCE_TYPES = Object.freeze([
    "example-review",
    "manual-review",
    "current-standard-review",
]);
const BLOCKED_WORD_SAPPHIRE_SOURCE_EVIDENCE_TYPES = Object.freeze([
    "golden-review",
    ...REQUIRED_WORD_SAPPHIRE_INTERNAL_CHECK_TYPES,
    ...REQUIRED_WORD_SAPPHIRE_REVIEW_EVIDENCE_TYPES,
    "obsidian-proof",
    "rereview-provenance",
]);

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

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function includesAll(haystack, needles = []) {
    const normalizedHaystack = normalizeForCompare(haystack);
    return normalizeStringArray(needles).every((needle) => normalizedHaystack.includes(normalizeForCompare(needle)));
}

function normalizeBreakdownNeedles(needles = []) {
    return normalizeStringArray(needles).flatMap((needle) => (
        needle
            .split(/,\s+(?=[一-龯々〆ヵヶ]\s*[（(])/u)
            .map((part) => normalizeText(part))
            .filter(Boolean)
    ));
}

function includesAllBreakdownSnippets(haystack, needles = []) {
    return includesAll(haystack, normalizeBreakdownNeedles(needles));
}

function includesAllLiteral(haystack, needles = []) {
    const normalizedHaystack = normalizeLiteralCompare(haystack);
    return normalizeStringArray(needles).every((needle) => normalizedHaystack.includes(normalizeLiteralCompare(needle)));
}

function normalizeEvidenceEntries(value) {
    return (Array.isArray(value) ? value : [])
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => ({
            type: normalizeText(entry.type),
            source: normalizeText(entry.source),
            detail: normalizeText(entry.detail),
        }));
}

function buildExpectedReadingText(entry = {}) {
    return normalizeStringArray(entry.readingIncludes).join(" / ");
}

function formatWordReviewLabel(word, reading = "") {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord} (${normalizedReading})` : normalizedWord;
}

function buildSapphireReviewKey({ word = "", reading = "" } = {}) {
    return `${normalizeForCompare(word)}|${normalizeForCompare(reading)}`;
}

function mapSapphireStatusToPlatinum(status = "") {
    const normalized = normalizeText(status);
    if (normalized === "sapphire") {
        return "platinum";
    }
    if (normalized === "fixed_then_sapphire") {
        return "fixed_then_platinum";
    }
    return normalized;
}

function mapSapphireWordEntryToPlatinumCompatibility(entry = {}) {
    const mapped = {
        ...entry,
        status: mapSapphireStatusToPlatinum(entry.status),
        reviewStandard: entry.reviewStandard === CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD
            ? platinumWordReview.CURRENT_WORD_PLATINUM_REVIEW_STANDARD
            : entry.reviewStandard,
    };

    if (entry.previousStatus) {
        mapped.previousStatus = mapSapphireStatusToPlatinum(entry.previousStatus);
    }
    if (entry.previousReviewStandard === CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD) {
        mapped.previousReviewStandard = platinumWordReview.CURRENT_WORD_PLATINUM_REVIEW_STANDARD;
    }

    return mapped;
}

function mapSapphireWordEntriesToPlatinumCompatibility(entries = []) {
    return (Array.isArray(entries) ? entries : []).map(mapSapphireWordEntryToPlatinumCompatibility);
}

function mapPlatinumTextToSapphire(value = "") {
    return String(value || "")
        .replaceAll(platinumWordReview.CURRENT_WORD_PLATINUM_REVIEW_STANDARD, CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD)
        .replace(/fixed_then_platinum/g, "fixed_then_sapphire")
        .replace(/current-standard Platinum/g, "current-standard Sapphire")
        .replace(/Current-standard Platinum/g, "Current-standard Sapphire")
        .replace(/Platinum/g, "Sapphire structural review")
        .replace(/Platinum content certification/g, "Platinum")
        .replace(/Platinum cards/g, "Sapphire cards")
        .replace(/Platinum entries/g, "Sapphire entries")
        .replace(/platinum entries/g, "Sapphire entries")
        .replace(/Platinum row/g, "Sapphire row")
        .replace(/platinum row/g, "Sapphire row")
        .replace(/active platinum/g, "active Sapphire")
        .replace(/active Platinum/g, "active Sapphire")
        .replace(/Platinum/g, "Sapphire")
        .replace(/platinum/g, "sapphire");
}

function hasActiveWordSapphireStatus(entry = {}) {
    return ACTIVE_WORD_SAPPHIRE_STATUSES.includes(normalizeText(entry.status));
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

function validateCurrentWordSapphireReviewStandard(entry = {}) {
    const failures = [];

    if (normalizeText(entry.reviewStandard) !== CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD) {
        failures.push(`reviewStandard must be ${CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD for the current word Sapphire standard");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.revalidatedAt))) {
        failures.push("revalidatedAt must be YYYY-MM-DD for the current word Sapphire standard");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required for the current word Sapphire standard");
    }
    if (!normalizeText(entry.revalidationSummary)) {
        failures.push("revalidationSummary is required for the current word Sapphire standard");
    }
    if (!entry.migrationProvenance || typeof entry.migrationProvenance !== "object" || Array.isArray(entry.migrationProvenance)) {
        failures.push("migrationProvenance is required for active Sapphire word entries");
    }

    return failures;
}

function validateCurrentWordSapphireEvidenceLaneStructure(entry = {}) {
    return [
        ...validateStructuredEvidenceLane(entry.sourceEvidence, {
            fieldName: "sourceEvidence",
            requiredTypes: REQUIRED_WORD_SAPPHIRE_SOURCE_EVIDENCE_TYPES,
            blockedTypes: BLOCKED_WORD_SAPPHIRE_SOURCE_EVIDENCE_TYPES,
        }),
        ...validateStructuredEvidenceLane(entry.internalChecks, {
            fieldName: "internalChecks",
            requiredTypes: REQUIRED_WORD_SAPPHIRE_INTERNAL_CHECK_TYPES,
        }),
        ...validateStructuredEvidenceLane(entry.reviewEvidence, {
            fieldName: "reviewEvidence",
            requiredTypes: REQUIRED_WORD_SAPPHIRE_REVIEW_EVIDENCE_TYPES,
            blockedTypes: ["golden-review", "obsidian-proof", "rereview-provenance"],
        }),
    ];
}

function entryUsesCurrentWordSapphireStandard(entry = {}) {
    return validateCurrentWordSapphireReviewStandard(entry).length === 0
        && validateCurrentWordSapphireEvidenceLaneStructure(entry).length === 0;
}

function isCurrentStandardWordSapphireEntry(entry = {}) {
    return hasActiveWordSapphireStatus(entry) && entryUsesCurrentWordSapphireStandard(entry);
}

function buildWordSapphireReviewStandardSummary(entries = []) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeEntries = reviewEntries.filter(hasActiveWordSapphireStatus);
    const currentStandardEntries = activeEntries.filter(entryUsesCurrentWordSapphireStandard);
    const legacyEntries = activeEntries.filter((entry) => !entryUsesCurrentWordSapphireStandard(entry));

    return {
        currentStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        currentStandardCount: currentStandardEntries.length,
        activeStatusCount: activeEntries.length,
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

function normalizeWordVerificationLimitations(value) {
    return normalizeLimitations(value);
}

function buildWordSapphireVerificationLimitationSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : []).filter(isCurrentStandardWordSapphireEntry);
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

function buildWordRowsByWritten(rows = []) {
    const rowsByWritten = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const key = row.word;
        if (!rowsByWritten.has(key)) {
            rowsByWritten.set(key, []);
        }
        rowsByWritten.get(key).push(row);
    }
    return rowsByWritten;
}

function findWordRowForEntry(rows = [], entry = {}, rowsByWritten = null) {
    const candidates = rowsByWritten
        ? rowsByWritten.get(entry.word) || []
        : rows;
    const matches = candidates.filter((row) => wordRowMatchesEntry(row, entry));
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

function validateGeneratedWordStructuralRow(row = {}) {
    const failures = [];

    if (!normalizeText(row.word)) {
        failures.push("word is empty");
    }
    if (!normalizeText(row.reading)) {
        failures.push("reading is empty");
    }
    if (!normalizeText(row.readingBreakdown)) {
        failures.push("reading breakdown is empty");
    }
    if (!normalizeText(row.audio)) {
        failures.push("audio field is empty");
    }
    if (!normalizeText(row.pitchAccent)) {
        failures.push("pitch accent field is empty");
    }
    if (!normalizeText(row.meaning)) {
        failures.push("meaning is empty");
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

function validateActiveSapphireWordEntry(entry = {}, {
    goldExpectation = null,
    requireCurrentReviewStandard = false,
    row = null,
} = {}) {
    const failures = [];

    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    for (const field of [
        "readingIncludes",
        "pitchAccentIncludes",
    ]) {
        if (normalizeStringArray(entry[field]).length === 0) {
            failures.push(`${field} must protect the generated word-card field`);
        }
    }
    if (!normalizeText(entry.selectionRationale)) {
        failures.push("selectionRationale is required as recorded reviewer rationale, not Sapphire proof of content quality");
    }
    if (entry.status === "fixed_then_sapphire" && !normalizeText(entry.fixSummary)) {
        failures.push("fixed_then_sapphire entries must include fixSummary");
    }
    if (entry.rereviewProvenance !== undefined) {
        failures.push("Sapphire entries must not include Obsidian rereviewProvenance");
    }
    if (entry.platinumReviewAudit !== undefined) {
        failures.push("Sapphire entries must not include platinumReviewAudit");
    }
    if (entry.qualityGates !== undefined) {
        failures.push("Sapphire entries must not include Platinum qualityGates");
    }
    if (
        requireCurrentReviewStandard
        || entry.reviewStandard !== undefined
        || entry.migrationProvenance !== undefined
    ) {
        failures.push(...validateCurrentWordSapphireReviewStandard(entry));
        failures.push(...validateCurrentWordSapphireEvidenceLaneStructure(entry));
    }
    if (row) {
        const resolvedFields = buildResolvedWordFields({
            entry,
            goldExpectation,
        });
        failures.push(...validateGeneratedWordStructuralRow(row));
        if (resolvedFields.readingIncludes.length > 0 && !includesAll(row.reading, resolvedFields.readingIncludes)) {
            failures.push(`reading field did not include Gold-protected snippet: ${resolvedFields.readingIncludes.join(", ")}`);
        }
        if (resolvedFields.meaningIncludes.length > 0 && !includesAll(row.meaning, resolvedFields.meaningIncludes)) {
            failures.push(`meaning field did not include Gold-protected snippet: ${resolvedFields.meaningIncludes.join(", ")}`);
        }
        if (resolvedFields.jlptLevelIncludes.length > 0 && !includesAll(row.jlptLevel, resolvedFields.jlptLevelIncludes)) {
            failures.push(`JLPT level field did not include Gold-protected snippet: ${resolvedFields.jlptLevelIncludes.join(", ")}`);
        }
        if (resolvedFields.coverageRoleIncludes.length > 0 && !includesAll(row.coverageRole, resolvedFields.coverageRoleIncludes)) {
            failures.push(`coverage role field did not include Gold-protected snippet: ${resolvedFields.coverageRoleIncludes.join(", ")}`);
        }
        if (resolvedFields.breakdownIncludes.length > 0 && !includesAllBreakdownSnippets(`${row.readingBreakdown} ${row.kanjiBreakdown}`, resolvedFields.breakdownIncludes)) {
            failures.push(`reading/kanji breakdown fields did not include Gold-protected snippet: ${resolvedFields.breakdownIncludes.join(", ")}`);
        }
        if (resolvedFields.exampleIncludes.length > 0 && !includesAll(row.exampleSentence, resolvedFields.exampleIncludes)) {
            failures.push(`example field did not include Gold-protected snippet: ${resolvedFields.exampleIncludes.join(", ")}`);
        }
        if (Array.isArray(entry.pitchAccentIncludes) && !includesAllLiteral(row.pitchAccent, entry.pitchAccentIncludes)) {
            failures.push(`pitch accent field did not include protected snippet: ${entry.pitchAccentIncludes.join(", ")}`);
        }
        if (resolvedFields.notesIncludes.length > 0 && !includesAll(row.notes, resolvedFields.notesIncludes)) {
            failures.push(`notes field did not include Gold-protected snippet: ${resolvedFields.notesIncludes.join(", ")}`);
        }
        for (const reading of normalizeStringArray(entry.readingIncludes)) {
            const expectedAudioFragment = `word-reading-${entry.word}-${reading}`;
            if (!normalizeText(row.audio).includes(expectedAudioFragment)) {
                failures.push(`audio field did not include exact word-reading asset fragment: ${expectedAudioFragment}`);
            }
        }
        failures.push(...validateWordSapphireVerificationLimitations(entry, row));
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

function evaluateSapphireWordEntry({
    goldExpectation = null,
    requireCurrentReviewStandard = false,
    rows = [],
    rowsByWritten = null,
    entry = {},
} = {}) {
    const status = normalizeText(entry.status);
    const label = formatWordReviewLabel(entry.word, buildExpectedReadingText(entry));
    const failures = [];

    if (!ALLOWED_WORD_SAPPHIRE_STATUSES.includes(status)) {
        failures.push(`unsupported Sapphire status: ${status || "(blank)"}`);
    }

    if (ACTIVE_WORD_SAPPHIRE_STATUSES.includes(status)) {
        const row = findWordRowForEntry(rows, entry, rowsByWritten);
        if (row?.error) {
            failures.push(row.error);
        } else if (!row) {
            failures.push("active Sapphire word could not be generated");
        } else {
            failures.push(...validateActiveSapphireWordEntry(entry, {
                goldExpectation,
                requireCurrentReviewStandard,
                row,
            }));
        }
    } else if (NON_SHIPPING_STATUSES.includes(status)) {
        failures.push(...validateNonShippingEntry(entry));
        const row = findWordRowForEntry(rows, entry, rowsByWritten);
        if (row?.error) {
            failures.push(row.error);
        } else if (row) {
            failures.push(`${status} word still appears in the generated export`);
        }
    } else if (REVIEW_ONLY_STATUSES.includes(status)) {
        failures.push("entry is still needs_review and cannot pass Sapphire");
    }

    return {
        label,
        identity: buildWordEntryIdentity(entry),
        word: entry.word,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
        verificationLimitations: isCurrentStandardWordSapphireEntry(entry)
            ? normalizeWordVerificationLimitations(entry.verificationLimitations)
            : [],
    };
}

function buildMissingSapphireRows({ rows = [], activeEntries = [] } = {}) {
    const activeEntriesByWord = new Map();
    for (const entry of activeEntries) {
        if (!activeEntriesByWord.has(entry.word)) {
            activeEntriesByWord.set(entry.word, []);
        }
        activeEntriesByWord.get(entry.word).push(entry);
    }

    return rows
        .filter((row) => !(activeEntriesByWord.get(row.word) || [])
            .some((entry) => wordRowMatchesEntry(row, entry)))
        .map((row) => formatWordReviewLabel(row.word, row.reading))
        .sort();
}

function buildDuplicateActiveEntryLabels(activeEntries = []) {
    const labelsByKey = new Map();
    const keys = [];

    for (const entry of activeEntries) {
        const reading = buildExpectedReadingText(entry);
        const key = buildSapphireReviewKey({ word: entry.word, reading });
        keys.push(key);
        labelsByKey.set(key, formatWordReviewLabel(entry.word, reading));
    }

    return findDuplicateValues(keys).map((key) => labelsByKey.get(key) || key);
}

function evaluateSapphireWordReviewSet({
    rows = [],
    rowsByWritten = null,
    entries = [],
    goldenExpectations,
    goldenExpectationsByIdentity = null,
    requireGoldPrecondition = false,
    requireCurrentReviewStandard = false,
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const generatedRowsByWritten = rowsByWritten || buildWordRowsByWritten(generatedRows);
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeStatusEntries = reviewEntries.filter(hasActiveWordSapphireStatus);
    const activeEntries = reviewEntries.filter(isCurrentStandardWordSapphireEntry);
    const standardSummary = buildWordSapphireReviewStandardSummary(reviewEntries);
    const currentStandardEntries = activeEntries;
    const nonShippingEntries = reviewEntries.filter((entry) => NON_SHIPPING_STATUSES.includes(normalizeText(entry.status)));
    const needsReviewEntries = reviewEntries.filter((entry) => REVIEW_ONLY_STATUSES.includes(normalizeText(entry.status)));
    const goldPreconditionFailures = requireGoldPrecondition
        ? buildWordGoldPreconditionFailuresByKey({
            rows: generatedRows,
            entries: activeEntries,
            goldenExpectations,
            laneName: "Sapphire",
        })
        : new Map();
    const resolvedGoldenExpectationsByIdentity = goldenExpectationsByIdentity || (Array.isArray(goldenExpectations)
        ? buildEntriesByIdentity(goldenExpectations, {
            getIdentity: buildWordEntryIdentity,
        })
        : null);
    const results = reviewEntries.map((entry) => mergeFailuresIntoResult(
        evaluateSapphireWordEntry({
            rows: generatedRows,
            rowsByWritten: generatedRowsByWritten,
            entry,
            goldExpectation: resolveWordGoldExpectation({
                entry,
                goldenExpectations,
                goldenExpectationsByIdentity: resolvedGoldenExpectationsByIdentity,
            }).entry,
            requireCurrentReviewStandard,
        }),
        goldPreconditionFailures.get(buildWordEntryIdentity(entry))
    ));
    const coverageFailures = [];
    const duplicateActiveEntries = buildDuplicateActiveEntryLabels(activeEntries);
    const missingSapphireRows = requireAllRows
        ? buildMissingSapphireRows({ rows: generatedRows, activeEntries })
        : [];
    const missingCurrentStandardRows = requireAllRows && requireCurrentReviewStandard
        ? buildMissingSapphireRows({ rows: generatedRows, activeEntries: currentStandardEntries })
        : [];

    if (!allowEmpty && activeEntries.length === 0) {
        coverageFailures.push("no Sapphire entries have been reviewed");
    }
    if (duplicateActiveEntries.length > 0) {
        coverageFailures.push(`duplicate active Sapphire entries: ${duplicateActiveEntries.join(", ")}`);
    }
    if (missingSapphireRows.length > 0) {
        coverageFailures.push(`missing Sapphire entries for generated words: ${missingSapphireRows.length}`);
    }
    if (missingCurrentStandardRows.length > 0) {
        coverageFailures.push(`missing current-standard Sapphire entries for generated words: ${missingCurrentStandardRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;
    const verificationLimitationSummary = buildWordSapphireVerificationLimitationSummary(activeEntries);

    return {
        totalEntries: reviewEntries.length,
        generatedRowCount: generatedRows.length,
        activeSapphireCount: activeEntries.length,
        activeSapphireStatusCount: activeStatusEntries.length,
        currentReviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        currentStandardSapphireCount: standardSummary.currentStandardCount,
        legacyOrUnversionedSapphireCount: standardSummary.legacyOrUnversionedCount,
        currentStandardWords: standardSummary.currentStandardWords,
        legacyOrUnversionedWords: standardSummary.legacyOrUnversionedWords,
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
        missingSapphireRows,
        missingPlatinumRows: missingSapphireRows,
        missingCurrentStandardSapphireRows: missingCurrentStandardRows,
        missingCurrentStandardRows,
        results,
    };
}

function resolveActiveDenominator(report = {}, activeCount = 0) {
    return Number.isInteger(report.generatedRowCount) ? report.generatedRowCount : activeCount;
}

function formatSapphireWordResultDisposition(result = {}) {
    const status = normalizeText(result.status);
    if (NON_SHIPPING_STATUSES.includes(status)) {
        return `inactive decision ${result.passed ? "valid" : "invalid"}`;
    }
    if (REVIEW_ONLY_STATUSES.includes(status)) {
        return `review-only status ${result.passed ? "valid" : "invalid"}`;
    }
    return `Sapphire gate ${result.passed ? "pass" : "fail"}`;
}

function formatSapphireWordReviewReport(report = {}, { title = "Japanese Kanji Builder Sapphire Word Review" } = {}) {
    const activeSapphireCount = report.activeSapphireCount ?? 0;
    const generatedRowCount = resolveActiveDenominator(report, activeSapphireCount);
    const currentStandardCount = report.currentStandardSapphireCount ?? 0;
    const lines = [
        title,
        "",
        `Active generated rows: ${generatedRowCount}`,
        "Tier: Sapphire (current-standard structural gate; not Platinum or Obsidian proof)",
        `Sapphire cards: ${activeSapphireCount}/${generatedRowCount}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD}`,
        `Current-standard Sapphire cards: ${currentStandardCount}/${generatedRowCount}`,
        `Legacy/unversioned Sapphire cards: ${report.legacyOrUnversionedSapphireCount ?? 0}`,
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

    const missingRows = report.missingSapphireRows || [];
    if (Array.isArray(missingRows) && missingRows.length > 0) {
        const sampleSize = 30;
        const sample = missingRows.slice(0, sampleSize);
        lines.push("", `Missing Sapphire row sample (${sample.length}/${missingRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (missingRows.length > sampleSize) {
            lines.push(`- ... ${missingRows.length - sampleSize} more`);
        }
    }

    const missingCurrentStandardRows = report.missingCurrentStandardSapphireRows || [];
    if (Array.isArray(missingCurrentStandardRows) && missingCurrentStandardRows.length > 0) {
        const sampleSize = 30;
        const sample = missingCurrentStandardRows.slice(0, sampleSize);
        lines.push("", `Missing current-standard Sapphire row sample (${sample.length}/${missingCurrentStandardRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (missingCurrentStandardRows.length > sampleSize) {
            lines.push(`- ... ${missingCurrentStandardRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${formatWordReviewLabel(limitation.word, limitation.reading)} ${limitation.field}: ${limitation.label} (${limitation.status})`);
        }
    }

    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: manifest status=${result.status}; ${formatSapphireWordResultDisposition(result)}`);
        if (!result.passed) {
            for (const failure of result.failures) {
                lines.push(`  ${failure}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    ACTIVE_WORD_SAPPHIRE_STATUSES,
    ALLOWED_WORD_SAPPHIRE_STATUSES,
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REVIEW_ONLY_STATUSES,
    buildWordSapphireReviewStandardSummary,
    buildWordSapphireVerificationLimitationSummary,
    entryUsesCurrentWordSapphireStandard,
    evaluateSapphireWordReviewSet,
    formatSapphireWordReviewReport,
    hasActiveWordSapphireStatus,
    isCurrentStandardWordSapphireEntry,
    mapPlatinumTextToSapphire,
    mapSapphireWordEntriesToPlatinumCompatibility,
    mapSapphireWordEntryToPlatinumCompatibility,
    validateCurrentWordSapphireEvidenceLaneStructure,
    validateCurrentWordSapphireReviewStandard,
};
