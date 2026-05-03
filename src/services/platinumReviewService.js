const { evaluateGoldenWordReviewSet } = require("./goldenReviewService");

const ACTIVE_PLATINUM_STATUSES = Object.freeze(["platinum", "fixed_then_platinum"]);
const NON_SHIPPING_STATUSES = Object.freeze(["deferred", "removed"]);
const REVIEW_ONLY_STATUSES = Object.freeze(["needs_review"]);
const ALLOWED_PLATINUM_STATUSES = Object.freeze([
    ...ACTIVE_PLATINUM_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
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

const REQUIRED_WORD_EVIDENCE_TYPES = Object.freeze([
    "generated-surface",
    "golden-review",
    "japanese-source",
    "level-contract",
    "example-review",
    "media-audit",
    "audio-review",
    "pitch-accent-review",
    "label-review",
    "manual-review",
]);

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

function validateActivePlatinumEntry(entry = {}) {
    const failures = [];

    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    if (normalizeStringArray(entry.readingIncludes).length === 0) {
        failures.push("readingIncludes must name the exact reviewed reading");
    }
    if (normalizeStringArray(entry.meaningIncludes).length === 0) {
        failures.push("meaningIncludes must protect the learner-facing meaning");
    }
    if (normalizeStringArray(entry.jlptLevelIncludes).length === 0) {
        failures.push("jlptLevelIncludes must protect the displayed level label");
    }
    if (normalizeStringArray(entry.coverageRoleIncludes).length === 0) {
        failures.push("coverageRoleIncludes must protect the card role");
    }
    if (normalizeStringArray(entry.breakdownIncludes).length === 0) {
        failures.push("breakdownIncludes must protect the reading and kanji breakdown");
    }
    if (normalizeStringArray(entry.exampleIncludes).length === 0) {
        failures.push("exampleIncludes must protect the release-quality example");
    }
    if (normalizeStringArray(entry.pitchAccentIncludes).length === 0) {
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

    const sourceEvidence = normalizeEvidenceEntries(entry.sourceEvidence);
    if (sourceEvidence.length === 0) {
        failures.push("sourceEvidence must contain structured evidence entries");
    }
    for (const evidence of sourceEvidence) {
        if (!evidence.type || !evidence.source || !evidence.detail) {
            failures.push("sourceEvidence entries must include type, source, and detail");
        }
    }
    const evidenceTypes = new Set(sourceEvidence.map((evidence) => evidence.type));
    for (const requiredType of REQUIRED_WORD_EVIDENCE_TYPES) {
        if (!evidenceTypes.has(requiredType)) {
            failures.push(`sourceEvidence must include evidence type: ${requiredType}`);
        }
    }
    if (entry.status === "fixed_then_platinum" && !normalizeText(entry.fixSummary)) {
        failures.push("fixed_then_platinum entries must include fixSummary");
    }

    const gates = entry.qualityGates || {};
    for (const gate of REQUIRED_WORD_QUALITY_GATES) {
        if (gates[gate] !== true) {
            failures.push(`quality gate must be true: ${gate}`);
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

function evaluatePlatinumEntry({ rows = [], entry = {} } = {}) {
    const status = normalizeText(entry.status);
    const label = formatWordReviewLabel(entry.word, buildExpectedReadingText(entry));
    const failures = [];

    if (!ALLOWED_PLATINUM_STATUSES.includes(status)) {
        failures.push(`unsupported platinum status: ${status || "(blank)"}`);
    }

    if (ACTIVE_PLATINUM_STATUSES.includes(status)) {
        failures.push(...validateActivePlatinumEntry(entry));
        const row = findWordRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (!row) {
            failures.push("active platinum word could not be generated");
        } else {
            failures.push(...validateGeneratedPlatinumRow(row));
            const fieldReport = evaluateGoldenWordReviewSet({ rows, expectations: [entry] });
            const fieldResult = fieldReport.results?.[0];
            if (fieldResult && !fieldResult.passed) {
                failures.push(...fieldResult.failures);
            }
            if (fieldReport.coverageFailures?.length > 0) {
                failures.push(...fieldReport.coverageFailures);
            }
            if (!includesAllLiteral(row.pitchAccent, entry.pitchAccentIncludes)) {
                failures.push(`pitch accent did not include: ${normalizeStringArray(entry.pitchAccentIncludes).join(", ")}`);
            }
            for (const reading of normalizeStringArray(entry.readingIncludes)) {
                const expectedAudioFragment = `word-reading-${entry.word}-${reading}`;
                if (!normalizeText(row.audio).includes(expectedAudioFragment)) {
                    failures.push(`audio field did not include exact word-reading asset fragment: ${expectedAudioFragment}`);
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
        word: entry.word,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
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
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeEntries = reviewEntries.filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const nonShippingEntries = reviewEntries.filter((entry) => NON_SHIPPING_STATUSES.includes(normalizeText(entry.status)));
    const needsReviewEntries = reviewEntries.filter((entry) => REVIEW_ONLY_STATUSES.includes(normalizeText(entry.status)));
    const results = reviewEntries.map((entry) => evaluatePlatinumEntry({ rows: generatedRows, entry }));
    const coverageFailures = [];
    const duplicateActiveEntries = buildDuplicateActiveEntryLabels(activeEntries);
    const missingPlatinumRows = requireAllRows
        ? buildMissingPlatinumRows({ rows: generatedRows, activeEntries })
        : [];

    if (!allowEmpty && activeEntries.length === 0) {
        coverageFailures.push("no active platinum entries have been reviewed");
    }
    if (duplicateActiveEntries.length > 0) {
        coverageFailures.push(`duplicate active platinum entries: ${duplicateActiveEntries.join(", ")}`);
    }
    if (missingPlatinumRows.length > 0) {
        coverageFailures.push(`missing platinum entries for generated words: ${missingPlatinumRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;

    return {
        totalEntries: reviewEntries.length,
        activePlatinumCount: activeEntries.length,
        nonShippingCount: nonShippingEntries.length,
        needsReviewCount: needsReviewEntries.length,
        passedCount,
        failedCount,
        passed: failedCount === 0 && coverageFailures.length === 0,
        coverageFailures,
        duplicateActiveEntries,
        missingPlatinumRows,
        results,
    };
}

function formatPlatinumWordReviewReport(report = {}, { title = "Japanese Kanji Builder Platinum Word Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        `Active platinum cards: ${report.activePlatinumCount || 0}`,
        `Deferred/removed tracked: ${report.nonShippingCount || 0}`,
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
        lines.push("", `Missing platinum row sample (${sample.length}/${report.missingPlatinumRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (report.missingPlatinumRows.length > sampleSize) {
            lines.push(`- ... ${report.missingPlatinumRows.length - sampleSize} more`);
        }
    }

    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: ${result.status} ${result.passed ? "pass" : "fail"}`);
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
    NON_SHIPPING_STATUSES,
    REQUIRED_WORD_EVIDENCE_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    REVIEW_ONLY_STATUSES,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
};
