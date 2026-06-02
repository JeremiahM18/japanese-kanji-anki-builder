const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    buildCycloneDxSbom,
    formatSbomReport,
    validateCycloneDxSbom,
} = require("../scripts/generateCycloneDxSbom");

const repoRoot = path.resolve(__dirname, "..");
const lock = require("../package-lock.json");
const packageJson = require("../package.json");

test("CycloneDX SBOM validates against the tracked package lock", () => {
    const bom = buildCycloneDxSbom({ cwd: repoRoot });
    const report = validateCycloneDxSbom({ bom, cwd: repoRoot });
    const lockPackageCount = Object.keys(lock.packages).filter((packagePath) => packagePath !== "").length;

    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
    assert.equal(report.componentCount, lockPackageCount);
    assert.equal(report.hashedComponentCount, lockPackageCount);
});

test("CycloneDX SBOM generation is deterministic", () => {
    assert.deepEqual(
        buildCycloneDxSbom({ cwd: repoRoot }),
        buildCycloneDxSbom({ cwd: repoRoot })
    );
});

test("CycloneDX SBOM includes root direct dependency graph edges", () => {
    const bom = buildCycloneDxSbom({ cwd: repoRoot });
    const rootRef = bom.metadata.component["bom-ref"];
    const rootDependency = bom.dependencies.find((dependency) => dependency.ref === rootRef);
    const componentNameByRef = new Map(bom.components.map((component) => [component["bom-ref"], component.name]));
    const directNames = Object.keys({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
    });

    assert.ok(rootDependency);
    for (const directName of directNames) {
        assert.equal(
            rootDependency.dependsOn.some((dependencyRef) => componentNameByRef.get(dependencyRef) === directName),
            true,
            `Missing root dependency edge for ${directName}`
        );
    }
});

test("CycloneDX SBOM report is readable for local verification", () => {
    const bom = buildCycloneDxSbom({ cwd: repoRoot });
    const report = validateCycloneDxSbom({ bom, cwd: repoRoot });
    const text = formatSbomReport(report);

    assert.match(text, /CycloneDX SBOM/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Components:/);
    assert.match(text, /Components with lockfile hashes:/);
});
