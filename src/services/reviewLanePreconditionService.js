const {
    evaluateGoldenReviewSet,
    evaluateGoldenWordReviewSet,
} = require("./goldenReviewService");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeLaneBoundaryText(value) {
    return normalizeText(value).replace(/\s+/g, " ");
}

function evidenceEntries(value) {
    return (Array.isArray(value) ? value : [])
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
}

function buildPlatinumLaneAuthorityLabel({ deckKind = "", entry = {} } = {}) {
    if (deckKind === "word") {
        return buildWordEntryIdentity(entry);
    }
    return normalizeText(entry.kanji);
}

const SAPPHIRE_REVIEW_STANDARD_PATTERN = /\b(?:kanji|word)-sapphire-v\d+-evidence-lanes\b/i;
const SAPPHIRE_REVIEW_AUTHORITY_SOURCE_PATTERN = /\bSapphire\b/i;
const SAPPHIRE_DERIVED_PLATINUM_AUTHORITY_PATTERN = /(?:Sapphire product review|current-standard\s+(?:word\s+|kanji\s+)?Sapphire review|Native Sapphire structural review entry|Representation migration[^.]*Sapphire|Sapphire structural review entry|This is not Platinum|not Platinum card-surface inspection|not Platinum,|not Platinum\.|structure-only Sapphire)/i;

function validatePlatinumLaneAuthorityBoundary({ deckKind = "", entry = {} } = {}) {
    const failures = [];
    const label = buildPlatinumLaneAuthorityLabel({ deckKind, entry }) || "entry";
    const reviewer = normalizeLaneBoundaryText(entry.reviewer);
    const reviewStandard = normalizeLaneBoundaryText(entry.reviewStandard);

    if (entry.migrationProvenance !== undefined) {
        failures.push(`${label} active Platinum entry must not carry Sapphire migrationProvenance; create lane-native Platinum evidence after actual card-surface inspection`);
    }
    if (entry.sapphireReviewAudit !== undefined) {
        failures.push(`${label} active Platinum entry must not carry sapphireReviewAudit; Sapphire structural audit is a prior-lane precondition, not Platinum authority`);
    }
    if (/sapphire/i.test(reviewer)) {
        failures.push(`${label} active Platinum reviewer must not be a Sapphire reviewer identity`);
    }
    if (SAPPHIRE_REVIEW_STANDARD_PATTERN.test(reviewStandard)) {
        failures.push(`${label} active Platinum reviewStandard must not use a Sapphire review standard`);
    }

    for (const laneName of ["sourceEvidence", "internalChecks", "reviewEvidence"]) {
        for (const evidence of evidenceEntries(entry[laneName])) {
            const source = normalizeLaneBoundaryText(evidence.source);
            const detail = normalizeLaneBoundaryText(evidence.detail);
            if (SAPPHIRE_REVIEW_AUTHORITY_SOURCE_PATTERN.test(source)) {
                failures.push(`${label} ${laneName} source must not use Sapphire as Platinum review authority: ${source}`);
            }
            if (SAPPHIRE_DERIVED_PLATINUM_AUTHORITY_PATTERN.test(detail)) {
                failures.push(`${label} ${laneName} detail appears copied from Sapphire authority instead of lane-native Platinum card-surface inspection`);
            }
        }
    }

    return failures;
}

function formatWordIdentity(word = "", reading = "") {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord}|${normalizedReading}` : normalizedWord;
}

function buildWordEntryReading(entry = {}) {
    return (Array.isArray(entry.readingIncludes) ? entry.readingIncludes : [])
        .map((reading) => normalizeText(reading))
        .filter(Boolean)
        .join(" / ");
}

function buildWordEntryIdentity(entry = {}) {
    return formatWordIdentity(entry.word, buildWordEntryReading(entry));
}

function buildWordRowIdentity(row = {}) {
    return formatWordIdentity(row.word, row.reading);
}

function appendFailure(failuresByKey, key, message) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
        return;
    }
    if (!failuresByKey.has(normalizedKey)) {
        failuresByKey.set(normalizedKey, []);
    }
    failuresByKey.get(normalizedKey).push(message);
}

function resultFailures(result = {}) {
    return (Array.isArray(result.failures) ? result.failures : [])
        .map((failure) => normalizeText(failure))
        .filter(Boolean);
}

function groupEntriesByKey(entries = [], getKey, includeEntry = () => true) {
    const entriesByKey = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!includeEntry(entry)) {
            continue;
        }
        const key = normalizeText(getKey(entry));
        if (!key) {
            continue;
        }
        if (!entriesByKey.has(key)) {
            entriesByKey.set(key, []);
        }
        entriesByKey.get(key).push(entry);
    }
    return entriesByKey;
}

function buildKanjiGoldPreconditionFailuresByKey({
    rows = [],
    entries = [],
    goldenExpectations,
    laneName = "review lane",
} = {}) {
    const failuresByKey = new Map();
    const expectations = Array.isArray(goldenExpectations) ? goldenExpectations : null;
    const expectationEntriesByKey = expectations
        ? groupEntriesByKey(expectations, (expectation) => expectation.kanji)
        : null;
    const matchedExpectationKeys = [];
    const matchedExpectations = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        const kanji = normalizeText(entry.kanji);
        if (!kanji) {
            continue;
        }

        if (!expectations) {
            appendFailure(failuresByKey, kanji, `${laneName} requires prior Gold regression input for ${kanji}`);
            continue;
        }

        const matchingExpectations = expectationEntriesByKey.get(kanji) || [];
        if (matchingExpectations.length === 0) {
            appendFailure(failuresByKey, kanji, `${laneName} requires a prior Gold expectation for ${kanji}`);
            continue;
        }
        if (matchingExpectations.length > 1) {
            appendFailure(failuresByKey, kanji, `${laneName} requires a unique prior Gold expectation for ${kanji}; found ${matchingExpectations.length}`);
            continue;
        }

        matchedExpectationKeys.push(kanji);
        matchedExpectations.push(matchingExpectations[0]);
    }

    const report = matchedExpectations.length > 0
        ? evaluateGoldenReviewSet({
            cards: rows,
            expectations: matchedExpectations,
        })
        : { results: [] };

    for (const [index, kanji] of matchedExpectationKeys.entries()) {
        const result = report.results?.[index] || {};
        if (!result.passed) {
            const details = resultFailures(result);
            appendFailure(
                failuresByKey,
                kanji,
                `${laneName} requires passing prior Gold regression for ${kanji}${details.length > 0 ? `: ${details.join("; ")}` : ""}`
            );
        }
    }

    return failuresByKey;
}

function buildWordGoldPreconditionFailuresByKey({
    rows = [],
    entries = [],
    goldenExpectations,
    laneName = "review lane",
} = {}) {
    const failuresByKey = new Map();
    const expectations = Array.isArray(goldenExpectations) ? goldenExpectations : null;
    const expectationEntriesByKey = expectations
        ? groupEntriesByKey(expectations, buildWordEntryIdentity)
        : null;
    const matchedExpectationKeys = [];
    const matchedExpectations = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        const identity = buildWordEntryIdentity(entry);
        if (!identity) {
            continue;
        }

        if (!expectations) {
            appendFailure(failuresByKey, identity, `${laneName} requires prior Gold regression input for ${identity}`);
            continue;
        }

        const matchingExpectations = expectationEntriesByKey.get(identity) || [];
        if (matchingExpectations.length === 0) {
            appendFailure(failuresByKey, identity, `${laneName} requires a prior Gold expectation for ${identity}`);
            continue;
        }
        if (matchingExpectations.length > 1) {
            appendFailure(failuresByKey, identity, `${laneName} requires a unique prior Gold expectation for ${identity}; found ${matchingExpectations.length}`);
            continue;
        }

        matchedExpectationKeys.push(identity);
        matchedExpectations.push(matchingExpectations[0]);
    }

    const report = matchedExpectations.length > 0
        ? evaluateGoldenWordReviewSet({
            rows,
            expectations: matchedExpectations,
        })
        : { results: [] };

    for (const [index, identity] of matchedExpectationKeys.entries()) {
        const result = report.results?.[index] || {};
        if (!result.passed) {
            const details = resultFailures(result);
            appendFailure(
                failuresByKey,
                identity,
                `${laneName} requires passing prior Gold regression for ${identity}${details.length > 0 ? `: ${details.join("; ")}` : ""}`
            );
        }
    }

    return failuresByKey;
}

function buildCurrentStandardPreconditionFailuresByKey({
    entries = [],
    priorEntries,
    priorResults = [],
    laneName = "review lane",
    priorLaneName = "prior lane",
    getEntryKey,
    getPriorEntryKey = getEntryKey,
    getResultKey,
    isCurrentStandardPriorEntry,
} = {}) {
    const failuresByKey = new Map();
    const priorEntryList = Array.isArray(priorEntries) ? priorEntries : null;
    const priorResultList = Array.isArray(priorResults) ? priorResults : [];
    const priorEntriesByKey = priorEntryList
        ? groupEntriesByKey(priorEntryList, getPriorEntryKey, isCurrentStandardPriorEntry)
        : null;
    const priorResultsByKey = groupEntriesByKey(priorResultList, getResultKey);

    for (const entry of Array.isArray(entries) ? entries : []) {
        const key = normalizeText(getEntryKey(entry));
        if (!key) {
            continue;
        }

        if (!priorEntryList) {
            appendFailure(failuresByKey, key, `${laneName} requires prior ${priorLaneName} input for ${key}`);
            continue;
        }

        const matchingPriorEntries = priorEntriesByKey.get(key) || [];
        if (matchingPriorEntries.length === 0) {
            appendFailure(failuresByKey, key, `${laneName} requires current-standard ${priorLaneName} coverage for ${key}`);
            continue;
        }
        if (matchingPriorEntries.length > 1) {
            appendFailure(failuresByKey, key, `${laneName} requires unique current-standard ${priorLaneName} coverage for ${key}; found ${matchingPriorEntries.length}`);
        }

        const matchingResult = (priorResultsByKey.get(key) || [])[0];
        if (matchingResult && matchingResult.passed === false) {
            const details = resultFailures(matchingResult);
            appendFailure(
                failuresByKey,
                key,
                `${laneName} requires passing prior ${priorLaneName} gate for ${key}${details.length > 0 ? `: ${details.join("; ")}` : ""}`
            );
        }
    }

    return failuresByKey;
}

function mergeFailuresIntoResult(result = {}, failures = []) {
    const mergedFailures = [
        ...(Array.isArray(result.failures) ? result.failures : []),
        ...(Array.isArray(failures) ? failures : []),
    ];
    return {
        ...result,
        failures: mergedFailures,
        passed: mergedFailures.length === 0,
    };
}

function collectPreconditionFailures(failuresByKey = new Map()) {
    return [...failuresByKey.values()].flat();
}

module.exports = {
    buildCurrentStandardPreconditionFailuresByKey,
    buildKanjiGoldPreconditionFailuresByKey,
    buildWordEntryIdentity,
    buildWordGoldPreconditionFailuresByKey,
    buildWordRowIdentity,
    collectPreconditionFailures,
    formatWordIdentity,
    mergeFailuresIntoResult,
    validatePlatinumLaneAuthorityBoundary,
};
