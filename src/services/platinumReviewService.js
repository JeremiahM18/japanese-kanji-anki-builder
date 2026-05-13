const { evaluateGoldenWordReviewSet } = require("./goldenReviewService");
const {
    extractRenderedPitchAccentPattern,
    parsePitchAccentPattern,
} = require("./pitchAccentRenderService");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const {
    GENERATED_PITCH_LABEL,
    arraysMatch,
    isGeneratedPitchAccentSource,
    validateWordPitchAccentSource,
} = require("./wordPitchAccentVerificationService");
const {
    normalizeEvidenceEntries,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
} = require("./platinumEvidenceService");
const {
    buildWordLevelAnchorResult,
    formatWordLevelAnchorFailure,
} = require("./wordLevelAnchorAuditService");

const ACTIVE_PLATINUM_STATUSES = Object.freeze(["platinum", "fixed_then_platinum"]);
const NON_SHIPPING_STATUSES = Object.freeze(["deferred", "removed"]);
const REVIEW_ONLY_STATUSES = Object.freeze(["needs_review"]);
const ALLOWED_PLATINUM_STATUSES = Object.freeze([
    ...ACTIVE_PLATINUM_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const CURRENT_WORD_PLATINUM_REVIEW_STANDARD = "word-platinum-v2-limitation-aware";

const CURRENT_STANDARD_REVALIDATION_SUMMARY_CHECKS = Object.freeze([
    Object.freeze({ label: "generated surface", requiredPatterns: [/generated/i, /surface/i] }),
    Object.freeze({ label: "Japanese source evidence", requiredPatterns: [/japanese[- ]source/i, /evidence/i] }),
    Object.freeze({ label: "example sentence", requiredPatterns: [/example/i, /sentence/i] }),
    Object.freeze({ label: "notes/support surface", requiredPatterns: [/notes?/i, /support/i, /surface/i] }),
    Object.freeze({ label: "reading breakdown", requiredPatterns: [/reading/i, /breakdown/i] }),
    Object.freeze({ label: "labels", requiredPatterns: [/labels?/i] }),
    Object.freeze({ label: "audio", requiredPatterns: [/audio/i] }),
    Object.freeze({ label: "pitch accent", requiredPatterns: [/pitch/i, /accent/i] }),
    Object.freeze({ label: "verification limitations", requiredPatterns: [/verification/i, /limitations?/i] }),
]);

const REQUIRED_WORD_QUALITY_GATES = Object.freeze([
    "belongsInWordDeck",
    "commonOrUseful",
    "learnerFriendly",
    "writtenFormVerified",
    "readingVerified",
    "japaneseVerified",
    "meaningReleaseQuality",
    "exampleReleaseQuality",
    "exampleReadingVerified",
    "breakdownVerified",
    "levelPlacementVerified",
    "labelsVerified",
    "audioExactWordReading",
    "audioArtifactVerified",
    "pitchAccentVerified",
    "pitchAccentSourceVerified",
    "mediaProvenanceVerified",
    "noSilentFallback",
]);

const REQUIRED_WORD_EVIDENCE_TYPES = Object.freeze([
    "generated-surface",
    "golden-review",
    "japanese-source",
    "level-contract",
    "example-review",
    "media-audit",
    "audio-review",
    "pitch-accent-review",
    "label-review",
    "manual-review",
]);

const ALLOWED_WORD_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "audioNaturalness",
    "exampleSupportNuance",
    "notesSupportNuance",
    "pitchAccent",
    "sourceAvailability",
]);

const BLOCKED_WORD_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "word",
    "writtenForm",
    "reading",
    "meaning",
    "exampleSentence",
    "productFit",
]);

const ALLOWED_WORD_VERIFICATION_LIMITATION_STATUSES = Object.freeze([
    "externally_unverified",
    "limited_source",
    "manual_review_only",
]);

const SINGLE_KANJI_WORD_RE = /^\p{Script=Han}$/u;

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

function normalizeLiteralCompare(value) {
    return normalizeText(value)
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function includesAll(haystack, needles = []) {
    const normalizedHaystack = normalizeForCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => normalizedHaystack.includes(normalizeForCompare(needle)));
}

function includesAllLiteral(haystack, needles = []) {
    const normalizedHaystack = normalizeLiteralCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => normalizedHaystack.includes(normalizeLiteralCompare(needle)));
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function normalizeWordVerificationLimitations(value) {
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

function normalizeReviewStandard(value) {
    return normalizeText(value);
}

function validateCurrentWordPlatinumReviewStandard(entry = {}) {
    const failures = [];
    const reviewStandard = normalizeReviewStandard(entry.reviewStandard);
    const revalidatedAt = normalizeText(entry.revalidatedAt);
    const revalidationSummary = normalizeText(entry.revalidationSummary);
    const sourceEvidence = normalizeEvidenceEntries(entry.sourceEvidence);
    const evidenceTypes = new Set(sourceEvidence.map((evidence) => evidence.type));

    if (reviewStandard !== CURRENT_WORD_PLATINUM_REVIEW_STANDARD) {
        failures.push(`reviewStandard must be ${CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revalidatedAt)) {
        failures.push("revalidatedAt must be YYYY-MM-DD for the current word platinum standard");
    }
    if (!revalidationSummary) {
        failures.push("revalidationSummary is required for the current word platinum standard");
    } else {
        for (const check of CURRENT_STANDARD_REVALIDATION_SUMMARY_CHECKS) {
            if (!check.requiredPatterns.every((pattern) => pattern.test(revalidationSummary))) {
                failures.push(`revalidationSummary must mention ${check.label}`);
            }
        }
    }
    if (normalizeStringArray(entry.notesIncludes).length === 0) {
        failures.push("notesIncludes must protect the notes/support surface for the current word platinum standard");
    }
    if (!evidenceTypes.has("current-standard-review")) {
        failures.push("sourceEvidence must include evidence type: current-standard-review for the current word platinum standard");
    }

    return failures;
}

function entryUsesCurrentWordPlatinumStandard(entry = {}) {
    return validateCurrentWordPlatinumReviewStandard(entry).length === 0;
}

function buildWordReviewStandardSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const currentStandardEntries = activeEntries.filter(entryUsesCurrentWordPlatinumStandard);
    const legacyEntries = activeEntries.filter((entry) => !entryUsesCurrentWordPlatinumStandard(entry));

    return {
        currentStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        currentStandardCount: currentStandardEntries.length,
        legacyOrUnversionedCount: legacyEntries.length,
        currentStandardWords: currentStandardEntries
            .map((entry) => formatWordReviewLabel(entry.word, buildExpectedReadingText(entry)))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ja")),
        legacyOrUnversionedWords: legacyEntries
            .map((entry) => formatWordReviewLabel(entry.word, buildExpectedReadingText(entry)))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ja")),
    };
}

function buildWordVerificationLimitationSummary(entries = []) {
    const activeEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const limitationRows = [];
    const fieldCounts = {};

    for (const entry of activeEntries) {
        const limitations = normalizeWordVerificationLimitations(entry.verificationLimitations);
        for (const limitation of limitations) {
            limitationRows.push({
                word: normalizeText(entry.word),
                reading: buildExpectedReadingText(entry),
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
        wordCount: new Set(limitationRows.map((limitation) => `${limitation.word}|${limitation.reading}`).filter(Boolean)).size,
        fieldCounts,
        limitations: limitationRows.sort((left, right) => (
            formatWordReviewLabel(left.word, left.reading).localeCompare(formatWordReviewLabel(right.word, right.reading), "ja")
            || left.field.localeCompare(right.field)
            || left.label.localeCompare(right.label)
        )),
    };
}

function buildExpectedReadingText(entry = {}) {
    return normalizeStringArray(entry.readingIncludes).join(" / ");
}

function buildPlatinumReviewKey({ word = "", reading = "" } = {}) {
    return `${normalizeForCompare(word)}|${normalizeForCompare(reading)}`;
}

function formatWordReviewLabel(word, reading = "") {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord} (${normalizedReading})` : normalizedWord;
}

function wordRowMatchesEntry(row = {}, entry = {}) {
    if (row.word !== entry.word) {
        return false;
    }
    const expectedReadings = normalizeStringArray(entry.readingIncludes);
    if (expectedReadings.length === 0) {
        return true;
    }
    return includesAll(row.reading, expectedReadings);
}

function findWordRowForEntry(rows = [], entry = {}) {
    const matches = rows.filter((row) => wordRowMatchesEntry(row, entry));
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        return {
            word: entry.word,
            error: `ambiguous generated word rows: ${matches.map((row) => formatWordReviewLabel(row.word, row.reading)).join(", ")}`,
        };
    }
    return null;
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

function validateActivePlatinumEntry(entry = {}, { requireCurrentReviewStandard = false } = {}) {
    const failures = [];

    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    if (normalizeStringArray(entry.readingIncludes).length === 0) {
        failures.push("readingIncludes must name the exact reviewed reading");
    }
    if (normalizeStringArray(entry.meaningIncludes).length === 0) {
        failures.push("meaningIncludes must protect the learner-facing meaning");
    }
    if (normalizeStringArray(entry.jlptLevelIncludes).length === 0) {
        failures.push("jlptLevelIncludes must protect the displayed level label");
    }
    if (normalizeStringArray(entry.coverageRoleIncludes).length === 0) {
        failures.push("coverageRoleIncludes must protect the card role");
    }
    if (normalizeStringArray(entry.breakdownIncludes).length === 0) {
        failures.push("breakdownIncludes must protect the reading and kanji breakdown");
    }
    if (normalizeStringArray(entry.focusIncludes).length === 0) {
        failures.push("focusIncludes must protect the reviewed focus kanji");
    }
    if (normalizeStringArray(entry.coversReadingIncludes).length === 0) {
        failures.push("coversReadingIncludes must protect the reviewed reading-coverage labels");
    }
    if (normalizeStringArray(entry.exampleIncludes).length === 0) {
        failures.push("exampleIncludes must protect the release-quality example");
    }
    if (normalizeStringArray(entry.pitchAccentIncludes).length === 0) {
        failures.push("pitchAccentIncludes must protect the reviewed pitch accent");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(entry.reviewedAt))) {
        failures.push("reviewedAt must be YYYY-MM-DD");
    }
    if (!normalizeText(entry.reviewer)) {
        failures.push("reviewer is required");
    }
    if (!normalizeText(entry.selectionRationale)) {
        failures.push("selectionRationale must explain why this word ships in the reviewed level");
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
    for (const requiredType of REQUIRED_WORD_EVIDENCE_TYPES) {
        if (!evidenceTypes.has(requiredType)) {
            failures.push(`sourceEvidence must include evidence type: ${requiredType}`);
        }
    }
    failures.push(...validateJapaneseSourceEvidence(sourceEvidence, {
        context: "word card accuracy",
        alternativeRequiredUses: SINGLE_KANJI_WORD_RE.test(normalizeText(entry.word))
            ? ["single-kanji-word-field-verification"]
            : [],
        requiredUse: "word-field-verification",
    }));
    if (entry.status === "fixed_then_platinum" && !normalizeText(entry.fixSummary)) {
        failures.push("fixed_then_platinum entries must include fixSummary");
    }
    if (
        requireCurrentReviewStandard
        || entry.reviewStandard !== undefined
        || entry.revalidatedAt !== undefined
        || entry.revalidationSummary !== undefined
    ) {
        failures.push(...validateCurrentWordPlatinumReviewStandard(entry));
    }
    failures.push(...validateWordVerificationLimitations(entry));

    const gates = entry.qualityGates || {};
    for (const gate of REQUIRED_WORD_QUALITY_GATES) {
        if (gates[gate] !== true) {
            failures.push(`quality gate must be true: ${gate}`);
        }
    }

    return failures;
}

function validateWordVerificationLimitations(entry = {}) {
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

        const limitation = normalizeWordVerificationLimitations([rawLimitation])[0] || {};
        const prefix = `verificationLimitations[${index}]`;
        if (!limitation.field) {
            failures.push(`${prefix}.field is required`);
        } else if (BLOCKED_WORD_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field cannot be a core word-card truth field: ${limitation.field}`);
        } else if (!ALLOWED_WORD_VERIFICATION_LIMITATION_FIELDS.includes(limitation.field)) {
            failures.push(`${prefix}.field must be one of: ${ALLOWED_WORD_VERIFICATION_LIMITATION_FIELDS.join(", ")}`);
        }
        if (!limitation.status) {
            failures.push(`${prefix}.status is required`);
        } else if (!ALLOWED_WORD_VERIFICATION_LIMITATION_STATUSES.includes(limitation.status)) {
            failures.push(`${prefix}.status must be one of: ${ALLOWED_WORD_VERIFICATION_LIMITATION_STATUSES.join(", ")}`);
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

function validateWordEvidenceBindings({
    entry = {},
    requireCurrentReviewStandard = false,
    row = {},
    sourcePitchAccent = null,
} = {}) {
    const failures = [];
    const readings = normalizeStringArray(entry.readingIncludes);
    const reading = readings[0] || row.reading;
    const wordLabel = `${entry.word}|${reading}`;
    const expectedAudioFragment = `word-reading-${entry.word}-${reading}`;
    const sourceEvidence = entry.sourceEvidence || [];
    const requiresCurrentStandardEvidence = (
        requireCurrentReviewStandard
        || entry.reviewStandard !== undefined
        || entry.revalidatedAt !== undefined
        || entry.revalidationSummary !== undefined
    );

    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "generated-surface",
        label: "generated word surface",
        snippets: [wordLabel, "word", "reading", "meaning", "example", "audio"],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "japanese-source",
        label: "written form, reading, meaning, and example",
        snippets: [wordLabel, ...readings, ...normalizeStringArray(entry.meaningIncludes), ...normalizeStringArray(entry.exampleIncludes)],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "level-contract",
        label: "word level placement",
        snippets: [wordLabel, ...normalizeStringArray(entry.jlptLevelIncludes)],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "example-review",
        label: "example sentence and reading",
        snippets: [wordLabel, ...readings, ...normalizeStringArray(entry.exampleIncludes)],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "audio-review",
        label: "exact word-reading audio",
        snippets: [wordLabel, expectedAudioFragment],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "pitch-accent-review",
        label: "pitch accent source and rendered value",
        snippets: [
            wordLabel,
            sourcePitchAccent?.sourceId,
            sourcePitchAccent?.pattern,
            ...normalizeStringArray(entry.pitchAccentIncludes),
        ],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "label-review",
        label: "JLPT, coverage, focus, and reading labels",
        snippets: [
            wordLabel,
            ...normalizeStringArray(entry.jlptLevelIncludes),
            ...normalizeStringArray(entry.coverageRoleIncludes),
            ...normalizeStringArray(entry.focusIncludes),
            ...normalizeStringArray(entry.coversReadingIncludes),
        ],
    }));
    failures.push(...validateEvidenceSnippets({
        sourceEvidence,
        type: "manual-review",
        label: "final word-card product judgment",
        snippets: [wordLabel, "common", "learner"],
    }));
    if (requiresCurrentStandardEvidence) {
        const currentStandardSnippets = [
            wordLabel,
            ...readings,
            ...normalizeStringArray(entry.meaningIncludes),
            ...normalizeStringArray(entry.exampleIncludes),
            ...normalizeStringArray(entry.breakdownIncludes),
            ...normalizeStringArray(entry.jlptLevelIncludes),
            ...normalizeStringArray(entry.coverageRoleIncludes),
            ...normalizeStringArray(entry.focusIncludes),
            ...normalizeStringArray(entry.coversReadingIncludes),
            ...normalizeStringArray(entry.notesIncludes),
            ...normalizeStringArray(entry.pitchAccentIncludes),
            sourcePitchAccent?.sourceId,
            sourcePitchAccent?.pattern,
            expectedAudioFragment,
            "generated surface",
            "Japanese-source",
            "example sentence",
            "notes/support surface",
            "reading breakdown",
            "meaning",
            "labels",
            "audio",
            "pitch accent",
            "media",
            "release",
            "common",
            "useful",
            "learner-friendly",
            "level-appropriate",
            "natural",
            "verification limitations",
        ];
        const limitations = normalizeWordVerificationLimitations(entry.verificationLimitations);
        if (limitations.length === 0) {
            currentStandardSnippets.push("no active limitations");
        } else {
            currentStandardSnippets.push(...limitations.map((limitation) => limitation.label));
        }
        failures.push(...validateEvidenceSnippets({
            sourceEvidence,
            type: "current-standard-review",
            label: "current-standard whole-card revalidation",
            snippets: currentStandardSnippets,
        }));
    }
    for (const limitation of normalizeWordVerificationLimitations(entry.verificationLimitations)) {
        failures.push(...validateEvidenceSnippets({
            sourceEvidence,
            type: "manual-review",
            label: `verification limitation ${limitation.field}`,
            snippets: [wordLabel, limitation.label],
        }));
        if (!includesAll(row.notes, [limitation.label])) {
            failures.push(`Notes must include verification limitation label: ${limitation.label}`);
        }
    }

    return failures;
}

function validateNonShippingEntry(entry = {}) {
    const failures = [];

    if (!normalizeText(entry.word)) {
        failures.push("word is required");
    }
    if (normalizeStringArray(entry.readingIncludes).length === 0) {
        failures.push("readingIncludes must identify the deferred or removed row");
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

function validateGeneratedPlatinumRow(row = {}) {
    const failures = [];

    if (!normalizeText(row.readingBreakdown)) {
        failures.push("reading breakdown is empty");
    }
    if (!normalizeText(row.audio)) {
        failures.push("audio field is empty");
    }
    if (!normalizeText(row.pitchAccent)) {
        failures.push("pitch accent field is empty");
    }
    if (!normalizeText(row.jlptLevel)) {
        failures.push("JLPT level is empty");
    }
    if (!normalizeText(row.coverageRole)) {
        failures.push("coverage role is empty");
    }
    if (!normalizeText(row.exampleSentence)) {
        failures.push("example sentence is empty");
    }

    return failures;
}

function parseJlptLevelLabel(value) {
    const match = String(value || "").match(/N([1-5])/i);
    return match ? Number(match[1]) : null;
}

function resolvePlatinumDeckLevel({ row = {}, entry = {} } = {}) {
    const rowLevel = parseJlptLevelLabel(row.jlptLevel);
    if (Number.isInteger(rowLevel)) {
        return rowLevel;
    }

    for (const value of normalizeStringArray(entry.jlptLevelIncludes)) {
        const entryLevel = parseJlptLevelLabel(value);
        if (Number.isInteger(entryLevel)) {
            return entryLevel;
        }
    }

    return null;
}

function validateSameLevelWordAnchor({ row = {}, entry = {}, kanjiLevelData = null } = {}) {
    if (!kanjiLevelData) {
        return [];
    }

    const deckLevel = resolvePlatinumDeckLevel({ row, entry });
    const result = buildWordLevelAnchorResult({
        written: row.word || entry.word,
        deckLevel,
        learnerFitReason: entry.levelPlacementReason || entry.selectionRationale || "",
        kanjiLevelData,
    });

    return result.valid ? [] : [formatWordLevelAnchorFailure(result)];
}

function evaluatePlatinumEntry({
    requireCurrentReviewStandard = false,
    rows = [],
    entry = {},
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    const status = normalizeText(entry.status);
    const label = formatWordReviewLabel(entry.word, buildExpectedReadingText(entry));
    const failures = [];

    if (!ALLOWED_PLATINUM_STATUSES.includes(status)) {
        failures.push(`unsupported platinum status: ${status || "(blank)"}`);
    }

    if (ACTIVE_PLATINUM_STATUSES.includes(status)) {
        failures.push(...validateActivePlatinumEntry(entry, { requireCurrentReviewStandard }));
        const row = findWordRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (!row) {
            failures.push("active platinum word could not be generated");
        } else {
            failures.push(...validateGeneratedPlatinumRow(row));
            failures.push(...validateSameLevelWordAnchor({ row, entry, kanjiLevelData }));
            const fieldReport = evaluateGoldenWordReviewSet({ rows, expectations: [entry] });
            const fieldResult = fieldReport.results?.[0];
            if (fieldResult && !fieldResult.passed) {
                failures.push(...fieldResult.failures);
            }
            if (fieldReport.coverageFailures?.length > 0) {
                failures.push(...fieldReport.coverageFailures);
            }
            if (!includesAllLiteral(row.pitchAccent, entry.pitchAccentIncludes)) {
                failures.push(`pitch accent did not include: ${normalizeStringArray(entry.pitchAccentIncludes).join(", ")}`);
            }
            for (const reading of normalizeStringArray(entry.readingIncludes)) {
                const expectedAudioFragment = `word-reading-${entry.word}-${reading}`;
                if (!normalizeText(row.audio).includes(expectedAudioFragment)) {
                    failures.push(`audio field did not include exact word-reading asset fragment: ${expectedAudioFragment}`);
                }
            }
            const wordKey = buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeStringArray(entry.readingIncludes)[0] || row.reading,
            });
            const sourcePitchAccent = wordPitchAccentData?.entries?.[wordKey] || null;
            failures.push(...validateWordEvidenceBindings({
                entry,
                requireCurrentReviewStandard,
                row,
                sourcePitchAccent,
            }));
            const expectedAccents = parsePitchAccentPattern(sourcePitchAccent?.pattern || "");
            const renderedAccents = extractRenderedPitchAccentPattern(row.pitchAccent);
            if (!sourcePitchAccent?.sourceId) {
                failures.push(`pitch accent source entry missing for reviewed word: ${wordKey}`);
            } else if (expectedAccents.length === 0) {
                failures.push(`pitch accent source pattern is invalid for reviewed word: ${wordKey}`);
            } else if (!arraysMatch(renderedAccents, expectedAccents)) {
                failures.push(`pitch accent rendered output did not match source pattern for ${wordKey}: expected ${expectedAccents.join("/")}, rendered ${renderedAccents.join("/") || "(none)"}`);
            }
            if (sourcePitchAccent?.sourceId) {
                const sourceIdentityFailures = validateWordPitchAccentSource({
                    word: entry.word,
                    reading: normalizeStringArray(entry.readingIncludes)[0] || row.reading,
                    sourceEntry: sourcePitchAccent,
                    sources: wordPitchAccentData?.sources || {},
                });
                for (const failure of sourceIdentityFailures) {
                    failures.push(`pitch accent source validation failed for ${wordKey}: ${failure}`);
                }
                if (
                    isGeneratedPitchAccentSource({
                        sourceId: sourcePitchAccent.sourceId,
                        source: wordPitchAccentData?.sources?.[sourcePitchAccent.sourceId],
                    })
                    && !includesAllLiteral(row.pitchAccent, [GENERATED_PITCH_LABEL])
                ) {
                    failures.push(`generated pitch accent source must be visibly labeled on the card: ${wordKey}`);
                }
            }
        }
    } else if (NON_SHIPPING_STATUSES.includes(status)) {
        failures.push(...validateNonShippingEntry(entry));
        const row = findWordRowForEntry(rows, entry);
        if (row?.error) {
            failures.push(row.error);
        } else if (row) {
            failures.push(`${status} word still appears in the generated export`);
        }
    } else if (REVIEW_ONLY_STATUSES.includes(status)) {
        failures.push("entry is still needs_review and cannot pass platinum");
    }

    return {
        label,
        word: entry.word,
        status: status || "(blank)",
        passed: failures.length === 0,
        failures,
        verificationLimitations: ACTIVE_PLATINUM_STATUSES.includes(status)
            ? normalizeWordVerificationLimitations(entry.verificationLimitations)
            : [],
    };
}

function buildMissingPlatinumRows({ rows = [], activeEntries = [] } = {}) {
    return rows
        .filter((row) => !activeEntries.some((entry) => wordRowMatchesEntry(row, entry)))
        .map((row) => formatWordReviewLabel(row.word, row.reading))
        .sort();
}

function buildDuplicateActiveEntryLabels(activeEntries = []) {
    const labelsByKey = new Map();
    const keys = [];

    for (const entry of activeEntries) {
        const reading = buildExpectedReadingText(entry);
        const key = buildPlatinumReviewKey({ word: entry.word, reading });
        keys.push(key);
        labelsByKey.set(key, formatWordReviewLabel(entry.word, reading));
    }

    return findDuplicateValues(keys).map((key) => labelsByKey.get(key) || key);
}

function evaluatePlatinumWordReviewSet({
    rows = [],
    entries = [],
    wordPitchAccentData = {},
    kanjiLevelData = null,
    requireCurrentReviewStandard = false,
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeEntries = reviewEntries.filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status)));
    const reviewStandardSummary = buildWordReviewStandardSummary(activeEntries);
    const currentStandardEntries = activeEntries.filter(entryUsesCurrentWordPlatinumStandard);
    const nonShippingEntries = reviewEntries.filter((entry) => NON_SHIPPING_STATUSES.includes(normalizeText(entry.status)));
    const needsReviewEntries = reviewEntries.filter((entry) => REVIEW_ONLY_STATUSES.includes(normalizeText(entry.status)));
    const results = reviewEntries.map((entry) => evaluatePlatinumEntry({
        rows: generatedRows,
        entry,
        wordPitchAccentData,
        kanjiLevelData,
        requireCurrentReviewStandard,
    }));
    const coverageFailures = [];
    const duplicateActiveEntries = buildDuplicateActiveEntryLabels(activeEntries);
    const missingPlatinumRows = requireAllRows
        ? buildMissingPlatinumRows({ rows: generatedRows, activeEntries })
        : [];
    const missingCurrentStandardRows = requireAllRows && requireCurrentReviewStandard
        ? buildMissingPlatinumRows({ rows: generatedRows, activeEntries: currentStandardEntries })
        : [];

    if (!allowEmpty && activeEntries.length === 0) {
        coverageFailures.push("no active platinum entries have been reviewed");
    }
    if (duplicateActiveEntries.length > 0) {
        coverageFailures.push(`duplicate active platinum entries: ${duplicateActiveEntries.join(", ")}`);
    }
    if (missingPlatinumRows.length > 0) {
        coverageFailures.push(`missing platinum entries for generated words: ${missingPlatinumRows.length}`);
    }
    if (missingCurrentStandardRows.length > 0) {
        coverageFailures.push(`missing current-standard platinum entries for generated words: ${missingCurrentStandardRows.length}`);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const failedCount = results.length - passedCount;
    const verificationLimitationSummary = buildWordVerificationLimitationSummary(activeEntries);

    return {
        totalEntries: reviewEntries.length,
        activePlatinumCount: activeEntries.length,
        currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        currentStandardPlatinumCount: reviewStandardSummary.currentStandardCount,
        legacyOrUnversionedPlatinumCount: reviewStandardSummary.legacyOrUnversionedCount,
        currentStandardWords: reviewStandardSummary.currentStandardWords,
        legacyOrUnversionedWords: reviewStandardSummary.legacyOrUnversionedWords,
        nonShippingCount: nonShippingEntries.length,
        needsReviewCount: needsReviewEntries.length,
        verificationLimitationCount: verificationLimitationSummary.limitationCount,
        verificationLimitationWordCount: verificationLimitationSummary.wordCount,
        verificationLimitationFieldCounts: verificationLimitationSummary.fieldCounts,
        verificationLimitations: verificationLimitationSummary.limitations,
        passedCount,
        failedCount,
        passed: failedCount === 0 && coverageFailures.length === 0,
        coverageFailures,
        duplicateActiveEntries,
        missingPlatinumRows,
        missingCurrentStandardRows,
        results,
    };
}

function formatPlatinumWordReviewReport(report = {}, { title = "Japanese Kanji Builder Platinum Word Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        `Active platinum cards: ${report.activePlatinumCount || 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`,
        `Current-standard platinum cards: ${report.currentStandardPlatinumCount || 0}`,
        `Legacy/unversioned platinum cards: ${report.legacyOrUnversionedPlatinumCount || 0}`,
        `Active cards with verification limitations: ${report.verificationLimitationWordCount || 0}`,
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
        lines.push("", `Missing platinum row sample (${sample.length}/${report.missingPlatinumRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (report.missingPlatinumRows.length > sampleSize) {
            lines.push(`- ... ${report.missingPlatinumRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.missingCurrentStandardRows) && report.missingCurrentStandardRows.length > 0) {
        const sampleSize = 30;
        const sample = report.missingCurrentStandardRows.slice(0, sampleSize);
        lines.push("", `Missing current-standard platinum row sample (${sample.length}/${report.missingCurrentStandardRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (report.missingCurrentStandardRows.length > sampleSize) {
            lines.push(`- ... ${report.missingCurrentStandardRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${formatWordReviewLabel(limitation.word, limitation.reading)} ${limitation.field}: ${limitation.label} (${limitation.status})`);
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
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REQUIRED_WORD_EVIDENCE_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    REVIEW_ONLY_STATUSES,
    entryUsesCurrentWordPlatinumStandard,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
};
