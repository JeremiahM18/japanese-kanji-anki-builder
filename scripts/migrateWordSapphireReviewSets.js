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
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireWordReviewService");

const LEGACY_WORD_PLATINUM_REVIEW_STANDARD = "word-platinum-v3-evidence-lanes";
const DEFAULT_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

function parseArgs(argv) {
    const options = {
        levels: [...DEFAULT_LEVELS],
        migratedAt: new Date().toISOString().slice(0, 10),
        unknownArgs: [],
        write: false,
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
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
    return value === LEGACY_WORD_PLATINUM_REVIEW_STANDARD
        ? CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD
        : value;
}

function replaceLaneTerms(value) {
    return normalizeText(value)
        .replaceAll(LEGACY_WORD_PLATINUM_REVIEW_STANDARD, CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD)
        .replace(/fixed_then_platinum/g, "fixed_then_sapphire")
        .replace(/Substantive current-standard Obsidian rereview for /g, "Current-standard Sapphire structural/card-quality review for ")
        .replace(/Square-zero Obsidian revalidation for /g, "Current-standard Sapphire structural/card-quality revalidation for ")
        .replace(/, not a mechanical migration: rechecked/g, ": rechecked")
        .replace(/Obsidian rereview/gi, "Sapphire structural/card-quality review")
        .replace(/Obsidian revalidation/gi, "Sapphire structural/card-quality revalidation")
        .replace(/substantive current-standard rereview/gi, "current-standard structural/card-quality review")
        .replace(/current word platinum standard/gi, "current word Sapphire standard")
        .replace(/word platinum standard/gi, "word Sapphire standard")
        .replace(/current-standard Platinum/g, "current-standard Sapphire")
        .replace(/Platinum compatibility/g, "Sapphire")
        .replace(/Sapphire\/Platinum-compatibility/g, "Sapphire")
        .replace(/platinum product review/gi, "Sapphire product review")
        .replace(/Platinum lane/g, "Sapphire lane")
        .replace(/platinum lane/g, "Sapphire lane")
        .replace(/Platinum entries/g, "Sapphire entries")
        .replace(/platinum entries/g, "Sapphire entries")
        .replace(/active platinum/g, "active Sapphire")
        .replace(/active Platinum/g, "active Sapphire")
        .replace(/before Platinum/g, "before Sapphire")
        .replace(/before platinum/g, "before Sapphire");
}

function migrateEvidenceEntries(entries = []) {
    return (Array.isArray(entries) ? entries : []).map((entry) => {
        const migrated = { ...entry };
        if (typeof migrated.detail === "string") {
            migrated.detail = replaceLaneTerms(migrated.detail);
        }
        if (
            typeof migrated.source === "string"
            && !/scripts\/reviewPlatinumWordLevel\.js/.test(migrated.source)
        ) {
            migrated.source = replaceLaneTerms(migrated.source);
        }
        return migrated;
    });
}

function migrateEntry(entry = {}, { migratedAt, fromReviewSetPath } = {}) {
    const migrated = JSON.parse(JSON.stringify(entry));
    const previousStatus = migrated.status;
    const previousReviewStandard = migrated.reviewStandard || "";

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
        migrated.revalidationSummary = replaceLaneTerms(migrated.revalidationSummary);
    }
    if (migrated.fixSummary) {
        migrated.fixSummary = replaceLaneTerms(migrated.fixSummary);
    }
    if (migrated.decisionReason) {
        migrated.decisionReason = replaceLaneTerms(migrated.decisionReason);
    }

    migrated.sourceEvidence = migrateEvidenceEntries(migrated.sourceEvidence);
    migrated.internalChecks = migrateEvidenceEntries(migrated.internalChecks);
    migrated.reviewEvidence = migrateEvidenceEntries(migrated.reviewEvidence);
    delete migrated.rereviewProvenance;
    delete migrated.platinumReviewAudit;

    migrated.migrationProvenance = {
        migratedAt,
        migratedFrom: fromReviewSetPath,
        migrationType: "word-platinum-compatibility-to-first-class-sapphire",
        previousStatus,
        previousReviewStandard,
        newStatus: migrated.status,
        newReviewStandard: migrated.reviewStandard || "",
        authority: "Representation migration from the former word structural/card-quality Platinum compatibility lane into first-class Sapphire. This is not Platinum content certification, Obsidian proof, release readiness, source-confidence upgrade, or deck movement authority.",
    };

    return migrated;
}

function migrateLevel({ cwd, level, migratedAt, write }) {
    const fromReviewSetPath = `templates/platinum_n${level}_word_review_set.json`;
    const toReviewSetPath = `templates/sapphire_n${level}_word_review_set.json`;
    const sourcePath = path.join(cwd, fromReviewSetPath);
    const targetPath = path.join(cwd, toReviewSetPath);
    const sourceExists = fs.existsSync(sourcePath);
    const source = sourceExists ? readJson(sourcePath) : [];
    const migrated = source.map((entry) => migrateEntry(entry, {
        migratedAt,
        fromReviewSetPath,
    }));

    if (write) {
        writeJson(targetPath, migrated);
    }

    return {
        level,
        sourcePath: fromReviewSetPath,
        targetPath: toReviewSetPath,
        sourceExists,
        entries: migrated.length,
        activeSapphire: migrated.filter((entry) => ["sapphire", "fixed_then_sapphire"].includes(entry.status)).length,
        fixedThenSapphire: migrated.filter((entry) => entry.status === "fixed_then_sapphire").length,
        nonShipping: migrated.filter((entry) => ["deferred", "removed"].includes(entry.status)).length,
        inlineProofRemoved: source.filter((entry) => entry.rereviewProvenance).length,
        wrote: write,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("migrateWordSapphireReviewSets", options.unknownArgs);

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
