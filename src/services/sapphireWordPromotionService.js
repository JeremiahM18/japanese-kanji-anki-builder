const {
    ACTIVE_WORD_SAPPHIRE_STATUSES,
    evaluateSapphireWordReviewSet,
    formatSapphireWordReviewReport,
} = require("./sapphireWordReviewService");
const {
    parseSapphireWordReviewSet,
} = require("../datasets/sapphireWordReviewSet");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForKey(value) {
    return normalizeText(value).toLowerCase();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function buildEntryIdentity(entry = {}) {
    return `${normalizeForKey(entry.word)}|${normalizeStringArray(entry.readingIncludes).map(normalizeForKey).join("/")}`;
}

function formatEntryIdentity(entry = {}) {
    const readings = normalizeStringArray(entry.readingIncludes);
    return `${normalizeText(entry.word)}|${readings.join("/") || "(missing-reading)"}`;
}

function findDuplicateWordIdentities(entries = []) {
    const seen = new Set();
    const duplicates = new Set();

    for (const entry of entries) {
        const identity = buildEntryIdentity(entry);
        if (!normalizeText(entry.word) || identity.endsWith("|")) {
            continue;
        }
        if (seen.has(identity)) {
            duplicates.add(formatEntryIdentity(entry));
        }
        seen.add(identity);
    }

    return [...duplicates].sort((left, right) => left.localeCompare(right, "ja"));
}

function rowMatchesEntry(row = {}, entry = {}) {
    if (normalizeText(row.word) !== normalizeText(entry.word)) {
        return false;
    }
    const readings = normalizeStringArray(entry.readingIncludes);
    if (readings.length === 0) {
        return false;
    }
    const rowReading = normalizeText(row.reading);
    return readings.length === 1
        ? rowReading === readings[0]
        : rowReading === readings.join(" / ");
}

function buildRowOrder(rows = []) {
    const order = new Map();
    for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
        const identity = `${normalizeForKey(row.word)}|${normalizeForKey(row.reading)}`;
        if (!order.has(identity)) {
            order.set(identity, index);
        }
    }
    return order;
}

function selectRowsForEntries(rows = [], entries = []) {
    const selectedRows = [];
    const missingRows = [];
    const ambiguousRows = [];

    for (const entry of entries) {
        const matches = (Array.isArray(rows) ? rows : []).filter((row) => rowMatchesEntry(row, entry));
        if (matches.length === 1) {
            selectedRows.push(matches[0]);
        } else if (matches.length > 1) {
            ambiguousRows.push(formatEntryIdentity(entry));
        } else {
            missingRows.push(formatEntryIdentity(entry));
        }
    }

    if (missingRows.length > 0) {
        throw new Error(`Sapphire word candidates are not present in live generated rows: ${missingRows.join(", ")}`);
    }
    if (ambiguousRows.length > 0) {
        throw new Error(`Sapphire word candidates matched multiple live generated rows: ${ambiguousRows.join(", ")}`);
    }

    return selectedRows;
}

function validateCandidateEntries(candidateEntries = [], rows = [], { goldenExpectations } = {}) {
    const candidates = parseSapphireWordReviewSet(candidateEntries, "Sapphire word candidate batch");
    const inactiveCandidates = candidates
        .filter((entry) => !ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status))
        .map((entry) => `${formatEntryIdentity(entry)}:${entry.status || "(blank)"}`);
    if (inactiveCandidates.length > 0) {
        throw new Error(`Sapphire word promoter only accepts active Sapphire candidates: ${inactiveCandidates.join(", ")}`);
    }
    const platinumReviewerCandidates = candidates
        .filter((entry) => /platinum/i.test(normalizeText(entry.reviewer)))
        .map(formatEntryIdentity);
    if (platinumReviewerCandidates.length > 0) {
        throw new Error(`Sapphire word candidates must not use Platinum reviewer identity: ${platinumReviewerCandidates.join(", ")}`);
    }

    const duplicateIdentities = findDuplicateWordIdentities(candidates);
    if (duplicateIdentities.length > 0) {
        throw new Error(`Duplicate Sapphire word candidate identities: ${duplicateIdentities.join(", ")}`);
    }

    const selectedRows = selectRowsForEntries(rows, candidates);
    const report = evaluateSapphireWordReviewSet({
        rows: selectedRows,
        entries: candidates,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
    });
    if (!report.passed) {
        throw new Error(`Sapphire word candidate batch failed validation:\n${formatSapphireWordReviewReport(report)}`);
    }

    return {
        candidates,
        report,
    };
}

function promoteSapphireWordBatch({
    existingEntries = [],
    candidateEntries = [],
    rows = [],
    goldenExpectations,
    replaceExisting = false,
} = {}) {
    const existing = parseSapphireWordReviewSet(existingEntries, "Existing Sapphire word review set");
    const existingDuplicateIdentities = findDuplicateWordIdentities(existing);
    if (existingDuplicateIdentities.length > 0) {
        throw new Error(`Existing Sapphire word review set has duplicate identities: ${existingDuplicateIdentities.join(", ")}`);
    }

    const { candidates, report } = validateCandidateEntries(candidateEntries, rows, { goldenExpectations });
    const candidateIdentities = new Set(candidates.map(buildEntryIdentity));
    const collisions = existing
        .filter((entry) => candidateIdentities.has(buildEntryIdentity(entry)))
        .map(formatEntryIdentity)
        .sort((left, right) => left.localeCompare(right, "ja"));
    if (collisions.length > 0 && !replaceExisting) {
        throw new Error(`Sapphire word candidates already exist; rerun with --replace-existing only after intentional re-review: ${collisions.join(", ")}`);
    }

    const rowOrder = buildRowOrder(rows);
    const output = [
        ...existing.filter((entry) => !candidateIdentities.has(buildEntryIdentity(entry))),
        ...candidates,
    ].sort((left, right) => {
        const leftOrder = rowOrder.get(buildEntryIdentity(left)) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = rowOrder.get(buildEntryIdentity(right)) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder
            || formatEntryIdentity(left).localeCompare(formatEntryIdentity(right), "ja");
    });

    return {
        entries: output,
        report,
        summary: {
            existingEntries: existing.length,
            candidateEntries: candidates.length,
            outputEntries: output.length,
            promotedWords: candidates.map(formatEntryIdentity),
            replacedWords: collisions,
        },
    };
}

module.exports = {
    promoteSapphireWordBatch,
    validateCandidateEntries,
};
