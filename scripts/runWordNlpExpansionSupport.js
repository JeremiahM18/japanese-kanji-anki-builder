const { spawnSync } = require("node:child_process");
const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");

const DEFAULT_MODEL_ID = "paraphrase-multilingual-minilm-l12-v2-q8";
const DEFAULT_LEVELS = Object.freeze([5, 4, 3, 2, 1]);

function normalizeLevels(levels) {
    const normalized = [...new Set((levels || []).map((level) => Number(level)))];
    return normalized.filter((level) => Number.isInteger(level));
}

function parseArgs(argv) {
    const options = {
        json: false,
        dryRun: false,
        levels: [...DEFAULT_LEVELS],
        includeDeferred: true,
        artifactLimit: null,
        candidateLimit: 50,
        suggestions: 3,
        minSuggestionScore: 50,
        quality: "weak",
        only: "all",
        minModelScore: 0,
        manifestPath: null,
        modelId: DEFAULT_MODEL_ID,
        workspaceRoot: null,
        cacheDir: null,
        allowRemoteModels: false,
        runGovernanceGate: true,
        unknownArgs: [],
    };
    let hasInvalidLevelInput = false;

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--dry-run") {
            options.dryRun = true;
        } else if (arg === "--include-deferred") {
            options.includeDeferred = true;
        } else if (arg === "--no-include-deferred") {
            options.includeDeferred = false;
        } else if (arg === "--allow-remote-models") {
            options.allowRemoteModels = true;
        } else if (arg === "--no-governance-gate") {
            options.runGovernanceGate = false;
        } else if (arg.startsWith("--level=")) {
            const level = parseNumericOption(arg, "level");
            if (!Number.isInteger(level)) {
                hasInvalidLevelInput = true;
            }
            options.levels = [level];
        } else if (arg.startsWith("--levels=")) {
            const levelEntries = parseCsvOption(arg, "levels");
            const levels = levelEntries.map((entry) => Number(entry));
            if (levelEntries.length === 0 || levels.some((level) => !Number.isInteger(level))) {
                hasInvalidLevelInput = true;
            }
            options.levels = levels;
        } else if (arg.startsWith("--artifact-limit=")) {
            options.artifactLimit = parseNumericOption(arg, "artifact-limit");
        } else if (arg.startsWith("--limit=")) {
            options.candidateLimit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--candidate-limit=")) {
            options.candidateLimit = parseNumericOption(arg, "candidate-limit");
        } else if (arg.startsWith("--suggestions=")) {
            options.suggestions = parseNumericOption(arg, "suggestions");
        } else if (arg.startsWith("--min-suggestion-score=")) {
            options.minSuggestionScore = parseNumericOption(arg, "min-suggestion-score");
        } else if (arg.startsWith("--quality=")) {
            options.quality = parseStringOption(arg, "quality").trim();
        } else if (arg.startsWith("--only=")) {
            options.only = parseStringOption(arg, "only").trim();
        } else if (arg.startsWith("--min-model-score=")) {
            options.minModelScore = parseNumericOption(arg, "min-model-score");
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--model-id=")) {
            options.modelId = parseStringOption(arg, "model-id").trim();
        } else if (arg.startsWith("--workspace-root=")) {
            options.workspaceRoot = parseStringOption(arg, "workspace-root").trim();
        } else if (arg.startsWith("--cache-dir=")) {
            options.cacheDir = parseStringOption(arg, "cache-dir").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    options.levels = normalizeLevels(options.levels);

    if (hasInvalidLevelInput || options.levels.length === 0 || options.levels.some((level) => level < 1 || level > 5)) {
        collectUnknownArg(options, "--levels must contain integers from 1 to 5");
    }
    if (options.artifactLimit !== null && (!Number.isInteger(options.artifactLimit) || options.artifactLimit < 1)) {
        collectUnknownArg(options, "--artifact-limit must be a positive integer");
    }
    if (!Number.isInteger(options.candidateLimit) || options.candidateLimit < 1) {
        collectUnknownArg(options, "--candidate-limit must be a positive integer");
    }
    if (!Number.isInteger(options.suggestions) || options.suggestions < 0) {
        collectUnknownArg(options, "--suggestions must be a non-negative integer");
    }
    if (!Number.isInteger(options.minSuggestionScore)) {
        collectUnknownArg(options, "--min-suggestion-score must be an integer");
    }
    if (!["all", "contract-extensions"].includes(options.only)) {
        collectUnknownArg(options, "--only must be one of: all, contract-extensions");
    }
    if (!["weak", "review", "strong"].includes(options.quality)) {
        collectUnknownArg(options, "--quality must be one of: weak, review, strong");
    }
    if (!Number.isFinite(options.minModelScore) || options.minModelScore < 0 || options.minModelScore > 1) {
        collectUnknownArg(options, "--min-model-score must be a number from 0 to 1");
    }

    return options;
}

function scriptStep(label, script, args = []) {
    return {
        label,
        command: process.execPath,
        args: [path.join("scripts", script), ...args],
    };
}

function sharedModelArgs(options) {
    return [
        ...(options.manifestPath ? [`--manifest=${options.manifestPath}`] : []),
        `--model-id=${options.modelId}`,
        ...(options.workspaceRoot ? [`--workspace-root=${options.workspaceRoot}`] : []),
        ...(options.cacheDir ? [`--cache-dir=${options.cacheDir}`] : []),
        ...(options.allowRemoteModels ? ["--allow-remote-models"] : []),
    ];
}

function sharedManifestArgs(options) {
    return [
        ...(options.manifestPath ? [`--manifest=${options.manifestPath}`] : []),
        ...(options.workspaceRoot ? [`--workspace-root=${options.workspaceRoot}`] : []),
    ];
}

function manifestOnlyArgs(options) {
    return [
        ...(options.manifestPath ? [`--manifest=${options.manifestPath}`] : []),
    ];
}

function levelGenerationSteps(level, options) {
    const artifactLimitArg = options.artifactLimit ? [`--limit=${options.artifactLimit}`] : [];
    const modelArgs = sharedModelArgs(options);
    const manifestArgs = sharedManifestArgs(options);
    return [
        scriptStep(`N${level} tokenization artifact`, "generateNlpTokenization.js", [
            `--level=${level}`,
            ...artifactLimitArg,
            ...manifestArgs,
        ]),
        scriptStep(`N${level} embedding artifact`, "generateNlpEmbeddings.js", [
            `--level=${level}`,
            ...artifactLimitArg,
            ...modelArgs,
        ]),
        scriptStep(`N${level} example reranking suggestions`, "rerankNlpExamples.js", [
            `--level=${level}`,
            ...artifactLimitArg,
            ...modelArgs,
        ]),
        scriptStep(`N${level} sense-fit warning suggestions`, "auditNlpSenseFit.js", [
            `--level=${level}`,
            ...artifactLimitArg,
            ...modelArgs,
        ]),
        scriptStep(`N${level} reading-gap candidate suggestions`, "discoverNlpReadingGapCandidates.js", [
            `--level=${level}`,
            `--limit=${options.candidateLimit}`,
            `--suggestions=${options.suggestions}`,
            `--min-suggestion-score=${options.minSuggestionScore}`,
            `--quality=${options.quality}`,
            `--only=${options.only}`,
            `--min-model-score=${options.minModelScore}`,
            ...(options.includeDeferred ? ["--include-deferred"] : []),
            ...modelArgs,
        ]),
        scriptStep(`N${level} human review packets`, "generateNlpReviewPackets.js", [
            "--deck=word",
            `--level=${level}`,
            ...manifestArgs,
        ]),
        scriptStep(`N${level} draft proposal packets`, "generateNlpDraftProposals.js", [
            "--deck=word",
            `--level=${level}`,
            ...manifestArgs,
        ]),
    ];
}

function buildCommandPlan(options) {
    const levels = normalizeLevels(options.levels);
    const manifestArgs = sharedManifestArgs(options);
    const validateArgs = manifestOnlyArgs(options);
    const steps = [
        scriptStep("NLP model manifest audit", "reportNlpModelGovernance.js", [
            ...(options.manifestPath ? [`--manifest=${options.manifestPath}`] : []),
        ]),
        scriptStep("NLP runtime readiness", "doctorNlpRuntime.js", manifestArgs),
        scriptStep("NLP embedding smoke benchmark", "evaluateNlpEmbeddingModel.js", [
            ...(options.manifestPath ? [`--manifest=${options.manifestPath}`] : []),
            `--model-id=${options.modelId}`,
            ...(options.cacheDir ? [`--cache-dir=${options.cacheDir}`] : []),
            ...(options.allowRemoteModels ? ["--allow-remote-models"] : []),
        ]),
    ];

    for (const level of levels) {
        steps.push(...levelGenerationSteps(level, options));
    }

    steps.push(
        scriptStep("Validate NLP tokenization artifacts", "validateNlpTokenization.js", validateArgs),
        scriptStep("Audit NLP tokenization signals", "auditNlpTokenization.js", validateArgs),
        scriptStep("Validate NLP embedding artifacts", "validateNlpEmbeddings.js", validateArgs),
        scriptStep("Validate NLP suggestion artifacts", "validateNlpSuggestions.js", validateArgs),
        scriptStep("Validate NLP review packet artifacts", "validateNlpReviewPackets.js", []),
        scriptStep("Validate NLP draft proposal artifacts", "validateNlpDraftProposals.js", []),
    );

    if (options.runGovernanceGate) {
        steps.push(scriptStep("NLP governance gate", "runNlpGovernanceGate.js", manifestArgs));
    }

    return {
        levels,
        steps,
        authority: {
            outputAuthority: "assistive_only",
            promotionPolicy: "human_review_required",
            writesTrackedTemplates: false,
            certifiesCards: false,
            claimsReleaseReadiness: false,
        },
    };
}

function commandText(step) {
    return ["node", ...step.args].join(" ");
}

function formatWordNlpExpansionSupportPlan(plan, { dryRun = false } = {}) {
    const lines = [
        "Japanese Kanji Builder Word NLP Expansion Support",
        "",
        `Mode: ${dryRun ? "dry-run" : "execute"}`,
        `Levels: ${plan.levels.map((level) => `N${level}`).join(", ")}`,
        "Authority: assistive-only; human promotion required; no tracked template writes; no card certification.",
        "",
        "Steps:",
    ];
    plan.steps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step.label}: ${commandText(step)}`);
    });
    return `${lines.join("\n")}\n`;
}

function runStep(step, { cwd = process.cwd() } = {}) {
    process.stdout.write(`\n[Word NLP expansion support] ${step.label}\n`);
    process.stdout.write(`${commandText(step)}\n\n`);
    const result = spawnSync(step.command, step.args, {
        cwd,
        env: process.env,
        stdio: "inherit",
        shell: false,
        windowsHide: true,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${step.label} failed with exit code ${result.status}.`);
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:expansion-support", options.unknownArgs);

    const plan = buildCommandPlan(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatWordNlpExpansionSupportPlan(plan, { dryRun: options.dryRun }));
    if (options.dryRun) {
        return;
    }

    const cwd = path.resolve(options.workspaceRoot || process.cwd());
    for (const step of plan.steps) {
        runStep(step, { cwd });
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_LEVELS,
    buildCommandPlan,
    commandText,
    formatWordNlpExpansionSupportPlan,
    main,
    parseArgs,
};
