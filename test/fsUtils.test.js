const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    assertSafeGeneratedPath,
    getDefaultGeneratedPathRoots,
    isPathInside,
    openVerifiedRegularFileSync,
    readFileIfExistsSync,
    removeGeneratedPathSync,
    writeFileAtomicSync,
    writeFileIfMissingSync,
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

test("writeFileAtomicSync writes through a sibling temp file", () => {
    const rootDir = makeTempDir();

    try {
        const nestedFile = path.join(rootDir, "nested", "artifact.json");

        writeFileAtomicSync(nestedFile, "{\"ok\":true}\n", "utf-8");

        assert.equal(fs.readFileSync(nestedFile, "utf-8"), "{\"ok\":true}\n");
        assert.deepEqual(
            fs.readdirSync(path.dirname(nestedFile)).filter((entry) => entry.includes(".tmp")),
            []
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("writeFileIfMissingSync creates once without overwriting existing files", () => {
    const rootDir = makeTempDir();

    try {
        const nestedFile = path.join(rootDir, "nested", "artifact.json");

        assert.equal(writeFileIfMissingSync(nestedFile, "{\"created\":true}\n", "utf-8"), true);
        assert.equal(writeFileIfMissingSync(nestedFile, "{\"created\":false}\n", "utf-8"), false);
        assert.equal(fs.readFileSync(nestedFile, "utf-8"), "{\"created\":true}\n");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("readFileIfExistsSync returns null only for missing files", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "present.txt");
        fs.writeFileSync(filePath, "present", "utf-8");

        assert.equal(readFileIfExistsSync(filePath, "utf-8"), "present");
        assert.equal(readFileIfExistsSync(path.join(rootDir, "missing.txt"), "utf-8"), null);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("openVerifiedRegularFileSync returns one verified descriptor and rejects directories", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "artifact.txt");
        fs.writeFileSync(filePath, "verified", "utf-8");

        const fileHandle = openVerifiedRegularFileSync(filePath, { label: "Test artifact" });
        try {
            assert.equal(fs.readFileSync(fileHandle, "utf-8"), "verified");
        } finally {
            fs.closeSync(fileHandle);
        }
        assert.throws(
            () => openVerifiedRegularFileSync(rootDir, { label: "Test artifact" }),
            /regular non-symbolic-link file/
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});
