const { normalizeJlptKanjiSourceEvidence } = require("../datasets/jlptKanjiSourceEvidence");
const { evaluateKanjiSourceEvidence } = require("./jlptKanjiSourceEvidenceService");

function sortAssignments(assignments = {}) {
    return Object.fromEntries(
        Object.entries(assignments || {})
            .sort(([kanjiA, assignmentA], [kanjiB, assignmentB]) => (
                (assignmentA.level || assignmentA.levelRange?.[0] || 99)
                    - (assignmentB.level || assignmentB.levelRange?.[0] || 99)
                || kanjiA.localeCompare(kanjiB, "ja")
            ))
            .map(([kanji, assignment]) => {
                const sortedAssignment = {};
                if (Number.isInteger(assignment.level)) {
                    sortedAssignment.level = assignment.level;
                }
                if (Array.isArray(assignment.levelRange)) {
                    sortedAssignment.levelRange = assignment.levelRange;
                }
                sortedAssignment.reviewStatus = assignment.reviewStatus;
                sortedAssignment.citation = assignment.citation;
                sortedAssignment.evidenceRef = assignment.evidenceRef;
                sortedAssignment.notes = assignment.notes;
                return [kanji, sortedAssignment];
            })
    );
}

function countChangedAssignments(existing = {}, next = {}) {
    return listChangedAssignments(existing, next).length;
}

function listChangedAssignments(existing = {}, next = {}) {
    const keys = new Set([...Object.keys(existing || {}), ...Object.keys(next || {})]);
    return [...keys]
        .filter((key) => JSON.stringify(existing[key] || null) !== JSON.stringify(next[key] || null))
        .sort((kanjiA, kanjiB) => kanjiA.localeCompare(kanjiB, "ja"));
}

function formatLevel(level) {
    return Number.isInteger(level) ? `N${level}` : undefined;
}

function buildMaterializedNotes(entry = {}) {
    if (entry.assignmentCount === 0) {
        return "No active external voting source assignment is recorded yet. Independent source evidence is required before source-confidence or deck-movement claims.";
    }
    if (entry.votingAssignmentCount === 0) {
        return "Only range evidence is recorded from active external sources. This preserves ambiguous source evidence, but it must not move decks or word placement without exact governed assignments.";
    }
    if (entry.confidence === "disputed") {
        return "Computed from active source assignments. Current operational taxonomy and independent source evidence disagree; do not move decks or word placement until additional governed sources resolve the dispute.";
    }
    if (entry.independentEvidenceLineageCount <= 1) {
        return "Computed from active external source assignments, but they still share too few independent evidence lineages. Additional independent and Japanese-published source evidence is required before source-confidence or deck-movement claims.";
    }
    if (entry.assignmentCount > 0) {
        return "Computed from active external source assignments. Additional independent and Japanese-published source evidence is still required before source-confidence or deck-movement claims.";
    }
    return "Independent source evidence is required before source-confidence or deck-movement claims.";
}

function buildMaterializedKanjiEvidenceEntry({
    kanji,
    contractLevel,
    evidenceManifest = {},
    normalizedEvidence = {},
} = {}) {
    const result = evaluateKanjiSourceEvidence({
        kanji,
        contractLevel,
        evidence: normalizedEvidence,
    });
    const existing = evidenceManifest.kanji?.[kanji] || {};
    const nextEntry = {
        ...existing,
        sources: Object.fromEntries(result.assignments.map((source) => {
            const materializedSource = {};
            if (Number.isInteger(source.level)) {
                materializedSource.level = formatLevel(source.level);
            }
            if (Array.isArray(source.levelRange)) {
                materializedSource.levelRange = source.levelRange.map((level) => formatLevel(level));
            }
            materializedSource.reviewStatus = "reviewed";
            return [source.sourceId, materializedSource];
        })),
        agreementScore: result.agreementScore,
        confidence: result.confidence,
        notes: buildMaterializedNotes(result),
    };
    if (Number.isInteger(result.consensusLevel)) {
        nextEntry.consensusLevel = formatLevel(result.consensusLevel);
    } else {
        delete nextEntry.consensusLevel;
    }
    return nextEntry;
}

function materializeKanjiEvidenceEntries({ evidenceManifest = {}, contract = {}, changedKanji = null } = {}) {
    const normalizedEvidence = normalizeJlptKanjiSourceEvidence(evidenceManifest);
    const contractEntries = Object.entries(contract.kanjiLevels || {});
    const changedKanjiSet = Array.isArray(changedKanji) || changedKanji instanceof Set
        ? new Set(changedKanji)
        : null;
    const kanji = changedKanjiSet === null
        ? {}
        : { ...(evidenceManifest.kanji || {}) };

    for (const [kanjiText, contractLevel] of contractEntries) {
        if (changedKanjiSet !== null && !changedKanjiSet.has(kanjiText)) {
            continue;
        }
        kanji[kanjiText] = buildMaterializedKanjiEvidenceEntry({
            kanji: kanjiText,
            contractLevel,
            evidenceManifest,
            normalizedEvidence,
        });
    }

    return {
        ...evidenceManifest,
        kanji,
    };
}

function buildJlptKanjiSourceEvidenceImport({ evidenceManifest = {}, sourceId, assignments = {} } = {}) {
    if (!sourceId) {
        throw new Error("A source id is required for JLPT kanji source-evidence import.");
    }
    if (!evidenceManifest.sources?.[sourceId]) {
        throw new Error(`Cannot import assignments for unknown JLPT kanji source: ${sourceId}`);
    }

    const sortedAssignments = sortAssignments(assignments);
    const existingAssignments = evidenceManifest.assignments?.[sourceId] || {};
    const nextManifest = {
        ...evidenceManifest,
        assignments: {
            ...(evidenceManifest.assignments || {}),
            [sourceId]: sortedAssignments,
        },
    };

    return {
        manifest: nextManifest,
        summary: {
            sourceId,
            importedAssignmentCount: Object.keys(sortedAssignments).length,
            previousAssignmentCount: Object.keys(existingAssignments).length,
            changedAssignmentCount: countChangedAssignments(existingAssignments, sortedAssignments),
            changedKanji: listChangedAssignments(existingAssignments, sortedAssignments),
        },
    };
}

function formatEvidenceManifestJson(manifest = {}) {
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

module.exports = {
    buildMaterializedKanjiEvidenceEntry,
    buildJlptKanjiSourceEvidenceImport,
    countChangedAssignments,
    formatEvidenceManifestJson,
    listChangedAssignments,
    materializeKanjiEvidenceEntries,
    sortAssignments,
};
