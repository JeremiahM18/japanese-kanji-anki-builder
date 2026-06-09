const {
    evaluateGoldenReviewSet,
    evaluateGoldenWordReviewSet,
} = require("./goldenReviewService");

function normalizeText(value) {
    return String(value ?? "").trim();
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

function buildKanjiGoldPreconditionFailuresByKey({
    rows = [],
    entries = [],
    goldenExpectations,
    laneName = "review lane",
} = {}) {
    const failuresByKey = new Map();
    const expectations = Array.isArray(goldenExpectations) ? goldenExpectations : null;

    for (const entry of Array.isArray(entries) ? entries : []) {
        const kanji = normalizeText(entry.kanji);
        if (!kanji) {
            continue;
        }

        if (!expectations) {
            appendFailure(failuresByKey, kanji, `${laneName} requires prior Gold regression input for ${kanji}`);
            continue;
        }

        const matchingExpectations = expectations.filter((expectation) => normalizeText(expectation.kanji) === kanji);
        if (matchingExpectations.length === 0) {
            appendFailure(failuresByKey, kanji, `${laneName} requires a prior Gold expectation for ${kanji}`);
            continue;
        }
        if (matchingExpectations.length > 1) {
            appendFailure(failuresByKey, kanji, `${laneName} requires a unique prior Gold expectation for ${kanji}; found ${matchingExpectations.length}`);
            continue;
        }

        const report = evaluateGoldenReviewSet({
            cards: rows,
            expectations: matchingExpectations,
        });
        const result = report.results?.[0] || {};
        if (!report.passed || !result.passed) {
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

    for (const entry of Array.isArray(entries) ? entries : []) {
        const identity = buildWordEntryIdentity(entry);
        if (!identity) {
            continue;
        }

        if (!expectations) {
            appendFailure(failuresByKey, identity, `${laneName} requires prior Gold regression input for ${identity}`);
            continue;
        }

        const matchingExpectations = expectations.filter((expectation) => buildWordEntryIdentity(expectation) === identity);
        if (matchingExpectations.length === 0) {
            appendFailure(failuresByKey, identity, `${laneName} requires a prior Gold expectation for ${identity}`);
            continue;
        }
        if (matchingExpectations.length > 1) {
            appendFailure(failuresByKey, identity, `${laneName} requires a unique prior Gold expectation for ${identity}; found ${matchingExpectations.length}`);
            continue;
        }

        const report = evaluateGoldenWordReviewSet({
            rows,
            expectations: matchingExpectations,
        });
        const result = report.results?.[0] || {};
        const coverageFailures = Array.isArray(report.coverageFailures) ? report.coverageFailures : [];
        if (!report.passed || !result.passed || coverageFailures.length > 0) {
            const details = [...resultFailures(result), ...coverageFailures.map(normalizeText).filter(Boolean)];
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

    for (const entry of Array.isArray(entries) ? entries : []) {
        const key = normalizeText(getEntryKey(entry));
        if (!key) {
            continue;
        }

        if (!priorEntryList) {
            appendFailure(failuresByKey, key, `${laneName} requires prior ${priorLaneName} input for ${key}`);
            continue;
        }

        const matchingPriorEntries = priorEntryList.filter((priorEntry) => (
            normalizeText(getPriorEntryKey(priorEntry)) === key
            && (!isCurrentStandardPriorEntry || isCurrentStandardPriorEntry(priorEntry))
        ));
        if (matchingPriorEntries.length === 0) {
            appendFailure(failuresByKey, key, `${laneName} requires current-standard ${priorLaneName} coverage for ${key}`);
            continue;
        }
        if (matchingPriorEntries.length > 1) {
            appendFailure(failuresByKey, key, `${laneName} requires unique current-standard ${priorLaneName} coverage for ${key}; found ${matchingPriorEntries.length}`);
        }

        const matchingResult = priorResultList.find((result) => normalizeText(getResultKey(result)) === key);
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
};
