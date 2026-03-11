const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const {
    buildRemoteAssetUrl,
    createLocalDirectoryProvider,
    createRemoteHttpProvider,
    findAssetFromProviders,
} = require("../src/services/mediaProviders");
const { buildKanjiFileCandidates } = require("../src/services/strokeOrderService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "media-provider-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

async function withHttpServer(handler, callback) {
    const server = http.createServer(handler);

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        return await callback(`http://127.0.0.1:${address.port}/`);
    } finally {
        await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
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

test("buildRemoteAssetUrl resolves a filename against the base URL", () => {
    assert.equal(buildRemoteAssetUrl("https://example.com/media", "日.svg"), "https://example.com/media/%E6%97%A5.svg");
});

test("createRemoteHttpProvider downloads an asset from a remote base URL", async () => {
    await withHttpServer((req, res) => {
        if (req.url === "/%E6%97%A5.svg") {
            res.writeHead(200, { "content-type": "image/svg+xml" });
            res.end("<svg />");
            return;
        }

        res.writeHead(404);
        res.end("missing");
    }, async (baseUrl) => {
        const provider = createRemoteHttpProvider({
            name: "remote-stroke-order-image",
            baseUrl,
            extensionMap: new Map([[".svg", "image/svg+xml"]]),
            buildCandidates: (input) => buildKanjiFileCandidates(input),
            fetchTimeoutMs: 1000,
        });

        const asset = await provider.findAsset("日");

        assert.equal(asset.fileName, "日.svg");
        assert.equal(asset.source, "remote-stroke-order-image");
        assert.equal(asset.mimeType, "image/svg+xml");
        assert.equal(asset.url, `${baseUrl}%E6%97%A5.svg`);
    });
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
