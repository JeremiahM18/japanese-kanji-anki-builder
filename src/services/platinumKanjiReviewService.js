const ACTIVE_PLATINUM_STATUSES = Object.freeze(["platinum", "fixed_then_platinum"]);
const {
    normalizeEvidenceEntries,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
} = require("./platinumEvidenceService");
const {
    getDefaultJlptKanjiSourceEvidence,
    resolveKanjiSourceOriginIdsForEntry,
} = require("./platinumKanjiSourceOriginService");
const NON_SHIPPING_STATUSES = Object.freeze(["deferred", "removed"]);
const REVIEW_ONLY_STATUSES = Object.freeze(["needs_review"]);
const ALLOWED_PLATINUM_STATUSES = Object.freeze([
    ...ACTIVE_PLATINUM_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const REQUIRED_KANJI_QUALITY_GATES = Object.freeze([
    "belongsInKanjiDeck",
    "individualKanjiAnchor",
    "displayWordIsTargetKanji",
    "japaneseVerified",
    "primaryReadingVerified",
    "primaryMeaningVerified",
    "broaderMeaningsVerified",
    "exampleReleaseQuality",
    "exampleSupportOnly",
    "studyWordSuppressed",
    "levelPlacementVerified",
    "audioExactPrimaryReading",
    "audioArtifactVerified",
    "strokeOrderVerified",
    "strokeOrderTargetVerified",
    "noSilentFallback",
]);

const REQUIRED_KANJI_EVIDENCE_TYPES = Object.freeze([
    "generated-surface",
    "golden-review",
    "japanese-source",
    "media-audit",
    "audio-review",
    "stroke-order-review",
    "manual-review",
]);

const ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "audioNaturalness",
    "exampleSupportNuance",
    "notesSupportNuance",
    "sourceAvailability",
    "strokeOrderSequence",
    "strokeOrderSourceDepth",
]);

const BLOCKED_KANJI_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "kanji",
    "displayWord",
    "primaryReading",
    "meaningJP",
    "kanjiMeanings",
    "exampleSentence",
    "productFit",
]);

const ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES = Object.freeze([
    "externally_unverified",
    "limited_source",
    "manual_review_only",
]);

const SINGLE_KANJI_RE = /^\p{Script=Han}$/u;

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

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function normalizeKanjiVerificationLimitations(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((limitation) => limitation && typeof limitation === "object" && !Array.isArray(limitation))
        .map((limitation) => ({
            field: normalizeText(limitation.field),
            status: normalizeText(limitation.status),
            label: normalizeText(limitation.label),
            reviewNote: normalizeText(limitation.reviewNote),
        }));
}

function buildKanjiVerificationLimitationSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const limitationRows = [];
    const fieldCounts = {};

    for (const entry of activeEntries) {
        const limitations = normalizeKanjiVerificationLimitations(entry.verificationLimitations);
        for (const limitation of limitations) {
            limitationRows.push({
                kanji: normalizeText(entry.kanji),
                field: limitation.field,
                status: limitation.status,
                label: limitation.label,
                reviewNote: limitation.reviewNote,
            });
            fieldCounts[limitation.field] = (fieldCounts[limitation.field] || 0) + 1;
        }
    }

    return {
        limitationCount: limitationRows.length,
        kanjiCount: new Set(limitationRows.map((limitation) => limitation.kanji).filter(Boolean)).size,
        fieldCounts,
        limitations: limitationRows.sort((left, right) => (
            left.kanji.localeCompare(right.kanji, "ja")
            || left.field.localeCompare(right.field)
            || left.label.localeCompare(right.label)
        )),
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

function buildPlatinumReviewKey({ kanji = "" } = {}) {
    return normalizeForCompare(kanji);
}

function findKanjiRowForEntry(rows = [], entry = {}) {
    const matches = rows.filter((row) => row.kanji === entry.kanji);
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        return {
            kanji: entry.kanji,
            error: `ambiguous generated kanji rows: ${matches.map((row) => row.kanji).join(", ")}`,
        };
    }
    return null;
}

function validateActivePlatinumEntry(entry = {}, { sourceOriginIds = [] } = {}) {
    const failures = [];

    if (!SINGLE_KANJI_RE.test(normalizeText(entry.kanji))) {
        failures.push("kanji must be one target kanji");
    }
    if (normalizeStringArray(entry.readingIncludes).length === 0) {
        failures.push("readingIncludes must protect the exact primary reading");
    }
    if (normalizeStringArray(entry.meaningIncludes).length === 0) {
        failures.push("meaningIncludes must protect the learner-facing primary meaning");
    }
    if (normalizeStringArray(entry.kanjiMeaningsIncludes).length === 0) {
        failures.push("kanjiMeaningsIncludes must protect the broader meaning list");
    }
    if (normalizeStringArray(entry.levelIncludes).length === 0) {
        failures.push("levelIncludes must protect the reviewed JLPT level");
    }
    if (normalizeStringArray(entry.exampleIncludes).length === 0) {
        failures.push("exampleIncludes must protect the support example");
    }
    if (normalizeStringArray(entry.notesIncludes).length === 0) {
        failures.push("notesIncludes must protect supporting vocabulary/examples");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required");
    }
    if (!normalizeText(entry.primaryReadingRationale)) {
        failures.push("primaryReadingRationale must explain why this individual-kanji reading was chosen");
    }

    const sourceEvidence = normalizeEvidenceEntries(entry.sourceEvidence);
    if (sourceEvidence.length === 0) {
        failures.push("sourceEvidence must contain structured evidence entries");
    }
    for (const evidence of sourceEvidence) {
        if (!evidence.type || !evidence.source || !evidence.detail) {
            failures.push("sourceEvidence entries must include type, source, and detail");
        }
    }
    const evidenceTypes = new Set(sourceEvidence.map((evidence) => evidence.type));
    for (const requiredType of REQUIRED_KANJI_EVIDENCE_TYPES) {
        if (!evidenceTypes.has(requiredType)) {
            failures.push(`sourceEvidence must include evidence type: ${requiredType}`);
        }
    }
    failures.push(...validateJapaneseSourceEvidence(sourceEvidence, {
        context: "kanji card accuracy",
        requiredUse: "kanji-field-verification",
        sourceOriginIds,
    }));
    if (entry.status === "fixed_then_platinum" && !normalizeText(entry.fixSummary)) {
        failures.push("fixed_then_platinum entries must include fixSummary");
    }
    failures.push(...validateKanjiVerificationLimitations(entry));

    const gates = entry.qualityGates || {};
    for (const gate of REQUIRED_KANJI_QUALITY_GATES) {
        if (gates[gate] !== true) {
            failures.push(`quality gate must be true: ${gate}`);
        }
    }

    return failures;
}

function validateKanjiVerificationLimitations(entry = {}) {
    const failures = [];

    if (entry.verificationLimitations === undefined) {
        return failures;
    }
    if (!Array.isArray(entry.verificationLimitations)) {
        return ["verificationLimitations must be an array when present"];
    }

    for (const [index, rawLimitation] of entry.verificationLimitations.entries()) {
        if (!rawLimitation || typeof rawLimitation !== "object" || Array.isArray(rawLimitation)) {
            failures.push(`verificationLimitations[${index}] must be a structured object`);
            continue;
        }

        const limitation = normalizeKanjiVerificationLimitations([rawLimitation])[0] || {};
        const prefix = `verificationLimitations[${index}]`;
        if (!limitation.field) {
            failures.push(`${prefix}.field is required`);
        } else if (BLOCKED_KANJI_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field cannot be a core kanji-card truth field: ${limitation.field}`);
        } else if (!ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field must be one of: ${ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS.join(", ")}`);
        }
        if (!limitation.status) {
            failures.push(`${prefix}.status is required`);
        } else if (!ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES.includes(limitation.status)) {
            failures.push(`${prefix}.status must be one of: ${ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES.join(", ")}`);
        }
        if (!limitation.label) {
            failures.push(`${prefix}.label is required`);
        } else if (!/\bunverified\b|not verified|limited verification/i.test(limitation.label)) {
            failures.push(`${prefix}.label must visibly say what is unverified or has limited verification`);
        }
        if (!limitation.reviewNote) {
            failures.push(`${prefix}.reviewNote must describe the review attempt and limitation`);
        }
    }

    return failures;
}

function validateNonShippingEntry(entry = {}) {
    const failures = [];

    if (!SINGLE_KANJI_RE.test(normalizeText(entry.kanji))) {
        failures.push("kanji must be one target kanji");
    }
    if (!normalizeText(entry.reviewedAt)) {
        failures.push("reviewedAt is required for deferred and removed entries");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required for deferred and removed entries");
    }
    if (!normalizeText(entry.decisionReason)) {
        failures.push("decisionReason is required for deferred and removed entries");
    }

    return failures;
}

function validateGeneratedKanjiRow(row = {}) {
    const failures = [];
    const kanji = normalizeText(row.kanji);
    const primaryReading = normalizeText(row.primaryReading);
    const audio = normalizeText(row.audio);
    const exactAudioFragment = `kanji-reading-${kanji}-${primaryReading}`;

    if (!SINGLE_KANJI_RE.test(kanji)) {
        failures.push("Kanji field is not one target kanji");
    }
    if (normalizeText(row.displayWord) !== kanji) {
        failures.push("DisplayWord does not equal the target kanji");
    }
    if (normalizeText(row.studyWordKanji)) {
        failures.push("StudyWordKanji must be blank for kanji cards");
    }
    if (!primaryReading) {
        failures.push("PrimaryReading is empty");
    }
    if (!normalizeText(row.meaningJP)) {
        failures.push("MeaningJP is empty");
    }
    if (!normalizeText(row.kanjiMeanings)) {
        failures.push("KanjiMeanings is empty");
    }
    if (!normalizeText(row.notes)) {
        failures.push("Notes are empty");
    }
    if (normalizeText(row.notes).includes("Offline preview built from local data only.")) {
        failures.push("Notes still use the generic offline fallback");
    }
    if (!normalizeText(row.exampleSentence)) {
        failures.push("ExampleSentence is empty");
    }
    if (!normalizeText(row.strokeOrder)) {
        failures.push("StrokeOrder field is empty");
    }
    if (!audio) {
        failures.push("Audio field is empty");
    } else if (!audio.includes("kanji-reading")) {
        failures.push("Audio field is not kanji-reading audio");
    } else if (!audio.includes(exactAudioFragment)) {
        failures.push(`Audio field does not reference exact primary-reading audio: ${exactAudioFragment}`);
    }

    return failures;
}

function validateKanjiEvidenceBindings({ entry = {}, row = {} } = {}) {
    const failures = [];
    const kanji = normalizeText(entry.kanji);
    const primaryReading = normalizeStringArray(entry.readingIncludes)[0] || row.primaryReading;
    const exactAudioFragment = `kanji-reading-${kanji}-${primaryReading}`;
    const sourceEvidence = entry.sourceEvidence || [];

    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "generated-surface",
        label: "generated kanji surface",
        snippets: [kanji, primaryReading, "single-kanji", "meaning", "notes", "example", "audio", "stroke-order"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "japanese-source",
        label: "primary reading, primary meaning, and broader meanings",
        snippets: [
            kanji,
            primaryReading,
            ...normalizeStringArray(entry.meaningIncludes),
            ...normalizeStringArray(entry.kanjiMeaningsIncludes),
        ],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "audio-review",
        label: "exact kanji-reading audio",
        snippets: [kanji, exactAudioFragment],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "stroke-order-review",
        label: "stroke-order target and provenance",
        snippets: [kanji, "visual", "source"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "manual-review",
        label: "final kanji-card product judgment",
        snippets: [kanji, "individual-kanji", "learner"],
    }));
    for (const limitation of normalizeKanjiVerificationLimitations(entry.verificationLimitations)) {
        failures.push(...validateEvidenceSnippets({
            sourceEvidence,
            type: "manual-review",
            label: `verification limitation ${limitation.field}`,
            snippets: [kanji, limitation.label],
        }));
        if (!includesAll(row.notes, [limitation.label])) {
            failures.push(`Notes must include verification limitation label: ${limitation.label}`);
        }
    }

    return failures;
}

function evaluatePlatinumKanjiEntry({
    rows = [],
    entry = {},
    sourceOriginFailures = [],
    sourceOriginIds = [],
} = {}) {
    const status = normalizeText(entry.status);
    const label = normalizeText(entry.kanji) || "(blank)";
    const failures = [];

    if (!ALLOWED_PLATINUM_STATUSES.includes(status)) {
        failures.push(`unsupported platinum status: ${status || "(blank)"}`);
    }

    if (ACTIVE_PLATINUM_STATUSES.includes(status)) {
        failures.push(...sourceOriginFailures);
        failures.push(...validateActivePlatinumEntry(entry, { sourceOriginIds }));
        const row = findKanjiRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (!row) {
            failures.push("active platinum kanji could not be generated");
        } else {
            failures.push(...validateGeneratedKanjiRow(row));
            failures.push(...validateKanjiEvidenceBindings({ entry, row }));
            if (Array.isArray(entry.readingIncludes) && !includesAll(row.primaryReading, entry.readingIncludes)) {
                failures.push(`primary reading did not include: ${entry.readingIncludes.join(", ")}`);
            }
            if (Array.isArray(entry.meaningIncludes) && !includesAll(row.meaningJP, entry.meaningIncludes)) {
                failures.push(`primary meaning did not include: ${entry.meaningIncludes.join(", ")}`);
            }
            if (Array.isArray(entry.kanjiMeaningsIncludes) && !includesAll(row.kanjiMeanings, entry.kanjiMeaningsIncludes)) {
                failures.push(`kanji meanings did not include: ${entry.kanjiMeaningsIncludes.join(", ")}`);
            }
            if (Array.isArray(entry.levelIncludes) && !includesAll(row.levelLabel, entry.levelIncludes)) {
                failures.push(`level label did not include: ${entry.levelIncludes.join(", ")}`);
            }
            if (Array.isArray(entry.exampleIncludes) && !includesAll(row.exampleSentence, entry.exampleIncludes)) {
                failures.push(`example did not include: ${entry.exampleIncludes.join(", ")}`);
            }
            if (Array.isArray(entry.notesIncludes) && !includesAll(row.notes, entry.notesIncludes)) {
                failures.push(`notes did not include: ${entry.notesIncludes.join(", ")}`);
            }
        }
    } else if (NON_SHIPPING_STATUSES.includes(status)) {
        failures.push(...validateNonShippingEntry(entry));
        const row = findKanjiRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (row) {
            failures.push(`${status} kanji still appears in the generated export`);
        }
    } else if (REVIEW_ONLY_STATUSES.includes(status)) {
        failures.push("entry is still needs_review and cannot pass platinum");
    }

    return {
        label,
        kanji: entry.kanji,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
        verificationLimitations: ACTIVE_PLATINUM_STATUSES.includes(status)
            ? normalizeKanjiVerificationLimitations(entry.verificationLimitations)
            : [],
    };
}

function buildMissingPlatinumRows({ rows = [], activeEntries = [] } = {}) {
    return rows
        .filter((row) => !activeEntries.some((entry) => entry.kanji === row.kanji))
        .map((row) => row.kanji)
        .sort();
}

function buildDuplicateActiveEntryLabels(activeEntries = []) {
    const labelsByKey = new Map();
    const keys = [];

    for (const entry of activeEntries) {
        const key = buildPlatinumReviewKey({ kanji: entry.kanji });
        keys.push(key);
        labelsByKey.set(key, entry.kanji || key);
    }

    return findDuplicateValues(keys).map((key) => labelsByKey.get(key) || key);
}

function evaluatePlatinumKanjiReviewSet({
    rows = [],
    entries = [],
    kanjiSourceEvidence = getDefaultJlptKanjiSourceEvidence(),
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeEntries = reviewEntries.filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const nonShippingEntries = reviewEntries.filter((entry) => NON_SHIPPING_STATUSES.includes(normalizeText(entry.status)));
    const needsReviewEntries = reviewEntries.filter((entry) => REVIEW_ONLY_STATUSES.includes(normalizeText(entry.status)));
    const results = reviewEntries.map((entry) => {
        try {
            const sourceOriginIds = resolveKanjiSourceOriginIdsForEntry({
                evidence: kanjiSourceEvidence,
                entry,
            });
            return evaluatePlatinumKanjiEntry({
                rows: generatedRows,
                entry,
                sourceOriginIds,
            });
        } catch (error) {
            return evaluatePlatinumKanjiEntry({
                rows: generatedRows,
                entry,
                sourceOriginFailures: [`could not resolve kanji source-claim origin ids: ${error.message}`],
            });
        }
    });
    const coverageFailures = [];
    const duplicateActiveEntries = buildDuplicateActiveEntryLabels(activeEntries);
    const missingPlatinumRows = requireAllRows
        ? buildMissingPlatinumRows({ rows: generatedRows, activeEntries })
        : [];

    if (!allowEmpty && activeEntries.length === 0) {
        coverageFailures.push("no active platinum entries have been reviewed");
    }
    if (duplicateActiveEntries.length > 0) {
        coverageFailures.push(`duplicate active platinum entries: ${duplicateActiveEntries.join(", ")}`);
    }
    if (missingPlatinumRows.length > 0) {
        coverageFailures.push(`missing platinum entries for generated kanji: ${missingPlatinumRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;
    const verificationLimitationSummary = buildKanjiVerificationLimitationSummary(activeEntries);

    return {
        totalEntries: reviewEntries.length,
        activePlatinumCount: activeEntries.length,
        nonShippingCount: nonShippingEntries.length,
        needsReviewCount: needsReviewEntries.length,
        verificationLimitationCount: verificationLimitationSummary.limitationCount,
        verificationLimitationKanjiCount: verificationLimitationSummary.kanjiCount,
        verificationLimitationFieldCounts: verificationLimitationSummary.fieldCounts,
        verificationLimitations: verificationLimitationSummary.limitations,
        passedCount,
        failedCount,
        passed: failedCount === 0 && coverageFailures.length === 0,
        coverageFailures,
        duplicateActiveEntries,
        missingPlatinumRows,
        results,
    };
}

function formatPlatinumKanjiReviewReport(report = {}, { title = "Japanese Kanji Builder Platinum Kanji Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        `Active platinum cards: ${report.activePlatinumCount || 0}`,
        `Active cards with verification limitations: ${report.verificationLimitationKanjiCount || 0}`,
        `Verification limitations: ${report.verificationLimitationCount || 0}`,
        `Deferred/removed tracked: ${report.nonShippingCount || 0}`,
        `Needs review: ${report.needsReviewCount || 0}`,
        `Passed entries: ${report.passedCount || 0}`,
        `Failed entries: ${report.failedCount || 0}`,
        `Overall result: ${report.passed ? "passing" : "failing"}`,
    ];

    if (Array.isArray(report.coverageFailures) && report.coverageFailures.length > 0) {
        lines.push("", "Coverage failures:");
        for (const failure of report.coverageFailures) {
            lines.push(`- ${failure}`);
        }
    }

    if (Array.isArray(report.missingPlatinumRows) && report.missingPlatinumRows.length > 0) {
        const sampleSize = 30;
        const sample = report.missingPlatinumRows.slice(0, sampleSize);
        lines.push("", `Missing platinum kanji sample (${sample.length}/${report.missingPlatinumRows.length}):`);
        for (const kanji of sample) {
            lines.push(`- ${kanji}`);
        }
        if (report.missingPlatinumRows.length > sampleSize) {
            lines.push(`- ... ${report.missingPlatinumRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${limitation.kanji}: ${limitation.field} (${limitation.status}) - ${limitation.label}`);
        }
    }

    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: ${result.status} ${result.passed ? "pass" : "fail"}`);
        if (!result.passed) {
            for (const failure of result.failures) {
                lines.push(`  ${failure}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    ACTIVE_PLATINUM_STATUSES,
    ALLOWED_PLATINUM_STATUSES,
    ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS,
    ALLOWED_KANJI_VERIFICATION_LIMITATION_STATUSES,
    BLOCKED_KANJI_VERIFICATION_LIMITATION_FIELDS,
    NON_SHIPPING_STATUSES,
    REQUIRED_KANJI_EVIDENCE_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    REVIEW_ONLY_STATUSES,
    buildKanjiVerificationLimitationSummary,
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
    normalizeKanjiVerificationLimitations,
    validateGeneratedKanjiRow,
    validateKanjiVerificationLimitations,
};
