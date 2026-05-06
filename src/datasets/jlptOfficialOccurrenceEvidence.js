const fs = require("node:fs");

const { z } = require("zod");

const OFFICIAL_OCCURRENCE_ROW_FIELDS = Object.freeze([
    "level",
    "sourcePdf",
    "section",
    "page",
    "questionRef",
    "observedKanji",
]);
const DEFAULT_OCCURRENCE_POLICY = Object.freeze({
    noDeckMutation: true,
    noAssignmentTruth: true,
    storeQuestionText: false,
});

const jlptLevelSchema = z.preprocess((value) => {
    const match = String(value || "").trim().match(/^n?([1-5])$/i);
    return match ? `N${match[1]}` : value;
}, z.enum(["N1", "N2", "N3", "N4", "N5"]));

const positivePageSchema = z.preprocess((value) => {
    if (typeof value === "number") {
        return value;
    }
    const text = String(value || "").trim();
    return /^\d+$/.test(text) ? Number(text) : value;
}, z.number().int().min(1));

const singleKanjiSchema = z.string().min(1).refine((value) => (
    Array.from(value).length === 1 && /^\p{Script=Han}$/u.test(value)
), {
    message: "observedKanji must be exactly one kanji character",
});

const occurrenceRowSchema = z.object({
    level: jlptLevelSchema,
    sourcePdf: z.string().min(1),
    section: z.string().min(1),
    page: positivePageSchema,
    questionRef: z.string().min(1),
    observedKanji: singleKanjiSchema,
}).strict();

const occurrencePolicySchema = z.object({
    noDeckMutation: z.boolean().default(true),
    noAssignmentTruth: z.boolean().default(true),
    storeQuestionText: z.boolean().default(false),
    notes: z.string().optional(),
}).strict().default(DEFAULT_OCCURRENCE_POLICY);

const occurrenceManifestSchema = z.object({
    version: z.number().int().min(1).default(1),
    policy: occurrencePolicySchema,
    occurrences: z.array(occurrenceRowSchema).default([]),
}).strict();

function assertOccurrencePolicy(policy = {}) {
    if (policy.noDeckMutation !== true) {
        throw new Error("Official JLPT occurrence evidence must keep noDeckMutation=true.");
    }
    if (policy.noAssignmentTruth !== true) {
        throw new Error("Official JLPT occurrence evidence must keep noAssignmentTruth=true.");
    }
    if (policy.storeQuestionText !== false) {
        throw new Error("Official JLPT occurrence evidence must keep storeQuestionText=false.");
    }
}

function sortOccurrenceRows(rows = []) {
    return [...rows].sort((a, b) => (
        a.level.localeCompare(b.level)
        || a.sourcePdf.localeCompare(b.sourcePdf)
        || a.section.localeCompare(b.section)
        || a.page - b.page
        || a.questionRef.localeCompare(b.questionRef, "ja")
        || a.observedKanji.localeCompare(b.observedKanji, "ja")
    ));
}

function normalizeJlptOfficialOccurrenceEvidence(value = {}) {
    const parsed = occurrenceManifestSchema.parse(value);
    assertOccurrencePolicy(parsed.policy);
    return {
        ...parsed,
        occurrences: sortOccurrenceRows(parsed.occurrences),
    };
}

function loadJlptOfficialOccurrenceEvidence(filePath) {
    return normalizeJlptOfficialOccurrenceEvidence(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function formatJlptOfficialOccurrenceEvidenceJson(manifest = {}) {
    return `${JSON.stringify(normalizeJlptOfficialOccurrenceEvidence(manifest), null, 2)}\n`;
}

module.exports = {
    OFFICIAL_OCCURRENCE_ROW_FIELDS,
    formatJlptOfficialOccurrenceEvidenceJson,
    loadJlptOfficialOccurrenceEvidence,
    normalizeJlptOfficialOccurrenceEvidence,
    occurrenceManifestSchema,
    occurrenceRowSchema,
};
