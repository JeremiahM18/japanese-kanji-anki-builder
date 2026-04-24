const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadStrokeOrderSourcePolicy } = require("../src/datasets/strokeOrderSourcePolicy");
const { buildStrokeOrderPolicyAuditReport } = require("../src/services/strokeOrderPolicyAuditService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "stroke-order-policy-audit-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeManifest(rootDir, kanji, { image = null, animation = null }) {
    const code = kanji.codePointAt(0).toString(16).toUpperCase();
    const mediaId = `${code}_${kanji}`;
    const manifestPath = path.join(rootDir, "kanji", code.slice(0, 2), mediaId, "manifest.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({
        kanji,
        version: 1,
        updatedAt: "2026-04-24T00:00:00.000Z",
        assets: {
            strokeOrderImage: image,
            strokeOrderAnimation: animation,
            audio: [],
        },
    }, null, 2), "utf-8");
}

test("buildStrokeOrderPolicyAuditReport accepts approved image and animation sources", () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "日", {
            image: {
                kind: "image",
                path: "images/65E5_日-stroke-order.svg",
                mimeType: "image/svg+xml",
                source: "kanjivg",
            },
            animation: {
                kind: "animation",
                path: "animations/65E5_日-stroke-order.gif",
                mimeType: "image/gif",
                source: "remote-stroke-order-animation",
            },
        });

        const report = buildStrokeOrderPolicyAuditReport({
            mediaRootDir: rootDir,
            strokeOrderSourcePolicy: loadStrokeOrderSourcePolicy(),
            remoteStrokeOrderImageBaseUrl: null,
            remoteStrokeOrderAnimationBaseUrl: "https://raw.githubusercontent.com/example/animations/",
        });

        assert.equal(report.valid, true);
        assert.equal(report.imageAssetCount, 1);
        assert.equal(report.animationAssetCount, 1);
        assert.deepEqual(report.sourceCounts.image, { kanjivg: 1 });
        assert.deepEqual(report.sourceCounts.animation, { "remote-stroke-order-animation": 1 });
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildStrokeOrderPolicyAuditReport flags disallowed sources and remote static image config", () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "日", {
            image: {
                kind: "image",
                path: "images/65E5_日-stroke-order.png",
                mimeType: "image/png",
                source: "unknown-image-source",
            },
            animation: {
                kind: "animation",
                path: "animations/65E5_日-stroke-order.gif",
                mimeType: "image/gif",
                source: "unknown-animation-source",
            },
        });

        const report = buildStrokeOrderPolicyAuditReport({
            mediaRootDir: rootDir,
            strokeOrderSourcePolicy: loadStrokeOrderSourcePolicy(),
            remoteStrokeOrderImageBaseUrl: "https://example.test/images/",
        });

        assert.equal(report.valid, false);
        assert.equal(report.remoteImageViolation, true);
        assert.equal(report.violatingAssets.length, 2);
        assert.deepEqual(report.violatingAssets.map((row) => row.violations), [
            ["disallowed-source"],
            ["disallowed-source"],
        ]);
    } finally {
        cleanupTempDir(rootDir);
    }
});
