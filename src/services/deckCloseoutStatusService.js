const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { parseLevelsArgument } = require("./buildPipeline");
const {
    buildKanjiReviewStandardSummary,
    buildKanjiVerificationLimitationSummary,
} = require("./platinumKanjiReviewService");
const {
    buildKanjiSapphireReviewStandardSummary,
    buildKanjiSapphireVerificationLimitationSummary,
} = require("./sapphireKanjiReviewService");
const {
    buildWordReviewStandardSummary,
    buildWordVerificationLimitationSummary,
} = require("./platinumReviewService");
const {
    buildWordSapphireReviewStandardSummary,
    buildWordSapphireVerificationLimitationSummary,
} = require("./sapphireWordReviewService");
const { buildNlpGovernanceGateReport } = require("./nlpGovernanceGateService");

const DEFAULT_LEVELS = Object.freeze([5, 4, 3, 2, 1]);
const DOC_COUNT_FILES = Object.freeze([
    "README.md",
    "docs/product-exit-criteria.md",
    "docs/command-reference.md",
    "docs/obsidian-batch-workflow.md",
    "docs/release-qa-checklist.md",
    "CHANGELOG.md",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function readJson(filePath, { existsSync = fs.existsSync, readFileSync = fs.readFileSync, missingValue = null } = {}) {
    if (!existsSync(filePath)) {
        return missingValue;
    }
    return JSON.parse(readFileSync(filePath, "utf8"));
}

function readText(filePath, { existsSync = fs.existsSync, readFileSync = fs.readFileSync } = {}) {
    if (!existsSync(filePath)) {
        return null;
    }
    return readFileSync(filePath, "utf8");
}

function parseTsvRows(text) {
    const lines = normalizeText(text).split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
        return [];
    }
    const header = lines[0].split("\t");
    return lines.slice(1).map((line) => {
        const columns = line.split("\t");
        return Object.fromEntries(header.map((field, index) => [field, columns[index] || ""]));
    });
}

function uniqueCount(values = []) {
    return new Set(values.map(normalizeText).filter(Boolean)).size;
}

function countKanjiContractDenominator(contract = {}, level) {
    return Object.values(contract?.kanjiLevels || {})
        .filter((entryLevel) => Number(entryLevel) === Number(level))
        .length;
}

function countWordContractDenominator(contract = {}, level) {
    return Object.values(contract?.wordLevels || {})
        .filter((entry) => Number(entry?.jlpt) === Number(level))
        .length;
}

function countKanjiGeneratedRows({ rootDir, level, existsSync, readFileSync }) {
    const exportPath = path.join(rootDir, "out", "build", "exports", `jlpt-n${level}.tsv`);
    const text = readText(exportPath, { existsSync, readFileSync });
    if (text === null) {
        return { exists: false, count: 0, path: exportPath };
    }
    const rows = parseTsvRows(text);
    return {
        exists: true,
        count: uniqueCount(rows.map((row) => row.Kanji)),
        path: exportPath,
    };
}

function countWordGeneratedRows({ rootDir, level, existsSync, readFileSync }) {
    const exportPath = path.join(rootDir, "out", "word-build", "exports", `jlpt-n${level}-words.tsv`);
    const text = readText(exportPath, { existsSync, readFileSync });
    if (text === null) {
        return { exists: false, count: 0, path: exportPath };
    }
    const rows = parseTsvRows(text);
    return {
        exists: true,
        count: uniqueCount(rows.map((row) => `${row.Word}|${row.Reading}`)),
        path: exportPath,
    };
}

function countKanjiGold(entries = []) {
    return uniqueCount((Array.isArray(entries) ? entries : []).map((entry) => entry?.kanji));
}

function countWordGold(entries = []) {
    return uniqueCount((Array.isArray(entries) ? entries : []).map((entry) => {
        const reading = Array.isArray(entry?.readingIncludes) ? entry.readingIncludes.join(" / ") : "";
        return `${entry?.word || ""}|${reading}`;
    }));
}

function buildBacklog(count, denominator) {
    return Math.max(0, Number(denominator || 0) - Number(count || 0));
}

function formatRatio(count, denominator) {
    return `${count}/${denominator}`;
}

function buildLaneStatus({ count, denominator, label }) {
    const missing = buildBacklog(count, denominator);
    return {
        label,
        count,
        denominator,
        missing,
        ratio: formatRatio(count, denominator),
        complete: denominator > 0 && missing === 0,
    };
}

function buildKanjiLaneRow({
    rootDir,
    level,
    denominator,
    existsSync,
    readFileSync,
}) {
    const templatesDir = path.join(rootDir, "templates");
    const goldEntries = readJson(path.join(templatesDir, `golden_n${level}_review_set.json`), {
        existsSync,
        readFileSync,
        missingValue: [],
    });
    const sapphireEntries = readJson(path.join(templatesDir, `sapphire_n${level}_review_set.json`), {
        existsSync,
        readFileSync,
        missingValue: [],
    });
    const platinumEntries = readJson(path.join(templatesDir, `platinum_n${level}_review_set.json`), {
        existsSync,
        readFileSync,
        missingValue: [],
    });
    const generated = countKanjiGeneratedRows({ rootDir, level, existsSync, readFileSync });
    const sapphireSummary = buildKanjiSapphireReviewStandardSummary(sapphireEntries);
    const platinumSummary = buildKanjiReviewStandardSummary(platinumEntries);
    const sapphireLimitations = buildKanjiSapphireVerificationLimitationSummary(sapphireEntries);
    const platinumLimitations = buildKanjiVerificationLimitationSummary(platinumEntries);

    return {
        deckKind: "kanji",
        level,
        levelLabel: `N${level}`,
        denominator,
        denominatorSource: "templates/jlpt_level_contract.json",
        generated,
        lanes: {
            silver: buildLaneStatus({ count: generated.count, denominator, label: "Silver/generated export" }),
            gold: buildLaneStatus({ count: countKanjiGold(goldEntries), denominator, label: "Gold regression" }),
            sapphire: {
                ...buildLaneStatus({
                    count: sapphireSummary.currentStandardCount || 0,
                    denominator,
                    label: "Sapphire structural",
                }),
                activeStatusCount: sapphireSummary.activeStatusCount || 0,
                legacyOrUnversionedCount: sapphireSummary.legacyOrUnversionedCount || 0,
                verificationLimitationCount: sapphireLimitations.limitationCount || 0,
            },
            platinum: {
                ...buildLaneStatus({
                    count: platinumSummary.currentStandardCount || 0,
                    denominator,
                    label: "Platinum card-surface",
                }),
                activeStatusCount: platinumSummary.activeStatusCount || 0,
                legacyOrUnversionedCount: platinumSummary.legacyOrUnversionedCount || 0,
                verificationLimitationCount: platinumLimitations.limitationCount || 0,
            },
        },
    };
}

function buildWordLaneRow({
    rootDir,
    level,
    denominator,
    existsSync,
    readFileSync,
}) {
    const templatesDir = path.join(rootDir, "templates");
    const goldEntries = readJson(path.join(templatesDir, `golden_n${level}_word_review_set.json`), {
        existsSync,
        readFileSync,
        missingValue: [],
    });
    const sapphireEntries = readJson(path.join(templatesDir, `sapphire_n${level}_word_review_set.json`), {
        existsSync,
        readFileSync,
        missingValue: [],
    });
    const platinumEntries = readJson(path.join(templatesDir, `platinum_n${level}_word_review_set.json`), {
        existsSync,
        readFileSync,
        missingValue: [],
    });
    const generated = countWordGeneratedRows({ rootDir, level, existsSync, readFileSync });
    const sapphireSummary = buildWordSapphireReviewStandardSummary(sapphireEntries);
    const platinumSummary = buildWordReviewStandardSummary(platinumEntries);
    const sapphireLimitations = buildWordSapphireVerificationLimitationSummary(sapphireEntries);
    const platinumLimitations = buildWordVerificationLimitationSummary(platinumEntries);

    return {
        deckKind: "word",
        level,
        levelLabel: `N${level}`,
        denominator,
        denominatorSource: "templates/jlpt_word_level_contract.json",
        generated,
        lanes: {
            silver: buildLaneStatus({ count: generated.count, denominator, label: "Silver/generated export" }),
            gold: buildLaneStatus({ count: countWordGold(goldEntries), denominator, label: "Gold regression" }),
            sapphire: {
                ...buildLaneStatus({
                    count: sapphireSummary.currentStandardCount || 0,
                    denominator,
                    label: "Sapphire structural",
                }),
                activeStatusCount: sapphireSummary.activeStatusCount || 0,
                legacyOrUnversionedCount: sapphireSummary.legacyOrUnversionedCount || 0,
                verificationLimitationCount: sapphireLimitations.limitationCount || 0,
            },
            platinum: {
                ...buildLaneStatus({
                    count: platinumSummary.currentStandardCount || 0,
                    denominator,
                    label: "Platinum card-surface",
                }),
                legacyOrUnversionedCount: platinumSummary.legacyOrUnversionedCount || 0,
                verificationLimitationCount: platinumLimitations.limitationCount || 0,
            },
        },
    };
}

function buildExpectedGateRows(laneRows = []) {
    const rows = [];
    for (const laneRow of laneRows) {
        const prefix = laneRow.deckKind === "kanji" ? "deck" : "deck:words";
        const level = laneRow.level;
        const commands = laneRow.deckKind === "kanji"
            ? {
                gold: `npm run deck:review:n${level}`,
                sapphire: `npm run deck:sapphire:n${level}`,
                platinum: `npm run deck:platinum:n${level}`,
            }
            : {
                gold: `npm run ${prefix}:review:n${level}`,
                sapphire: `npm run ${prefix}:sapphire:n${level}`,
                platinum: `npm run ${prefix}:platinum:n${level}`,
            };

        for (const laneName of ["gold", "sapphire", "platinum"]) {
            const lane = laneRow.lanes[laneName];
            if (!lane) {
                continue;
            }
            rows.push({
                deckKind: laneRow.deckKind,
                level,
                levelLabel: laneRow.levelLabel,
                lane: laneName,
                command: commands[laneName],
                classification: lane.missing > 0 ? "expected-fail-coverage" : "count-complete-run-gate-to-confirm",
                missing: lane.missing,
                ratio: lane.ratio,
            });
        }
    }
    return rows;
}

function runGitCommand(args, { cwd, execFileSync = childProcess.execFileSync } = {}) {
    try {
        return {
            ok: true,
            command: `git ${args.join(" ")}`,
            stdout: normalizeText(execFileSync("git", args, {
                cwd,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            })),
            error: "",
        };
    } catch (error) {
        return {
            ok: false,
            command: `git ${args.join(" ")}`,
            stdout: normalizeText(error.stdout),
            error: normalizeText(error.stderr || error.message),
        };
    }
}

function buildGitState({ rootDir, execFileSync } = {}) {
    const status = runGitCommand(["status", "--short", "--branch"], { cwd: rootDir, execFileSync });
    const log = runGitCommand(["log", "-1", "--oneline", "--decorate"], { cwd: rootDir, execFileSync });
    const branches = runGitCommand(["branch", "-a", "-vv"], { cwd: rootDir, execFileSync });
    const remoteHeads = runGitCommand(["ls-remote", "--heads", "origin"], { cwd: rootDir, execFileSync });
    const proofLedgerStatus = runGitCommand(["status", "--short", "--", "templates/obsidian_proof_ledger"], {
        cwd: rootDir,
        execFileSync,
    });
    const statusLines = status.stdout ? status.stdout.split(/\r?\n/) : [];
    const dirtyLines = statusLines.slice(1).filter(Boolean);

    return {
        status,
        log,
        branches,
        remoteHeads,
        proofLedgerStatus,
        clean: status.ok && dirtyLines.length === 0,
        dirtyLines,
        proofLedgerDirty: proofLedgerStatus.ok && Boolean(proofLedgerStatus.stdout),
    };
}

function buildObsidianBoundary({ git }) {
    return {
        status: git.proofLedgerDirty ? "attention" : "untouched",
        proofLedgerDirty: git.proofLedgerDirty,
        proofLedgerStatus: git.proofLedgerStatus,
        commandRunsObsidianStatus: false,
        commandWritesProofLedger: false,
        forbiddenInCloseoutCommand: [
            "deck:kanji:obsidian:rereview-status",
            "deck:kanji:obsidian:certify-status",
            "deck:words:obsidian:rereview-status",
            "deck:words:obsidian:certify-status",
            "data:obsidian:proof:append",
        ],
    };
}

function buildOperatingHygiene() {
    return {
        docsCountUpdate: {
            requiredWhenCountsMove: true,
            files: [...DOC_COUNT_FILES],
        },
        ciReleaseChecks: [
            "git diff --check",
            "npm run lint",
            "npm run typecheck",
            "npm test",
            "npm run ci:smoke",
            "npm run release:gate",
            "gh pr checks <PR> --watch",
        ],
        manualMediaImportQa: [
            "Manual Anki import QA is not performed by this command.",
            "Audio listening/naturalness QA is not performed by this command.",
            "This command reports automated identity/provenance lane state only.",
        ],
        proofLedgerPolicy: "Future proof-ledger work starts only when the operator intentionally opens the Obsidian lane.",
    };
}

function buildDeckCloseoutStatus({
    rootDir = process.cwd(),
    levels = DEFAULT_LEVELS,
    existsSync = fs.existsSync,
    readFileSync = fs.readFileSync,
    execFileSync = childProcess.execFileSync,
    buildNlpGovernanceGateReportFn = buildNlpGovernanceGateReport,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const normalizedLevels = parseLevelsArgument(Array.isArray(levels) ? levels.join(",") : levels);
    const kanjiContract = readJson(path.join(resolvedRoot, "templates", "jlpt_level_contract.json"), {
        existsSync,
        readFileSync,
        missingValue: {},
    });
    const wordContract = readJson(path.join(resolvedRoot, "templates", "jlpt_word_level_contract.json"), {
        existsSync,
        readFileSync,
        missingValue: {},
    });
    const laneRows = normalizedLevels.flatMap((level) => [
        buildKanjiLaneRow({
            rootDir: resolvedRoot,
            level,
            denominator: countKanjiContractDenominator(kanjiContract, level),
            existsSync,
            readFileSync,
        }),
        buildWordLaneRow({
            rootDir: resolvedRoot,
            level,
            denominator: countWordContractDenominator(wordContract, level),
            existsSync,
            readFileSync,
        }),
    ]);
    const nlp = buildNlpGovernanceGateReportFn({
        workspaceRoot: resolvedRoot,
        packageJsonPath: path.join(resolvedRoot, "package.json"),
        packageLockJsonPath: path.join(resolvedRoot, "package-lock.json"),
    });
    const git = buildGitState({ rootDir: resolvedRoot, execFileSync });

    return {
        generatedAt: new Date().toISOString(),
        rootDir: resolvedRoot,
        levels: normalizedLevels,
        git,
        laneRows,
        expectedGates: buildExpectedGateRows(laneRows),
        nlpSupport: {
            passed: Boolean(nlp.passed),
            releaseBoundary: nlp.releaseBoundary,
            errors: nlp.errors || [],
        },
        obsidian: buildObsidianBoundary({ git }),
        operatingHygiene: buildOperatingHygiene(),
    };
}

function formatLaneTable(laneRows = []) {
    const lines = [
        "| Deck | Level | Denominator | Silver | Gold | Sapphire | Platinum | Verification Limitations |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const row of laneRows) {
        lines.push([
            `| ${row.deckKind}`,
            row.levelLabel,
            `${row.denominator} (${row.denominatorSource})`,
            row.generated.exists ? row.lanes.silver.ratio : `missing export (${row.generated.path})`,
            row.lanes.gold.ratio,
            row.lanes.sapphire.ratio,
            row.lanes.platinum.ratio,
            `${row.lanes.sapphire.verificationLimitationCount + row.lanes.platinum.verificationLimitationCount}`,
        ].join(" | ") + " |");
    }

    return lines;
}

function formatExpectedGateRows(expectedGates = []) {
    return expectedGates.map((gate) => (
        `- ${gate.command}: ${gate.classification}; ${gate.ratio}; missing ${gate.missing}`
    ));
}

function formatDeckCloseoutStatus(report = {}) {
    const lines = [
        "Japanese Kanji Builder Closeout Status",
        "",
        "Git state:",
        `- status: ${report.git?.status?.ok ? report.git.status.stdout : `unavailable (${report.git?.status?.error || "unknown"})`}`,
        `- latest commit: ${report.git?.log?.ok ? report.git.log.stdout : `unavailable (${report.git?.log?.error || "unknown"})`}`,
        `- working tree clean: ${report.git?.clean ? "yes" : "no"}`,
        `- remote heads: ${report.git?.remoteHeads?.ok ? report.git.remoteHeads.stdout.replace(/\r?\n/g, "; ") : `unavailable (${report.git?.remoteHeads?.error || "unknown"})`}`,
        "",
        "Lane counts:",
        ...formatLaneTable(report.laneRows || []),
        "",
        "Expected gate classification:",
        ...formatExpectedGateRows(report.expectedGates || []),
        "",
        "NLP support:",
        `- governance gate: ${report.nlpSupport?.passed ? "passing" : "failing"}`,
        `- certifies cards: ${report.nlpSupport?.releaseBoundary?.nlpGateCertifiesCards ? "yes" : "no"}`,
        `- writes tracked templates: ${report.nlpSupport?.releaseBoundary?.nlpGateWritesTrackedTemplates ? "yes" : "no"}`,
        `- claims release readiness: ${report.nlpSupport?.releaseBoundary?.nlpGateClaimsReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.nlpSupport?.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`,
        "",
        "Obsidian untouched:",
        `- status: ${report.obsidian?.status || "unknown"}`,
        `- proof ledger worktree changes: ${report.obsidian?.proofLedgerDirty ? "yes" : "no"}`,
        "- this command runs Obsidian status commands: no",
        "- this command writes proof ledger events: no",
        "",
        "Operating hygiene:",
        `- docs count updates required when counts move: ${report.operatingHygiene?.docsCountUpdate?.requiredWhenCountsMove ? "yes" : "no"}`,
        `- docs to check: ${(report.operatingHygiene?.docsCountUpdate?.files || []).join(", ")}`,
        "- CI/release checks:",
        ...(report.operatingHygiene?.ciReleaseChecks || []).map((command) => `  - ${command}`),
        "- manual media/import QA:",
        ...(report.operatingHygiene?.manualMediaImportQa || []).map((note) => `  - ${note}`),
        `- proof ledger policy: ${report.operatingHygiene?.proofLedgerPolicy || ""}`,
    ];

    if ((report.nlpSupport?.errors || []).length > 0) {
        lines.push("", "NLP errors:");
        for (const error of report.nlpSupport.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    DEFAULT_LEVELS,
    buildDeckCloseoutStatus,
    buildExpectedGateRows,
    buildOperatingHygiene,
    countKanjiContractDenominator,
    countWordContractDenominator,
    formatDeckCloseoutStatus,
};
