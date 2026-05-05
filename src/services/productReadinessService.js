const path = require("node:path");

class CliExit extends Error {
    constructor(code = 0) {
        super(`CLI exited with status ${code}`);
        this.code = code;
    }
}

async function runCliMainInProcess({ main, args = [], cwd = process.cwd() } = {}) {
    const originalCwd = process.cwd();
    const originalArgv = process.argv;
    const originalExit = process.exit;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdout = "";
    let stderr = "";
    let status = 0;

    process.argv = [process.execPath, "product-readiness-subcommand", ...args];
    process.exit = (code = 0) => {
        throw new CliExit(Number.isInteger(code) ? code : 0);
    };
    process.stdout.write = (chunk, encoding, callback) => {
        stdout += String(chunk || "");
        if (typeof encoding === "function") {
            encoding();
        } else if (typeof callback === "function") {
            callback();
        }
        return true;
    };
    process.stderr.write = (chunk, encoding, callback) => {
        stderr += String(chunk || "");
        if (typeof encoding === "function") {
            encoding();
        } else if (typeof callback === "function") {
            callback();
        }
        return true;
    };

    try {
        if (cwd && cwd !== originalCwd) {
            process.chdir(cwd);
        }
        await main();
    } catch (error) {
        if (error instanceof CliExit) {
            status = error.code;
        } else {
            status = 1;
            stderr += `${error.stack || error}\n`;
        }
    } finally {
        if (process.cwd() !== originalCwd) {
            process.chdir(originalCwd);
        }
        process.argv = originalArgv;
        process.exit = originalExit;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    }

    return {
        status,
        stdout,
        stderr,
    };
}

function buildScriptRunner(scriptPath, args = []) {
    return ({ cwd = process.cwd() } = {}) => {
        const { main } = require(path.resolve(__dirname, "..", "..", scriptPath));
        return runCliMainInProcess({ main, args, cwd });
    };
}

const N5_PRODUCT_READINESS_SCOPE = Object.freeze({
    type: "n5-product-readiness-checkpoint",
    level: 5,
    validates: [
        "JLPT kanji contract, starter, and golden-review alignment",
        "JLPT kanji source-evidence consensus audit",
        "JLPT word contract and starter alignment",
        "managed audio provenance policy",
        "tracked-source N5 word TSV artifact generation",
        "N5 kanji golden review benchmark",
        "N5 word golden review benchmark",
    ],
    doesNotValidate: [
        "platinum release-quality review",
        "tracked-source kanji TSV or .apkg product artifacts",
        "manual Anki import review",
        "mobile, screen-reader, or listening QA",
    ],
    sourceBoundary: "Uses existing review and audit commands. Some checks still read required workspace inputs such as local JLPT data and managed media.",
    followUp: "Add tracked-source kanji TSV and .apkg artifact gates before calling an N5 public release fully certified.",
});

const N5_PRODUCT_READINESS_COMMANDS = Object.freeze([
    Object.freeze({
        id: "kanji-contract-audit",
        label: "Kanji contract audit",
        displayCommand: "npm run data:audit:jlpt",
        command: process.execPath,
        args: [path.join("scripts", "auditJlptAlignment.js")],
        runInProcess: buildScriptRunner("scripts/auditJlptAlignment.js"),
    }),
    Object.freeze({
        id: "kanji-source-evidence-audit",
        label: "Kanji source evidence audit",
        displayCommand: "npm run data:audit:jlpt:sources -- --strict",
        command: process.execPath,
        args: [path.join("scripts", "auditJlptKanjiSourceEvidence.js"), "--strict"],
        runInProcess: buildScriptRunner("scripts/auditJlptKanjiSourceEvidence.js", ["--strict"]),
    }),
    Object.freeze({
        id: "word-contract-audit",
        label: "Word contract audit",
        displayCommand: "npm run data:audit:jlpt:words",
        command: process.execPath,
        args: [path.join("scripts", "auditJlptWordAlignment.js")],
        runInProcess: buildScriptRunner("scripts/auditJlptWordAlignment.js"),
    }),
    Object.freeze({
        id: "audio-provenance-audit",
        label: "Audio provenance audit",
        displayCommand: "npm run data:audit:audio -- --json",
        command: process.execPath,
        args: [path.join("scripts", "auditAudioPolicy.js"), "--json"],
        runInProcess: buildScriptRunner("scripts/auditAudioPolicy.js", ["--json"]),
    }),
    Object.freeze({
        id: "n5-tracked-source-word-artifact",
        label: "N5 tracked-source word TSV artifact",
        displayCommand: "npm run product:artifacts:n5",
        command: process.execPath,
        args: [path.join("scripts", "trackedSourceArtifacts.js"), "--level=5"],
        runInProcess: buildScriptRunner("scripts/trackedSourceArtifacts.js", ["--level=5"]),
    }),
    Object.freeze({
        id: "n5-kanji-golden-review",
        label: "N5 kanji golden review",
        displayCommand: "npm run deck:review:n5",
        command: process.execPath,
        args: [path.join("scripts", "reviewGoldenLevel.js"), "--level=5"],
        runInProcess: buildScriptRunner("scripts/reviewGoldenLevel.js", ["--level=5"]),
    }),
    Object.freeze({
        id: "n5-word-golden-review",
        label: "N5 word golden review",
        displayCommand: "npm run deck:words:review:n5",
        command: process.execPath,
        args: [path.join("scripts", "reviewGoldenWordLevel.js"), "--level=5", "--require-all"],
        runInProcess: buildScriptRunner("scripts/reviewGoldenWordLevel.js", ["--level=5", "--require-all"]),
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

function buildSpawnOptions(cwd) {
    return {
        cwd,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        shell: false,
    };
}

function buildProductReadinessPlan({ level = 5 } = {}) {
    if (level !== 5) {
        throw new Error("Product readiness checkpoint currently supports N5 only.");
    }

    return {
        scope: N5_PRODUCT_READINESS_SCOPE,
        commands: N5_PRODUCT_READINESS_COMMANDS.map((check) => ({ ...check })),
    };
}

async function runProductReadinessGate({
    level = 5,
    cwd = process.cwd(),
    runCommandFn = null,
} = {}) {
    const plan = buildProductReadinessPlan({ level });
    const checks = [];

    for (const check of plan.commands) {
        const startedAt = Date.now();
        const result = normalizeCommandResult(runCommandFn
            ? runCommandFn(resolveCommand(check.command), check.args, buildSpawnOptions(cwd))
            : await check.runInProcess({ cwd }));
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

    const passed = checks.every((check) => check.passed);

    return {
        generatedAt: new Date().toISOString(),
        passed,
        scope: plan.scope,
        checks,
    };
}

function formatProductReadinessReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder N5 Product Readiness Checkpoint",
        "",
        `Overall result: ${report.passed ? "passing" : "failing"}`,
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
    buildProductReadinessPlan,
    buildSpawnOptions,
    formatProductReadinessReport,
    normalizeCommandResult,
    runProductReadinessGate,
};
