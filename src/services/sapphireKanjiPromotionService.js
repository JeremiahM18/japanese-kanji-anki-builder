const {
    ACTIVE_SAPPHIRE_STATUSES,
    evaluateSapphireKanjiReviewSet,
    formatSapphireKanjiReviewReport,
} = require("./sapphireKanjiReviewService");
const {
    parseSapphireKanjiReviewSet,
} = require("../datasets/sapphireKanjiReviewSet");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function findDuplicateKanji(entries = []) {
    const seen = new Set();
    const duplicates = new Set();

    for (const entry of entries) {
        const kanji = normalizeText(entry.kanji);
        if (!kanji) {
            continue;
        }
        if (seen.has(kanji)) {
            duplicates.add(kanji);
        }
        seen.add(kanji);
    }

    return [...duplicates].sort((left, right) => left.localeCompare(right, "ja"));
}

function buildRowOrder(rows = []) {
    const order = new Map();
    for (const [index, row] of rows.entries()) {
        if (row.kanji && !order.has(row.kanji)) {
            order.set(row.kanji, index);
        }
    }
    return order;
}

function selectRowsForEntries(rows = [], entries = []) {
    const rowsByKanji = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.kanji, row]));
    const selectedRows = [];
    const missingRows = [];

    for (const entry of entries) {
        const row = rowsByKanji.get(entry.kanji);
        if (row) {
            selectedRows.push(row);
        } else {
            missingRows.push(entry.kanji);
        }
    }

    if (missingRows.length > 0) {
        throw new Error(`Sapphire candidates are not present in live generated rows: ${missingRows.join(", ")}`);
    }

    return selectedRows;
}

function validateCandidateEntries(candidateEntries = [], rows = [], { goldenExpectations } = {}) {
    const candidates = parseSapphireKanjiReviewSet(candidateEntries, "Sapphire candidate batch");
    const inactiveCandidates = candidates
        .filter((entry) => !ACTIVE_SAPPHIRE_STATUSES.includes(entry.status))
        .map((entry) => `${entry.kanji}:${entry.status || "(blank)"}`);
    if (inactiveCandidates.length > 0) {
        throw new Error(`Sapphire promoter only accepts active Sapphire candidates: ${inactiveCandidates.join(", ")}`);
    }

    const duplicateKanji = findDuplicateKanji(candidates);
    if (duplicateKanji.length > 0) {
        throw new Error(`Duplicate Sapphire candidate kanji: ${duplicateKanji.join(", ")}`);
    }

    const selectedRows = selectRowsForEntries(rows, candidates);
    const report = evaluateSapphireKanjiReviewSet({
        rows: selectedRows,
        entries: candidates,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
    });
    if (!report.passed) {
        throw new Error(`Sapphire candidate batch failed validation:\n${formatSapphireKanjiReviewReport(report)}`);
    }

    return {
        candidates,
        report,
    };
}

function promoteSapphireKanjiBatch({
    existingEntries = [],
    candidateEntries = [],
    rows = [],
    goldenExpectations,
    replaceExisting = false,
} = {}) {
    const existing = parseSapphireKanjiReviewSet(existingEntries, "Existing Sapphire review set");
    const existingDuplicateKanji = findDuplicateKanji(existing);
    if (existingDuplicateKanji.length > 0) {
        throw new Error(`Existing Sapphire review set has duplicate kanji: ${existingDuplicateKanji.join(", ")}`);
    }

    const { candidates, report } = validateCandidateEntries(candidateEntries, rows, { goldenExpectations });
    const candidateKanji = new Set(candidates.map((entry) => entry.kanji));
    const collisions = existing
        .filter((entry) => candidateKanji.has(entry.kanji))
        .map((entry) => entry.kanji)
        .sort((left, right) => left.localeCompare(right, "ja"));
    if (collisions.length > 0 && !replaceExisting) {
        throw new Error(`Sapphire candidates already exist; rerun with --replace-existing only after intentional re-review: ${collisions.join(", ")}`);
    }

    const rowOrder = buildRowOrder(rows);
    const output = [
        ...existing.filter((entry) => !candidateKanji.has(entry.kanji)),
        ...candidates,
    ].sort((left, right) => (
        (rowOrder.get(left.kanji) ?? Number.MAX_SAFE_INTEGER) - (rowOrder.get(right.kanji) ?? Number.MAX_SAFE_INTEGER)
        || left.kanji.localeCompare(right.kanji, "ja")
    ));

    return {
        entries: output,
        report,
        summary: {
            existingEntries: existing.length,
            candidateEntries: candidates.length,
            outputEntries: output.length,
            promotedKanji: candidates.map((entry) => entry.kanji),
            replacedKanji: collisions,
        },
    };
}

module.exports = {
    promoteSapphireKanjiBatch,
    validateCandidateEntries,
};
