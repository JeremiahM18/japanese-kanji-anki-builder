const { decodeHtmlEntities } = require("../utils/text");
const {
    buildWordEntryIdentity,
    buildWordRowIdentity,
} = require("./reviewLanePreconditionService");

const GOLD_WORD_TODO_SENTINELS = Object.freeze({
    meaning: "TODO_GOLD_MEANING_REVIEW",
    example: "TODO_GOLD_EXAMPLE_REVIEW",
    notes: "TODO_GOLD_PROVENANCE_REVIEW",
    breakdown: "TODO_GOLD_BREAKDOWN_REVIEW",
});

const GOLD_WORD_SCAFFOLD_BOUNDARY = [
    "Gold expectation scaffold only",
    "draft artifact",
    "requires human review before template promotion",
    "not Sapphire",
    "not Platinum",
    "not Obsidian proof",
    "not release readiness",
].join("; ");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForCompare(value) {
    return stripFieldMarkup(value)
        .replace(/:\s+/g, ":")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function stripFieldMarkup(value) {
    return decodeHtmlEntities(String(value ?? "")
        .replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gu, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "))
        .trim();
}

function uniqueNonEmpty(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map((value) => normalizeText(value))
        .filter(Boolean))];
}

function splitJapaneseList(value) {
    return uniqueNonEmpty(String(value ?? "").split(/[、,，]/u));
}

function splitCoverageReadings(value) {
    return uniqueNonEmpty(String(value ?? "").split(/\s*／\s*|\s*;\s*/u));
}

function escapeRegExp(value) {
    return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectationMatchesWordRow(expectation = {}, row = {}) {
    if (row.word !== expectation.word) {
        return false;
    }

    const readings = uniqueNonEmpty(expectation.readingIncludes);
    if (readings.length === 0) {
        return true;
    }

    const rowReading = normalizeForCompare(row.reading);
    return readings.every((reading) => rowReading.includes(normalizeForCompare(reading)));
}

function rowMatchesTarget(row = {}, target = {}) {
    if (normalizeText(row.word) !== normalizeText(target.word)) {
        return false;
    }
    if (!normalizeText(target.reading)) {
        return true;
    }
    return normalizeText(row.reading) === normalizeText(target.reading);
}

function extractBreakdownFragments(row = {}) {
    const visibleBreakdown = stripFieldMarkup(row.kanjiBreakdown);
    if (!visibleBreakdown) {
        return [];
    }

    const fragments = [];
    for (const kanji of splitJapaneseList(row.focusKanji)) {
        const match = visibleBreakdown.match(new RegExp(`${escapeRegExp(kanji)}\\s*（[^）]+）`, "u"));
        if (match?.[0]) {
            fragments.push(match[0].replace(/\s+/g, " "));
        }
    }

    return uniqueNonEmpty(fragments);
}

function buildGoldWordExpectationDraft(row = {}) {
    const focusIncludes = splitJapaneseList(row.focusKanji);
    const coversReadingIncludes = splitCoverageReadings(row.coversReading);
    const breakdownIncludes = extractBreakdownFragments(row);

    return {
        word: normalizeText(row.word),
        readingIncludes: [normalizeText(row.reading)],
        meaningIncludes: [GOLD_WORD_TODO_SENTINELS.meaning],
        ...(normalizeText(row.jlptLevel) ? { jlptLevelIncludes: [normalizeText(row.jlptLevel)] } : {}),
        ...(normalizeText(row.coverageRole) ? { coverageRoleIncludes: [normalizeText(row.coverageRole)] } : {}),
        ...(focusIncludes.length > 0 ? { focusIncludes } : {}),
        ...(coversReadingIncludes.length > 0 ? { coversReadingIncludes } : {}),
        breakdownIncludes: breakdownIncludes.length > 0 ? breakdownIncludes : [GOLD_WORD_TODO_SENTINELS.breakdown],
        exampleIncludes: [GOLD_WORD_TODO_SENTINELS.example],
        notesIncludes: [GOLD_WORD_TODO_SENTINELS.notes],
    };
}

function buildDraftCard(row = {}) {
    const expectation = buildGoldWordExpectationDraft(row);
    return {
        identity: buildWordRowIdentity(row),
        word: normalizeText(row.word),
        reading: normalizeText(row.reading),
        expectation,
        generatedSurface: {
            meaning: normalizeText(row.meaning),
            jlptLevel: normalizeText(row.jlptLevel),
            coverageRole: normalizeText(row.coverageRole),
            focusKanji: normalizeText(row.focusKanji),
            coversReading: normalizeText(row.coversReading),
            breakdown: stripFieldMarkup(row.kanjiBreakdown),
            exampleSentence: normalizeText(row.exampleSentence),
            notes: normalizeText(row.notes),
        },
        todoSentinels: {
            meaningIncludes: GOLD_WORD_TODO_SENTINELS.meaning,
            exampleIncludes: GOLD_WORD_TODO_SENTINELS.example,
            notesIncludes: GOLD_WORD_TODO_SENTINELS.notes,
        },
    };
}

function isReviewedByGold(row = {}, expectations = []) {
    return (Array.isArray(expectations) ? expectations : [])
        .some((expectation) => expectationMatchesWordRow(expectation, row));
}

function buildRequestedWordState({ rows = [], expectations = [], words = [] } = {}) {
    const requestedMissing = [];
    const requestedAlreadyReviewed = [];

    for (const target of Array.isArray(words) ? words : []) {
        const identity = buildWordEntryIdentity({
            word: target.word,
            readingIncludes: normalizeText(target.reading) ? [target.reading] : [],
        });
        const matchingRows = rows.filter((row) => rowMatchesTarget(row, target));

        if (matchingRows.length === 0) {
            requestedMissing.push(identity);
            continue;
        }

        const allMatchesReviewed = matchingRows.every((row) => isReviewedByGold(row, expectations));
        if (allMatchesReviewed) {
            requestedAlreadyReviewed.push(...matchingRows.map(buildWordRowIdentity));
        }
    }

    return {
        requestedMissing: uniqueNonEmpty(requestedMissing),
        requestedAlreadyReviewed: uniqueNonEmpty(requestedAlreadyReviewed),
    };
}

function buildGoldWordExpectationScaffold({
    rows = [],
    expectations = [],
    level = null,
    limit = 8,
    words = [],
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewExpectations = Array.isArray(expectations) ? expectations : [];
    const requestedWords = Array.isArray(words) ? words : [];
    const scopedToRequestedWords = requestedWords.length > 0;
    const missingRows = generatedRows.filter((row) => !isReviewedByGold(row, reviewExpectations));
    const candidateRows = scopedToRequestedWords
        ? generatedRows.filter((row) => requestedWords.some((target) => rowMatchesTarget(row, target)))
            .filter((row) => !isReviewedByGold(row, reviewExpectations))
        : missingRows;
    const selectedRows = candidateRows.slice(0, Number.isFinite(limit) && limit >= 0 ? limit : 8);
    const cards = selectedRows.map(buildDraftCard);
    const requestedState = scopedToRequestedWords
        ? buildRequestedWordState({ rows: generatedRows, expectations: reviewExpectations, words: requestedWords })
        : { requestedMissing: [], requestedAlreadyReviewed: [] };

    return {
        level,
        lane: "gold",
        draftOnly: true,
        boundary: GOLD_WORD_SCAFFOLD_BOUNDARY,
        scope: scopedToRequestedWords
            ? `words=${requestedWords.map((word) => buildWordEntryIdentity({
                word: word.word,
                readingIncludes: normalizeText(word.reading) ? [word.reading] : [],
            })).join(",")}`
            : `missing-gold limit=${selectedRows.length}`,
        summary: {
            generatedRows: generatedRows.length,
            existingGoldExpectations: reviewExpectations.length,
            missingGoldRows: missingRows.length,
            selectedDrafts: cards.length,
            requestedMissing: requestedState.requestedMissing.length,
            requestedAlreadyReviewed: requestedState.requestedAlreadyReviewed.length,
        },
        todoSentinels: GOLD_WORD_TODO_SENTINELS,
        requestedMissing: requestedState.requestedMissing,
        requestedAlreadyReviewed: requestedState.requestedAlreadyReviewed,
        nextMissingWords: missingRows.map(buildWordRowIdentity),
        draftExpectations: cards.map((card) => card.expectation),
        cards,
    };
}

function formatJsonBlock(value) {
    return JSON.stringify(value, null, 2)
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n");
}

function formatGoldWordExpectationScaffold(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Gold ${levelLabel} Word Expectation Scaffold`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        "Lane: Gold regression draft; not Sapphire, Platinum, Obsidian proof, or release readiness",
        "Writes: none unless --out is explicitly provided; never writes tracked Gold templates",
        `Generated rows: ${summary.generatedRows || 0}`,
        `Existing Gold expectations: ${summary.existingGoldExpectations || 0}`,
        `Missing Gold rows: ${summary.missingGoldRows || 0}`,
        `Selected draft expectations: ${summary.selectedDrafts || 0}`,
        "Human TODO sentinels: meaningIncludes, exampleIncludes, notesIncludes",
    ];

    if (Array.isArray(report.requestedMissing) && report.requestedMissing.length > 0) {
        lines.push("", `Requested word identities not found (${report.requestedMissing.length}):`);
        for (const identity of report.requestedMissing) {
            lines.push(`- ${identity}`);
        }
    }

    if (Array.isArray(report.requestedAlreadyReviewed) && report.requestedAlreadyReviewed.length > 0) {
        lines.push("", `Requested word identities already covered by Gold (${report.requestedAlreadyReviewed.length}):`);
        for (const identity of report.requestedAlreadyReviewed) {
            lines.push(`- ${identity}`);
        }
    }

    if (Array.isArray(report.nextMissingWords) && report.nextMissingWords.length > 0) {
        lines.push("", `Next missing Gold queue (${Math.min(report.nextMissingWords.length, 30)}/${report.nextMissingWords.length}):`);
        for (const identity of report.nextMissingWords.slice(0, 30)) {
            lines.push(`- ${identity}`);
        }
        if (report.nextMissingWords.length > 30) {
            lines.push(`- ... ${report.nextMissingWords.length - 30} more`);
        }
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.identity}`);
        lines.push(`  Meaning surface: ${card.generatedSurface.meaning || "(blank)"}`);
        lines.push(`  Coverage: ${card.generatedSurface.jlptLevel || "(blank)"} | ${card.generatedSurface.coverageRole || "(blank)"}`);
        lines.push(`  Focus/Coverage: ${card.generatedSurface.focusKanji || "(blank)"} -> ${card.generatedSurface.coversReading || "(blank)"}`);
        lines.push(`  Breakdown surface: ${card.generatedSurface.breakdown || "(blank)"}`);
        lines.push(`  Example surface: ${card.generatedSurface.exampleSentence || "(blank)"}`);
        lines.push(`  Notes surface: ${card.generatedSurface.notes || "(blank)"}`);
        lines.push("  Draft expectation:");
        lines.push(formatJsonBlock(card.expectation));
    }

    lines.push(
        "",
        "This scaffold is assistive only. Replace TODO sentinels after actual Gold review before promoting any expectation into a tracked template."
    );
    return `${lines.join("\n")}\n`;
}

module.exports = {
    GOLD_WORD_SCAFFOLD_BOUNDARY,
    GOLD_WORD_TODO_SENTINELS,
    buildGoldWordExpectationDraft,
    buildGoldWordExpectationScaffold,
    expectationMatchesWordRow,
    formatGoldWordExpectationScaffold,
    stripFieldMarkup,
};
