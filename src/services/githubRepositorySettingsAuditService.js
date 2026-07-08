const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPO = "JeremiahM18/japanese-kanji-anki-builder";
const DEFAULT_BRANCH = "main";
const DEFAULT_BRANCH_POLICY_PATH = path.join(".github", "branch-protection.main.json");

function parseArgs(argv = []) {
    const options = {
        repo: DEFAULT_REPO,
        branch: DEFAULT_BRANCH,
        json: false,
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--repo=")) {
            options.repo = arg.slice("--repo=".length);
        } else if (arg.startsWith("--branch=")) {
            options.branch = arg.slice("--branch=".length);
        } else {
            throw new Error(`Unknown GitHub settings audit option: ${arg}`);
        }
    }

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(options.repo)) {
        throw new Error(`Invalid GitHub repository slug: ${options.repo}`);
    }
    if (!/^[A-Za-z0-9_.\/-]+$/u.test(options.branch)) {
        throw new Error(`Invalid GitHub branch name: ${options.branch}`);
    }

    return options;
}

function buildHeaders(env = process.env) {
    const token = env.GH_TOKEN || env.GITHUB_TOKEN || "";
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "japanese-kanji-builder-github-settings-audit",
        "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function loadBranchProtectionPolicy({ cwd = process.cwd(), policyPath = DEFAULT_BRANCH_POLICY_PATH } = {}) {
    return JSON.parse(fs.readFileSync(path.resolve(cwd, policyPath), "utf-8"));
}

function buildAuditEndpoints(repo, branch) {
    const base = `https://api.github.com/repos/${repo}`;
    const workflowContentsBase = `${base}/contents/.github/workflows`;
    return [
        { key: "repository", url: base },
        { key: "branch", url: `${base}/branches/${encodeURIComponent(branch)}` },
        { key: "branchProtection", url: `${base}/branches/${encodeURIComponent(branch)}/protection` },
        { key: "codeScanningAlerts", url: `${base}/code-scanning/alerts?state=open&per_page=100` },
        { key: "secretScanningAlerts", url: `${base}/secret-scanning/alerts?state=open&per_page=100` },
        { key: "dependabotAlerts", url: `${base}/dependabot/alerts?state=open&per_page=100` },
        { key: "vulnerabilityAlerts", url: `${base}/vulnerability-alerts` },
        { key: "automatedSecurityFixes", url: `${base}/automated-security-fixes` },
        { key: "dependencyGraphSbom", url: `${base}/dependency-graph/sbom` },
        { key: "privateVulnerabilityReporting", url: `${base}/private-vulnerability-reporting` },
        { key: "actionsRuns", url: `${base}/actions/runs?per_page=20` },
        { key: "releaseWorkflowRuns", url: `${base}/actions/workflows/release.yml/runs?per_page=10` },
        { key: "ciWorkflow", url: `${base}/actions/workflows/ci.yml` },
        { key: "codeqlWorkflow", url: `${base}/actions/workflows/codeql.yml` },
        { key: "releaseWorkflow", url: `${base}/actions/workflows/release.yml` },
        { key: "ciWorkflowContent", url: `${workflowContentsBase}/ci.yml?ref=${encodeURIComponent(branch)}` },
        { key: "releaseWorkflowContent", url: `${workflowContentsBase}/release.yml?ref=${encodeURIComponent(branch)}` },
    ];
}

async function readEndpoint(endpoint, headers, fetchImpl = fetch) {
    const response = await fetchImpl(endpoint.url, { headers });
    const text = await response.text();
    let body = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }

    return {
        key: endpoint.key,
        ok: response.ok,
        statusCode: response.status,
        body,
    };
}

async function buildGithubSettingsAudit({
    repo = DEFAULT_REPO,
    branch = DEFAULT_BRANCH,
    env = process.env,
    fetchImpl = fetch,
    branchProtectionPolicy = loadBranchProtectionPolicy(),
} = {}) {
    const headers = buildHeaders(env);
    const endpoints = buildAuditEndpoints(repo, branch);
    const endpointResults = {};
    for (const endpoint of endpoints) {
        endpointResults[endpoint.key] = await readEndpoint(endpoint, headers, fetchImpl);
    }

    return evaluateGithubSettingsAudit({
        repo,
        branch,
        authenticated: Boolean(headers.Authorization),
        checkedAt: new Date().toISOString(),
        branchProtectionPolicy,
        endpoints: endpointResults,
    });
}

function countAlerts(endpointResult) {
    if (!endpointResult?.ok || !Array.isArray(endpointResult.body)) {
        return null;
    }
    return endpointResult.body.length;
}

function getLatestWorkflowRun(workflowName, actionsRunsResult) {
    const runs = actionsRunsResult?.body?.workflow_runs;
    if (!actionsRunsResult?.ok || !Array.isArray(runs)) {
        return null;
    }
    return runs.find((run) => run.name === workflowName) || null;
}

function getLatestRunFromEndpoint(actionsRunsResult) {
    const runs = actionsRunsResult?.body?.workflow_runs;
    if (!actionsRunsResult?.ok || !Array.isArray(runs)) {
        return null;
    }
    return runs[0] || null;
}

function decodeGitHubContent(endpointResult) {
    if (!endpointResult?.ok || endpointResult.body?.encoding !== "base64") {
        return null;
    }
    return Buffer.from(String(endpointResult.body.content || "").replace(/\s+/gu, ""), "base64").toString("utf-8");
}

function hasHostedDependencyReview(ciWorkflowText) {
    return Boolean(
        ciWorkflowText
        && ciWorkflowText.includes("name: Dependency Review")
        && ciWorkflowText.includes("pull_request")
        && ciWorkflowText.includes("actions/dependency-review-action@")
        && ciWorkflowText.includes("fail-on-severity: moderate")
    );
}

function hasHostedAttestationCreation(releaseWorkflowText) {
    return Boolean(
        releaseWorkflowText
        && releaseWorkflowText.includes("actions/attest@")
        && releaseWorkflowText.includes("Attest release bundle provenance")
        && releaseWorkflowText.includes("Attest release bundle SBOM")
        && releaseWorkflowText.includes("release-artifacts.sha256")
    );
}

function hasHostedAttestationVerification(releaseWorkflowText) {
    return Boolean(
        releaseWorkflowText
        && /\bgh\s+attestation\s+verify\b/iu.test(releaseWorkflowText)
        && releaseWorkflowText.includes("--repo")
        && releaseWorkflowText.includes("--signer-workflow")
        && releaseWorkflowText.includes("--source-ref")
        && releaseWorkflowText.includes("--source-digest")
    );
}

function listBranchProtectionPolicyGaps(branchProtectionResult, policy) {
    if (!branchProtectionResult?.ok || !policy?.requiredSettings) {
        return [];
    }

    const body = branchProtectionResult.body || {};
    const settings = policy.requiredSettings || {};
    const expectedChecks = policy.requiredStatusChecks || [];
    const actualChecks = body.required_status_checks?.contexts || [];
    const expectedCheckSet = new Set(expectedChecks);
    const actualCheckSet = new Set(actualChecks);
    const gaps = [];

    const expectations = [
        ["requirePullRequestBeforeMerging", Boolean(body.required_pull_request_reviews)],
        ["requiredApprovingReviewCount", body.required_pull_request_reviews?.required_approving_review_count],
        ["requireCodeOwnerReviews", body.required_pull_request_reviews?.require_code_owner_reviews === true],
        ["dismissStaleApprovals", body.required_pull_request_reviews?.dismiss_stale_reviews === true],
        ["requireConversationResolution", body.required_conversation_resolution?.enabled === true],
        ["requireStatusChecksBeforeMerging", Boolean(body.required_status_checks)],
        ["requireBranchesUpToDateBeforeMerging", body.required_status_checks?.strict === true],
        ["requireLinearHistory", body.required_linear_history?.enabled === true],
        ["doNotAllowBypassing", body.enforce_admins?.enabled === true],
        ["allowForcePushes", body.allow_force_pushes?.enabled === true],
        ["allowDeletions", body.allow_deletions?.enabled === true],
    ];

    for (const [key, actual] of expectations) {
        if (Object.hasOwn(settings, key) && actual !== settings[key]) {
            gaps.push(`${key} expected ${settings[key]} but hosted value is ${actual}`);
        }
    }

    for (const check of expectedChecks) {
        if (!actualCheckSet.has(check)) {
            gaps.push(`missing required status check: ${check}`);
        }
    }
    for (const check of actualChecks) {
        if (!expectedCheckSet.has(check)) {
            gaps.push(`unexpected required status check: ${check}`);
        }
    }

    return gaps;
}

function evaluateGithubSettingsAudit(audit) {
    const findings = [];
    const ciWorkflowText = decodeGitHubContent(audit.endpoints.ciWorkflowContent);
    const releaseWorkflowText = decodeGitHubContent(audit.endpoints.releaseWorkflowContent);
    const branchProtectionPolicyGaps = listBranchProtectionPolicyGaps(
        audit.endpoints.branchProtection,
        audit.branchProtectionPolicy
    );
    const repositorySecurityAndAnalysis = audit.endpoints.repository?.body?.security_and_analysis;
    const repositorySecurityAndAnalysisReadable =
        repositorySecurityAndAnalysis !== null
        && typeof repositorySecurityAndAnalysis === "object";
    const summary = {
        latestReleaseRun: getLatestRunFromEndpoint(audit.endpoints.releaseWorkflowRuns),
        repositoryPublic: audit.endpoints.repository?.body?.private === false,
        defaultBranch: audit.endpoints.repository?.body?.default_branch || null,
        branchProtected: audit.endpoints.branch?.body?.protected === true,
        branchProtectionReadable: audit.endpoints.branchProtection?.ok === true,
        branchProtectionMatchesPolicy: branchProtectionPolicyGaps.length === 0,
        openCodeScanningAlerts: countAlerts(audit.endpoints.codeScanningAlerts),
        openSecretScanningAlerts: countAlerts(audit.endpoints.secretScanningAlerts),
        openDependabotAlerts: countAlerts(audit.endpoints.dependabotAlerts),
        vulnerabilityAlertsEnabled: audit.endpoints.vulnerabilityAlerts?.ok === true
            && audit.endpoints.vulnerabilityAlerts?.statusCode === 204,
        dependencyGraphSbomReadable: audit.endpoints.dependencyGraphSbom?.ok === true
            && Array.isArray(audit.endpoints.dependencyGraphSbom?.body?.sbom?.packages),
        dependencyGraphSbomPackages: Array.isArray(audit.endpoints.dependencyGraphSbom?.body?.sbom?.packages)
            ? audit.endpoints.dependencyGraphSbom.body.sbom.packages.length
            : null,
        dependabotSecurityUpdatesEnabled: audit.endpoints.automatedSecurityFixes?.body?.enabled === true,
        dependabotSecurityUpdatesPaused: audit.endpoints.automatedSecurityFixes?.body?.paused === true,
        repositorySecurityAndAnalysisReadable,
        secretScanningEnabled: repositorySecurityAndAnalysis?.secret_scanning?.status === "enabled",
        secretScanningPushProtectionEnabled: repositorySecurityAndAnalysis?.secret_scanning_push_protection?.status === "enabled",
        privateVulnerabilityReportingReadable: audit.endpoints.privateVulnerabilityReporting?.ok === true,
        privateVulnerabilityReportingEnabled: audit.endpoints.privateVulnerabilityReporting?.body?.enabled === true,
        ciWorkflowActive: audit.endpoints.ciWorkflow?.body?.state === "active",
        codeqlWorkflowActive: audit.endpoints.codeqlWorkflow?.body?.state === "active",
        releaseWorkflowActive: audit.endpoints.releaseWorkflow?.body?.state === "active",
        dependencyReviewConfigured: hasHostedDependencyReview(ciWorkflowText),
        releaseWorkflowCreatesAttestations: hasHostedAttestationCreation(releaseWorkflowText),
        artifactAttestationVerificationAutomated: hasHostedAttestationVerification(releaseWorkflowText),
        artifactAttestationVerificationProven: false,
        latestCiConclusion: getLatestWorkflowRun("CI", audit.endpoints.actionsRuns)?.conclusion || null,
        latestCodeqlConclusion: getLatestWorkflowRun("CodeQL", audit.endpoints.actionsRuns)?.conclusion || null,
        latestReleaseConclusion: getLatestRunFromEndpoint(audit.endpoints.releaseWorkflowRuns)?.conclusion || null,
    };
    summary.artifactAttestationVerificationProven =
        summary.artifactAttestationVerificationAutomated
        && summary.latestReleaseRun?.conclusion === "success";

    if (!summary.branchProtected) {
        findings.push({
            severity: "critical",
            key: "main_branch_unprotected",
            message: `${audit.branch} is not protected in the live GitHub repository.`,
        });
    }

    if (!summary.privateVulnerabilityReportingEnabled) {
        findings.push({
            severity: "high",
            key: "private_vulnerability_reporting_disabled",
            message: "Private vulnerability reporting is not enabled in the live GitHub repository.",
        });
    }

    if (branchProtectionPolicyGaps.length > 0) {
        findings.push({
            severity: "high",
            key: "branch_protection_policy_mismatch",
            message: `Hosted branch protection does not match the tracked policy: ${branchProtectionPolicyGaps.join("; ")}.`,
        });
    }

    if (!summary.repositorySecurityAndAnalysisReadable) {
        findings.push({
            severity: "high",
            key: "repository_security_analysis_unverified",
            message: "GitHub repository security_and_analysis settings were not returned by the repository API.",
        });
    } else if (!summary.secretScanningEnabled) {
        findings.push({
            severity: "high",
            key: "secret_scanning_disabled",
            message: "GitHub secret scanning is not enabled in the live repository settings.",
        });
    }

    if (summary.repositorySecurityAndAnalysisReadable && !summary.secretScanningPushProtectionEnabled) {
        findings.push({
            severity: "high",
            key: "push_protection_disabled",
            message: "GitHub secret scanning push protection is not enabled in the live repository settings.",
        });
    }

    if (audit.endpoints.vulnerabilityAlerts?.ok) {
        if (!summary.vulnerabilityAlertsEnabled) {
            findings.push({
                severity: "high",
                key: "vulnerability_alerts_disabled",
                message: "GitHub vulnerability alerts and Dependency Graph are not enabled in the live repository settings.",
            });
        }
    }

    if (audit.endpoints.dependencyGraphSbom?.ok) {
        if (!summary.dependencyGraphSbomReadable) {
            findings.push({
                severity: "high",
                key: "dependency_graph_sbom_unreadable",
                message: "GitHub Dependency Graph SBOM endpoint did not return a readable package list.",
            });
        }
    }

    if (audit.endpoints.automatedSecurityFixes?.ok) {
        if (!summary.dependabotSecurityUpdatesEnabled) {
            findings.push({
                severity: "high",
                key: "dependabot_security_updates_disabled",
                message: "Dependabot security updates are not enabled in the live repository settings.",
            });
        }
        if (summary.dependabotSecurityUpdatesPaused) {
            findings.push({
                severity: "high",
                key: "dependabot_security_updates_paused",
                message: "Dependabot security updates are enabled but paused in the live repository settings.",
            });
        }
    }

    for (const key of [
        "branchProtection",
        "codeScanningAlerts",
        "secretScanningAlerts",
        "dependabotAlerts",
        "vulnerabilityAlerts",
        "dependencyGraphSbom",
        "automatedSecurityFixes",
    ]) {
        const endpoint = audit.endpoints[key];
        if (!endpoint?.ok) {
            findings.push({
                severity: endpoint?.statusCode === 401 ? "high" : "medium",
                key: `${key}_unverified`,
                message: `${key} could not be fully verified from the API (status ${endpoint?.statusCode || "unknown"}).`,
            });
        }
    }

    for (const [summaryKey, findingKey, severity, label] of [
        ["openCodeScanningAlerts", "code_scanning_open_alerts", "high", "Code scanning"],
        ["openSecretScanningAlerts", "secret_scanning_open_alerts", "critical", "Secret scanning"],
        ["openDependabotAlerts", "dependabot_open_alerts", "high", "Dependabot"],
    ]) {
        const count = summary[summaryKey];
        if (Number.isInteger(count) && count > 0) {
            findings.push({
                severity,
                key: findingKey,
                message: `${label} has ${count} open alert${count === 1 ? "" : "s"} in the live GitHub repository.`,
            });
        }
    }

    for (const [key, value] of [
        ["ciWorkflowActive", summary.ciWorkflowActive],
        ["codeqlWorkflowActive", summary.codeqlWorkflowActive],
        ["releaseWorkflowActive", summary.releaseWorkflowActive],
    ]) {
        if (!value) {
            findings.push({
                severity: "high",
                key,
                message: `${key} is not active in the live GitHub repository.`,
            });
        }
    }

    if (!audit.endpoints.ciWorkflowContent?.ok) {
        findings.push({
            severity: "high",
            key: "dependency_review_unverified",
            message: `Hosted CI workflow content could not be verified from the API (status ${audit.endpoints.ciWorkflowContent?.statusCode || "unknown"}).`,
        });
    } else if (!summary.dependencyReviewConfigured) {
        findings.push({
            severity: "high",
            key: "dependency_review_not_configured",
            message: "Hosted CI workflow does not prove Dependency Review is configured for pull requests at moderate severity.",
        });
    }

    if (!audit.endpoints.releaseWorkflowContent?.ok) {
        findings.push({
            severity: "high",
            key: "release_attestation_unverified",
            message: `Hosted release workflow content could not be verified from the API (status ${audit.endpoints.releaseWorkflowContent?.statusCode || "unknown"}).`,
        });
    } else {
        if (!summary.releaseWorkflowCreatesAttestations) {
            findings.push({
                severity: "high",
                key: "release_attestation_creation_not_configured",
                message: "Hosted release workflow does not prove release artifact provenance and SBOM attestations are created.",
            });
        }
        if (!summary.artifactAttestationVerificationAutomated) {
            findings.push({
                severity: "high",
                key: "artifact_attestation_verification_unverified",
                message: "Hosted workflow content does not prove artifact attestations are verified after release creation.",
            });
        } else if (!summary.artifactAttestationVerificationProven) {
            findings.push({
                severity: "high",
                key: "artifact_attestation_verification_unproven",
                message: "Hosted workflow content configures attestation verification, but no successful hosted release workflow run proves it yet.",
            });
        }
    }

    const status = findings.length === 0 ? "pass" : "fail";
    return {
        ...audit,
        summary,
        findings,
        status,
    };
}

function formatGithubSettingsAudit(audit) {
    const lines = [
        "GitHub repository settings audit",
        `Status: ${audit.status}`,
        `Repository: ${audit.repo}`,
        `Branch: ${audit.branch}`,
        `Authenticated API: ${audit.authenticated ? "yes" : "no"}`,
        `Branch protected: ${audit.summary.branchProtected ? "yes" : "no"}`,
        `Branch protection matches policy: ${audit.summary.branchProtectionMatchesPolicy ? "yes" : "no"}`,
        `CI workflow active: ${audit.summary.ciWorkflowActive ? "yes" : "no"}`,
        `CodeQL workflow active: ${audit.summary.codeqlWorkflowActive ? "yes" : "no"}`,
        `Release workflow active: ${audit.summary.releaseWorkflowActive ? "yes" : "no"}`,
        `Dependency Review configured: ${audit.summary.dependencyReviewConfigured ? "yes" : "no"}`,
        `Vulnerability alerts enabled: ${audit.summary.vulnerabilityAlertsEnabled ? "yes" : "no"}`,
        `Dependency Graph SBOM readable: ${audit.summary.dependencyGraphSbomReadable ? "yes" : "no"}`,
        `Dependency Graph SBOM packages: ${audit.summary.dependencyGraphSbomPackages ?? "unknown"}`,
        `Dependabot security updates enabled: ${audit.summary.dependabotSecurityUpdatesEnabled ? "yes" : "no"}`,
        `Dependabot security updates paused: ${audit.summary.dependabotSecurityUpdatesPaused ? "yes" : "no"}`,
        `Release attestations created: ${audit.summary.releaseWorkflowCreatesAttestations ? "yes" : "no"}`,
        `Artifact attestation verification automated: ${audit.summary.artifactAttestationVerificationAutomated ? "yes" : "no"}`,
        `Artifact attestation verification proven: ${audit.summary.artifactAttestationVerificationProven ? "yes" : "no"}`,
        `Repository security settings readable: ${audit.summary.repositorySecurityAndAnalysisReadable ? "yes" : "no"}`,
        `Secret scanning enabled: ${audit.summary.secretScanningEnabled ? "yes" : "no"}`,
        `Push protection enabled: ${audit.summary.secretScanningPushProtectionEnabled ? "yes" : "no"}`,
        `Private vulnerability reporting enabled: ${audit.summary.privateVulnerabilityReportingEnabled ? "yes" : "no"}`,
        `Open CodeQL alerts: ${audit.summary.openCodeScanningAlerts ?? "unknown"}`,
        `Open secret scanning alerts: ${audit.summary.openSecretScanningAlerts ?? "unknown"}`,
        `Open Dependabot alerts: ${audit.summary.openDependabotAlerts ?? "unknown"}`,
        `Latest CI conclusion: ${audit.summary.latestCiConclusion || "unknown"}`,
        `Latest CodeQL conclusion: ${audit.summary.latestCodeqlConclusion || "unknown"}`,
        `Latest Release conclusion: ${audit.summary.latestReleaseConclusion || "unknown"}`,
        "Findings:",
    ];
    if (audit.findings.length === 0) {
        lines.push("- none");
    } else {
        for (const finding of audit.findings) {
            lines.push(`- ${finding.severity}: ${finding.key} - ${finding.message}`);
        }
    }
    return lines.join("\n");
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const audit = await buildGithubSettingsAudit(options);
    if (options.json) {
        console.log(JSON.stringify(audit, null, 2));
    } else {
        console.log(formatGithubSettingsAudit(audit));
    }
    if (audit.status !== "pass") {
        process.exitCode = 1;
    }
}

module.exports = {
    buildAuditEndpoints,
    buildGithubSettingsAudit,
    buildHeaders,
    countAlerts,
    decodeGitHubContent,
    evaluateGithubSettingsAudit,
    formatGithubSettingsAudit,
    getLatestRunFromEndpoint,
    getLatestWorkflowRun,
    hasHostedAttestationCreation,
    hasHostedAttestationVerification,
    hasHostedDependencyReview,
    listBranchProtectionPolicyGaps,
    loadBranchProtectionPolicy,
    main,
    parseArgs,
    readEndpoint,
};
