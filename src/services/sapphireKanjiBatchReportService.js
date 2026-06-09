const {
    KANJI_BATCH_QUEUE_MODES,
    buildPlatinumKanjiBatchReport,
    normalizeQueueMode,
} = require("./platinumKanjiBatchReportService");
const {
    mapSapphireEntriesToPlatinumCompatibility,
} = require("./sapphireKanjiReviewService");
const {
    buildKanjiGoldPreconditionFailuresByKey,
} = require("./reviewLanePreconditionService");

const SAPPHIRE_BATCH_RUBRIC_VERSION = "kanji-sapphire-structural-review-rubric-v1";

function mapLaneText(value = "") {
    return String(value || "")
        .replace(/during substantive rereview/g, "during Sapphire review")
        .replace(/before substantive rereview/g, "before Sapphire review")
        .replace(/square-zero substantive rereview proof/g, "Sapphire structural review")
        .replace(/substantive current-standard rereview proof/g, "Sapphire structural review evidence")
        .replace(/substantive rereview proof/g, "future Obsidian proof")
        .replace(/substantive rereview/g, "Sapphire review")
        .replace(/during Obsidian rereview/g, "during human Sapphire review")
        .replace(/before adding rereview provenance/g, "before approving Sapphire")
        .replace(/Add rereviewProvenance only after the Sapphire review has actually been performed\./g, "Record Sapphire evidence only after the actual Sapphire review has been performed.")
        .replace(/kanji-platinum-rereview-rubric-v1/g, SAPPHIRE_BATCH_RUBRIC_VERSION)
        .replace(/current-standard Platinum entries/g, "current-standard Sapphire entries")
        .replace(/active platinum/g, "active Sapphire")
        .replace(/active Platinum/g, "active Sapphire")
        .replace(/platinum entries/gi, "Sapphire entries")
        .replace(/platinum status/gi, "Sapphire status")
        .replace(/platinum manifest/gi, "Sapphire manifest")
        .replace(/platinum/g, "Sapphire")
        .replace(/Platinum/g, "Sapphire");
}

function mapReviewStatus(status = "") {
    return String(status || "")
        .replace(/missing_platinum/g, "missing_sapphire")
        .replace(/active_platinum/g, "active_sapphire")
        .replace(/platinum/g, "sapphire");
}

function mapRubricItem(item = {}) {
    return {
        ...item,
        id: item.id === "substantive_rereview_provenance"
            ? "future_platinum_or_obsidian_provenance"
            : item.id,
        label: mapLaneText(item.label),
        evidence: (item.evidence || []).map(mapLaneText),
        reviewerAction: mapLaneText(item.reviewerAction),
        limitation: mapLaneText(item.limitation),
    };
}

function buildItemStatusCounts(items = []) {
    const counts = {};
    for (const item of items) {
        const status = item.status || "(missing)";
        counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
}

function mapRubric(rubric = {}, reviewStatus = "") {
    const items = (rubric.items || [])
        .filter((item) => item.id !== "substantive_rereview_provenance")
        .map(mapRubricItem);
    const itemStatusCounts = buildItemStatusCounts(items);
    const result = itemStatusCounts.blocked > 0
        ? "blocked"
        : reviewStatus === "current_standard_platinum_only"
            ? "already_sapphire"
            : "ready_for_sapphire_review";

    return {
        ...rubric,
        version: SAPPHIRE_BATCH_RUBRIC_VERSION,
        result,
        itemStatusCounts,
        items,
    };
}

function mapCard(card = {}) {
    const reviewStatus = mapReviewStatus(card.reviewStatus);
    return {
        ...card,
        reviewStatus,
        existingStatuses: (card.existingStatuses || []).map(mapReviewStatus),
        riskFlags: (card.riskFlags || []).map(mapLaneText),
        reviewRubric: card.reviewRubric ? mapRubric(card.reviewRubric, card.reviewStatus) : card.reviewRubric,
    };
}

function addGoldPreconditionToCard(card = {}, failures = []) {
    if (!Array.isArray(failures) || failures.length === 0) {
        return card;
    }

    const blockedItem = {
        id: "prior_gold_precondition",
        label: "Prior Gold regression",
        status: "blocked",
        evidence: failures,
        reviewerAction: "Run and pass the Gold regression lane for this generated card before Sapphire review.",
        limitation: "",
    };
    const reviewRubric = card.reviewRubric
        ? {
            ...card.reviewRubric,
            result: "blocked",
            itemStatusCounts: {
                ...(card.reviewRubric.itemStatusCounts || {}),
                blocked: ((card.reviewRubric.itemStatusCounts || {}).blocked || 0) + 1,
            },
            items: [blockedItem, ...(card.reviewRubric.items || [])],
        }
        : card.reviewRubric;

    return {
        ...card,
        hardChecksPassed: false,
        riskFlags: [...(card.riskFlags || []), ...failures],
        reviewRubric,
    };
}

function buildSelectedRubricSummary(cards = []) {
    const resultCounts = {};
    const itemStatusCounts = {};

    for (const card of cards) {
        const result = card.reviewRubric?.result || "(missing)";
        resultCounts[result] = (resultCounts[result] || 0) + 1;
        for (const [status, count] of Object.entries(card.reviewRubric?.itemStatusCounts || {})) {
            itemStatusCounts[status] = (itemStatusCounts[status] || 0) + count;
        }
    }

    return {
        version: SAPPHIRE_BATCH_RUBRIC_VERSION,
        selectedCards: cards.length,
        resultCounts,
        itemStatusCounts,
    };
}

function buildSapphireKanjiBatchReport({
    rows = [],
    entries = [],
    level,
    kanji = [],
    limit = 12,
    curatedStudyData = {},
    goldenExpectations,
    queue = KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
} = {}) {
    const report = buildPlatinumKanjiBatchReport({
        rows,
        entries: mapSapphireEntriesToPlatinumCompatibility(entries),
        level,
        kanji,
        limit,
        curatedStudyData,
        queue,
        skipSapphirePreconditionForSapphireCompatibilityReport: true,
    });
    const goldPreconditionFailures = buildKanjiGoldPreconditionFailuresByKey({
        rows,
        entries: report.cards || [],
        goldenExpectations,
        laneName: "Sapphire batch",
    });
    const cards = (report.cards || [])
        .map((card) => addGoldPreconditionToCard(card, goldPreconditionFailures.get(card.kanji)))
        .map(mapCard);

    return {
        level: report.level,
        lane: "sapphire",
        scope: report.scope,
        queue: report.queue,
        summary: {
            activeSapphire: report.summary?.activePlatinum || 0,
            generatedRows: report.summary?.generatedRows || 0,
            remainingSapphire: report.summary?.remainingPlatinum || 0,
            selectedCards: cards.length,
        },
        reviewRubricSummary: buildSelectedRubricSummary(cards),
        nextMissingKanji: report.nextMissingKanji || [],
        cards,
    };
}

function formatSapphireKanjiBatchReport(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Sapphire ${levelLabel} Kanji Batch Report`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        "Lane: Sapphire structural gate; not Platinum or Obsidian proof",
        `Generated cards: ${summary.generatedRows || 0}`,
        `Queue: ${report.queue || KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD}`,
        `Sapphire entries: ${summary.activeSapphire || 0}`,
        `Missing Sapphire structure: ${summary.remainingSapphire || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];
    const rubricSummary = report.reviewRubricSummary || {};
    if (rubricSummary.version) {
        lines.push(
            `Rubric: ${rubricSummary.version}`,
            `Rubric selected-card results: ${Object.entries(rubricSummary.resultCounts || {}).map(([key, value]) => `${key}=${value}`).join(", ") || "(none)"}`,
            `Rubric item statuses: ${Object.entries(rubricSummary.itemStatusCounts || {}).map(([key, value]) => `${key}=${value}`).join(", ") || "(none)"}`
        );
    }

    const queueKanji = Array.isArray(report.nextMissingKanji) ? report.nextMissingKanji : [];
    if (queueKanji.length > 0) {
        lines.push("", `Next missing current-standard Sapphire queue (${Math.min(queueKanji.length, 30)}/${queueKanji.length}):`);
        lines.push(queueKanji.slice(0, 30).join(", "));
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.kanji} [${card.reviewStatus}]`);
        lines.push(`  Surface: DisplayWord=${card.surface?.displayWord || "(blank)"} | PrimaryReading=${card.surface?.primaryReading || "(blank)"} | MeaningJP=${card.surface?.meaningJP || "(blank)"}`);
        lines.push(`  KanjiMeanings: ${card.surface?.kanjiMeanings || "(blank)"}`);
        lines.push(`  Example: ${card.surface?.exampleSentence || "(blank)"}`);
        lines.push(`  Audio: ${card.surface?.audio || "(blank)"}`);
        lines.push(`  Hard checks: ${card.hardChecksPassed ? "pass" : "fail"}`);
        for (const failure of card.generatedFailures || []) {
            lines.push(`    - ${mapLaneText(failure)}`);
        }
        for (const check of (card.hardChecks || []).filter((item) => !item.passed)) {
            lines.push(`    - ${mapLaneText(check.name)}`);
        }
        if (card.riskFlags?.length > 0) {
            lines.push("  Risk flags:");
            for (const flag of card.riskFlags) {
                lines.push(`    - ${flag}`);
            }
        } else {
            lines.push("  Risk flags: none");
        }
        if (card.reviewRubric?.items?.length > 0) {
            lines.push(`  Review rubric: ${card.reviewRubric.result}`);
            for (const item of card.reviewRubric.items) {
                lines.push(`    - ${item.id}: ${item.status} - ${item.label}`);
                if (item.reviewerAction) {
                    lines.push(`      action: ${item.reviewerAction}`);
                }
                if (item.limitation) {
                    lines.push(`      limitation: ${item.limitation}`);
                }
            }
        }
    }

    lines.push(
        "",
        "This report is read-only. It prepares Sapphire structural review; it does not create entries, prove Platinum, record Obsidian proof, or prove release readiness."
    );
    return `${lines.join("\n")}\n`;
}

module.exports = {
    KANJI_BATCH_QUEUE_MODES,
    SAPPHIRE_BATCH_RUBRIC_VERSION,
    buildSapphireKanjiBatchReport,
    formatSapphireKanjiBatchReport,
    normalizeQueueMode,
};
