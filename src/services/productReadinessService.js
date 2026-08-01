const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { loadJlptLevelContract } = require("../datasets/jlptLevelContract");
const { ensureDir, removeGeneratedPathSync, writeFileAtomicSync } = require("../utils/fs");

const N5_PRODUCT_READINESS_SCOPE = Object.freeze({
    type: "n5-product-readiness-checkpoint",
    level: 5,
    validates: [
        "JLPT kanji contract, starter, and golden-review alignment",
        "JLPT word contract and starter alignment",
        "managed audio provenance policy",
        "tracked-source N5 word TSV artifact generation",
        "tracked-source N5 kanji TSV artifact generation",
        "N5 word-level placement policy",
        "N5 kanji golden review benchmark",
        "N5 word golden review benchmark",
    ],
    doesNotValidate: [
        "platinum release-quality review",
        "all-level tracked-source kanji TSV certification",
        ".apkg product artifacts",
        "manual Anki import review",
        "mobile, screen-reader, or listening QA",
    ],
    sourceBoundary: "Uses existing review and audit commands. Some checks still read required workspace inputs such as local JLPT data and managed media.",
    followUp: "Keep the candidate explicitly N5-only and run exact APKG packet/structural release evidence. Production/GA also requires passed human/device QA; an automation-reviewed prerelease must instead disclose every allowed limitation under PROD-REL-001.",
});

const N5_TRACKED_PRODUCT_READINESS_SCOPE = Object.freeze({
    ...N5_PRODUCT_READINESS_SCOPE,
    type: "n5-product-readiness-checkpoint-tracked-only",
    validates: N5_PRODUCT_READINESS_SCOPE.validates
        .filter((item) => !item.includes("golden review benchmark"))
        .map((item) => (
            item === "managed audio provenance policy"
                ? "tracked audio source policy without workstation media claims"
                : item
        )),
    doesNotValidate: [
        ...N5_PRODUCT_READINESS_SCOPE.doesNotValidate,
        "workstation-local JLPT overlays or managed-media provenance",
        "local generated-row Gold evidence",
    ],
    sourceBoundary: "Tracked-only mode derives the runtime kanji-level map from templates/jlpt_level_contract.json and redirects every ignored local-data, cache, media, and build path into one isolated temporary workspace. It does not read or claim workstation-local evidence.",
    followUp: "Use this mode only for clean hosted verification. The release packet must still bind the exact candidate to the full local N5 readiness command, managed-media provenance, APKG hashes, and structural inspection.",
});

const N5_PRODUCT_READINESS_COMMANDS = Object.freeze([
    Object.freeze({
        id: "kanji-contract-audit",
        label: "Kanji contract audit",
        displayCommand: "npm run data:audit:jlpt",
        command: process.execPath,
        args: [path.join("scripts", "auditJlptAlignment.js")],
    }),
    Object.freeze({
        id: "word-contract-audit",
        label: "Word contract audit",
        displayCommand: "npm run data:audit:jlpt:words",
        command: process.execPath,
        args: [path.join("scripts", "auditJlptWordAlignment.js")],
    }),
    Object.freeze({
        id: "audio-provenance-audit",
        label: "Audio provenance audit",
        displayCommand: "npm run data:audit:audio -- --json",
        command: process.execPath,
        args: [path.join("scripts", "auditAudioPolicy.js"), "--json"],
    }),
    Object.freeze({
        id: "n5-tracked-source-word-artifact",
        label: "N5 tracked-source word TSV artifact",
        displayCommand: "npm run product:artifacts:n5",
        command: process.execPath,
        args: [path.join("scripts", "trackedSourceArtifacts.js"), "--level=5"],
    }),
    Object.freeze({
        id: "n5-tracked-source-kanji-artifact",
        label: "N5 tracked-source kanji TSV artifact",
        displayCommand: "npm run product:artifacts:kanji:n5",
        command: process.execPath,
        args: [path.join("scripts", "trackedSourceArtifacts.js"), "--level=5", "--surface=kanji"],
    }),
    Object.freeze({
        id: "n5-word-level-placement-audit",
        label: "N5 word-level placement audit",
        displayCommand: "npm run deck:words:level-anchor-audit -- --level=5 --limit=12",
        command: process.execPath,
        args: [path.join("scripts", "auditWordLevelAnchors.js"), "--level=5", "--limit=12"],
    }),
    Object.freeze({
        id: "n5-kanji-golden-review",
        label: "N5 kanji golden review",
        displayCommand: "npm run deck:review:n5",
        command: process.execPath,
        args: [path.join("scripts", "reviewGoldenLevel.js"), "--level=5", "--manifest-scoped"],
    }),
    Object.freeze({
        id: "n5-word-golden-review",
        label: "N5 word golden review",
        displayCommand: "npm run deck:words:review:n5",
        command: process.execPath,
        args: [path.join("scripts", "reviewGoldenWordLevel.js"), "--level=5", "--require-all"],
    }),
]);

function resolveCommand(command) {
    if (command !== "npm") {
        return command;
    }
    return process.platform === "win32" ? "npm.cmd" : "npm";
}

function normalizeCommandResult(result = {}) {
    return {
        status: Number.isInteger(result.status) ? result.status : 1,
        signal: result.signal || null,
        error: result.error ? String(result.error.message || result.error) : null,
        stdout: String(result.stdout || ""),
        stderr: String(result.stderr || ""),
    };
}

function tailText(value, maxLength = 2000) {
    const text = String(value || "").trim();
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(text.length - maxLength);
}

function buildSpawnOptions(cwd, env = null) {
    return {
        cwd,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        shell: false,
        windowsHide: true,
        ...(env ? { env } : {}),
    };
}

function runCliSubprocess(command, args, options) {
    return spawnSync(resolveCommand(command), args, options);
}

function buildProductReadinessPlan({ level = 5, trackedOnly = false, trackedOutRoot = null } = {}) {
    if (level !== 5) {
        throw new Error("Product readiness checkpoint currently supports N5 only.");
    }

    const commands = N5_PRODUCT_READINESS_COMMANDS
        .filter((check) => !trackedOnly || !["n5-kanji-golden-review", "n5-word-golden-review"].includes(check.id))
        .map((check) => ({ ...check }));
    if (trackedOnly) {
        const contractAudit = commands.find((check) => check.id === "kanji-contract-audit");
        contractAudit.args = [...contractAudit.args, "--strict", "--tracked-only"];
        contractAudit.displayCommand = "npm run data:audit:jlpt -- --strict --tracked-only";
        const audioAudit = commands.find((check) => check.id === "audio-provenance-audit");
        audioAudit.label = "Tracked audio source policy audit";
        if (trackedOutRoot) {
            const wordArtifact = commands.find((check) => check.id === "n5-tracked-source-word-artifact");
            wordArtifact.args = [
                ...wordArtifact.args,
                `--out-dir=${path.join(trackedOutRoot, "n5-tracked-source-word")}`,
            ];
            const kanjiArtifact = commands.find((check) => check.id === "n5-tracked-source-kanji-artifact");
            kanjiArtifact.args = [
                ...kanjiArtifact.args,
                `--out-dir=${path.join(trackedOutRoot, "n5-tracked-source-kanji")}`,
            ];
        }
    }

    return {
        scope: trackedOnly ? N5_TRACKED_PRODUCT_READINESS_SCOPE : N5_PRODUCT_READINESS_SCOPE,
        commands,
    };
}

function buildTrackedJlptRuntimeDataset(contract = {}) {
    return Object.fromEntries(
        Object.entries(contract.kanjiLevels || {}).map(([kanji, jlpt]) => [kanji, { jlpt }])
    );
}

function createTrackedProductReadinessWorkspace({
    cwd = process.cwd(),
    tempDir = os.tmpdir(),
    baseEnv = process.env,
} = {}) {
    const rootDir = fs.mkdtempSync(path.join(path.resolve(tempDir), "n5-product-readiness-tracked-"));
    try {
        const dataDir = path.join(rootDir, "data");
        const contractPath = path.join(path.resolve(cwd), "templates", "jlpt_level_contract.json");
        const jlptJsonPath = path.join(dataDir, "kanji_jlpt_only.json");
        const contract = loadJlptLevelContract(contractPath);

        ensureDir(dataDir);
        writeFileAtomicSync(
            jlptJsonPath,
            `${JSON.stringify(buildTrackedJlptRuntimeDataset(contract), null, 2)}\n`,
            "utf8"
        );

        return {
            rootDir,
            jlptJsonPath,
            outRoot: path.join(rootDir, "out", "product-readiness"),
            env: {
                ...baseEnv,
                NODE_ENV: "test",
                JLPT_JSON_PATH: jlptJsonPath,
                KRADFILE_PATH: path.join(dataDir, "KRADFILE"),
                SENTENCE_CORPUS_PATH: path.join(dataDir, "sentence_corpus.json"),
                CURATED_STUDY_DATA_PATH: path.join(dataDir, "curated_study_data.json"),
                WORD_STUDY_DATA_PATH: path.join(dataDir, "word_study_data.json"),
                MEDIA_ROOT_DIR: path.join(dataDir, "media"),
                STROKE_ORDER_IMAGE_SOURCE_DIR: path.join(dataDir, "media_sources", "stroke-order", "images"),
                STROKE_ORDER_ANIMATION_SOURCE_DIR: path.join(dataDir, "media_sources", "stroke-order", "animations"),
                AUDIO_SOURCE_DIR: path.join(dataDir, "media_sources", "audio"),
                CACHE_DIR: path.join(rootDir, "cache"),
                BUILD_OUT_DIR: path.join(rootDir, "out", "build"),
                KANJI_API_BASE_URL: "http://127.0.0.1:9",
                ENABLE_AUDIO: "false",
            },
        };
    } catch (error) {
        removeGeneratedPathSync(rootDir, {
            recursive: true,
            force: true,
            label: "incomplete tracked-only product readiness workspace",
        });
        throw error;
    }
}

async function runProductReadinessGate({
    level = 5,
    trackedOnly = false,
    cwd = process.cwd(),
    runCommandFn = null,
    createTrackedWorkspaceFn = createTrackedProductReadinessWorkspace,
} = {}) {
    const checks = [];
    const trackedWorkspace = trackedOnly
        ? createTrackedWorkspaceFn({ cwd })
        : null;

    try {
        const plan = buildProductReadinessPlan({
            level,
            trackedOnly,
            trackedOutRoot: trackedWorkspace?.outRoot || null,
        });
        for (const check of plan.commands) {
            const startedAt = Date.now();
            const command = resolveCommand(check.command);
            const spawnOptions = buildSpawnOptions(cwd, trackedWorkspace?.env || null);
            const result = normalizeCommandResult(runCommandFn
                ? runCommandFn(command, check.args, spawnOptions)
                : runCliSubprocess(command, check.args, spawnOptions));
            const durationMs = Date.now() - startedAt;
            const passed = result.status === 0 && !result.error;

            checks.push({
                id: check.id,
                label: check.label,
                command: check.displayCommand || [check.command, ...check.args].join(" "),
                passed,
                status: result.status,
                signal: result.signal,
                error: result.error,
                durationMs,
                stdoutTail: passed ? "" : tailText(result.stdout),
                stderrTail: passed ? "" : tailText(result.stderr),
            });
        }
    } finally {
        if (trackedWorkspace?.rootDir) {
            removeGeneratedPathSync(trackedWorkspace.rootDir, {
                recursive: true,
                force: true,
                label: "tracked-only product readiness workspace",
            });
        }
    }

    const passed = checks.every((check) => check.passed);

    return {
        generatedAt: new Date().toISOString(),
        passed,
        inputMode: trackedOnly ? "tracked-only" : "local-runtime",
        scope: trackedOnly ? N5_TRACKED_PRODUCT_READINESS_SCOPE : N5_PRODUCT_READINESS_SCOPE,
        checks,
    };
}

function formatProductReadinessReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder N5 Product Readiness Checkpoint",
        "",
        `Overall result: ${report.passed ? "passing" : "failing"}`,
        `Input mode: ${report.inputMode || "local-runtime"}`,
        `Scope: ${report.scope?.type || "unknown"}`,
        `Source boundary: ${report.scope?.sourceBoundary || "not specified"}`,
        "",
        "Checks:",
    ];

    for (const check of report.checks || []) {
        lines.push(`- ${check.passed ? "pass" : "fail"} ${check.label}: ${check.command}`);
        if (!check.passed) {
            if (check.error) {
                lines.push(`  error: ${check.error}`);
            }
            if (check.stderrTail) {
                lines.push(`  stderr: ${check.stderrTail}`);
            }
            if (check.stdoutTail) {
                lines.push(`  stdout: ${check.stdoutTail}`);
            }
        }
    }

    lines.push(
        "",
        "Does not validate:",
        ...(report.scope?.doesNotValidate || []).map((item) => `- ${item}`),
        "",
        `Follow-up: ${report.scope?.followUp || "not specified"}`
    );

    return `${lines.join("\n")}\n`;
}

module.exports = {
    N5_PRODUCT_READINESS_COMMANDS,
    N5_PRODUCT_READINESS_SCOPE,
    N5_TRACKED_PRODUCT_READINESS_SCOPE,
    buildTrackedJlptRuntimeDataset,
    buildProductReadinessPlan,
    buildSpawnOptions,
    createTrackedProductReadinessWorkspace,
    formatProductReadinessReport,
    normalizeCommandResult,
    runProductReadinessGate,
};
