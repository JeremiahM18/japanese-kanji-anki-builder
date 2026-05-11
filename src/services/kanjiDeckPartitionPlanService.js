const { JLPT_LEVELS_DESC, formatLevel } = require("./jlptKanjiSourceLevelDeltaService");

const CANDIDATE_SCOPES = Object.freeze({
    ALL_SOURCE_CLAIMS: "all-source-claims",
    LEARNER_ADDITIONS_ONLY: "learner-additions-only",
});

function formatDeckLevel(level) {
    return `N${level}`;
}

function buildDeckId(prefix, level) {
    return `${prefix}_${formatDeckLevel(level)}`;
}

function sortKanjiList(list = []) {
    return [...new Set(list.filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ja"));
}

function isDisputedRow(row = {}) {
    return row.confidence === "disputed";
}

function classifyAdditionalEntry(row = {}) {
    if (isDisputedRow(row)) {
        return "disputed_source_claim";
    }
    if (row.sourceConsensusLevel === row.targetLevel) {
        return "source_consensus_candidate";
    }
    if (Number.isInteger(row.sourceConsensusLevel)) {
        return "source_claim_consensus_elsewhere";
    }
    return "source_claim_no_consensus";
}

function buildEntryLabels(row = {}) {
    const targetLevel = Number(row.targetLevel);
    const currentLevel = Number(row.currentContractLevel);
    const labels = [
        `additional_unverified_${formatDeckLevel(targetLevel)}`,
        `source_claim_${formatDeckLevel(targetLevel)}`,
        classifyAdditionalEntry(row),
    ];

    if (Number.isInteger(currentLevel)) {
        labels.push(`current_core_${formatDeckLevel(currentLevel)}`);
    }
    if (row.confidence) {
        labels.push(row.confidence);
    }

    return labels;
}

function buildAdditionalEntry(row = {}) {
    return {
        kanji: row.kanji,
        currentContractLevel: row.currentContractLevel,
        targetLevel: row.targetLevel,
        category: classifyAdditionalEntry(row),
        confidence: row.confidence || "unknown",
        sourceConsensusLevel: Number.isInteger(row.sourceConsensusLevel)
            ? row.sourceConsensusLevel
            : null,
        sourceIds: [...(row.sourceIds || [])].sort((a, b) => a.localeCompare(b)),
        voteWeights: row.voteWeights || {},
        labels: buildEntryLabels(row),
    };
}

function isLearnerAdditionCandidate(row = {}) {
    const currentLevel = Number(row.currentContractLevel);
    const targetLevel = Number(row.targetLevel);
    return Number.isInteger(currentLevel)
        && Number.isInteger(targetLevel)
        && currentLevel < targetLevel;
}

function filterRowsByCandidateScope(rows = [], candidateScope = CANDIDATE_SCOPES.LEARNER_ADDITIONS_ONLY) {
    if (candidateScope === CANDIDATE_SCOPES.ALL_SOURCE_CLAIMS) {
        return {
            includedRows: rows,
            outOfScopeRows: [],
        };
    }
    if (candidateScope !== CANDIDATE_SCOPES.LEARNER_ADDITIONS_ONLY) {
        throw new Error(`Unsupported kanji deck partition candidate scope: ${candidateScope}`);
    }

    const includedRows = [];
    const outOfScopeRows = [];
    for (const row of rows) {
        if (isLearnerAdditionCandidate(row)) {
            includedRows.push(row);
        } else {
            outOfScopeRows.push(row);
        }
    }

    return { includedRows, outOfScopeRows };
}

function summarizeAdditionalEntries(entries = []) {
    return entries.reduce((counts, entry) => {
        counts[entry.category] = (counts[entry.category] || 0) + 1;
        return counts;
    }, {});
}

function buildCoreDecks({ contract = {}, levels = JLPT_LEVELS_DESC } = {}) {
    const kanjiByLevel = new Map(levels.map((level) => [level, []]));
    for (const [kanji, level] of Object.entries(contract.kanjiLevels || {})) {
        if (!kanjiByLevel.has(level)) {
            continue;
        }
        kanjiByLevel.get(level).push(kanji);
    }

    return levels.map((level) => {
        const kanji = sortKanjiList(kanjiByLevel.get(level) || []);
        return {
            deckId: buildDeckId("core", level),
            deckType: "core",
            level,
            label: `Core ${formatDeckLevel(level)}`,
            count: kanji.length,
            kanji,
        };
    });
}

function buildAdditionalDecks({
    deltaReport = {},
    levels = JLPT_LEVELS_DESC,
    includeDisputed = false,
    candidateScope = CANDIDATE_SCOPES.LEARNER_ADDITIONS_ONLY,
} = {}) {
    return levels.map((level) => {
        const summary = deltaReport.byLevel?.[level] || {};
        const candidateRows = summary.missingSourceCandidatesFromCurrent || [];
        const scopedRows = filterRowsByCandidateScope(candidateRows, candidateScope);
        const disputedRows = scopedRows.includedRows.filter(isDisputedRow);
        const entries = scopedRows.includedRows
            .filter((row) => includeDisputed || !isDisputedRow(row))
            .map(buildAdditionalEntry)
            .sort((a, b) => (
                (b.currentContractLevel || 0) - (a.currentContractLevel || 0)
                || a.kanji.localeCompare(b.kanji, "ja")
            ));

        return {
            deckId: buildDeckId("additional_unverified", level),
            deckType: "additional_unverified",
            level,
            label: `Additional unverified ${formatDeckLevel(level)}`,
            count: entries.length,
            sourceCandidateCount: candidateRows.length,
            candidateScope,
            outOfScopeCount: scopedRows.outOfScopeRows.length,
            disputedExcludedCount: includeDisputed ? 0 : disputedRows.length,
            categoryCounts: summarizeAdditionalEntries(entries),
            entries,
            disputedExcluded: includeDisputed ? [] : disputedRows.map(buildAdditionalEntry),
            outOfScope: scopedRows.outOfScopeRows.map(buildAdditionalEntry),
        };
    });
}

function buildCoreDeckLookup(coreDecks = []) {
    const lookup = new Map();
    for (const deck of coreDecks) {
        for (const kanji of deck.kanji || []) {
            lookup.set(kanji, deck);
        }
    }
    return lookup;
}

function buildCoreCollisions({ additionalDecks = [], coreDeckLookup = new Map() } = {}) {
    const collisions = [];
    for (const deck of additionalDecks) {
        for (const entry of deck.entries || []) {
            const coreDeck = coreDeckLookup.get(entry.kanji);
            if (!coreDeck) {
                continue;
            }
            collisions.push({
                kanji: entry.kanji,
                additionalDeckId: deck.deckId,
                coreDeckId: coreDeck.deckId,
                currentContractLevel: entry.currentContractLevel,
                targetLevel: entry.targetLevel,
            });
        }
    }
    return collisions.sort((a, b) => (
        (b.targetLevel || 0) - (a.targetLevel || 0)
        || a.kanji.localeCompare(b.kanji, "ja")
    ));
}

function buildDuplicateAdditionalEntries(additionalDecks = []) {
    const seen = new Map();
    for (const deck of additionalDecks) {
        for (const entry of deck.entries || []) {
            if (!seen.has(entry.kanji)) {
                seen.set(entry.kanji, []);
            }
            seen.get(entry.kanji).push({
                deckId: deck.deckId,
                targetLevel: entry.targetLevel,
                category: entry.category,
            });
        }
    }

    return [...seen.entries()]
        .filter(([, appearances]) => appearances.length > 1)
        .map(([kanji, appearances]) => ({ kanji, appearances }))
        .sort((a, b) => a.kanji.localeCompare(b.kanji, "ja"));
}

function buildCollisionReport({ coreDecks = [], additionalDecks = [] } = {}) {
    const coreDeckLookup = buildCoreDeckLookup(coreDecks);
    const coreCollisions = buildCoreCollisions({ additionalDecks, coreDeckLookup });
    const duplicateAdditionalEntries = buildDuplicateAdditionalEntries(additionalDecks);
    const safeToExportAsPhysicalDecksWithoutDuplicateNotes = (
        coreCollisions.length === 0
        && duplicateAdditionalEntries.length === 0
    );

    return {
        safeToExportAsPhysicalDecksWithoutDuplicateNotes,
        coreCollisionCount: coreCollisions.length,
        duplicateAdditionalKanjiCount: duplicateAdditionalEntries.length,
        coreCollisions,
        duplicateAdditionalEntries,
        guardrail: safeToExportAsPhysicalDecksWithoutDuplicateNotes
            ? "No duplicate-note partition risk detected for the planned physical decks."
            : "Do not package these logical decks as separate physical Anki notes until the exporter/APKG path uses canonical kanji identity or a variant-selection build prevents duplicate cards.",
    };
}

function buildAllCoreDecks(contract = {}) {
    return buildCoreDecks({ contract, levels: JLPT_LEVELS_DESC });
}

function buildKanjiDeckPartitionPlan({
    contract = {},
    deltaReport = {},
    levels = JLPT_LEVELS_DESC,
    includeDisputed = false,
    candidateScope = CANDIDATE_SCOPES.LEARNER_ADDITIONS_ONLY,
} = {}) {
    const selectedLevels = Array.isArray(levels) && levels.length > 0 ? levels : JLPT_LEVELS_DESC;
    const coreDecks = buildCoreDecks({ contract, levels: selectedLevels });
    const additionalDecks = buildAdditionalDecks({
        deltaReport,
        levels: selectedLevels,
        includeDisputed,
        candidateScope,
    });
    const collisionReport = buildCollisionReport({
        coreDecks: buildAllCoreDecks(contract),
        additionalDecks,
    });

    return {
        valid: true,
        noDeckMutation: true,
        noContractMutation: true,
        includeDisputed,
        candidateScope,
        logicalDeckCount: coreDecks.length + additionalDecks.length,
        coreDecks,
        additionalDecks,
        collisionReport,
    };
}

function formatEntrySample(entries = [], limit = 20) {
    const sample = entries.slice(0, Math.max(1, limit || 20));
    if (sample.length === 0) {
        return ["  - sample: none"];
    }
    return sample.map((entry) => (
        `  - ${entry.kanji}: current ${formatLevel(entry.currentContractLevel)}; `
        + `claim ${formatLevel(entry.targetLevel)}; consensus ${formatLevel(entry.sourceConsensusLevel)}; `
        + `category ${entry.category}; confidence ${entry.confidence}`
    ));
}

function formatCategoryCounts(counts = {}) {
    const parts = Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, count]) => `${category}:${count}`);
    return parts.length > 0 ? parts.join(", ") : "none";
}

function formatKanjiDeckPartitionPlan(plan = {}, { limit = 20 } = {}) {
    const lines = [
        "Kanji Deck Partition Plan",
        "",
        "Result: informational",
        `No deck mutation: ${plan.noDeckMutation === false ? "no" : "yes"}`,
        `No contract mutation: ${plan.noContractMutation === false ? "no" : "yes"}`,
        `Logical deck count: ${plan.logicalDeckCount || 0}`,
        `Candidate scope: ${plan.candidateScope || CANDIDATE_SCOPES.LEARNER_ADDITIONS_ONLY}`,
        `Disputed rows included: ${plan.includeDisputed ? "yes" : "no"}`,
        "",
        "Core decks:",
    ];

    for (const deck of plan.coreDecks || []) {
        lines.push(`- ${deck.deckId}: ${deck.count} kanji`);
    }

    lines.push("", "Additional unverified decks:");
    for (const deck of plan.additionalDecks || []) {
        lines.push(
            `- ${deck.deckId}: ${deck.count} included; `
            + `${deck.outOfScopeCount} out of product-addition scope; `
            + `${deck.disputedExcludedCount} disputed excluded; `
            + `categories ${formatCategoryCounts(deck.categoryCounts)}`
        );
        lines.push(...formatEntrySample(deck.entries, limit));
    }

    const collisionReport = plan.collisionReport || {};
    lines.push(
        "",
        "Duplicate guard:",
        `- physical ten-deck export safe without duplicate notes: ${collisionReport.safeToExportAsPhysicalDecksWithoutDuplicateNotes ? "yes" : "no"}`,
        `- additional/core collisions: ${collisionReport.coreCollisionCount || 0}`,
        `- duplicate kanji across additional decks: ${collisionReport.duplicateAdditionalKanjiCount || 0}`,
        `- guardrail: ${collisionReport.guardrail || "none"}`
    );

    return `${lines.join("\n")}\n`;
}

module.exports = {
    CANDIDATE_SCOPES,
    buildAdditionalDecks,
    buildAdditionalEntry,
    buildCollisionReport,
    buildCoreDecks,
    buildKanjiDeckPartitionPlan,
    classifyAdditionalEntry,
    formatKanjiDeckPartitionPlan,
};
