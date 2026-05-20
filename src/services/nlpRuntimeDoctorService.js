const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");

function buildDefaultWorkspaceRoot() {
    return path.resolve(__dirname, "../..");
}

function buildDefaultPackageJsonPath(workspaceRoot = buildDefaultWorkspaceRoot()) {
    return path.join(workspaceRoot, "package.json");
}

function loadPackageJson(packageJsonPath = buildDefaultPackageJsonPath()) {
    return JSON.parse(fs.readFileSync(path.resolve(packageJsonPath), "utf8"));
}

function resolveDependencySection(packageJson = {}, packageName) {
    if (packageJson.dependencies && Object.prototype.hasOwnProperty.call(packageJson.dependencies, packageName)) {
        return "dependencies";
    }
    if (packageJson.devDependencies && Object.prototype.hasOwnProperty.call(packageJson.devDependencies, packageName)) {
        return "devDependencies";
    }
    return null;
}

function resolvePackageAvailability({
    packageName,
    packageJson,
    workspaceRoot = buildDefaultWorkspaceRoot(),
    requireResolveFn = require.resolve,
}) {
    if (!packageName) {
        return {
            packageName: null,
            declared: false,
            declaredIn: null,
            installed: false,
            resolvedPath: null,
            error: "No packageName declared.",
        };
    }

    const declaredIn = resolveDependencySection(packageJson, packageName);
    let resolvedPath = null;
    let error = null;
    try {
        resolvedPath = requireResolveFn(packageName, { paths: [workspaceRoot] });
    } catch (caught) {
        error = caught.message;
    }

    return {
        packageName,
        declared: Boolean(declaredIn),
        declaredIn,
        installed: Boolean(resolvedPath),
        resolvedPath,
        error,
    };
}

function sha256File(filePath) {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
}

function describeModelArtifact(model, workspaceRoot = buildDefaultWorkspaceRoot()) {
    const localArtifact = model.localArtifact || null;
    if (!localArtifact) {
        return {
            path: null,
            resolvedPath: null,
            exists: false,
            byteSizeExpected: null,
            byteSizeActual: null,
            sha256Expected: null,
            sha256Actual: null,
            byteSizeMatches: false,
            sha256Matches: false,
        };
    }

    const resolvedPath = path.resolve(workspaceRoot, localArtifact.path);
    const exists = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
    const byteSizeActual = exists ? fs.statSync(resolvedPath).size : null;
    const sha256Actual = exists ? sha256File(resolvedPath) : null;

    return {
        path: localArtifact.path,
        resolvedPath,
        exists,
        byteSizeExpected: localArtifact.byteSize,
        byteSizeActual,
        sha256Expected: localArtifact.sha256,
        sha256Actual,
        byteSizeMatches: exists && byteSizeActual === localArtifact.byteSize,
        sha256Matches: exists && sha256Actual === localArtifact.sha256,
    };
}

function describeRuntimeReadiness({ runtimeId, runtime, packageJson, workspaceRoot, requireResolveFn }) {
    const packageStatus = runtime.runtimeType === "javascript"
        ? resolvePackageAvailability({
            packageName: runtime.packageName,
            packageJson,
            workspaceRoot,
            requireResolveFn,
        })
        : null;
    const workerPath = runtime.runtimeType === "external-worker" && runtime.origin?.localPath
        ? path.resolve(workspaceRoot, runtime.origin.localPath)
        : null;
    const workerPathExists = workerPath ? fs.existsSync(workerPath) : false;
    const errors = [];

    if (runtime.status === "active" && runtime.runtimeType === "javascript") {
        if (!runtime.packageName) {
            errors.push(`Active JavaScript NLP runtime ${runtimeId} must declare packageName.`);
        } else {
            if (!packageStatus.declared) {
                errors.push(`Active NLP runtime ${runtimeId} package ${runtime.packageName} is not declared in package.json.`);
            }
            if (!packageStatus.installed) {
                errors.push(`Active NLP runtime ${runtimeId} package ${runtime.packageName} is not resolvable from the workspace.`);
            }
        }
    }

    if (runtime.status === "active" && runtime.runtimeType === "external-worker") {
        if (!workerPath) {
            errors.push(`Active external NLP runtime ${runtimeId} must declare origin.localPath.`);
        } else if (!workerPathExists) {
            errors.push(`Active external NLP runtime ${runtimeId} worker path is missing: ${workerPath}`);
        }
    }

    return {
        id: runtimeId,
        status: runtime.status,
        runtimeType: runtime.runtimeType,
        packageStatus,
        workerPath,
        workerPathExists,
        allowedTasks: runtime.allowedTasks || [],
        errors,
    };
}

function describeModelReadiness({ modelId, model, manifest, workspaceRoot }) {
    const runtime = manifest.runtimes?.[model.runtimeId] || null;
    const artifact = describeModelArtifact(model, workspaceRoot);
    const errors = [];

    if (model.status === "active") {
        if (!runtime) {
            errors.push(`Active NLP model ${modelId} references missing runtime ${model.runtimeId}.`);
        } else if (runtime.status !== "active") {
            errors.push(`Active NLP model ${modelId} requires active runtime ${model.runtimeId}.`);
        }
        if (!model.localArtifact) {
            errors.push(`Active NLP model ${modelId} must pin localArtifact.`);
        } else {
            if (!artifact.exists) {
                errors.push(`Active NLP model ${modelId} artifact is missing: ${artifact.resolvedPath}`);
            }
            if (artifact.exists && !artifact.byteSizeMatches) {
                errors.push(`Active NLP model ${modelId} artifact byteSize mismatch: expected ${artifact.byteSizeExpected}, got ${artifact.byteSizeActual}.`);
            }
            if (artifact.exists && !artifact.sha256Matches) {
                errors.push(`Active NLP model ${modelId} artifact sha256 mismatch: expected ${artifact.sha256Expected}, got ${artifact.sha256Actual}.`);
            }
        }
    }

    return {
        id: modelId,
        status: model.status,
        runtimeId: model.runtimeId,
        task: model.task,
        allowedUses: model.allowedUses || [],
        artifact,
        errors,
    };
}

function buildNlpRuntimeDoctorReport({
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = buildDefaultWorkspaceRoot(),
    packageJsonPath = buildDefaultPackageJsonPath(workspaceRoot),
    loadManifestFn = loadNlpModelManifest,
    loadPackageJsonFn = loadPackageJson,
    requireResolveFn = require.resolve,
} = {}) {
    let manifest;
    let packageJson;
    const errors = [];

    try {
        manifest = loadManifestFn(manifestPath);
    } catch (error) {
        errors.push(`NLP model manifest failed validation: ${error.message}`);
    }

    try {
        packageJson = loadPackageJsonFn(packageJsonPath);
    } catch (error) {
        errors.push(`package.json failed loading: ${error.message}`);
    }

    const runtimeChecks = manifest && packageJson
        ? Object.entries(manifest.runtimes || {}).map(([runtimeId, runtime]) => describeRuntimeReadiness({
            runtimeId,
            runtime,
            packageJson,
            workspaceRoot,
            requireResolveFn,
        }))
        : [];
    const modelChecks = manifest
        ? Object.entries(manifest.models || {}).map(([modelId, model]) => describeModelReadiness({
            modelId,
            model,
            manifest,
            workspaceRoot,
        }))
        : [];

    for (const check of runtimeChecks) {
        errors.push(...check.errors);
    }
    for (const check of modelChecks) {
        errors.push(...check.errors);
    }

    const activeModels = modelChecks.filter((model) => model.status === "active");

    return {
        generatedAt: new Date().toISOString(),
        passed: errors.length === 0,
        readyForModelBackedSuggestions: errors.length === 0 && activeModels.length > 0,
        manifestPath: manifest?.manifestPath || path.resolve(manifestPath),
        workspaceRoot: path.resolve(workspaceRoot),
        packageJsonPath: path.resolve(packageJsonPath),
        counts: {
            runtimes: runtimeChecks.length,
            activeRuntimes: runtimeChecks.filter((runtime) => runtime.status === "active").length,
            models: modelChecks.length,
            activeModels: activeModels.length,
        },
        runtimeChecks,
        modelChecks,
        errors,
        releaseBoundary: {
            runtimeReadinessActivatesModelOutputAuthority: false,
            modelOutputsAreCertificationEvidence: false,
            modelOutputsMayWriteTrackedTemplatesDirectly: false,
            promotionRequiresHumanReview: true,
        },
    };
}

function formatNlpRuntimeDoctorReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Runtime Doctor",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Model-backed suggestions ready: ${report.readyForModelBackedSuggestions ? "yes" : "no"}`,
        `Manifest: ${report.manifestPath || "unknown"}`,
        `Workspace: ${report.workspaceRoot || "unknown"}`,
        `package.json: ${report.packageJsonPath || "unknown"}`,
        "",
        "Counts:",
        `- runtimes: ${report.counts?.runtimes || 0}`,
        `- active runtimes: ${report.counts?.activeRuntimes || 0}`,
        `- models: ${report.counts?.models || 0}`,
        `- active models: ${report.counts?.activeModels || 0}`,
        "",
        "Release boundary:",
        `- runtime readiness activates model output authority: ${report.releaseBoundary?.runtimeReadinessActivatesModelOutputAuthority ? "yes" : "no"}`,
        `- model outputs certify cards: ${report.releaseBoundary?.modelOutputsAreCertificationEvidence ? "yes" : "no"}`,
        `- model outputs may write tracked templates directly: ${report.releaseBoundary?.modelOutputsMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`,
    ];

    if ((report.runtimeChecks || []).length > 0) {
        lines.push("", "Runtimes:");
        for (const runtime of report.runtimeChecks) {
            const packageText = runtime.packageStatus
                ? `; package ${runtime.packageStatus.packageName || "none"} declared=${runtime.packageStatus.declared ? "yes" : "no"} installed=${runtime.packageStatus.installed ? "yes" : "no"}`
                : "";
            const workerText = runtime.runtimeType === "external-worker"
                ? `; worker path ${runtime.workerPath || "none"} exists=${runtime.workerPathExists ? "yes" : "no"}`
                : "";
            lines.push(`- ${runtime.id}: ${runtime.status}; ${runtime.runtimeType}${packageText}${workerText}`);
            for (const error of runtime.errors || []) {
                lines.push(`  - ${error}`);
            }
        }
    }

    if ((report.modelChecks || []).length > 0) {
        lines.push("", "Models:");
        for (const model of report.modelChecks) {
            lines.push(`- ${model.id}: ${model.status}; runtime ${model.runtimeId}; artifact ${model.artifact.path || "none"}; exists=${model.artifact.exists ? "yes" : "no"}`);
            for (const error of model.errors || []) {
                lines.push(`  - ${error}`);
            }
        }
    } else {
        lines.push("", "Models: none active or registered yet");
    }

    if ((report.errors || []).length > 0) {
        lines.push("", "Errors:");
        for (const error of report.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildDefaultPackageJsonPath,
    buildDefaultWorkspaceRoot,
    buildNlpRuntimeDoctorReport,
    describeModelArtifact,
    describeModelReadiness,
    describeRuntimeReadiness,
    formatNlpRuntimeDoctorReport,
    loadPackageJson,
    resolvePackageAvailability,
};
