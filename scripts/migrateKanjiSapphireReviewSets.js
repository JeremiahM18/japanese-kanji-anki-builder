const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireKanjiReviewService");

const LEGACY_KANJI_PLATINUM_REVIEW_STANDARD = "kanji-platinum-v3-evidence-lanes";
const DEFAULT_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

function parseArgs(argv) {
    const options = {
        levels: [...DEFAULT_LEVELS],
        migratedAt: new Date().toISOString().slice(0, 10),
        preserveTargetOnly: false,
        unknownArgs: [],
        write: false,
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--preserve-target-only") {
            options.preserveTargetOnly = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels")
                .map((value) => Number(String(value).replace(/^N/i, "")))
                .filter((level) => DEFAULT_LEVELS.includes(level));
        } else if (arg.startsWith("--migrated-at=")) {
            options.migratedAt = parseStringOption(arg, "migrated-at");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForCompare(value) {
    return normalizeText(value)
        .replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gu, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/&quot;/g, "\"")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function splitGlosses(value) {
    return normalizeText(value)
        .split(/\s+\/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function includesAll(haystack, needles = []) {
    const normalizedHaystack = normalizeForCompare(haystack);
    return (Array.isArray(needles) ? needles : []).every((needle) => (
        normalizedHaystack.includes(normalizeForCompare(needle))
    ));
}

function mapStatus(status) {
    if (status === "platinum") {
        return "sapphire";
    }
    if (status === "fixed_then_platinum") {
        return "fixed_then_sapphire";
    }
    return status;
}

function mapReviewStandard(value) {
    return value === LEGACY_KANJI_PLATINUM_REVIEW_STANDARD
        ? CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD
        : value;
}

function replaceLaneTerms(value) {
    return normalizeText(value)
        .replace(/kanji-platinum-rereview-rubric-v1/g, "kanji-sapphire-structural-review-rubric-v1")
        .replace(/kanji-sapphire-rereview-rubric-v1/g, "kanji-sapphire-structural-review-rubric-v1")
        .replaceAll(LEGACY_KANJI_PLATINUM_REVIEW_STANDARD, CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD)
        .replace(/fixed_then_platinum/g, "fixed_then_sapphire")
        .replace(/platinum product review/gi, "Sapphire product review")
        .replace(/core N([1-5]) current-standard card-quality Platinum batch/g, "core N$1 current-standard Sapphire card-quality batch")
        .replace(/N([1-5]) card-quality Platinum batch/g, "N$1 Sapphire card-quality batch")
        .replace(/card-quality Platinum batch/g, "Sapphire card-quality batch")
        .replace(/card-quality Platinum compatibility review/g, "Sapphire card-quality review")
        .replace(/card-quality Platinum review/g, "Sapphire card-quality review")
        .replace(/card-quality Platinum evidence/g, "Sapphire card-quality evidence")
        .replace(/structural Platinum card review/g, "Sapphire structural/card-quality review")
        .replace(/structural Platinum evidence/g, "Sapphire structural/card-quality evidence")
        .replace(/structural Platinum-only/g, "Sapphire structural/card-quality only")
        .replace(/structural Platinum/g, "Sapphire structural/card-quality")
        .replace(/current-standard card-quality Platinum evidence/g, "current-standard Sapphire card-quality evidence")
        .replace(/current-standard card-quality Platinum review/g, "current-standard Sapphire card-quality review")
        .replace(/current N([1-5]) card-quality Platinum/g, "current N$1 Sapphire card-quality")
        .replace(/current N([1-5]) structural Platinum/g, "current N$1 Sapphire structural/card-quality")
        .replace(/this Platinum card-field review/g, "this Sapphire card-field review")
        .replace(/Platinum card-field review/g, "Sapphire card-field review")
        .replace(/Platinum rationale/g, "Sapphire rationale")
        .replace(/Platinum batch/g, "Sapphire batch")
        .replace(/Platinum restart/g, "Sapphire structural-lane restart")
        .replace(/Platinum promotion/g, "Sapphire promotion")
        .replace(/Fixed before Platinum/g, "Fixed before Sapphire")
        .replace(/before Platinum/g, "before Sapphire")
        .replace(/before platinum/g, "before Sapphire")
        .replace(/current kanji platinum standard/gi, "current kanji Sapphire standard")
        .replace(/Platinum verifies/g, "Sapphire verifies")
        .replace(/Platinum evidence/g, "Sapphire evidence")
        .replace(/Platinum supports/g, "Sapphire supports")
        .replace(/platinum example/g, "Sapphire example")
        .replace(/Obsidian proof must still come from substantive rereviewProvenance/g, "Obsidian proof must still come from separate Obsidian proof")
        .replace(/Obsidian proof is recorded separately only when rereviewProvenance is present/g, "Obsidian proof must be recorded separately through its own proof lane")
        .replace(/no Obsidian rereviewProvenance is recorded/g, "no Obsidian proof is recorded")
        .replace(/non-mechanical rereview event/g, "non-mechanical Obsidian certification event");
}

function normalizeAuditLaneTerms(value, keyPath = []) {
    const key = keyPath[keyPath.length - 1] || "";
    if (keyPath.includes("migrationBoundary") || key === "commandsReviewed") {
        return value;
    }
    if (typeof value === "string") {
        return replaceLaneTerms(value);
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => normalizeAuditLaneTerms(item, [...keyPath, String(index)]));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([entryKey, entryValue]) => [
                entryKey,
                normalizeAuditLaneTerms(entryValue, [...keyPath, entryKey]),
            ])
        );
    }
    return value;
}

function migrateEvidenceEntries(entries = []) {
    return (Array.isArray(entries) ? entries : []).map((entry) => {
        const migrated = { ...entry };
        if (typeof migrated.detail === "string") {
            migrated.detail = replaceLaneTerms(migrated.detail);
        }
        if (typeof migrated.source === "string" && !/^npm run deck:platinum/.test(migrated.source)) {
            migrated.source = replaceLaneTerms(migrated.source);
        }
        return migrated;
    });
}

function migrateAudit(audit = {}, { migratedAt, fromReviewSetPath, level } = {}) {
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
        return null;
    }

    const migrated = normalizeAuditLaneTerms(JSON.parse(JSON.stringify(audit)));
    migrated.auditType = replaceLaneTerms(migrated.auditType || "kanji-sapphire-card-quality-review")
        .replace(/platinum/g, "sapphire");
    migrated.migrationBoundary = {
        migratedAt,
        migratedFrom: fromReviewSetPath,
        migrationType: "platinum-compatibility-to-first-class-sapphire",
        level,
        legacyCommandNamesPreserved: true,
        authority: "Representation migration from the former structural/card-quality Platinum compatibility lane into first-class Sapphire. This is not Platinum content certification, Obsidian proof, or release readiness.",
    };

    if (migrated.batch?.id) {
        migrated.batch.id = migrated.batch.id.replace(/platinum/g, "sapphire");
    }
    if (migrated.actualCardDataReview?.reviewStandard) {
        migrated.actualCardDataReview.reviewStandard = mapReviewStandard(migrated.actualCardDataReview.reviewStandard);
    }
    if (migrated.actualCardDataReview?.reviewerDecision) {
        migrated.actualCardDataReview.reviewerDecision = replaceLaneTerms(migrated.actualCardDataReview.reviewerDecision);
    }
    if (migrated.levelPlacementReview?.reviewerDecision) {
        migrated.levelPlacementReview.reviewerDecision = replaceLaneTerms(migrated.levelPlacementReview.reviewerDecision);
    }
    if (migrated.exampleSentenceReview?.reviewerJudgment) {
        migrated.exampleSentenceReview.reviewerJudgment = replaceLaneTerms(migrated.exampleSentenceReview.reviewerJudgment);
    }
    if (migrated.nlpReview?.reviewerDecision) {
        migrated.nlpReview.reviewerDecision = replaceLaneTerms(migrated.nlpReview.reviewerDecision);
    }
    if (migrated.mediaReview?.releaseQaBoundary) {
        migrated.mediaReview.releaseQaBoundary = replaceLaneTerms(migrated.mediaReview.releaseQaBoundary);
    }
    if (migrated.limitationDecision?.reviewerDecision) {
        migrated.limitationDecision.reviewerDecision = replaceLaneTerms(migrated.limitationDecision.reviewerDecision);
    }
    if (migrated.rubricReview) {
        migrated.rubricReview.rubricVersion = replaceLaneTerms(migrated.rubricReview.rubricVersion || "")
            .replace(/platinum/g, "sapphire");
        migrated.rubricReview.structuralSapphire = migrated.rubricReview.structuralPlatinum ?? migrated.rubricReview.structuralSapphire;
        migrated.rubricReview.cardQualitySapphire = migrated.rubricReview.cardQualityPlatinum ?? migrated.rubricReview.cardQualitySapphire;
        delete migrated.rubricReview.structuralPlatinum;
        delete migrated.rubricReview.cardQualityPlatinum;
        if (migrated.rubricReview.reviewerDecision) {
            migrated.rubricReview.reviewerDecision = replaceLaneTerms(migrated.rubricReview.reviewerDecision);
        }
    }
    if (migrated.trackedSourceContractBoundary?.reason) {
        migrated.trackedSourceContractBoundary.reason = replaceLaneTerms(migrated.trackedSourceContractBoundary.reason);
    }

    return migrated;
}

function normalizeExistingSapphireEntry(entry = {}) {
    const migrated = JSON.parse(JSON.stringify(entry));
    if (migrated.revalidationSummary) {
        migrated.revalidationSummary = replaceLaneTerms(migrated.revalidationSummary);
    }
    if (migrated.fixSummary) {
        migrated.fixSummary = replaceLaneTerms(migrated.fixSummary);
    }
    migrated.sourceEvidence = migrateEvidenceEntries(migrated.sourceEvidence);
    migrated.internalChecks = migrateEvidenceEntries(migrated.internalChecks);
    migrated.reviewEvidence = migrateEvidenceEntries(migrated.reviewEvidence);
    if (migrated.sapphireReviewAudit) {
        migrated.sapphireReviewAudit = normalizeAuditLaneTerms(migrated.sapphireReviewAudit);
    }
    recomputeGeneratedSurfaceChecks(migrated);
    return migrated;
}

function normalizePrimaryMeaningIncludes(entry = {}) {
    const surface = entry.sapphireReviewAudit?.generatedSurface
        || entry.platinumReviewAudit?.generatedSurface
        || {};
    if (surface.hardChecks?.meaningProtected !== false) {
        return entry.meaningIncludes;
    }
    const primaryMeanings = splitGlosses(surface.meaningJP);
    const sourceText = [
        ...(entry.sourceEvidence || []).map((evidence) => evidence.detail || ""),
        ...(entry.reviewEvidence || []).map((evidence) => evidence.detail || ""),
    ].join(" ");

    return primaryMeanings.length > 0 && includesAll(sourceText, primaryMeanings)
        ? primaryMeanings
        : entry.meaningIncludes;
}

function recomputeGeneratedSurfaceChecks(entry = {}) {
    const surface = entry.sapphireReviewAudit?.generatedSurface;
    if (!surface?.hardChecks) {
        return;
    }

    surface.hardChecks.meaningProtected = includesAll(surface.meaningJP, entry.meaningIncludes);
    surface.hardChecks.kanjiMeaningsProtected = includesAll(surface.kanjiMeanings, entry.kanjiMeaningsIncludes);
    surface.hardChecks.notesProtected = includesAll(surface.notes, entry.notesIncludes);
    surface.hardChecks.exampleProtected = includesAll(surface.exampleSentence, entry.exampleIncludes);
    surface.hardChecksPassed = Object.values(surface.hardChecks).every((value) => value === true);
}

function migrateEntry(entry = {}, { level, migratedAt, fromReviewSetPath } = {}) {
    const migrated = JSON.parse(JSON.stringify(entry));
    const previousStatus = migrated.status;

    migrated.status = mapStatus(migrated.status);
    if (migrated.previousStatus) {
        migrated.previousStatus = mapStatus(migrated.previousStatus);
    }
    if (migrated.reviewStandard) {
        migrated.reviewStandard = mapReviewStandard(migrated.reviewStandard);
    }
    if (migrated.previousReviewStandard) {
        migrated.previousReviewStandard = mapReviewStandard(migrated.previousReviewStandard);
    }
    if (migrated.revalidationSummary) {
        migrated.revalidationSummary = "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji Sapphire standard.";
    }
    if (migrated.fixSummary) {
        migrated.fixSummary = replaceLaneTerms(migrated.fixSummary);
    }

    migrated.sourceEvidence = migrateEvidenceEntries(migrated.sourceEvidence);
    migrated.internalChecks = migrateEvidenceEntries(migrated.internalChecks);
    migrated.reviewEvidence = migrateEvidenceEntries(migrated.reviewEvidence);
    migrated.sapphireReviewAudit = migrateAudit(migrated.platinumReviewAudit, {
        migratedAt,
        fromReviewSetPath,
        level,
    });
    delete migrated.platinumReviewAudit;
    delete migrated.rereviewProvenance;

    migrated.meaningIncludes = normalizePrimaryMeaningIncludes(migrated);
    migrated.migrationProvenance = {
        migratedAt,
        migratedFrom: fromReviewSetPath,
        migrationType: "platinum-compatibility-to-first-class-sapphire",
        previousStatus,
        previousReviewStandard: entry.reviewStandard || "",
        newStatus: migrated.status,
        newReviewStandard: migrated.reviewStandard || "",
        authority: "Preserves current structural/card-quality review as Sapphire only. Does not claim Platinum content certification, Obsidian proof, release readiness, source-confidence upgrade, or deck movement authority.",
    };

    recomputeGeneratedSurfaceChecks(migrated);
    return migrated;
}

function migrateLevel({ cwd, level, migratedAt, preserveTargetOnly, write }) {
    const fromReviewSetPath = path.join("templates", `platinum_n${level}_review_set.json`);
    const toReviewSetPath = path.join("templates", `sapphire_n${level}_review_set.json`);
    const sourcePath = path.join(cwd, fromReviewSetPath);
    const targetPath = path.join(cwd, toReviewSetPath);
    const source = readJson(sourcePath);
    const migrated = source.map((entry) => migrateEntry(entry, {
        level,
        migratedAt,
        fromReviewSetPath,
    }));
    const sourceKanji = new Set(migrated.map((entry) => entry.kanji).filter(Boolean));
    const preservedTargetOnly = fs.existsSync(targetPath) && preserveTargetOnly
        ? readJson(targetPath)
            .filter((entry) => entry.kanji && !sourceKanji.has(entry.kanji))
            .map(normalizeExistingSapphireEntry)
        : [];
    const output = [
        ...migrated,
        ...preservedTargetOnly,
    ];

    if (write) {
        writeJson(targetPath, output);
    }

    return {
        level,
        sourcePath: fromReviewSetPath,
        targetPath: toReviewSetPath,
        entries: output.length,
        activeSapphire: output.filter((entry) => ["sapphire", "fixed_then_sapphire"].includes(entry.status)).length,
        fixedThenSapphire: output.filter((entry) => entry.status === "fixed_then_sapphire").length,
        inlineProofRemoved: source.filter((entry) => entry.rereviewProvenance).length,
        preservedTargetOnly: preservedTargetOnly.length,
        wrote: write,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("migrateKanjiSapphireReviewSets", options.unknownArgs);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.migratedAt)) {
        throw new Error("--migrated-at must be YYYY-MM-DD");
    }
    if (options.levels.length === 0) {
        throw new Error("--levels must include at least one level from 1-5");
    }

    const results = options.levels.map((level) => migrateLevel({
        cwd: process.cwd(),
        level,
        migratedAt: options.migratedAt,
        preserveTargetOnly: options.preserveTargetOnly,
        write: options.write,
    }));

    console.log(JSON.stringify({
        migratedAt: options.migratedAt,
        write: options.write,
        results,
    }, null, 2));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    migrateEntry,
    migrateLevel,
    parseArgs,
};
