const fs = require("node:fs");
const path = require("node:path");

const ACTION_ALLOWLIST = Object.freeze({
    "actions/checkout": {
        version: "v6.0.3",
        sha: "df4cb1c069e1874edd31b4311f1884172cec0e10",
    },
    "actions/setup-node": {
        version: "v6.4.0",
        sha: "48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
    },
    "actions/setup-python": {
        version: "v6.2.0",
        sha: "a309ff8b426b58ec0e2a45f0f869d46889d02405",
    },
    "actions/upload-artifact": {
        version: "v7.0.1",
        sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    },
    "actions/dependency-review-action": {
        version: "v5.0.0",
        sha: "a1d282b36b6f3519aa1f3fc636f609c47dddb294",
    },
    "actions/attest": {
        version: "v4.1.0",
        sha: "59d89421af93a897026c735860bf21b6eb4f7b26",
    },
    "github/codeql-action/analyze": {
        version: "v4.36.1",
        sha: "87557b9c84dde89fdd9b10e88954ac2f4248e463",
    },
    "github/codeql-action/init": {
        version: "v4.36.1",
        sha: "87557b9c84dde89fdd9b10e88954ac2f4248e463",
    },
});

const LIFECYCLE_SCRIPT_ALLOWLIST = Object.freeze({
    "node_modules/fsevents@2.3.3": "Optional macOS file-watcher dependency used by dev tooling.",
    "node_modules/onnxruntime-node@1.21.0": "Native ONNX runtime used by the assistive Transformers.js embedding lane.",
    "node_modules/protobufjs@7.6.5": "Transitive protobuf runtime dependency used by the assistive Transformers.js stack.",
    "node_modules/sharp@0.34.5": "Native image runtime pulled by the assistive Transformers.js stack.",
});

const WORKFLOW_FILES = Object.freeze([
    path.join(".github", "workflows", "codeql.yml"),
    path.join(".github", "workflows", "ci.yml"),
    path.join(".github", "workflows", "release.yml"),
]);

const REQUIRED_RELEASE_BUNDLE_PATHS = Object.freeze([
    ".release-smoke/out",
    ".release-gate/out",
    "CHANGELOG.md",
    "NOTICE.md",
    "docs/compatibility-matrix.md",
    "docs/branch-protection.md",
    "docs/release-process.md",
    "docs/release-qa-checklist.md",
    "out/security/sbom.cdx.json",
    "out/security/dependency-licenses.json",
    "release-artifacts.sha256",
]);

const FORBIDDEN_WORKFLOW_TOKENS = Object.freeze([
    "contents: write",
    "id-token: write",
    "attestations: write",
    "artifact-metadata: write",
    "pull-requests: write",
    "actions: write",
    "packages: write",
    "security-events: write",
    "write-all",
]);

const WORKFLOW_PERMISSION_EXCEPTIONS = Object.freeze({
    ".github/workflows/codeql.yml": Object.freeze(["security-events: write"]),
    ".github/workflows/release.yml": Object.freeze(["id-token: write", "attestations: write", "artifact-metadata: write"]),
});

const FORBIDDEN_SCRIPT_SPEC_RE = /^(?:git\+|git:|github:|file:|link:|workspace:|http:|https:|npm:)/iu;
const PINNED_SHA_RE = /^[a-f0-9]{40}$/u;

function readText(cwd, relativePath) {
    return fs.readFileSync(path.join(cwd, relativePath), "utf-8");
}

function readJson(cwd, relativePath) {
    return JSON.parse(readText(cwd, relativePath));
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join("/");
}

function dependencyNameFromPackagePath(packagePath) {
    const normalized = normalizePath(packagePath);
    const parts = normalized.split("/");
    if (parts[0] !== "node_modules") {
        return normalized;
    }
    if (parts[1]?.startsWith("@")) {
        return `${parts[1]}/${parts[2]}`;
    }
    return parts[1] || normalized;
}

function assertCondition(condition, errors, message) {
    if (!condition) {
        errors.push(message);
    }
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function countOccurrences(text, value) {
    return (text.match(new RegExp(escapeRegExp(value), "gu")) || []).length;
}

function collectDependencySpecs(lockPackage) {
    return [
        ...Object.entries(lockPackage.dependencies || {}),
        ...Object.entries(lockPackage.devDependencies || {}),
        ...Object.entries(lockPackage.optionalDependencies || {}),
        ...Object.entries(lockPackage.peerDependencies || {}),
    ];
}

function auditPackageManifest({ packageJson, lock }) {
    const errors = [];
    const warnings = [];

    assertCondition(lock.lockfileVersion === 3, errors, `package-lock.json must stay lockfileVersion 3; found ${lock.lockfileVersion}.`);
    assertCondition(lock.packages && typeof lock.packages === "object", errors, "package-lock.json is missing packages metadata.");
    assertCondition(lock.packages?.[""]?.name === packageJson.name, errors, "package-lock.json root package name must match package.json.");
    assertCondition(lock.packages?.[""]?.version === packageJson.version, errors, "package-lock.json root package version must match package.json.");
    assertCondition(
        packageJson.scripts?.["supply-chain:audit"] === "node scripts/auditSupplyChain.js",
        errors,
        "package.json must expose npm run supply-chain:audit."
    );

    const directDependencies = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
    };
    for (const [name, spec] of Object.entries(directDependencies)) {
        assertCondition(
            !FORBIDDEN_SCRIPT_SPEC_RE.test(String(spec)),
            errors,
            `Direct dependency ${name} must come from the npm registry via package-lock.json, not ${spec}.`
        );
        assertCondition(
            !!lock.packages?.[`node_modules/${name}`],
            errors,
            `Direct dependency ${name} is missing from package-lock.json.`
        );
    }

    const packageEntries = Object.entries(lock.packages || {}).filter(([packagePath]) => packagePath !== "");
    const registryHosts = new Map();
    const lifecycleScripts = [];

    for (const [packagePath, metadata] of packageEntries) {
        const normalizedPath = normalizePath(packagePath);
        if (metadata.resolved) {
            let parsedUrl = null;
            try {
                parsedUrl = new URL(metadata.resolved);
            } catch {
                // Non-URL specs are handled by the protocol check below.
            }

            if (parsedUrl) {
                registryHosts.set(parsedUrl.host, (registryHosts.get(parsedUrl.host) || 0) + 1);
                assertCondition(
                    parsedUrl.protocol === "https:" && parsedUrl.host === "registry.npmjs.org",
                    errors,
                    `${normalizedPath} resolves outside the approved npm registry: ${metadata.resolved}`
                );
            } else {
                assertCondition(
                    !FORBIDDEN_SCRIPT_SPEC_RE.test(String(metadata.resolved)),
                    errors,
                    `${normalizedPath} uses a forbidden resolved dependency source: ${metadata.resolved}`
                );
            }

            assertCondition(
                typeof metadata.integrity === "string" && metadata.integrity.length > 0,
                errors,
                `${normalizedPath} has a resolved tarball without an integrity hash.`
            );
        }

        for (const [dependencyName, spec] of collectDependencySpecs(metadata)) {
            assertCondition(
                !FORBIDDEN_SCRIPT_SPEC_RE.test(String(spec)),
                errors,
                `${normalizedPath} dependency ${dependencyName} uses forbidden dependency spec ${spec}.`
            );
        }

        if (metadata.hasInstallScript) {
            const key = `${normalizedPath}@${metadata.version}`;
            lifecycleScripts.push({
                key,
                packagePath: normalizedPath,
                packageName: dependencyNameFromPackagePath(normalizedPath),
                version: metadata.version,
                optional: !!metadata.optional,
                dev: !!metadata.dev,
                reason: LIFECYCLE_SCRIPT_ALLOWLIST[key],
            });
            assertCondition(
                !!LIFECYCLE_SCRIPT_ALLOWLIST[key],
                errors,
                `${normalizedPath}@${metadata.version} has an install script but is not in the reviewed allowlist.`
            );
        }
    }

    for (const [key, reason] of Object.entries(LIFECYCLE_SCRIPT_ALLOWLIST)) {
        assertCondition(
            lifecycleScripts.some((entry) => entry.key === key),
            errors,
            `Reviewed lifecycle-script package ${key} disappeared or changed version; reassess the allowlist reason: ${reason}`
        );
    }

    const packageScripts = Object.entries(packageJson.scripts || {});
    const directShellFragments = [
        "curl ",
        "wget ",
        "Invoke-WebRequest",
        "powershell -Command",
        "cmd /c",
    ];
    for (const [scriptName, command] of packageScripts) {
        for (const fragment of directShellFragments) {
            assertCondition(
                !String(command).toLowerCase().includes(fragment.toLowerCase()),
                errors,
                `npm script ${scriptName} uses direct shell/download fragment ${fragment}; route through a reviewed JS script.`
            );
        }
    }

    return {
        errors,
        warnings,
        summary: {
            packageCount: packageEntries.length,
            registryHosts: Object.fromEntries(registryHosts),
            lifecycleScripts,
        },
    };
}

function collectWorkflowUses(workflowText) {
    const uses = [];
    const useRe = /^\s*uses:\s*([^\s#]+)/gmu;
    let match = useRe.exec(workflowText);
    while (match !== null) {
        uses.push(match[1]);
        match = useRe.exec(workflowText);
    }
    return uses;
}

function collectWorkflowStepBlocks(workflowText) {
    const lines = String(workflowText || "").split(/\r?\n/u);
    const steps = [];
    let current = null;

    for (const line of lines) {
        const stepMatch = /^(\s*)-\s+name:\s*(.+?)\s*$/u.exec(line);
        if (stepMatch) {
            if (current) {
                steps.push(current);
            }
            current = {
                name: stepMatch[2],
                indent: stepMatch[1].length,
                lines: [line],
            };
        } else if (current) {
            current.lines.push(line);
        }
    }

    if (current) {
        steps.push(current);
    }

    return steps.map((step) => ({
        name: step.name,
        indent: step.indent,
        text: step.lines.join("\n"),
    }));
}

function collectNpmCiInstallSteps(workflowText) {
    return collectWorkflowStepBlocks(workflowText)
        .filter((step) => /^\s*run:\s*npm ci(?:\s|$)/mu.test(step.text))
        .map((step) => ({
            name: step.name,
            hasOnnxruntimeNodeInstallSkip: /^\s*ONNXRUNTIME_NODE_INSTALL:\s*skip\s*$/mu.test(step.text),
        }));
}

function assertSupplyChainAuditBeforeEveryInstall(workflowText, relativePath, errors) {
    const auditRe = /run:\s*npm run supply-chain:audit/gu;
    const installRe = /run:\s*npm ci(?:\s|$)/gu;
    const auditIndices = [];
    let auditMatch = auditRe.exec(workflowText);
    while (auditMatch !== null) {
        auditIndices.push(auditMatch.index);
        auditMatch = auditRe.exec(workflowText);
    }

    let previousInstallIndex = -1;
    let installMatch = installRe.exec(workflowText);
    while (installMatch !== null) {
        const installIndex = installMatch.index;
        const hasAuditInThisJobBlock = auditIndices.some((auditIndex) => auditIndex > previousInstallIndex && auditIndex < installIndex);
        assertCondition(
            hasAuditInThisJobBlock,
            errors,
            `${relativePath} must run npm run supply-chain:audit before each npm ci install step.`
        );
        previousInstallIndex = installIndex;
        installMatch = installRe.exec(workflowText);
    }
}

function assertOnnxruntimeNodeCudaInstallSkipForEveryInstall(workflowText, relativePath, errors) {
    const installSteps = collectNpmCiInstallSteps(workflowText);
    for (const step of installSteps) {
        assertCondition(
            step.hasOnnxruntimeNodeInstallSkip,
            errors,
            `${relativePath} npm ci step "${step.name}" must set ONNXRUNTIME_NODE_INSTALL: skip so CI installs the reviewed CPU runtime without external CUDA NuGet side-downloads.`
        );
    }
}

function parseActionUse(useValue) {
    const atIndex = useValue.lastIndexOf("@");
    if (atIndex === -1) {
        return { action: useValue, ref: "" };
    }
    return {
        action: useValue.slice(0, atIndex).toLowerCase(),
        ref: useValue.slice(atIndex + 1),
    };
}

function auditWorkflowFile({ relativePath, text }) {
    const errors = [];
    const warnings = [];
    const uses = collectWorkflowUses(text);
    const permissionExceptions = new Set(WORKFLOW_PERMISSION_EXCEPTIONS[relativePath] || []);

    assertCondition(
        /permissions:\s*\r?\n\s+contents:\s+read/u.test(text),
        errors,
        `${relativePath} must keep top-level permissions limited to contents: read.`
    );
    for (const forbidden of FORBIDDEN_WORKFLOW_TOKENS) {
        if (permissionExceptions.has(forbidden)) {
            continue;
        }
        assertCondition(
            !text.includes(forbidden),
            errors,
            `${relativePath} must not request broad workflow permission ${forbidden}.`
        );
    }
    for (const permissionException of permissionExceptions) {
        assertCondition(
            countOccurrences(text, permissionException) === 1,
            errors,
            `${relativePath} may request ${permissionException} exactly once for its reviewed security workflow job.`
        );
    }
    if (permissionExceptions.has("security-events: write")) {
        assertCondition(
            /^\s{4}permissions:\s*\r?\n\s{6}actions:\s+read\r?\n\s{6}contents:\s+read\r?\n\s{6}security-events:\s+write/mu.test(text),
            errors,
            `${relativePath} must scope security-events: write to the CodeQL job alongside read-only actions and contents permissions.`
        );
    }
    if (permissionExceptions.has("id-token: write")) {
        assertCondition(
            /^\s{4}permissions:\s*\r?\n\s{6}contents:\s+read\r?\n\s{6}id-token:\s+write\r?\n\s{6}attestations:\s+write\r?\n\s{6}artifact-metadata:\s+write/mu.test(text),
            errors,
            `${relativePath} must scope id-token and attestation write permissions to the release bundle job.`
        );
    }
    assertSupplyChainAuditBeforeEveryInstall(text, relativePath, errors);
    assertOnnxruntimeNodeCudaInstallSkipForEveryInstall(text, relativePath, errors);

    for (const useValue of uses) {
        if (useValue.startsWith("./")) {
            continue;
        }
        const { action, ref } = parseActionUse(useValue);
        const expected = ACTION_ALLOWLIST[action];
        assertCondition(!!expected, errors, `${relativePath} uses unreviewed external action ${useValue}.`);
        if (!expected) {
            continue;
        }
        assertCondition(
            PINNED_SHA_RE.test(ref),
            errors,
            `${relativePath} must pin ${action}@${expected.version} to the reviewed SHA ${expected.sha}; found ${useValue}.`
        );
        assertCondition(
            ref === expected.sha,
            errors,
            `${relativePath} has unexpected pin for ${action}@${expected.version}; expected ${expected.sha}, found ${ref}.`
        );
    }

    return {
        errors,
        warnings,
        summary: {
            actionUses: uses,
            installSteps: collectNpmCiInstallSteps(text),
        },
    };
}

function auditReleaseArtifactBoundary(releaseWorkflowText) {
    const errors = [];
    const warnings = [];

    assertCondition(
        /release_bundle:[\s\S]*needs:\s*\r?\n\s+- release_verify/u.test(releaseWorkflowText),
        errors,
        "release_bundle must depend on release_verify before publishing bundle artifacts."
    );
    assertCondition(
        releaseWorkflowText.includes("find .release-smoke/out .release-gate/out out/security/sbom.cdx.json out/security/dependency-licenses.json -type f -print0"),
        errors,
        "release workflow must checksum only the deterministic smoke, release-gate, SBOM, and dependency-license output paths."
    );
    assertCondition(
        releaseWorkflowText.includes("sort -z"),
        errors,
        "release workflow must sort checksum inputs deterministically."
    );
    assertCondition(
        releaseWorkflowText.includes("xargs -0 sha256sum > release-artifacts.sha256"),
        errors,
        "release workflow must emit release-artifacts.sha256 from null-delimited sha256sum input."
    );
    assertCondition(
        releaseWorkflowText.includes("Attest release bundle provenance") && releaseWorkflowText.includes("Attest release bundle SBOM"),
        errors,
        "release workflow must create provenance and SBOM attestations for tagged release artifacts."
    );
    assertCondition(
        releaseWorkflowText.includes("sbom-path: out/security/sbom.cdx.json"),
        errors,
        "release workflow must bind the generated CycloneDX SBOM into the SBOM attestation."
    );
    assertCondition(
        releaseWorkflowText.includes("Verify release bundle attestations")
            && releaseWorkflowText.includes("gh attestation verify")
            && releaseWorkflowText.includes("--signer-workflow")
            && releaseWorkflowText.includes("--source-ref")
            && releaseWorkflowText.includes("--source-digest"),
        errors,
        "release workflow must verify release bundle attestations with signer workflow, source ref, and source digest constraints."
    );

    for (const releasePath of REQUIRED_RELEASE_BUNDLE_PATHS) {
        assertCondition(
            releaseWorkflowText.includes(releasePath),
            errors,
            `release workflow upload bundle is missing required path ${releasePath}.`
        );
    }

    for (const forbiddenPath of ["data/", "downloads/", "node_modules", ".env"]) {
        assertCondition(
            !releaseWorkflowText.includes(forbiddenPath),
            errors,
            `release workflow must not upload or checksum local/private path ${forbiddenPath}.`
        );
    }

    return {
        errors,
        warnings,
        summary: {
            requiredReleaseBundlePaths: REQUIRED_RELEASE_BUNDLE_PATHS,
        },
    };
}

function buildSupplyChainAuditReport({ cwd = process.cwd() } = {}) {
    const packageJson = readJson(cwd, "package.json");
    const lock = readJson(cwd, "package-lock.json");
    const packageAudit = auditPackageManifest({ packageJson, lock });
    const workflowAudits = WORKFLOW_FILES.map((relativePath) => {
        const text = readText(cwd, relativePath);
        return {
            relativePath: normalizePath(relativePath),
            ...auditWorkflowFile({ relativePath: normalizePath(relativePath), text }),
        };
    });
    const releaseWorkflowText = readText(cwd, path.join(".github", "workflows", "release.yml"));
    const releaseBoundaryAudit = auditReleaseArtifactBoundary(releaseWorkflowText);

    return {
        ok: [
            ...packageAudit.errors,
            ...workflowAudits.flatMap((audit) => audit.errors),
            ...releaseBoundaryAudit.errors,
        ].length === 0,
        errors: [
            ...packageAudit.errors,
            ...workflowAudits.flatMap((audit) => audit.errors),
            ...releaseBoundaryAudit.errors,
        ],
        warnings: [
            ...packageAudit.warnings,
            ...workflowAudits.flatMap((audit) => audit.warnings),
            ...releaseBoundaryAudit.warnings,
        ],
        package: packageAudit.summary,
        workflows: workflowAudits.map((audit) => ({
            relativePath: audit.relativePath,
            actionUses: audit.summary.actionUses,
            installSteps: audit.summary.installSteps,
        })),
        releaseArtifacts: releaseBoundaryAudit.summary,
    };
}

function formatSupplyChainAuditReport(report) {
    const lines = [
        "Supply chain audit",
        `Status: ${report.ok ? "pass" : "fail"}`,
        `Lockfile packages: ${report.package.packageCount}`,
        `Registry hosts: ${Object.entries(report.package.registryHosts).map(([host, count]) => `${host}=${count}`).join(", ") || "none"}`,
        "Lifecycle script packages:",
    ];

    for (const entry of report.package.lifecycleScripts) {
        lines.push(`- ${entry.packageName}@${entry.version} (${entry.packagePath}) - ${entry.reason || "unreviewed"}`);
    }

    lines.push("GitHub Actions pins:");
    for (const workflow of report.workflows) {
        lines.push(`- ${workflow.relativePath}: ${workflow.actionUses.length} external action uses`);
    }
    lines.push("Install policy:");
    for (const workflow of report.workflows) {
        const installCount = workflow.installSteps.length;
        const skipCount = workflow.installSteps.filter((step) => step.hasOnnxruntimeNodeInstallSkip).length;
        lines.push(`- ${workflow.relativePath}: ${skipCount}/${installCount} npm ci steps set ONNXRUNTIME_NODE_INSTALL=skip`);
    }

    lines.push("Release artifact boundary:");
    for (const releasePath of report.releaseArtifacts.requiredReleaseBundlePaths) {
        lines.push(`- ${releasePath}`);
    }

    if (report.errors.length > 0) {
        lines.push("Errors:");
        for (const error of report.errors) {
            lines.push(`- ${error}`);
        }
    }
    if (report.warnings.length > 0) {
        lines.push("Warnings:");
        for (const warning of report.warnings) {
            lines.push(`- ${warning}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

if (require.main === module) {
    const report = buildSupplyChainAuditReport();
    const text = formatSupplyChainAuditReport(report);
    if (report.ok) {
        process.stdout.write(text);
    } else {
        process.stderr.write(text);
        process.exitCode = 1;
    }
}

module.exports = {
    ACTION_ALLOWLIST,
    LIFECYCLE_SCRIPT_ALLOWLIST,
    buildSupplyChainAuditReport,
    formatSupplyChainAuditReport,
};
