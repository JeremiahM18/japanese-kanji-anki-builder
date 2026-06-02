const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    buildSecretAuditReport,
    formatSecretAuditReport,
    scanTextForSecrets,
} = require("../scripts/auditSecrets");

const repoRoot = path.resolve(__dirname, "..");

function joinToken(parts) {
    return parts.join("");
}

test("secret audit passes the current tracked repository files", () => {
    const report = buildSecretAuditReport({ cwd: repoRoot });

    assert.equal(report.ok, true);
    assert.deepEqual(report.findings, []);
    assert.ok(report.scannedFileCount > 0);
});

test("secret audit detects high-confidence token and key patterns", () => {
    const text = [
        "normal content",
        joinToken(["ghp", "_", "a".repeat(36)]),
        joinToken(["AKIA", "A".repeat(16)]),
        joinToken(["-----BEGIN ", "PRIVATE KEY-----"]),
    ].join("\n");

    const findings = scanTextForSecrets({ relativePath: "fixture.txt", text });

    assert.deepEqual(
        findings.map((finding) => finding.patternId),
        ["private-key-block", "github-classic-token", "aws-access-key"]
    );
    assert.deepEqual(
        findings.map((finding) => finding.line),
        [4, 2, 3]
    );
});

test("secret audit report is readable for local verification", () => {
    const report = buildSecretAuditReport({ cwd: repoRoot });
    const text = formatSecretAuditReport(report);

    assert.match(text, /Secret audit/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Tracked files scanned:/);
});
