const {
    buildCurrentPlatinumKanjiSet,
    buildCurrentSapphireKanjiSet,
    CURRENT_KANJI_PLATINUM_CONTENT_REVIEW_STANDARD,
} = require("./platinumKanjiContentReviewService");

const PLATINUM_CONTENT_BATCH_QUEUE_MODES = Object.freeze({
    MISSING_CURRENT_STANDARD: "missing-current-standard",
    MISSING_SAPPHIRE_PREREQUISITE: "missing-sapphire-prerequisite",
    CURRENT_STANDARD: "current-standard",
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeQueueMode(value) {
    const normalized = normalizeText(value) || PLATINUM_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD;
    if (!Object.values(PLATINUM_CONTENT_BATCH_QUEUE_MODES).includes(normalized)) {
        throw new Error(`Unsupported Platinum content queue: ${normalized}`);
    }
    return normalized;
}

function selectBatchRows({
    rows = [],
    requestedKanji = [],
    currentSapphireKanji = new Set(),
    currentPlatinumKanji = new Set(),
    queue = PLATINUM_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
    limit = 8,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const requested = new Set((Array.isArray(requestedKanji) ? requestedKanji : []).map(normalizeText).filter(Boolean));
    const scopedRows = requested.size > 0
        ? generatedRows.filter((row) => requested.has(normalizeText(row.kanji)))
        : generatedRows;
    const selected = scopedRows.filter((row) => {
        const kanji = normalizeText(row.kanji);
        const hasSapphire = currentSapphireKanji.has(kanji);
        const hasPlatinum = currentPlatinumKanji.has(kanji);

        if (queue === PLATINUM_CONTENT_BATCH_QUEUE_MODES.MISSING_SAPPHIRE_PREREQUISITE) {
            return !hasSapphire;
        }
        if (queue === PLATINUM_CONTENT_BATCH_QUEUE_MODES.CURRENT_STANDARD) {
            return hasPlatinum;
        }
        return hasSapphire && !hasPlatinum;
    });

    return selected.slice(0, Math.max(0, Number(limit) || 0));
}

function buildCard(row = {}, {
    currentSapphireKanji = new Set(),
    currentPlatinumKanji = new Set(),
} = {}) {
    const kanji = normalizeText(row.kanji);
    const hasSapphire = currentSapphireKanji.has(kanji);
    const hasPlatinum = currentPlatinumKanji.has(kanji);
    const reviewStatus = hasPlatinum
        ? "current_standard_platinum"
        : hasSapphire
            ? "missing_platinum_content"
            : "missing_sapphire_prerequisite";

    return {
        kanji,
        reviewStatus,
        sapphirePrerequisite: hasSapphire ? "current-standard" : "missing",
        platinumContent: hasPlatinum ? "current-standard" : "missing",
        surface: {
            displayWord: row.displayWord || "",
            primaryReading: row.primaryReading || "",
            meaningJP: row.meaningJP || "",
            kanjiMeanings: row.kanjiMeanings || "",
            exampleSentence: row.exampleSentence || "",
            notes: row.notes || "",
            audio: row.audio || "",
            strokeOrder: row.strokeOrder || "",
        },
        reviewerAction: hasSapphire
            ? "Perform expert Platinum content review after the completed Sapphire structural prerequisite."
            : "Complete Sapphire structural/card-quality review before Platinum content certification.",
    };
}

function buildPlatinumKanjiContentBatchReport({
    rows = [],
    platinumEntries = [],
    sapphireEntries = [],
    level,
    kanji = [],
    limit = 8,
    queue = PLATINUM_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
} = {}) {
    const normalizedQueue = normalizeQueueMode(queue);
    const generatedRows = Array.isArray(rows) ? rows : [];
    const currentSapphireKanji = buildCurrentSapphireKanjiSet(sapphireEntries);
    const currentPlatinumKanji = buildCurrentPlatinumKanjiSet(platinumEntries);
    const cards = selectBatchRows({
        rows: generatedRows,
        requestedKanji: kanji,
        currentSapphireKanji,
        currentPlatinumKanji,
        queue: normalizedQueue,
        limit,
    }).map((row) => buildCard(row, { currentSapphireKanji, currentPlatinumKanji }));
    const requestedSet = new Set((Array.isArray(kanji) ? kanji : []).map(normalizeText).filter(Boolean));
    const generatedKanji = new Set(generatedRows.map((row) => normalizeText(row.kanji)).filter(Boolean));
    const requestedMissing = [...requestedSet].filter((item) => !generatedKanji.has(item)).sort((a, b) => a.localeCompare(b, "ja"));

    return {
        level,
        lane: "platinum",
        scope: Number.isInteger(level) ? `N${level} kanji` : "kanji",
        queue: normalizedQueue,
        currentReviewStandard: CURRENT_KANJI_PLATINUM_CONTENT_REVIEW_STANDARD,
        scopedToRequestedKanji: requestedSet.size > 0,
        summary: {
            generatedRows: generatedRows.length,
            currentStandardSapphirePrerequisites: currentSapphireKanji.size,
            currentStandardPlatinum: currentPlatinumKanji.size,
            remainingPlatinumContent: generatedRows.filter((row) => (
                currentSapphireKanji.has(normalizeText(row.kanji))
                && !currentPlatinumKanji.has(normalizeText(row.kanji))
            )).length,
            blockedByMissingSapphire: generatedRows.filter((row) => !currentSapphireKanji.has(normalizeText(row.kanji))).length,
            selectedCards: cards.length,
            requestedMissing: requestedMissing.length,
        },
        requestedMissing,
        cards,
    };
}

function formatPlatinumKanjiContentBatchReport(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Platinum ${levelLabel} Kanji Content Batch Report`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        "Lane: Platinum expert content certification after Sapphire; not Sapphire structure or Obsidian proof",
        `Generated cards: ${summary.generatedRows || 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_KANJI_PLATINUM_CONTENT_REVIEW_STANDARD}`,
        `Queue: ${report.queue || PLATINUM_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD}`,
        `Current-standard Sapphire prerequisites: ${summary.currentStandardSapphirePrerequisites || 0}`,
        `Current-standard Platinum content entries: ${summary.currentStandardPlatinum || 0}`,
        `Missing Platinum content after Sapphire: ${summary.remainingPlatinumContent || 0}`,
        `Blocked by missing Sapphire prerequisite: ${summary.blockedByMissingSapphire || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];

    if (Array.isArray(report.requestedMissing) && report.requestedMissing.length > 0) {
        lines.push("", `Requested kanji not found (${report.requestedMissing.length}):`);
        lines.push(report.requestedMissing.join(", "));
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.kanji} [${card.reviewStatus}]`);
        lines.push(`  Surface: DisplayWord=${card.surface.displayWord || "(blank)"} | PrimaryReading=${card.surface.primaryReading || "(blank)"} | MeaningJP=${card.surface.meaningJP || "(blank)"}`);
        lines.push(`  KanjiMeanings: ${card.surface.kanjiMeanings || "(blank)"}`);
        lines.push(`  Example: ${card.surface.exampleSentence || "(blank)"}`);
        lines.push(`  Audio: ${card.surface.audio || "(blank)"}`);
        lines.push(`  StrokeOrder: ${card.surface.strokeOrder || "(blank)"}`);
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
    PLATINUM_CONTENT_BATCH_QUEUE_MODES,
    buildPlatinumKanjiContentBatchReport,
    formatPlatinumKanjiContentBatchReport,
    normalizeQueueMode,
    selectBatchRows,
};
