const {
    buildCurrentPlatinumWordSet,
    buildCurrentSapphireWordSet,
    buildRowIdentity,
    CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD,
} = require("./platinumWordContentReviewService");

const PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES = Object.freeze({
    MISSING_CURRENT_STANDARD: "missing-current-standard",
    MISSING_SAPPHIRE_PREREQUISITE: "missing-sapphire-prerequisite",
    CURRENT_STANDARD: "current-standard",
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeQueueMode(value) {
    const normalized = normalizeText(value) || PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD;
    if (!Object.values(PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES).includes(normalized)) {
        throw new Error(`Unsupported Platinum word content queue: ${normalized}`);
    }
    return normalized;
}

function selectBatchRows({
    rows = [],
    requestedWords = [],
    currentSapphireWords = new Set(),
    currentPlatinumWords = new Set(),
    queue = PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
    limit = 8,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const requested = new Set((Array.isArray(requestedWords) ? requestedWords : [])
        .map((item) => `${normalizeText(item.word)}|${normalizeText(item.reading)}`)
        .filter((identity) => !identity.endsWith("|")));
    const scopedRows = requested.size > 0
        ? generatedRows.filter((row) => requested.has(buildRowIdentity(row)))
        : generatedRows;
    const selected = scopedRows.filter((row) => {
        const identity = buildRowIdentity(row);
        const hasSapphire = currentSapphireWords.has(identity);
        const hasPlatinum = currentPlatinumWords.has(identity);

        if (queue === PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES.MISSING_SAPPHIRE_PREREQUISITE) {
            return !hasSapphire;
        }
        if (queue === PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES.CURRENT_STANDARD) {
            return hasPlatinum;
        }
        return hasSapphire && !hasPlatinum;
    });

    return selected.slice(0, Math.max(0, Number(limit) || 0));
}

function buildCard(row = {}, {
    currentSapphireWords = new Set(),
    currentPlatinumWords = new Set(),
} = {}) {
    const identity = buildRowIdentity(row);
    const hasSapphire = currentSapphireWords.has(identity);
    const hasPlatinum = currentPlatinumWords.has(identity);
    const reviewStatus = hasPlatinum
        ? "current_standard_platinum"
        : hasSapphire
            ? "missing_platinum_content"
            : "missing_sapphire_prerequisite";

    return {
        identity,
        word: row.word || "",
        reading: row.reading || "",
        reviewStatus,
        sapphirePrerequisite: hasSapphire ? "current-standard" : "missing",
        platinumContent: hasPlatinum ? "current-standard" : "missing",
        surface: {
            meaning: row.meaning || "",
            jlptLevel: row.jlptLevel || "",
            coverageRole: row.coverageRole || "",
            readingBreakdown: row.readingBreakdown || "",
            focusKanji: row.focusKanji || "",
            coversReading: row.coversReading || "",
            exampleSentence: row.exampleSentence || "",
            audio: row.audio || "",
            pitchAccent: row.pitchAccent || "",
            notes: row.notes || "",
        },
        reviewerAction: hasSapphire
            ? "Perform expert Platinum content review after the completed Sapphire structural prerequisite."
            : "Complete Sapphire structural/card-quality review before Platinum content certification.",
    };
}

function buildPlatinumWordContentBatchReport({
    rows = [],
    platinumEntries = [],
    sapphireEntries = [],
    level,
    words = [],
    limit = 8,
    queue = PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
} = {}) {
    const normalizedQueue = normalizeQueueMode(queue);
    const generatedRows = Array.isArray(rows) ? rows : [];
    const currentSapphireWords = buildCurrentSapphireWordSet(sapphireEntries);
    const currentPlatinumWords = buildCurrentPlatinumWordSet(platinumEntries);
    const cards = selectBatchRows({
        rows: generatedRows,
        requestedWords: words,
        currentSapphireWords,
        currentPlatinumWords,
        queue: normalizedQueue,
        limit,
    }).map((row) => buildCard(row, { currentSapphireWords, currentPlatinumWords }));
    const requestedSet = new Set((Array.isArray(words) ? words : [])
        .map((item) => `${normalizeText(item.word)}|${normalizeText(item.reading)}`)
        .filter((identity) => !identity.endsWith("|")));
    const generatedIdentities = new Set(generatedRows.map(buildRowIdentity).filter((identity) => !identity.endsWith("|")));
    const requestedMissing = [...requestedSet].filter((item) => !generatedIdentities.has(item)).sort((a, b) => a.localeCompare(b, "ja"));

    return {
        level,
        lane: "platinum",
        scope: Number.isInteger(level) ? `N${level} word` : "word",
        queue: normalizedQueue,
        currentReviewStandard: CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD,
        scopedToRequestedWords: requestedSet.size > 0,
        summary: {
            generatedRows: generatedRows.length,
            currentStandardSapphirePrerequisites: currentSapphireWords.size,
            currentStandardPlatinum: currentPlatinumWords.size,
            remainingPlatinumContent: generatedRows.filter((row) => (
                currentSapphireWords.has(buildRowIdentity(row))
                && !currentPlatinumWords.has(buildRowIdentity(row))
            )).length,
            blockedByMissingSapphire: generatedRows.filter((row) => !currentSapphireWords.has(buildRowIdentity(row))).length,
            selectedCards: cards.length,
            requestedMissing: requestedMissing.length,
        },
        requestedMissing,
        cards,
    };
}

function formatPlatinumWordContentBatchReport(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Platinum ${levelLabel} Word Content Batch Report`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        "Lane: Platinum expert content certification after Sapphire; not Sapphire structure or Obsidian proof",
        `Generated cards: ${summary.generatedRows || 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD}`,
        `Queue: ${report.queue || PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD}`,
        `Current-standard Sapphire prerequisites: ${summary.currentStandardSapphirePrerequisites || 0}`,
        `Current-standard Platinum content entries: ${summary.currentStandardPlatinum || 0}`,
        `Missing Platinum content after Sapphire: ${summary.remainingPlatinumContent || 0}`,
        `Blocked by missing Sapphire prerequisite: ${summary.blockedByMissingSapphire || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];

    if (Array.isArray(report.requestedMissing) && report.requestedMissing.length > 0) {
        lines.push("", `Requested word identities not found (${report.requestedMissing.length}):`);
        for (const identity of report.requestedMissing) {
            lines.push(`- ${identity}`);
        }
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.identity} [${card.reviewStatus}]`);
        lines.push(`  Surface: Meaning=${card.surface.meaning || "(blank)"} | ${card.surface.jlptLevel || "(blank)"} | ${card.surface.coverageRole || "(blank)"}`);
        lines.push(`  Breakdown: ${card.surface.readingBreakdown || "(blank)"}`);
        lines.push(`  Example: ${card.surface.exampleSentence || "(blank)"}`);
        lines.push(`  Audio: ${card.surface.audio || "(blank)"}`);
        lines.push(`  Pitch: ${card.surface.pitchAccent || "(blank)"}`);
        lines.push(`  Sapphire prerequisite: ${card.sapphirePrerequisite}`);
        lines.push(`  Reviewer action: ${card.reviewerAction}`);
    }

    lines.push(
        "",
        "This report is read-only. It prepares Platinum content review; it does not create Sapphire entries, record Obsidian proof, or prove release readiness."
    );
    return `${lines.join("\n")}\n`;
}

module.exports = {
    PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES,
    buildPlatinumWordContentBatchReport,
    formatPlatinumWordContentBatchReport,
    normalizeQueueMode,
    selectBatchRows,
};
