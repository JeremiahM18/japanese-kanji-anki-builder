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
        artifactLimit: null,
        manifestPath: null,
        workspaceRoot: null,
        runGovernanceGate: true,
        unknownArgs: [],
    };
    let hasInvalidLevelInput = false;

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--dry-run") {
            options.dryRun = true;
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
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--workspace-root=")) {
            options.workspaceRoot = parseStringOption(arg, "workspace-root").trim();
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

    return options;
}

function scriptStep(label, script, args = []) {
    return {
        label,
        command: process.execPath,
        args: [path.join("scripts", script), ...args],
    };
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

function buildCommandPlan(options) {
    const levels = normalizeLevels(options.levels);
    const manifestArgs = sharedManifestArgs(options);
    const validateArgs = manifestOnlyArgs(options);
    const artifactLimitArg = options.artifactLimit ? [`--limit=${options.artifactLimit}`] : [];
    const steps = [
        scriptStep("NLP model manifest audit", "reportNlpModelGovernance.js", [
            ...(options.manifestPath ? [`--manifest=${options.manifestPath}`] : []),
        ]),
        scriptStep("NLP runtime readiness", "doctorNlpRuntime.js", manifestArgs),
        scriptStep("Generated kanji TSV refresh", "prepareDeck.js", [
            `--levels=${levels.join(",")}`,
        ]),
    ];

    for (const level of levels) {
        steps.push(
            scriptStep(`N${level} kanji-card tokenization artifact`, "generateNlpTokenization.js", [
                "--deck=kanji",
                `--level=${level}`,
                ...artifactLimitArg,
                ...manifestArgs,
            ]),
            scriptStep(`N${level} kanji human review packets`, "generateNlpReviewPackets.js", [
                "--deck=kanji",
                `--level=${level}`,
                ...manifestArgs,
            ]),
            scriptStep(`N${level} kanji draft review notes`, "generateNlpDraftProposals.js", [
                "--deck=kanji",
                `--level=${level}`,
                ...manifestArgs,
            ])
        );
    }

    steps.push(
        scriptStep("Validate NLP tokenization artifacts", "validateNlpTokenization.js", validateArgs),
        scriptStep("Audit NLP tokenization signals", "auditNlpTokenization.js", validateArgs),
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
            productBoundary: "kanji",
        },
    };
}

function commandText(step) {
    return ["node", ...step.args].join(" ");
}

function formatKanjiNlpSignalSupportPlan(plan, { dryRun = false } = {}) {
    const lines = [
        "Japanese Kanji Builder Kanji NLP Signal Support",
        "",
        `Mode: ${dryRun ? "dry-run" : "execute"}`,
        `Levels: ${plan.levels.map((level) => `N${level}`).join(", ")}`,
        "Role: governed review-amplification between generated kanji output and human promotion; not a certification path.",
        "Product boundary: kanji deck only; no word expansion, no word reading-gap discovery, no word example reranking, no word sense-fit audits, no word-card embeddings.",
        "Authority: assistive-only; human promotion required; no tracked template writes; no card certification; no source-truth approval; no release-readiness claim.",
        "Obsidian remains gated by deck:kanji:obsidian:rereview-status and deck:kanji:obsidian:certify-status after human rereview of the live card.",
        "",
        "Steps:",
    ];
    plan.steps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step.label}: ${commandText(step)}`);
    });
    return `${lines.join("\n")}\n`;
}

function runStep(step, { cwd = process.cwd() } = {}) {
    process.stdout.write(`\n[Kanji NLP signal support] ${step.label}\n`);
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
    assertNoUnknownArgs("deck:kanji:nlp-signals", options.unknownArgs);

    const plan = buildCommandPlan(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatKanjiNlpSignalSupportPlan(plan, { dryRun: options.dryRun }));
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
    formatKanjiNlpSignalSupportPlan,
    main,
    parseArgs,
};
