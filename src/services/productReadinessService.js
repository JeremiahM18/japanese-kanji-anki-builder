const { spawnSync } = require("node:child_process");

const N5_PRODUCT_READINESS_SCOPE = Object.freeze({
    type: "n5-product-readiness-checkpoint",
    level: 5,
    validates: [
        "JLPT kanji contract, starter, and golden-review alignment",
        "JLPT word contract and starter alignment",
        "managed audio provenance policy",
        "N5 kanji golden review benchmark",
        "N5 word golden review benchmark",
    ],
    doesNotValidate: [
        "fresh isolated TSV or .apkg product artifacts",
        "tracked-source-only artifact generation",
        "manual Anki import review",
        "mobile, screen-reader, or listening QA",
    ],
    sourceBoundary: "Uses existing review and audit commands. Some checks still read required workspace inputs such as local JLPT data and managed media.",
    followUp: "Add an isolated tracked-source artifact gate before calling an N5 public release fully certified.",
});

const N5_PRODUCT_READINESS_COMMANDS = Object.freeze([
    Object.freeze({
        id: "kanji-contract-audit",
        label: "Kanji contract audit",
        command: "npm",
        args: ["run", "data:audit:jlpt"],
    }),
    Object.freeze({
        id: "word-contract-audit",
        label: "Word contract audit",
        command: "npm",
        args: ["run", "data:audit:jlpt:words"],
    }),
    Object.freeze({
        id: "audio-provenance-audit",
        label: "Audio provenance audit",
        command: "npm",
        args: ["run", "data:audit:audio", "--", "--json"],
    }),
    Object.freeze({
        id: "n5-kanji-golden-review",
        label: "N5 kanji golden review",
        command: "npm",
        args: ["run", "deck:review:n5"],
    }),
    Object.freeze({
        id: "n5-word-golden-review",
        label: "N5 word golden review",
        command: "npm",
        args: ["run", "deck:words:review:n5"],
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
        shell: process.platform === "win32",
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

function runProductReadinessGate({
    level = 5,
    cwd = process.cwd(),
    runCommandFn = spawnSync,
} = {}) {
    const plan = buildProductReadinessPlan({ level });
    const checks = [];

    for (const check of plan.commands) {
        const startedAt = Date.now();
        const result = normalizeCommandResult(runCommandFn(
            resolveCommand(check.command),
            check.args,
            buildSpawnOptions(cwd)
        ));
        const durationMs = Date.now() - startedAt;
        const passed = result.status === 0 && !result.error;

        checks.push({
            id: check.id,
            label: check.label,
            command: [check.command, ...check.args].join(" "),
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
