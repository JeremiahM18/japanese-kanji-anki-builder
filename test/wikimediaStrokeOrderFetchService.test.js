const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildFetchTargets,
    fetchWikimediaStrokeOrderBatch,
    formatWikimediaStrokeOrderFetchSummary,
} = require("../src/services/wikimediaStrokeOrderFetchService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "wikimedia-stroke-fetch-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildFetchTargets keeps only confirmed Commons assets", () => {
    const targets = buildFetchTargets({
        rows: [
            {
                kanji: "日",
                level: 5,
                image: { fileName: "日-bw.png", downloadUrl: "https://example.com/day.png", filePageUrl: "https://example.com/day", status: "confirmed_on_commons" },
                animation: { fileName: "日-order.gif", downloadUrl: "https://example.com/day.gif", filePageUrl: "https://example.com/day-gif", status: "not_found_on_commons" },
            },
            {
                kanji: "月",
                level: 5,
                image: null,
                animation: { fileName: "月-order.gif", downloadUrl: "https://example.com/moon.gif", filePageUrl: "https://example.com/moon-gif", status: "confirmed_on_commons" },
            },
        ],
    });

    assert.deepEqual(targets.map((entry) => `${entry.kanji}:${entry.kind}:${entry.fileName}`), [
        "日:image:日-bw.png",
        "月:animation:月-order.gif",
    ]);
});

test("fetchWikimediaStrokeOrderBatch downloads confirmed files and skips existing ones", async () => {
    const rootDir = makeTempDir();

    try {
        const imageDir = path.join(rootDir, "images");
        const animationDir = path.join(rootDir, "animations");
        fs.mkdirSync(imageDir, { recursive: true });
        fs.mkdirSync(animationDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, "日-bw.png"), "existing");

        const writes = [];
        const summary = await fetchWikimediaStrokeOrderBatch({
            plan: {
                rows: [{
                    kanji: "日",
                    level: 5,
                    image: { fileName: "日-bw.png", downloadUrl: "https://example.com/day.png", filePageUrl: "https://example.com/day", status: "confirmed_on_commons" },
                    animation: { fileName: "日-order.gif", downloadUrl: "https://example.com/day.gif", filePageUrl: "https://example.com/day-gif", status: "confirmed_on_commons" },
                }],
            },
            imageSourceDir: imageDir,
            animationSourceDir: animationDir,
            fileLimit: 4,
            delayMs: 0,
            downloadFile: async (url, destinationPath) => {
                writes.push({ url, destinationPath });
                await fs.promises.writeFile(destinationPath, "downloaded");
            },
        });

        assert.equal(summary.skippedExisting, 1);
        assert.equal(summary.downloaded, 1);
        assert.equal(summary.files[0].fileName, "日-order.gif");
        assert.equal(writes.length, 1);
        assert.equal(fs.existsSync(path.join(animationDir, "日-order.gif")), true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("fetchWikimediaStrokeOrderBatch stops after repeated rate limits", async () => {
    const rootDir = makeTempDir();

    try {
        const imageDir = path.join(rootDir, "images");
        const animationDir = path.join(rootDir, "animations");

        const summary = await fetchWikimediaStrokeOrderBatch({
            plan: {
                rows: [{
                    kanji: "日",
                    level: 5,
                    image: { fileName: "日-bw.png", downloadUrl: "https://example.com/day.png", filePageUrl: "https://example.com/day", status: "confirmed_on_commons" },
                    animation: { fileName: "日-order.gif", downloadUrl: "https://example.com/day.gif", filePageUrl: "https://example.com/day-gif", status: "confirmed_on_commons" },
                }],
            },
            imageSourceDir: imageDir,
            animationSourceDir: animationDir,
            fileLimit: 4,
            delayMs: 0,
            maxConsecutiveRateLimits: 1,
            downloadFile: async () => {
                const error = new Error("Download failed with 429");
                error.status = 429;
                throw error;
            },
        });

        assert.equal(summary.downloaded, 0);
        assert.equal(summary.rateLimited, 1);
        assert.equal(summary.stoppedForRateLimit, true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatWikimediaStrokeOrderFetchSummary renders a readable fetch report", () => {
    const text = formatWikimediaStrokeOrderFetchSummary({
        totalCandidates: 6,
        attempted: 3,
        downloaded: 2,
        skippedExisting: 1,
        rateLimited: 1,
        stoppedForRateLimit: true,
        files: [
            { kanji: "日", kind: "image", fileName: "日-bw.png", filePageUrl: "https://example.com/day" },
        ],
        failures: [
            { kanji: "月", kind: "animation", fileName: "月-order.gif", status: "rate_limited" },
        ],
    });

    assert.match(text, /Wikimedia Stroke-Order Fetch/);
    assert.match(text, /Downloaded files: 2/);
    assert.match(text, /Stopped early: yes/);
    assert.match(text, /日 \(image\): 日-bw\.png/);
    assert.match(text, /月 \(animation\): 月-order\.gif \[rate_limited\]/);
});
