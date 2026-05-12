const {
    buildSourceEvidenceContext,
    evaluateKanjiSourceEvidence,
} = require("./jlptKanjiSourceEvidenceService");
const {
    buildJlptKanjiSourceLevelDeltaReport,
    formatLevel: formatDeltaLevel,
} = require("./jlptKanjiSourceLevelDeltaService");

const TEMPLATE_HEADERS = Object.freeze([
    "kanji",
    "currentContractLevel",
    "level",
    "reviewStatus",
    "citation",
    "evidenceRef",
    "notes",
]);
const SOURCE_LEVEL_DELTA_PRIORITY = "source-level-deltas";
const SOURCE_REVIEW_WORKLIST_PRIORITY = "source-review-worklist";
const PRIORITY_MODES = Object.freeze([
    "contract",
    "source-gaps",
    SOURCE_LEVEL_DELTA_PRIORITY,
    SOURCE_REVIEW_WORKLIST_PRIORITY,
]);
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

function buildSourceEvidencePriority({ kanji, contractLevel, evidence = null, evidenceContext = null } = {}) {
    if (!evidence) {
        return {
            rank: 100,
            reviewPriority: "contract_order",
            reviewReason: "No source-evidence manifest was supplied for prioritization.",
        };
    }

    const policy = getEvidencePolicyMinimums(evidence.policy || {});
    const result = evaluateKanjiSourceEvidence({ kanji, contractLevel, evidence, evidenceContext });

    if (result.confidence === "disputed") {
        return {
            rank: 0,
            reviewPriority: "disputed_consensus",
            reviewReason: "Active voting sources do not produce a single consensus level.",
        };
    }
    if (result.assignmentCount === 0) {
        return {
            rank: 1,
            reviewPriority: "missing_evidence",
            reviewReason: "No reviewed active external voting evidence is recorded for this kanji.",
        };
    }
    if (result.japanesePublishedSourceCount < policy.minimumJapanesePublishedSources) {
        return {
            rank: 2,
            reviewPriority: "missing_japanese_published_source",
            reviewReason: "Reviewed evidence exists, but no required Japanese-published source evidence is recorded.",
        };
    }
    if (result.contractMatchesConsensus === false) {
        return {
            rank: 3,
            reviewPriority: "contract_consensus_mismatch",
            reviewReason: "Current operational contract differs from computed external source consensus.",
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

function buildSourceLevelDeltaPriority({ currentContractLevel, targetLevel, confidence, sourceConsensusLevel } = {}) {
    const currentLevelText = formatLevel(currentContractLevel);
    const targetLevelText = formatLevel(targetLevel);
    const consensusLevelText = formatLevel(sourceConsensusLevel);

    if (sourceConsensusLevel === targetLevel) {
        return {
            rank: 0,
            reviewPriority: "source_consensus_outside_current_level",
            reviewReason: `Active source consensus places this kanji at ${targetLevelText} while the current contract is ${currentLevelText}.`,
        };
    }
    if (confidence === "disputed") {
        return {
            rank: 1,
            reviewPriority: "disputed_source_candidate_outside_current_level",
            reviewReason: `At least one active source claims ${targetLevelText}, but source votes are disputed while the current contract is ${currentLevelText}.`,
        };
    }

    return {
        rank: 2,
        reviewPriority: "source_claim_outside_current_level",
        reviewReason: `At least one active source claims ${targetLevelText} while the current contract is ${currentLevelText}; computed consensus is ${consensusLevelText}.`,
    };
}

function buildSourceLevelDeltaRows({ contract, evidence, sourceLevel, limit, skippedSourceKanji }) {
    if (!evidence) {
        throw new Error("source-level-deltas priority requires a source-evidence manifest.");
    }
    const targetLevel = parseJlptLevelFilter(sourceLevel);
    if (targetLevel === null) {
        throw new Error("source-level-deltas priority requires --source-level=<N1-N5>.");
    }
    const maxRows = resolvePositiveLimit(limit);
    const report = buildJlptKanjiSourceLevelDeltaReport({
        contract,
        evidence,
        limit: maxRows || undefined,
    });
    const rows = (report.byLevel[targetLevel]?.missingSourceCandidatesFromCurrent || [])
        .filter((row) => !skippedSourceKanji?.has(row.kanji));

    const formattedRows = rows.map((row) => {
        const priority = buildSourceLevelDeltaPriority(row);
        return {
            kanji: row.kanji,
            currentContractLevel: formatDeltaLevel(row.currentContractLevel),
            level: "",
            reviewStatus: "needs_review",
            citation: "",
            evidenceRef: "",
            notes: "",
            reviewPriority: priority.reviewPriority,
            reviewReason: priority.reviewReason,
        };
    });

    return maxRows === null ? formattedRows : formattedRows.slice(0, maxRows);
}

function buildSourceReviewWorklistRows({ contract, evidence, limit, skippedSourceKanji, supportedLevels = [] }) {
    if (!evidence) {
        throw new Error("source-review-worklist priority requires a source-evidence manifest.");
    }
    const maxRows = resolvePositiveLimit(limit);
    const supportedLevelSet = normalizeSupportedLevels(supportedLevels);
    const hasPostReportFilters = supportedLevelSet.size > 0 || (skippedSourceKanji?.size || 0) > 0;
    const report = buildJlptKanjiSourceLevelDeltaReport({
        contract,
        evidence,
        limit: hasPostReportFilters ? undefined : maxRows || undefined,
    });
    const rows = (report.reviewWorklist || [])
        .filter((row) => hasSupportedReviewLevel(row, supportedLevelSet))
        .filter((row) => !skippedSourceKanji?.has(row.kanji));

    const formattedRows = rows.map((row) => ({
        kanji: row.kanji,
        currentContractLevel: formatDeltaLevel(row.currentContractLevel),
        level: "",
        reviewStatus: "needs_review",
        citation: "",
        evidenceRef: "",
        notes: "",
        reviewPriority: row.reviewPriority,
        reviewReason: `${row.reviewReason} Review levels: ${
            row.reviewLevels.map((reviewLevel) => formatDeltaLevel(reviewLevel)).join(", ") || "none"
        }.`,
    }));

    return maxRows === null ? formattedRows : formattedRows.slice(0, maxRows);
}

function normalizeSupportedLevels(supportedLevels = []) {
    return new Set((supportedLevels || [])
        .map((level) => Number(level))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5));
}

function hasSupportedReviewLevel(row = {}, supportedLevelSet = new Set()) {
    if (supportedLevelSet.size === 0) {
        return true;
    }
    return (row.reviewLevels || []).some((level) => supportedLevelSet.has(Number(level)));
}

function compareContractTemplateEntries(entryA, entryB) {
    return entryB.contractLevel - entryA.contractLevel
        || entryA.kanji.localeCompare(entryB.kanji, "ja");
}

function compareSourceGapTemplateEntries(entryA, entryB) {
    return entryA.priority.rank - entryB.priority.rank
        || compareContractTemplateEntries(entryA, entryB);
}

function formatTemplateRow(entry) {
    return {
        kanji: entry.kanji,
        currentContractLevel: formatLevel(entry.contractLevel),
        level: "",
        reviewStatus: "needs_review",
        citation: "",
        evidenceRef: "",
        notes: "",
        reviewPriority: entry.priority.reviewPriority,
        reviewReason: entry.priority.reviewReason,
    };
}

function pushLimitedTemplateEntry(rows, entry, compareEntries, maxRows) {
    if (maxRows === null) {
        rows.push(entry);
        return;
    }

    let insertAt = rows.findIndex((existing) => compareEntries(entry, existing) < 0);
    if (insertAt === -1) {
        if (rows.length < maxRows) {
            rows.push(entry);
        }
        return;
    }

    rows.splice(insertAt, 0, entry);
    if (rows.length > maxRows) {
        rows.pop();
    }
}

function buildContractPriorityRows({ contract, levelFilter, maxRows, skippedSourceKanji = new Set() } = {}) {
    /** @type {Map<number, string[]>} */
    const levelBuckets = new Map();

    for (const [kanji, contractLevel] of Object.entries(contract.kanjiLevels || {})) {
        if ((levelFilter !== null && contractLevel !== levelFilter) || skippedSourceKanji.has(kanji)) {
            continue;
        }
        if (!levelBuckets.has(contractLevel)) {
            levelBuckets.set(contractLevel, []);
        }
        levelBuckets.get(contractLevel).push(kanji);
    }

    const priority = buildSourceEvidencePriority({ evidence: null });
    const levels = levelFilter === null ? [5, 4, 3, 2, 1] : [levelFilter];
    const rows = [];

    for (const contractLevel of levels) {
        const kanjiForLevel = levelBuckets.get(contractLevel) || [];
        kanjiForLevel.sort((kanjiA, kanjiB) => kanjiA.localeCompare(kanjiB, "ja"));
        for (const kanji of kanjiForLevel) {
            rows.push(formatTemplateRow({ kanji, contractLevel, priority }));
            if (maxRows !== null && rows.length >= maxRows) {
                return rows;
            }
        }
    }

    return rows;
}

function buildSourceGapPriorityRows({
    contract,
    evidence,
    levelFilter,
    maxRows,
    skippedSourceKanji = new Set(),
} = {}) {
    if (!evidence) {
        return buildContractPriorityRows({ contract, levelFilter, maxRows, skippedSourceKanji });
    }

    const evidenceContext = buildSourceEvidenceContext(evidence);
    const entries = [];

    for (const [kanji, contractLevel] of Object.entries(contract.kanjiLevels || {})) {
        if ((levelFilter !== null && contractLevel !== levelFilter) || skippedSourceKanji.has(kanji)) {
            continue;
        }

        const entry = {
            kanji,
            contractLevel,
            priority: buildSourceEvidencePriority({ kanji, contractLevel, evidence, evidenceContext }),
        };
        pushLimitedTemplateEntry(entries, entry, compareSourceGapTemplateEntries, maxRows);
    }

    if (maxRows === null) {
        entries.sort(compareSourceGapTemplateEntries);
    }

    return entries.map(formatTemplateRow);
}

function buildJlptKanjiSourceInputTemplateRows({
    contract = {},
    evidence = null,
    level = null,
    limit = null,
    priority = DEFAULT_PRIORITY_MODE,
    sourceLevel = null,
    skippedSourceKanji = new Set(),
    supportedLevels = [],
} = {}) {
    const maxRows = resolvePositiveLimit(limit);
    const priorityMode = normalizePriorityMode(priority);
    const hasSourceLevelFilter = sourceLevel !== null
        && sourceLevel !== undefined
        && String(sourceLevel).trim() !== "";

    if (priorityMode === SOURCE_LEVEL_DELTA_PRIORITY) {
        if (level !== null && level !== undefined && String(level).trim() !== "") {
            throw new Error("source-level-deltas priority uses --source-level and must not also use --level.");
        }
        return buildSourceLevelDeltaRows({
            contract,
            evidence,
            sourceLevel,
            limit: maxRows,
            skippedSourceKanji,
        });
    }
    if (priorityMode === SOURCE_REVIEW_WORKLIST_PRIORITY) {
        if (level !== null && level !== undefined && String(level).trim() !== "") {
            throw new Error("source-review-worklist priority is all-level and must not use --level.");
        }
        if (hasSourceLevelFilter) {
            throw new Error("source-review-worklist priority is all-level and must not use --source-level.");
        }
        return buildSourceReviewWorklistRows({
            contract,
            evidence,
            limit: maxRows,
            skippedSourceKanji,
            supportedLevels,
        });
    }
    if (hasSourceLevelFilter) {
        throw new Error("--source-level is only supported with source-level-deltas priority.");
    }

    const levelFilter = parseJlptLevelFilter(level);
    if (priorityMode === "source-gaps") {
        return buildSourceGapPriorityRows({
            contract,
            evidence,
            levelFilter,
            maxRows,
            skippedSourceKanji,
        });
    }

    return buildContractPriorityRows({
        contract,
        levelFilter,
        maxRows,
        skippedSourceKanji,
    });
}

function escapeTsvCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ");
}

function formatJlptKanjiSourceInputTemplateTsv(rows = []) {
    return [
        TEMPLATE_HEADERS.join("\t"),
        ...rows.map((row) => TEMPLATE_HEADERS.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

module.exports = {
    TEMPLATE_HEADERS,
    DEFAULT_PRIORITY_MODE,
    PRIORITY_MODES,
    SOURCE_REVIEW_WORKLIST_PRIORITY,
    buildSourceEvidencePriority,
    buildJlptKanjiSourceInputTemplateRows,
    buildJlptTextbookConsensusTemplateRows: buildJlptKanjiSourceInputTemplateRows,
    formatJlptKanjiSourceInputTemplateTsv,
    formatJlptTextbookConsensusTemplateTsv: formatJlptKanjiSourceInputTemplateTsv,
    normalizePriorityMode,
    parseJlptLevelFilter,
    resolvePositiveLimit,
};
