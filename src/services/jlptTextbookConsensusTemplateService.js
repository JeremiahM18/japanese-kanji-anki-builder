const TEMPLATE_HEADERS = Object.freeze([
    "kanji",
    "currentContractLevel",
    "level",
    "reviewStatus",
    "citation",
    "evidenceRef",
    "notes",
]);

function formatLevel(level) {
    return Number.isInteger(level) ? `N${level}` : "";
}

function parseJlptLevelFilter(value) {
    const text = String(value ?? "").trim();
    if (!text) {
        return null;
    }
    const match = text.match(/^n?([1-5])$/i);
    if (!match) {
        throw new Error(`Invalid JLPT level filter: ${text}`);
    }
    return Number(match[1]);
}

function resolvePositiveLimit(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`Invalid positive limit: ${value}`);
    }
    return limit;
}

function buildJlptTextbookConsensusTemplateRows({ contract = {}, level = null, limit = null } = {}) {
    const levelFilter = parseJlptLevelFilter(level);
    const maxRows = resolvePositiveLimit(limit);
    const rows = Object.entries(contract.kanjiLevels || {})
        .filter(([, contractLevel]) => levelFilter === null || contractLevel === levelFilter)
        .sort(([kanjiA, levelA], [kanjiB, levelB]) => (
            levelB - levelA || kanjiA.localeCompare(kanjiB, "ja")
        ))
        .map(([kanji, contractLevel]) => ({
            kanji,
            currentContractLevel: formatLevel(contractLevel),
            level: "",
            reviewStatus: "needs_review",
            citation: "",
            evidenceRef: "",
            notes: "",
        }));

    return maxRows === null ? rows : rows.slice(0, maxRows);
}

function escapeTsvCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ");
}

function formatJlptTextbookConsensusTemplateTsv(rows = []) {
    return [
        TEMPLATE_HEADERS.join("\t"),
        ...rows.map((row) => TEMPLATE_HEADERS.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

module.exports = {
    TEMPLATE_HEADERS,
    buildJlptTextbookConsensusTemplateRows,
    formatJlptTextbookConsensusTemplateTsv,
    parseJlptLevelFilter,
    resolvePositiveLimit,
};
