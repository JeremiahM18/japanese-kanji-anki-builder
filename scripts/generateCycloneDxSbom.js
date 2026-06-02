#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CYCLONEDX_SPEC_VERSION = "1.6";

function readJson(cwd, relativePath) {
    return JSON.parse(fs.readFileSync(path.join(cwd, relativePath), "utf-8"));
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join("/");
}

function packageNameFromPath(packagePath) {
    const normalized = normalizePath(packagePath);
    const parts = normalized.split("/");
    const nodeModulesIndex = parts.lastIndexOf("node_modules");
    if (nodeModulesIndex === -1) {
        return normalized;
    }
    const firstNamePart = parts[nodeModulesIndex + 1];
    if (firstNamePart?.startsWith("@")) {
        return `${firstNamePart}/${parts[nodeModulesIndex + 2]}`;
    }
    return firstNamePart;
}

function encodePurlPart(value) {
    return encodeURIComponent(value).replace(/%2F/gu, "/");
}

function buildNpmPurl(name, version) {
    if (name.startsWith("@")) {
        const [scope, packageName] = name.split("/");
        return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}@${encodeURIComponent(version)}`;
    }
    return `pkg:npm/${encodePurlPart(name)}@${encodeURIComponent(version)}`;
}

function buildBomRef(name, version, packagePath = "") {
    const purl = buildNpmPurl(name, version);
    if (!packagePath) {
        return purl;
    }
    return `${purl}?lockfile_path=${encodeURIComponent(normalizePath(packagePath))}`;
}

function parseIntegrityHashes(integrity) {
    if (!integrity) {
        return [];
    }

    return String(integrity)
        .split(/\s+/u)
        .filter(Boolean)
        .map((entry) => {
            const [algorithm, digest] = entry.split("-");
            if (!algorithm || !digest) {
                return null;
            }
            return {
                alg: algorithm.toUpperCase().replace(/^SHA(\d+)$/u, "SHA-$1"),
                content: Buffer.from(digest, "base64").toString("hex"),
            };
        })
        .filter(Boolean);
}

function normalizeLicense(license) {
    if (!license || typeof license !== "string") {
        return [];
    }
    return [{ license: { name: license } }];
}

function collectDependencyNames(metadata, includeDev = false) {
    return [
        ...Object.keys(metadata.dependencies || {}),
        ...Object.keys(metadata.optionalDependencies || {}),
        ...(includeDev ? Object.keys(metadata.devDependencies || {}) : []),
    ].sort();
}

function packageEntries(lock) {
    return Object.entries(lock.packages || {})
        .filter(([packagePath]) => packagePath !== "")
        .sort(([left], [right]) => left.localeCompare(right, "en"));
}

function resolveDependencyPath({ packagePath, dependencyName, packages }) {
    if (packagePath === "") {
        const rootCandidate = `node_modules/${dependencyName}`;
        return packages[rootCandidate] ? rootCandidate : null;
    }

    let current = normalizePath(packagePath);
    while (current) {
        const nestedCandidate = `${current}/node_modules/${dependencyName}`;
        if (packages[nestedCandidate]) {
            return nestedCandidate;
        }

        const parentNodeModulesIndex = current.lastIndexOf("/node_modules/");
        if (parentNodeModulesIndex === -1) {
            break;
        }
        current = current.slice(0, parentNodeModulesIndex);
    }

    const hoistedCandidate = `node_modules/${dependencyName}`;
    return packages[hoistedCandidate] ? hoistedCandidate : null;
}

function buildComponent({ packagePath, metadata }) {
    const name = packageNameFromPath(packagePath);
    const version = metadata.version;
    const purl = buildNpmPurl(name, version);
    const component = {
        type: "library",
        "bom-ref": buildBomRef(name, version, packagePath),
        name,
        version,
        purl,
        scope: metadata.optional ? "optional" : "required",
    };

    const hashes = parseIntegrityHashes(metadata.integrity);
    if (hashes.length > 0) {
        component.hashes = hashes;
    }
    const licenses = normalizeLicense(metadata.license);
    if (licenses.length > 0) {
        component.licenses = licenses;
    }
    if (metadata.resolved) {
        component.externalReferences = [
            {
                type: "distribution",
                url: metadata.resolved,
            },
        ];
    }
    if (metadata.dev) {
        component.properties = [
            {
                name: "npm:dev",
                value: "true",
            },
        ];
    }

    return component;
}

function buildDependencyGraph({ lock, rootRef, packageRefByPath }) {
    const dependencies = [];
    const rootDependencies = collectDependencyNames(lock.packages[""] || {}, true)
        .map((dependencyName) => resolveDependencyPath({ packagePath: "", dependencyName, packages: lock.packages }))
        .filter(Boolean)
        .map((packagePath) => packageRefByPath.get(packagePath))
        .filter(Boolean)
        .sort();

    dependencies.push({
        ref: rootRef,
        dependsOn: rootDependencies,
    });

    for (const [packagePath, metadata] of packageEntries(lock)) {
        const componentRef = packageRefByPath.get(packagePath);
        const dependsOn = collectDependencyNames(metadata)
            .map((dependencyName) => resolveDependencyPath({ packagePath, dependencyName, packages: lock.packages }))
            .filter(Boolean)
            .map((resolvedPath) => packageRefByPath.get(resolvedPath))
            .filter(Boolean)
            .sort();

        dependencies.push({
            ref: componentRef,
            dependsOn,
        });
    }

    return dependencies;
}

function deterministicSerialNumber(packageJson, lock) {
    const digest = crypto
        .createHash("sha256")
        .update(JSON.stringify({
            name: packageJson.name,
            version: packageJson.version,
            lockfileVersion: lock.lockfileVersion,
            packages: Object.keys(lock.packages || {}).sort(),
        }))
        .digest("hex");
    return `urn:uuid:${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function buildCycloneDxSbom({ cwd = process.cwd() } = {}) {
    const packageJson = readJson(cwd, "package.json");
    const lock = readJson(cwd, "package-lock.json");
    const rootRef = buildBomRef(packageJson.name, packageJson.version);
    const components = packageEntries(lock).map(([packagePath, metadata]) => buildComponent({ packagePath, metadata }));
    const packageRefByPath = new Map(packageEntries(lock).map(([packagePath, metadata]) => {
        const name = packageNameFromPath(packagePath);
        return [packagePath, buildBomRef(name, metadata.version, packagePath)];
    }));

    return {
        bomFormat: "CycloneDX",
        specVersion: CYCLONEDX_SPEC_VERSION,
        serialNumber: deterministicSerialNumber(packageJson, lock),
        version: 1,
        metadata: {
            component: {
                type: "application",
                "bom-ref": rootRef,
                name: packageJson.name,
                version: packageJson.version,
                purl: buildNpmPurl(packageJson.name, packageJson.version),
            },
        },
        components,
        dependencies: buildDependencyGraph({ lock, rootRef, packageRefByPath }),
    };
}

function validateCycloneDxSbom({ bom, cwd = process.cwd() }) {
    const errors = [];
    const lock = readJson(cwd, "package-lock.json");
    const packageEntryCount = packageEntries(lock).length;
    const refs = new Set();

    if (bom.bomFormat !== "CycloneDX") {
        errors.push("SBOM must use CycloneDX bomFormat.");
    }
    if (bom.specVersion !== CYCLONEDX_SPEC_VERSION) {
        errors.push(`SBOM must use CycloneDX specVersion ${CYCLONEDX_SPEC_VERSION}.`);
    }
    if (!bom.metadata?.component?.["bom-ref"]) {
        errors.push("SBOM must include the root application component metadata.");
    }
    if (!Array.isArray(bom.components) || bom.components.length !== packageEntryCount) {
        errors.push(`SBOM component count must match package-lock dependency entries: expected ${packageEntryCount}, found ${bom.components?.length || 0}.`);
    }

    for (const component of bom.components || []) {
        if (!component["bom-ref"]) {
            errors.push(`Component ${component.name || "<unknown>"} is missing bom-ref.`);
            continue;
        }
        if (refs.has(component["bom-ref"])) {
            errors.push(`Duplicate component bom-ref: ${component["bom-ref"]}.`);
        }
        refs.add(component["bom-ref"]);
        if (!component.purl?.startsWith("pkg:npm/")) {
            errors.push(`Component ${component["bom-ref"]} is missing npm package URL.`);
        }
        if (!component.version) {
            errors.push(`Component ${component["bom-ref"]} is missing version.`);
        }
    }

    for (const [packagePath, metadata] of packageEntries(lock)) {
        if (!metadata.integrity) {
            continue;
        }
        const name = packageNameFromPath(packagePath);
        const ref = buildBomRef(name, metadata.version, packagePath);
        const component = bom.components.find((candidate) => candidate["bom-ref"] === ref);
        if (!component?.hashes?.length) {
            errors.push(`Component ${ref} must include a hash derived from package-lock integrity.`);
        }
    }

    const dependencyRefs = new Set([bom.metadata?.component?.["bom-ref"], ...refs].filter(Boolean));
    for (const dependency of bom.dependencies || []) {
        if (!dependencyRefs.has(dependency.ref)) {
            errors.push(`Dependency graph references unknown component: ${dependency.ref}.`);
        }
        for (const dependsOn of dependency.dependsOn || []) {
            if (!dependencyRefs.has(dependsOn)) {
                errors.push(`Dependency graph edge from ${dependency.ref} points to unknown component: ${dependsOn}.`);
            }
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        componentCount: bom.components?.length || 0,
        dependencyCount: bom.dependencies?.length || 0,
        hashedComponentCount: (bom.components || []).filter((component) => component.hashes?.length > 0).length,
    };
}

function formatSbomReport(report) {
    const lines = [
        "CycloneDX SBOM",
        `Status: ${report.ok ? "pass" : "fail"}`,
        `Components: ${report.componentCount}`,
        `Dependency graph nodes: ${report.dependencyCount}`,
        `Components with lockfile hashes: ${report.hashedComponentCount}`,
    ];

    if (report.errors.length > 0) {
        lines.push("Errors:");
        for (const error of report.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
    const options = { out: null };
    for (const arg of argv) {
        if (arg.startsWith("--out=")) {
            options.out = arg.slice("--out=".length);
        }
    }
    return options;
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    const bom = buildCycloneDxSbom();
    const report = validateCycloneDxSbom({ bom });

    if (report.ok && options.out) {
        const outPath = path.resolve(options.out);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, `${JSON.stringify(bom, null, 2)}\n`);
    }

    const text = formatSbomReport(report);
    if (report.ok) {
        process.stdout.write(text);
        if (options.out) {
            process.stdout.write(`Wrote: ${normalizePath(options.out)}\n`);
        }
    } else {
        process.stderr.write(text);
        process.exitCode = 1;
    }
}

module.exports = {
    buildCycloneDxSbom,
    formatSbomReport,
    validateCycloneDxSbom,
};
