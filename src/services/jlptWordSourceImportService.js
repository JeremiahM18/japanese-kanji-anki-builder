const {
    buildMaterializedWordEvidenceEntries,
} = require("./jlptWordSourceEvidenceService");

function buildJlptWordSourceEvidenceImport({ evidenceManifest = {}, sourceId, assignments = {} } = {}) {
    const previousAssignments = evidenceManifest.assignments?.[sourceId] || {};
    const nextAssignments = {
        ...previousAssignments,
        ...assignments,
    };
    const changedWords = Object.keys(nextAssignments)
        .filter((identity) => JSON.stringify(previousAssignments[identity] || null) !== JSON.stringify(nextAssignments[identity] || null));
    const manifest = {
        ...evidenceManifest,
        assignments: {
            ...(evidenceManifest.assignments || {}),
            [sourceId]: nextAssignments,
        },
    };

    return {
        manifest,
        summary: {
            importedAssignmentCount: Object.keys(assignments || {}).length,
            previousAssignmentCount: Object.keys(previousAssignments || {}).length,
            changedAssignmentCount: changedWords.length,
            changedWords,
        },
    };
}

function materializeWordEvidenceEntries({ evidenceManifest = {}, contract = {} } = {}) {
    return buildMaterializedWordEvidenceEntries({
        evidence: evidenceManifest,
        contract,
    });
}

function summarizeMaterializedWordEvidenceShifts({ previousManifest = {}, nextManifest = {}, changedWords = [] } = {}) {
    return (changedWords || [])
        .map((identity) => {
            const previous = previousManifest.words?.[identity] || {};
            const next = nextManifest.words?.[identity] || {};
            const shift = { identity };
            if (previous.sourceConsensusLevel !== next.sourceConsensusLevel) {
                shift.sourceConsensusLevel = {
                    previous: previous.sourceConsensusLevel ?? null,
                    next: next.sourceConsensusLevel ?? null,
                };
            }
            if (previous.posture !== next.posture) {
                shift.posture = {
                    previous: previous.posture || null,
                    next: next.posture || null,
                };
            }
            return Object.keys(shift).length > 1 ? shift : null;
        })
        .filter(Boolean);
}

function buildStorageManifest(manifest = {}) {
    return {
        ...manifest,
        assignments: {},
    };
}

function formatEvidenceManifestJson(manifest = {}) {
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

module.exports = {
    buildJlptWordSourceEvidenceImport,
    buildStorageManifest,
    formatEvidenceManifestJson,
    materializeWordEvidenceEntries,
    summarizeMaterializedWordEvidenceShifts,
};
