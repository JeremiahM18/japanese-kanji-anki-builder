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
});

const WORKFLOW_FILES = Object.freeze([
    path.join(".github", "workflows", "codeql.yml"),
    path.join(".github", "workflows", "ci.yml"),
    path.join(".github", "workflows", "release.yml"),
]);

const REQUIRED_RELEASE_BUNDLE_PATHS = Object.freeze([
    ".release-bundle",
    ".release-bundle/release-qa-evidence.json",
    ".release-bundle/sbom.cdx.json",
    ".release-bundle/dependency-licenses.json",
    ".release-bundle/release-verification-materials.tar.gz",
    ".release-bundle/release-artifacts.sha256",
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
    ".github/workflows/release.yml": Object.freeze(["contents: write", "id-token: write", "attestations: write", "artifact-metadata: write"]),
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

function parseSimpleSemver(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(value || ""));
    return match ? match.slice(1).map(Number) : null;
}

function compareSimpleSemver(left, right) {
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] < right[index] ? -1 : 1;
        }
    }
    return 0;
}

function satisfiesReviewedSimpleRange(version, range) {
    const parsedVersion = parseSimpleSemver(version);
    const match = /^([~^]?)(\d+\.\d+\.\d+)$/u.exec(String(range || ""));
    const minimum = match ? parseSimpleSemver(match[2]) : null;
    if (!parsedVersion || !match || !minimum) {
        throw new Error(`Unsupported dependency security override semver comparison: ${version} against ${range}`);
    }
    if (compareSimpleSemver(parsedVersion, minimum) < 0) {
        return false;
    }
    if (!match[1]) {
        return compareSimpleSemver(parsedVersion, minimum) === 0;
    }
    const upper = match[1] === "~"
        ? [minimum[0], minimum[1] + 1, 0]
        : minimum[0] > 0
            ? [minimum[0] + 1, 0, 0]
            : minimum[1] > 0
                ? [0, minimum[1] + 1, 0]
                : [0, 0, minimum[2] + 1];
    return compareSimpleSemver(parsedVersion, upper) < 0;
}

function isCanonicalDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""))) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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

function auditDependencySecurityOverrides({
    packageJson,
    lock,
    policy,
    asOfDate = new Date().toISOString().slice(0, 10),
}) {
    const errors = [];
    const entries = Array.isArray(policy?.overrides) ? policy.overrides : [];
    assertCondition(policy?.version === 1, errors, "Dependency security override policy must use version 1.");
    assertCondition(
        isCanonicalDate(policy?.checkedAt),
        errors,
        "Dependency security override policy checkedAt must be YYYY-MM-DD."
    );
    assertCondition(entries.length > 0, errors, "Dependency security override policy must govern every package.json override.");

    const governedKeys = new Set();
    const registeredScripts = new Set(Object.keys(packageJson.scripts || {}));
    const expectedEntryFields = [
        "parentPackage",
        "packageName",
        "forcedVersion",
        "declaredParentRange",
        "rangeCompatibility",
        "securityAdvisory",
        "scope",
        "rationale",
        "validationCommands",
        "nextReview",
    ].sort();
    for (const entry of entries) {
        const key = `${entry.parentPackage || "(missing)"}>${entry.packageName || "(missing)"}`;
        assertCondition(!governedKeys.has(key), errors, `Dependency security override policy contains duplicate ${key}.`);
        governedKeys.add(key);
        const actualEntryFields = Object.keys(entry || {}).sort();
        assertCondition(
            actualEntryFields.length === expectedEntryFields.length
                && actualEntryFields.every((field, index) => field === expectedEntryFields[index]),
            errors,
            `${key} must use the exact governed override-policy fields.`
        );
        assertCondition(!!entry.parentPackage, errors, `${key} must declare parentPackage.`);
        assertCondition(!!entry.packageName, errors, `${key} must declare packageName.`);
        assertCondition(!!entry.forcedVersion, errors, `${key} must declare forcedVersion.`);
        assertCondition(!!entry.declaredParentRange, errors, `${key} must record the parent package's declared range.`);
        assertCondition(
            ["inside_declared_range", "outside_declared_range"].includes(entry.rangeCompatibility),
            errors,
            `${key} must classify rangeCompatibility.`
        );
        assertCondition(/^GHSA-[a-z0-9-]+$/u.test(entry.securityAdvisory || ""), errors, `${key} must bind a GHSA advisory.`);
        assertCondition(!!entry.scope, errors, `${key} must state its runtime scope.`);
        assertCondition(!!entry.rationale, errors, `${key} must state a review rationale.`);
        assertCondition(
            Array.isArray(entry.validationCommands) && entry.validationCommands.length >= 3,
            errors,
            `${key} must declare at least three validation commands.`
        );
        assertCondition(isCanonicalDate(entry.nextReview), errors, `${key} nextReview must be a real YYYY-MM-DD date.`);
        assertCondition(
            !entry.nextReview || entry.nextReview >= asOfDate,
            errors,
            `${key} security override review is overdue as of ${asOfDate}; nextReview=${entry.nextReview || "(missing)"}.`
        );

        const configured = packageJson.overrides?.[entry.parentPackage]?.[entry.packageName];
        assertCondition(
            configured === entry.forcedVersion,
            errors,
            `${key} policy expects ${entry.forcedVersion}, but package.json resolves ${configured || "(missing)"}.`
        );
        const locked = lock.packages?.[`node_modules/${entry.packageName}`]?.version;
        assertCondition(
            locked === entry.forcedVersion,
            errors,
            `${key} policy expects locked ${entry.packageName}@${entry.forcedVersion}, but package-lock.json has ${locked || "(missing)"}.`
        );
        const parentMetadata = lock.packages?.[`node_modules/${entry.parentPackage}`];
        assertCondition(!!parentMetadata, errors, `${key} parent package is missing from package-lock.json.`);
        const declaredRange = parentMetadata?.dependencies?.[entry.packageName]
            || parentMetadata?.optionalDependencies?.[entry.packageName];
        assertCondition(
            declaredRange === entry.declaredParentRange,
            errors,
            `${key} records parent range ${entry.declaredParentRange}, but package-lock.json declares ${declaredRange || "(missing)"}.`
        );
        if (entry.forcedVersion && entry.declaredParentRange) {
            try {
                const computedCompatibility = satisfiesReviewedSimpleRange(
                    entry.forcedVersion,
                    entry.declaredParentRange
                ) ? "inside_declared_range" : "outside_declared_range";
                assertCondition(
                    entry.rangeCompatibility === computedCompatibility,
                    errors,
                    `${key} rangeCompatibility is ${entry.rangeCompatibility}, but the reviewed semver comparison is ${computedCompatibility}.`
                );
            } catch (error) {
                errors.push(error.message);
            }
        }
        for (const command of Array.isArray(entry.validationCommands) ? entry.validationCommands : []) {
            const scriptName = /^npm test(?:\s|$)/u.test(command)
                ? "test"
                : /^npm run ([A-Za-z0-9:_-]+)(?:\s|$)/u.exec(command)?.[1];
            assertCondition(
                Boolean(scriptName && registeredScripts.has(scriptName)),
                errors,
                `${key} validation command is not a registered npm script: ${command}`
            );
        }
    }

    for (const [parentPackage, childOverrides] of Object.entries(packageJson.overrides || {})) {
        for (const packageName of Object.keys(childOverrides || {})) {
            const key = `${parentPackage}>${packageName}`;
            assertCondition(
                governedKeys.has(key),
                errors,
                `package.json override ${key} is not governed by templates/dependency_security_overrides.json.`
            );
        }
    }

    return {
        errors,
        summary: {
            checkedAt: policy?.checkedAt || null,
            entries,
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
        const expectedOccurrences = relativePath === ".github/workflows/release.yml"
            && permissionException === "contents: write"
            ? 2
            : 1;
        assertCondition(
            countOccurrences(text, permissionException) === expectedOccurrences,
            errors,
            `${relativePath} may request ${permissionException} exactly ${expectedOccurrences} time(s) for its reviewed security workflow jobs.`
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
            /^  release_verify:\s*\r?\n(?: {4}.*\r?\n)*? {4}permissions:\s*\r?\n {6}contents:\s+write/mu.test(text),
            errors,
            `${relativePath} must scope one contents: write grant to the release verification job so it can read the private draft release.`
        );
        assertCondition(
            /^\s{4}permissions:\s*\r?\n\s{6}contents:\s+write\r?\n\s{6}id-token:\s+write\r?\n\s{6}attestations:\s+write\r?\n\s{6}artifact-metadata:\s+write/mu.test(text),
            errors,
            `${relativePath} must scope contents, id-token, and attestation write permissions to the release bundle job.`
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
        releaseWorkflowText.includes("workflow_dispatch:")
            && releaseWorkflowText.includes('test "${GITHUB_REF_TYPE}" = "tag"')
            && releaseWorkflowText.includes("'v' + require('./package.json').version")
            && releaseWorkflowText.includes('test "$(git rev-parse HEAD)" = "${GITHUB_SHA}"'),
        errors,
        "release workflow must permit explicit tag-ref dispatch and fail closed on ref, package version, tag, and commit drift."
    );
    assertCondition(
        releaseWorkflowText.includes("gh release view")
            && releaseWorkflowText.includes("isDraft,isPrerelease")
            && releaseWorkflowText.includes("gh release download"),
        errors,
        "release workflow must require and download an existing draft prerelease before verification."
    );
    assertCondition(
        releaseWorkflowText.includes("find .release-bundle -type f ! -name 'release-artifacts.sha256' -print0"),
        errors,
        "release workflow must checksum only the explicitly staged release bundle files."
    );
    assertCondition(
        releaseWorkflowText.includes("sort -z"),
        errors,
        "release workflow must sort checksum inputs deterministically."
    );
    assertCondition(
        releaseWorkflowText.includes("xargs -0 sha256sum > .release-bundle/release-artifacts.sha256"),
        errors,
        "release workflow must emit release-artifacts.sha256 from null-delimited sha256sum input."
    );
    assertCondition(
        releaseWorkflowText.includes("Attest release bundle provenance") && releaseWorkflowText.includes("Attest release bundle SBOM"),
        errors,
        "release workflow must create provenance and SBOM attestations for tagged release artifacts."
    );
    assertCondition(
        releaseWorkflowText.includes("sbom-path: .release-bundle/sbom.cdx.json"),
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
    assertCondition(
        /name:\s*release-bundle-\$\{\{ github\.ref_name \}\}[\s\S]*?path:\s*\.release-bundle[\s\S]*?if-no-files-found:\s*error[\s\S]*?include-hidden-files:\s*true/u.test(releaseWorkflowText),
        errors,
        "release workflow must explicitly include the hidden .release-bundle directory in immutable Actions evidence."
    );
    assertCondition(
        releaseWorkflowText.includes("npm run product:release-qa:evidence")
            && releaseWorkflowText.includes("npm run product:release-qa:apkg-inspect")
            && releaseWorkflowText.includes("--artifact-dir=\"${RELEASE_INPUT_DIR}\"")
            && releaseWorkflowText.includes("--expected-tag=\"${GITHUB_REF_NAME}\""),
        errors,
        "release workflow must validate exact downloaded release assets, APKG structures, and tag binding before publication."
    );
    assertCondition(
        releaseWorkflowText.includes("gh release upload")
            && releaseWorkflowText.includes("gh release edit")
            && releaseWorkflowText.includes("--draft=false")
            && releaseWorkflowText.includes("--prerelease")
            && releaseWorkflowText.includes("--verify-tag"),
        errors,
        "release workflow must publish only the verified draft as a tagged GitHub prerelease."
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

function buildSupplyChainAuditReport({
    cwd = process.cwd(),
    asOfDate = new Date().toISOString().slice(0, 10),
} = {}) {
    const packageJson = readJson(cwd, "package.json");
    const lock = readJson(cwd, "package-lock.json");
    const packageAudit = auditPackageManifest({ packageJson, lock });
    const dependencyOverridePolicy = readJson(cwd, "templates/dependency_security_overrides.json");
    const dependencyOverrideAudit = auditDependencySecurityOverrides({
        packageJson,
        lock,
        policy: dependencyOverridePolicy,
        asOfDate,
    });
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
            ...dependencyOverrideAudit.errors,
            ...workflowAudits.flatMap((audit) => audit.errors),
            ...releaseBoundaryAudit.errors,
        ].length === 0,
        errors: [
            ...packageAudit.errors,
            ...dependencyOverrideAudit.errors,
            ...workflowAudits.flatMap((audit) => audit.errors),
            ...releaseBoundaryAudit.errors,
        ],
        warnings: [
            ...packageAudit.warnings,
            ...workflowAudits.flatMap((audit) => audit.warnings),
            ...releaseBoundaryAudit.warnings,
        ],
        package: packageAudit.summary,
        dependencySecurityOverrides: dependencyOverrideAudit.summary,
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

    lines.push("Dependency security overrides:");
    for (const entry of report.dependencySecurityOverrides.entries) {
        lines.push(
            `- ${entry.parentPackage} > ${entry.packageName}@${entry.forcedVersion}; ${entry.rangeCompatibility}; ${entry.securityAdvisory}; next review ${entry.nextReview}`
        );
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
    auditDependencySecurityOverrides,
    buildSupplyChainAuditReport,
    formatSupplyChainAuditReport,
    satisfiesReviewedSimpleRange,
};
