#!/usr/bin/env node

const DEFAULT_REPO = "JeremiahM18/japanese-kanji-anki-builder";
const DEFAULT_BRANCH = "main";

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
    return Boolean(releaseWorkflowText && /\bgh\s+attestation\s+verify\b/iu.test(releaseWorkflowText));
}

function evaluateGithubSettingsAudit(audit) {
    const findings = [];
    const ciWorkflowText = decodeGitHubContent(audit.endpoints.ciWorkflowContent);
    const releaseWorkflowText = decodeGitHubContent(audit.endpoints.releaseWorkflowContent);
    const summary = {
        repositoryPublic: audit.endpoints.repository?.body?.private === false,
        defaultBranch: audit.endpoints.repository?.body?.default_branch || null,
        branchProtected: audit.endpoints.branch?.body?.protected === true,
        branchProtectionReadable: audit.endpoints.branchProtection?.ok === true,
        openCodeScanningAlerts: countAlerts(audit.endpoints.codeScanningAlerts),
        openSecretScanningAlerts: countAlerts(audit.endpoints.secretScanningAlerts),
        openDependabotAlerts: countAlerts(audit.endpoints.dependabotAlerts),
        privateVulnerabilityReportingReadable: audit.endpoints.privateVulnerabilityReporting?.ok === true,
        privateVulnerabilityReportingEnabled: audit.endpoints.privateVulnerabilityReporting?.body?.enabled === true,
        ciWorkflowActive: audit.endpoints.ciWorkflow?.body?.state === "active",
        codeqlWorkflowActive: audit.endpoints.codeqlWorkflow?.body?.state === "active",
        releaseWorkflowActive: audit.endpoints.releaseWorkflow?.body?.state === "active",
        dependencyReviewConfigured: hasHostedDependencyReview(ciWorkflowText),
        releaseWorkflowCreatesAttestations: hasHostedAttestationCreation(releaseWorkflowText),
        artifactAttestationVerificationAutomated: hasHostedAttestationVerification(releaseWorkflowText),
        latestCiConclusion: getLatestWorkflowRun("CI", audit.endpoints.actionsRuns)?.conclusion || null,
        latestCodeqlConclusion: getLatestWorkflowRun("CodeQL", audit.endpoints.actionsRuns)?.conclusion || null,
        latestReleaseConclusion: getLatestRunFromEndpoint(audit.endpoints.releaseWorkflowRuns)?.conclusion || null,
    };

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

    for (const key of [
        "branchProtection",
        "codeScanningAlerts",
        "secretScanningAlerts",
        "dependabotAlerts",
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
        `CI workflow active: ${audit.summary.ciWorkflowActive ? "yes" : "no"}`,
        `CodeQL workflow active: ${audit.summary.codeqlWorkflowActive ? "yes" : "no"}`,
        `Release workflow active: ${audit.summary.releaseWorkflowActive ? "yes" : "no"}`,
        `Dependency Review configured: ${audit.summary.dependencyReviewConfigured ? "yes" : "no"}`,
        `Release attestations created: ${audit.summary.releaseWorkflowCreatesAttestations ? "yes" : "no"}`,
        `Artifact attestation verification automated: ${audit.summary.artifactAttestationVerificationAutomated ? "yes" : "no"}`,
        `Private vulnerability reporting enabled: ${audit.summary.privateVulnerabilityReportingEnabled ? "yes" : "no"}`,
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

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
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
    parseArgs,
    readEndpoint,
};
