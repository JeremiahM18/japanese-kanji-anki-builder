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
    listBranchProtectionPolicyGaps,
    parseArgs,
} = require("../scripts/auditGithubRepositorySettings");
const {
    buildAuthenticatedAuditEnv,
    formatAuthenticatedGithubSettingsAudit,
    resolveGithubAuditToken,
} = require("../scripts/auditGithubRepositorySettingsWithGhAuth");

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

const branchProtectionPolicy = Object.freeze({
    requiredSettings: {
        requirePullRequestBeforeMerging: true,
        requiredApprovingReviewCount: 1,
        requireCodeOwnerReviews: true,
        dismissStaleApprovals: true,
        requireConversationResolution: true,
        requireStatusChecksBeforeMerging: true,
        requireBranchesUpToDateBeforeMerging: true,
        requireLinearHistory: true,
        doNotAllowBypassing: true,
        allowForcePushes: false,
        allowDeletions: false,
    },
    requiredStatusChecks: [
        "Dependency Review",
        "Release Gate Ubuntu Node 22",
    ],
});

function protectedBranchEndpoint(overrides = {}) {
    return endpoint({
        body: {
            required_status_checks: {
                strict: true,
                contexts: ["Dependency Review", "Release Gate Ubuntu Node 22"],
            },
            required_pull_request_reviews: {
                dismiss_stale_reviews: true,
                require_code_owner_reviews: true,
                required_approving_review_count: 1,
            },
            required_conversation_resolution: { enabled: true },
            required_linear_history: { enabled: true },
            enforce_admins: { enabled: true },
            allow_force_pushes: { enabled: false },
            allow_deletions: { enabled: false },
            ...overrides,
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

test("authenticated GitHub settings wrapper prefers environment tokens", () => {
    let ghCalls = 0;
    const auth = resolveGithubAuditToken({
        env: { GH_TOKEN: " gh-token-from-env ", GITHUB_TOKEN: "github-token-from-env" },
        spawnSyncImpl: () => {
            ghCalls += 1;
            return { status: 0, stdout: "gh-cli-token" };
        },
    });

    assert.deepEqual(auth, {
        token: "gh-token-from-env",
        source: "GH_TOKEN",
    });
    assert.equal(ghCalls, 0);
    assert.deepEqual(buildAuthenticatedAuditEnv({ FOO: "bar" }, "token-value"), {
        FOO: "bar",
        GH_TOKEN: "token-value",
    });
});

test("authenticated GitHub settings wrapper falls back to gh auth token without printing the token", () => {
    const auth = resolveGithubAuditToken({
        env: {},
        spawnSyncImpl: (command, args, options) => {
            assert.equal(command, "gh");
            assert.deepEqual(args, ["auth", "token"]);
            assert.equal(options.windowsHide, true);
            return { status: 0, stdout: "gh-cli-token\n" };
        },
    });
    const formatted = formatAuthenticatedGithubSettingsAudit({
        repo: "owner/repo",
        branch: "main",
        authenticated: true,
        status: "pass",
        authenticationSource: auth.source,
        summary: {
            branchProtected: true,
            branchProtectionMatchesPolicy: true,
            ciWorkflowActive: true,
            codeqlWorkflowActive: true,
            releaseWorkflowActive: true,
            dependencyReviewConfigured: true,
            vulnerabilityAlertsEnabled: true,
            dependencyGraphSbomReadable: true,
            dependencyGraphSbomPackages: 1,
            dependabotSecurityUpdatesEnabled: true,
            dependabotSecurityUpdatesPaused: false,
            releaseWorkflowCreatesAttestations: true,
            artifactAttestationVerificationAutomated: true,
            artifactAttestationVerificationProven: true,
            repositorySecurityAndAnalysisReadable: true,
            secretScanningEnabled: true,
            secretScanningPushProtectionEnabled: true,
            privateVulnerabilityReportingEnabled: true,
            openCodeScanningAlerts: 0,
            openSecretScanningAlerts: 0,
            openDependabotAlerts: 0,
            latestCiConclusion: "success",
            latestCodeqlConclusion: "success",
            latestReleaseConclusion: "success",
        },
        findings: [],
    });

    assert.deepEqual(auth, {
        token: "gh-cli-token",
        source: "gh auth token",
    });
    assert.match(formatted, /Authentication source: gh auth token/u);
    assert.doesNotMatch(formatted, /gh-cli-token/u);
});

test("authenticated GitHub settings wrapper gives actionable auth guidance", () => {
    assert.throws(
        () => resolveGithubAuditToken({
            env: {},
            spawnSyncImpl: () => ({ status: 1, stdout: "", stderr: "not logged in" }),
        }),
        /gh auth status/u
    );
    assert.throws(
        () => resolveGithubAuditToken({
            env: {},
            spawnSyncImpl: () => ({ error: new Error("missing gh") }),
        }),
        /gh auth login/u
    );
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
        "vulnerabilityAlerts",
        "automatedSecurityFixes",
        "dependencyGraphSbom",
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
        "        run: gh attestation verify release-artifacts.sha256 --repo owner/repo --signer-workflow github.com/owner/repo/.github/workflows/release.yml --source-ref refs/tags/v1.0.0 --source-digest abc123",
        "      - run: echo release-artifacts.sha256",
    ].join("\n");

    assert.equal(decodeGitHubContent(contentEndpoint(ciWorkflow)), ciWorkflow);
    assert.equal(hasHostedDependencyReview(ciWorkflow), true);
    assert.equal(hasHostedAttestationCreation(releaseWorkflow), true);
    assert.equal(hasHostedAttestationVerification(releaseWorkflow), true);
});

test("listBranchProtectionPolicyGaps compares hosted branch protection to tracked policy", () => {
    assert.deepEqual(listBranchProtectionPolicyGaps(protectedBranchEndpoint(), branchProtectionPolicy), []);
    assert.deepEqual(
        listBranchProtectionPolicyGaps(protectedBranchEndpoint({
            required_status_checks: {
                strict: false,
                contexts: ["Dependency Review"],
            },
        }), branchProtectionPolicy),
        [
            "requireBranchesUpToDateBeforeMerging expected true but hosted value is false",
            "missing required status check: Release Gate Ubuntu Node 22",
        ]
    );
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
            vulnerabilityAlerts: endpoint({ ok: false, statusCode: 401 }),
            automatedSecurityFixes: endpoint({ ok: false, statusCode: 401 }),
            dependencyGraphSbom: endpoint({ ok: false, statusCode: 401 }),
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
    assert.equal(audit.summary.repositorySecurityAndAnalysisReadable, false);
    assert.equal(audit.summary.latestCiConclusion, "success");
    assert.equal(audit.findings.some((finding) => finding.key === "main_branch_unprotected"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "repository_security_analysis_unverified"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "secret_scanning_disabled"), false);
    assert.equal(audit.findings.some((finding) => finding.key === "push_protection_disabled"), false);
    assert.equal(audit.findings.some((finding) => finding.key === "secretScanningAlerts_unverified"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "private_vulnerability_reporting_disabled"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "artifact_attestation_verification_unverified"), true);
    assert.match(formatGithubSettingsAudit(audit), /Repository security settings readable: no/u);
    assert.match(formatGithubSettingsAudit(audit), /Branch protected: no/u);
});

test("evaluateGithubSettingsAudit fails closed on open hosted security alerts", () => {
    const audit = evaluateGithubSettingsAudit({
        repo: "owner/repo",
        branch: "main",
        authenticated: true,
        checkedAt: "2026-06-02T00:00:00.000Z",
        branchProtectionPolicy,
        endpoints: {
            repository: endpoint({
                body: {
                    private: false,
                    default_branch: "main",
                    security_and_analysis: {
                        secret_scanning: { status: "enabled" },
                        secret_scanning_push_protection: { status: "enabled" },
                    },
                },
            }),
            branch: endpoint({ body: { protected: true } }),
            branchProtection: protectedBranchEndpoint(),
            codeScanningAlerts: endpoint({ body: [{ number: 1 }, { number: 2 }] }),
            secretScanningAlerts: endpoint({ body: [{ number: 3 }] }),
            dependabotAlerts: endpoint({ body: [{ number: 4 }] }),
            vulnerabilityAlerts: endpoint({ statusCode: 204, body: null }),
            automatedSecurityFixes: endpoint({ body: { enabled: true, paused: false } }),
            dependencyGraphSbom: endpoint({ body: { sbom: { packages: [{ name: "root" }] } } }),
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
                "        run: gh attestation verify release-artifacts.sha256 --repo owner/repo --signer-workflow github.com/owner/repo/.github/workflows/release.yml --source-ref refs/tags/v1.0.0 --source-digest abc123",
                "      - run: echo release-artifacts.sha256",
            ].join("\n")),
        },
    });

    assert.equal(audit.status, "fail");
    assert.equal(audit.findings.some((finding) => finding.key === "code_scanning_open_alerts"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "secret_scanning_open_alerts"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "dependabot_open_alerts"), true);
    assert.match(formatGithubSettingsAudit(audit), /Open CodeQL alerts: 2/u);
});

test("evaluateGithubSettingsAudit requires a successful hosted release run to prove attestation verification", () => {
    const audit = evaluateGithubSettingsAudit({
        repo: "owner/repo",
        branch: "main",
        authenticated: true,
        checkedAt: "2026-06-02T00:00:00.000Z",
        branchProtectionPolicy,
        endpoints: {
            repository: endpoint({
                body: {
                    private: false,
                    default_branch: "main",
                    security_and_analysis: {
                        secret_scanning: { status: "enabled" },
                        secret_scanning_push_protection: { status: "enabled" },
                    },
                },
            }),
            branch: endpoint({ body: { protected: true } }),
            branchProtection: protectedBranchEndpoint(),
            codeScanningAlerts: endpoint({ body: [] }),
            secretScanningAlerts: endpoint({ body: [] }),
            dependabotAlerts: endpoint({ body: [] }),
            vulnerabilityAlerts: endpoint({ statusCode: 204, body: null }),
            automatedSecurityFixes: endpoint({ body: { enabled: true, paused: false } }),
            dependencyGraphSbom: endpoint({ body: { sbom: { packages: [{ name: "root" }] } } }),
            privateVulnerabilityReporting: endpoint({ body: { enabled: true } }),
            actionsRuns: endpoint({ body: { workflow_runs: [] } }),
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
                "      - name: Verify release bundle attestation",
                "        run: gh attestation verify release-artifacts.sha256 --repo owner/repo --signer-workflow github.com/owner/repo/.github/workflows/release.yml --source-ref refs/tags/v1.0.0 --source-digest abc123",
                "      - run: echo release-artifacts.sha256",
            ].join("\n")),
        },
    });

    assert.equal(audit.status, "fail");
    assert.equal(audit.summary.artifactAttestationVerificationAutomated, true);
    assert.equal(audit.summary.artifactAttestationVerificationProven, false);
    assert.equal(audit.findings.some((finding) => finding.key === "artifact_attestation_verification_unproven"), true);
    assert.match(formatGithubSettingsAudit(audit), /Artifact attestation verification proven: no/u);
});

test("evaluateGithubSettingsAudit fails closed when hosted security controls are disabled", () => {
    const audit = evaluateGithubSettingsAudit({
        repo: "owner/repo",
        branch: "main",
        authenticated: true,
        checkedAt: "2026-06-02T00:00:00.000Z",
        branchProtectionPolicy,
        endpoints: {
            repository: endpoint({
                body: {
                    private: false,
                    default_branch: "main",
                    security_and_analysis: {
                        secret_scanning: { status: "disabled" },
                        secret_scanning_push_protection: { status: "disabled" },
                    },
                },
            }),
            branch: endpoint({ body: { protected: true } }),
            branchProtection: protectedBranchEndpoint(),
            codeScanningAlerts: endpoint({ body: [] }),
            secretScanningAlerts: endpoint({ body: [] }),
            dependabotAlerts: endpoint({ body: [] }),
            vulnerabilityAlerts: endpoint({ ok: false, statusCode: 404 }),
            automatedSecurityFixes: endpoint({ body: { enabled: false, paused: false } }),
            dependencyGraphSbom: endpoint({ body: { sbom: { packages: null } } }),
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
                "        run: gh attestation verify release-artifacts.sha256 --repo owner/repo --signer-workflow github.com/owner/repo/.github/workflows/release.yml --source-ref refs/tags/v1.0.0 --source-digest abc123",
                "      - run: echo release-artifacts.sha256",
            ].join("\n")),
        },
    });

    assert.equal(audit.status, "fail");
    assert.equal(audit.summary.repositorySecurityAndAnalysisReadable, true);
    assert.equal(audit.summary.secretScanningEnabled, false);
    assert.equal(audit.summary.secretScanningPushProtectionEnabled, false);
    assert.equal(audit.summary.vulnerabilityAlertsEnabled, false);
    assert.equal(audit.summary.dependencyGraphSbomReadable, false);
    assert.equal(audit.summary.dependabotSecurityUpdatesEnabled, false);
    assert.equal(audit.findings.some((finding) => finding.key === "secret_scanning_disabled"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "push_protection_disabled"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "repository_security_analysis_unverified"), false);
    assert.equal(audit.findings.some((finding) => finding.key === "vulnerabilityAlerts_unverified"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "dependency_graph_sbom_unreadable"), true);
    assert.equal(audit.findings.some((finding) => finding.key === "dependabot_security_updates_disabled"), true);
});

test("evaluateGithubSettingsAudit can pass when every hosted signal is clean", () => {
    const audit = evaluateGithubSettingsAudit({
        repo: "owner/repo",
        branch: "main",
        authenticated: true,
        checkedAt: "2026-06-02T00:00:00.000Z",
        branchProtectionPolicy,
        endpoints: {
            repository: endpoint({
                body: {
                    private: false,
                    default_branch: "main",
                    security_and_analysis: {
                        secret_scanning: { status: "enabled" },
                        secret_scanning_push_protection: { status: "enabled" },
                    },
                },
            }),
            branch: endpoint({ body: { protected: true } }),
            branchProtection: protectedBranchEndpoint(),
            codeScanningAlerts: endpoint({ body: [] }),
            secretScanningAlerts: endpoint({ body: [] }),
            dependabotAlerts: endpoint({ body: [] }),
            vulnerabilityAlerts: endpoint({ statusCode: 204, body: null }),
            automatedSecurityFixes: endpoint({ body: { enabled: true, paused: false } }),
            dependencyGraphSbom: endpoint({ body: { sbom: { packages: [{ name: "root" }, { name: "dep" }] } } }),
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
                "        run: gh attestation verify release-artifacts.sha256 --repo owner/repo --signer-workflow github.com/owner/repo/.github/workflows/release.yml --source-ref refs/tags/v1.0.0 --source-digest abc123",
                "      - run: echo release-artifacts.sha256",
            ].join("\n")),
        },
    });

    assert.equal(audit.status, "pass");
    assert.deepEqual(audit.findings, []);
    assert.equal(audit.summary.openCodeScanningAlerts, 0);
    assert.equal(audit.summary.branchProtectionMatchesPolicy, true);
    assert.equal(audit.summary.secretScanningEnabled, true);
    assert.equal(audit.summary.secretScanningPushProtectionEnabled, true);
    assert.equal(audit.summary.vulnerabilityAlertsEnabled, true);
    assert.equal(audit.summary.dependencyGraphSbomReadable, true);
    assert.equal(audit.summary.dependencyGraphSbomPackages, 2);
    assert.equal(audit.summary.dependabotSecurityUpdatesEnabled, true);
    assert.equal(audit.summary.dependabotSecurityUpdatesPaused, false);
});

test("getLatestWorkflowRun selects the named workflow from recent runs", () => {
    assert.deepEqual(
        getLatestWorkflowRun("CodeQL", endpoint({
            body: { workflow_runs: [{ name: "CI" }, { name: "CodeQL", conclusion: "success" }] },
        })),
        { name: "CodeQL", conclusion: "success" }
    );
});
