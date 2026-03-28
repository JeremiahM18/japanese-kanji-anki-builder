const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildOutputFileName,
    encodeAnimatedGif,
    formatStrokeOrderGifGenerationSummary,
    generateStrokeOrderGifs,
    parseKanjiVgSvg,
    parseStrokePath,
} = require("../src/services/strokeOrderGifGenerationService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "stroke-order-gif-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("parseStrokePath supports KanjiVG cubic path commands", () => {
    const points = parseStrokePath("M49.42,14.25c0.1,1.11-0.11,2.93-0.71,4.47C44.5,29.5,32,47.25,11.5,61.75");
    assert.ok(points.length > 10);
    assert.equal(Math.round(points[0].x), 49);
    assert.equal(Math.round(points.at(-1).x), 12);
});

test("parseKanjiVgSvg extracts ordered stroke paths", () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109"><path d="M10 10C20 20,30 30,40 40"/><path d="M40 40S60 60,70 70"/></svg>`;
    const parsed = parseKanjiVgSvg(svg);
    assert.equal(parsed.width, 109);
    assert.equal(parsed.height, 109);
    assert.equal(parsed.strokes.length, 2);
});

test("encodeAnimatedGif emits a GIF89a buffer", () => {
    const buffer = encodeAnimatedGif({
        width: 2,
        height: 2,
        frames: [
            { pixels: Uint8Array.from([0, 1, 1, 0]), delay: 5 },
            { pixels: Uint8Array.from([0, 2, 2, 0]), delay: 5 },
        ],
    });

    assert.equal(buffer.subarray(0, 6).toString("ascii"), "GIF89a");
    assert.ok(buffer.length > 30);
});

test("generateStrokeOrderGifs creates true animated GIFs from SVG sources", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });
        fs.writeFileSync(
            path.join(imageSourceDir, "今 - U+04ECA- KanjiVG stroke order.svg"),
            `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109"><path d="M10 10C20 20,30 30,40 40"/><path d="M45 45c5 5,10 10,15 15"/></svg>`,
            "utf8"
        );

        const summary = await generateStrokeOrderGifs({
            jlptOnlyJson: { 今: { jlpt: 5 } },
            imageSourceDir,
            animationSourceDir,
            levels: [5],
            limit: 10,
            overwrite: true,
        });

        assert.equal(summary.generated, 1);
        assert.equal(summary.failures.length, 0);
        assert.equal(buildOutputFileName("今"), "今-order.gif");
        const gifBuffer = fs.readFileSync(path.join(animationSourceDir, "今-order.gif"));
        assert.equal(gifBuffer.subarray(0, 6).toString("ascii"), "GIF89a");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatStrokeOrderGifGenerationSummary renders a readable report", () => {
    const text = formatStrokeOrderGifGenerationSummary({
        levels: [5],
        totalKanji: 79,
        attempted: 20,
        generated: 18,
        unchanged: 2,
        skippedExisting: 0,
        failures: [{ kanji: "今", message: "boom" }],
        files: [{ kanji: "休", outputPath: "C:/repo/休-order.gif", strokeCount: 6, status: "written" }],
    });

    assert.match(text, /Stroke-Order GIF Generation/);
    assert.match(text, /Generated GIFs: 18/);
    assert.match(text, /- 休: 休-order\.gif \(6 strokes, written\)/);
    assert.match(text, /- 今: boom/);
});
