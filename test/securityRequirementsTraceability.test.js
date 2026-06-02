const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { loadSecurityRequirementsTraceability } = require("../src/datasets/securityRequirementsTraceability");
const {
    buildSecurityRequirementsTraceabilityReport,
    collectSecurityRequirementsTraceabilityFailures,
    extractNpmScript,
    formatSecurityRequirementsTraceabilityReport,
} = require("../src/services/securityRequirementsTraceabilityService");
const { parseArgs } = require("../scripts/auditSecurityRequirementsTraceability");

const repoRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf-8"));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

test("security requirements traceability matrix validates tracked controls", () => {
    const report = buildSecurityRequirementsTraceabilityReport({ cwd: repoRoot });

    assert.equal(report.passed, true);
    assert.equal(report.counts.requirements, 13);
    assert.equal(report.counts.releaseBlockers, 10);
    assert.equal(report.counts.manualQaRequired, 12);
    assert.equal(report.counts.statuses["external-blocked"], 3);
    assert.equal(report.counts.statuses.implemented, 9);
    assert.equal(report.counts.statuses["partially-implemented"], 1);
    assert.equal(report.counts.statuses.planned || 0, 0);
    assert.deepEqual(report.failures, []);
});

test("security requirements traceability report preserves blocker visibility", () => {
    const report = buildSecurityRequirementsTraceabilityReport({ cwd: repoRoot });
    const text = formatSecurityRequirementsTraceabilityReport(report);

    assert.match(text, /Security requirements traceability/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Release blockers: 10/);
    assert.match(text, /SEC-REQ-001: external-blocked/);
    assert.match(text, /SEC-REQ-007: partially-implemented/);
    assert.match(text, /SEC-REQ-012: implemented/);
    assert.match(text, /SEC-REQ-013: implemented/);
});

test("security requirements traceability catches duplicate IDs and missing links", () => {
    const matrix = loadSecurityRequirementsTraceability();
    const packageJson = readJson("package.json");
    const riskRegisterText = readText(path.join("docs", "risk-register.md"));
    const duplicate = {
        ...matrix.requirements[0],
        implementationFiles: ["docs/does-not-exist.md"],
        verificationCommands: ["npm run does-not-exist"],
        riskRecords: ["SEC-DOES-NOT-EXIST"],
    };
    const failures = collectSecurityRequirementsTraceabilityFailures({
        cwd: repoRoot,
        matrix: {
            ...matrix,
            requirements: [
                ...matrix.requirements,
                duplicate,
            ],
        },
        scripts: packageJson.scripts,
        riskRegisterText,
    });

    assert.equal(failures.some((failure) => failure.includes("duplicate requirement id: SEC-REQ-001")), true);
    assert.equal(failures.some((failure) => failure.includes("implementation file is missing: docs/does-not-exist.md")), true);
    assert.equal(failures.some((failure) => failure.includes("missing package script: does-not-exist")), true);
    assert.equal(failures.some((failure) => failure.includes("risk record is missing")), true);
});

test("security requirements CLI argument parsing supports json and matrix override", () => {
    assert.deepEqual(parseArgs([]), {
        json: false,
        traceabilityPath: undefined,
        unknownArgs: [],
    });
    assert.deepEqual(parseArgs(["--json", "--traceability=custom.json"]), {
        json: true,
        traceabilityPath: "custom.json",
        unknownArgs: [],
    });
    assert.equal(extractNpmScript("npm run security:requirements"), "security:requirements");
});
