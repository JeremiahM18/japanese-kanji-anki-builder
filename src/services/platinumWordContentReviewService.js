const ACTIVE_PLATINUM_CONTENT_STATUSES = Object.freeze(["platinum", "fixed_then_platinum"]);
const NON_SHIPPING_PLATINUM_CONTENT_STATUSES = Object.freeze(["deferred", "removed"]);
const REVIEW_ONLY_PLATINUM_CONTENT_STATUSES = Object.freeze(["needs_review"]);
const ALLOWED_PLATINUM_CONTENT_STATUSES = Object.freeze([
    ...ACTIVE_PLATINUM_CONTENT_STATUSES,
    ...NON_SHIPPING_PLATINUM_CONTENT_STATUSES,
    ...REVIEW_ONLY_PLATINUM_CONTENT_STATUSES,
]);

const CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD = "word-platinum-v1-expert-content";
const REQUIRED_WORD_SAPPHIRE_REVIEW_STANDARD = "word-sapphire-v1-evidence-lanes";

const REQUIRED_WORD_EXPERT_REVIEW_FIELDS = Object.freeze([
    "learnerValue",
    "wordChoice",
    "meaningChoice",
    "exampleUsefulness",
    "levelFit",
    "sourceInterpretation",
    "limitationDecision",
    "finalJudgment",
]);

const REQUIRED_WORD_EVIDENCE_CHECKS = Object.freeze([
    "sapphireCurrentStandard",
    "learnerValueReviewed",
    "wordMeaningChoiceReviewed",
    "exampleUsefulnessReviewed",
    "levelFitReviewed",
    "sourceInterpretationReviewed",
    "limitationsReviewed",
    "noObsidianProofClaim",
]);

const FORBIDDEN_PLATINUM_CONTENT_FIELDS = Object.freeze([
    "sapphireReviewAudit",
    "rereviewProvenance",
    "sourceEvidence",
    "internalChecks",
    "reviewEvidence",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function buildWordIdentity({ word = "", reading = "" } = {}) {
    return `${normalizeText(word)}|${normalizeText(reading)}`;
}

function buildEntryIdentity(entry = {}) {
    return buildWordIdentity({
        word: entry.word,
        reading: normalizeStringArray(entry.readingIncludes)[0],
    });
}

function buildRowIdentity(row = {}) {
    return buildWordIdentity({ word: row.word, reading: row.reading });
}

function hasActivePlatinumContentStatus(entry = {}) {
    return ACTIVE_PLATINUM_CONTENT_STATUSES.includes(normalizeText(entry.status));
}

function isCurrentStandardPlatinumWordContentEntry(entry = {}) {
    return hasActivePlatinumContentStatus(entry)
        && normalizeText(entry.reviewStandard) === CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD;
}

function hasCurrentStandardSapphireWordEntry(entry = {}) {
    return ["sapphire", "fixed_then_sapphire"].includes(normalizeText(entry.status))
        && normalizeText(entry.reviewStandard) === REQUIRED_WORD_SAPPHIRE_REVIEW_STANDARD
        && normalizeStringArray(entry.readingIncludes).length > 0;
}

function buildCurrentSapphireWordSet(sapphireEntries = []) {
    return new Set((Array.isArray(sapphireEntries) ? sapphireEntries : [])
        .filter(hasCurrentStandardSapphireWordEntry)
        .map(buildEntryIdentity)
        .filter((identity) => !identity.endsWith("|")));
}

function buildCurrentPlatinumWordSet(platinumEntries = []) {
    return new Set((Array.isArray(platinumEntries) ? platinumEntries : [])
        .filter(isCurrentStandardPlatinumWordContentEntry)
        .map(buildEntryIdentity)
        .filter((identity) => !identity.endsWith("|")));
}

function findGeneratedWordRow(rows = [], entry = {}) {
    const identity = buildEntryIdentity(entry);
    const matches = (Array.isArray(rows) ? rows : []).filter((row) => buildRowIdentity(row) === identity);
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        return { error: `ambiguous generated word rows for ${identity}` };
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

function validateForbiddenPlatinumContentFields(entry = {}) {
    return FORBIDDEN_PLATINUM_CONTENT_FIELDS
        .filter((field) => entry[field] !== undefined)
        .map((field) => `${field} is not allowed in native Platinum content entries`);
}

function validateExpertReviewEvidence(entry = {}) {
    const evidence = Array.isArray(entry.expertReviewEvidence) ? entry.expertReviewEvidence : [];
    const failures = [];
    if (evidence.length === 0) {
        failures.push("expertReviewEvidence must contain expert-content-review evidence");
    }
    if (!evidence.some((item) => normalizeText(item?.type) === "expert-content-review")) {
        failures.push("expertReviewEvidence must include type: expert-content-review");
    }
    for (const [index, item] of evidence.entries()) {
        if (!normalizeText(item?.reviewer)) {
            failures.push(`expertReviewEvidence[${index}].reviewer is required`);
        }
        if (!normalizeText(item?.detail)) {
            failures.push(`expertReviewEvidence[${index}].detail is required`);
        }
    }
    return failures;
}

function validateActivePlatinumWordContentEntry(entry = {}, {
    row = null,
    currentSapphireWords = new Set(),
} = {}) {
    const failures = [];
    const identity = buildEntryIdentity(entry);
    const readingIncludes = normalizeStringArray(entry.readingIncludes);

    failures.push(...validateForbiddenPlatinumContentFields(entry));

    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    if (readingIncludes.length !== 1) {
        failures.push("readingIncludes must name exactly one reviewed reading");
    }
    if (normalizeText(entry.reviewStandard) !== CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD) {
        failures.push(`reviewStandard must be ${CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required");
    }
    if (!row) {
        failures.push("active Platinum word could not be generated");
    }
    if (!currentSapphireWords.has(identity)) {
        failures.push("current-standard Sapphire prerequisite is missing for this Platinum word");
    }
    if (normalizeText(entry.sapphireBinding?.reviewStandard) !== REQUIRED_WORD_SAPPHIRE_REVIEW_STANDARD) {
        failures.push(`sapphireBinding.reviewStandard must be ${REQUIRED_WORD_SAPPHIRE_REVIEW_STANDARD}`);
    }
    if (!normalizeText(entry.sapphireBinding?.manifest)) {
        failures.push("sapphireBinding.manifest is required");
    }

    for (const field of REQUIRED_WORD_EXPERT_REVIEW_FIELDS) {
        if (!normalizeText(entry.expertContentReview?.[field])) {
            failures.push(`expertContentReview.${field} is required`);
        }
    }
    for (const field of REQUIRED_WORD_EVIDENCE_CHECKS) {
        if (entry.evidenceChecked?.[field] !== true) {
            failures.push(`evidenceChecked.${field} must be true`);
        }
    }
    if (entry.status === "fixed_then_platinum" && !normalizeText(entry.fixSummary)) {
        failures.push("fixed_then_platinum entries must include fixSummary");
    }
    if (normalizeText(entry.platinumReviewAudit?.auditType) !== "expert-content-platinum") {
        failures.push("platinumReviewAudit.auditType must be expert-content-platinum");
    }
    failures.push(...validateExpertReviewEvidence(entry));

    return failures;
}

function validateNonShippingEntry(entry = {}) {
    const failures = [];
    const readingIncludes = normalizeStringArray(entry.readingIncludes);
    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    if (readingIncludes.length !== 1) {
        failures.push("readingIncludes must identify exactly one deferred or removed row");
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

function evaluatePlatinumWordContentEntry({
    rows = [],
    entry = {},
    currentSapphireWords = new Set(),
} = {}) {
    const status = normalizeText(entry.status);
    const label = buildEntryIdentity(entry) || "(blank)";
    const failures = [];

    if (!ALLOWED_PLATINUM_CONTENT_STATUSES.includes(status)) {
        failures.push(`unsupported Platinum content status: ${status || "(blank)"}`);
    }

    if (ACTIVE_PLATINUM_CONTENT_STATUSES.includes(status)) {
        const row = findGeneratedWordRow(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        }
        failures.push(...validateActivePlatinumWordContentEntry(entry, {
            row: row?.error ? null : row,
            currentSapphireWords,
        }));
    } else if (NON_SHIPPING_PLATINUM_CONTENT_STATUSES.includes(status)) {
        failures.push(...validateNonShippingEntry(entry));
    } else if (REVIEW_ONLY_PLATINUM_CONTENT_STATUSES.includes(status)) {
        failures.push("entry is still needs_review and cannot pass Platinum content certification");
    }

    return {
        label,
        word: entry.word,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
    };
}

function buildMissingWordRows({ rows = [], keys = new Set() } = {}) {
    return (Array.isArray(rows) ? rows : [])
        .filter((row) => !keys.has(buildRowIdentity(row)))
        .map(buildRowIdentity)
        .filter((identity) => !identity.endsWith("|"))
        .sort((a, b) => a.localeCompare(b, "ja"));
}

function evaluatePlatinumWordContentReviewSet({
    rows = [],
    platinumEntries = [],
    sapphireEntries = [],
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const entries = Array.isArray(platinumEntries) ? platinumEntries : [];
    const currentSapphireWords = buildCurrentSapphireWordSet(sapphireEntries);
    const currentPlatinumWords = buildCurrentPlatinumWordSet(entries);
    const activeEntries = entries.filter(hasActivePlatinumContentStatus);
    const currentStandardEntries = entries.filter(isCurrentStandardPlatinumWordContentEntry);
    const results = entries.map((entry) => evaluatePlatinumWordContentEntry({
        rows: generatedRows,
        entry,
        currentSapphireWords,
    }));
    const coverageFailures = [];
    const duplicateActiveEntries = findDuplicateValues(activeEntries.map(buildEntryIdentity).filter((identity) => !identity.endsWith("|")));
    const missingSapphirePrerequisiteRows = requireAllRows
        ? buildMissingWordRows({ rows: generatedRows, keys: currentSapphireWords })
        : [];
    const rowsWithSapphire = generatedRows.filter((row) => currentSapphireWords.has(buildRowIdentity(row)));
    const missingPlatinumRows = requireAllRows
        ? buildMissingWordRows({ rows: rowsWithSapphire, keys: currentPlatinumWords })
        : [];

    if (!allowEmpty && currentStandardEntries.length === 0) {
        coverageFailures.push("no native Platinum content entries have been reviewed");
    }
    if (duplicateActiveEntries.length > 0) {
        coverageFailures.push(`duplicate active Platinum content entries: ${duplicateActiveEntries.join(", ")}`);
    }
    if (missingSapphirePrerequisiteRows.length > 0) {
        coverageFailures.push(`missing current-standard Sapphire prerequisite for generated words: ${missingSapphirePrerequisiteRows.length}`);
    }
    if (missingPlatinumRows.length > 0) {
        coverageFailures.push(`missing native Platinum content entries for generated words with Sapphire: ${missingPlatinumRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;

    return {
        totalEntries: entries.length,
        generatedRows: generatedRows.length,
        activePlatinumCount: activeEntries.length,
        currentReviewStandard: CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD,
        currentStandardPlatinumCount: currentStandardEntries.length,
        currentStandardSapphirePrerequisiteCount: currentSapphireWords.size,
        passedCount,
        failedCount,
        passed: failedCount === 0 && coverageFailures.length === 0,
        coverageFailures,
        duplicateActiveEntries,
        missingSapphirePrerequisiteRows,
        missingPlatinumRows,
        results,
    };
}

function formatPlatinumWordContentReviewReport(report = {}, { title = "Japanese Kanji Builder Platinum Word Content Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        "Tier: Platinum (expert content certification after Sapphire)",
        `Generated cards: ${report.generatedRows || 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD}`,
        `Current-standard Sapphire prerequisites: ${report.currentStandardSapphirePrerequisiteCount || 0}`,
        `Current-standard Platinum cards: ${report.currentStandardPlatinumCount || 0}`,
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
    if (Array.isArray(report.missingSapphirePrerequisiteRows) && report.missingSapphirePrerequisiteRows.length > 0) {
        lines.push("", `Missing Sapphire prerequisite sample (${Math.min(30, report.missingSapphirePrerequisiteRows.length)}/${report.missingSapphirePrerequisiteRows.length}):`);
        for (const row of report.missingSapphirePrerequisiteRows.slice(0, 30)) {
            lines.push(`- ${row}`);
        }
    }
    if (Array.isArray(report.missingPlatinumRows) && report.missingPlatinumRows.length > 0) {
        lines.push("", `Missing Platinum content sample (${Math.min(30, report.missingPlatinumRows.length)}/${report.missingPlatinumRows.length}):`);
        for (const row of report.missingPlatinumRows.slice(0, 30)) {
            lines.push(`- ${row}`);
        }
    }
    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: manifest status=${result.status}; Platinum content gate ${result.passed ? "pass" : "fail"}`);
        for (const failure of result.failures || []) {
            lines.push(`  ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    ACTIVE_PLATINUM_CONTENT_STATUSES,
    ALLOWED_PLATINUM_CONTENT_STATUSES,
    CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD,
    REQUIRED_WORD_EVIDENCE_CHECKS,
    REQUIRED_WORD_EXPERT_REVIEW_FIELDS,
    REQUIRED_WORD_SAPPHIRE_REVIEW_STANDARD,
    buildCurrentPlatinumWordSet,
    buildCurrentSapphireWordSet,
    buildEntryIdentity,
    buildRowIdentity,
    evaluatePlatinumWordContentEntry,
    evaluatePlatinumWordContentReviewSet,
    formatPlatinumWordContentReviewReport,
    hasActivePlatinumContentStatus,
    isCurrentStandardPlatinumWordContentEntry,
};
