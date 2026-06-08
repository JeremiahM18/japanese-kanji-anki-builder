const platinumKanjiReview = require("./platinumKanjiReviewService");

const ACTIVE_SAPPHIRE_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);
const NON_SHIPPING_STATUSES = platinumKanjiReview.NON_SHIPPING_STATUSES;
const REVALIDATION_STATUSES = platinumKanjiReview.REVALIDATION_STATUSES;
const REVIEW_ONLY_STATUSES = platinumKanjiReview.REVIEW_ONLY_STATUSES;
const ALLOWED_SAPPHIRE_STATUSES = Object.freeze([
    ...ACTIVE_SAPPHIRE_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD = "kanji-sapphire-v1-evidence-lanes";
const REQUIRED_KANJI_SAPPHIRE_INTERNAL_CHECK_TYPES = Object.freeze([
    "generated-surface",
    "golden-regression",
    "media-audit",
    "audio-review",
    "stroke-order-review",
]);
const REQUIRED_KANJI_SAPPHIRE_REVIEW_EVIDENCE_TYPES = Object.freeze([
    "manual-review",
    "current-standard-review",
]);
const REQUIRED_KANJI_SAPPHIRE_SOURCE_EVIDENCE_TYPES = Object.freeze([
    "japanese-source",
]);
const BLOCKED_KANJI_SAPPHIRE_SOURCE_EVIDENCE_TYPES = Object.freeze([
    "golden-review",
    ...REQUIRED_KANJI_SAPPHIRE_INTERNAL_CHECK_TYPES,
    ...REQUIRED_KANJI_SAPPHIRE_REVIEW_EVIDENCE_TYPES,
    "obsidian-proof",
    "rereview-provenance",
]);

const SINGLE_KANJI_RE = /^\p{Script=Han}$/u;

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForCompare(value) {
    return normalizeText(value)
        .replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gu, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/:\s+/g, ":")
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

function normalizeEvidenceEntries(value) {
    return (Array.isArray(value) ? value : [])
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => ({
            type: normalizeText(entry.type),
            source: normalizeText(entry.source),
            detail: normalizeText(entry.detail),
        }));
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

function mapSapphireEntryToPlatinumCompatibility(entry = {}) {
    const mapped = {
        ...entry,
        status: mapSapphireStatusToPlatinum(entry.status),
        reviewStandard: entry.reviewStandard === CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD
            ? platinumKanjiReview.CURRENT_KANJI_PLATINUM_REVIEW_STANDARD
            : entry.reviewStandard,
    };

    if (entry.previousStatus) {
        mapped.previousStatus = mapSapphireStatusToPlatinum(entry.previousStatus);
    }
    if (entry.previousReviewStandard === CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD) {
        mapped.previousReviewStandard = platinumKanjiReview.CURRENT_KANJI_PLATINUM_REVIEW_STANDARD;
    }
    if (entry.sapphireReviewAudit && !entry.platinumReviewAudit) {
        mapped.platinumReviewAudit = entry.sapphireReviewAudit;
    }

    return mapped;
}

function mapSapphireEntriesToPlatinumCompatibility(entries = []) {
    return (Array.isArray(entries) ? entries : []).map(mapSapphireEntryToPlatinumCompatibility);
}

function hasActiveSapphireStatus(entry = {}) {
    return ACTIVE_SAPPHIRE_STATUSES.includes(normalizeText(entry.status));
}

function validateCurrentKanjiSapphireReviewStandard(entry = {}) {
    const failures = [];

    if (normalizeText(entry.reviewStandard) !== CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD) {
        failures.push(`reviewStandard must be ${CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD for the current kanji Sapphire standard");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required for the current kanji Sapphire standard");
    }
    if (!entry.sapphireReviewAudit || typeof entry.sapphireReviewAudit !== "object" || Array.isArray(entry.sapphireReviewAudit)) {
        failures.push("sapphireReviewAudit is required for active Sapphire entries");
    }

    return failures;
}

function entryUsesCurrentKanjiSapphireStandard(entry = {}) {
    return validateCurrentKanjiSapphireReviewStandard(entry).length === 0
        && validateCurrentKanjiSapphireEvidenceLaneStructure(entry).length === 0;
}

function isCurrentStandardSapphireEntry(entry = {}) {
    return hasActiveSapphireStatus(entry) && entryUsesCurrentKanjiSapphireStandard(entry);
}

function isLegacyOrUnversionedKanjiSapphireReviewHistoryEntry(entry = {}) {
    const status = normalizeText(entry.status);
    return REVALIDATION_STATUSES.includes(status)
        || (hasActiveSapphireStatus(entry) && !entryUsesCurrentKanjiSapphireStandard(entry));
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

function validateCurrentKanjiSapphireEvidenceLaneStructure(entry = {}) {
    return [
        ...validateStructuredEvidenceLane(entry.sourceEvidence, {
            fieldName: "sourceEvidence",
            requiredTypes: REQUIRED_KANJI_SAPPHIRE_SOURCE_EVIDENCE_TYPES,
            blockedTypes: BLOCKED_KANJI_SAPPHIRE_SOURCE_EVIDENCE_TYPES,
        }),
        ...validateStructuredEvidenceLane(entry.internalChecks, {
            fieldName: "internalChecks",
            requiredTypes: REQUIRED_KANJI_SAPPHIRE_INTERNAL_CHECK_TYPES,
        }),
        ...validateStructuredEvidenceLane(entry.reviewEvidence, {
            fieldName: "reviewEvidence",
            requiredTypes: REQUIRED_KANJI_SAPPHIRE_REVIEW_EVIDENCE_TYPES,
            blockedTypes: ["golden-review", "obsidian-proof", "rereview-provenance"],
        }),
    ];
}

function buildKanjiSapphireReviewStandardSummary(entries = []) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeStatusEntries = reviewEntries.filter(hasActiveSapphireStatus);
    const currentStandardEntries = activeStatusEntries.filter(entryUsesCurrentKanjiSapphireStandard);
    const legacyEntries = reviewEntries.filter(isLegacyOrUnversionedKanjiSapphireReviewHistoryEntry);

    return {
        currentStandard: CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
        currentStandardCount: currentStandardEntries.length,
        activeStatusCount: activeStatusEntries.length,
        revalidationBacklogCount: legacyEntries.length,
        legacyOrUnversionedCount: legacyEntries.length,
        currentStandardKanji: currentStandardEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
        revalidationBacklogKanji: legacyEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
        legacyOrUnversionedKanji: legacyEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
    };
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

function buildKanjiSapphireVerificationLimitationSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : []).filter(isCurrentStandardSapphireEntry);
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

function buildSapphireReviewKey({ kanji = "" } = {}) {
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

function validateGeneratedKanjiStructuralRow(row = {}) {
    const failures = [];
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const exactAudioFragment = `kanji-reading-${kanji}-${primaryReading}`;
    const audio = normalizeText(row.audio);

    if (!SINGLE_KANJI_RE.test(kanji)) {
        failures.push("generated row kanji must be one target kanji");
    }
    if (normalizeText(row.displayWord) !== kanji) {
        failures.push("DisplayWord must equal the target kanji");
    }
    if (normalizeText(row.studyWordKanji)) {
        failures.push("StudyWordKanji must be blank for kanji cards");
    }
    if (!primaryReading) {
        failures.push("PrimaryReading is empty");
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

function validateActiveSapphireEntry(entry = {}, {
    requireCurrentReviewStandard = false,
    row = null,
} = {}) {
    const failures = [];

    if (!SINGLE_KANJI_RE.test(normalizeText(entry.kanji))) {
        failures.push("kanji must be one target kanji");
    }
    if (normalizeStringArray(entry.readingIncludes).length === 0) {
        failures.push("readingIncludes must protect the generated primary reading field");
    }
    if (normalizeStringArray(entry.meaningIncludes).length === 0) {
        failures.push("meaningIncludes must protect the generated primary meaning field");
    }
    if (normalizeStringArray(entry.kanjiMeaningsIncludes).length === 0) {
        failures.push("kanjiMeaningsIncludes must protect the generated broader meaning field");
    }
    if (normalizeStringArray(entry.levelIncludes).length === 0) {
        failures.push("levelIncludes must protect the generated JLPT level field");
    }
    if (normalizeStringArray(entry.exampleIncludes).length === 0) {
        failures.push("exampleIncludes must protect the generated example field");
    }
    if (normalizeStringArray(entry.notesIncludes).length === 0) {
        failures.push("notesIncludes must protect the generated notes/support field");
    }
    if (!normalizeText(entry.primaryReadingRationale)) {
        failures.push("primaryReadingRationale is required as recorded reviewer rationale, not Sapphire proof of correctness");
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
    if (entry.qualityGates !== undefined && (typeof entry.qualityGates !== "object" || Array.isArray(entry.qualityGates))) {
        failures.push("qualityGates must be an object when present");
    }
    if (
        requireCurrentReviewStandard
        || entry.reviewStandard !== undefined
        || entry.sapphireReviewAudit !== undefined
    ) {
        failures.push(...validateCurrentKanjiSapphireReviewStandard(entry));
        failures.push(...validateCurrentKanjiSapphireEvidenceLaneStructure(entry));
    }
    if (row) {
        failures.push(...validateGeneratedKanjiStructuralRow(row));
        if (Array.isArray(entry.readingIncludes) && !includesAll(row.primaryReading, entry.readingIncludes)) {
            failures.push(`primary reading field did not include protected snippet: ${entry.readingIncludes.join(", ")}`);
        }
        if (Array.isArray(entry.meaningIncludes) && !includesAll(row.meaningJP, entry.meaningIncludes)) {
            failures.push(`primary meaning field did not include protected snippet: ${entry.meaningIncludes.join(", ")}`);
        }
        if (Array.isArray(entry.kanjiMeaningsIncludes) && !includesAll(row.kanjiMeanings, entry.kanjiMeaningsIncludes)) {
            failures.push(`kanji meanings field did not include protected snippet: ${entry.kanjiMeaningsIncludes.join(", ")}`);
        }
        if (Array.isArray(entry.levelIncludes) && !includesAll(row.levelLabel, entry.levelIncludes)) {
            failures.push(`level label field did not include protected snippet: ${entry.levelIncludes.join(", ")}`);
        }
        if (Array.isArray(entry.exampleIncludes) && !includesAll(row.exampleSentence, entry.exampleIncludes)) {
            failures.push(`example field did not include protected snippet: ${entry.exampleIncludes.join(", ")}`);
        }
        if (Array.isArray(entry.notesIncludes) && !includesAll(row.notes, entry.notesIncludes)) {
            failures.push(`notes field did not include protected snippet: ${entry.notesIncludes.join(", ")}`);
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
    if (!ACTIVE_SAPPHIRE_STATUSES.includes(normalizeText(entry.previousStatus))) {
        failures.push(`needs_revalidation entries must preserve previousStatus as one of: ${ACTIVE_SAPPHIRE_STATUSES.join(", ")}`);
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

function evaluateSapphireKanjiEntry({
    rows = [],
    entry = {},
    requireCurrentReviewStandard = false,
} = {}) {
    const status = normalizeText(entry.status);
    const label = normalizeText(entry.kanji) || "(blank)";
    const failures = [];

    if (!ALLOWED_SAPPHIRE_STATUSES.includes(status)) {
        failures.push(`unsupported Sapphire status: ${status || "(blank)"}`);
    }

    if (ACTIVE_SAPPHIRE_STATUSES.includes(status)) {
        const row = findKanjiRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (!row) {
            failures.push("active Sapphire kanji could not be generated");
        } else {
            failures.push(...validateActiveSapphireEntry(entry, {
                requireCurrentReviewStandard,
                row,
            }));
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
        failures.push("entry is still needs_review and cannot pass Sapphire");
    }

    return {
        label,
        kanji: entry.kanji,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
        verificationLimitations: isCurrentStandardSapphireEntry(entry)
            ? normalizeKanjiVerificationLimitations(entry.verificationLimitations)
            : [],
    };
}

function buildMissingSapphireRows({ rows = [], activeEntries = [] } = {}) {
    return rows
        .filter((row) => !activeEntries.some((entry) => entry.kanji === row.kanji))
        .map((row) => row.kanji)
        .sort();
}

function buildDuplicateActiveEntryLabels(activeEntries = []) {
    const labelsByKey = new Map();
    const keys = [];

    for (const entry of activeEntries) {
        const key = buildSapphireReviewKey({ kanji: entry.kanji });
        keys.push(key);
        labelsByKey.set(key, entry.kanji || key);
    }

    return findDuplicateValues(keys).map((key) => labelsByKey.get(key) || key);
}

function evaluateSapphireKanjiReviewSet({
    rows = [],
    entries = [],
    requireCurrentReviewStandard = false,
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeStatusEntries = reviewEntries.filter(hasActiveSapphireStatus);
    const activeEntries = reviewEntries.filter(isCurrentStandardSapphireEntry);
    const reviewStandardSummary = buildKanjiSapphireReviewStandardSummary(reviewEntries);
    const currentStandardEntries = activeEntries;
    const nonShippingEntries = reviewEntries.filter((entry) => NON_SHIPPING_STATUSES.includes(normalizeText(entry.status)));
    const needsRevalidationEntries = reviewEntries.filter((entry) => REVALIDATION_STATUSES.includes(normalizeText(entry.status)));
    const needsReviewEntries = reviewEntries.filter((entry) => normalizeText(entry.status) === "needs_review");
    const results = reviewEntries.map((entry) => evaluateSapphireKanjiEntry({
        rows: generatedRows,
        entry,
        requireCurrentReviewStandard,
    }));
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
        coverageFailures.push(`missing Sapphire entries for generated kanji: ${missingSapphireRows.length} (Sapphire coverage requires current-standard structural review)`);
    }
    if (missingCurrentStandardRows.length > 0 && missingCurrentStandardRows.length !== missingSapphireRows.length) {
        coverageFailures.push(`missing current-standard Sapphire entries for generated kanji: ${missingCurrentStandardRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;
    const verificationLimitationSummary = buildKanjiSapphireVerificationLimitationSummary(activeEntries);

    return {
        totalEntries: reviewEntries.length,
        activeSapphireCount: activeEntries.length,
        activeSapphireStatusCount: activeStatusEntries.length,
        currentReviewStandard: CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
        currentStandardSapphireCount: reviewStandardSummary.currentStandardCount,
        legacyOrUnversionedSapphireCount: reviewStandardSummary.legacyOrUnversionedCount,
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
        missingSapphireRows,
        missingPlatinumRows: missingSapphireRows,
        missingCurrentStandardRows,
        results,
    };
}

function formatSapphireKanjiReviewReport(report = {}, { title = "Japanese Kanji Builder Sapphire Kanji Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        "Tier: Sapphire (current-standard structural gate; not Platinum or Obsidian proof)",
        `Sapphire cards: ${report.activeSapphireCount ?? 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD}`,
        `Current-standard Sapphire cards: ${report.currentStandardSapphireCount ?? 0}`,
        `Revalidation backlog/history cards: ${report.revalidationBacklogCount ?? report.legacyOrUnversionedSapphireCount ?? 0}`,
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

    const missingRows = report.missingSapphireRows || [];
    if (Array.isArray(missingRows) && missingRows.length > 0) {
        const sampleSize = 30;
        const sample = missingRows.slice(0, sampleSize);
        lines.push("", `Missing Sapphire kanji sample (${sample.length}/${missingRows.length}):`);
        for (const kanji of sample) {
            lines.push(`- ${kanji}`);
        }
        if (missingRows.length > sampleSize) {
            lines.push(`- ... ${missingRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${limitation.kanji}: ${limitation.field} (${limitation.status}) - ${limitation.label}`);
        }
    }

    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: manifest status=${result.status}; Sapphire gate ${result.passed ? "pass" : "fail"}`);
        if (!result.passed) {
            for (const failure of result.failures) {
                lines.push(`  ${failure}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    ACTIVE_SAPPHIRE_STATUSES,
    ALLOWED_SAPPHIRE_STATUSES,
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REVALIDATION_STATUSES,
    REVIEW_ONLY_STATUSES,
    buildKanjiSapphireReviewStandardSummary,
    buildKanjiSapphireVerificationLimitationSummary,
    entryUsesCurrentKanjiSapphireStandard,
    evaluateSapphireKanjiReviewSet,
    formatSapphireKanjiReviewReport,
    hasActiveSapphireStatus,
    isCurrentStandardSapphireEntry,
    mapSapphireEntriesToPlatinumCompatibility,
    mapSapphireEntryToPlatinumCompatibility,
    validateCurrentKanjiSapphireEvidenceLaneStructure,
    validateCurrentKanjiSapphireReviewStandard,
};
