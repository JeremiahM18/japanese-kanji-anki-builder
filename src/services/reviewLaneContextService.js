const {
    buildWordEntryIdentity,
} = require("./reviewLanePreconditionService");

const CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD = "word-sapphire-v1-evidence-lanes";
const ACTIVE_WORD_SAPPHIRE_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);

const WORD_GOLD_PROTECTED_FIELDS = Object.freeze([
    "readingIncludes",
    "meaningIncludes",
    "jlptLevelIncludes",
    "coverageRoleIncludes",
    "focusIncludes",
    "coversReadingIncludes",
    "breakdownIncludes",
    "exampleIncludes",
    "notesIncludes",
]);

const WORD_SAPPHIRE_STRUCTURAL_FIELDS = Object.freeze([
    "pitchAccentIncludes",
    "sourceEvidence",
    "internalChecks",
    "reviewEvidence",
    "verificationLimitations",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function formatWordIdentity(entry = {}) {
    return buildWordEntryIdentity(entry) || `${normalizeText(entry.word)}|(missing-reading)`;
}

function hasCurrentStandardWordSapphireStatus(entry = {}) {
    return ACTIVE_WORD_SAPPHIRE_STATUSES.includes(normalizeText(entry.status))
        && normalizeText(entry.reviewStandard) === CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD;
}

function findEntriesByIdentity(entries = [], identity = "", {
    laneName = "review lane",
    includeEntry = () => true,
    getIdentity = buildWordEntryIdentity,
} = {}) {
    const normalizedIdentity = normalizeText(identity);
    if (!normalizedIdentity) {
        return {
            entries: [],
            failures: [`${laneName} identity is required`],
        };
    }

    const matches = (Array.isArray(entries) ? entries : [])
        .filter(includeEntry)
        .filter((entry) => normalizeText(getIdentity(entry)) === normalizedIdentity);

    if (matches.length === 0) {
        return {
            entries: [],
            failures: [`${laneName} requires exactly one entry for ${normalizedIdentity}; found 0`],
        };
    }
    if (matches.length > 1) {
        return {
            entries: matches,
            failures: [`${laneName} requires exactly one entry for ${normalizedIdentity}; found ${matches.length}`],
        };
    }

    return {
        entries: matches,
        entry: matches[0],
        failures: [],
    };
}

function resolveWordGoldExpectation({ entry = {}, goldenExpectations } = {}) {
    return findEntriesByIdentity(goldenExpectations, buildWordEntryIdentity(entry), {
        laneName: "Gold regression",
    });
}

function resolveCurrentStandardWordSapphireEntry({ entry = {}, sapphireEntries } = {}) {
    return findEntriesByIdentity(sapphireEntries, buildWordEntryIdentity(entry), {
        laneName: "current-standard Sapphire",
        includeEntry: hasCurrentStandardWordSapphireStatus,
    });
}

function resolvePriorLaneResult({ entry = {}, results = [], laneName = "prior lane" } = {}) {
    const identity = buildWordEntryIdentity(entry);
    const matches = (Array.isArray(results) ? results : [])
        .filter((result) => normalizeText(result.identity || buildWordEntryIdentity(result)) === normalizeText(identity));

    if (matches.length === 0) {
        return {
            failures: [],
        };
    }
    if (matches.length > 1) {
        return {
            failures: [`${laneName} requires a unique gate result for ${identity}; found ${matches.length}`],
        };
    }
    if (matches[0].passed === false) {
        const details = Array.isArray(matches[0].failures) && matches[0].failures.length > 0
            ? `: ${matches[0].failures.join("; ")}`
            : "";
        return {
            result: matches[0],
            failures: [`${laneName} gate must pass for ${identity}${details}`],
        };
    }

    return {
        result: matches[0],
        failures: [],
    };
}

function resolveWordLaneContext({
    entry = {},
    goldenExpectations,
    sapphireEntries,
    sapphireResults,
} = {}) {
    const gold = resolveWordGoldExpectation({ entry, goldenExpectations });
    const sapphire = sapphireEntries === undefined
        ? { failures: [] }
        : resolveCurrentStandardWordSapphireEntry({ entry, sapphireEntries });
    const sapphireGate = sapphireResults === undefined
        ? { failures: [] }
        : resolvePriorLaneResult({
            entry,
            results: sapphireResults,
            laneName: "Sapphire",
        });

    return {
        identity: formatWordIdentity(entry),
        goldExpectation: gold.entry,
        sapphireEntry: sapphire.entry,
        sapphireResult: sapphireGate.result,
        failures: [
            ...gold.failures,
            ...sapphire.failures,
            ...sapphireGate.failures,
        ],
    };
}

function getGoldProtectedWordField({ entry = {}, goldExpectation = {}, field } = {}) {
    const goldEntry = goldExpectation || {};
    const goldValue = normalizeStringArray(goldEntry[field]);
    if (goldValue.length > 0) {
        return goldValue;
    }
    return normalizeStringArray(entry[field]);
}

function getSapphireStructuralWordField({ entry = {}, sapphireEntry = {}, field } = {}) {
    const sapphireValue = sapphireEntry ? sapphireEntry[field] : undefined;
    if (Array.isArray(sapphireValue)) {
        return sapphireValue;
    }
    return entry[field];
}

function buildResolvedWordFields({ entry = {}, goldExpectation = {}, sapphireEntry = {} } = {}) {
    const fields = {};
    const resolvedGoldExpectation = goldExpectation || {};
    const resolvedSapphireEntry = sapphireEntry || {};
    for (const field of WORD_GOLD_PROTECTED_FIELDS) {
        fields[field] = getGoldProtectedWordField({ entry, goldExpectation: resolvedGoldExpectation, field });
    }
    for (const field of WORD_SAPPHIRE_STRUCTURAL_FIELDS) {
        fields[field] = getSapphireStructuralWordField({ entry, sapphireEntry: resolvedSapphireEntry, field });
    }
    return fields;
}

module.exports = {
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    WORD_GOLD_PROTECTED_FIELDS,
    WORD_SAPPHIRE_STRUCTURAL_FIELDS,
    buildResolvedWordFields,
    findEntriesByIdentity,
    formatWordIdentity,
    getGoldProtectedWordField,
    getSapphireStructuralWordField,
    hasCurrentStandardWordSapphireStatus,
    resolveCurrentStandardWordSapphireEntry,
    resolvePriorLaneResult,
    resolveWordGoldExpectation,
    resolveWordLaneContext,
};
