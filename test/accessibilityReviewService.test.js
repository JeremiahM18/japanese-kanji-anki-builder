const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildAccessibilityReviewReport,
    buildExportedImageAltSummary,
    computeContrastRatio,
    parseHexColor,
} = require("../src/services/accessibilityReviewService");

test("computeContrastRatio reports a strong ratio for black on white", () => {
    const ratio = computeContrastRatio(parseHexColor("#000000"), parseHexColor("#ffffff"));
    assert.equal(Number(ratio.toFixed(2)), 21);
});

test("buildAccessibilityReviewReport passes a healthy word schema baseline", () => {
    const report = buildAccessibilityReviewReport({
        deckKind: "word",
        schema: {
            fieldNames: [
                "Word",
                "Reading",
                "Audio",
                "Meaning",
                "JLPTLevel",
                "CoverageRole",
                "FocusKanji",
                "CoversReading",
                "KanjiBreakdown",
                "ExampleSentence",
                "Notes",
            ],
            qfmt: "<div class=\"word\">{{Word}}</div>",
            afmt: "{{FrontSide}}{{#Audio}}{{Audio}}{{/Audio}}{{#KanjiBreakdown}}{{KanjiBreakdown}}{{/KanjiBreakdown}}{{#ExampleSentence}}{{ExampleSentence}}{{/ExampleSentence}}",
            css: [
                ".card {",
                "  font-family: \"Yu Gothic UI\", \"Hiragino Sans\", \"Noto Sans JP\", sans-serif;",
                "  color: #1f2937;",
                "  background: #f8fafc;",
                "  font-size: 20px;",
                "}",
                ".word-reading {",
                "  font-size: 24px;",
                "  color: #334155;",
                "}",
                ".word-level {",
                "  font-size: 16px;",
                "  color: #475569;",
                "}",
                ".focus-line {",
                "  font-size: 15px;",
                "  color: #1e293b;",
                "}",
                ".section-title {",
                "  font-size: 15px;",
                "  font-weight: 700;",
                "  color: #0f172a;",
                "}",
            ].join("\n"),
        },
        packageSummary: {
            rootDir: "out/word-build/package",
            mediaCounts: {
                audio: 10,
                strokeOrderAnimation: 10,
            },
        },
    });

    assert.equal(report.summary.valid, true);
    assert.equal(report.summary.failCount, 0);
});

test("buildAccessibilityReviewReport flags low-contrast and font stack problems", () => {
    const report = buildAccessibilityReviewReport({
        deckKind: "word",
        schema: {
            fieldNames: ["Word", "Reading", "Meaning", "ExampleSentence", "Notes"],
            qfmt: "{{Meaning}}",
            afmt: "{{FrontSide}}",
            css: [
                ".card {",
                "  font-family: Arial, sans-serif;",
                "  color: #777777;",
                "  background: #ffffff;",
                "  font-size: 16px;",
                "}",
                ".word-level {",
                "  font-size: 16px;",
                "  color: #888888;",
                "}",
            ].join("\n"),
        },
        packageSummary: {
            rootDir: "out/word-build/package",
            mediaCounts: {
                audio: 5,
                strokeOrderAnimation: 0,
            },
        },
    });

    assert.equal(report.summary.valid, false);
    assert.ok(report.checks.some((check) => check.id === "font-stack" && check.status === "fail"));
    assert.ok(report.checks.some((check) => check.id === "front-text" && check.status === "fail"));
    assert.ok(report.checks.some((check) => check.id.startsWith("contrast:") && check.status === "fail"));
});

test("buildAccessibilityReviewReport fails exported image tags without alt text", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-a11y-exports-"));
    const exportsDir = path.join(tempRoot, "exports");
    fs.mkdirSync(exportsDir, { recursive: true });
    fs.writeFileSync(
        path.join(exportsDir, "deck.tsv"),
        "Word\tKanjiBreakdown\n本\t<img src=\"672C_本-stroke-order.gif\" />\n",
        "utf-8"
    );

    const imageSummary = buildExportedImageAltSummary(exportsDir);
    assert.equal(imageSummary.imageTagCount, 1);
    assert.equal(imageSummary.imageTagsMissingAlt, 1);

    const report = buildAccessibilityReviewReport({
        deckKind: "word",
        schema: {
            fieldNames: ["Word", "Audio", "KanjiBreakdown", "ExampleSentence"],
            qfmt: "{{Word}}",
            afmt: "{{FrontSide}}{{#Audio}}{{Audio}}{{/Audio}}{{#KanjiBreakdown}}{{KanjiBreakdown}}{{/KanjiBreakdown}}{{#ExampleSentence}}{{ExampleSentence}}{{/ExampleSentence}}",
            css: [
                ".card {",
                "  font-family: \"Yu Gothic UI\", \"Hiragino Sans\", \"Noto Sans JP\", sans-serif;",
                "  color: #1f2937;",
                "  background: #f8fafc;",
                "  font-size: 20px;",
                "}",
            ].join("\n"),
        },
        packageSummary: {
            rootDir: tempRoot,
            exportsDir,
            mediaCounts: {
                audio: 1,
                strokeOrderAnimation: 1,
            },
        },
    });

    assert.equal(report.summary.valid, false);
    assert.ok(report.checks.some((check) => (
        check.id === "exported-image-alt-text"
        && check.status === "fail"
        && check.details.includes("1/1 exported image tags without non-empty alt text")
    )));
});
