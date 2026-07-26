const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    buildWorkspaceSideEffectSnapshot,
    compareWorkspaceSideEffectSnapshots,
} = require("../src/services/workspaceSideEffectAuditService");
const {
    parseArgs,
    resolveSnapshotPath,
    writeSnapshot,
} = require("../scripts/auditWorkspaceSideEffects");

function buildWorkspace() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-side-effects-"));
    fs.mkdirSync(path.join(root, "templates"), { recursive: true });
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.mkdirSync(path.join(root, "out", "workspace-side-effects"), { recursive: true });
    fs.writeFileSync(path.join(root, "templates", "workspace_side_effect_policy.json"), JSON.stringify({
        version: 1,
        roots: ["data", "out"],
        excludedPrefixes: ["out/workspace-side-effects"],
        contentHashPrefixes: ["data"],
        hashMaxBytes: 1024,
        authority: "test boundary",
    }));
    fs.writeFileSync(path.join(root, "data", "input.json"), "{\"value\":1}\n");
    return root;
}

test("workspace side-effect audit detects added, removed, changed, and explicitly allowed paths", () => {
    const root = buildWorkspace();
    const before = buildWorkspaceSideEffectSnapshot({ rootDir: root });
    fs.writeFileSync(path.join(root, "data", "input.json"), "{\"value\":2}\n");
    fs.writeFileSync(path.join(root, "data", "added.json"), "{}\n");
    const after = buildWorkspaceSideEffectSnapshot({ rootDir: root });

    const failing = compareWorkspaceSideEffectSnapshots(before, after);
    assert.equal(failing.passed, false);
    assert.deepEqual(failing.changes.map((entry) => [entry.kind, entry.path]), [
        ["added", "data/added.json"],
        ["changed", "data/input.json"],
    ]);

    const allowed = compareWorkspaceSideEffectSnapshots(before, after, {
        allowedPrefixes: ["data"],
    });
    assert.equal(allowed.passed, true);
    assert.equal(allowed.changeCount, 2);
});

test("workspace side-effect audit excludes its own baseline output and fails on policy drift", () => {
    const root = buildWorkspace();
    const before = buildWorkspaceSideEffectSnapshot({ rootDir: root });
    fs.writeFileSync(path.join(root, "out", "workspace-side-effects", "baseline.json"), "{}\n");
    const after = buildWorkspaceSideEffectSnapshot({ rootDir: root });
    assert.equal(compareWorkspaceSideEffectSnapshots(before, after).changeCount, 0);

    after.policySha256 = "0".repeat(64);
    assert.throws(
        () => compareWorkspaceSideEffectSnapshots(before, after),
        /policy changed/
    );
});

test("workspace side-effect audit records stable unreadable files and detects posture changes", () => {
    const base = {
        schemaVersion: 1,
        policySha256: "a".repeat(64),
        roots: ["data"],
        files: [{
            path: "data/locked.bin",
            size: 10,
            mtimeMs: 1,
            hashMode: "metadata-read-error",
            readError: "EPERM",
        }],
        skippedSymlinks: [],
        missingRoots: [],
        unreadableDirectories: [],
    };
    const unchanged = compareWorkspaceSideEffectSnapshots(base, structuredClone(base));
    assert.equal(unchanged.passed, true);
    assert.equal(unchanged.coverageComplete, false);
    assert.deepEqual(unchanged.unreadableFiles, [{
        path: "data/locked.bin",
        error: "EPERM",
    }]);

    const readable = structuredClone(base);
    delete readable.files[0].readError;
    readable.files[0].hashMode = "sha256";
    readable.files[0].sha256 = "b".repeat(64);
    const changed = compareWorkspaceSideEffectSnapshots(base, readable);
    assert.equal(changed.passed, false);
    assert.equal(changed.changes[0].kind, "changed");
});

test("workspace side-effect audit detects governed-root and symlink posture changes", (t) => {
    const root = buildWorkspace();
    const before = buildWorkspaceSideEffectSnapshot({ rootDir: root });
    fs.rmSync(path.join(root, "data"), { recursive: true });
    const linkPath = path.join(root, "out", "linked");
    try {
        fs.symlinkSync(path.join(root, "templates"), linkPath, "junction");
    } catch (error) {
        if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) {
            t.skip(`Symlink creation is unavailable: ${error.code}`);
            return;
        }
        throw error;
    }
    const after = buildWorkspaceSideEffectSnapshot({ rootDir: root });
    const report = compareWorkspaceSideEffectSnapshots(before, after);

    assert.equal(report.passed, false);
    assert.equal(report.changes.some((entry) => entry.kind === "root-became-missing"), true);
    assert.equal(report.changes.some((entry) => entry.kind === "symlink-added"), true);
});

test("workspace side-effect CLI requires confined baseline paths and records unknown arguments", () => {
    const root = buildWorkspace();
    assert.equal(
        resolveSnapshotPath("out/workspace-side-effects/run.json", root),
        path.join(root, "out", "workspace-side-effects", "run.json")
    );
    assert.throws(() => resolveSnapshotPath("../escape.json", root), /must stay under/);
    assert.deepEqual(parseArgs([
        "--write-baseline=out/workspace-side-effects/run.json",
        "--allow=data,out/build",
        "--unexpected",
    ]), {
        allowedPrefixes: ["data", "out/build"],
        baselinePath: "",
        json: false,
        unknownArgs: ["--unexpected"],
        writeBaselinePath: "out/workspace-side-effects/run.json",
    });
});

test("workspace side-effect baseline writer is immutable", () => {
    const root = buildWorkspace();
    const snapshotPath = path.join(root, "out", "workspace-side-effects", "run.json");
    const snapshot = buildWorkspaceSideEffectSnapshot({ rootDir: root });

    writeSnapshot(snapshotPath, snapshot);
    assert.throws(() => writeSnapshot(snapshotPath, snapshot), /Refusing to overwrite/);
});
