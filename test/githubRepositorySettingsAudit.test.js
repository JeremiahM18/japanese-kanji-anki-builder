const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildAuditEndpoints,
    buildHeaders,
    decodeGitHubContent,
    evaluateGithubSettingsAudit,
    formatGithubSettingsAudit,
    hasHostedAttestationCreation,
    hasHostedAttestationVerification,
    hasHostedDependencyReview,
    getLatestWorkflowRun,
    parseArgs,
} = require("../scripts/auditGithubRepositorySettings");

function endpoint({ ok = true, statusCode = 200, body = {} } = {}) {
    return { ok, statusCode, body };
}

function contentEndpoint(text) {
    return endpoint({
        body: {
            encoding: "base64",
            content: Buffer.from(text, "utf-8").toString("base64"),
        },
    });
}

test("parseArgs defaults to the governed GitHub repository", () => {
    assert.deepEqual(parseArgs([]), {
        repo: "JeremiahM18/japanese-kanji-anki-builder",
        branch: "main",
        json: false,
    });
    assert.deepEqual(parseArgs(["--repo=owner/repo", "--branch=release", "--json"]), {
        repo: "owner/repo",
        branch: "release",
        json: true,
    });
    assert.throws(() => parseArgs(["--repo=bad"]), /Invalid GitHub repository slug/u);
});

test("buildHeaders uses a token without exposing one when absent", () => {
    assert.equal(buildHeaders({}).Authorization, undefined);
    assert.equal(buildHeaders({ GH_TOKEN: "token-value" }).Authorization, "Bearer token-value");
});

test("buildAuditEndpoints covers hosted P0 settings", () => {
    const keys = buildAuditEndpoints("owner/repo", "main").map((item) => item.key);
    assert.deepEqual(keys, [
        "repository",
        "branch",
        "branchProtection",
        "codeScanningAlerts",
        "secretScanningAlerts",
        "dependabotAlerts",
        "privateVulnerabilityReporting",
        "actionsRuns",
        "releaseWorkflowRuns",
        "ciWorkflow",
        "codeqlWorkflow",
        "releaseWorkflow",
        "ciWorkflowContent",
        "releaseWorkflowContent",
    ]);
});

test("hosted workflow content helpers detect dependency review and attestation posture", () => {
    const ciWorkflow = [
        "on:",
        "  pull_request:",
        "jobs:",
        "  dependency_review:",
        "    name: Dependency Review",
        "    steps:",
        "      - uses: actions/dependency-review-action@reviewedsha",
        "        with:",
        "          fail-on-severity: moderate",
    ].join("\n");
    const releaseWorkflow = [
        "jobs:",
        "  release_bundle:",
        "    steps:",
        "      - name: Attest release bundle provenance",
        "        uses: actions/attest@reviewedsha",
        "      - name: Attest release bundle SBOM",
        "        uses: actions/attest@reviewedsha",
        "      - name: Verify release bundle attestation",
        "        run: gh attestation verify release-artifacts.sha256",
        "      - run: echo release-artifacts.sha256",
    ].join("\n");

    assert.equal(decodeGitHubContent(contentEndpoint(ciWorkflow)), ciWorkflow);
    assert.equal(hasHostedDependencyReview(ciWorkflow), true);
    assert.equal(hasHostedAttestationCreation(releaseWorkflow), true);
    assert.equal(hasHostedAttestationVerification(releaseWorkflow), true);
});

test("evaluateGithubSettingsAudit fails closed on unprotected main and auth-only gaps", () => {
    const audit = evaluateGithubSettingsAudit({
        repo: "owner/repo",
        branch: "main",
        authenticated: false,
        checkedAt: "2026-06-02T00:00:00.000Z",
        endpoints: {
            repository: endpoint({ body: { private: false, default_branch: "main" } }),
            branch: endpoint({ body: { protected: false } }),
            branchProtection: endpoint({ ok: false, statusCode: 401 }),
            codeScanningAlerts: endpoint({ ok: false, statusCode: 401 }),
            secretScanningAlerts: endpoint({ ok: false, statusCode: 401 }),
            dependabotAlerts: endpoint({ ok: false, statusCode: 401 }),
            privateVulnerabilityReporting: endpoint({ body: { enabled: false } }),
            actionsRuns: endpoint({
                body: {
                    workflow_runs: [
                        { name: "CodeQL", conclusion: "success" },
                        { name: "CI", conclusion: "success" },
                    ],
                },
            }),
            releaseWorkflowRuns: endpoint({ body: { workflow_runs: [] } }),
            ciWorkflow: endpoint({ body: { state: "active" } }),
            codeqlWorkflow: endpoint({ body: { state: "active" } }),
            releaseWorkflow: endpoint({ body: { state: "active" } }),
            ciWorkflowContent: contentEndpoint([
                "on:",
                "  pull_request:",
                "jobs:",
                "  dependency_review:",
                "    name: Dependency Review",
                "    steps:",
                "      - uses: actions/dependency-review-action@reviewedsha",
                "        with:",
                "          fail-on-severity: moderate",
            ].join("\n")),
            releaseWorkflowContent: contentEndpoint([
                "jobs:",
                "  release_bundle:",
                "    steps:",
                "      - name: Attest release bundle provenance",
                "        uses: actions/attest@reviewedsha",
                "      - name: Attest release bundle SBOM",
                "        uses: actions/attest@reviewedsha",
                "      - run: echo release-artifacts.sha256",
            ].join("\n")),
        },
    });

    assert.equal(audit.status, "fail");
    assert.equal(audit.summary.branchProtected, false);
    assert.equal(audit.summary.latestCiConclusion, "success");
    assert.equal(audit.findings.some((finding) => finding.key === "main_branch_unprotected"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "secretScanningAlerts_unverified"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "private_vulnerability_reporting_disabled"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "artifact_attestation_verification_unverified"), true);
    assert.match(formatGithubSettingsAudit(audit), /Branch protected: no/u);
});

test("evaluateGithubSettingsAudit can pass when every hosted signal is clean", () => {
    const audit = evaluateGithubSettingsAudit({
        repo: "owner/repo",
        branch: "main",
        authenticated: true,
        checkedAt: "2026-06-02T00:00:00.000Z",
        endpoints: {
            repository: endpoint({ body: { private: false, default_branch: "main" } }),
            branch: endpoint({ body: { protected: true } }),
            branchProtection: endpoint(),
            codeScanningAlerts: endpoint({ body: [] }),
            secretScanningAlerts: endpoint({ body: [] }),
            dependabotAlerts: endpoint({ body: [] }),
            privateVulnerabilityReporting: endpoint({ body: { enabled: true } }),
            actionsRuns: endpoint({ body: { workflow_runs: [] } }),
            releaseWorkflowRuns: endpoint({ body: { workflow_runs: [{ conclusion: "success" }] } }),
            ciWorkflow: endpoint({ body: { state: "active" } }),
            codeqlWorkflow: endpoint({ body: { state: "active" } }),
            releaseWorkflow: endpoint({ body: { state: "active" } }),
            ciWorkflowContent: contentEndpoint([
                "on:",
                "  pull_request:",
                "jobs:",
                "  dependency_review:",
                "    name: Dependency Review",
                "    steps:",
                "      - uses: actions/dependency-review-action@reviewedsha",
                "        with:",
                "          fail-on-severity: moderate",
            ].join("\n")),
            releaseWorkflowContent: contentEndpoint([
                "jobs:",
                "  release_bundle:",
                "    steps:",
                "      - name: Attest release bundle provenance",
                "        uses: actions/attest@reviewedsha",
                "      - name: Attest release bundle SBOM",
                "        uses: actions/attest@reviewedsha",
                "      - name: Verify release bundle attestation",
                "        run: gh attestation verify release-artifacts.sha256",
                "      - run: echo release-artifacts.sha256",
            ].join("\n")),
        },
    });

    assert.equal(audit.status, "pass");
    assert.deepEqual(audit.findings, []);
    assert.equal(audit.summary.openCodeScanningAlerts, 0);
});

test("getLatestWorkflowRun selects the named workflow from recent runs", () => {
    assert.deepEqual(
        getLatestWorkflowRun("CodeQL", endpoint({
            body: { workflow_runs: [{ name: "CI" }, { name: "CodeQL", conclusion: "success" }] },
        })),
        { name: "CodeQL", conclusion: "success" }
    );
});
