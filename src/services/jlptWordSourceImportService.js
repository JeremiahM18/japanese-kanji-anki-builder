const {
    buildWordIdentity,
} = require("../datasets/jlptWordSourceEvidence");
const {
    buildMaterializedWordEvidenceEntries,
} = require("./jlptWordSourceEvidenceService");

function sortWordIdentities(identities = []) {
    return [...identities].sort((left, right) => left.localeCompare(right, "ja"));
}

function sortWordRecords(records = {}) {
    return Object.fromEntries(
        sortWordIdentities(Object.keys(records || {}))
            .map((identity) => [identity, records[identity]])
    );
}

function canonicalizeValue(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalizeValue);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .filter((key) => value[key] !== undefined)
                .sort((left, right) => left.localeCompare(right))
                .map((key) => [key, canonicalizeValue(value[key])])
        );
    }
    return value;
}

function recordsEqual(left, right) {
    return JSON.stringify(canonicalizeValue(left)) === JSON.stringify(canonicalizeValue(right));
}

function normalizeLevelScope(levels = []) {
    if (!Array.isArray(levels) || levels.length === 0) {
        throw new Error("Word support import requires a nonempty exact JLPT level scope.");
    }
    const seen = new Set();
    for (const level of levels) {
        if (!Number.isInteger(level) || level < 1 || level > 5) {
            throw new Error(`Word support import received invalid JLPT level: ${level}.`);
        }
        if (seen.has(level)) {
            throw new Error(`Word support import received duplicate JLPT level: N${level}.`);
        }
        seen.add(level);
    }
    return [...seen].sort((left, right) => right - left);
}

function buildContractScope({ contract = {}, levels = [] } = {}) {
    const normalizedLevels = normalizeLevelScope(levels);
    const levelSet = new Set(normalizedLevels);
    const identities = [];

    for (const [identity, entry] of Object.entries(contract.wordLevels || {})) {
        if (!levelSet.has(entry?.jlpt)) {
            continue;
        }
        const declaredIdentity = buildWordIdentity(entry?.written, entry?.reading);
        if (!declaredIdentity || declaredIdentity !== identity) {
            throw new Error(
                `Word support import contract identity ${identity || "(blank)"} declares mismatched exact identity ${declaredIdentity || "(blank)"}.`
            );
        }
        identities.push(identity);
    }
    if (identities.length === 0) {
        throw new Error(
            `Word support import scope ${normalizedLevels.map((level) => `N${level}`).join(", ")} contains no exact contract identities.`
        );
    }

    return {
        levels: normalizedLevels,
        identities: sortWordIdentities(identities),
    };
}

function assertSupportRecordIdentity(identity, record = {}) {
    const declaredIdentity = buildWordIdentity(record.written, record.reading);
    if (!declaredIdentity || declaredIdentity !== identity) {
        throw new Error(
            `Word support record ${identity || "(blank)"} declares mismatched exact identity ${declaredIdentity || "(blank)"}.`
        );
    }
}

function buildJlptWordSupportEvidenceImport({
    evidenceManifest = {},
    sourceId,
    contract = {},
    levels = [],
    supportRecords = {},
} = {}) {
    if (!sourceId) {
        throw new Error("A source id is required for JLPT word support-evidence import.");
    }
    const source = evidenceManifest.sources?.[sourceId];
    if (!source) {
        throw new Error(`Cannot import support evidence for unknown JLPT word source: ${sourceId}`);
    }
    if (source.canStoreSupportFacts !== true) {
        throw new Error(`JLPT word source ${sourceId} does not allow stored support facts.`);
    }
    if (source.countsForConsensus === true || source.canStoreWordAssignments === true) {
        throw new Error(`Support-fact source ${sourceId} must not also hold JLPT placement authority.`);
    }

    const scope = buildContractScope({ contract, levels });
    const scopeSet = new Set(scope.identities);
    const previousSupportRecords = evidenceManifest.supportRecords?.[sourceId] || {};
    const incomingScopedSupportRecords = {};
    const outOfScopeWords = [];

    for (const [identity, record] of Object.entries(supportRecords || {})) {
        if (!scopeSet.has(identity)) {
            outOfScopeWords.push(identity);
            continue;
        }
        assertSupportRecordIdentity(identity, record);
        incomingScopedSupportRecords[identity] = record;
    }

    const addedWords = [];
    const changedWords = [];
    const removedWords = [];
    const unchangedWords = [];
    for (const identity of scope.identities) {
        const hadPrevious = Object.prototype.hasOwnProperty.call(previousSupportRecords, identity);
        const hasIncoming = Object.prototype.hasOwnProperty.call(incomingScopedSupportRecords, identity);
        if (!hadPrevious && hasIncoming) {
            addedWords.push(identity);
        } else if (hadPrevious && !hasIncoming) {
            removedWords.push(identity);
        } else if (hadPrevious && hasIncoming) {
            if (recordsEqual(previousSupportRecords[identity], incomingScopedSupportRecords[identity])) {
                unchangedWords.push(identity);
            } else {
                changedWords.push(identity);
            }
        }
    }

    const preservedOutOfScopeWords = Object.keys(previousSupportRecords)
        .filter((identity) => !scopeSet.has(identity));
    const preservedOutOfScopeSupportRecords = Object.fromEntries(
        preservedOutOfScopeWords.map((identity) => [identity, previousSupportRecords[identity]])
    );
    const nextSupportRecords = sortWordRecords({
        ...preservedOutOfScopeSupportRecords,
        ...incomingScopedSupportRecords,
    });
    const materializationCandidateWords = sortWordIdentities([
        ...addedWords,
        ...changedWords,
        ...removedWords,
    ]);

    return {
        manifest: {
            ...evidenceManifest,
            supportRecords: {
                ...(evidenceManifest.supportRecords || {}),
                [sourceId]: nextSupportRecords,
            },
        },
        summary: {
            sourceId,
            levels: scope.levels,
            contractScopeIdentityCount: scope.identities.length,
            importedSupportRecordCount: Object.keys(incomingScopedSupportRecords).length,
            previousSupportRecordCount: Object.keys(previousSupportRecords).length,
            previousScopedSupportRecordCount: scope.identities
                .filter((identity) => Object.prototype.hasOwnProperty.call(previousSupportRecords, identity))
                .length,
            addedSupportRecordCount: addedWords.length,
            changedSupportRecordCount: changedWords.length,
            removedSupportRecordCount: removedWords.length,
            unchangedSupportRecordCount: unchangedWords.length,
            outOfScopeSupportRecordCount: outOfScopeWords.length,
            preservedOutOfScopeSupportRecordCount: preservedOutOfScopeWords.length,
            addedWords: sortWordIdentities(addedWords),
            changedWords: sortWordIdentities(changedWords),
            removedWords: sortWordIdentities(removedWords),
            unchangedWords: sortWordIdentities(unchangedWords),
            outOfScopeWords: sortWordIdentities(outOfScopeWords),
            preservedOutOfScopeWords: sortWordIdentities(preservedOutOfScopeWords),
            materializationCandidateWords,
        },
    };
}

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
            for (const field of ["dictionaryIdentitySupported", "commonnessSupported"]) {
                if ((previous[field] === true) !== (next[field] === true)) {
                    shift[field] = {
                        previous: previous[field] === true,
                        next: next[field] === true,
                    };
                }
            }
            for (const field of ["dictionaryIdentitySourceIds", "commonnessSourceIds"]) {
                const previousIds = previous[field] || [];
                const nextIds = next[field] || [];
                if (JSON.stringify(previousIds) !== JSON.stringify(nextIds)) {
                    shift[field] = { previous: previousIds, next: nextIds };
                }
            }
            return Object.keys(shift).length > 1 ? shift : null;
        })
        .filter(Boolean);
}

function buildStorageManifest(manifest = {}) {
    const compactWords = Object.fromEntries(Object.entries(manifest.words || {}).map(([identity, word]) => {
        const sources = Object.fromEntries(Object.entries(word.sources || {}).map(([sourceId, assignment]) => {
            const compactAssignment = { ...assignment };
            if ((compactAssignment.supportClaims || []).length === 0) {
                delete compactAssignment.supportClaims;
            }
            return [sourceId, compactAssignment];
        }));
        const compactWord = {
            ...word,
            sources,
        };
        // Canonical typed records live in supportFiles. The materialized word
        // keeps only compact support results and source ids, not a duplicate of
        // each full licensed evidence record.
        delete compactWord.supportSources;
        for (const field of ["dictionaryIdentitySourceIds", "commonnessSourceIds"]) {
            if ((compactWord[field] || []).length === 0) {
                delete compactWord[field];
            }
        }
        for (const field of ["dictionaryIdentitySupported", "commonnessSupported"]) {
            if (compactWord[field] !== true) {
                delete compactWord[field];
            }
        }
        return [identity, compactWord];
    }));
    return {
        ...manifest,
        assignments: {},
        supportRecords: {},
        words: compactWords,
    };
}

function formatEvidenceManifestJson(manifest = {}) {
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

module.exports = {
    buildJlptWordSourceEvidenceImport,
    buildJlptWordSupportEvidenceImport,
    buildStorageManifest,
    formatEvidenceManifestJson,
    materializeWordEvidenceEntries,
    summarizeMaterializedWordEvidenceShifts,
};
