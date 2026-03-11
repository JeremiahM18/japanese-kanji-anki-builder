const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createLocalDirectoryProvider, findAssetFromProviders } = require("../src/services/mediaProviders");
const { buildKanjiFileCandidates } = require("../src/services/strokeOrderService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "media-provider-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("createLocalDirectoryProvider finds a matching asset from candidate names", async () => {
    const rootDir = makeTempDir();

    try {
        fs.writeFileSync(path.join(rootDir, "日.svg"), "<svg />", "utf-8");

        const provider = createLocalDirectoryProvider({
            sourceDir: rootDir,
            extensionMap: new Map([[".svg", "image/svg+xml"]]),
            buildCandidates: (input) => buildKanjiFileCandidates(input),
        });

        const asset = await provider.findAsset("日");

        assert.equal(asset.fileName, "日.svg");
        assert.equal(asset.source, "local-filesystem");
        assert.equal(asset.mimeType, "image/svg+xml");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("findAssetFromProviders falls through until a provider returns an asset", async () => {
    const asset = await findAssetFromProviders([
        {
            name: "first",
            async findAsset() {
                return null;
            },
        },
        {
            name: "second",
            async findAsset() {
                return {
                    fileName: "fallback.gif",
                    extension: ".gif",
                    source: "second",
                    mimeType: "image/gif",
                    checksum: "abc",
                    content: Buffer.from("gif"),
                };
            },
        },
    ], "日");

    assert.equal(asset.fileName, "fallback.gif");
    assert.equal(asset.source, "second");
});
