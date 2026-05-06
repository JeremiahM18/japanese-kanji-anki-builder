const { evaluateKanjiSourceEvidence } = require("./jlptKanjiSourceEvidenceService");

const TEMPLATE_HEADERS = Object.freeze([
    "kanji",
    "currentContractLevel",
    "level",
    "reviewStatus",
    "citation",
    "evidenceRef",
    "notes",
]);
const PRIORITY_MODES = Object.freeze(["contract", "source-gaps"]);
const DEFAULT_PRIORITY_MODE = "contract";

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

function normalizePriorityMode(value) {
    const priority = String(value || DEFAULT_PRIORITY_MODE).trim();
    if (!PRIORITY_MODES.includes(priority)) {
        throw new Error(`Invalid JLPT source review priority mode: ${priority}`);
    }
    return priority;
}

function getEvidencePolicyMinimums(policy = {}) {
    return {
        minimumIndependentSources: Number.isInteger(policy.minimumIndependentSources)
            ? policy.minimumIndependentSources
            : 3,
        minimumIndependentEvidenceLineages: Number.isInteger(policy.minimumIndependentEvidenceLineages)
            ? policy.minimumIndependentEvidenceLineages
            : 2,
        minimumJapanesePublishedSources: Number.isInteger(policy.minimumJapanesePublishedSources)
            ? policy.minimumJapanesePublishedSources
            : 1,
    };
}

function buildSourceEvidencePriority({ kanji, contractLevel, evidence = null } = {}) {
    if (!evidence) {
        return {
            rank: 100,
            reviewPriority: "contract_order",
            reviewReason: "No source-evidence manifest was supplied for prioritization.",
        };
    }

    const policy = getEvidencePolicyMinimums(evidence.policy || {});
    const result = evaluateKanjiSourceEvidence({ kanji, contractLevel, evidence });

    if (result.confidence === "disputed") {
        return {
            rank: 0,
            reviewPriority: "disputed_consensus",
            reviewReason: "Active voting sources do not produce a single consensus level.",
        };
    }
    if (result.contractMatchesConsensus === false) {
        return {
            rank: 1,
            reviewPriority: "contract_consensus_mismatch",
            reviewReason: "Current operational contract differs from computed external source consensus.",
        };
    }
    if (result.assignmentCount === 0) {
        return {
            rank: 2,
            reviewPriority: "missing_evidence",
            reviewReason: "No reviewed active external voting evidence is recorded for this kanji.",
        };
    }
    if (result.japanesePublishedSourceCount < policy.minimumJapanesePublishedSources) {
        return {
            rank: 3,
            reviewPriority: "missing_japanese_published_source",
            reviewReason: "Reviewed evidence exists, but no required Japanese-published source evidence is recorded.",
        };
    }
    if (result.independentEvidenceLineageCount < policy.minimumIndependentEvidenceLineages) {
        return {
            rank: 4,
            reviewPriority: "insufficient_independent_evidence_lineages",
            reviewReason: "Reviewed evidence exists, but it does not satisfy independent evidence-lineage requirements.",
        };
    }
    if (result.independentSourceCount < policy.minimumIndependentSources) {
        return {
            rank: 5,
            reviewPriority: "insufficient_independent_sources",
            reviewReason: "Reviewed evidence exists, but it does not satisfy independent source requirements.",
        };
    }
    if (result.confidence === "weak_evidence") {
        return {
            rank: 6,
            reviewPriority: "weak_evidence",
            reviewReason: "Evidence exists, but governed confidence requirements are not yet satisfied.",
        };
    }

    return {
        rank: 50,
        reviewPriority: result.confidence || "contract_order",
        reviewReason: "Source evidence is already at or above the current confidence threshold.",
    };
}

function buildJlptTextbookConsensusTemplateRows({
    contract = {},
    evidence = null,
    level = null,
    limit = null,
    priority = DEFAULT_PRIORITY_MODE,
} = {}) {
    const levelFilter = parseJlptLevelFilter(level);
    const maxRows = resolvePositiveLimit(limit);
    const priorityMode = normalizePriorityMode(priority);
    const rows = Object.entries(contract.kanjiLevels || {})
        .filter(([, contractLevel]) => levelFilter === null || contractLevel === levelFilter)
        .map(([kanji, contractLevel]) => ({
            kanji,
            contractLevel,
            priority: priorityMode === "source-gaps"
                ? buildSourceEvidencePriority({ kanji, contractLevel, evidence })
                : buildSourceEvidencePriority({ kanji, contractLevel, evidence: null }),
        }))
        .sort((entryA, entryB) => {
            if (priorityMode === "source-gaps" && entryA.priority.rank !== entryB.priority.rank) {
                return entryA.priority.rank - entryB.priority.rank;
            }
            return entryB.contractLevel - entryA.contractLevel
                || entryA.kanji.localeCompare(entryB.kanji, "ja");
        });

    const formattedRows = rows.map((entry) => ({
        kanji: entry.kanji,
        currentContractLevel: formatLevel(entry.contractLevel),
        level: "",
        reviewStatus: "needs_review",
        citation: "",
        evidenceRef: "",
        notes: "",
        reviewPriority: entry.priority.reviewPriority,
        reviewReason: entry.priority.reviewReason,
    }));

    return maxRows === null ? formattedRows : formattedRows.slice(0, maxRows);
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
    DEFAULT_PRIORITY_MODE,
    PRIORITY_MODES,
    buildSourceEvidencePriority,
    buildJlptTextbookConsensusTemplateRows,
    formatJlptTextbookConsensusTemplateTsv,
    normalizePriorityMode,
    parseJlptLevelFilter,
    resolvePositiveLimit,
};
