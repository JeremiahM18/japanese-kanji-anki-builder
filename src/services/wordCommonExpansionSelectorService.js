const fs = require("node:fs");
const path = require("node:path");

const {
    buildWordCandidateAgreementReport,
    buildSourceFileIntegrity,
    validateSourceIntegrity,
} = require("./wordCandidateAgreementService");
const {
    buildWordInventoryExpansionCandidateReport,
    classifyKanjiScope,
    normalizeMoveTargetLevel,
    normalizeCandidateSourceRows,
    parseCandidateSourceText,
} = require("./wordInventoryExpansionCandidateService");
const { normalizePlacementMode } = require("./wordCandidateAgreementService");

const SOURCE_UNIVERSE_WARNING = "Configured-source selector only; not an official or global JLPT vocabulary universe.";
const SOURCE_LEVEL_CLAIM_STATUS = "source_level_claim_unverified";
const SOURCE_LEVEL_CLAIM_LABEL = "Source level claim unverified";
const SOURCE_LEVEL_CLAIM_WARNING = "Source JLPT level is a discovery hint from a free/permitted source, not official or verified JLPT truth.";
const SOURCE_LANE_CONFIGURED = "configured_source";
const SOURCE_LANE_EXTRA = "extra_source_family";
const SOURCE_LANE_CONFIGURED_LABEL = "CURRENT CONFIGURED SOURCE";
const SOURCE_LANE_EXTRA_LABEL = "EXTRA SOURCE FAMILY";
const SOURCE_POOL_DICTIONARY_COMMON = "dictionary_common_pool";
const SOURCE_POOL_DICTIONARY_COMMON_LABEL = "DICTIONARY COMMON POOL";
const DICTIONARY_COMMON_POOL_SOURCE_ID = "dictionary-common-pool";
const DICTIONARY_COMMON_POOL_COMMAND_SOURCE = "common-pool";
const DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT = 200;
const COMMON_POOL_QUALITY_MODE_EDITORIAL = "editorial";
const COMMON_POOL_QUALITY_MODE_RAW = "raw";
const DEFAULT_COMMON_POOL_FREQUENCY_SOURCE_ID = "tubelex-ja-frequency";
const FREQUENCY_EVIDENCE_BANDS = ["strong", "good", "borderline", "poor", "missing"];
const COMMON_POOL_LEARNER_VALUE_BUCKETS = [
    "core_candidate",
    "family_representative",
    "support_label_candidate",
    "same_written_ambiguity",
    "redundant_family_member",
    "domain_narrow",
    "raw_audit_low_fit",
];
const COMMON_POOL_LEARNER_VALUE_BUCKET_LABELS = Object.freeze({
    core_candidate: "Core candidate",
    family_representative: "Family representative",
    support_label_candidate: "Support-label candidate",
    same_written_ambiguity: "Same-written ambiguity",
    redundant_family_member: "Redundant family member",
    domain_narrow: "Domain narrow",
    raw_audit_low_fit: "Raw audit low-fit",
});
const COMMON_POOL_LEARNER_VALUE_BUCKET_PRIORITY = Object.freeze({
    core_candidate: 0,
    support_label_candidate: 1,
    family_representative: 1,
    same_written_ambiguity: 2,
    redundant_family_member: 3,
    domain_narrow: 4,
    raw_audit_low_fit: 5,
});
const COMMON_POOL_AUDIT_ONLY_BUCKETS = new Set([
    "redundant_family_member",
    "domain_narrow",
    "raw_audit_low_fit",
]);
const COMMON_POOL_FAMILY_DEFAULT_REVIEW_CAP = 8;
const COMMON_POOL_FAMILY_REVIEW_CAPS = Object.freeze({
    time_calendar: 18,
    person_social: 14,
    place_travel: 14,
    learning_language: 12,
    body_health: 12,
    food_daily_life: 12,
    number_quantity: 10,
    work_business: 8,
    target_kanji_family: 8,
});
const WORD_EXPANSION_TARGET_MINIMUMS = Object.freeze({
    5: 800,
    4: 1000,
    3: 2250,
    2: 2250,
    1: 4000,
});
const WORD_EXPANSION_TARGET_POLICY = "useful_minimum_not_hard_limit";

const SELECTOR_STATUSES = [
    "ready_for_editorial_review",
    "queue_inactive_reading_expansion",
    "needs_triage",
    "blocked_identity",
    "blocked_missing_dictionary",
    "blocked_missing_commonness",
    "triaged_defer",
    "triaged_reject",
    "move_candidate",
    "already_governed",
    "already_excluded",
    "kana_only_out_of_scope",
];

const STATUS_ORDER = Object.fromEntries(SELECTOR_STATUSES.map((status, index) => [status, index]));
const HAN_CHARACTER_PATTERN = /^\p{Script=Han}$/u;
const COMMON_POOL_MEANING_NOISE_RE = /\b(?:surname|given name|place name|company name|archaism|archaic|obsolete|vulgar|obscene|derogatory|Buddhist term|physics|chemistry|botany|zoology|astronomy|mathematics)\b/iu;
const COMMON_POOL_PRIORITY_MEANING_RE = /\b(?:grand shrine|famous shrine|lunar calendar|proofreading|first proof|station|railway line|district|province|clan|company|university)\b/iu;
const LEARNER_UTILITY_EVERYDAY_DOMAIN_RE = /\b(?:home|house|family|friend|school|class|lesson|teacher|student|work|job|office|shop|store|bookstore|bookshelf|money|bank|food|meal|drink|water|weather|rain|snow|health|body|doctor|hospital|train|station|bus|car|street|road|city|town|room|book|clothes|phone|letter|language|time|day|week|month|year|morning|night|travel|trip)\b/iu;
const LEARNER_UTILITY_ABSTRACT_DOMAIN_RE = /\b(?:analysis|analytical|parse|parsing|theory|policy|system|principle|ideology|philosophy|economics|politics|administration|legal|statistical|technical|specialized)\b/iu;
const LEARNER_UTILITY_SPECIALIZED_OR_PROPER_RE = /\b(?:archaism|archaic|obsolete|vulgar|obscene|derogatory|Buddhist term|physics|chemistry|botany|zoology|astronomy|mathematics|literature|prefecture|ministry|bureau|agency|grand shrine|famous shrine|solar term|lunar calendar|proofreading|first proof|railway line|district|province|clan|company|university|one-off payment|lump sum)\b/iu;
const COMMON_POOL_TIME_FAMILY_RE = /\b(?:time|day|date|week|month|year|morning|afternoon|evening|night|calendar|season|holiday|weekday|weekend|today|tomorrow|yesterday|daily|weekly|monthly|yearly)\b/iu;
const COMMON_POOL_PERSON_FAMILY_RE = /\b(?:person|people|man|woman|child|adult|family|friend|teacher|student|boy|girl|parent|mother|father|elder|younger)\b/iu;
const COMMON_POOL_PLACE_FAMILY_RE = /\b(?:place|home|house|room|school|shop|store|office|station|road|street|city|town|village|country|hospital|bank|library|restaurant|train|bus|travel|trip)\b/iu;
const COMMON_POOL_LEARNING_FAMILY_RE = /\b(?:language|word|letter|book|dictionary|reading|writing|study|lesson|class|question|answer|sentence|grammar)\b/iu;
const COMMON_POOL_BODY_HEALTH_FAMILY_RE = /\b(?:body|health|doctor|hospital|medicine|illness|sick|pain|eye|ear|hand|foot|head|mouth|heart)\b/iu;
const COMMON_POOL_FOOD_DAILY_FAMILY_RE = /\b(?:food|meal|drink|water|tea|rice|bread|breakfast|lunch|dinner|kitchen|clothes|phone|money|weather|rain|snow)\b/iu;
const COMMON_POOL_WORK_BUSINESS_FAMILY_RE = /\b(?:work|job|office|company|business|employee|meeting|document|bank|money|payment|salary|contract)\b/iu;
const DIGIT_WRITTEN_PATTERN = /[0-9０-９]/u;
const LATIN_WRITTEN_PATTERN = /[A-Za-zＡ-Ｚａ-ｚ]/u;
const HAN_ANY_PATTERN = /\p{Script=Han}/u;
const KANJI_NUMERIC_EXPRESSION_WRITTEN_PATTERN = /^[一二三四五六七八九十百千万億兆〇零壱弐参年月日円本冊枚台匹人個件点度回階杯校時分秒週番号]+$/u;
const CAPITALIZED_PROPER_PHRASE_PATTERN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/u;
const CAPITALIZED_SINGLE_PROPER_HEAD_PATTERN = /^[A-Z][a-z]+(?:\s*\(|\s*$)/u;
const CAPITALIZED_CALENDAR_GLOSS_PATTERN = /^(?:January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\b|;|,)/u;
const SUPPORT_LABEL_LEARNER_FIT_RE = /^(?:harder support kanji|outside-JLPT kanji)\b/u;
const LEARNER_UTILITY_BANDS = [
    { min: 80, label: "strong_review_candidate" },
    { min: 65, label: "good_review_candidate" },
    { min: 50, label: "fair_review_candidate" },
    { min: 0, label: "low_priority_review_candidate" },
];

function isStandaloneKanjiWritten(value = "") {
    const chars = [...String(value || "")];
    return chars.length === 1 && HAN_CHARACTER_PATTERN.test(chars[0]);
}

function sourceAllows(source = {}, use) {
    return Array.isArray(source.allowedUse) && source.allowedUse.includes(use);
}

function getCandidateDiscoverySourcesForLevel(manifest = {}, level) {
    return Object.entries(manifest.sources || {})
        .filter(([, source]) => (
            source.status === "active"
            && sourceAllows(source, "candidate-discovery")
            && source.local?.path
            && (
                !Array.isArray(source.candidatePolicy?.levels)
                || source.candidatePolicy.levels.length === 0
                || source.candidatePolicy.levels.includes(level)
            )
        ));
}

function buildSourceUniverse({ sourceId = "", source = {}, sourceSummary = null } = {}) {
    const integrity = sourceSummary?.integrity || source.local || {};
    const sourceLane = source.extraSourceLane === true ? SOURCE_LANE_EXTRA : SOURCE_LANE_CONFIGURED;
    const sourceLaneLabel = source.extraSourceLane === true ? SOURCE_LANE_EXTRA_LABEL : SOURCE_LANE_CONFIGURED_LABEL;
    return {
        sourceId,
        name: source.name || "",
        sourceType: source.sourceType || "",
        status: source.status || "",
        allowedUse: source.allowedUse || [],
        sourceUrl: source.origin?.url || "",
        localPath: source.local?.path || source.origin?.localPath || sourceSummary?.localPath || "",
        checkedAt: source.checkedAt || "",
        licenseStatus: source.licenseUse?.status || "",
        license: source.licenseUse?.license || "",
        rowCount: Number.isInteger(sourceSummary?.rowCount)
            ? sourceSummary.rowCount
            : (Number.isInteger(source.local?.rowCount) ? source.local.rowCount : null),
        sha256: integrity.sha256 || "",
        byteSize: Number.isInteger(integrity.byteSize) ? integrity.byteSize : null,
        configuredSourceOnly: true,
        warning: SOURCE_UNIVERSE_WARNING,
        sourceLane,
        sourceLaneLabel,
        sourcePool: source.extraSourcePool || sourceLane,
        sourcePoolLabel: source.extraSourcePoolLabel || sourceLaneLabel,
        extraSource: source.extraSourceLane === true,
        levelClaimStatus: SOURCE_LEVEL_CLAIM_STATUS,
        levelClaimLabel: SOURCE_LEVEL_CLAIM_LABEL,
        levelClaimWarning: SOURCE_LEVEL_CLAIM_WARNING,
    };
}

function classifyCommonExpansionSelectorRow({ expansionRow = {}, agreementRow = null } = {}) {
    const triageDecision = expansionRow.triageDecision || agreementRow?.triageDecisions?.[0] || null;
    const triageStatus = triageDecision?.decision || agreementRow?.triageStatus || "untriaged";

    if (expansionRow.disposition === "already_governed" || agreementRow?.contractStatus?.status === "already_governed") {
        return "already_governed";
    }
    if (expansionRow.disposition === "already_excluded" || agreementRow?.contractStatus?.status === "already_excluded") {
        return "already_excluded";
    }
    if (expansionRow.disposition === "kana_only") {
        return "kana_only_out_of_scope";
    }
    if (triageStatus === "move_candidate") {
        return "move_candidate";
    }
    if (triageStatus === "defer_candidate") {
        return "triaged_defer";
    }
    if (triageStatus === "reject_candidate") {
        return "triaged_reject";
    }
    if (expansionRow.readingExpansionQueueActive === false) {
        return "queue_inactive_reading_expansion";
    }
    if (expansionRow.disposition === "source_template") {
        const written = expansionRow.written || agreementRow?.written || "";
        return isStandaloneKanjiWritten(written)
            ? "needs_triage"
            : "blocked_identity";
    }
    if (
        expansionRow.disposition === "likely_phrase"
        || expansionRow.disposition === "source_level_mismatch"
        || expansionRow.disposition === "kanji_scope_mismatch"
        || agreementRow?.cleanIdentity === false
        || (agreementRow?.identityRisks || []).length > 0
    ) {
        return "blocked_identity";
    }
    if (expansionRow.disposition === "no_target_kanji") {
        return "needs_triage";
    }
    if (!agreementRow?.dictionaryVerified) {
        return "blocked_missing_dictionary";
    }
    if (!agreementRow?.frequencySupported) {
        return "blocked_missing_commonness";
    }
    if (triageStatus === "keep_candidate") {
        return "ready_for_editorial_review";
    }
    return "needs_triage";
}

function summarizeSelectorRows(rows = []) {
    const selectorStatusCounts = Object.fromEntries(SELECTOR_STATUSES.map((status) => [status, 0]));
    const learnerUtilityBandCounts = Object.fromEntries(LEARNER_UTILITY_BANDS.map((band) => [band.label, 0]));
    const frequencyBandCounts = Object.fromEntries(FREQUENCY_EVIDENCE_BANDS.map((band) => [band, 0]));
    const learnerValueBucketCounts = Object.fromEntries(COMMON_POOL_LEARNER_VALUE_BUCKETS.map((bucket) => [bucket, 0]));
    const utilityScores = [];
    let reviewableQualityRows = 0;
    let readyQualityRows = 0;
    let learnerValueReviewableRows = 0;
    let learnerValueAuditOnlyRows = 0;
    for (const row of rows) {
        const status = SELECTOR_STATUSES.includes(row.selectorStatus) ? row.selectorStatus : "needs_triage";
        selectorStatusCounts[status] += 1;
        const frequencyBand = normalizeFrequencyEvidenceBand(row.frequencyBand || row.frequencyEvidence?.primary?.frequencyBand);
        frequencyBandCounts[frequencyBand] = (frequencyBandCounts[frequencyBand] || 0) + 1;
        if (row.learnerValueBucket) {
            learnerValueBucketCounts[row.learnerValueBucket] = (learnerValueBucketCounts[row.learnerValueBucket] || 0) + 1;
        }
        if (row.learnerValueReviewable === true) {
            learnerValueReviewableRows += 1;
        } else if (row.learnerValueAuditOnly === true) {
            learnerValueAuditOnlyRows += 1;
        }
        if (["strong", "good"].includes(frequencyBand) && ["ready_for_editorial_review", "needs_triage"].includes(status)) {
            reviewableQualityRows += 1;
        }
        if (["strong", "good"].includes(frequencyBand) && status === "ready_for_editorial_review") {
            readyQualityRows += 1;
        }
        if (Number.isFinite(row.learnerUtility?.score)) {
            utilityScores.push(row.learnerUtility.score);
            const band = row.learnerUtility.band || getUtilityBand(row.learnerUtility.score);
            learnerUtilityBandCounts[band] = (learnerUtilityBandCounts[band] || 0) + 1;
        }
    }
    return {
        selectedRows: rows.length,
        selectorStatusCounts,
        learnerUtility: {
            scoredRows: utilityScores.length,
            averageScore: utilityScores.length > 0
                ? Number((utilityScores.reduce((total, score) => total + score, 0) / utilityScores.length).toFixed(1))
                : null,
            maxScore: utilityScores.length > 0 ? Math.max(...utilityScores) : null,
            minScore: utilityScores.length > 0 ? Math.min(...utilityScores) : null,
            bandCounts: learnerUtilityBandCounts,
            policy: "review_ordering_signal_not_card_approval",
        },
        learnerValueBuckets: {
            reviewableRows: learnerValueReviewableRows,
            auditOnlyRows: learnerValueAuditOnlyRows,
            bucketCounts: learnerValueBucketCounts,
            policy: "review_buckets_do_not_shrink_raw_denominator",
        },
        discoveryYieldSummary: {
            windowRows: rows.length,
            frequencyBandCounts,
            reviewableStrongOrGoodRows: reviewableQualityRows,
            readyStrongOrGoodRows: readyQualityRows,
            reviewableStrongOrGoodYieldPercent: rows.length > 0
                ? Number(((reviewableQualityRows / rows.length) * 100).toFixed(1))
                : 0,
            currentWindowBelowStopThreshold: rows.length > 0
                ? (reviewableQualityRows < 10 || (reviewableQualityRows / rows.length) < 0.05)
                : false,
            stopRule: "after_two_consecutive_200_row_windows_below_10_keep_ready_quality_rows_or_below_5_percent_keep_yield",
            policy: "discovery_stop_advisory_not_card_approval",
        },
        readyForEditorialReviewRows: selectorStatusCounts.ready_for_editorial_review,
        inactiveReadingExpansionRows: selectorStatusCounts.queue_inactive_reading_expansion,
        needsTriageRows: selectorStatusCounts.needs_triage,
        blockedRows: selectorStatusCounts.blocked_identity
            + selectorStatusCounts.blocked_missing_dictionary
            + selectorStatusCounts.blocked_missing_commonness,
        preTrustRows: rows.length,
    };
}

function buildWordExpansionTargetProgressForLevel({ level, jlptWordLevelContract = {} } = {}) {
    const identities = new Set();
    for (const [key, entry] of Object.entries(jlptWordLevelContract.wordLevels || {})) {
        const entryLevel = Number(entry?.jlpt ?? entry?.level ?? entry?.jlptLevel);
        if (entryLevel !== level) {
            continue;
        }
        const written = String(entry?.written || "").trim();
        const reading = String(entry?.reading || "").trim();
        identities.add(written && reading ? `${written}|${reading}` : key);
    }

    const targetMinimum = WORD_EXPANSION_TARGET_MINIMUMS[level] ?? null;
    const currentUniqueGovernedWords = identities.size;
    const remainingToTarget = Number.isInteger(targetMinimum)
        ? Math.max(0, targetMinimum - currentUniqueGovernedWords)
        : null;

    return {
        level,
        levelLabel: `N${level}`,
        currentUniqueGovernedWords,
        targetMinimum,
        targetApproximate: Number.isInteger(targetMinimum),
        remainingToTarget,
        targetMet: Number.isInteger(targetMinimum)
            ? currentUniqueGovernedWords >= targetMinimum
            : null,
        policy: WORD_EXPANSION_TARGET_POLICY,
        activationBoundary: "after_reading_expansion_exhausted",
        qualityBoundary: "high_quality_common_useful_learner_friendly_non_duplicate_only",
    };
}

function summarizeSourceMoveCandidateRouting({ rows = [], sourceLevel = null } = {}) {
    const byTargetLevel = {};
    let sourceMoveCandidateRows = 0;
    let routedSourceMoveCandidateRows = 0;
    let unresolvedSourceMoveCandidateRows = 0;

    for (const row of rows || []) {
        if (row.selectorStatus !== "move_candidate" || row.triageDecision?.decision !== "move_candidate") {
            continue;
        }

        sourceMoveCandidateRows += 1;
        const targetLevel = row.triageDecision.targetLevel;
        if (Number.isInteger(targetLevel) && targetLevel >= 1 && targetLevel <= 5 && targetLevel !== sourceLevel) {
            routedSourceMoveCandidateRows += 1;
            const targetKey = `N${targetLevel}`;
            byTargetLevel[targetKey] = (byTargetLevel[targetKey] || 0) + 1;
            continue;
        }

        unresolvedSourceMoveCandidateRows += 1;
    }

    return {
        sourceMoveCandidateRows,
        routedSourceMoveCandidateRows,
        unresolvedSourceMoveCandidateRows,
        byTargetLevel,
    };
}

function buildFallbackSourceGate({
    level,
    commonWordQueue = {},
    summary = {},
    sourceBlockers = [],
    isExtraSourceSelector = false,
    auditOnly = false,
} = {}) {
    const selectorScope = isExtraSourceSelector ? "EXTRA source selector" : "Current new-word selector";
    const counts = summary.selectorStatusCounts || {};
    const readyRows = counts.ready_for_editorial_review || 0;
    const needsTriageRows = counts.needs_triage || 0;
    const sourceMoveCandidateRows = counts.move_candidate || 0;
    const routedSourceMoveCandidateRows = countValue(summary.routedSourceMoveCandidateRows);
    const moveCandidateRows = Number.isInteger(summary.unresolvedSourceMoveCandidateRows)
        ? summary.unresolvedSourceMoveCandidateRows
        : sourceMoveCandidateRows;
    const blockers = [];

    if (auditOnly) {
        return {
            active: false,
            status: "raw_mode_audit_only",
            auditOnly: true,
            prerequisite: "raw_dictionary_common_pool_mode_is_evidence_accounting_only",
            readyRows,
            needsTriageRows,
            moveCandidateRows,
            sourceMoveCandidateRows,
            routedSourceMoveCandidateRows,
            unresolvedSourceMoveCandidateRows: moveCandidateRows,
            blockers,
            reason: "Raw dictionary common-pool mode exposes the denominator for evidence accounting only; do not treat raw rows as the human triage or Silver review queue. Use the default editorial shortlist for governed review work.",
        };
    }

    if (commonWordQueue.active !== true) {
        blockers.push(`N${level} reading expansion is not exhausted.`);
    }
    if ((sourceBlockers || []).length > 0) {
        blockers.push(`${selectorScope} has unresolved blockers.`);
    }
    if (readyRows > 0) {
        blockers.push(`${selectorScope} still has ${readyRows} ready row(s).`);
    }
    if (needsTriageRows > 0) {
        blockers.push(`${selectorScope} still has ${needsTriageRows} needs-triage row(s).`);
    }
    if (moveCandidateRows > 0) {
        blockers.push(`${selectorScope} still has ${moveCandidateRows} unresolved move-candidate row(s) without target-level routing.`);
    }

    const active = blockers.length === 0;
    const selectedExtraPriorGateBlocked = isExtraSourceSelector
        && (commonWordQueue.active !== true || (sourceBlockers || []).length > 0);
    return {
        active,
        status: isExtraSourceSelector
            ? (active ? "selected_extra_source_exhausted" : "selected_extra_source_work_remaining")
            : (active ? "active_after_current_selector_exhausted" : "inactive_prior_work_remaining"),
        prerequisite: "after_reading_expansion_and_current_new_word_selector_exhausted",
        readyRows,
        needsTriageRows,
        moveCandidateRows,
        sourceMoveCandidateRows,
        routedSourceMoveCandidateRows,
        unresolvedSourceMoveCandidateRows: moveCandidateRows,
        blockers,
        reason: isExtraSourceSelector
            ? (
                active
                    ? "Selected EXTRA source-family selector is exhausted under the current filters; rows still remain pre-trust and labeled."
                    : (
                        selectedExtraPriorGateBlocked
                            ? "Selected EXTRA source-family selector was requested, but the extra expansion lane is still closed by prior gate blockers; resolve the listed blockers before treating this extra source as active or exhausted."
                            : "Selected EXTRA source-family selector is open; finish its ready/triage/move work before treating this extra source as exhausted."
                    )
            )
            : (
                active
                    ? "Reading expansion and the current new-word selector are exhausted; the extra free/permitted source-family lane is READY for source-access/input work. Work is not done: imported extra rows must keep explicit unverified source-level labels."
                    : "Fallback/free-source expansion is closed until reading expansion and the current new-word selector are exhausted."
            ),
    };
}

function countValue(value) {
    return Number.isInteger(value) ? value : 0;
}

function normalizeCommonPoolQualityMode(value = COMMON_POOL_QUALITY_MODE_EDITORIAL) {
    const mode = String(value || COMMON_POOL_QUALITY_MODE_EDITORIAL).trim();
    if ([COMMON_POOL_QUALITY_MODE_EDITORIAL, COMMON_POOL_QUALITY_MODE_RAW].includes(mode)) {
        return mode;
    }
    throw new Error("Dictionary common pool quality mode must be one of: editorial, raw.");
}

function normalizeCommonPoolEditorialQueueLimit(value = DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT) {
    const limit = Number(value ?? DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Dictionary common pool editorial queue limit must be a positive integer.");
    }
    return limit;
}

function buildWorkOrderItem({
    rank,
    lane,
    label,
    count = 0,
    status,
    blocksExtraLane = false,
    command = "",
    reason = "",
} = {}) {
    return {
        rank,
        lane,
        label,
        count,
        status,
        active: status === "active"
            || status === "ready"
            || status === "ready_extra_source_available"
            || status === "ready_dictionary_common_pool"
            || status === "ready_no_actionable_source"
            || status === "selected_extra_source",
        blocksExtraLane,
        command,
        reason,
    };
}

function sourceSupportsLevel(source = {}, level) {
    const levels = Array.isArray(source.levels) ? source.levels : [];
    return levels.length === 0 || levels.includes(level);
}

function sourceIsCandidateDiscoveryLike(source = {}) {
    if (["candidate-discovery", "textbook-word-list"].includes(source.sourceKind)) {
        return true;
    }
    const allowedUse = source.allowedUse || [];
    return allowedUse.includes("candidate-discovery")
        || allowedUse.includes("level-hint")
        || allowedUse.includes("learner-fit-support");
}

function getActiveConfiguredDiscoverySourceIdsForLevel({ manifest = {}, level } = {}) {
    return new Set(Object.entries(manifest.sources || {})
        .filter(([, source]) => source.status === "active")
        .filter(([, source]) => (source.allowedUse || []).includes("candidate-discovery"))
        .filter(([, source]) => {
            const levels = source.candidatePolicy?.levels || source.levels || [];
            return levels.includes(level);
        })
        .map(([sourceId]) => sourceId));
}

function buildExtraSourceAccessByLevel({ sourceAccessReport = null, manifest = {}, levels = [5, 4, 3, 2, 1] } = {}) {
    const sources = sourceAccessReport?.sources || [];
    const sourcesById = new Map(sources.map((source) => [source.sourceId, source]));
    const result = {};
    const dictionarySource = sourcesById.get("jmdict") || null;
    const commonnessSource = sourcesById.get("jmdict-priority-commonness") || null;
    const dictionaryCommonPoolAvailable = (
        dictionarySource?.status === "active"
        && dictionarySource.licenseStatus === "approved"
        && (dictionarySource.allowedUse || []).includes("dictionary-verification")
        && commonnessSource?.status === "active"
        && commonnessSource.licenseStatus === "approved"
        && (
            (commonnessSource.allowedUse || []).includes("frequency-sanity")
            || (commonnessSource.allowedUse || []).includes("commonness-support")
            || (commonnessSource.allowedUse || []).includes("usefulness-support")
        )
    );

    for (const level of levels) {
        const currentConfiguredSourceIds = getActiveConfiguredDiscoverySourceIdsForLevel({ manifest, level });
        const levelCandidateSources = sources
            .filter((source) => sourceSupportsLevel(source, level))
            .filter((source) => sourceIsCandidateDiscoveryLike(source));
        const extraCandidateSources = levelCandidateSources
            .filter((source) => !currentConfiguredSourceIds.has(source.sourceId));
        const actionableSources = extraCandidateSources
            .filter((source) => [
                "review_source_access_and_pin_input",
                "import_reviewed_word_assignments",
                "resolve_license_before_voting",
            ].includes(source.recommendedAction));
        const availableReviewedSources = extraCandidateSources
            .filter((source) => source.status === "active")
            .filter((source) => source.recommendedAction === "no_action")
            .filter((source) => source.licenseStatus === "approved")
            .filter((source) => (source.reviewedAssignmentCount || 0) > 0)
            .filter((source) => (source.allowedUse || []).includes("candidate-discovery"));
        const registeredNoCurrentAccessSources = extraCandidateSources
            .filter((source) => source.recommendedAction === "registered_no_current_source_access");
        const blockedSources = extraCandidateSources
            .filter((source) => source.recommendedAction === "keep_blocked");
        const currentConfiguredPendingSources = levelCandidateSources
            .filter((source) => currentConfiguredSourceIds.has(source.sourceId))
            .filter((source) => source.recommendedAction && source.recommendedAction !== "no_action");

        result[level] = {
            hasSourceAccessContext: true,
            currentConfiguredSourceIds: [...currentConfiguredSourceIds].sort(),
            actionableExtraSourceCount: actionableSources.length,
            actionableExtraSourceIds: actionableSources.map((source) => source.sourceId).sort(),
            availableReviewedExtraSourceCount: availableReviewedSources.length,
            availableReviewedExtraSourceIds: availableReviewedSources.map((source) => source.sourceId).sort(),
            availableReviewedExtraSourceRowCount: availableReviewedSources.reduce(
                (total, source) => total + countValue(source.local?.rowCount || source.rowCount),
                0
            ),
            availableReviewedExtraSourceAssignmentCount: availableReviewedSources.reduce(
                (total, source) => total + countValue(source.reviewedAssignmentCount),
                0
            ),
            registeredNoCurrentAccessSourceCount: registeredNoCurrentAccessSources.length,
            registeredNoCurrentAccessSourceIds: registeredNoCurrentAccessSources.map((source) => source.sourceId).sort(),
            blockedExtraSourceCount: blockedSources.length,
            blockedExtraSourceIds: blockedSources.map((source) => source.sourceId).sort(),
            currentConfiguredSourcePendingCount: currentConfiguredPendingSources.length,
            currentConfiguredSourcePendingIds: currentConfiguredPendingSources.map((source) => source.sourceId).sort(),
            dictionaryCommonPoolAvailable,
            dictionaryCommonPoolSourceId: DICTIONARY_COMMON_POOL_SOURCE_ID,
            dictionaryCommonPoolCommandSource: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        };
    }

    return result;
}

function buildExpansionWorkOrder(levelReport = {}) {
    const level = levelReport.level;
    const levelLabel = levelReport.levelLabel || `N${level}`;
    const counts = levelReport.summary?.selectorStatusCounts || {};
    const gate = levelReport.commonWordQueue || {};
    const fallbackGate = levelReport.fallbackSourceGate || {};
    const extraSourceAccess = levelReport.extraSourceAccess || {};
    const isExtraSourceSelector = levelReport.sourceUniverse?.extraSource === true;
    const isDictionaryCommonPoolSelector = levelReport.sourceUniverse?.sourcePool === SOURCE_POOL_DICTIONARY_COMMON;
    const isRawDictionaryCommonPoolAudit = isDictionaryCommonPoolSelector
        && levelReport.sourceUniverse?.commonPoolSummary?.qualityMode === COMMON_POOL_QUALITY_MODE_RAW;
    const selectorSourceId = isDictionaryCommonPoolSelector
        ? DICTIONARY_COMMON_POOL_COMMAND_SOURCE
        : levelReport.sourceUniverse?.sourceId;
    const selectorSourceArg = isExtraSourceSelector && selectorSourceId
        ? ` --source=${selectorSourceId}${isDictionaryCommonPoolSelector ? ` --frequency-source=${DEFAULT_COMMON_POOL_FREQUENCY_SOURCE_ID}` : ""}`
        : "";
    const selectorScopeLabel = isExtraSourceSelector
        ? (isDictionaryCommonPoolSelector ? SOURCE_POOL_DICTIONARY_COMMON_LABEL : "EXTRA source")
        : "Current source";
    const hasSourceAccessContext = extraSourceAccess.hasSourceAccessContext === true;
    const actionableExtraSourceCount = countValue(extraSourceAccess.actionableExtraSourceCount);
    const availableReviewedExtraSourceCount = countValue(extraSourceAccess.availableReviewedExtraSourceCount);
    const availableReviewedExtraSourceIds = extraSourceAccess.availableReviewedExtraSourceIds || [];
    const dictionaryCommonPoolAvailable = extraSourceAccess.dictionaryCommonPoolAvailable === true;
    const availableReviewedExtraSourceRowCount = countValue(extraSourceAccess.availableReviewedExtraSourceRowCount);
    const availableReviewedExtraSourceAssignmentCount = countValue(extraSourceAccess.availableReviewedExtraSourceAssignmentCount);
    const readingFastPromotions = countValue(gate.promoteCuratedExampleItems);
    const readingEditorialResearch = countValue(gate.editorialReviewItems);
    const readingDeferredVariants = countValue(gate.deferVariantItems);
    const auditReadyRows = countValue(counts.ready_for_editorial_review);
    const auditNeedsTriageRows = countValue(counts.needs_triage);
    const auditSourceMoveRows = countValue(counts.move_candidate);
    const readyRows = isRawDictionaryCommonPoolAudit ? 0 : auditReadyRows;
    const needsTriageRows = isRawDictionaryCommonPoolAudit ? 0 : auditNeedsTriageRows;
    const sourceMoveRows = isRawDictionaryCommonPoolAudit ? 0 : auditSourceMoveRows;
    const unresolvedSourceMoveRows = Number.isInteger(levelReport.summary?.unresolvedSourceMoveCandidateRows)
        ? levelReport.summary.unresolvedSourceMoveCandidateRows
        : sourceMoveRows;
    const targetRoutedRows = countValue(levelReport.summary?.routedMoveCandidateRows);
    const moveRows = unresolvedSourceMoveRows + targetRoutedRows;
    const blockedRows = countValue(counts.blocked_identity)
        + countValue(counts.blocked_missing_dictionary)
        + countValue(counts.blocked_missing_commonness);
    const selectorDeferredRows = countValue(counts.triaged_defer);
    const rejectedRows = countValue(counts.triaged_reject);
    const gapPlanCommand = `npm run deck:words:gap-plan:n${level} -- --limit=50`;
    const selectorCommand = `npm run deck:words:vocab-expansion -- --levels=${level}${selectorSourceArg} --strict --limit=80`;
    const allLevelSelectorCommand = "npm run deck:words:vocab-expansion -- --levels=5,4,3,2,1 --strict --limit=80";
    const sourceAccessCommand = "npm run deck:words:source-access";
    const dictionaryCommonPoolCommand = `npm run deck:words:vocab-expansion -- --levels=${level} --source=${DICTIONARY_COMMON_POOL_COMMAND_SOURCE} --frequency-source=${DEFAULT_COMMON_POOL_FREQUENCY_SOURCE_ID} --strict --limit=80`;
    const extraSourceCommand = availableReviewedExtraSourceIds.length === 1
        ? `npm run deck:words:vocab-expansion -- --levels=${level} --source=${availableReviewedExtraSourceIds[0]} --strict --limit=80`
        : (dictionaryCommonPoolAvailable ? dictionaryCommonPoolCommand : sourceAccessCommand);
    const extraSourceStatus = isRawDictionaryCommonPoolAudit
        ? "raw_audit_only"
        : (
            isExtraSourceSelector
                ? (
                    !isDictionaryCommonPoolSelector && fallbackGate.active && dictionaryCommonPoolAvailable
                        ? "ready_dictionary_common_pool"
                        : "selected_extra_source"
                )
                : (
                    fallbackGate.active
                        ? (
                            hasSourceAccessContext && availableReviewedExtraSourceCount > 0
                                ? "ready_extra_source_available"
                                : (
                                    dictionaryCommonPoolAvailable
                                        ? "ready_dictionary_common_pool"
                                        : (hasSourceAccessContext && actionableExtraSourceCount === 0 ? "ready_no_actionable_source" : "ready")
                                )
                        )
                        : "closed"
                )
        );
    const extraSourceReason = (() => {
        if (isRawDictionaryCommonPoolAudit) {
            return "Raw dictionary common-pool mode is an audit denominator, not an actionable review lane. Use the default editorial shortlist command for governed triage and Silver preparation.";
        }
        if (extraSourceStatus === "ready_dictionary_common_pool") {
            const prefix = isExtraSourceSelector
                ? "Selected extra source-family selector is exhausted under the current filters."
                : "No reviewed extra source-family selector has priority over the common pool right now.";
            return [
                prefix,
                "Continue the same extra expansion lane with the DICTIONARY COMMON POOL.",
                "Rows come from pinned JMdict dictionary/commonness data plus optional TubeLex frequency support, exclude exact governed/excluded duplicates and kana-only rows by default, keep the Source level claim unverified label, and still require normal triage before Silver.",
            ].join(" ");
        }
        if (isExtraSourceSelector) {
            return isDictionaryCommonPoolSelector
                ? "The selected source is the DICTIONARY COMMON POOL inside the extra expansion lane; rows must keep the Source level claim unverified label and still require normal triage before Silver."
                : "The selected source is already the EXTRA source-family preview; rows must keep the Source level claim unverified label and still require normal triage before Silver.";
        }
        if (!fallbackGate.active) {
            return (fallbackGate.blockers || []).join(" ") || "Closed until reading expansion and the current selector are exhausted.";
        }
        if (hasSourceAccessContext && availableReviewedExtraSourceCount > 0) {
            return [
                `READY: ${availableReviewedExtraSourceCount} already-reviewed extra source family record(s) are available: ${availableReviewedExtraSourceIds.join(", ")}.`,
                `Pinned extra source rows: ${availableReviewedExtraSourceRowCount}; reviewed source assignments: ${availableReviewedExtraSourceAssignmentCount}.`,
                "Run the extra-source selector preview; every extra row must keep the Source level claim unverified label and still requires normal triage before Silver.",
            ].join(" ");
        }
        if (hasSourceAccessContext && actionableExtraSourceCount === 0) {
            return [
                "READY but no actionable extra free/permitted source family is registered right now; do not repeat source hunting for the same result.",
                "Reopen broad source-depth work only with a specific newly permitted source, publisher permission, or a source-access packet for an exact surface.",
                "Any extra rows must keep the Source level claim unverified label.",
            ].join(" ");
        }
        if (hasSourceAccessContext && actionableExtraSourceCount > 0) {
            return `READY: ${actionableExtraSourceCount} actionable extra source family record(s) need source-access/input review; every extra row must keep the Source level claim unverified label.`;
        }
        return "READY: work is not done. Add the next free/permitted source family through source-access/input review; every extra row must keep the Source level claim unverified label.";
    })();

    const items = [
        buildWorkOrderItem({
            rank: 1,
            lane: "reading_fast_promotions",
            label: "Reading fast promotions",
            count: readingFastPromotions,
            status: readingFastPromotions > 0 ? "active" : "clear",
            blocksExtraLane: readingFastPromotions > 0,
            command: gapPlanCommand,
            reason: readingFastPromotions > 0
                ? "Fast/easy reading work exists: curated or tracked support can likely be promoted after review."
                : "No fast/easy reading promotions are active.",
        }),
        buildWorkOrderItem({
            rank: 2,
            lane: "reading_editorial_research",
            label: "Reading editorial research",
            count: readingEditorialResearch,
            status: readingEditorialResearch > 0 ? "active" : "clear",
            blocksExtraLane: readingEditorialResearch > 0,
            command: gapPlanCommand,
            reason: readingEditorialResearch > 0
                ? "Reading gaps still need learner-facing source/card research before common-word expansion should be treated as the main lane."
                : "No active reading editorial research remains.",
        }),
        ...(isRawDictionaryCommonPoolAudit ? [
            buildWorkOrderItem({
                rank: 3,
                lane: "dictionary_common_pool_raw_audit",
                label: "Dictionary common-pool raw audit",
                count: countValue(levelReport.summary?.selectedRows),
                status: "audit_only",
                blocksExtraLane: false,
                command: selectorCommand,
                reason: `Raw dictionary common-pool mode is an audit denominator, not an actionable review lane. It shows ${countValue(levelReport.summary?.selectedRows)} denominator row(s), including ${auditReadyRows} ready/pre-trust and ${auditNeedsTriageRows} needs-triage classifications, for evidence accounting only. Use the default editorial shortlist for triage.`,
            }),
        ] : []),
        buildWorkOrderItem({
            rank: 3,
            lane: "current_selector_ready",
            label: `${selectorScopeLabel} ready rows`,
            count: readyRows,
            status: readyRows > 0 ? "active" : "clear",
            blocksExtraLane: readyRows > 0,
            command: selectorCommand,
            reason: readyRows > 0
                ? `${selectorScopeLabel} selector rows are ready for editorial Silver review; still pre-trust and not card approvals.`
                : `No ready rows remain in the ${selectorScopeLabel.toLowerCase()} selector.`,
        }),
        buildWorkOrderItem({
            rank: 4,
            lane: "current_selector_triage",
            label: `${selectorScopeLabel} triage`,
            count: needsTriageRows,
            status: needsTriageRows > 0 ? "active" : "clear",
            blocksExtraLane: needsTriageRows > 0,
            command: selectorCommand,
            reason: needsTriageRows > 0
                ? `${selectorScopeLabel} rows still need keep/defer/reject/move decisions before Silver.`
                : `No needs-triage rows remain in the ${selectorScopeLabel.toLowerCase()} selector.`,
        }),
        buildWorkOrderItem({
            rank: 5,
            lane: "move_candidate_routing",
            label: "Move-candidate routing",
            count: moveRows,
            status: moveRows > 0 ? "active" : "clear",
            blocksExtraLane: moveRows > 0,
            command: allLevelSelectorCommand,
            reason: moveRows > 0
                ? "Move candidates remain authoritative and must be resolved in their target level, not bypassed."
                : (
                    sourceMoveRows > 0
                        ? `${sourceMoveRows} source-level move-candidate row(s) are routed to target-level queues; no source-level routing blocker remains.`
                        : "No move-candidate routing rows remain for this level view."
                ),
        }),
        buildWorkOrderItem({
            rank: 6,
            lane: "blocked_or_ineligible_current_rows",
            label: `Blocked or ineligible ${selectorScopeLabel.toLowerCase()} rows`,
            count: blockedRows,
            status: blockedRows > 0 ? "blocked_backlog" : "clear",
            blocksExtraLane: false,
            command: selectorCommand,
            reason: blockedRows > 0
                ? "These rows are not promotion-ready; review only if identity, dictionary, commonness, or source policy evidence changes."
                : "No blocked identity/dictionary/commonness rows are active.",
        }),
        buildWorkOrderItem({
            rank: 7,
            lane: "deferred_or_rejected_current_rows",
            label: `Deferred or rejected ${selectorScopeLabel.toLowerCase()} rows`,
            count: readingDeferredVariants + selectorDeferredRows + rejectedRows,
            status: (readingDeferredVariants + selectorDeferredRows + rejectedRows) > 0 ? "recorded_backlog" : "clear",
            blocksExtraLane: false,
            command: `npm run deck:words:gap-plan:n${level} -- --include-deferred --limit=50`,
            reason: "Deferred/rejected rows stay recorded as policy/editorial backlog; they do not silently become promotion work.",
        }),
        buildWorkOrderItem({
            rank: 8,
            lane: "extra_source_family",
            label: "Extra expansion lane",
            count: null,
            status: extraSourceStatus,
            blocksExtraLane: false,
            command: extraSourceStatus === "ready_dictionary_common_pool"
                ? dictionaryCommonPoolCommand
                : (extraSourceStatus === "ready_no_actionable_source" ? "" : extraSourceCommand),
            reason: extraSourceReason,
        }),
    ];

    const nextItem = items.find((item) => item.status === "active")
        || items.find((item) => item.status === "audit_only")
        || items.find((item) => item.lane === "extra_source_family" && item.status === "ready")
        || items.find((item) => item.lane === "extra_source_family" && item.status === "ready_extra_source_available")
        || items.find((item) => item.lane === "extra_source_family" && item.status === "ready_dictionary_common_pool")
        || items.find((item) => item.lane === "extra_source_family" && item.status === "ready_no_actionable_source")
        || items.find((item) => item.status === "blocked_backlog")
        || null;
    const activeBlockers = items.filter((item) => item.blocksExtraLane && item.count > 0);
    const extraLane = items.find((item) => item.lane === "extra_source_family");

    return {
        level,
        levelLabel,
        status: nextItem?.lane || "no_active_expansion_work",
        nextAction: nextItem
            ? `${nextItem.label}: ${nextItem.reason}`
            : "No active expansion work is visible under current governed inputs.",
        nextCommand: nextItem?.command || "",
        activeBlockingLaneCount: activeBlockers.length,
        extraSourceLaneReady: extraLane?.status === "ready"
            || extraLane?.status === "ready_extra_source_available"
            || extraLane?.status === "ready_dictionary_common_pool"
            || extraLane?.status === "ready_no_actionable_source"
            || extraLane?.status === "selected_extra_source",
        extraSourceLaneOpen: extraLane?.status === "ready"
            || extraLane?.status === "ready_extra_source_available"
            || extraLane?.status === "ready_dictionary_common_pool"
            || extraLane?.status === "ready_no_actionable_source"
            || extraLane?.status === "selected_extra_source",
        extraSourceLaneActionable: extraLane?.status === "ready"
            || extraLane?.status === "ready_extra_source_available"
            || extraLane?.status === "ready_dictionary_common_pool",
        extraSourceAccess,
        items,
    };
}

function attachExpansionWorkOrder(levelReport = {}) {
    const extraSourceAccess = levelReport.extraSourceAccess || {};
    const fallbackSourceGate = levelReport.fallbackSourceGate || {};
    const adjustedFallbackSourceGate = fallbackSourceGate.active === true
        && extraSourceAccess.hasSourceAccessContext === true
        && countValue(extraSourceAccess.availableReviewedExtraSourceCount) === 0
        && countValue(extraSourceAccess.actionableExtraSourceCount) === 0
        ? {
            ...fallbackSourceGate,
            reason: "Reading expansion and the current new-word selector are exhausted; the extra free/permitted source-family lane is READY, but no actionable extra free/permitted source family is registered right now. Do not repeat source hunting for the same result. Reopen only with a specific newly permitted source, paid/private source intake, publisher permission, or a source-access packet for an exact surface. Imported extra rows must keep explicit unverified source-level labels.",
        }
        : fallbackSourceGate;
    const adjustedLevelReport = {
        ...levelReport,
        fallbackSourceGate: adjustedFallbackSourceGate,
    };
    return {
        ...adjustedLevelReport,
        expansionWorkOrder: buildExpansionWorkOrder(adjustedLevelReport),
    };
}

function normalizeReportLevels(levels = [5, 4, 3, 2, 1]) {
    const normalized = [...new Set(
        (Array.isArray(levels) ? levels : [levels])
            .map((level) => Number(level))
            .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5)
    )];
    return normalized.length > 0 ? normalized : [5, 4, 3, 2, 1];
}

function collectRoutingSupportLevels({ levels = [], triageDecisionsByLevelSource = {} } = {}) {
    const targetLevels = new Set(normalizeReportLevels(levels));
    const supportLevels = new Set(targetLevels);

    for (const [sourceLevelLabel, bySource] of Object.entries(triageDecisionsByLevelSource || {})) {
        const sourceLevel = normalizeMoveTargetLevel(sourceLevelLabel);
        if (!Number.isInteger(sourceLevel)) {
            continue;
        }
        for (const decisions of Object.values(bySource || {})) {
            for (const decision of Object.values(decisions || {})) {
                if (decision?.decision !== "move_candidate") {
                    continue;
                }
                const targetLevel = normalizeMoveTargetLevel(
                    decision.targetLevel ?? decision.moveToLevel ?? decision.targetJlpt
                );
                if (targetLevels.has(targetLevel) && targetLevel !== sourceLevel) {
                    supportLevels.add(sourceLevel);
                }
            }
        }
    }

    return [5, 4, 3, 2, 1].filter((level) => supportLevels.has(level));
}

function buildReadingExpansionGate({ level, signal = null, enforceReadingExpansionGate = false } = {}) {
    if (!signal) {
        return {
            active: !enforceReadingExpansionGate,
            status: enforceReadingExpansionGate ? "inactive" : "not_evaluated",
            readingExhausted: enforceReadingExpansionGate ? false : null,
            fullyExpanded: false,
            readingStatus: "not_evaluated",
            enhancementStatus: "not_evaluated",
            placementStatus: "not_evaluated",
            activeItems: null,
            editorialReviewItems: null,
            promoteCuratedExampleItems: null,
            deferVariantItems: null,
            totalItems: null,
            reason: enforceReadingExpansionGate
                ? `N${level} common-word expansion is inactive until reading expansion is evaluated and exhausted.`
                : "Reading expansion gate was not provided to this in-memory report.",
            blockers: enforceReadingExpansionGate
                ? ["reading expansion gate was not provided."]
                : [],
        };
    }

    const fullSignal = signal.reading ? signal : null;
    const readingSignal = fullSignal ? fullSignal.reading : signal;
    const enhancementSignal = fullSignal?.enhancement || null;
    const placementSignal = fullSignal?.placement || null;
    const readingExhausted = readingSignal.status === "exhausted";
    const firstStageFullyExpanded = fullSignal
        ? fullSignal.fullyExpanded === true
        : readingExhausted;
    const active = readingExhausted;
    const gateReason = active
        ? "Reading expansion is exhausted; common-word expansion queue is active for this level. Enhancement and placement signals are reported as context, not activation blockers."
        : fullSignal
        ? [
            `N${level} reading expansion is not exhausted; common-word expansion queue is inactive.`,
            readingSignal.reason,
        ].filter(Boolean).join(" ")
        : (readingSignal.reason || `N${level} reading expansion is not exhausted; common-word expansion queue is inactive.`);

    return {
        active,
        status: active ? "active" : "inactive",
        readingExhausted,
        fullyExpanded: firstStageFullyExpanded,
        readingStatus: readingSignal.status || "unknown",
        enhancementStatus: enhancementSignal?.status || "not_evaluated",
        placementStatus: placementSignal?.status || "not_evaluated",
        activeItems: readingSignal.activeItems ?? null,
        editorialReviewItems: readingSignal.editorialReviewItems ?? null,
        promoteCuratedExampleItems: readingSignal.promoteCuratedExampleItems ?? null,
        deferVariantItems: readingSignal.deferVariantItems ?? null,
        totalItems: readingSignal.totalItems ?? null,
        enhancementKeepCandidates: enhancementSignal?.keepCandidates ?? null,
        enhancementUntriagedCandidates: enhancementSignal?.untriagedCandidateRows ?? null,
        enhancementMoveCandidates: enhancementSignal?.moveCandidates ?? null,
        enhancementCrossLevelRoutingRows: enhancementSignal?.crossLevelRoutingRows ?? null,
        placementViolationCount: placementSignal?.violationCount ?? null,
        reason: gateReason,
        blockers: readingSignal.blockers || [],
    };
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
}

function formatKanjiList(entries = []) {
    return entries
        .map((entry) => (typeof entry === "string" ? entry : entry?.kanji))
        .filter(Boolean)
        .join(", ");
}

function getUtilityBand(score) {
    const boundedScore = clampNumber(score, 0, 100);
    return LEARNER_UTILITY_BANDS.find((band) => boundedScore >= band.min)?.label || "low_priority_review_candidate";
}

function normalizeFrequencyEvidenceBand(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    return FREQUENCY_EVIDENCE_BANDS.includes(normalized) ? normalized : "missing";
}

function normalizeFrequencyMatchStatus(value = "") {
    const normalized = String(value || "").trim();
    return ["exact_written", "lemma_match", "ambiguous_written", "missing"].includes(normalized)
        ? normalized
        : "";
}

function collectFrequencyEvidenceFromRow(row = {}) {
    const directEvidence = Array.isArray(row.frequencyEvidence)
        ? row.frequencyEvidence
        : (
            row.frequencyEvidence?.primary || Array.isArray(row.frequencyEvidence?.sources)
                ? [row.frequencyEvidence.primary, ...(row.frequencyEvidence.sources || [])].filter(Boolean)
                : (row.frequencyEvidence ? [row.frequencyEvidence] : [])
        );
    const evidence = [...directEvidence];
    if (
        directEvidence.length === 0
        && (
        Number.isInteger(row.tubelexRank)
        || Number.isInteger(row.tubelexCount)
        || row.frequencyBand
        || row.frequencyMatchStatus
        )
    ) {
        const evidenceSource = row.frequencyEvidenceSource || row.frequencyRankSource || row.source || DEFAULT_COMMON_POOL_FREQUENCY_SOURCE_ID;
        evidence.push({
            source: evidenceSource,
            frequencyRank: evidenceSource === DEFAULT_COMMON_POOL_FREQUENCY_SOURCE_ID && Number.isInteger(row.tubelexRank)
                ? row.tubelexRank
                : row.frequencyRank,
            frequencyBand: row.frequencyBand || "",
            frequencyMatchStatus: row.frequencyMatchStatus || "",
            tubelexRank: row.tubelexRank,
            tubelexCount: row.tubelexCount,
            tubelexVideoCount: row.tubelexVideoCount,
            tubelexChannelCount: row.tubelexChannelCount,
            tubelexDispersionScore: row.tubelexDispersionScore,
            tubelexCategoryConcentration: row.tubelexCategoryConcentration,
            frequencyReason: row.frequencyReason || "",
        });
    }
    const seen = new Set();
    return evidence.filter((entry) => {
        if (!entry) {
            return false;
        }
        const key = [
            entry.source || "",
            entry.frequencyRank ?? "",
            entry.frequencyBand || "",
            entry.frequencyMatchStatus || "",
        ].join("|");
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function compareFrequencyEvidence(a = {}, b = {}) {
    const bandOrder = {
        strong: 0,
        good: 1,
        borderline: 2,
        poor: 3,
        missing: 4,
    };
    const matchOrder = {
        exact_written: 0,
        lemma_match: 1,
        ambiguous_written: 2,
        missing: 3,
        "": 4,
    };
    return (
        (bandOrder[normalizeFrequencyEvidenceBand(a.frequencyBand)] ?? 99)
        - (bandOrder[normalizeFrequencyEvidenceBand(b.frequencyBand)] ?? 99)
        || (matchOrder[normalizeFrequencyMatchStatus(a.frequencyMatchStatus)] ?? 99)
        - (matchOrder[normalizeFrequencyMatchStatus(b.frequencyMatchStatus)] ?? 99)
        || getComparableFrequencyEvidenceRank(a) - getComparableFrequencyEvidenceRank(b)
    );
}

function getComparableFrequencyEvidenceRank(evidence = {}) {
    return Number.isInteger(evidence.frequencyRank) && evidence.frequencyRank > 0
        ? evidence.frequencyRank
        : (Number.isInteger(evidence.tubelexRank) && evidence.tubelexRank > 0 ? evidence.tubelexRank : Number.MAX_SAFE_INTEGER);
}

function buildFrequencyEvidenceSummary(row = {}) {
    const evidence = collectFrequencyEvidenceFromRow(row).sort(compareFrequencyEvidence);
    const primary = evidence[0] || buildJmdictFrequencyEvidence(row);
    return {
        primary,
        sources: evidence,
    };
}

function getPrimaryFrequencyEvidence(row = {}) {
    return buildFrequencyEvidenceSummary(row).primary;
}

function classifyRankFrequencyBand(rank) {
    if (!Number.isInteger(rank) || rank <= 0) {
        return "missing";
    }
    if (rank <= 200) {
        return "strong";
    }
    if (rank <= 1000) {
        return "good";
    }
    if (rank <= 5000) {
        return "borderline";
    }
    return "poor";
}

function buildJmdictFrequencyEvidence(row = {}) {
    if (!hasCommonnessRank(row)) {
        return null;
    }
    return {
        source: row.frequencyRankSource || "jmdict-priority-commonness",
        frequencyRank: row.frequencyRank,
        frequencyBand: classifyRankFrequencyBand(row.frequencyRank),
        frequencyMatchStatus: "exact_written",
        frequencyReason: `JMdict priority/commonness rank ${row.frequencyRank}`,
    };
}

function buildSelectorFrequencyEvidence({ expansionRow = {}, agreementRow = null } = {}) {
    const sourceAppearanceEvidence = (agreementRow?.sourceAppearances || [])
        .flatMap((appearance) => {
            if (appearance.frequencyEvidence) {
                return [appearance.frequencyEvidence];
            }
            if (Number.isInteger(appearance.frequencyRank) && appearance.frequencyRank > 0) {
                return [{
                    source: appearance.frequencyRankSource || appearance.sourceId || "frequency-support",
                    frequencyRank: appearance.frequencyRank,
                    frequencyBand: classifyRankFrequencyBand(appearance.frequencyRank),
                    frequencyMatchStatus: "exact_written",
                    frequencyReason: `${appearance.sourceId || "frequency-support"} numeric commonness rank ${appearance.frequencyRank}`,
                }];
            }
            return [];
        });
    const evidence = [
        ...collectFrequencyEvidenceFromRow(expansionRow),
        ...(agreementRow?.frequencyEvidence || []),
        ...sourceAppearanceEvidence,
    ];
    const summary = buildFrequencyEvidenceSummary({
        ...expansionRow,
        frequencyEvidence: evidence,
        frequencyRank: Number.isInteger(expansionRow.frequencyRank)
            ? expansionRow.frequencyRank
            : null,
        frequencyRankSource: expansionRow.frequencyRankSource || "",
    });
    return {
        ...summary,
        sources: summary.sources,
    };
}

function getRowKanjiScope(row = {}, explicitScope = null) {
    if (explicitScope) {
        return explicitScope;
    }
    const targetLevel = Number(row.targetLevel || row.sourceLevel || 0);
    const kanjiLevels = Array.isArray(row.kanjiLevels) ? row.kanjiLevels : [];
    const constituentKanji = Array.isArray(row.constituentKanji)
        ? row.constituentKanji
        : kanjiLevels.map((entry) => entry.kanji).filter(Boolean);
    const targetKanji = Array.isArray(row.targetKanji) && row.targetKanji.length > 0
        ? row.targetKanji.map((kanji) => (typeof kanji === "string" ? { kanji, level: targetLevel || null } : kanji))
        : kanjiLevels.filter((entry) => entry.level === targetLevel);
    const harderKanji = Array.isArray(row.harderKanji)
        ? row.harderKanji.map((entry) => (typeof entry === "string" ? { kanji: entry, level: null } : entry))
        : kanjiLevels.filter((entry) => Number.isInteger(entry.level) && Number.isInteger(targetLevel) && entry.level < targetLevel);
    const outsideJlptKanji = Array.isArray(row.outsideJlptKanji)
        ? row.outsideJlptKanji.map((entry) => (typeof entry === "string" ? { kanji: entry, level: null } : entry))
        : kanjiLevels.filter((entry) => !Number.isInteger(entry.level));
    return {
        constituentKanji,
        kanjiLevels,
        targetKanji,
        harderKanji,
        outsideJlptKanji,
    };
}

function findSameWrittenContractConflicts(row = {}, jlptWordLevelContract = {}) {
    const written = String(row.written || "").trim();
    const key = row.key || `${written}|${row.reading || ""}`;
    if (!written) {
        return [];
    }
    return Object.entries(jlptWordLevelContract.wordLevels || {})
        .filter(([entryKey, entry]) => entryKey !== key && String(entry?.written || "").trim() === written)
        .map(([entryKey, entry]) => ({
            key: entryKey,
            reading: entry?.reading || "",
            jlpt: Number(entry?.jlpt ?? entry?.level ?? entry?.jlptLevel) || null,
        }));
}

function buildSameWrittenSourceRowsByWritten(sourceRows = []) {
    const rowsByWritten = new Map();
    for (const sourceRow of Array.isArray(sourceRows) ? sourceRows : []) {
        const written = String(sourceRow?.written || "").trim();
        if (!written) {
            continue;
        }
        const entry = {
            key: sourceRow.key || `${sourceRow.written || ""}|${sourceRow.reading || ""}`,
            reading: sourceRow.reading || "",
            source: sourceRow.source || sourceRow.sourceId || null,
        };
        rowsByWritten.set(written, [...(rowsByWritten.get(written) || []), entry]);
    }
    return rowsByWritten;
}

function findSameWrittenSourceConflicts(row = {}, sourceRowsByWritten = new Map()) {
    const written = String(row.written || "").trim();
    const key = row.key || `${written}|${row.reading || ""}`;
    if (!written) {
        return [];
    }
    const sourceRows = sourceRowsByWritten instanceof Map ? sourceRowsByWritten.get(written) || [] : [];
    return sourceRows.filter((sourceRow) => sourceRow.key !== key);
}

function buildLearnerUtilityComponent({ score, max, reason }) {
    return {
        score: clampNumber(score, 0, max),
        max,
        reason,
    };
}

function isLearnerUtilityPenaltyReason(reason = "") {
    const text = String(reason || "");
    if (
        /^no exact duplicate/iu.test(text)
        || /^no harder\/outside support label needed/iu.test(text)
        || /^clean identity can proceed/iu.test(text)
        || /^highest JMdict commonness tier/iu.test(text)
        || /^strong JMdict commonness tier/iu.test(text)
        || /^moderate JMdict commonness tier/iu.test(text)
        || /^(?:strong|good|borderline) TubeLex everyday-language evidence/iu.test(text)
        || /^match exact_written/iu.test(text)
        || /^everyday concrete domain signal/iu.test(text)
        || /^reinforces target kanji/iu.test(text)
        || /^sentence evidence already present/iu.test(text)
        || /^pitch support already present/iu.test(text)
    ) {
        return false;
    }
    return /missing|needs|needed|must|risk|conflict|specialized|numeric|longer|weak|lower|no target|no explicit everyday/iu.test(text);
}

function hasLearnerUtilitySpecializedOrProperSignal(row = {}) {
    const meaning = String(row.meaning || "");
    const capitalizedSingleProper = CAPITALIZED_SINGLE_PROPER_HEAD_PATTERN.test(meaning)
        && !CAPITALIZED_CALENDAR_GLOSS_PATTERN.test(meaning);
    return (
        LEARNER_UTILITY_SPECIALIZED_OR_PROPER_RE.test(meaning)
        || COMMON_POOL_PRIORITY_MEANING_RE.test(meaning)
        || CAPITALIZED_PROPER_PHRASE_PATTERN.test(meaning)
        || capitalizedSingleProper
    );
}

function hasLearnerUtilityEverydayDomainSignal(row = {}) {
    const meaning = String(row.meaning || "");
    if (!LEARNER_UTILITY_EVERYDAY_DOMAIN_RE.test(meaning)) {
        return false;
    }
    return !LEARNER_UTILITY_ABSTRACT_DOMAIN_RE.test(meaning);
}

function getJmdictNfRank(row = {}) {
    const match = String(row.notes || "").match(/\bnf(\d{1,2})\b/iu);
    if (!match) {
        return Number.MAX_SAFE_INTEGER;
    }
    const rank = Number(match[1]);
    return Number.isInteger(rank) && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function formatJmdictNfReason(row = {}) {
    const rank = getJmdictNfRank(row);
    return rank === Number.MAX_SAFE_INTEGER ? "" : `JMdict nf${String(rank).padStart(2, "0")} priority`;
}

function scoreTubelexFrequencyEvidence(evidence = {}) {
    const band = normalizeFrequencyEvidenceBand(evidence.frequencyBand);
    const rank = getComparableFrequencyEvidenceRank(evidence);
    const matchStatus = normalizeFrequencyMatchStatus(evidence.frequencyMatchStatus) || "missing";
    let score = 0;
    if (band === "strong") {
        score = 24;
    } else if (band === "good") {
        score = 20;
    } else if (band === "borderline") {
        score = 12;
    } else if (band === "poor") {
        score = 5;
    }
    const reasons = [
        `${band} TubeLex everyday-language evidence${Number.isInteger(rank) ? ` (rank ${rank})` : ""}`,
        `match ${matchStatus}`,
    ];
    if (Number.isFinite(evidence.tubelexDispersionScore)) {
        reasons.push(`dispersion ${evidence.tubelexDispersionScore}`);
    }
    if (Number.isFinite(evidence.tubelexCategoryConcentration)) {
        reasons.push(`category concentration ${evidence.tubelexCategoryConcentration}`);
    }
    if (matchStatus === "ambiguous_written") {
        score = Math.min(score, 5);
        reasons.push("ambiguous written/reading support cannot prove reading");
    } else if (matchStatus === "lemma_match") {
        score = Math.min(score, 18);
        reasons.push("lemma match needs review before trust");
    }
    return {
        score,
        reason: reasons.join("; "),
    };
}

function scoreEverydayUsefulness(row = {}) {
    const rank = getComparableFrequencyRank(row);
    const primaryFrequencyEvidence = getPrimaryFrequencyEvidence(row);
    const hasTubelexEvidence = primaryFrequencyEvidence?.source === DEFAULT_COMMON_POOL_FREQUENCY_SOURCE_ID
        || Number.isInteger(primaryFrequencyEvidence?.tubelexRank);
    if (hasTubelexEvidence && row.frequencyRankSource === DEFAULT_COMMON_POOL_FREQUENCY_SOURCE_ID) {
        const tubelexScore = scoreTubelexFrequencyEvidence(primaryFrequencyEvidence);
        let score = tubelexScore.score;
        const reasons = [tubelexScore.reason];
        if (hasLearnerUtilitySpecializedOrProperSignal(row)) {
            score -= 5;
            reasons.push("proper/specialized signal lowers everyday usefulness");
        }
        if (LEARNER_UTILITY_ABSTRACT_DOMAIN_RE.test(String(row.meaning || ""))) {
            score -= 3;
            reasons.push("abstract/technical signal lowers everyday usefulness");
        }
        return buildLearnerUtilityComponent({ score, max: 25, reason: reasons.join("; ") });
    }
    if (rank === Number.MAX_SAFE_INTEGER) {
        return buildLearnerUtilityComponent({
            score: 0,
            max: 25,
            reason: "missing numeric commonness rank",
        });
    }
    let score;
    let reason;
    if (rank <= 100) {
        const nfRank = getJmdictNfRank(row);
        if (nfRank <= 5) {
            score = 25;
        } else if (nfRank <= 15) {
            score = 23;
        } else if (nfRank !== Number.MAX_SAFE_INTEGER) {
            score = 21;
        } else {
            score = 22;
        }
        reason = `highest JMdict commonness tier (${rank})`;
    } else if (rank <= 200) {
        score = 20;
        reason = `strong JMdict commonness tier (${rank})`;
    } else if (rank <= 500) {
        score = 16;
        reason = `moderate JMdict commonness tier (${rank})`;
    } else if (rank <= 1000) {
        score = 12;
        reason = `lower JMdict commonness tier (${rank})`;
    } else {
        score = 8;
        reason = `weak JMdict commonness tier (${rank})`;
    }
    const reasons = [reason];
    const nfReason = formatJmdictNfReason(row);
    if (nfReason) {
        reasons.push(nfReason);
    }
    if (hasTubelexEvidence) {
        const tubelexScore = scoreTubelexFrequencyEvidence(primaryFrequencyEvidence);
        reasons.push(tubelexScore.reason);
        if (tubelexScore.score <= 5) {
            score -= 2;
        } else if (tubelexScore.score >= 20) {
            score += 1;
        }
    }
    if (hasLearnerUtilitySpecializedOrProperSignal(row)) {
        score -= 5;
        reasons.push("proper/specialized signal lowers everyday usefulness");
    }
    if (LEARNER_UTILITY_ABSTRACT_DOMAIN_RE.test(String(row.meaning || ""))) {
        score -= 3;
        reasons.push("abstract/technical signal lowers everyday usefulness");
    }
    return buildLearnerUtilityComponent({ score, max: 25, reason: reasons.join("; ") });
}

function scoreConcreteCommonDomain(row = {}) {
    const writtenLength = [...String(row.written || "")].length;
    let score = 7;
    const reasons = [];
    if (hasLearnerUtilityEverydayDomainSignal(row)) {
        score += 6;
        reasons.push("everyday concrete domain signal");
    } else {
        reasons.push("no explicit everyday-domain boost");
    }
    if (LEARNER_UTILITY_ABSTRACT_DOMAIN_RE.test(String(row.meaning || ""))) {
        score -= 5;
        reasons.push("abstract/specialized domain signal");
    }
    if (hasCommonPoolNumericExpressionWrittenForm(row)) {
        score -= 8;
        reasons.push("numeric-expression written form");
    }
    if (hasLearnerUtilitySpecializedOrProperSignal(row)) {
        score -= 6;
        reasons.push("proper/specialized meaning signal");
    }
    if (writtenLength >= 5) {
        score -= 2;
        reasons.push("longer compound");
    } else if (writtenLength === 4) {
        score -= 1;
        reasons.push("medium-length compound needs example fit review");
    }
    return buildLearnerUtilityComponent({
        score,
        max: 15,
        reason: reasons.join("; "),
    });
}

function scoreTargetKanjiReinforcement(row = {}, scope = null) {
    const resolvedScope = getRowKanjiScope(row, scope);
    const targetCount = resolvedScope.targetKanji.length;
    if (targetCount === 0) {
        return buildLearnerUtilityComponent({
            score: 0,
            max: 20,
            reason: "no target-level kanji anchor",
        });
    }
    let score = 11 + Math.min(targetCount, 2) * 3;
    const reasons = [`reinforces target kanji ${formatKanjiList(resolvedScope.targetKanji)}`];
    if (resolvedScope.harderKanji.length === 0 && resolvedScope.outsideJlptKanji.length === 0) {
        score += 2;
        reasons.push("no harder/outside support label needed");
    } else {
        if (resolvedScope.harderKanji.length > 0) {
            reasons.push(`harder support label needed for ${formatKanjiList(resolvedScope.harderKanji)}`);
        }
        if (resolvedScope.outsideJlptKanji.length > 0) {
            reasons.push(`outside-JLPT support label needed for ${formatKanjiList(resolvedScope.outsideJlptKanji)}`);
        }
    }
    return buildLearnerUtilityComponent({
        score,
        max: 20,
        reason: reasons.join("; "),
    });
}

function scoreDuplicateSafety(row = {}, sameWrittenConflicts = []) {
    const identityRisks = Array.isArray(row.identityRisks) ? row.identityRisks : [];
    const conflicts = Array.isArray(sameWrittenConflicts) && sameWrittenConflicts.length > 0
        ? sameWrittenConflicts
        : (Array.isArray(row.sameWrittenConflicts) ? row.sameWrittenConflicts : []);
    const sourceConflicts = Array.isArray(row.sameWrittenSourceConflicts) ? row.sameWrittenSourceConflicts : [];
    let score = 15;
    const reasons = [];
    if (identityRisks.length > 0) {
        score -= Math.min(identityRisks.length * 4, 8);
        reasons.push(`${identityRisks.length} identity risk(s)`);
    }
    if (conflicts.length > 0) {
        score -= Math.min(conflicts.length * 3, 9);
        reasons.push(`${conflicts.length} same-written governed conflict(s)`);
    }
        if (sourceConflicts.length > 0) {
            score -= Math.min(sourceConflicts.length * 2, 6);
            reasons.push(`${sourceConflicts.length} same-written source-pool conflict(s)`);
        }
    if (reasons.length === 0) {
        reasons.push("no exact duplicate or same-written conflict detected");
    }
    return buildLearnerUtilityComponent({
        score,
        max: 15,
        reason: reasons.join("; "),
    });
}

function scoreExampleability(row = {}) {
    const meaning = String(row.meaning || "");
    let score = 6;
    const reasons = [];
    if (row.sentenceSupported) {
        score += 4;
        reasons.push("sentence evidence already present");
    } else {
        reasons.push("needs curated example sentence");
    }
    if (!meaning) {
        score -= 4;
        reasons.push("missing learner-facing meaning");
    } else if (meaning.length > 120 || meaning.split(";").length > 4) {
        score -= 3;
        reasons.push("broad/multi-sense meaning needs tighter example review");
    }
    if (hasCommonPoolMeaningNoise(row) || hasLearnerUtilitySpecializedOrProperSignal(row)) {
        score -= 4;
        reasons.push("meaning has noisy or specialized review signal");
    }
    return buildLearnerUtilityComponent({
        score,
        max: 10,
        reason: reasons.join("; "),
    });
}

function scoreMediaReadiness(row = {}) {
    let score = 8;
    const reasons = [];
    if (row.pitchSupported) {
        score += 4;
        reasons.push("pitch support already present");
    } else {
        reasons.push("pitch must be verified/generated during Silver");
    }
    if (row.cleanIdentity === false || (row.identityRisks || []).length > 0) {
        score -= 5;
        reasons.push("identity risk can block audio/media generation");
    } else {
        reasons.push("clean identity can proceed to audio/media review");
    }
    if (!row.dictionaryVerified && row.sourcePool !== SOURCE_POOL_DICTIONARY_COMMON) {
        score -= 3;
        reasons.push("dictionary verification still needed before media work");
    }
    return buildLearnerUtilityComponent({
        score,
        max: 15,
        reason: reasons.join("; "),
    });
}

function buildLearnerUtilityScore(row = {}, {
    scope = null,
    sameWrittenConflicts = [],
} = {}) {
    const resolvedSameWrittenConflicts = Array.isArray(sameWrittenConflicts) && sameWrittenConflicts.length > 0
        ? sameWrittenConflicts
        : (Array.isArray(row.sameWrittenConflicts) ? row.sameWrittenConflicts : []);
    const components = {
        everydayUsefulness: scoreEverydayUsefulness(row),
        concreteCommonDomain: scoreConcreteCommonDomain(row),
        targetKanjiReinforcement: scoreTargetKanjiReinforcement(row, scope),
        duplicateOrNearDuplicateSafety: scoreDuplicateSafety(row, resolvedSameWrittenConflicts),
        exampleability: scoreExampleability(row),
        pitchAudioMediaReadiness: scoreMediaReadiness(row),
    };
    const componentValues = Object.values(components);
    const score = clampNumber(componentValues.reduce((total, component) => total + component.score, 0), 0, 100);
    const reasons = componentValues
        .map((component) => component.reason)
        .filter(Boolean);
    const reasonFragments = reasons
        .flatMap((reason) => String(reason || "").split(";"))
        .map((reason) => reason.trim())
        .filter(Boolean);
    const penalties = reasonFragments.filter(isLearnerUtilityPenaltyReason);
    return {
        score,
        max: 100,
        band: getUtilityBand(score),
        components,
        reasons,
        penalties,
        policy: "review_ordering_signal_not_card_approval",
    };
}

function getLearnerUtilityComparableScore(row = {}) {
    return Number.isFinite(row.learnerUtility?.score) ? row.learnerUtility.score : -1;
}

function compareSelectorRows(a, b) {
    return (
        (STATUS_ORDER[a.selectorStatus] ?? 99) - (STATUS_ORDER[b.selectorStatus] ?? 99)
        || getLearnerUtilityComparableScore(b) - getLearnerUtilityComparableScore(a)
        || getCommonPoolQueuePriority(a) - getCommonPoolQueuePriority(b)
        || a.reviewReadiness.nextEvidenceCount - b.reviewReadiness.nextEvidenceCount
        || b.reviewReadiness.supportedEvidenceCount - a.reviewReadiness.supportedEvidenceCount
        || getLearnerFitSortRiskCount(a) - getLearnerFitSortRiskCount(b)
        || a.reviewReadiness.sameWrittenConflictCount - b.reviewReadiness.sameWrittenConflictCount
        || a.reviewReadiness.identityRiskCount - b.reviewReadiness.identityRiskCount
        || getWrittenShapePriority(a) - getWrittenShapePriority(b)
        || getComparableFrequencyRank(a) - getComparableFrequencyRank(b)
        || a.written.localeCompare(b.written, "ja")
        || a.reading.localeCompare(b.reading, "ja")
    );
}

function hasCommonPoolNumericExpressionWrittenForm(row = {}) {
    return KANJI_NUMERIC_EXPRESSION_WRITTEN_PATTERN.test(String(row.written || ""));
}

function hasCommonPoolProperOrSpecializedPrioritySignal(row = {}) {
    const meaning = String(row.meaning || "");
    return COMMON_POOL_PRIORITY_MEANING_RE.test(meaning) || CAPITALIZED_PROPER_PHRASE_PATTERN.test(meaning);
}

function isDictionaryCommonPoolRow(row = {}) {
    return row.sourcePool === SOURCE_POOL_DICTIONARY_COMMON;
}

function getLearnerFitSortRiskCount(row = {}) {
    const risks = Array.isArray(row.learnerFitRisks) ? row.learnerFitRisks : [];
    if (!isDictionaryCommonPoolRow(row)) {
        return risks.length;
    }
    return risks.filter((risk) => !SUPPORT_LABEL_LEARNER_FIT_RE.test(String(risk || ""))).length;
}

function getCommonPoolQueuePriority(row = {}) {
    if (!isDictionaryCommonPoolRow(row)) {
        return 0;
    }
    let priority = 0;
    if (hasCommonPoolNumericExpressionWrittenForm(row)) {
        priority += 6;
    }
    if (hasCommonPoolProperOrSpecializedPrioritySignal(row)) {
        priority += 4;
    }
    priority += Math.min(getLearnerFitSortRiskCount(row), 3) * 2;
    priority += Math.min(row.reviewReadiness?.sameWrittenConflictCount || 0, 3);
    priority += Math.min(row.reviewReadiness?.identityRiskCount || 0, 3);
    return priority;
}

function getWrittenShapePriority(row = {}) {
    const text = String(row.written || "").trim();
    const chars = [...text];
    if (chars.length > 0 && chars.every((char) => HAN_CHARACTER_PATTERN.test(char))) {
        return 0;
    }
    if (chars.length > 0 && HAN_CHARACTER_PATTERN.test(chars[0]) && HAN_ANY_PATTERN.test(text)) {
        return 1;
    }
    if (HAN_ANY_PATTERN.test(text)) {
        return 2;
    }
    return 3;
}

function getComparableFrequencyRank(row = {}) {
    return Number.isInteger(row.frequencyRank) && row.frequencyRank > 0 ? row.frequencyRank : Number.MAX_SAFE_INTEGER;
}

function buildTargetLearnerFitRisks({ scope = {}, sameWrittenConflicts = [] } = {}) {
    const risks = [];
    if ((scope.harderKanji || []).length > 0) {
        risks.push(`harder support kanji ${scope.harderKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(", ")}`);
    }
    if ((scope.outsideJlptKanji || []).length > 0) {
        risks.push(`outside-JLPT kanji ${scope.outsideJlptKanji.map((entry) => entry.kanji).join(", ")}`);
    }
    if ((sameWrittenConflicts || []).length > 0) {
        risks.push("same-written alternate already tracked");
    }
    return risks;
}

function buildSupportLabelNeeds({ kanjiLevels = [], targetLevel = null } = {}) {
    const needs = [];
    for (const entry of kanjiLevels || []) {
        if (!entry?.kanji) {
            continue;
        }
        if (!Number.isInteger(entry.level)) {
            needs.push(`outside-JLPT support kanji ${entry.kanji}`);
            continue;
        }
        if (Number.isInteger(targetLevel) && entry.level < targetLevel) {
            needs.push(`harder support kanji ${entry.kanji}=N${entry.level}`);
        }
    }
    return needs;
}

function classifyRoutedMoveCandidateRow({ sourceRow = {}, targetGate = {} } = {}) {
    if (targetGate.active === false) {
        return "queue_inactive_reading_expansion";
    }
    if (sourceRow.cleanIdentity === false || (sourceRow.identityRisks || []).length > 0) {
        return "blocked_identity";
    }
    if (!sourceRow.dictionaryVerified) {
        return "blocked_missing_dictionary";
    }
    if (!sourceRow.frequencySupported) {
        return "blocked_missing_commonness";
    }
    return "needs_triage";
}

function buildRoutedMoveCandidateRow({ sourceRow = {}, targetLevel, targetGate = {}, jlptLevelContract = {} } = {}) {
    const scope = classifyKanjiScope(sourceRow, { targetLevel, jlptLevelContract });
    const triageDecision = sourceRow.triageDecision || null;
    const sameWrittenConflicts = sourceRow.sameWrittenConflicts || [];
    const routedRow = {
        ...sourceRow,
        selectorStatus: classifyRoutedMoveCandidateRow({ sourceRow, targetGate }),
        sourceDisposition: "routed_move_candidate",
        sourceReason: `source-level move_candidate routed this row to N${targetLevel}; physical target-level starter/contract placement is still missing`,
        targetLevel,
        routedFromLevel: sourceRow.targetLevel || sourceRow.sourceLevel || null,
        routedFromSourceLevel: sourceRow.sourceLevel || null,
        routedFromSourceIds: sourceRow.sourceIds || [],
        targetKanji: scope.targetKanji.map((entry) => entry.kanji),
        constituentKanji: scope.constituentKanji,
        kanjiLevels: scope.kanjiLevels,
        learnerFitRisks: buildTargetLearnerFitRisks({ scope, sameWrittenConflicts }),
        triageDecision,
        sourceTriageDecision: triageDecision,
        routing: {
            type: "move_candidate_target_queue",
            sourceLevel: sourceRow.targetLevel || null,
            sourceJlptLevel: sourceRow.sourceLevel || null,
            targetLevel,
            decision: triageDecision?.decision || "",
            reason: triageDecision?.reason || "",
        },
    };
    return {
        ...routedRow,
        learnerUtility: buildLearnerUtilityScore(routedRow, { scope, sameWrittenConflicts }),
    };
}

function mergeRoutedMoveCandidatesIntoTargetReport({
    targetReport,
    sourceReports = [],
    jlptLevelContract = {},
    limit = 40,
} = {}) {
    if (!targetReport) {
        return targetReport;
    }
    const targetLevel = targetReport.level;
    const rowsByKey = new Map((targetReport.rows || []).map((row) => [row.key, row]));
    const routedRows = [];
    const routedSummary = {
        totalMoveCandidatesToTarget: 0,
        alreadyGovernedOrExcluded: 0,
        alreadyVisibleInTargetRows: 0,
        targetQueueRows: 0,
        addedTargetQueueRows: 0,
    };

    for (const sourceReport of sourceReports || []) {
        if (!sourceReport || sourceReport.level === targetLevel) {
            continue;
        }
        for (const sourceRow of sourceReport.rows || []) {
            const triageDecision = sourceRow.triageDecision || null;
            if (triageDecision?.decision !== "move_candidate" || triageDecision.targetLevel !== targetLevel) {
                continue;
            }
            routedSummary.totalMoveCandidatesToTarget += 1;

            const contractStatus = sourceRow.contractStatus?.status || "not_governed";
            if (contractStatus === "already_governed" || contractStatus === "already_excluded") {
                routedSummary.alreadyGovernedOrExcluded += 1;
                continue;
            }
            if (rowsByKey.has(sourceRow.key)) {
                const existingRow = rowsByKey.get(sourceRow.key);
                existingRow.sourceTriageDecision = existingRow.sourceTriageDecision || triageDecision;
                existingRow.routing = existingRow.routing || {
                    type: "move_candidate_target_queue",
                    sourceLevel: sourceReport.level,
                    sourceJlptLevel: sourceRow.sourceLevel || null,
                    targetLevel,
                    decision: triageDecision.decision,
                    reason: triageDecision.reason || "",
                };
                routedSummary.alreadyVisibleInTargetRows += 1;
                routedSummary.targetQueueRows += 1;
                continue;
            }

            const routedRow = buildRoutedMoveCandidateRow({
                sourceRow,
                targetLevel,
                targetGate: targetReport.commonWordQueue || {},
                jlptLevelContract,
            });
            rowsByKey.set(routedRow.key, routedRow);
            routedRows.push(routedRow);
            routedSummary.targetQueueRows += 1;
            routedSummary.addedTargetQueueRows += 1;
        }
    }

    if (routedSummary.totalMoveCandidatesToTarget === 0) {
        return {
            ...targetReport,
            routedMoveCandidateSummary: routedSummary,
            routedMoveCandidateRows: [],
        };
    }

    const rows = [...rowsByKey.values()].sort(compareSelectorRows);
    const mergedSummary = {
        ...targetReport.summary,
        ...summarizeSelectorRows(rows),
        sourceRows: targetReport.summary.sourceRows,
        normalizedRows: targetReport.summary.normalizedRows,
        uniqueRows: targetReport.summary.uniqueRows,
        duplicateSourceRows: targetReport.summary.duplicateSourceRows,
        sourceDispositionCounts: {
            ...(targetReport.summary.sourceDispositionCounts || {}),
            routed_move_candidate: routedSummary.addedTargetQueueRows,
        },
        routedMoveCandidateRows: routedSummary.targetQueueRows,
        addedRoutedMoveCandidateRows: routedSummary.addedTargetQueueRows,
    };
    return {
        ...targetReport,
        summary: mergedSummary,
        rows,
        shownRows: rows.slice(0, limit),
        fallbackSourceGate: buildFallbackSourceGate({
            level: targetLevel,
            commonWordQueue: targetReport.commonWordQueue || {},
            summary: mergedSummary,
        }),
        routedMoveCandidateSummary: routedSummary,
        routedMoveCandidateRows: routedRows.sort(compareSelectorRows),
    };
}

function buildAgreementRowIndex(agreementLevelReport = {}) {
    return new Map((agreementLevelReport.rows || []).map((row) => [row.key, row]));
}

function buildSelectorRow({ expansionRow = {}, agreementRow = null, sourceUniverse = {} } = {}) {
    const selectorStatus = classifyCommonExpansionSelectorRow({ expansionRow, agreementRow });
    const sourceAppearance = (agreementRow?.sourceAppearances || [])
        .find((appearance) => appearance.sourceId === sourceUniverse.sourceId) || null;
    const frequencyRanks = (agreementRow?.sourceAppearances || [])
        .map((appearance) => appearance.frequencyRank)
        .filter((rank) => Number.isInteger(rank) && rank > 0);
    const frequencyEvidence = buildSelectorFrequencyEvidence({ expansionRow, agreementRow });
    const primaryFrequencyEvidence = frequencyEvidence.primary || null;
    const targetLevel = expansionRow.targetLevel || agreementRow?.targetLevel || null;
    const kanjiLevels = expansionRow.kanjiLevels || agreementRow?.kanjiLevels || [];
    const sameWrittenConflicts = agreementRow?.sameWrittenConflicts || expansionRow.sameWrittenContractEntries || [];
    const learnerFitRisks = agreementRow?.learnerFitRisks || [];
    const reviewReadiness = agreementRow?.reviewReadiness || {
        supportedEvidenceCount: 0,
        supportedEvidenceTotal: 5,
        nextEvidenceCount: 0,
        learnerFitRiskCount: 0,
        sameWrittenConflictCount: 0,
        identityRiskCount: 0,
    };
    const selectorRow = {
        key: expansionRow.key,
        written: expansionRow.written,
        reading: expansionRow.reading,
        meaning: expansionRow.meaning || agreementRow?.meaning || "",
        notes: expansionRow.notes || sourceAppearance?.notes || "",
        selectorStatus,
        sourceDisposition: expansionRow.disposition,
        sourceReason: expansionRow.reason,
        targetLevel,
        sourceLevel: expansionRow.sourceLevel ?? sourceAppearance?.sourceLevel ?? null,
        sourceIds: agreementRow?.sourceIds || [sourceUniverse.sourceId].filter(Boolean),
        sourceAppearances: agreementRow?.sourceAppearances || [],
        sourceLane: sourceUniverse.sourceLane || SOURCE_LANE_CONFIGURED,
        sourceLaneLabel: sourceUniverse.sourceLaneLabel || SOURCE_LANE_CONFIGURED_LABEL,
        sourcePool: sourceUniverse.sourcePool || sourceUniverse.sourceLane || SOURCE_LANE_CONFIGURED,
        sourcePoolLabel: sourceUniverse.sourcePoolLabel || sourceUniverse.sourceLaneLabel || SOURCE_LANE_CONFIGURED_LABEL,
        extraSource: sourceUniverse.extraSource === true,
        sourceLevelClaimStatus: sourceUniverse.levelClaimStatus || SOURCE_LEVEL_CLAIM_STATUS,
        sourceLevelClaimLabel: sourceUniverse.levelClaimLabel || SOURCE_LEVEL_CLAIM_LABEL,
        sourceLevelClaimWarning: sourceUniverse.levelClaimWarning || SOURCE_LEVEL_CLAIM_WARNING,
        dictionaryVerified: Boolean(agreementRow?.dictionaryVerified),
        frequencySupported: Boolean(agreementRow?.frequencySupported),
        sentenceSupported: Boolean(agreementRow?.sentenceSupported),
        pitchSupported: Boolean(agreementRow?.pitchSupported),
        frequencyRank: Number.isInteger(sourceAppearance?.frequencyRank)
            ? sourceAppearance.frequencyRank
            : (frequencyRanks.length > 0
                ? Math.min(...frequencyRanks)
                : (Number.isInteger(primaryFrequencyEvidence?.frequencyRank) ? primaryFrequencyEvidence.frequencyRank : null)),
        frequencyRankSource: primaryFrequencyEvidence?.source || sourceAppearance?.frequencyRankSource || "",
        frequencyEvidence,
        frequencyBand: normalizeFrequencyEvidenceBand(primaryFrequencyEvidence?.frequencyBand),
        frequencyMatchStatus: normalizeFrequencyMatchStatus(primaryFrequencyEvidence?.frequencyMatchStatus) || "missing",
        tubelexRank: primaryFrequencyEvidence?.tubelexRank ?? null,
        tubelexCount: primaryFrequencyEvidence?.tubelexCount ?? null,
        tubelexVideoCount: primaryFrequencyEvidence?.tubelexVideoCount ?? null,
        tubelexChannelCount: primaryFrequencyEvidence?.tubelexChannelCount ?? null,
        tubelexDispersionScore: primaryFrequencyEvidence?.tubelexDispersionScore ?? null,
        tubelexCategoryConcentration: primaryFrequencyEvidence?.tubelexCategoryConcentration ?? null,
        frequencyReason: primaryFrequencyEvidence?.frequencyReason || "",
        cleanIdentity: Boolean(agreementRow?.cleanIdentity) || expansionRow.disposition === "review_candidate",
        identityRisks: agreementRow?.identityRisks || [],
        learnerFitRisks,
        sameWrittenConflicts,
        sameWrittenSourceConflicts: expansionRow.sameWrittenSourceConflicts || [],
        triageDecision: expansionRow.triageDecision || agreementRow?.triageDecisions?.[0] || null,
        sourceTriageDecision: null,
        contractStatus: agreementRow?.contractStatus || null,
        targetKanji: expansionRow.targetKanji || agreementRow?.targetKanji || [],
        constituentKanji: expansionRow.constituentKanji || [],
        kanjiLevels,
        supportLabelNeeds: buildSupportLabelNeeds({ kanjiLevels, targetLevel }),
        reviewReadiness,
        nextRequiredEvidence: agreementRow?.nextRequiredEvidence || [],
        learnerValueBucket: expansionRow.learnerValueBucket || "",
        learnerValueBucketLabel: expansionRow.learnerValueBucketLabel || "",
        learnerValueReviewable: expansionRow.learnerValueReviewable,
        learnerValueAuditOnly: expansionRow.learnerValueAuditOnly,
        learnerValueFamilyKey: expansionRow.learnerValueFamilyKey || "",
        learnerValueFamilyType: expansionRow.learnerValueFamilyType || "",
        learnerValueFamilyLabel: expansionRow.learnerValueFamilyLabel || "",
        learnerValueFamilyRank: expansionRow.learnerValueFamilyRank,
        learnerValueFamilyCap: expansionRow.learnerValueFamilyCap,
        learnerValueReasons: expansionRow.learnerValueReasons || [],
    };
    return {
        ...selectorRow,
        learnerUtility: buildLearnerUtilityScore(selectorRow, { sameWrittenConflicts }),
    };
}

function isDictionaryCommonPoolSource(source = {}) {
    return source.extraSourcePool === SOURCE_POOL_DICTIONARY_COMMON
        || source.commonPool?.type === SOURCE_POOL_DICTIONARY_COMMON
        || source.sourceType === SOURCE_POOL_DICTIONARY_COMMON;
}

function hasCommonPoolMeaningNoise(row = {}) {
    return COMMON_POOL_MEANING_NOISE_RE.test(String(row.meaning || ""));
}

function getDictionaryCommonPoolSourcePriority(row = {}) {
    let priority = 0;
    if (hasCommonPoolNumericExpressionWrittenForm(row)) {
        priority += 30;
    }
    if (hasCommonPoolProperOrSpecializedPrioritySignal(row)) {
        priority += 20;
    }
    const writtenLength = [...String(row.written || "")].length;
    if (writtenLength >= 5) {
        priority += 4;
    } else if (writtenLength === 4) {
        priority += 2;
    }
    return priority;
}

function getCommonPoolLearnerValueBucketPriority(row = {}) {
    return COMMON_POOL_LEARNER_VALUE_BUCKET_PRIORITY[row.learnerValueBucket] ?? 99;
}

function compareDictionaryCommonPoolSourceRows(a = {}, b = {}) {
    return (
        getCommonPoolLearnerValueBucketPriority(a) - getCommonPoolLearnerValueBucketPriority(b)
        || Number(Boolean(a.learnerValueAuditOnly)) - Number(Boolean(b.learnerValueAuditOnly))
        || getLearnerUtilityComparableScore(b) - getLearnerUtilityComparableScore(a)
        || getJmdictNfRank(a) - getJmdictNfRank(b)
        || getDictionaryCommonPoolSourcePriority(a) - getDictionaryCommonPoolSourcePriority(b)
        || getComparableFrequencyRank(a) - getComparableFrequencyRank(b)
        || getWrittenShapePriority(a) - getWrittenShapePriority(b)
        || String(a.written || "").localeCompare(String(b.written || ""), "ja")
        || String(a.reading || "").localeCompare(String(b.reading || ""), "ja")
    );
}

function formatTargetKanjiSignature(scope = {}) {
    const targetKanji = (scope.targetKanji || [])
        .map((entry) => (typeof entry === "string" ? entry : entry?.kanji))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ja"));
    return targetKanji.length > 0 ? targetKanji.join("") : "no-target";
}

function getCommonPoolSemanticFamilyType(row = {}) {
    const meaning = String(row.meaning || "");
    if (COMMON_POOL_TIME_FAMILY_RE.test(meaning)) {
        return "time_calendar";
    }
    if (COMMON_POOL_PERSON_FAMILY_RE.test(meaning)) {
        return "person_social";
    }
    if (COMMON_POOL_PLACE_FAMILY_RE.test(meaning)) {
        return "place_travel";
    }
    if (COMMON_POOL_LEARNING_FAMILY_RE.test(meaning)) {
        return "learning_language";
    }
    if (COMMON_POOL_BODY_HEALTH_FAMILY_RE.test(meaning)) {
        return "body_health";
    }
    if (COMMON_POOL_FOOD_DAILY_FAMILY_RE.test(meaning)) {
        return "food_daily_life";
    }
    if (COMMON_POOL_WORK_BUSINESS_FAMILY_RE.test(meaning)) {
        return "work_business";
    }
    if (hasCommonPoolNumericExpressionWrittenForm(row)) {
        return "number_quantity";
    }
    return "target_kanji_family";
}

function buildCommonPoolLearnerFamily(row = {}, scope = {}) {
    const type = getCommonPoolSemanticFamilyType(row);
    const targetSignature = formatTargetKanjiSignature(scope);
    return {
        type,
        targetSignature,
        key: `${type}:${targetSignature}`,
        label: `${type.replace(/_/gu, " ")} / ${targetSignature}`,
        cap: COMMON_POOL_FAMILY_REVIEW_CAPS[type] || COMMON_POOL_FAMILY_DEFAULT_REVIEW_CAP,
    };
}

function hasSupportLabelNeed(scope = {}) {
    return (scope.harderKanji || []).length > 0 || (scope.outsideJlptKanji || []).length > 0;
}

function getFrequencyBandForRow(row = {}) {
    return normalizeFrequencyEvidenceBand(row.frequencyBand || getPrimaryFrequencyEvidence(row)?.frequencyBand);
}

function isStrongCommonPoolFamilyException(row = {}) {
    const rank = getComparableFrequencyRank(row);
    const score = getLearnerUtilityComparableScore(row);
    return (
        rank <= 100
        && score >= 80
        && !hasLearnerUtilitySpecializedOrProperSignal(row)
        && !hasCommonPoolNumericExpressionWrittenForm(row)
        && (row.sameWrittenSourceConflicts || []).length === 0
        && (row.sameWrittenConflicts || []).length === 0
    );
}

function buildCommonPoolLearnerValueClassification(row = {}, {
    familyRank = 1,
    familyCap = COMMON_POOL_FAMILY_DEFAULT_REVIEW_CAP,
    scope = {},
} = {}) {
    const score = getLearnerUtilityComparableScore(row);
    const frequencyBand = getFrequencyBandForRow(row);
    const sameWrittenSourceConflictCount = (row.sameWrittenSourceConflicts || []).length;
    const sameWrittenContractConflictCount = (row.sameWrittenConflicts || []).length;
    const supportLabelNeeded = hasSupportLabelNeed(scope);
    const reasons = [];
    let bucket;

    if (
        score < 50
        || frequencyBand === "poor"
        || frequencyBand === "missing"
        || row.cleanIdentity === false
    ) {
        bucket = "raw_audit_low_fit";
        reasons.push("low learner-utility, weak frequency, missing frequency, or identity risk keeps this row audit-only");
    } else if (hasLearnerUtilitySpecializedOrProperSignal(row)) {
        bucket = "domain_narrow";
        reasons.push("specialized or proper-noun signal keeps this row audit-only by default");
    } else if (familyRank > familyCap && !isStrongCommonPoolFamilyException(row)) {
        bucket = "redundant_family_member";
        reasons.push(`family rank ${familyRank} exceeds review cap ${familyCap}`);
    } else if (sameWrittenSourceConflictCount > 0 || sameWrittenContractConflictCount > 0) {
        bucket = "same_written_ambiguity";
        reasons.push("same written form has competing readings or governed/source-pool alternatives");
    } else if (supportLabelNeeded) {
        bucket = "support_label_candidate";
        reasons.push("useful candidate with harder or outside-JLPT support kanji label needs");
    } else if (score >= 80) {
        bucket = "core_candidate";
        reasons.push("high learner utility with target-level kanji and no support-label or duplicate risk");
    } else {
        bucket = "family_representative";
        reasons.push("reviewable representative for this target-kanji learner family");
    }

    const reviewable = !COMMON_POOL_AUDIT_ONLY_BUCKETS.has(bucket);
    return {
        learnerValueBucket: bucket,
        learnerValueBucketLabel: COMMON_POOL_LEARNER_VALUE_BUCKET_LABELS[bucket] || bucket,
        learnerValueReviewable: reviewable,
        learnerValueAuditOnly: !reviewable,
        learnerValueFamilyRank: familyRank,
        learnerValueFamilyCap: familyCap,
        learnerValueReasons: reasons,
    };
}

function hasDigitWrittenForm(row = {}) {
    return DIGIT_WRITTEN_PATTERN.test(String(row.written || ""));
}

function hasLatinWrittenForm(row = {}) {
    return LATIN_WRITTEN_PATTERN.test(String(row.written || ""));
}

function hasCommonnessRank(row = {}) {
    return Number.isInteger(row.frequencyRank) && row.frequencyRank > 0;
}

function getCommonPoolFrequencySupportSourceIds(source = {}) {
    return Array.isArray(source.commonPool?.frequencySourceIds)
        ? source.commonPool.frequencySourceIds.filter(Boolean)
        : [];
}

function sourceCanProvideFrequencySupport(source = {}) {
    return source.status === "active"
        && source.licenseUse?.status === "approved"
        && (
            sourceAllows(source, "frequency-sanity")
            || sourceAllows(source, "usefulness-support")
        );
}

function buildFrequencySupportRowIndex({
    sourceRows = [],
    sourceId = "",
} = {}) {
    const rowsByKey = new Map();
    const normalizedRows = sourceRows
        .flatMap((row) => normalizeCandidateSourceRows(row, { sourceLabel: sourceId }))
        .filter((row) => hasCommonnessRank(row) || collectFrequencyEvidenceFromRow(row).length > 0);

    for (const row of normalizedRows) {
        const existing = rowsByKey.get(row.key);
        if (!existing || compareFrequencySupportRows(row, existing) < 0) {
            rowsByKey.set(row.key, row);
        }
    }

    return {
        rowsByKey,
        normalizedRows,
    };
}

function compareFrequencySupportRows(a = {}, b = {}) {
    const aPrimary = getPrimaryFrequencyEvidence(a) || {};
    const bPrimary = getPrimaryFrequencyEvidence(b) || {};
    return (
        compareFrequencyEvidence(aPrimary, bPrimary)
        || getComparableFrequencyRank(a) - getComparableFrequencyRank(b)
    );
}

function loadCommonPoolFrequencySupportRows({
    source = {},
    manifest = {},
    readFile = fs.readFileSync,
} = {}) {
    const frequencySourceIds = getCommonPoolFrequencySupportSourceIds(source);
    const rowsByKey = new Map();
    const blockers = [];
    const sources = [];
    const summary = {
        frequencySourceIds,
        loadedSourceCount: 0,
        loadedRows: 0,
        normalizedRows: 0,
        rowsWithSupport: 0,
        sources,
    };

    for (const frequencySourceId of frequencySourceIds) {
        const supportSource = manifest.sources?.[frequencySourceId] || null;
        if (!supportSource) {
            blockers.push(`${frequencySourceId}: missing frequency support source in word source manifest`);
            continue;
        }
        if (!sourceCanProvideFrequencySupport(supportSource)) {
            blockers.push(`${frequencySourceId}: frequency support source must be active, approved, and limited to frequency/usefulness support`);
            continue;
        }
        const supportPath = path.resolve(process.cwd(), supportSource.local?.path || "");
        if (!supportSource.local?.path || !fs.existsSync(supportPath)) {
            blockers.push(`${frequencySourceId}: missing local frequency support file ${supportSource.local?.path || "(missing path)"}`);
            continue;
        }
        const supportBuffer = readFile(supportPath);
        const buffer = Buffer.isBuffer(supportBuffer) ? supportBuffer : Buffer.from(String(supportBuffer || ""), "utf8");
        const sourceRows = parseCandidateSourceText(buffer.toString("utf8"), {
            format: supportSource.local.format || "auto",
        });
        const integrity = buildSourceFileIntegrity({ sourceBuffer: buffer, sourceRows });
        const integrityBlockers = validateSourceIntegrity(supportSource, integrity);
        if (integrityBlockers.length > 0) {
            blockers.push(...integrityBlockers.map((blocker) => `${frequencySourceId}: ${blocker}`));
            continue;
        }
        const indexed = buildFrequencySupportRowIndex({ sourceRows, sourceId: frequencySourceId });
        for (const [key, row] of indexed.rowsByKey.entries()) {
            const existing = rowsByKey.get(key);
            if (!existing || compareFrequencySupportRows(row, existing) < 0) {
                rowsByKey.set(key, row);
            }
        }
        summary.loadedSourceCount += 1;
        summary.loadedRows += sourceRows.length;
        summary.normalizedRows += indexed.normalizedRows.length;
        summary.rowsWithSupport = rowsByKey.size;
        sources.push({
            sourceId: frequencySourceId,
            localPath: supportSource.local.path,
            rowCount: integrity.rowCount,
            sha256: integrity.sha256,
            byteSize: integrity.byteSize,
            licenseStatus: supportSource.licenseUse?.status || "",
            allowedUse: supportSource.allowedUse || [],
        });
    }

    return {
        rowsByKey,
        blockers,
        summary,
    };
}

function mergeFrequencySupportRow(baseRow = {}, supportRow = null) {
    if (!supportRow) {
        return baseRow;
    }
    const supportEvidence = collectFrequencyEvidenceFromRow(supportRow);
    const baseEvidence = collectFrequencyEvidenceFromRow(baseRow);
    const useSupportRank = !hasCommonnessRank(baseRow) && hasCommonnessRank(supportRow);
    const supportEvidenceSource = supportEvidence[0]?.source || supportRow.frequencyEvidenceSource || supportRow.frequencyRankSource || supportRow.source || "";
    return {
        ...baseRow,
        frequencyRank: useSupportRank ? supportRow.frequencyRank : baseRow.frequencyRank,
        frequencyRankSource: useSupportRank ? (supportRow.frequencyRankSource || supportRow.source || "") : (baseRow.frequencyRankSource || ""),
        frequencyEvidenceSource: supportEvidenceSource,
        frequencyEvidence: [...baseEvidence, ...supportEvidence],
        frequencyBand: supportRow.frequencyBand || baseRow.frequencyBand || "",
        frequencyMatchStatus: supportRow.frequencyMatchStatus || baseRow.frequencyMatchStatus || "",
        tubelexRank: supportRow.tubelexRank ?? baseRow.tubelexRank,
        tubelexCount: supportRow.tubelexCount ?? baseRow.tubelexCount,
        tubelexVideoCount: supportRow.tubelexVideoCount ?? baseRow.tubelexVideoCount,
        tubelexChannelCount: supportRow.tubelexChannelCount ?? baseRow.tubelexChannelCount,
        tubelexDispersionScore: supportRow.tubelexDispersionScore ?? baseRow.tubelexDispersionScore,
        tubelexCategoryConcentration: supportRow.tubelexCategoryConcentration ?? baseRow.tubelexCategoryConcentration,
        frequencyReason: supportRow.frequencyReason || baseRow.frequencyReason || "",
    };
}

function isAlreadyGovernedOrExcluded(row = {}, jlptWordLevelContract = {}) {
    return Boolean(
        jlptWordLevelContract.wordLevels?.[row.key]
        || jlptWordLevelContract.excludedWordLevels?.[row.key]
    );
}

function filterDictionaryCommonPoolRows({
    sourceRows = [],
    frequencySupportRowsByKey = new Map(),
    frequencySupportSummary = null,
    sourceId = DICTIONARY_COMMON_POOL_SOURCE_ID,
    targetLevel,
    source = {},
    jlptLevelContract = {},
    jlptWordLevelContract = {},
} = {}) {
    const maxFrequencyRank = Number.isInteger(source.commonPool?.maxFrequencyRank)
        ? source.commonPool.maxFrequencyRank
        : null;
    const qualityMode = normalizeCommonPoolQualityMode(source.commonPool?.qualityMode);
    const editorialQueueLimit = qualityMode === COMMON_POOL_QUALITY_MODE_RAW
        ? null
        : normalizeCommonPoolEditorialQueueLimit(source.commonPool?.editorialQueueLimit);
    const normalizedRows = sourceRows
        .flatMap((row) => normalizeCandidateSourceRows(row, { sourceLabel: sourceId }))
        .map((row) => mergeFrequencySupportRow(row, frequencySupportRowsByKey.get(row.key) || null))
        .filter(Boolean);
    const sourceRowsByWritten = buildSameWrittenSourceRowsByWritten(normalizedRows);
    const rows = [];
    const filteredCounts = {
        sourceRows: normalizedRows.length,
        qualityMode,
        editorialQueueLimit,
        eligibleRowsBeforeEditorialFilter: 0,
        editorialQueueRows: 0,
        deprioritizedByEditorialQueueLimit: 0,
        missingCommonness: 0,
        aboveMaxFrequencyRank: 0,
        kanaOnly: 0,
        noTargetKanji: 0,
        alreadyGovernedOrExcluded: 0,
        meaningNoise: 0,
        digitWrittenForm: 0,
        latinWrittenForm: 0,
        kanjiNumericExpressionRows: 0,
        properOrSpecializedPriorityRows: 0,
        frequencySupportSourceIds: getCommonPoolFrequencySupportSourceIds(source),
        frequencySupportLoadedSourceCount: frequencySupportSummary?.loadedSourceCount ?? 0,
        frequencySupportLoadedRows: frequencySupportSummary?.loadedRows ?? 0,
        frequencySupportRowsWithSupport: frequencySupportSummary?.rowsWithSupport ?? 0,
        frequencySupportMatchedRows: 0,
        frequencyBandCounts: Object.fromEntries(FREQUENCY_EVIDENCE_BANDS.map((band) => [band, 0])),
        outsideJlptSupportRows: 0,
        harderSupportKanjiRows: 0,
        outsideJlptSupportRowsInQueue: 0,
        harderSupportKanjiRowsInQueue: 0,
        targetOnlyRows: 0,
        targetOnlyRowsInQueue: 0,
        outsideJlptSupportPolicy: "label_not_deprioritize",
        learnerValueBucketCounts: Object.fromEntries(COMMON_POOL_LEARNER_VALUE_BUCKETS.map((bucket) => [bucket, 0])),
        learnerValueBucketCountsInQueue: Object.fromEntries(COMMON_POOL_LEARNER_VALUE_BUCKETS.map((bucket) => [bucket, 0])),
        reviewableRowsBeforeEditorialFilter: 0,
        auditOnlyRowsBeforeEditorialFilter: 0,
        auditOnlyRowsExcludedFromEditorialQueue: 0,
    };

    for (const row of normalizedRows) {
        if (!hasCommonnessRank(row)) {
            filteredCounts.missingCommonness += 1;
            continue;
        }
        if (Number.isInteger(maxFrequencyRank) && row.frequencyRank > maxFrequencyRank) {
            filteredCounts.aboveMaxFrequencyRank += 1;
            continue;
        }
        const scope = classifyKanjiScope(row, { targetLevel, jlptLevelContract });
        if (scope.constituentKanji.length === 0) {
            filteredCounts.kanaOnly += 1;
            continue;
        }
        if (scope.targetKanji.length === 0) {
            filteredCounts.noTargetKanji += 1;
            continue;
        }
        if (isAlreadyGovernedOrExcluded(row, jlptWordLevelContract)) {
            filteredCounts.alreadyGovernedOrExcluded += 1;
            continue;
        }
        if (hasDigitWrittenForm(row)) {
            filteredCounts.digitWrittenForm += 1;
            continue;
        }
        if (hasLatinWrittenForm(row)) {
            filteredCounts.latinWrittenForm += 1;
            continue;
        }
        if (hasCommonPoolMeaningNoise(row)) {
            filteredCounts.meaningNoise += 1;
            continue;
        }
        if (hasCommonPoolNumericExpressionWrittenForm(row)) {
            filteredCounts.kanjiNumericExpressionRows += 1;
        }
        if (hasCommonPoolProperOrSpecializedPrioritySignal(row)) {
            filteredCounts.properOrSpecializedPriorityRows += 1;
        }
        if (collectFrequencyEvidenceFromRow(row).length > 0) {
            filteredCounts.frequencySupportMatchedRows += 1;
        }
        const frequencyBand = normalizeFrequencyEvidenceBand(row.frequencyBand || getPrimaryFrequencyEvidence(row)?.frequencyBand);
        filteredCounts.frequencyBandCounts[frequencyBand] = (filteredCounts.frequencyBandCounts[frequencyBand] || 0) + 1;
        if (scope.outsideJlptKanji.length > 0) {
            filteredCounts.outsideJlptSupportRows += 1;
        }
        if (scope.harderKanji.length > 0) {
            filteredCounts.harderSupportKanjiRows += 1;
        }
        if (scope.outsideJlptKanji.length === 0 && scope.harderKanji.length === 0) {
            filteredCounts.targetOnlyRows += 1;
        }
        const sameWrittenConflicts = findSameWrittenContractConflicts(row, jlptWordLevelContract);
        const sameWrittenSourceConflicts = findSameWrittenSourceConflicts(row, sourceRowsByWritten);
        rows.push({
            ...row,
            sameWrittenSourceConflicts,
            commonPoolLearnerFamily: buildCommonPoolLearnerFamily(row, scope),
            learnerUtility: buildLearnerUtilityScore({
                ...row,
                sourcePool: SOURCE_POOL_DICTIONARY_COMMON,
                targetLevel,
                targetKanji: scope.targetKanji.map((entry) => entry.kanji),
                constituentKanji: scope.constituentKanji,
                kanjiLevels: scope.kanjiLevels,
                harderKanji: scope.harderKanji,
                outsideJlptKanji: scope.outsideJlptKanji.map((entry) => entry.kanji),
                sameWrittenConflicts,
                sameWrittenSourceConflicts,
                dictionaryVerified: true,
                frequencySupported: true,
                cleanIdentity: true,
            }, { scope, sameWrittenConflicts }),
        });
    }

    const prelimSortedRows = [...rows].sort(compareDictionaryCommonPoolSourceRows);
    const familyRanks = new Map();
    const rowsWithLearnerValueBuckets = prelimSortedRows.map((row) => {
        const family = row.commonPoolLearnerFamily || buildCommonPoolLearnerFamily(row, classifyKanjiScope(row, { targetLevel, jlptLevelContract }));
        const familyRank = (familyRanks.get(family.key) || 0) + 1;
        familyRanks.set(family.key, familyRank);
        const classification = buildCommonPoolLearnerValueClassification(row, {
            familyRank,
            familyCap: family.cap,
            scope: classifyKanjiScope(row, { targetLevel, jlptLevelContract }),
        });
        filteredCounts.learnerValueBucketCounts[classification.learnerValueBucket] = (
            filteredCounts.learnerValueBucketCounts[classification.learnerValueBucket] || 0
        ) + 1;
        if (classification.learnerValueReviewable) {
            filteredCounts.reviewableRowsBeforeEditorialFilter += 1;
        } else {
            filteredCounts.auditOnlyRowsBeforeEditorialFilter += 1;
        }
        return {
            ...row,
            ...classification,
            learnerValueFamilyKey: family.key,
            learnerValueFamilyType: family.type,
            learnerValueFamilyLabel: family.label,
        };
    });

    const sortedRows = rowsWithLearnerValueBuckets.sort(compareDictionaryCommonPoolSourceRows);
    const reviewableSortedRows = qualityMode === COMMON_POOL_QUALITY_MODE_RAW
        ? sortedRows
        : sortedRows.filter((row) => row.learnerValueReviewable !== false);
    const editorialRows = Number.isInteger(editorialQueueLimit)
        ? reviewableSortedRows.slice(0, editorialQueueLimit)
        : reviewableSortedRows;
    filteredCounts.eligibleRowsBeforeEditorialFilter = sortedRows.length;
    filteredCounts.editorialQueueRows = editorialRows.length;
    filteredCounts.deprioritizedByEditorialQueueLimit = Math.max(0, reviewableSortedRows.length - editorialRows.length);
    filteredCounts.auditOnlyRowsExcludedFromEditorialQueue = qualityMode === COMMON_POOL_QUALITY_MODE_RAW
        ? 0
        : filteredCounts.auditOnlyRowsBeforeEditorialFilter;
    for (const row of editorialRows) {
        const scope = classifyKanjiScope(row, { targetLevel, jlptLevelContract });
        filteredCounts.learnerValueBucketCountsInQueue[row.learnerValueBucket] = (
            filteredCounts.learnerValueBucketCountsInQueue[row.learnerValueBucket] || 0
        ) + 1;
        if (scope.outsideJlptKanji.length > 0) {
            filteredCounts.outsideJlptSupportRowsInQueue += 1;
        }
        if (scope.harderKanji.length > 0) {
            filteredCounts.harderSupportKanjiRowsInQueue += 1;
        }
        if (scope.outsideJlptKanji.length === 0 && scope.harderKanji.length === 0) {
            filteredCounts.targetOnlyRowsInQueue += 1;
        }
    }

    return {
        rows: editorialRows,
        filteredCounts,
    };
}

function loadSourceRows({
    sourceId,
    source,
    manifest = {},
    level = null,
    jlptLevelContract = {},
    jlptWordLevelContract = {},
    readFile = fs.readFileSync,
} = {}) {
    const sourcePath = path.resolve(process.cwd(), source.local?.path || "");
    if (!source.local?.path || !fs.existsSync(sourcePath)) {
        return {
            sourceRows: [],
            integrity: null,
            blockers: [`${sourceId}: missing local source file ${source.local?.path || "(missing path)"}`],
        };
    }

    const sourceBuffer = readFile(sourcePath);
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(String(sourceBuffer || ""), "utf8");
    const parsedSourceRows = parseCandidateSourceText(buffer.toString("utf8"), {
        format: source.local.format || "auto",
    });
    const integrity = buildSourceFileIntegrity({ sourceBuffer: buffer, sourceRows: parsedSourceRows });
    const blockers = validateSourceIntegrity(source, integrity).map((blocker) => `${sourceId}: ${blocker}`);
    const frequencySupport = isDictionaryCommonPoolSource(source) && Number.isInteger(level)
        ? loadCommonPoolFrequencySupportRows({ source, manifest, readFile })
        : null;
    blockers.push(...(frequencySupport?.blockers || []));
    const commonPool = isDictionaryCommonPoolSource(source) && Number.isInteger(level)
        ? filterDictionaryCommonPoolRows({
            sourceRows: parsedSourceRows,
            frequencySupportRowsByKey: frequencySupport?.rowsByKey || new Map(),
            frequencySupportSummary: frequencySupport?.summary || null,
            sourceId,
            targetLevel: level,
            source,
            jlptLevelContract,
            jlptWordLevelContract,
        })
        : null;

    return {
        sourceRows: commonPool?.rows || parsedSourceRows,
        integrity,
        effectiveRowCount: commonPool?.rows.length ?? integrity.rowCount,
        commonPoolSummary: commonPool?.filteredCounts || null,
        frequencySupportSummary: frequencySupport?.summary || null,
        blockers,
    };
}

function buildLevelSelectorReport({
    level,
    manifest,
    sourceSummariesById,
    agreementLevelReport,
    jlptLevelContract,
    jlptWordLevelContract,
    triageDecisionsByLevelSource = {},
    limit = 40,
    placementMode = "kanji-anchor",
    readingExpansionSignal = null,
    sourceAdequacy = null,
    enforceReadingExpansionGate = false,
    readFile = fs.readFileSync,
} = {}) {
    const normalizedPlacementMode = normalizePlacementMode(placementMode);
    const candidateSources = getCandidateDiscoverySourcesForLevel(manifest, level);
    const blockers = [];
    const targetProgress = buildWordExpansionTargetProgressForLevel({
        level,
        jlptWordLevelContract,
    });
    const readingExpansionGate = buildReadingExpansionGate({
        level,
        signal: readingExpansionSignal,
        enforceReadingExpansionGate,
    });
    blockers.push(...readingExpansionGate.blockers.map((blocker) => `N${level}: ${blocker}`));
    if (candidateSources.length !== 1) {
        blockers.push(`N${level}: expected exactly one active candidate-discovery source, found ${candidateSources.length}.`);
        const summary = summarizeSelectorRows([]);
        return {
            level,
            levelLabel: `N${level}`,
            commonWordQueue: readingExpansionGate,
            fallbackSourceGate: buildFallbackSourceGate({
                level,
                commonWordQueue: readingExpansionGate,
                summary,
                sourceBlockers: blockers,
                isExtraSourceSelector: false,
            }),
            sourceAdequacy,
            targetProgress,
            sourceUniverse: null,
            sourceCandidateSummary: null,
            summary,
            rows: [],
            shownRows: [],
            blockers,
        };
    }

    const [sourceId, source] = candidateSources[0];
    const loadedSource = loadSourceRows({
        sourceId,
        source,
        manifest,
        level,
        jlptLevelContract,
        jlptWordLevelContract,
        readFile,
    });
    blockers.push(...loadedSource.blockers);
    const sourceUniverse = buildSourceUniverse({
        sourceId,
        source,
        sourceSummary: sourceSummariesById.get(sourceId) || null,
    });

    if (loadedSource.blockers.length > 0) {
        const summary = summarizeSelectorRows([]);
        return {
            level,
            levelLabel: `N${level}`,
            commonWordQueue: readingExpansionGate,
            fallbackSourceGate: buildFallbackSourceGate({
                level,
                commonWordQueue: readingExpansionGate,
                summary,
                sourceBlockers: blockers,
            }),
            sourceAdequacy,
            targetProgress,
            sourceUniverse,
            sourceCandidateSummary: null,
            summary,
            rows: [],
            shownRows: [],
            blockers,
        };
    }

    const candidatePolicy = source.candidatePolicy || {};
    const expansionReport = buildWordInventoryExpansionCandidateReport({
        sourceRows: loadedSource.sourceRows,
        targetLevel: level,
        kanjiScope: candidatePolicy.kanjiScope || "known-jlpt",
        requireSourceLevel: Boolean(candidatePolicy.requireSourceLevel),
        sourceLabel: sourceId,
        limit: Number.MAX_SAFE_INTEGER,
        triageDecisions: triageDecisionsByLevelSource?.[`N${level}`]?.[sourceId] || {},
        jlptLevelContract,
        jlptWordLevelContract,
        placementMode: normalizedPlacementMode,
    });

    const agreementRowsByKey = buildAgreementRowIndex(agreementLevelReport);
    const rows = expansionReport.allRows
        .map((expansionRow) => buildSelectorRow({
            expansionRow: {
                ...expansionRow,
                readingExpansionQueueActive: readingExpansionGate.active,
            },
            agreementRow: agreementRowsByKey.get(expansionRow.key) || null,
            sourceUniverse,
        }))
        .sort(compareSelectorRows);
    const sourceMoveCandidateRoutingSummary = summarizeSourceMoveCandidateRouting({
        rows,
        sourceLevel: level,
    });
    const summary = {
        ...summarizeSelectorRows(rows),
        sourceRows: expansionReport.summary.sourceRows,
        normalizedRows: expansionReport.summary.normalizedRows,
        uniqueRows: expansionReport.summary.uniqueRows,
        duplicateSourceRows: expansionReport.summary.duplicateSourceRows,
        sourceDispositionCounts: expansionReport.summary.dispositions,
        sourceMoveCandidateRoutingSummary,
        sourceMoveCandidateRows: sourceMoveCandidateRoutingSummary.sourceMoveCandidateRows,
        routedSourceMoveCandidateRows: sourceMoveCandidateRoutingSummary.routedSourceMoveCandidateRows,
        unresolvedSourceMoveCandidateRows: sourceMoveCandidateRoutingSummary.unresolvedSourceMoveCandidateRows,
    };
    const rawDictionaryCommonPoolAudit = loadedSource.commonPoolSummary?.qualityMode === COMMON_POOL_QUALITY_MODE_RAW;

    return {
        level,
        levelLabel: `N${level}`,
        commonWordQueue: readingExpansionGate,
        fallbackSourceGate: buildFallbackSourceGate({
            level,
            commonWordQueue: readingExpansionGate,
            summary,
            sourceBlockers: blockers,
            isExtraSourceSelector: source.extraSourceLane === true,
            auditOnly: rawDictionaryCommonPoolAudit,
        }),
        sourceAdequacy,
        targetProgress,
        sourceUniverse: {
            ...sourceUniverse,
            rowCount: loadedSource.effectiveRowCount ?? sourceUniverse.rowCount,
            rawRowCount: loadedSource.integrity?.rowCount ?? sourceUniverse.rowCount,
            sha256: loadedSource.integrity?.sha256 || sourceUniverse.sha256,
            byteSize: loadedSource.integrity?.byteSize ?? sourceUniverse.byteSize,
            commonPoolSummary: loadedSource.commonPoolSummary || null,
        },
        sourceCandidateSummary: expansionReport.summary,
        summary,
        rows,
        shownRows: rows.slice(0, limit),
        blockers,
    };
}

function buildWordCommonExpansionSelectorReport({
    levels = [5, 4, 3, 2, 1],
    manifest,
    jlptLevelContract = {},
    jlptWordLevelContract = {},
    starterEntries = {},
    wordPitchAccentData = {},
    triageDecisionsByLevelSource = {},
    limit = 40,
    placementMode = "kanji-anchor",
    readingExpansionSignalsByLevel = {},
    sourceAdequacyByLevel = {},
    extraSourceAccessByLevel = {},
    enforceReadingExpansionGate = false,
    includeRoutingSupportLevels = true,
    readFile = fs.readFileSync,
} = {}) {
    const normalizedPlacementMode = normalizePlacementMode(placementMode);
    const reportLevels = normalizeReportLevels(levels);
    const analysisLevels = includeRoutingSupportLevels
        ? collectRoutingSupportLevels({
            levels: reportLevels,
            triageDecisionsByLevelSource,
        })
        : reportLevels;
    const agreementReport = buildWordCandidateAgreementReport({
        levels: analysisLevels,
        manifest,
        jlptLevelContract,
        jlptWordLevelContract,
        starterEntries,
        wordPitchAccentData,
        triageDecisionsByLevelSource,
        limit: Number.MAX_SAFE_INTEGER,
        placementMode: normalizedPlacementMode,
        readFile,
    });
    const sourceSummariesById = new Map(agreementReport.sourceSummaries.map((summary) => [summary.sourceId, summary]));
    const agreementReportsByLevel = new Map(agreementReport.levelReports.map((levelReport) => [levelReport.level, levelReport]));
    const analysisLevelReports = analysisLevels.map((level) => buildLevelSelectorReport({
        level,
        manifest,
        sourceSummariesById,
        agreementLevelReport: agreementReportsByLevel.get(level) || null,
        jlptLevelContract,
        jlptWordLevelContract,
        triageDecisionsByLevelSource,
        limit,
        placementMode: normalizedPlacementMode,
        readingExpansionSignal: readingExpansionSignalsByLevel?.[level] || null,
        sourceAdequacy: sourceAdequacyByLevel?.[level] || null,
        enforceReadingExpansionGate: reportLevels.includes(level) ? enforceReadingExpansionGate : false,
        readFile,
    }));
    const analysisReportsByLevel = new Map(analysisLevelReports.map((levelReport) => [levelReport.level, levelReport]));
    const levelReports = reportLevels
        .map((level) => mergeRoutedMoveCandidatesIntoTargetReport({
            targetReport: analysisReportsByLevel.get(level),
            sourceReports: analysisLevelReports,
            jlptLevelContract,
            limit,
        }))
        .map((levelReport) => ({
            ...levelReport,
            extraSourceAccess: extraSourceAccessByLevel?.[levelReport.level] || null,
        }))
        .map(attachExpansionWorkOrder);
    const blockers = [
        ...agreementReport.sourceBlockers,
        ...analysisLevelReports.flatMap((levelReport) => levelReport.blockers || []),
    ];

    return {
        reportName: "word-common-expansion-selector",
        manifestVersion: agreementReport.manifestVersion,
        manifestCheckedAt: agreementReport.manifestCheckedAt,
        placementMode: normalizedPlacementMode,
        configuredSourceOnly: true,
        warning: SOURCE_UNIVERSE_WARNING,
        wordExpansionTargetPolicy: WORD_EXPANSION_TARGET_POLICY,
        wordExpansionTargetMinimums: WORD_EXPANSION_TARGET_MINIMUMS,
        sourceAdequacyByLevel,
        extraSourceAccessByLevel,
        levels: reportLevels,
        routingSupportLevels: analysisLevels.filter((level) => !reportLevels.includes(level)),
        placementAudit: agreementReport.placementAudit,
        sourceSummaries: agreementReport.sourceSummaries,
        sourceBlockers: agreementReport.sourceBlockers,
        blockers,
        summary: {
            levels: levelReports.length,
            rows: levelReports.reduce((total, levelReport) => total + levelReport.summary.selectedRows, 0),
            readyForEditorialReviewRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.readyForEditorialReviewRows, 0),
            inactiveReadingExpansionRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.inactiveReadingExpansionRows, 0),
            needsTriageRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.needsTriageRows, 0),
            blockedRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.blockedRows, 0),
            routedMoveCandidateRows: levelReports.reduce((total, levelReport) => total + (levelReport.summary.routedMoveCandidateRows || 0), 0),
            inactiveReadingExpansionLevels: levelReports.filter((levelReport) => levelReport.commonWordQueue?.active === false).length,
            blockerCount: blockers.length,
        },
        levelReports,
    };
}

function formatBoolean(value) {
    return value ? "yes" : "no";
}

function formatWorkOrderCount(count) {
    return count === null || count === undefined ? "-" : String(count);
}

function formatWorkOrderLabel(item = null) {
    if (!item) {
        return "none";
    }
    const count = item.count === null || item.count === undefined ? "" : ` (${item.count})`;
    return `${item.label}${count}`;
}

function formatExtraSourceLaneStatus(item = {}) {
    if (item.status === "ready") {
        return "READY - source input needed";
    }
    if (item.status === "ready_extra_source_available") {
        return "READY - extra source available";
    }
    if (item.status === "ready_dictionary_common_pool") {
        return "READY - dictionary common pool";
    }
    if (item.status === "ready_no_actionable_source") {
        return "READY - no actionable free source";
    }
    if (item.status === "selected_extra_source") {
        return "SELECTED - EXTRA source";
    }
    return "closed";
}

function formatSourceUniverse(sourceUniverse = {}) {
    if (!sourceUniverse) {
        return "none";
    }
    const parts = [
        sourceUniverse.sourceLaneLabel || SOURCE_LANE_CONFIGURED_LABEL,
        sourceUniverse.sourceId,
        sourceUniverse.localPath,
        `rows ${sourceUniverse.rowCount ?? "-"}`,
        sourceUniverse.sha256 ? `sha ${sourceUniverse.sha256.slice(0, 12)}` : "sha -",
        `license ${sourceUniverse.licenseStatus || "-"}`,
        `level ${sourceUniverse.levelClaimStatus || SOURCE_LEVEL_CLAIM_STATUS}`,
    ];
    if (sourceUniverse.sourcePoolLabel && sourceUniverse.sourcePoolLabel !== sourceUniverse.sourceLaneLabel) {
        parts.splice(1, 0, `pool ${sourceUniverse.sourcePoolLabel}`);
    }
    if (sourceUniverse.commonPoolSummary) {
        const pool = sourceUniverse.commonPoolSummary;
        parts.push(`pool mode ${pool.qualityMode || COMMON_POOL_QUALITY_MODE_EDITORIAL}`);
        parts.push(`pool eligible ${pool.eligibleRowsBeforeEditorialFilter ?? "-"}`);
        parts.push(`pool queue ${pool.editorialQueueRows ?? "-"}`);
        if (Number.isInteger(pool.reviewableRowsBeforeEditorialFilter)) {
            parts.push(`pool reviewable ${pool.reviewableRowsBeforeEditorialFilter}`);
        }
        if (Number.isInteger(pool.auditOnlyRowsBeforeEditorialFilter)) {
            parts.push(`pool audit-only ${pool.auditOnlyRowsBeforeEditorialFilter}`);
        }
        if (Number.isInteger(pool.deprioritizedByEditorialQueueLimit)) {
            parts.push(`pool deferred ${pool.deprioritizedByEditorialQueueLimit}`);
        }
        if ((pool.frequencySupportSourceIds || []).length > 0) {
            parts.push(`frequency support ${pool.frequencySupportSourceIds.join(",")}`);
            parts.push(`frequency matched ${pool.frequencySupportMatchedRows ?? 0}`);
        }
    }
    return parts.join("; ");
}

function splitDisplayLearnerFitNotes(row = {}) {
    const learnerFitRisks = Array.isArray(row.learnerFitRisks) ? row.learnerFitRisks : [];
    const supportLabelNeeds = Array.isArray(row.supportLabelNeeds) ? [...row.supportLabelNeeds] : [];
    if (!isDictionaryCommonPoolRow(row)) {
        return {
            learnerFitRisks,
            supportLabelNeeds,
        };
    }
    const countableLearnerFitRisks = [];
    for (const risk of learnerFitRisks) {
        if (SUPPORT_LABEL_LEARNER_FIT_RE.test(String(risk || ""))) {
            if (supportLabelNeeds.length === 0) {
                supportLabelNeeds.push(risk);
            }
        } else {
            countableLearnerFitRisks.push(risk);
        }
    }
    return {
        learnerFitRisks: countableLearnerFitRisks,
        supportLabelNeeds: [...new Set(supportLabelNeeds)],
    };
}

function formatSourceAdequacy(sourceAdequacy = null) {
    if (!sourceAdequacy) {
        return "not evaluated";
    }
    return [
        sourceAdequacy.sourceDepthComplete ? "source-depth complete" : "source-depth incomplete",
        `checked ${sourceAdequacy.checked ?? 0}`,
        `universe ${sourceAdequacy.levelUniverseStandardRows ?? 0}`,
        `not evaluated ${sourceAdequacy.sourceOriginNotEvaluatedRows ?? 0}`,
        `single-family ${sourceAdequacy.singleSourceFamilyRows ?? 0}`,
        `multi-source ${sourceAdequacy.multiSourceSupportedRows ?? 0}`,
        `disputed ${sourceAdequacy.disputedLevelClaimRows ?? 0}`,
    ].join("; ");
}

function formatWordExpansionTargetStatus(targetProgress = null) {
    if (!targetProgress || !Number.isInteger(targetProgress.targetMinimum)) {
        return "not configured";
    }
    if (targetProgress.targetMet) {
        return "target floor met; continue quality-only";
    }
    return `below target floor by ${targetProgress.remainingToTarget}`;
}

function formatUtilityBandCounts(counts = {}) {
    return LEARNER_UTILITY_BANDS
        .map((band) => `${band.label}=${counts[band.label] || 0}`)
        .join("; ");
}

function formatFrequencyBandCounts(counts = {}) {
    return FREQUENCY_EVIDENCE_BANDS
        .map((band) => `${band}=${counts[band] || 0}`)
        .join("; ");
}

function formatLearnerValueBucketCounts(counts = {}) {
    return COMMON_POOL_LEARNER_VALUE_BUCKETS
        .map((bucket) => `${bucket}=${counts[bucket] || 0}`)
        .join("; ");
}

function formatLearnerUtilityLine(learnerUtility = null) {
    if (!learnerUtility || !Number.isFinite(learnerUtility.score)) {
        return "not scored";
    }
    const reasons = (learnerUtility.reasons || []).slice(0, 3).join("; ");
    return `${learnerUtility.score}/${learnerUtility.max || 100} ${learnerUtility.band || getUtilityBand(learnerUtility.score)}${reasons ? ` - ${reasons}` : ""}`;
}

function formatLearnerUtilityPenalties(learnerUtility = null) {
    const penalties = (learnerUtility?.penalties || []).slice(0, 3);
    return penalties.length > 0 ? penalties.join("; ") : "none";
}

function formatWordCommonExpansionSelectorReport(report = {}) {
    const hasExtraSelector = (report.levelReports || [])
        .some((levelReport) => levelReport.sourceUniverse?.extraSource === true);
    const sourceScopeWarning = hasExtraSelector
        ? "Configured/extra-source selector only; not an official or global JLPT vocabulary universe."
        : report.warning;
    const lines = [
        "Japanese Kanji Builder Governed Common-Word Silver Selector",
        "",
        "Read-only report: this does not add Silver rows, change contracts, move denominators, approve cards, or certify review lanes.",
        `Source scope: ${sourceScopeWarning}`,
        `Placement mode: ${report.placementMode || "kanji-anchor"}`,
        `Routing support levels: ${(report.routingSupportLevels || []).length > 0 ? report.routingSupportLevels.map((level) => `N${level}`).join(", ") : "none"}`,
        "",
        `Manifest: version ${report.manifestVersion}; checked ${report.manifestCheckedAt}`,
        `Placement gate: ${report.placementAudit?.violationCount || 0}/${report.placementAudit?.checked || 0} word-level placement violations`,
        "",
        "Level source universe:",
        "| Level | Configured source |",
        "| --- | --- |",
    ];

    for (const levelReport of report.levelReports || []) {
        lines.push(`| ${levelReport.levelLabel} | ${formatSourceUniverse(levelReport.sourceUniverse)} |`);
    }

    lines.push(
        "",
        "Level source adequacy:",
        "| Level | Source adequacy |",
        "| --- | --- |"
    );
    for (const levelReport of report.levelReports || []) {
        lines.push(`| ${levelReport.levelLabel} | ${formatSourceAdequacy(levelReport.sourceAdequacy)} |`);
    }

    lines.push(
        "",
        "Deck target progress:",
        "| Level | Current governed unique words | Target minimum | Remaining to target | Status | Policy |",
        "| --- | ---: | ---: | ---: | --- | --- |"
    );
    for (const levelReport of report.levelReports || []) {
        const targetProgress = levelReport.targetProgress || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            targetProgress.currentUniqueGovernedWords ?? "-",
            targetProgress.targetMinimum ?? "-",
            targetProgress.remainingToTarget ?? "-",
            formatWordExpansionTargetStatus(targetProgress),
            "useful minimum, not a hard cap or quota",
        ].join(" | ") + " |");
    }

    lines.push(
        "",
        "Selector summary:",
        "| Level | Queue | Rows | Ready | Inactive | Needs triage | Routed moves | Move | Defer | Reject | Blocked identity | Missing dictionary | Missing commonness | Already governed | Already excluded | Kana-only out of scope |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    );

    for (const levelReport of report.levelReports || []) {
        const counts = levelReport.summary.selectorStatusCounts || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            levelReport.commonWordQueue?.active ? "active" : "inactive",
            levelReport.summary.selectedRows,
            counts.ready_for_editorial_review || 0,
            counts.queue_inactive_reading_expansion || 0,
            counts.needs_triage || 0,
            levelReport.summary.routedMoveCandidateRows || 0,
            counts.move_candidate || 0,
            counts.triaged_defer || 0,
            counts.triaged_reject || 0,
            counts.blocked_identity || 0,
            counts.blocked_missing_dictionary || 0,
            counts.blocked_missing_commonness || 0,
            counts.already_governed || 0,
            counts.already_excluded || 0,
            counts.kana_only_out_of_scope || 0,
        ].join(" | ") + " |");
    }

    lines.push(
        "",
        "Learner utility score:",
        "| Level | Scored rows | Average | Min | Max | Bands | Policy |",
        "| --- | ---: | ---: | ---: | ---: | --- | --- |"
    );
    for (const levelReport of report.levelReports || []) {
        const utility = levelReport.summary.learnerUtility || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            utility.scoredRows ?? 0,
            utility.averageScore ?? "-",
            utility.minScore ?? "-",
            utility.maxScore ?? "-",
            formatUtilityBandCounts(utility.bandCounts || {}),
            "ordering signal only, not card approval",
        ].join(" | ") + " |");
    }

    if ((report.levelReports || []).some((levelReport) => levelReport.summary.learnerValueBuckets?.reviewableRows > 0 || levelReport.sourceUniverse?.commonPoolSummary?.learnerValueBucketCounts)) {
        lines.push(
            "",
            "Learner-value buckets:",
            "| Level | Selected reviewable | Selected audit-only | Raw reviewable | Raw audit-only | Buckets | Policy |",
            "| --- | ---: | ---: | ---: | ---: | --- | --- |"
        );
        for (const levelReport of report.levelReports || []) {
            const selectedBuckets = levelReport.summary.learnerValueBuckets || {};
            const commonPool = levelReport.sourceUniverse?.commonPoolSummary || {};
            lines.push([
                `| ${levelReport.levelLabel}`,
                selectedBuckets.reviewableRows ?? 0,
                selectedBuckets.auditOnlyRows ?? 0,
                commonPool.reviewableRowsBeforeEditorialFilter ?? "-",
                commonPool.auditOnlyRowsBeforeEditorialFilter ?? "-",
                formatLearnerValueBucketCounts(commonPool.learnerValueBucketCounts || selectedBuckets.bucketCounts || {}),
                "buckets guide review; raw denominator is not shrunk",
            ].join(" | ") + " |");
        }
    }

    lines.push(
        "",
        "Discovery yield:",
        "| Level | Window rows | Strong/good reviewable | Yield | Below stop threshold | Frequency bands | Stop rule |",
        "| --- | ---: | ---: | ---: | --- | --- | --- |"
    );
    for (const levelReport of report.levelReports || []) {
        const yieldSummary = levelReport.summary.discoveryYieldSummary || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            yieldSummary.windowRows ?? 0,
            yieldSummary.reviewableStrongOrGoodRows ?? 0,
            `${yieldSummary.reviewableStrongOrGoodYieldPercent ?? 0}%`,
            yieldSummary.currentWindowBelowStopThreshold ? "yes" : "no",
            formatFrequencyBandCounts(yieldSummary.frequencyBandCounts || {}),
            "two consecutive weak 200-row windows before stopping broad discovery",
        ].join(" | ") + " |");
    }

    lines.push(
        "",
        "Expansion work order:",
        "| Level | Next work | Reading fast | Reading editorial | Selector ready | Selector triage | Move routing | Deferred/backlog | Extra source lane |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
    );
    for (const levelReport of report.levelReports || []) {
        const workOrder = levelReport.expansionWorkOrder || buildExpansionWorkOrder(levelReport);
        const itemsByLane = new Map((workOrder.items || []).map((item) => [item.lane, item]));
        const nextItem = (workOrder.items || []).find((item) => item.lane === workOrder.status) || null;
        const extraItem = itemsByLane.get("extra_source_family") || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            formatWorkOrderLabel(nextItem),
            formatWorkOrderCount(itemsByLane.get("reading_fast_promotions")?.count),
            formatWorkOrderCount(itemsByLane.get("reading_editorial_research")?.count),
            formatWorkOrderCount(itemsByLane.get("current_selector_ready")?.count),
            formatWorkOrderCount(itemsByLane.get("current_selector_triage")?.count),
            formatWorkOrderCount(itemsByLane.get("move_candidate_routing")?.count),
            formatWorkOrderCount(itemsByLane.get("deferred_or_rejected_current_rows")?.count),
            formatExtraSourceLaneStatus(extraItem),
        ].join(" | ") + " |");
    }

    lines.push("", "Expansion next commands:");
    for (const levelReport of report.levelReports || []) {
        const workOrder = levelReport.expansionWorkOrder || buildExpansionWorkOrder(levelReport);
        lines.push(`- ${levelReport.levelLabel}: ${workOrder.nextCommand || "(no command)"}; ${workOrder.nextAction}`);
    }

    lines.push("", "Common-word queue gate:");
    for (const levelReport of report.levelReports || []) {
        const gate = levelReport.commonWordQueue || {};
        lines.push(`- ${levelReport.levelLabel}: ${gate.active ? "active" : "inactive"}; reading exhausted ${gate.readingExhausted ? "yes" : "no"}; first-stage fully expanded ${gate.fullyExpanded ? "yes" : "no"}; reading ${gate.readingStatus || "not_evaluated"} active ${gate.activeItems ?? "-"}; enhancement ${gate.enhancementStatus || "not_evaluated"} keep ${gate.enhancementKeepCandidates ?? "-"} untriaged ${gate.enhancementUntriagedCandidates ?? "-"}; placement ${gate.placementStatus || "not_evaluated"} violations ${gate.placementViolationCount ?? "-"}; ${gate.reason || ""}`);
    }

    lines.push("", "Fallback/free-source gate:");
    for (const levelReport of report.levelReports || []) {
        const gate = levelReport.fallbackSourceGate || {};
        const routedMoveText = (gate.routedSourceMoveCandidateRows || 0) > 0
            ? `; routed move ${gate.routedSourceMoveCandidateRows}`
            : "";
        lines.push(`- ${levelReport.levelLabel}: ${gate.active ? "active" : "inactive"}; prerequisite ${gate.prerequisite || "after_reading_expansion_and_current_new_word_selector_exhausted"}; ready ${gate.readyRows ?? 0}; needs triage ${gate.needsTriageRows ?? 0}; unresolved move ${gate.moveCandidateRows ?? 0}${routedMoveText}; ${gate.reason || ""}`);
        for (const blocker of gate.blockers || []) {
            lines.push(`  - ${blocker}`);
        }
    }

    const blockers = report.blockers || [];
    if (blockers.length > 0) {
        lines.push("", "Selector blockers:");
        for (const blocker of blockers) {
            lines.push(`- ${blocker}`);
        }
    }

    for (const levelReport of report.levelReports || []) {
        lines.push("", `${levelReport.levelLabel} rows shown (${levelReport.shownRows.length}/${levelReport.summary.selectedRows}):`);
        if (levelReport.shownRows.length === 0) {
            lines.push("- none");
            continue;
        }
        levelReport.shownRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.written} (${row.reading})`);
            lines.push(`   status: ${row.selectorStatus}; source disposition: ${row.sourceDisposition}`);
            lines.push(`   source lane: ${row.sourceLaneLabel || SOURCE_LANE_CONFIGURED_LABEL}`);
            if (row.sourcePoolLabel && row.sourcePoolLabel !== row.sourceLaneLabel) {
                lines.push(`   source pool: ${row.sourcePoolLabel}`);
            }
            lines.push(`   source level label: ${row.sourceLevelClaimLabel || SOURCE_LEVEL_CLAIM_LABEL} (${row.sourceLevelClaimStatus || SOURCE_LEVEL_CLAIM_STATUS})`);
            if (Number.isInteger(row.frequencyRank)) {
                lines.push(`   commonness rank: ${row.frequencyRank}`);
            }
            if (row.frequencyEvidence?.primary) {
                const evidence = row.frequencyEvidence.primary;
                const parts = [
                    evidence.source || row.frequencyRankSource || "frequency-support",
                    `band ${row.frequencyBand || normalizeFrequencyEvidenceBand(evidence.frequencyBand)}`,
                    `match ${row.frequencyMatchStatus || normalizeFrequencyMatchStatus(evidence.frequencyMatchStatus) || "missing"}`,
                ];
                if (Number.isInteger(row.tubelexRank)) {
                    parts.push(`tubelex rank ${row.tubelexRank}`);
                }
                if (Number.isInteger(row.tubelexCount)) {
                    parts.push(`count ${row.tubelexCount}`);
                }
                if (Number.isInteger(row.tubelexVideoCount)) {
                    parts.push(`videos ${row.tubelexVideoCount}`);
                }
                if (Number.isInteger(row.tubelexChannelCount)) {
                    parts.push(`channels ${row.tubelexChannelCount}`);
                }
                if (Number.isFinite(row.tubelexDispersionScore)) {
                    parts.push(`dispersion ${row.tubelexDispersionScore}`);
                }
                if (Number.isFinite(row.tubelexCategoryConcentration)) {
                    parts.push(`category concentration ${row.tubelexCategoryConcentration}`);
                }
                lines.push(`   frequency evidence: ${parts.join("; ")}`);
                if (row.frequencyReason) {
                    lines.push(`   frequency reason: ${row.frequencyReason}`);
                }
            }
            if (row.learnerValueBucket) {
                const bucketParts = [
                    row.learnerValueBucketLabel || row.learnerValueBucket,
                    row.learnerValueReviewable === false ? "audit-only by default" : "reviewable",
                ];
                if (row.learnerValueFamilyLabel) {
                    bucketParts.push(`family ${row.learnerValueFamilyLabel}`);
                }
                if (Number.isInteger(row.learnerValueFamilyRank) && Number.isInteger(row.learnerValueFamilyCap)) {
                    bucketParts.push(`family rank ${row.learnerValueFamilyRank}/${row.learnerValueFamilyCap}`);
                }
                lines.push(`   learner-value bucket: ${bucketParts.join("; ")}`);
                if ((row.learnerValueReasons || []).length > 0) {
                    lines.push(`   learner-value reason: ${row.learnerValueReasons.join("; ")}`);
                }
            }
            lines.push(`   learner utility: ${formatLearnerUtilityLine(row.learnerUtility)}`);
            lines.push(`   utility penalties: ${formatLearnerUtilityPenalties(row.learnerUtility)}`);
            lines.push(`   support: dictionary ${formatBoolean(row.dictionaryVerified)}, commonness ${formatBoolean(row.frequencySupported)}, sentence ${formatBoolean(row.sentenceSupported)}, pitch ${formatBoolean(row.pitchSupported)}, clean identity ${formatBoolean(row.cleanIdentity)}`);
            if (row.triageDecision) {
                lines.push(`   triage: ${row.triageDecision.decision} [${row.triageDecision.priority || "normal"}] - ${row.triageDecision.reason}`);
                if (Number.isInteger(row.triageDecision.targetLevel)) {
                    lines.push(`   triage target level: N${row.triageDecision.targetLevel}`);
                }
            }
            if (row.sameWrittenConflicts.length > 0) {
                lines.push(`   same-written conflicts: ${row.sameWrittenConflicts.map((entry) => `${entry.reading} (${entry.status || entry.type}${entry.jlpt ? ` N${entry.jlpt}` : ""})`).join(", ")}`);
            }
            const displayLearnerFit = splitDisplayLearnerFitNotes(row);
            if (displayLearnerFit.supportLabelNeeds.length > 0) {
                lines.push(`   support label needs: ${displayLearnerFit.supportLabelNeeds.join("; ")}`);
            }
            if (displayLearnerFit.learnerFitRisks.length > 0) {
                lines.push(`   learner-fit risks: ${displayLearnerFit.learnerFitRisks.join("; ")}`);
            }
            if (row.nextRequiredEvidence.length > 0) {
                lines.push(`   next evidence: ${row.nextRequiredEvidence.join("; ")}`);
            }
        });
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    SELECTOR_STATUSES,
    SOURCE_LANE_CONFIGURED,
    SOURCE_LANE_CONFIGURED_LABEL,
    SOURCE_LANE_EXTRA,
    SOURCE_LANE_EXTRA_LABEL,
    SOURCE_POOL_DICTIONARY_COMMON,
    SOURCE_POOL_DICTIONARY_COMMON_LABEL,
    SOURCE_LEVEL_CLAIM_LABEL,
    SOURCE_LEVEL_CLAIM_STATUS,
    SOURCE_LEVEL_CLAIM_WARNING,
    SOURCE_UNIVERSE_WARNING,
    WORD_EXPANSION_TARGET_MINIMUMS,
    WORD_EXPANSION_TARGET_POLICY,
    DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
    DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    DICTIONARY_COMMON_POOL_SOURCE_ID,
    buildExtraSourceAccessByLevel,
    buildLevelSelectorReport,
    buildExpansionWorkOrder,
    buildLearnerUtilityScore,
    buildReadingExpansionGate,
    buildSourceUniverse,
    buildWordCommonExpansionSelectorReport,
    buildWordExpansionTargetProgressForLevel,
    classifyCommonExpansionSelectorRow,
    formatWordCommonExpansionSelectorReport,
    getCandidateDiscoverySourcesForLevel,
    summarizeSelectorRows,
};
