const {
    WORD_BATCH_QUEUE_MODES,
    buildPlatinumWordBatchReport,
    normalizeQueueMode,
} = require("./platinumWordBatchReportService");
const {
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    mapPlatinumTextToSapphire,
    mapSapphireWordEntriesToPlatinumCompatibility,
} = require("./sapphireWordReviewService");

function mapReviewStatus(status = "") {
    return String(status || "")
        .replace(/missing_platinum/g, "missing_sapphire")
        .replace(/active_platinum/g, "active_sapphire")
        .replace(/legacy_unversioned_platinum/g, "legacy_unversioned_sapphire")
        .replace(/current_standard_structural_only/g, "current_standard_sapphire")
        .replace(/platinum/g, "sapphire");
}

function mapSuggestedReviewStep(value = "") {
    return mapPlatinumTextToSapphire(value)
        .replace(
            /substantive rereview required; (?:(?:legacy compatibility|Sapphire) )?structural(?: v3)? pass is not proof/i,
            "already Sapphire; Platinum content certification and Obsidian proof remain separate"
        )
        .replace(/already substantively rereviewed/i, "already Sapphire and separately Obsidian certified")
        .replace(/already reviewed/i, "already Sapphire");
}

function mapRiskFlag(value = "") {
    return mapPlatinumTextToSapphire(value)
        .replace(
            /has current-standard structure only; square-zero substantive rereview proof is still required/i,
            "has current-standard Sapphire; Platinum content certification and Obsidian proof remain separate"
        )
        .replace(
            /already has substantive current-standard rereview proof; skip unless intentionally replacing prior evidence/i,
            "already has separate Obsidian proof; skip unless intentionally replacing prior Sapphire evidence"
        );
}

function mapCard(card = {}) {
    return {
        ...card,
        reviewStatus: mapReviewStatus(card.reviewStatus),
        existingStatuses: (card.existingStatuses || []).map(mapReviewStatus),
        riskFlags: (card.riskFlags || []).map(mapRiskFlag),
        suggestedReviewStep: mapSuggestedReviewStep(card.suggestedReviewStep),
    };
}

function buildSapphireWordBatchReport({
    rows = [],
    entries = [],
    wordPitchAccentData = {},
    level,
    words = [],
    limit = 12,
    queue = WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
} = {}) {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: mapSapphireWordEntriesToPlatinumCompatibility(entries),
        wordPitchAccentData,
        level,
        words,
        limit,
        queue,
    });
    const cards = (report.cards || []).map(mapCard);

    return {
        level: report.level,
        lane: "sapphire",
        scope: report.scope,
        queue: report.queue,
        scopedToRequestedWords: report.scopedToRequestedWords,
        summary: {
            generatedRows: report.summary?.generatedRows || 0,
            activeSapphire: report.summary?.activePlatinum || 0,
            currentReviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
            currentStandardSapphire: report.summary?.currentStandardPlatinum || 0,
            legacyOrUnversionedSapphire: report.summary?.legacyOrUnversionedPlatinum || 0,
            remainingSapphire: report.summary?.remainingCurrentStandard || 0,
            selectedCards: cards.length,
            requestedMissing: report.summary?.requestedMissing || 0,
        },
        requestedMissing: report.requestedMissing || [],
        nextMissingWords: report.nextMissingWords || [],
        cards,
    };
}

function formatSapphireWordBatchReport(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Sapphire ${levelLabel} Word Batch Report`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        "Lane: Sapphire structural/card-quality gate; not Platinum content certification, Obsidian proof, or release readiness",
        `Generated cards: ${summary.generatedRows || 0}`,
        `Queue: ${report.queue || WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD}`,
        `Sapphire entries: ${summary.activeSapphire || 0}`,
        `Current review standard: ${summary.currentReviewStandard || CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD}`,
        `Current-standard Sapphire entries: ${summary.currentStandardSapphire || 0}`,
        `Legacy/unversioned Sapphire entries: ${summary.legacyOrUnversionedSapphire || 0}`,
        `Missing current-standard Sapphire structure: ${summary.remainingSapphire || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];

    if (Array.isArray(report.requestedMissing) && report.requestedMissing.length > 0) {
        lines.push("", `Requested word identities not found (${report.requestedMissing.length}):`);
        for (const identity of report.requestedMissing) {
            lines.push(`- ${identity}`);
        }
    }

    if (!report.scopedToRequestedWords && Array.isArray(report.nextMissingWords) && report.nextMissingWords.length > 0) {
        lines.push("", `Next missing current-standard Sapphire queue (${Math.min(report.nextMissingWords.length, 30)}/${report.nextMissingWords.length}):`);
        for (const identity of report.nextMissingWords.slice(0, 30)) {
            lines.push(`- ${identity}`);
        }
        if (report.nextMissingWords.length > 30) {
            lines.push(`- ... ${report.nextMissingWords.length - 30} more`);
        }
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.identity} [${card.reviewStatus}]`);
        lines.push(`  Surface: Meaning=${card.surface.meaning || "(blank)"} | ${card.surface.jlptLevel || "(blank)"} | ${card.surface.coverageRole || "(blank)"}`);
        lines.push(`  Focus/Coverage: ${card.surface.focusKanji || "(blank)"} -> ${card.surface.coversReading || "(blank)"}`);
        lines.push(`  Breakdown: ${card.surface.readingBreakdown || "(blank)"}`);
        lines.push(`  Example: ${card.surface.example.sentence || "(blank)"}`);
        lines.push(`  Reading: ${card.surface.example.reading || "(blank)"}`);
        lines.push(`  English: ${card.surface.example.english || "(blank)"}`);
        lines.push(`  Audio: ${card.surface.audio || "(blank)"}`);
        lines.push(`  Pitch: ${card.pitch.pattern || "(blank)"} from ${card.pitch.sourceId || "(missing source)"} | rendered ${card.pitch.renderedAccents?.join("/") || "(none)"}${card.pitch.generatedSource ? " | generated" : ""}${card.pitch.generatedLabelVisible ? " | labeled" : ""}`);
        lines.push(`  Hard checks: ${card.hardChecksPassed ? "pass" : "fail"}`);
        for (const check of (card.hardChecks || []).filter((item) => !item.passed)) {
            lines.push(`    - ${mapPlatinumTextToSapphire(check.name)}`);
        }
        lines.push("  Source lookup:");
        lines.push(`    - JLearn: ${card.sourceLookupLinks.jlearn}`);
        lines.push(`    - Jisho: ${card.sourceLookupLinks.jisho}`);
        lines.push(`    - goo: ${card.sourceLookupLinks.goo}`);
        if (card.riskFlags?.length > 0) {
            lines.push("  Risk flags:");
            for (const flag of card.riskFlags) {
                lines.push(`    - ${flag}`);
            }
        } else {
            lines.push("  Risk flags: none");
        }
        lines.push(`  Suggested review step: ${card.suggestedReviewStep}`);
    }

    lines.push(
        "",
        "This report is read-only. It prepares Sapphire review; it does not create entries, prove Platinum, record Obsidian proof, or prove release readiness."
    );
    return `${lines.join("\n")}\n`;
}

module.exports = {
    WORD_BATCH_QUEUE_MODES,
    buildSapphireWordBatchReport,
    formatSapphireWordBatchReport,
    normalizeQueueMode,
};
