const {
    ACTIVE_PLATINUM_STATUSES,
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REVALIDATION_STATUSES,
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
    REVIEW_ONLY_STATUSES,
    isCurrentStandardPlatinumEntry,
    validateGeneratedKanjiRow,
} = require("./platinumKanjiReviewService");
const { katakanaToHiragana } = require("../utils/japanese");

const SINGLE_KANJI_RE = /^\p{Script=Han}$/u;
const KANJI_BATCH_QUEUE_MODES = {
    MISSING_CURRENT_STANDARD: "missing-current-standard",
    SUBSTANTIVE_REREVIEW: "substantive-rereview",
};
const DEFAULT_KANJI_BATCH_QUEUE_MODE = KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD;
const SUBSTANTIVE_REREVIEW_PROOF_MARKER = "substantive post-v3 human rereview";
const NON_MECHANICAL_PROOF_MARKER = "not mechanically migrated";
const KANJI_REREVIEW_RUBRIC_VERSION = "kanji-platinum-rereview-rubric-v1";
const REVIEW_RUBRIC_STATUSES = Object.freeze({
    PASS: "pass",
    ATTENTION: "attention",
    MANUAL_JUDGMENT_REQUIRED: "manual_judgment_required",
    NOT_PROVEN: "not_proven",
    BLOCKED: "blocked",
});
const REVIEW_RUBRIC_RESULTS = Object.freeze({
    ALREADY_PROVEN: "already_proven",
    READY_FOR_PLATINUM_REVIEW: "ready_for_platinum_review",
    READY_FOR_SUBSTANTIVE_REVIEW: "ready_for_substantive_review",
    BLOCKED: "blocked",
});
const PRIOR_KANJI_SAPPHIRE_REVIEW_STANDARD = "kanji-sapphire-v1-evidence-lanes";
const ACTIVE_SAPPHIRE_PRECONDITION_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeProofText(value) {
    return normalizeText(value).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeEvidenceEntries(entries = []) {
    return Array.isArray(entries) ? entries : [];
}

function buildRubricItem({
    id,
    label,
    status,
    evidence = [],
    reviewerAction = "",
    limitation = "",
} = {}) {
    return {
        id,
        label,
        status,
        evidence: evidence.map(normalizeText).filter(Boolean),
        reviewerAction: normalizeText(reviewerAction),
        limitation: normalizeText(limitation),
    };
}

function buildEvidenceTypeSet(entry = {}, lane = "") {
    return new Set(
        normalizeEvidenceEntries(entry[lane])
            .map((evidence) => normalizeText(evidence.type))
            .filter(Boolean)
    );
}

function findMissingEvidenceTypes(entry = {}, lane = "", requiredTypes = []) {
    const evidenceTypes = buildEvidenceTypeSet(entry, lane);
    return requiredTypes.filter((type) => !evidenceTypes.has(type));
}

function findCurrentStandardEntry(entries = []) {
    return (Array.isArray(entries) ? entries : []).find(isCurrentStandardPlatinumEntry) || null;
}

function countDelimitedGlosses(value) {
    return normalizeText(value).split(/\s+\/\s+/).filter(Boolean).length;
}

function formatStatusCounts(items = []) {
    return Object.values(REVIEW_RUBRIC_STATUSES).reduce((counts, status) => {
        counts[status] = (Array.isArray(items) ? items : []).filter((item) => item.status === status).length;
        return counts;
    }, {});
}

function buildSelectedRubricSummary(cards = []) {
    const resultCounts = {};
    const itemStatusCounts = Object.values(REVIEW_RUBRIC_STATUSES).reduce((counts, status) => {
        counts[status] = 0;
        return counts;
    }, {});

    for (const card of Array.isArray(cards) ? cards : []) {
        const result = card.reviewRubric?.result || "(missing)";
        resultCounts[result] = (resultCounts[result] || 0) + 1;
        for (const item of card.reviewRubric?.items || []) {
            if (Object.prototype.hasOwnProperty.call(itemStatusCounts, item.status)) {
                itemStatusCounts[item.status] += 1;
            }
        }
    }

    return {
        version: KANJI_REREVIEW_RUBRIC_VERSION,
        selectedCards: Array.isArray(cards) ? cards.length : 0,
        resultCounts,
        itemStatusCounts,
    };
}

function buildRereviewProvenanceText(entry = {}) {
    const evidenceText = normalizeEvidenceEntries(entry.reviewEvidence)
        .filter((evidence) => ["manual-review", "current-standard-review"].includes(evidence.type))
        .map((evidence) => `${evidence.type || ""} ${evidence.source || ""} ${evidence.detail || ""}`)
        .join(" ");
    const provenance = entry.rereviewProvenance && typeof entry.rereviewProvenance === "object"
        ? entry.rereviewProvenance
        : {};
    const provenanceText = Object.entries(provenance)
        .map(([key, value]) => `${key} ${value}`)
        .join(" ");

    return normalizeProofText(`${evidenceText} ${provenanceText}`);
}

function hasStructuredRereviewProvenance(entry = {}) {
    const provenance = entry.rereviewProvenance;
    if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
        return false;
    }

    return normalizeProofText(provenance.type) === "substantive current standard rereview"
        && normalizeText(provenance.reviewStandard) === CURRENT_KANJI_PLATINUM_REVIEW_STANDARD
        && provenance.reviewedAfterStandard === true
        && provenance.mechanicalMigration === false
        && Boolean(normalizeText(provenance.reviewer || entry.reviewer));
}

function hasTextualRereviewProvenance(entry = {}) {
    const proofText = buildRereviewProvenanceText(entry);
    const hasSubstantiveMarker = proofText.includes(normalizeProofText(SUBSTANTIVE_REREVIEW_PROOF_MARKER))
        || proofText.includes("substantive current standard rereview");
    const hasHumanMarker = /\b(human|manual)\b/.test(proofText);
    const hasNonMechanicalMarker = proofText.includes(normalizeProofText(NON_MECHANICAL_PROOF_MARKER))
        || proofText.includes("not a mechanical migration")
        || proofText.includes("not migration only")
        || proofText.includes("non mechanical");

    return hasSubstantiveMarker && hasHumanMarker && hasNonMechanicalMarker;
}

function entryHasSubstantiveCurrentStandardRereviewProof(entry = {}) {
    return hasStructuredRereviewProvenance(entry) || hasTextualRereviewProvenance(entry);
}

function stripMarkup(value) {
    return normalizeText(value)
        .replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gu, "$1$2")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeReadingEvidence(value) {
    return katakanaToHiragana(stripMarkup(value))
        .replace(/[「」『』（）()[\]{}]/g, "")
        .replace(/[、，,・.．\s:：/-]/g, "")
        .toLowerCase()
        .trim();
}

function countReadingOptions(value) {
    return normalizeText(value)
        .replace(/^(On|Kun):\s*/i, "")
        .split(/[、，,]/)
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
        .length;
}

function hasOnlyTargetKanji(value, kanji) {
    const chars = normalizeText(value).match(/\p{Script=Han}/gu) || [];
    return chars.length > 0 && chars.every((char) => char === kanji);
}

function describeCuratedReadingConflict(row = {}, curatedEntry = null) {
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const displayWord = curatedEntry?.displayWord || {};
    const breakdownWord = curatedEntry?.breakdownDisplayWord || {};
    const displayPron = normalizeText(displayWord.pron);
    const breakdownPron = normalizeText(breakdownWord.pron);

    if (!kanji || !displayPron || !breakdownPron || displayPron === breakdownPron) {
        return "";
    }
    if (!hasOnlyTargetKanji(displayWord.written, kanji) || !hasOnlyTargetKanji(breakdownWord.written, kanji)) {
        return "";
    }

    const selected = primaryReading
        ? ` exported PrimaryReading ${primaryReading}`
        : " exported PrimaryReading is blank";
    return `curated display reading ${displayPron} differs from word-breakdown reading ${breakdownPron};${selected} must be explicitly justified against Japanese source evidence before platinum`;
}

function buildEntryStateByKanji(entries = []) {
    const stateByKanji = new Map();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const kanji = normalizeText(entry.kanji);
        if (!kanji) {
            continue;
        }
        if (!stateByKanji.has(kanji)) {
            stateByKanji.set(kanji, {
                statuses: [],
                entries: [],
            });
        }
        const state = stateByKanji.get(kanji);
        state.statuses.push(normalizeText(entry.status) || "(blank)");
        state.entries.push(entry);
    }

    return stateByKanji;
}

function buildCurrentStandardSapphireSet(entries = []) {
    return new Set((Array.isArray(entries) ? entries : [])
        .filter((entry) => (
            ACTIVE_SAPPHIRE_PRECONDITION_STATUSES.includes(normalizeText(entry.status))
            && entry.reviewStandard === PRIOR_KANJI_SAPPHIRE_REVIEW_STANDARD
        ))
        .map((entry) => normalizeText(entry.kanji))
        .filter(Boolean));
}

function classifyReviewStatus(statuses = [], entries = []) {
    const entryList = Array.isArray(entries) ? entries : [];
    if (entryList.some((entry) => isCurrentStandardPlatinumEntry(entry) && entryHasSubstantiveCurrentStandardRereviewProof(entry))) {
        return "substantive_rereview_proven";
    }
    if (entryList.some(isCurrentStandardPlatinumEntry)) {
        return "current_standard_platinum_only";
    }
    if (statuses.some((status) => ACTIVE_PLATINUM_STATUSES.includes(status) || REVALIDATION_STATUSES.includes(status))) {
        return "needs_revalidation";
    }
    if (statuses.some((status) => NON_SHIPPING_STATUSES.includes(status))) {
        return "non_shipping_decision";
    }
    if (statuses.some((status) => REVIEW_ONLY_STATUSES.includes(status))) {
        return "needs_review";
    }
    if (statuses.length > 0) {
        return "invalid_or_unknown";
    }
    return "missing_platinum";
}

function buildHardChecks(row = {}) {
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const exactAudioFragment = `kanji-reading-${kanji}-${primaryReading}`;

    return [
        {
            name: "Kanji is one target kanji",
            passed: SINGLE_KANJI_RE.test(kanji),
        },
        {
            name: "DisplayWord equals target kanji",
            passed: normalizeText(row.displayWord) === kanji,
        },
        {
            name: "StudyWordKanji is blank",
            passed: normalizeText(row.studyWordKanji) === "",
        },
        {
            name: "PrimaryReading is present",
            passed: primaryReading.length > 0,
        },
        {
            name: "MeaningJP is present",
            passed: normalizeText(row.meaningJP).length > 0,
        },
        {
            name: "KanjiMeanings is present",
            passed: normalizeText(row.kanjiMeanings).length > 0,
        },
        {
            name: "ExampleSentence is present",
            passed: normalizeText(row.exampleSentence).length > 0,
        },
        {
            name: "StrokeOrder field is present",
            passed: normalizeText(row.strokeOrder).length > 0,
        },
        {
            name: "Audio is exact target plus primary reading",
            passed: normalizeText(row.audio).includes(exactAudioFragment),
        },
        {
            name: "No generic offline fallback note",
            passed: !normalizeText(row.notes).includes("Offline preview built from local data only."),
        },
    ];
}

function buildRiskFlags(row = {}, {
    reviewStatus = "missing_platinum",
    statuses = [],
    curatedEntry = null,
    queueMode = DEFAULT_KANJI_BATCH_QUEUE_MODE,
} = {}) {
    const flags = [];
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const evidenceText = normalizeReadingEvidence([
        row.onReading,
        row.kunReading,
        row.notes,
        row.exampleSentence,
    ].join(" "));

    if (reviewStatus === "substantive_rereview_proven") {
        flags.push(queueMode === KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW
            ? "already has explicit Obsidian proof; skip unless intentionally replacing prior evidence"
            : "already has current-standard Platinum and separate Obsidian proof; no missing-Platinum work required");
    } else if (reviewStatus === "current_standard_platinum_only") {
        flags.push(queueMode === KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW
            ? "has current-standard Platinum only; explicit Obsidian proof is still required"
            : "already has current-standard Platinum; no missing-Platinum work required");
    } else if (reviewStatus === "active_platinum") {
        flags.push("already has active platinum; re-review only if intentionally replacing prior evidence");
    } else if (reviewStatus === "needs_revalidation") {
        flags.push("existing legacy/unversioned review history does not count as platinum until current-standard revalidation");
    } else if (reviewStatus === "needs_review") {
        flags.push("existing needs_review entry blocks platinum until resolved");
    } else if (reviewStatus === "non_shipping_decision") {
        flags.push("existing deferred/removed decision conflicts with generated export if this card still appears");
    } else if (reviewStatus === "invalid_or_unknown") {
        flags.push(`existing platinum status is not recognized: ${statuses.join(", ")}`);
    }

    if (countReadingOptions(row.onReading) + countReadingOptions(row.kunReading) > 2) {
        flags.push("multiple readings listed; primary-reading rationale needs extra care");
    }
    const curatedConflict = describeCuratedReadingConflict(row, curatedEntry);
    if (curatedConflict) {
        flags.push(curatedConflict);
    }
    if (primaryReading && !evidenceText.includes(normalizeReadingEvidence(primaryReading))) {
        flags.push("primary reading is not plainly visible in reading evidence; verify against Japanese source before approval");
    }
    if (kanji && !stripMarkup(row.notes).includes(kanji)) {
        flags.push("notes do not visibly include the target kanji");
    }
    if (kanji && !stripMarkup(row.exampleSentence).includes(kanji)) {
        flags.push("example sentence does not visibly include the target kanji");
    }
    if (normalizeText(row.meaningJP).split(/\s+\/\s+/).length > 2) {
        flags.push("MeaningJP has several glosses; verify primary meaning is tied to the primary reading, not dictionary noise");
    }
    if (normalizeText(row.kanjiMeanings).split(/\s+\/\s+/).length > 6) {
        flags.push("KanjiMeanings is broad; check for low-value dictionary noise before platinum");
    }

    return flags;
}

function buildReviewRubric(row = {}, {
    reviewStatus = "missing_platinum",
    statuses = [],
    currentStandardEntry = null,
    hardChecks = [],
    generatedFailures = [],
    curatedEntry = null,
    queueMode = DEFAULT_KANJI_BATCH_QUEUE_MODE,
} = {}) {
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const evidenceText = normalizeReadingEvidence([
        row.onReading,
        row.kunReading,
        row.notes,
        row.exampleSentence,
    ].join(" "));
    const primaryReadingVisible = primaryReading
        ? evidenceText.includes(normalizeReadingEvidence(primaryReading))
        : false;
    const totalReadingOptions = countReadingOptions(row.onReading) + countReadingOptions(row.kunReading);
    const curatedConflict = describeCuratedReadingConflict(row, curatedEntry);
    const hardCheckFailures = (Array.isArray(hardChecks) ? hardChecks : [])
        .filter((check) => !check.passed)
        .map((check) => check.name);
    const sourceMissing = currentStandardEntry
        ? findMissingEvidenceTypes(currentStandardEntry, "sourceEvidence", REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES)
        : [...REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES];
    const internalMissing = currentStandardEntry
        ? findMissingEvidenceTypes(currentStandardEntry, "internalChecks", REQUIRED_KANJI_INTERNAL_CHECK_TYPES)
        : [...REQUIRED_KANJI_INTERNAL_CHECK_TYPES];
    const reviewMissing = currentStandardEntry
        ? findMissingEvidenceTypes(currentStandardEntry, "reviewEvidence", REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES)
        : [...REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES];
    const gateFailures = currentStandardEntry
        ? REQUIRED_KANJI_QUALITY_GATES.filter((gate) => currentStandardEntry.qualityGates?.[gate] !== true)
        : [];
    const limitations = Array.isArray(currentStandardEntry?.verificationLimitations)
        ? currentStandardEntry.verificationLimitations
        : [];
    const hasSubstantiveProof = currentStandardEntry
        ? entryHasSubstantiveCurrentStandardRereviewProof(currentStandardEntry)
        : false;
    const meaningGlosses = countDelimitedGlosses(row.meaningJP);
    const broaderMeaningGlosses = countDelimitedGlosses(row.kanjiMeanings);
    const notesIncludeKanji = kanji ? stripMarkup(row.notes).includes(kanji) : false;
    const exampleIncludesKanji = kanji ? stripMarkup(row.exampleSentence).includes(kanji) : false;

    const items = [
        buildRubricItem({
            id: "kanji_card_contract",
            label: "Kanji card contract",
            status: hardCheckFailures.length > 0 || generatedFailures.length > 0
                ? REVIEW_RUBRIC_STATUSES.BLOCKED
                : REVIEW_RUBRIC_STATUSES.PASS,
            evidence: [
                `Kanji=${kanji || "(blank)"}`,
                `DisplayWord=${normalizeText(row.displayWord) || "(blank)"}`,
                `StudyWordKanji=${normalizeText(row.studyWordKanji) || "(blank)"}`,
                hardCheckFailures.length > 0 ? `hard check failures: ${hardCheckFailures.join("; ")}` : "hard checks pass",
                generatedFailures.length > 0 ? `generated failures: ${generatedFailures.join("; ")}` : "generated row validator pass",
            ],
            reviewerAction: hardCheckFailures.length > 0 || generatedFailures.length > 0
                ? "Fix the generated kanji-card contract before Platinum review."
                : "No card-anchor contract issue surfaced by automation.",
        }),
        buildRubricItem({
            id: "primary_reading_choice",
            label: "Primary reading choice",
            status: !primaryReading
                ? REVIEW_RUBRIC_STATUSES.BLOCKED
                : totalReadingOptions > 2 || !primaryReadingVisible || curatedConflict || !normalizeText(currentStandardEntry?.primaryReadingRationale)
                    ? REVIEW_RUBRIC_STATUSES.ATTENTION
                    : REVIEW_RUBRIC_STATUSES.PASS,
            evidence: [
                `PrimaryReading=${primaryReading || "(blank)"}`,
                `listed reading options=${totalReadingOptions}`,
                primaryReadingVisible ? "primary reading visible in generated reading/support surface" : "primary reading not plainly visible in generated reading/support surface",
                normalizeText(currentStandardEntry?.primaryReadingRationale)
                    ? `rationale=${currentStandardEntry.primaryReadingRationale}`
                    : "primary reading rationale missing from current-standard entry",
                curatedConflict,
            ],
            reviewerAction: "Confirm the selected reading is the most learner-useful, level-appropriate individual-kanji reading; do not rely on dictionary order or existing audio.",
        }),
        buildRubricItem({
            id: "meaning_scope",
            label: "Meaning scope",
            status: !normalizeText(row.meaningJP) || !normalizeText(row.kanjiMeanings)
                ? REVIEW_RUBRIC_STATUSES.BLOCKED
                : meaningGlosses > 2 || broaderMeaningGlosses > 6
                    ? REVIEW_RUBRIC_STATUSES.ATTENTION
                    : REVIEW_RUBRIC_STATUSES.PASS,
            evidence: [
                `MeaningJP=${normalizeText(row.meaningJP) || "(blank)"}`,
                `MeaningJP gloss count=${meaningGlosses}`,
                `KanjiMeanings=${normalizeText(row.kanjiMeanings) || "(blank)"}`,
                `KanjiMeanings gloss count=${broaderMeaningGlosses}`,
            ],
            reviewerAction: "Confirm MeaningJP is tied to the primary reading and KanjiMeanings contains useful broader meanings without low-value dictionary noise.",
        }),
        buildRubricItem({
            id: "source_evidence_lane",
            label: "Governed Japanese-source evidence",
            status: !currentStandardEntry || sourceMissing.length > 0
                ? REVIEW_RUBRIC_STATUSES.BLOCKED
                : REVIEW_RUBRIC_STATUSES.MANUAL_JUDGMENT_REQUIRED,
            evidence: [
                currentStandardEntry ? "current-standard manifest entry present" : "current-standard manifest entry missing",
                sourceMissing.length > 0 ? `missing sourceEvidence types: ${sourceMissing.join(", ")}` : "required sourceEvidence types present",
                `status history=${statuses.join(", ") || "(none)"}`,
            ],
            reviewerAction: "Open the governed Japanese source during Platinum review and confirm it supports the exact kanji, primary reading, primary meaning, and broader meaning fields.",
            limitation: "The report checks lane presence and binding posture; it does not independently prove source correctness.",
        }),
        buildRubricItem({
            id: "evidence_lane_separation",
            label: "Evidence lane separation and gates",
            status: !currentStandardEntry || internalMissing.length > 0 || reviewMissing.length > 0 || gateFailures.length > 0
                ? REVIEW_RUBRIC_STATUSES.BLOCKED
                : REVIEW_RUBRIC_STATUSES.PASS,
            evidence: [
                internalMissing.length > 0 ? `missing internalChecks: ${internalMissing.join(", ")}` : "required internalChecks present",
                reviewMissing.length > 0 ? `missing reviewEvidence: ${reviewMissing.join(", ")}` : "required reviewEvidence present",
                gateFailures.length > 0 ? `quality gate failures: ${gateFailures.join(", ")}` : "required quality gates true",
                "golden regression is internal regression only, not source truth",
            ],
            reviewerAction: "Keep source truth, internal checks, and reviewer judgment in separate lanes before final Platinum judgment.",
        }),
        buildRubricItem({
            id: "example_and_support_usage",
            label: "Example sentence quality and support usage",
            status: !normalizeText(row.exampleSentence)
                ? REVIEW_RUBRIC_STATUSES.BLOCKED
                : !notesIncludeKanji || !exampleIncludesKanji
                    ? REVIEW_RUBRIC_STATUSES.ATTENTION
                    : REVIEW_RUBRIC_STATUSES.MANUAL_JUDGMENT_REQUIRED,
            evidence: [
                `notes include target kanji=${notesIncludeKanji}`,
                `example includes target kanji=${exampleIncludesKanji}`,
                `example=${stripMarkup(row.exampleSentence) || "(blank)"}`,
            ],
            reviewerAction: "Read the actual Japanese sentence, reading, and translation. Fix the sentence if needed, then confirm the final sentence is natural enough, learner-useful, level-appropriate, support-only, and does not replace the individual-kanji anchor.",
            limitation: "Automation can check presence and binding, but the sentence naturalness and pedagogy decision must be made from the actual card content during Platinum review.",
        }),
        buildRubricItem({
            id: "media_identity",
            label: "Audio and stroke-order identity",
            status: hardCheckFailures.some((failure) => /Audio|StrokeOrder/.test(failure)) || internalMissing.some((type) => ["media-audit", "audio-review", "stroke-order-review"].includes(type))
                ? REVIEW_RUBRIC_STATUSES.BLOCKED
                : REVIEW_RUBRIC_STATUSES.MANUAL_JUDGMENT_REQUIRED,
            evidence: [
                `Audio=${normalizeText(row.audio) || "(blank)"}`,
                `StrokeOrder=${normalizeText(row.strokeOrder) || "(blank)"}`,
                internalMissing.some((type) => ["media-audit", "audio-review", "stroke-order-review"].includes(type))
                    ? "media evidence lanes incomplete"
                    : "media evidence lanes present",
            ],
            reviewerAction: "Confirm exact primary-reading audio identity and managed provenance; listening QA and visual stroke-order sequence review remain human release tasks.",
            limitation: "The report verifies field identity/provenance posture, not audio naturalness or stroke sequence correctness by itself.",
        }),
        buildRubricItem({
            id: "verification_limitations",
            label: "Verification limitations",
            status: limitations.length > 0
                ? REVIEW_RUBRIC_STATUSES.ATTENTION
                : REVIEW_RUBRIC_STATUSES.MANUAL_JUDGMENT_REQUIRED,
            evidence: [
                `active limitations=${limitations.length}`,
                limitations.length > 0
                    ? limitations.map((limitation) => `${limitation.field || "(unknown field)"}:${limitation.status || "(unknown status)"}`).join(", ")
                    : "no active limitations recorded",
            ],
            reviewerAction: "Actively decide whether any non-core limitation exists; if one exists, record it explicitly instead of silently passing it.",
        }),
    ];
    if (queueMode === KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW) {
        items.push(buildRubricItem({
            id: "substantive_rereview_provenance",
            label: "Obsidian proof provenance",
            status: hasSubstantiveProof
                ? REVIEW_RUBRIC_STATUSES.PASS
                : currentStandardEntry
                    ? REVIEW_RUBRIC_STATUSES.NOT_PROVEN
                    : REVIEW_RUBRIC_STATUSES.BLOCKED,
            evidence: [
                currentStandardEntry ? "current-standard Platinum entry present" : "current-standard Platinum entry missing",
                hasSubstantiveProof ? "explicit non-mechanical Obsidian proof present" : "explicit non-mechanical Obsidian proof missing",
            ],
            reviewerAction: hasSubstantiveProof
                ? "Do not replace provenance unless intentionally correcting prior review evidence."
                : "Add Obsidian proof only after the separate Obsidian review has actually been performed.",
        }));
    }
    const itemStatusCounts = formatStatusCounts(items);
    const result = itemStatusCounts[REVIEW_RUBRIC_STATUSES.BLOCKED] > 0
        ? REVIEW_RUBRIC_RESULTS.BLOCKED
        : queueMode === KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW && reviewStatus === "substantive_rereview_proven"
            ? REVIEW_RUBRIC_RESULTS.ALREADY_PROVEN
            : queueMode === KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW
                ? REVIEW_RUBRIC_RESULTS.READY_FOR_SUBSTANTIVE_REVIEW
                : REVIEW_RUBRIC_RESULTS.READY_FOR_PLATINUM_REVIEW;

    return {
        version: KANJI_REREVIEW_RUBRIC_VERSION,
        result,
        itemStatusCounts,
        items,
    };
}

function normalizeQueueMode(queue = DEFAULT_KANJI_BATCH_QUEUE_MODE) {
    const normalized = normalizeText(queue);
    return Object.values(KANJI_BATCH_QUEUE_MODES).includes(normalized)
        ? normalized
        : DEFAULT_KANJI_BATCH_QUEUE_MODE;
}

function selectBatchRows({
    rows = [],
    entries = [],
    sapphireEntries = [],
    kanji = [],
    limit = 12,
    skipSapphirePreconditionForSapphireCompatibilityReport = false,
    queue = DEFAULT_KANJI_BATCH_QUEUE_MODE,
} = {}) {
    const queueMode = normalizeQueueMode(queue);
    const stateByKanji = buildEntryStateByKanji(entries);
    const currentSapphireSet = buildCurrentStandardSapphireSet(sapphireEntries);
    const enforceSapphirePrecondition = !skipSapphirePreconditionForSapphireCompatibilityReport;

    if (Array.isArray(kanji) && kanji.length > 0) {
        return kanji
            .map((target) => rows.find((row) => row.kanji === target))
            .filter(Boolean);
    }

    return rows
        .filter((row) => {
            if (enforceSapphirePrecondition && !currentSapphireSet.has(row.kanji)) {
                return false;
            }
            const state = stateByKanji.get(row.kanji) || { statuses: [], entries: [] };
            const reviewStatus = classifyReviewStatus(state.statuses, state.entries);
            if (queueMode === KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD) {
                return reviewStatus !== "current_standard_platinum_only"
                    && reviewStatus !== "substantive_rereview_proven";
            }
            return reviewStatus !== "substantive_rereview_proven";
        })
        .slice(0, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 12));
}

function buildPlatinumKanjiBatchReport({
    rows = [],
    entries = [],
    sapphireEntries = [],
    level,
    kanji = [],
    limit = 12,
    curatedStudyData = {},
    skipSapphirePreconditionForSapphireCompatibilityReport = false,
    queue = DEFAULT_KANJI_BATCH_QUEUE_MODE,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const currentSapphireSet = buildCurrentStandardSapphireSet(sapphireEntries);
    const stateByKanji = buildEntryStateByKanji(reviewEntries);
    const queueMode = normalizeQueueMode(queue);
    const enforceSapphirePrecondition = !skipSapphirePreconditionForSapphireCompatibilityReport;
    const selectedRows = selectBatchRows({
        rows: generatedRows,
        entries: reviewEntries,
        sapphireEntries,
        kanji,
        limit,
        skipSapphirePreconditionForSapphireCompatibilityReport,
        queue: queueMode,
    });
    const activeCount = reviewEntries.filter(isCurrentStandardPlatinumEntry).length;
    const substantiveRereviewProvenCount = reviewEntries.filter((entry) => (
        isCurrentStandardPlatinumEntry(entry)
        && entryHasSubstantiveCurrentStandardRereviewProof(entry)
    )).length;
    const missingRows = generatedRows.filter((row) => {
        if (enforceSapphirePrecondition && !currentSapphireSet.has(row.kanji)) {
            return false;
        }
        const state = stateByKanji.get(row.kanji) || { statuses: [], entries: [] };
        const reviewStatus = classifyReviewStatus(state.statuses, state.entries);
        return reviewStatus !== "current_standard_platinum_only"
            && reviewStatus !== "substantive_rereview_proven";
    });
    const needsSubstantiveRereviewRows = generatedRows.filter((row) => {
        if (enforceSapphirePrecondition && !currentSapphireSet.has(row.kanji)) {
            return false;
        }
        const state = stateByKanji.get(row.kanji) || { statuses: [], entries: [] };
        return classifyReviewStatus(state.statuses, state.entries) !== "substantive_rereview_proven";
    });
    const includeSubstantiveRereviewQueue = queueMode === KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW;

    const cards = selectedRows.map((row) => {
        const state = stateByKanji.get(row.kanji) || { statuses: [], entries: [] };
        const statuses = state.statuses;
        const reviewStatus = classifyReviewStatus(statuses, state.entries);
        const hardChecks = buildHardChecks(row);
        const generatedFailures = validateGeneratedKanjiRow(row);
        const curatedEntry = curatedStudyData?.[row.kanji] || null;
        const currentStandardEntry = findCurrentStandardEntry(state.entries);
        const riskFlags = buildRiskFlags(row, { reviewStatus, statuses, curatedEntry, queueMode });
        if (enforceSapphirePrecondition && !currentSapphireSet.has(row.kanji)) {
            riskFlags.unshift("missing current-standard Sapphire precondition; run Sapphire before Platinum");
        }
        const reviewRubric = buildReviewRubric(row, {
            reviewStatus,
            statuses,
            currentStandardEntry,
            hardChecks,
            generatedFailures,
            curatedEntry,
            queueMode,
        });
        return {
            kanji: row.kanji,
            levelLabel: row.levelLabel || (Number.isInteger(level) ? `N${level}` : ""),
            reviewStatus,
            existingStatuses: statuses,
            surface: {
                displayWord: row.displayWord,
                primaryReading: row.primaryReading,
                meaningJP: row.meaningJP,
                kanjiMeanings: row.kanjiMeanings,
                notes: row.notes,
                exampleSentence: row.exampleSentence,
                audio: row.audio,
                strokeOrder: row.strokeOrder,
                studyWordKanji: row.studyWordKanji,
                onReading: row.onReading,
                kunReading: row.kunReading,
            },
            hardChecks,
            generatedFailures,
            hardChecksPassed: hardChecks.every((check) => check.passed) && generatedFailures.length === 0,
            riskFlags,
            reviewRubric,
        };
    });

    return {
        level,
        scope: Array.isArray(kanji) && kanji.length > 0 ? `kanji=${kanji.join(",")}` : `queue=${queueMode} limit=${limit}`,
        queue: queueMode,
        summary: {
            generatedRows: generatedRows.length,
            activePlatinum: activeCount,
            sapphireEligibleRows: generatedRows.filter((row) => currentSapphireSet.has(row.kanji)).length,
            blockedByMissingSapphire: enforceSapphirePrecondition
                ? generatedRows.filter((row) => !currentSapphireSet.has(row.kanji)).length
                : 0,
            remainingPlatinum: missingRows.length,
            ...(includeSubstantiveRereviewQueue ? {
                substantiveRereviewProven: substantiveRereviewProvenCount,
                remainingSubstantiveRereview: needsSubstantiveRereviewRows.length,
            } : {}),
            selectedCards: cards.length,
        },
        reviewRubricSummary: buildSelectedRubricSummary(cards),
        nextMissingKanji: missingRows.map((row) => row.kanji),
        ...(includeSubstantiveRereviewQueue ? {
            nextSubstantiveRereviewKanji: needsSubstantiveRereviewRows.map((row) => row.kanji),
        } : {}),
        cards,
    };
}

function formatPlatinumKanjiBatchReport(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Platinum ${levelLabel} Kanji Batch Report`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        `Generated cards: ${summary.generatedRows || 0}`,
        `Queue: ${report.queue || DEFAULT_KANJI_BATCH_QUEUE_MODE}`,
        `Platinum entries: ${summary.activePlatinum || 0}`,
        `Sapphire-eligible rows: ${summary.sapphireEligibleRows || 0}`,
        `Blocked by missing Sapphire: ${summary.blockedByMissingSapphire || 0}`,
        `Missing Platinum: ${summary.remainingPlatinum || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];
    if (report.queue === KANJI_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW) {
        lines.splice(6, 0, `Obsidian certified: ${summary.substantiveRereviewProven || 0}`);
        lines.splice(8, 0, `Remaining Obsidian certification: ${summary.remainingSubstantiveRereview || 0}`);
    }
    const rubricSummary = report.reviewRubricSummary || {};
    if (rubricSummary.version) {
        lines.push(
            `Rubric: ${rubricSummary.version}`,
            `Rubric selected-card results: ${Object.entries(rubricSummary.resultCounts || {}).map(([key, value]) => `${key}=${value}`).join(", ") || "(none)"}`,
            `Rubric item statuses: ${Object.entries(rubricSummary.itemStatusCounts || {}).map(([key, value]) => `${key}=${value}`).join(", ") || "(none)"}`
        );
    }

    const queueKanji = report.queue === KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD
        ? report.nextMissingKanji
        : report.nextSubstantiveRereviewKanji;
    const queueLabel = report.queue === KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD
        ? "Next missing current-standard Platinum queue"
        : "Next explicit Obsidian proof queue";
    if (Array.isArray(queueKanji) && queueKanji.length > 0) {
        lines.push("", `${queueLabel} (${Math.min(queueKanji.length, 30)}/${queueKanji.length}):`);
        lines.push(queueKanji.slice(0, 30).join(", "));
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.kanji} [${card.reviewStatus}]`);
        lines.push(`  Surface: DisplayWord=${card.surface.displayWord || "(blank)"} | PrimaryReading=${card.surface.primaryReading || "(blank)"} | MeaningJP=${card.surface.meaningJP || "(blank)"}`);
        lines.push(`  KanjiMeanings: ${card.surface.kanjiMeanings || "(blank)"}`);
        lines.push(`  Example: ${stripMarkup(card.surface.exampleSentence) || "(blank)"}`);
        lines.push(`  Audio: ${card.surface.audio || "(blank)"}`);
        lines.push(`  Hard checks: ${card.hardChecksPassed ? "pass" : "fail"}`);
        for (const failure of card.generatedFailures || []) {
            lines.push(`    - ${failure}`);
        }
        for (const check of (card.hardChecks || []).filter((item) => !item.passed)) {
            lines.push(`    - ${check.name}`);
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
        "This report is read-only. It prepares review; it does not create platinum entries or prove release readiness.",
        "Default queue is missing-current-standard Platinum. Use --queue=substantive-rereview only for explicit Obsidian proof-status compatibility work."
    );
    return `${lines.join("\n")}\n`;
}

module.exports = {
    KANJI_BATCH_QUEUE_MODES,
    DEFAULT_KANJI_BATCH_QUEUE_MODE,
    KANJI_REREVIEW_RUBRIC_VERSION,
    REVIEW_RUBRIC_RESULTS,
    REVIEW_RUBRIC_STATUSES,
    buildHardChecks,
    buildPlatinumKanjiBatchReport,
    buildRiskFlags,
    buildReviewRubric,
    classifyReviewStatus,
    describeCuratedReadingConflict,
    formatPlatinumKanjiBatchReport,
    normalizeQueueMode,
    normalizeReadingEvidence,
        selectBatchRows,
};
