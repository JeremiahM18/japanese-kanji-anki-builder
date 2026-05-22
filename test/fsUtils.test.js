const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    assertSafeGeneratedPath,
    getDefaultGeneratedPathRoots,
    isPathInside,
    removeGeneratedPathSync,
} = require("../src/utils/fs");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "fs-utils-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("isPathInside requires a strict child path", () => {
    const root = path.resolve("out");

    assert.equal(isPathInside(path.join(root, "build"), root), true);
    assert.equal(isPathInside(root, root), false);
    assert.equal(isPathInside(path.resolve("README.md"), root), false);
});

test("assertSafeGeneratedPath accepts only governed generated-output roots", () => {
    const roots = getDefaultGeneratedPathRoots();
    const outChild = path.join(process.cwd(), "out", "build");
    const tempChild = path.join(os.tmpdir(), "jkb-generated-output");

    assert.equal(assertSafeGeneratedPath(outChild), path.resolve(outChild));
    assert.equal(assertSafeGeneratedPath(tempChild), path.resolve(tempChild));
    assert.throws(() => assertSafeGeneratedPath(process.cwd()), /outside governed generated-output roots/);
    assert.throws(() => assertSafeGeneratedPath(path.join(process.cwd(), "out")), /outside governed generated-output roots/);
    assert.throws(() => assertSafeGeneratedPath(path.parse(process.cwd()).root), /filesystem root/);
    assert.deepEqual(roots.map((entry) => path.isAbsolute(entry)), roots.map(() => true));
});

test("removeGeneratedPathSync removes generated paths and rejects workspace files", () => {
    const rootDir = makeTempDir();

    try {
        const generatedDir = path.join(rootDir, "generated");
        const generatedFile = path.join(generatedDir, "artifact.txt");
        fs.mkdirSync(generatedDir, { recursive: true });
        fs.writeFileSync(generatedFile, "artifact", "utf-8");

        removeGeneratedPathSync(generatedDir, {
            recursive: true,
            force: true,
            label: "test generated directory",
        });

        assert.equal(fs.existsSync(generatedDir), false);
        assert.throws(
            () => removeGeneratedPathSync(path.join(process.cwd(), "README.md"), { force: true }),
            /outside governed generated-output roots/
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});
