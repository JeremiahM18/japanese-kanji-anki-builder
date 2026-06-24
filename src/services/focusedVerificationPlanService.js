const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { parseLevelsArgument } = require("./buildPipeline");
const {
    DEFAULT_LEVELS,
    buildChangedFileRisk,
    buildFocusedVerification,
    buildFullMergeGate,
    normalizeDeckKind,
    normalizeLane,
    parseGitStatusChanges,
} = require("./laneOpsStatusService");

const SOURCE_OF_TRUTH = Object.freeze([
    "docs/review-system-forward-contract.md",
    "docs/review-tier-governance.md",
    "docs/obsidian-batch-workflow.md",
    "docs/workflows.md",
    "docs/verification.md",
    "docs/release-process.md",
    "docs/product-exit-criteria.md",
]);

const COMMON_LANE_TEST_COMMANDS = Object.freeze({
    ops: Object.freeze([
        "node --test test/laneOpsStatusService.test.js test/deckCloseoutStatusService.test.js",
    ]),
    source: Object.freeze([
        "npm test -- --scope=source-evidence",
    ]),
    media: Object.freeze([
        "node --test test/audioPolicyAuditService.test.js test/audioReviewService.test.js test/wordAudioReviewService.test.js test/mediaSync.test.js test/strokeOrderPolicyAuditService.test.js",
    ]),
    release: Object.freeze([
        "node --test test/ciSmokeService.test.js test/releaseGateService.test.js test/releasePolicy.test.js test/releaseQaEvidenceService.test.js",
    ]),
});

const DECK_LANE_TEST_COMMANDS = Object.freeze({
    "word:silver": Object.freeze([
        "node --test test/prepareWordDeckScript.test.js test/wordDeckCompletionService.test.js test/wordReadingCoverageService.test.js test/wordExportService.test.js",
    ]),
    "word:gold": Object.freeze([
        "node --test test/reviewGoldenWordLevel.test.js test/goldWordExpectationScaffoldService.test.js",
    ]),
    "word:sapphire": Object.freeze([
        "node --test test/reviewSapphireWordLevel.test.js test/sapphireWordBatchReportService.test.js test/sapphireWordTrackedReviewSets.test.js",
    ]),
    "word:platinum": Object.freeze([
        "node --test test/reviewPlatinumWordLevel.test.js test/platinumWordBatchReportService.test.js test/platinumWordRereviewStatusService.test.js",
    ]),
    "word:obsidian": Object.freeze([
        "node --test test/obsidianProofLedger.test.js test/obsidianProofProviderService.test.js test/obsidianWordCertificationStatusService.test.js test/platinumWordRereviewStatusService.test.js",
    ]),
    "word:nlp": Object.freeze([
        "node --test test/nlpGovernanceGateService.test.js test/nlpEmbeddingSmokeGateService.test.js test/nlpTokenizationGenerationService.test.js test/nlpReadingGapCandidateDiscoveryService.test.js test/nlpReviewPacketService.test.js test/nlpDraftProposalService.test.js test/runWordNlpExpansionSupportScript.test.js",
    ]),
    "kanji:silver": Object.freeze([
        "node --test test/prepareDeck.test.js test/deckReadyService.test.js test/buildPipeline.test.js test/exportService.test.js",
    ]),
    "kanji:gold": Object.freeze([
        "node --test test/reviewGoldenLevelScript.test.js test/goldenReviewService.test.js test/goldenReviewCoverage.test.js",
    ]),
    "kanji:sapphire": Object.freeze([
        "node --test test/sapphireTrackedReviewSets.test.js test/reviewPlatinumKanjiLevel.test.js test/platinumTrackedReviewSets.test.js",
    ]),
    "kanji:platinum": Object.freeze([
        "node --test test/reviewPlatinumKanjiLevel.test.js test/platinumKanjiBatchReportService.test.js test/platinumKanjiRereviewStatusService.test.js",
    ]),
    "kanji:obsidian": Object.freeze([
        "node --test test/obsidianProofLedger.test.js test/obsidianProofProviderService.test.js test/obsidianKanjiCertificationStatusService.test.js test/platinumKanjiRereviewStatusService.test.js",
    ]),
    "kanji:nlp": Object.freeze([
        "node --test test/nlpGovernanceGateService.test.js test/nlpTokenizationGenerationService.test.js test/nlpReviewPacketService.test.js test/runKanjiNlpSignalSupportScript.test.js",
    ]),
});

const RISK_TEST_COMMANDS = Object.freeze({
    "ci-release": Object.freeze([
        "node --test test/ciSmokeService.test.js test/releaseGateService.test.js test/branchProtectionPolicy.test.js",
        "npm run ci:smoke",
        "npm run release:gate",
    ]),
    "package-scripts-or-dependencies": Object.freeze([
        "node --test test/runNodeTestsScript.test.js test/supplyChainPolicy.test.js test/dependencyLicenseAudit.test.js",
        "npm run supply-chain:audit",
    ]),
    "ci-test-feedback": Object.freeze([
        "node --test test/runNodeTestsScript.test.js",
    ]),
    "proof-ledger": Object.freeze([
        "node --test test/obsidianProofLedger.test.js test/obsidianProofReconciliation.test.js test/obsidianProofProviderService.test.js test/obsidianProofProviderParity.test.js",
        "npm run data:obsidian:proof:validate",
    ]),
    "review-manifest": Object.freeze([
        "node --test test/sapphireTrackedReviewSets.test.js test/sapphireWordTrackedReviewSets.test.js test/platinumTrackedReviewSets.test.js",
    ]),
    "source-governance": Object.freeze([
        "npm test -- --scope=source-evidence",
    ]),
    "performance-matrix": Object.freeze([
        "node --test test/performanceMemoryAuditMatrix.test.js test/benchmarkBuild.test.js test/obsidianProofEtlBenchmark.test.js test/jlptKanjiSourceEvidenceCostReport.test.js",
    ]),
    documentation: Object.freeze([
        "npm run docs:status-audit",
    ]),
    "nlp-support": Object.freeze([
        "node --test test/nlpGovernanceGateService.test.js test/nlpEmbeddingSmokeGateService.test.js test/nlpTokenizationGenerationService.test.js test/nlpReviewPacketService.test.js test/nlpDraftProposalService.test.js",
    ]),
    "runtime-code": Object.freeze([
        "npm run lint",
    ]),
    tests: Object.freeze([]),
    "media-audio": Object.freeze([
        "node --test test/audioPolicyAuditService.test.js test/audioReviewService.test.js test/wordAudioReviewService.test.js test/mediaSync.test.js",
    ]),
});

function normalizeLevels(levels = DEFAULT_LEVELS) {
    return parseLevelsArgument(Array.isArray(levels) ? levels.join(",") : levels);
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function runGitCommand(args, { rootDir, execFileSync = childProcess.execFileSync } = {}) {
    try {
        return {
            ok: true,
            command: `git ${args.join(" ")}`,
            stdout: normalizeText(execFileSync("git", args, {
                cwd: rootDir,
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
    const status = runGitCommand(["status", "--short", "--branch", "--untracked-files=all"], {
        rootDir,
        execFileSync,
    });
    const log = runGitCommand(["log", "-1", "--oneline", "--decorate"], {
        rootDir,
        execFileSync,
    });
    const branch = runGitCommand(["branch", "--show-current"], {
        rootDir,
        execFileSync,
    });
    const changes = status.ok ? parseGitStatusChanges(status.stdout) : [];

    return {
        status,
        log,
        branch,
        clean: status.ok && changes.length === 0,
        changes,
        changedFileRisk: buildChangedFileRisk(changes),
    };
}

function uniqueCommands(commands = []) {
    const seen = new Set();
    const unique = [];
    for (const command of commands) {
        if (!seen.has(command)) {
            seen.add(command);
            unique.push(command);
        }
    }
    return unique;
}

function extractNodeTestFiles(command) {
    if (!command.startsWith("node --test ")) {
        return [];
    }
    return command
        .slice("node --test ".length)
        .split(/\s+/u)
        .filter((entry) => entry.endsWith(".test.js"));
}

function assertMappedTestFilesExist(commands = [], rootDir = process.cwd()) {
    for (const command of commands) {
        for (const testFile of extractNodeTestFiles(command)) {
            const absolutePath = path.resolve(rootDir, testFile);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Focused verification references a missing test file: ${testFile}`);
            }
        }
    }
}

function buildFocusedTestCommands({ deckKind, lane, rootDir }) {
    const commands = [
        ...(COMMON_LANE_TEST_COMMANDS[lane] || []),
        ...(DECK_LANE_TEST_COMMANDS[`${deckKind}:${lane}`] || []),
    ];
    const unique = uniqueCommands(commands);
    assertMappedTestFilesExist(unique, rootDir);
    return unique;
}

function buildChangedTestCommands(changes = []) {
    const changedTests = changes
        .map((change) => change.path.replace(/\\/gu, "/"))
        .filter((filePath) => filePath.startsWith("test/") && filePath.endsWith(".test.js"))
        .sort((left, right) => left.localeCompare(right));

    if (changedTests.length === 0) {
        return [];
    }
    return [`node --test ${changedTests.join(" ")}`];
}

function buildRiskCommands({ categories = [], changes = [], rootDir }) {
    const commands = [
        ...categories.flatMap((category) => RISK_TEST_COMMANDS[category] || []),
        ...buildChangedTestCommands(changes),
    ];
    const unique = uniqueCommands(commands);
    assertMappedTestFilesExist(unique, rootDir);
    return unique;
}

function buildBoundaryRules() {
    return [
        "Focused verification is inner-loop feedback only; it never replaces the full merge gate before commit, merge, or release claims.",
        "This command is read-only: it prints commands and does not run lane gates, write proof ledgers, edit source manifests, or modify templates.",
        "Do not treat Deck Ready, closeout, NLP, source adequacy, release:gate, or this planner as card certification.",
        "Do not shrink generated denominators or hide expected backlog to make a focused plan look green.",
        "Gold, Sapphire, Platinum, and Obsidian remain separate gates with their own tracked artifacts and fail-closed commands.",
    ];
}

function buildFocusedVerificationPlan({
    rootDir = process.cwd(),
    deckKind = "word",
    lane = "ops",
    levels = DEFAULT_LEVELS,
    execFileSync = childProcess.execFileSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const normalizedDeckKind = normalizeDeckKind(deckKind);
    const normalizedLane = normalizeLane(lane);
    const normalizedLevels = normalizeLevels(levels);
    const scope = {
        deckKind: normalizedDeckKind,
        lane: normalizedLane,
        levels: normalizedLevels,
        levelLabel: normalizedLevels.map((level) => `N${level}`).join(", "),
    };
    const git = buildGitState({ rootDir: resolvedRoot, execFileSync });
    const laneCommands = buildFocusedVerification(scope);
    const focusedTests = buildFocusedTestCommands({
        deckKind: normalizedDeckKind,
        lane: normalizedLane,
        rootDir: resolvedRoot,
    });
    const changedFileCommands = buildRiskCommands({
        categories: git.changedFileRisk.categories,
        changes: git.changes,
        rootDir: resolvedRoot,
    });

    return {
        generatedAt: new Date().toISOString(),
        rootDir: resolvedRoot,
        scope,
        git,
        laneCommands,
        focusedTests,
        changedFileCommands,
        fullMergeGate: buildFullMergeGate(),
        boundaries: buildBoundaryRules(),
        sourceOfTruth: SOURCE_OF_TRUTH,
    };
}

function formatCommandList(commands = [], emptyMessage) {
    if (commands.length === 0) {
        return [`- ${emptyMessage}`];
    }
    return commands.map((command) => `- ${command}`);
}

function formatChangedFileRisk(risk = {}) {
    if (risk.clean) {
        return ["- working tree clean: yes"];
    }
    return [
        "- working tree clean: no",
        `- highest changed-file risk: ${risk.highestRisk}`,
        `- categories: ${(risk.categories || []).join(", ") || "none"}`,
        ...(risk.files || []).map((file) => `- ${file.raw}: ${file.risk}; ${file.categories.join(", ")}`),
    ];
}

function formatFocusedVerificationPlan(report = {}) {
    const lines = [
        "Japanese Kanji Builder Focused Verification Plan",
        "",
        "Scope:",
        `- deck: ${report.scope?.deckKind}`,
        `- lane: ${report.scope?.lane}`,
        `- levels: ${report.scope?.levelLabel}`,
        "",
        "Git:",
        `- branch: ${report.git?.branch?.ok ? report.git.branch.stdout : "unknown"}`,
        `- latest commit: ${report.git?.log?.ok ? report.git.log.stdout : "unknown"}`,
        `- status: ${report.git?.status?.ok ? report.git.status.stdout : "unavailable"}`,
        "",
        "Changed-file risk:",
        ...formatChangedFileRisk(report.git?.changedFileRisk || {}),
        "",
        "Focused lane commands:",
        ...formatCommandList(report.laneCommands || [], "no lane-specific commands for this scope"),
        "",
        "Focused tests:",
        ...formatCommandList(report.focusedTests || [], "no mapped focused test command for this lane yet"),
        "",
        "Changed-file risk commands:",
        ...formatCommandList(report.changedFileCommands || [], "no additional commands from current changed-file categories"),
        "",
        "Full merge gate:",
        ...formatCommandList(report.fullMergeGate || [], "full merge gate unavailable"),
        "",
        "Hard boundaries:",
        ...((report.boundaries || []).map((entry) => `- ${entry}`)),
        "",
        "Sources:",
        ...((report.sourceOfTruth || []).map((entry) => `- ${entry}`)),
    ];

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildBoundaryRules,
    buildChangedTestCommands,
    buildFocusedTestCommands,
    buildFocusedVerificationPlan,
    buildGitState,
    buildRiskCommands,
    formatFocusedVerificationPlan,
};
