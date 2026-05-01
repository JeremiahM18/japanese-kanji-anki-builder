function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForCompare(value) {
    return normalizeText(value)
        .replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gu, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/:\s+/g, ":")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function includesAll(haystack, needles = []) {
    const normalizedHaystack = normalizeForCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => normalizedHaystack.includes(normalizeForCompare(needle)));
}

function buildReviewReadingText(card = {}) {
    const parts = [card.primaryReading, card.onReading, card.kunReading]
        .map((value) => normalizeText(value))
        .filter(Boolean);

    if (parts.length > 0) {
        return parts.join(" ／ ");
    }

    return normalizeText(card.reading);
}

function buildReviewMeaningText(card = {}) {
    return [card.meaningJP, card.kanjiMeanings]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(" ／ ");
}

function evaluateExpectation(card, expectation) {
    const failures = [];
    const genericFallback = "Offline preview built from local data only.";

    if (!card) {
        return {
            kanji: expectation.kanji,
            passed: false,
            failures: ["card could not be generated"],
        };
    }

    if (card.error) {
        failures.push(`preview error: ${card.error}`);
    }

    if (!normalizeText(card.meaningJP)) {
        failures.push("meaning is empty");
    }
    if (!normalizeText(card.kanjiMeanings)) {
        failures.push("kanji meanings are empty");
    }
    const reviewReading = buildReviewReadingText(card);
    const reviewMeaning = buildReviewMeaningText(card);
    if (!reviewReading) {
        failures.push("reading is empty");
    }
    if (!normalizeText(card.exampleSentence)) {
        failures.push("example sentence is empty");
    }
    if (!normalizeText(card.notes)) {
        failures.push("notes are empty");
    }
    if (normalizeText(card.notes).includes(genericFallback)) {
        failures.push("notes still use the generic offline fallback");
    }

    if (Array.isArray(expectation.readingIncludes) && !includesAll(reviewReading, expectation.readingIncludes)) {
        failures.push(`reading did not include: ${expectation.readingIncludes.join(", ")}`);
    }
    if (
        Array.isArray(expectation.readingIncludes)
        && normalizeText(card.primaryReading)
        && !includesAll(card.primaryReading, expectation.readingIncludes)
    ) {
        failures.push(`primary reading did not include: ${expectation.readingIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.meaningIncludes) && !includesAll(reviewMeaning, expectation.meaningIncludes)) {
        failures.push(`meaning did not include: ${expectation.meaningIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.exampleIncludes) && !includesAll(card.exampleSentence, expectation.exampleIncludes)) {
        failures.push(`example did not include: ${expectation.exampleIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.notesIncludes) && !includesAll(card.notes, expectation.notesIncludes)) {
        failures.push(`notes did not include: ${expectation.notesIncludes.join(", ")}`);
    }

    return {
        kanji: expectation.kanji,
        passed: failures.length === 0,
        failures,
        card,
    };
}

function evaluateWordExpectation(row, expectation) {
    const failures = [];

    if (!row) {
        return {
            word: expectation.word,
            passed: false,
            failures: ["word could not be generated"],
        };
    }

    if (!normalizeText(row.reading)) {
        failures.push("reading is empty");
    }
    if (!normalizeText(row.meaning)) {
        failures.push("meaning is empty");
    }
    if (!normalizeText(row.kanjiBreakdown)) {
        failures.push("kanji breakdown is empty");
    }
    if (!normalizeText(row.exampleSentence)) {
        failures.push("example sentence is empty");
    }
    if (!normalizeText(row.jlptLevel)) {
        failures.push("JLPT level is empty");
    }
    if (!normalizeText(row.coverageRole)) {
        failures.push("coverage role is empty");
    }
    if (!normalizeText(row.focusKanji)) {
        failures.push("focus kanji is empty");
    }
    if (!normalizeText(row.coversReading)) {
        failures.push("covered reading is empty");
    }

    if (Array.isArray(expectation.readingIncludes) && !includesAll(row.reading, expectation.readingIncludes)) {
        failures.push(`reading did not include: ${expectation.readingIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.meaningIncludes) && !includesAll(row.meaning, expectation.meaningIncludes)) {
        failures.push(`meaning did not include: ${expectation.meaningIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.jlptLevelIncludes) && !includesAll(row.jlptLevel, expectation.jlptLevelIncludes)) {
        failures.push(`JLPT level did not include: ${expectation.jlptLevelIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.coverageRoleIncludes) && !includesAll(row.coverageRole, expectation.coverageRoleIncludes)) {
        failures.push(`coverage role did not include: ${expectation.coverageRoleIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.focusIncludes) && !includesAll(row.focusKanji, expectation.focusIncludes)) {
        failures.push(`focus kanji did not include: ${expectation.focusIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.coversReadingIncludes) && !includesAll(row.coversReading, expectation.coversReadingIncludes)) {
        failures.push(`covered reading did not include: ${expectation.coversReadingIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.breakdownIncludes) && !includesAll(row.kanjiBreakdown, expectation.breakdownIncludes)) {
        failures.push(`breakdown did not include: ${expectation.breakdownIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.exampleIncludes) && !includesAll(row.exampleSentence, expectation.exampleIncludes)) {
        failures.push(`example did not include: ${expectation.exampleIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.notesIncludes) && !includesAll(row.notes, expectation.notesIncludes)) {
        failures.push(`notes did not include: ${expectation.notesIncludes.join(", ")}`);
    }

    return {
        word: expectation.word,
        passed: failures.length === 0,
        failures,
        row,
    };
}

function findDuplicateValues(values = []) {
    const seen = new Set();
    const duplicates = new Set();

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
        }
        seen.add(value);
    }

    return [...duplicates].sort();
}

function buildWordReviewKey({ word = "", reading = "" } = {}) {
    return `${normalizeForCompare(word)}|${normalizeForCompare(reading)}`;
}

function buildExpectedReadingText(expectation = {}) {
    return (Array.isArray(expectation.readingIncludes) ? expectation.readingIncludes : [])
        .map((reading) => normalizeText(reading))
        .filter(Boolean)
        .join(" / ");
}

function formatWordReviewLabel(word, reading = "") {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord} (${normalizedReading})` : normalizedWord;
}

function wordRowMatchesExpectation(row = {}, expectation = {}) {
    if (row.word !== expectation.word) {
        return false;
    }
    if (!Array.isArray(expectation.readingIncludes) || expectation.readingIncludes.length === 0) {
        return true;
    }
    return includesAll(row.reading, expectation.readingIncludes);
}

function findWordRowForExpectation(rows = [], expectation = {}) {
    const candidates = rows.filter((row) => wordRowMatchesExpectation(row, expectation));
    if (candidates.length === 1) {
        return candidates[0];
    }
    if (candidates.length > 1) {
        return {
            word: expectation.word,
            error: `ambiguous generated word rows: ${candidates.map((row) => `${row.word} (${row.reading})`).join(", ")}`,
        };
    }
    return null;
}

function expectationMatchesWordRow(expectation = {}, row = {}) {
    return wordRowMatchesExpectation(row, expectation);
}

function evaluateGoldenReviewSet({ cards = [], expectations = [] } = {}) {
    const cardsByKanji = new Map((Array.isArray(cards) ? cards : []).map((card) => [card.kanji, card]));
    const results = (Array.isArray(expectations) ? expectations : []).map((expectation) => evaluateExpectation(cardsByKanji.get(expectation.kanji), expectation));
    const passedCount = results.filter((result) => result.passed).length;

    return {
        totalCards: results.length,
        passedCount,
        failedCount: results.length - passedCount,
        passed: results.length > 0 && passedCount === results.length,
        results,
    };
}

function evaluateGoldenWordReviewSet({ rows = [], expectations = [], requireAllRows = false } = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewExpectations = Array.isArray(expectations) ? expectations : [];
    const results = reviewExpectations.map((expectation) => {
        const row = findWordRowForExpectation(generatedRows, expectation);
        const result = evaluateWordExpectation(row, expectation);
        if (row?.error) {
            result.failures.push(row.error);
            result.passed = false;
        }
        return result;
    });
    const passedCount = results.filter((result) => result.passed).length;
    const expectationKeys = reviewExpectations.map((expectation) => buildWordReviewKey({
        word: expectation.word,
        reading: buildExpectedReadingText(expectation),
    }));
    const expectationLabelsByKey = new Map(reviewExpectations.map((expectation) => {
        const readingText = buildExpectedReadingText(expectation);
        return [
            buildWordReviewKey({ word: expectation.word, reading: readingText }),
            formatWordReviewLabel(expectation.word, readingText),
        ];
    }));
    const duplicateExpectationWords = findDuplicateValues(expectationKeys)
        .map((key) => expectationLabelsByKey.get(key) || key);
    const missingExpectationWords = requireAllRows
        ? generatedRows
            .filter((row) => !reviewExpectations.some((expectation) => expectationMatchesWordRow(expectation, row)))
            .map((row) => formatWordReviewLabel(row.word, row.reading))
            .sort()
        : [];
    const extraExpectationWords = reviewExpectations
        .filter((expectation) => !generatedRows.some((row) => expectationMatchesWordRow(expectation, row)))
        .map((expectation) => {
            const readingText = buildExpectedReadingText(expectation);
            return formatWordReviewLabel(expectation.word, readingText);
        })
        .sort();
    const coverageFailures = [];

    if (duplicateExpectationWords.length > 0) {
        coverageFailures.push(`duplicate expectations: ${duplicateExpectationWords.join(", ")}`);
    }
    if (missingExpectationWords.length > 0) {
        coverageFailures.push(`missing expectations for generated words: ${missingExpectationWords.join(", ")}`);
    }
    if (extraExpectationWords.length > 0) {
        coverageFailures.push(`expectations for missing generated words: ${extraExpectationWords.join(", ")}`);
    }

    return {
        totalCards: results.length,
        passedCount,
        failedCount: results.length - passedCount,
        passed: results.length > 0 && passedCount === results.length && coverageFailures.length === 0,
        coverageFailures,
        missingExpectationWords,
        extraExpectationWords,
        duplicateExpectationWords,
        results,
    };
}

function formatGoldenReviewReport(report, { title = "Japanese Kanji Builder Golden Review" } = {}) {
    const lines = [];
    lines.push(title);
    lines.push("");
    lines.push(`Cards reviewed: ${report.totalCards}`);
    lines.push(`Passed: ${report.passedCount}`);
    lines.push(`Failed: ${report.failedCount}`);
    lines.push(`Overall result: ${report.passed ? "passing" : "failing"}`);

    if (Array.isArray(report.coverageFailures) && report.coverageFailures.length > 0) {
        lines.push("");
        lines.push("Coverage failures:");
        for (const failure of report.coverageFailures) {
            lines.push(`- ${failure}`);
        }
    }

    for (const result of report.results || []) {
        const label = result.kanji || result.word || "entry";
        lines.push("");
        lines.push(`- ${label}: ${result.passed ? "pass" : "fail"}`);
        if (!result.passed) {
            for (const failure of result.failures) {
                lines.push(`  ${failure}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildReviewMeaningText,
    buildReviewReadingText,
    evaluateGoldenReviewSet,
    evaluateGoldenWordReviewSet,
    formatGoldenReviewReport,
};
