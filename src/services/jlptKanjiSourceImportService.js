const { normalizeJlptKanjiSourceEvidence } = require("../datasets/jlptKanjiSourceEvidence");
const { auditJlptKanjiSourceEvidence } = require("./jlptKanjiSourceEvidenceService");

function sortAssignments(assignments = {}) {
    return Object.fromEntries(
        Object.entries(assignments || {})
            .sort(([kanjiA, assignmentA], [kanjiB, assignmentB]) => (
                (assignmentA.level || 99) - (assignmentB.level || 99)
                || kanjiA.localeCompare(kanjiB, "ja")
            ))
            .map(([kanji, assignment]) => [kanji, {
                level: assignment.level,
                reviewStatus: assignment.reviewStatus,
                citation: assignment.citation,
                evidenceRef: assignment.evidenceRef,
                notes: assignment.notes,
            }])
    );
}

function countChangedAssignments(existing = {}, next = {}) {
    const keys = new Set([...Object.keys(existing || {}), ...Object.keys(next || {})]);
    let changed = 0;
    for (const key of keys) {
        if (JSON.stringify(existing[key] || null) !== JSON.stringify(next[key] || null)) {
            changed += 1;
        }
    }
    return changed;
}

function formatLevel(level) {
    return Number.isInteger(level) ? `N${level}` : undefined;
}

function buildMaterializedNotes(entry = {}) {
    if (entry.confidence === "disputed") {
        return "Computed from active source assignments. Current operational taxonomy and independent source evidence disagree; do not move decks or word placement until additional governed sources resolve the dispute.";
    }
    if (entry.assignmentCount > 1) {
        return "Computed from active source assignments. Additional independent and Japanese-published source evidence is still required before source-confidence or deck-movement claims.";
    }
    return "Only the current operational taxonomy baseline is recorded. Independent source evidence is required before source-confidence or deck-movement claims.";
}

function materializeKanjiEvidenceEntries({ evidenceManifest = {}, contract = {} } = {}) {
    const normalizedEvidence = normalizeJlptKanjiSourceEvidence(evidenceManifest);
    const audit = auditJlptKanjiSourceEvidence({
        contract,
        evidence: normalizedEvidence,
        limit: Number.MAX_SAFE_INTEGER,
    });
    const kanji = {};

    for (const entry of audit.kanjiConfidenceManifest) {
        const existing = evidenceManifest.kanji?.[entry.kanji] || {};
        const nextEntry = {
            ...existing,
            sources: Object.fromEntries(entry.reviewedSources.map((source) => [source.sourceId, {
                level: formatLevel(source.level),
                reviewStatus: "reviewed",
                citation: source.citation,
                evidenceRef: source.evidenceRef,
                notes: source.notes,
            }])),
            agreementScore: entry.agreementScore,
            confidence: entry.confidence,
            notes: buildMaterializedNotes(entry),
        };
        if (Number.isInteger(entry.consensusLevel)) {
            nextEntry.consensusLevel = formatLevel(entry.consensusLevel);
        } else {
            delete nextEntry.consensusLevel;
        }
        kanji[entry.kanji] = nextEntry;
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
        },
    };
}

function formatEvidenceManifestJson(manifest = {}) {
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

module.exports = {
    buildJlptKanjiSourceEvidenceImport,
    countChangedAssignments,
    formatEvidenceManifestJson,
    materializeKanjiEvidenceEntries,
    sortAssignments,
};
