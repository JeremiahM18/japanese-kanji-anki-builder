const fs = require("node:fs");
const path = require("node:path");

const { loadPerformanceMemoryAuditMatrix } = require("../datasets/performanceMemoryAuditMatrix");

function loadRepoText(cwd, relativePath) {
    return fs.readFileSync(path.join(cwd, relativePath), "utf-8");
}

function loadPackageScripts(cwd) {
    const packageJson = JSON.parse(loadRepoText(cwd, "package.json"));
    return packageJson.scripts || {};
}

function extractNpmScript(command) {
    const match = String(command || "").match(/^npm run ([^ ]+)/u);
    return match ? match[1] : null;
}

function collectLaneFailures({ cwd = process.cwd(), lane, scripts, workflowText, releaseWorkflowText }) {
    const failures = [];
    const commandScript = extractNpmScript(lane.command);

    if (!commandScript) {
        failures.push("command must start with npm run <script>");
    } else if (commandScript !== lane.packageScript) {
        failures.push(`packageScript '${lane.packageScript}' does not match command script '${commandScript}'`);
    }

    if (!scripts[lane.packageScript]) {
        failures.push(`package script '${lane.packageScript}' is missing from package.json`);
    }

    const gateScript = extractNpmScript(lane.timingBudget?.gateCommand);
    if (lane.timingBudget?.status === "present" && !gateScript) {
        failures.push("present timing budget must name a gateCommand");
    } else if (gateScript && !scripts[gateScript]) {
        failures.push(`timing budget gate script '${gateScript}' is missing from package.json`);
    }

    if (lane.memorySampling?.status === "present" && !lane.memorySampling.source) {
        failures.push("present memory sampling must name a source file");
    }
    if (lane.memorySampling?.source && !fs.existsSync(path.join(cwd, lane.memorySampling.source))) {
        failures.push(`memory sampling source '${lane.memorySampling.source}' is missing`);
    }

    const workflowCommand = lane.workflowCommand || lane.command;
    const ciIncludesCommand = workflowText.includes(workflowCommand);
    const releaseIncludesCommand = releaseWorkflowText.includes(workflowCommand);

    if (lane.ciPolicy === "manual-local") {
        if (ciIncludesCommand || releaseIncludesCommand) {
            failures.push("manual-local benchmark command is wired into GitHub Actions");
        }
    } else if (lane.ciPolicy === "ci-required" && !ciIncludesCommand) {
        failures.push("ci-required command is missing from .github/workflows/ci.yml");
    } else if (lane.ciPolicy === "smoke-ci" && !ciIncludesCommand) {
        failures.push("smoke-ci command is missing from .github/workflows/ci.yml");
    } else if (lane.ciPolicy === "release-ci" && !ciIncludesCommand && !releaseIncludesCommand) {
        failures.push("release-ci command is missing from GitHub Actions workflows");
    }

    return failures;
}

function buildPerformanceMemoryAuditMatrixReport({ cwd = process.cwd(), matrixPath } = {}) {
    const resolvedCwd = path.resolve(cwd);
    const matrix = loadPerformanceMemoryAuditMatrix(matrixPath);
    const scripts = loadPackageScripts(resolvedCwd);
    const workflowText = loadRepoText(resolvedCwd, path.join(".github", "workflows", "ci.yml"));
    const releaseWorkflowText = loadRepoText(resolvedCwd, path.join(".github", "workflows", "release.yml"));
    const lanes = matrix.lanes.map((lane) => {
        const failures = collectLaneFailures({
            lane,
            cwd: resolvedCwd,
            scripts,
            workflowText,
            releaseWorkflowText,
        });

        return {
            ...lane,
            passed: failures.length === 0,
            failures,
        };
    });
    const failures = lanes.flatMap((lane) => lane.failures.map((failure) => `${lane.id}: ${failure}`));

    return {
        passed: failures.length === 0,
        matrixPath: matrix.matrixPath,
        authority: matrix.authority,
        counts: {
            lanes: lanes.length,
            timingBudgetsPresent: lanes.filter((lane) => lane.timingBudget.status === "present").length,
            memorySamplingPresent: lanes.filter((lane) => lane.memorySampling.status === "present").length,
            manualLocal: lanes.filter((lane) => lane.ciPolicy === "manual-local").length,
            ciBacked: lanes.filter((lane) => lane.ciPolicy !== "manual-local").length,
        },
        lanes,
        failures,
    };
}

function formatLaneSummary(lane) {
    return [
        `- ${lane.id}: ${lane.passed ? "pass" : "fail"}; command ${lane.command}; ci ${lane.ciPolicy}; timing ${lane.timingBudget.status}; memory ${lane.memorySampling.status}`,
        `  input: ${lane.inputBoundary.join("; ")}`,
        `  output: ${lane.outputBoundary.join("; ")}`,
        `  release boundary: ${lane.releaseBoundary}`,
    ].join("\n");
}

function formatPerformanceMemoryAuditMatrixReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Performance And Memory Audit Matrix",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Matrix: ${report.matrixPath || "(unknown)"}`,
        `Lanes: ${report.counts?.lanes || 0}`,
        `Timing budgets present: ${report.counts?.timingBudgetsPresent || 0}`,
        `Memory sampling present: ${report.counts?.memorySamplingPresent || 0}`,
        `Manual/local guardrails: ${report.counts?.manualLocal || 0}`,
        `CI-backed package/contract lanes: ${report.counts?.ciBacked || 0}`,
        "",
        "Authority boundary:",
        ...(report.authority?.boundary || []).map((entry) => `- ${entry}`),
        "",
        "Lanes:",
        ...(report.lanes || []).map(formatLaneSummary),
    ];

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildPerformanceMemoryAuditMatrixReport,
    collectLaneFailures,
    extractNpmScript,
    formatPerformanceMemoryAuditMatrixReport,
};
