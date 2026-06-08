const {
    ACTIVE_PLATINUM_STATUSES,
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    entryUsesCurrentWordPlatinumStandard,
} = require("./platinumReviewService");
const {
    getDefaultPlatinumCardSourceManifest,
    resolvePlatinumCardSourceMatches,
} = require("./platinumEvidenceService");
const { buildWordIdentity } = require("./platinumWordBatchReportService");

const WORD_SOURCE_POSTURE_CATEGORIES = Object.freeze({
    INDEPENDENT_SOURCE_FAMILIES_PROVEN: "independent_source_families_proven",
    SINGLE_SOURCE_FAMILY: "single_source_family",
    MISSING_GOVERNED_SOURCE: "missing_governed_source",
});

const WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER = "word_source_independence_not_proven";
const WORD_SOURCE_ORIGIN_LIMITATION_MARKER = "word_source_claim_origin_independence_not_evaluated";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function sourceAllowsUse(source = {}, use = "") {
    return source.status === "active" && (source.allowedUse || []).includes(use);
}

function buildSourceGroup(sourceId = "", source = {}) {
    return normalizeText(source.independenceGroup || source.sourceFamily || sourceId);
}

function isSingleKanjiWord(word = "") {
    return /^\p{Script=Han}$/u.test(normalizeText(word));
}

function buildEntryIdentity(entry = {}) {
    return buildWordIdentity({
        word: entry.word,
        reading: normalizeStringArray(entry.readingIncludes).join(" / "),
    });
}

function buildAcceptedSourceUses(entry = {}) {
    return [
        "word-field-verification",
        isSingleKanjiWord(entry.word) ? "single-kanji-word-field-verification" : "",
    ].filter(Boolean);
}

function resolveWordFieldVerificationSources(entry = {}, {
    manifest = getDefaultPlatinumCardSourceManifest(),
} = {}) {
    const acceptedUses = buildAcceptedSourceUses(entry);
    const matches = resolvePlatinumCardSourceMatches(entry.sourceEvidence, { manifest });

    return matches
        .filter(({ source }) => acceptedUses.some((use) => sourceAllowsUse(source, use)))
        .map(({ sourceId, source }) => ({
            sourceId,
            name: source.name || sourceId,
            sourceFamily: source.sourceFamily || sourceId,
            independenceGroup: buildSourceGroup(sourceId, source),
            allowedUse: (source.allowedUse || []).filter((use) => acceptedUses.includes(use)),
        }));
}

function classifyWordSourcePosture(entry = {}, options = {}) {
    const sources = resolveWordFieldVerificationSources(entry, options);
    const sourceGroups = [...new Set(sources.map((source) => source.independenceGroup).filter(Boolean))].sort();
    const sourceIds = sources.map((source) => source.sourceId).sort();
    let category = WORD_SOURCE_POSTURE_CATEGORIES.MISSING_GOVERNED_SOURCE;

    if (sourceGroups.length >= 2) {
        category = WORD_SOURCE_POSTURE_CATEGORIES.INDEPENDENT_SOURCE_FAMILIES_PROVEN;
    } else if (sourceGroups.length === 1) {
        category = WORD_SOURCE_POSTURE_CATEGORIES.SINGLE_SOURCE_FAMILY;
    }

    return {
        identity: buildEntryIdentity(entry),
        word: normalizeText(entry.word),
        reading: normalizeStringArray(entry.readingIncludes).join(" / "),
        category,
        sourceIds,
        sourceGroups,
        sources,
        markers: [
            category === WORD_SOURCE_POSTURE_CATEGORIES.SINGLE_SOURCE_FAMILY
                ? WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER
                : "",
            WORD_SOURCE_ORIGIN_LIMITATION_MARKER,
        ].filter(Boolean),
    };
}

function countCards(cards = [], predicate) {
    return (Array.isArray(cards) ? cards : []).filter(predicate).length;
}

function summarizeCards(cards = []) {
    return {
        independent_source_families_proven: countCards(cards, (card) => (
            card.category === WORD_SOURCE_POSTURE_CATEGORIES.INDEPENDENT_SOURCE_FAMILIES_PROVEN
        )),
        single_source_family: countCards(cards, (card) => (
            card.category === WORD_SOURCE_POSTURE_CATEGORIES.SINGLE_SOURCE_FAMILY
        )),
        missing_governed_source: countCards(cards, (card) => (
            card.category === WORD_SOURCE_POSTURE_CATEGORIES.MISSING_GOVERNED_SOURCE
        )),
    };
}

function summarizeSourceUse(cards = []) {
    const sourceCounts = {};
    const groupCounts = {};

    for (const card of Array.isArray(cards) ? cards : []) {
        for (const sourceId of card.sourceIds || []) {
            sourceCounts[sourceId] = (sourceCounts[sourceId] || 0) + 1;
        }
        for (const group of card.sourceGroups || []) {
            groupCounts[group] = (groupCounts[group] || 0) + 1;
        }
    }

    return {
        sourceCounts,
        groupCounts,
    };
}

function buildPlatinumWordSourcePostureReport({
    entries = [],
    level = null,
    manifest = getDefaultPlatinumCardSourceManifest(),
} = {}) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeEntries = reviewEntries.filter((entry) => (
        ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status))
        && entryUsesCurrentWordPlatinumStandard(entry)
    ));
    const cards = activeEntries
        .map((entry) => classifyWordSourcePosture(entry, { manifest }))
        .sort((left, right) => left.identity.localeCompare(right.identity, "ja"));
    const counts = summarizeCards(cards);

    return {
        level,
        currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        activeCurrentStandardEntries: activeEntries.length,
        categories: WORD_SOURCE_POSTURE_CATEGORIES,
        markers: {
            sourceIndependenceNotProven: WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER,
            sourceOriginIndependenceNotEvaluated: WORD_SOURCE_ORIGIN_LIMITATION_MARKER,
        },
        policy: {
            note: "A governed single source can satisfy structural word-field verification, but it does not prove independent source-family corroboration. Word placement/source-claim origin independence is surfaced as not evaluated until a word source-origin manifest exists.",
            structuralGate: "missing_governed_source must be zero for structurally current-standard word entries",
            independenceClaimGate: "independent_source_families_proven is required before claiming independent word-source corroboration",
        },
        counts,
        sourceUse: summarizeSourceUse(cards),
        passed: counts.missing_governed_source === 0,
        cards,
    };
}

function buildAggregateCounts(levelReports = []) {
    return (Array.isArray(levelReports) ? levelReports : []).reduce((totals, report) => {
        totals.activeCurrentStandardEntries += report.activeCurrentStandardEntries || 0;
        for (const key of Object.values(WORD_SOURCE_POSTURE_CATEGORIES)) {
            totals[key] = (totals[key] || 0) + (report.counts?.[key] || 0);
        }
        return totals;
    }, {
        activeCurrentStandardEntries: 0,
        independent_source_families_proven: 0,
        single_source_family: 0,
        missing_governed_source: 0,
    });
}

function buildPlatinumWordSourcePostureSummary(levelReports = []) {
    const reports = Array.isArray(levelReports) ? levelReports : [];

    return {
        currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        markers: {
            sourceIndependenceNotProven: WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER,
            sourceOriginIndependenceNotEvaluated: WORD_SOURCE_ORIGIN_LIMITATION_MARKER,
        },
        passed: reports.every((report) => report.passed),
        totals: buildAggregateCounts(reports),
        levels: reports,
    };
}

function formatSample(cards = [], { limit = 24 } = {}) {
    const identities = (Array.isArray(cards) ? cards : []).map((card) => card.identity).filter(Boolean);
    if (identities.length === 0) {
        return "none";
    }
    const sample = identities.slice(0, limit).join(", ");
    return identities.length > limit ? `${sample}, ... ${identities.length - limit} more` : sample;
}

function formatPlatinumWordSourcePostureReport(summary = {}) {
    const totals = summary.totals || {};
    const lines = [
        "Japanese Kanji Builder Legacy Platinum Word Source Posture",
        "",
        `Current review standard: ${summary.currentReviewStandard || CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`,
        `Result: ${summary.passed ? "passing" : "failing"}`,
        `Structural word entries inspected: ${totals.activeCurrentStandardEntries || 0}`,
        "Source-family counts are posture diagnostics only; they are not the rereview selection pool, native Platinum content proof, or Obsidian proof.",
        "",
        "| Scope | Structural entries inspected | Independent source families proven | Single source family | Missing governed source |",
        "| --- | ---: | ---: | ---: | ---: |",
    ];

    for (const report of summary.levels || []) {
        const counts = report.counts || {};
        lines.push([
            `| N${report.level}`,
            report.activeCurrentStandardEntries || 0,
            counts.independent_source_families_proven || 0,
            counts.single_source_family || 0,
            counts.missing_governed_source || 0,
        ].join(" | ") + " |");
    }

    lines.push([
        "| Total",
        totals.activeCurrentStandardEntries || 0,
        totals.independent_source_families_proven || 0,
        totals.single_source_family || 0,
        totals.missing_governed_source || 0,
    ].join(" | ") + " |");

    lines.push(
        "",
        "Policy:",
        "- This report is scoped to structurally current-standard word entries only. It does not count generated rows that still lack structural review.",
        `- ${summary.markers?.sourceIndependenceNotProven || WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER}: a structurally governed single-source entry must not be described as independently corroborated.`,
        `- ${summary.markers?.sourceOriginIndependenceNotEvaluated || WORD_SOURCE_ORIGIN_LIMITATION_MARKER}: word source-claim origin independence is not evaluated until a word source-origin manifest exists.`,
        "- This report is read-only. It does not promote, defer, reject, or edit cards."
    );

    for (const report of summary.levels || []) {
        const single = (report.cards || []).filter((card) => (
            card.category === WORD_SOURCE_POSTURE_CATEGORIES.SINGLE_SOURCE_FAMILY
        ));
        const missing = (report.cards || []).filter((card) => (
            card.category === WORD_SOURCE_POSTURE_CATEGORIES.MISSING_GOVERNED_SOURCE
        ));
        const independent = (report.cards || []).filter((card) => (
            card.category === WORD_SOURCE_POSTURE_CATEGORIES.INDEPENDENT_SOURCE_FAMILIES_PROVEN
        ));
        lines.push(
            "",
            `N${report.level} details:`,
            `- independent source families proven sample: ${formatSample(independent)}`,
            `- single source family sample: ${formatSample(single)}`,
            `- missing governed source sample: ${formatSample(missing)}`
        );
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER,
    WORD_SOURCE_ORIGIN_LIMITATION_MARKER,
    WORD_SOURCE_POSTURE_CATEGORIES,
    buildPlatinumWordSourcePostureReport,
    buildPlatinumWordSourcePostureSummary,
    classifyWordSourcePosture,
    formatPlatinumWordSourcePostureReport,
};
