const crypto = require("node:crypto");

const { normalizeJlptKanjiSourceEvidence } = require("../datasets/jlptKanjiSourceEvidence");
const {
    buildSourceEvidenceContext,
    evaluateKanjiSourceEvidence,
} = require("./jlptKanjiSourceEvidenceService");

const EVIDENCE_RECORD_FIELDS = Object.freeze(["citation", "evidenceRef", "notes"]);
const EVIDENCE_RECORD_FIELD_SETS = Object.freeze([
    ["citation", "evidenceRef", "notes"],
    ["citation", "evidenceRef"],
    ["citation", "notes"],
    ["evidenceRef", "notes"],
    ["citation"],
    ["evidenceRef"],
    ["notes"],
]);

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

function removeUndefinedFields(object = {}) {
    return Object.fromEntries(
        Object.entries(object).filter(([, value]) => value !== undefined)
    );
}

function buildAssignmentEvidenceRecord(assignment = {}, fields = EVIDENCE_RECORD_FIELDS) {
    const record = removeUndefinedFields(Object.fromEntries(
        fields.map((field) => [field, assignment[field]])
    ));
    return Object.keys(record).length > 0 ? record : null;
}

function serializeEvidenceRecord(record = {}) {
    return JSON.stringify(removeUndefinedFields({
        citation: record.citation,
        evidenceRef: record.evidenceRef,
        notes: record.notes,
    }));
}

function buildEvidenceRecordId(record = {}) {
    const hash = crypto
        .createHash("sha256")
        .update(serializeEvidenceRecord(record))
        .digest("hex")
        .slice(0, 16);
    return `evidence_${hash}`;
}

function estimateEvidenceRecordSavings(record = {}, count = 0) {
    if (count <= 1) {
        return 0;
    }
    const recordId = buildEvidenceRecordId(record);
    const inlineBytes = serializeEvidenceRecord(record).length - 2;
    const recordDefinitionBytes = JSON.stringify({ [recordId]: record }).length - 2;
    const recordReferenceBytes = JSON.stringify({ evidenceRecordId: recordId }).length - 2;
    return (inlineBytes * count) - recordDefinitionBytes - (recordReferenceBytes * count);
}

function listAssignmentEvidenceRecordCandidates(assignment = {}) {
    return EVIDENCE_RECORD_FIELD_SETS
        .map((fields) => buildAssignmentEvidenceRecord(assignment, fields))
        .filter((record) => record !== null);
}

function compareEvidenceRecordCandidates(candidateA, candidateB) {
    return Object.keys(candidateB.record).length - Object.keys(candidateA.record).length
        || candidateB.savings - candidateA.savings
        || serializeEvidenceRecord(candidateB.record).length - serializeEvidenceRecord(candidateA.record).length
        || serializeEvidenceRecord(candidateA.record).localeCompare(serializeEvidenceRecord(candidateB.record));
}

function compressAssignmentEvidenceRecords(assignments = {}) {
    const sortedAssignments = sortAssignments(assignments);
    const recordCounts = new Map();

    for (const assignment of Object.values(sortedAssignments)) {
        for (const record of listAssignmentEvidenceRecordCandidates(assignment)) {
            const serializedRecord = serializeEvidenceRecord(record);
            recordCounts.set(serializedRecord, (recordCounts.get(serializedRecord) || 0) + 1);
        }
    }

    const evidenceRecords = {};
    const compressedAssignments = {};

    for (const [kanji, assignment] of Object.entries(sortedAssignments)) {
        const record = listAssignmentEvidenceRecordCandidates(assignment)
            .map((candidateRecord) => {
                const serializedRecord = serializeEvidenceRecord(candidateRecord);
                const count = recordCounts.get(serializedRecord) || 0;
                return {
                    record: candidateRecord,
                    count,
                    savings: estimateEvidenceRecordSavings(candidateRecord, count),
                };
            })
            .filter((candidate) => candidate.count > 1 && candidate.savings > 0)
            .sort(compareEvidenceRecordCandidates)[0]?.record || null;
        const compressedAssignment = removeUndefinedFields({ ...assignment });

        if (record) {
            const recordId = buildEvidenceRecordId(record);
            const existingRecord = evidenceRecords[recordId];
            if (existingRecord && serializeEvidenceRecord(existingRecord) !== serializeEvidenceRecord(record)) {
                throw new Error(`Evidence record id collision while serializing ${kanji}: ${recordId}`);
            }
            evidenceRecords[recordId] = record;
            for (const field of Object.keys(record)) {
                delete compressedAssignment[field];
            }
            compressedAssignment.evidenceRecordId = recordId;
        }

        compressedAssignments[kanji] = compressedAssignment;
    }

    return {
        evidenceRecords: Object.fromEntries(
            Object.entries(evidenceRecords).sort(([recordIdA], [recordIdB]) => recordIdA.localeCompare(recordIdB))
        ),
        assignments: compressedAssignments,
    };
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
    evidenceContext = null,
} = {}) {
    const result = evaluateKanjiSourceEvidence({
        kanji,
        contractLevel,
        evidence: normalizedEvidence,
        evidenceContext,
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
    const changedKanjiSet = Array.isArray(changedKanji) || changedKanji instanceof Set
        ? new Set(changedKanji)
        : null;
    if (changedKanjiSet !== null && changedKanjiSet.size === 0) {
        return evidenceManifest;
    }

    const normalizedEvidence = normalizeJlptKanjiSourceEvidence(evidenceManifest);
    const evidenceContext = buildSourceEvidenceContext(normalizedEvidence);
    const contractEntries = Object.entries(contract.kanjiLevels || {});
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
            evidenceContext,
        });
    }

    return {
        ...evidenceManifest,
        kanji,
    };
}

function normalizeMaterializedShiftValue(entry = {}) {
    return {
        consensusLevel: entry.consensusLevel || null,
        confidence: entry.confidence || null,
        agreementScore: Number.isFinite(entry.agreementScore) ? entry.agreementScore : null,
    };
}

function buildChangedField(previousValue, nextValue) {
    return Object.is(previousValue, nextValue)
        ? null
        : { previous: previousValue, next: nextValue };
}

function summarizeMaterializedKanjiEvidenceShifts({
    previousManifest = {},
    nextManifest = {},
    changedKanji = [],
} = {}) {
    const kanji = [...new Set(changedKanji || [])]
        .sort((kanjiA, kanjiB) => kanjiA.localeCompare(kanjiB, "ja"));
    const shifts = [];

    for (const kanjiText of kanji) {
        const previous = normalizeMaterializedShiftValue(previousManifest.kanji?.[kanjiText] || {});
        const next = normalizeMaterializedShiftValue(nextManifest.kanji?.[kanjiText] || {});
        const shift = { kanji: kanjiText };
        const consensusLevel = buildChangedField(previous.consensusLevel, next.consensusLevel);
        const confidence = buildChangedField(previous.confidence, next.confidence);
        const agreementScore = buildChangedField(previous.agreementScore, next.agreementScore);

        if (consensusLevel) {
            shift.consensusLevel = consensusLevel;
        }
        if (confidence) {
            shift.confidence = confidence;
        }
        if (agreementScore) {
            shift.agreementScore = agreementScore;
        }
        if (shift.consensusLevel || shift.confidence || shift.agreementScore) {
            shifts.push(shift);
        }
    }

    return shifts;
}

function buildJlptKanjiSourceEvidenceImport({ evidenceManifest = {}, sourceId, assignments = {} } = {}) {
    if (!sourceId) {
        throw new Error("A source id is required for JLPT kanji source-evidence import.");
    }
    if (!evidenceManifest.sources?.[sourceId]) {
        throw new Error(`Cannot import assignments for unknown JLPT kanji source: ${sourceId}`);
    }

    const sortedAssignments = sortAssignments(assignments);
    const existingAssignments = sortAssignments(evidenceManifest.assignments?.[sourceId] || {});
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

function buildStorageManifest(manifest = {}) {
    const assignmentFiles = manifest.assignmentFiles || {};
    const splitSourceIds = new Set(Object.keys(assignmentFiles));
    const assignments = Object.fromEntries(
        Object.entries(manifest.assignments || {})
            .filter(([sourceId]) => !splitSourceIds.has(sourceId))
    );

    return {
        ...manifest,
        assignments,
    };
}

function formatSourceAssignmentFileJson({ sourceId, assignments = {} } = {}) {
    if (!sourceId) {
        throw new Error("A source id is required for JLPT kanji assignment-file serialization.");
    }
    const compressed = compressAssignmentEvidenceRecords(assignments);
    const storage = {
        sourceId,
    };
    if (Object.keys(compressed.evidenceRecords).length > 0) {
        storage.evidenceRecords = compressed.evidenceRecords;
    }
    storage.assignments = compressed.assignments;

    return `${JSON.stringify(storage, null, 2)}\n`;
}

module.exports = {
    buildStorageManifest,
    buildMaterializedKanjiEvidenceEntry,
    buildJlptKanjiSourceEvidenceImport,
    compressAssignmentEvidenceRecords,
    countChangedAssignments,
    formatEvidenceManifestJson,
    formatSourceAssignmentFileJson,
    listChangedAssignments,
    materializeKanjiEvidenceEntries,
    summarizeMaterializedKanjiEvidenceShifts,
    sortAssignments,
};
