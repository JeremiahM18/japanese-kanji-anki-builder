function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForCompare(value) {
    return normalizeText(value).toLowerCase();
}

function includesAll(haystack, needles = []) {
    const normalizedHaystack = normalizeForCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => normalizedHaystack.includes(normalizeForCompare(needle)));
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
    if (!normalizeText(card.reading)) {
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

    if (Array.isArray(expectation.readingIncludes) && !includesAll(card.reading, expectation.readingIncludes)) {
        failures.push(`reading did not include: ${expectation.readingIncludes.join(", ")}`);
    }
    if (Array.isArray(expectation.meaningIncludes) && !includesAll(card.meaningJP, expectation.meaningIncludes)) {
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

function formatGoldenReviewReport(report, { title = "Japanese Kanji Builder Golden Review" } = {}) {
    const lines = [];
    lines.push(title);
    lines.push("");
    lines.push(`Cards reviewed: ${report.totalCards}`);
    lines.push(`Passed: ${report.passedCount}`);
    lines.push(`Failed: ${report.failedCount}`);
    lines.push(`Overall result: ${report.passed ? "passing" : "failing"}`);

    for (const result of report.results || []) {
        lines.push("");
        lines.push(`- ${result.kanji}: ${result.passed ? "pass" : "fail"}`);
        if (!result.passed) {
            for (const failure of result.failures) {
                lines.push(`  ${failure}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    evaluateGoldenReviewSet,
    formatGoldenReviewReport,
};
