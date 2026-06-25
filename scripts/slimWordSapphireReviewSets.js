#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const {
    parseSapphireWordReviewSet,
} = require("../src/datasets/sapphireWordReviewSet");
const {
    evaluateSapphireWordReviewSet,
    formatSapphireWordReviewReport,
} = require("../src/services/sapphireWordReviewService");
const {
    buildWordEntryIdentity,
} = require("../src/services/reviewLanePreconditionService");
const {
    buildWordRowsForLevel,
} = require("./reviewPlatinumWordLevel");

const ACTIVE_WORD_SAPPHIRE_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);

const GOLD_OWNED_WORD_FIELDS = Object.freeze([
    "meaningIncludes",
    "jlptLevelIncludes",
    "coverageRoleIncludes",
    "focusIncludes",
    "coversReadingIncludes",
    "breakdownIncludes",
    "exampleIncludes",
    "notesIncludes",
]);

const PLATINUM_ONLY_WORD_SAPPHIRE_FIELDS = Object.freeze([
    "qualityGates",
]);

function parseLevels(value = "") {
    if (!value) {
        return [5, 4, 3, 2, 1];
    }
    return value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5);
}

function parseArgs(argv = []) {
    const args = {
        json: false,
        levels: [5, 4, 3, 2, 1],
        unknownArgs: [],
        write: false,
    };

    for (const arg of argv) {
        if (arg === "--json") {
            args.json = true;
        } else if (arg === "--write") {
            args.write = true;
        } else if (arg.startsWith("--levels=")) {
            args.levels = parseLevels(parseStringOption(arg, "levels"));
        } else {
            collectUnknownArg(args, arg);
        }
    }

    return args;
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function buildWordRowIdentity(row = {}) {
    return `${normalizeText(row.word)}|${normalizeText(row.reading)}`;
}

function buildIdentityCounts(entries = [], getIdentity) {
    const counts = new Map();
    for (const entry of entries) {
        const identity = getIdentity(entry);
        counts.set(identity, (counts.get(identity) || 0) + 1);
    }
    return counts;
}

function countStatuses(entries = []) {
    const counts = {};
    for (const entry of entries) {
        const status = normalizeText(entry.status) || "(blank)";
        counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
}

function assertGoldBinding({ entry = {}, goldEntries = [], level }) {
    const identity = buildWordEntryIdentity(entry);
    const matches = goldEntries.filter((goldEntry) => buildWordEntryIdentity(goldEntry) === identity);
    if (matches.length !== 1) {
        throw new Error(`N${level} ${identity} must have exactly one Gold binding before Sapphire slimming; found ${matches.length}`);
    }

    return matches[0];
}

function assertGeneratedRowBinding({ entry = {}, rows = [], level }) {
    const identity = buildWordEntryIdentity(entry);
    const matches = rows.filter((row) => buildWordRowIdentity(row) === identity);
    if (matches.length !== 1) {
        throw new Error(`N${level} ${identity} must bind exactly one live generated word row before Sapphire slimming; found ${matches.length}`);
    }
}

function assertEvidenceBinding({ entry = {}, level }) {
    const identity = buildWordEntryIdentity(entry);
    for (const field of ["sourceEvidence", "internalChecks", "reviewEvidence"]) {
        const evidence = Array.isArray(entry[field]) ? entry[field] : [];
        if (evidence.length === 0) {
            throw new Error(`N${level} ${identity} must keep ${field} before Sapphire slimming`);
        }
        for (const [index, evidenceEntry] of evidence.entries()) {
            if (!evidenceEntry?.type || !evidenceEntry?.source || !evidenceEntry?.detail) {
                throw new Error(`N${level} ${identity} ${field}[${index}] must include type, source, and detail`);
            }
        }
    }
}

function slimWordSapphireEntry(entry = {}, goldEntry = {}) {
    const slimmed = { ...entry };
    for (const field of GOLD_OWNED_WORD_FIELDS) {
        if (normalizeStringArray(goldEntry[field]).length > 0) {
            delete slimmed[field];
        }
    }
    for (const field of PLATINUM_ONLY_WORD_SAPPHIRE_FIELDS) {
        delete slimmed[field];
    }
    return slimmed;
}

async function slimLevel({ level, config, rootDir = process.cwd(), write = false } = {}) {
    const sapphirePath = path.join(rootDir, "templates", `sapphire_n${level}_word_review_set.json`);
    const goldPath = path.join(rootDir, "templates", `golden_n${level}_word_review_set.json`);
    const existingEntries = JSON.parse(fs.readFileSync(sapphirePath, "utf8"));
    const goldEntries = JSON.parse(fs.readFileSync(goldPath, "utf8"));
    const activeEntries = existingEntries.filter((entry) => ACTIVE_WORD_SAPPHIRE_STATUSES.includes(normalizeText(entry.status)));
    const rows = activeEntries.length > 0 ? await buildWordRowsForLevel({ level, config }) : [];

    const statusCountsBefore = countStatuses(existingEntries);
    const identitiesBefore = buildIdentityCounts(existingEntries, buildWordEntryIdentity);

    const goldEntriesByIdentity = new Map();
    for (const entry of activeEntries) {
        const goldEntry = assertGoldBinding({ entry, goldEntries, level });
        goldEntriesByIdentity.set(buildWordEntryIdentity(entry), goldEntry);
        assertGeneratedRowBinding({ entry, rows, level });
        assertEvidenceBinding({ entry, level });
    }

    const outputEntries = existingEntries.map((entry) => slimWordSapphireEntry(
        entry,
        goldEntriesByIdentity.get(buildWordEntryIdentity(entry))
    ));
    const statusCountsAfter = countStatuses(outputEntries);
    const identitiesAfter = buildIdentityCounts(outputEntries, buildWordEntryIdentity);
    if (JSON.stringify(statusCountsBefore) !== JSON.stringify(statusCountsAfter)) {
        throw new Error(`N${level} status counts changed during Sapphire slimming`);
    }
    if (JSON.stringify([...identitiesBefore]) !== JSON.stringify([...identitiesAfter])) {
        throw new Error(`N${level} identities changed during Sapphire slimming`);
    }

    parseSapphireWordReviewSet(outputEntries, `templates/sapphire_n${level}_word_review_set.json`);
    if (activeEntries.length > 0) {
        const report = evaluateSapphireWordReviewSet({
            rows,
            entries: outputEntries,
            goldenExpectations: goldEntries,
            requireGoldPrecondition: true,
            requireCurrentReviewStandard: true,
            requireAllRows: false,
            allowEmpty: true,
        });
        if (!report.passed) {
            throw new Error(`N${level} slimmed Sapphire review set failed validation:\n${formatSapphireWordReviewReport(report)}`);
        }
    }

    const removedFieldCounts = {};
    for (const [index, entry] of existingEntries.entries()) {
        for (const field of [...GOLD_OWNED_WORD_FIELDS, ...PLATINUM_ONLY_WORD_SAPPHIRE_FIELDS]) {
            if (entry[field] !== undefined && outputEntries[index][field] === undefined) {
                removedFieldCounts[field] = (removedFieldCounts[field] || 0) + 1;
            }
        }
    }

    if (write) {
        fs.writeFileSync(sapphirePath, `${JSON.stringify(outputEntries, null, 2)}\n`);
    }

    return {
        level,
        activeEntries: activeEntries.length,
        totalEntries: existingEntries.length,
        statusCounts: statusCountsAfter,
        removedFieldCounts,
        wrote: write,
    };
}

function formatSlimmingReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Word Sapphire Slimming Report",
        "",
        `Mode: ${report.write ? "write" : "dry-run"}`,
        "Boundary: removes Gold-owned and Platinum-only duplicate payload from word Sapphire manifests only after exact Gold, generated-row, and evidence binding validation.",
    ];

    for (const level of report.levels || []) {
        const row = report.results?.find((result) => result.level === level) || {};
        lines.push(
            "",
            `N${level}: entries=${row.totalEntries || 0}, active=${row.activeEntries || 0}, wrote=${row.wrote ? "yes" : "no"}`,
            `Removed fields: ${JSON.stringify(row.removedFieldCounts || {})}`,
            `Status counts: ${JSON.stringify(row.statusCounts || {})}`
        );
    }

    lines.push("", "This command does not review cards, approve Sapphire, create Platinum, write Obsidian proof, or shrink denominators.");
    return `${lines.join("\n")}\n`;
}

async function run(options = {}) {
    const config = loadConfig();
    const results = [];
    for (const level of options.levels) {
        results.push(await slimLevel({
            level,
            config,
            write: options.write,
        }));
    }
    return {
        levels: options.levels,
        results,
        write: options.write,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:migrate:word-sapphire-slim", options.unknownArgs);
    const report = await run(options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    process.stdout.write(formatSlimmingReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    GOLD_OWNED_WORD_FIELDS,
    PLATINUM_ONLY_WORD_SAPPHIRE_FIELDS,
    formatSlimmingReport,
    parseArgs,
    run,
    slimLevel,
    slimWordSapphireEntry,
};
