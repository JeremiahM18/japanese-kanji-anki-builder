const test = require("node:test");
const assert = require("node:assert/strict");

const { formatPreviewCard, formatPreviewReport } = require("../src/services/previewService");

test("formatPreviewCard renders user-facing card details and media presence", () => {
    const text = formatPreviewCard({
        kanji: "日",
        levelLabel: "N5",
        meaningJP: "日本 （にほん） ／ day",
        reading: "オン:ニチ ／ くん:ひ",
        radical: "日",
        notes: "fixture notes",
        exampleSentence: "日本です。 ／ にほんです。 ／ It is Japan.",
        media: {
            strokeOrderPath: "animations/65E5_日-stroke-order.gif",
            strokeOrderImagePath: "images/65E5_日-stroke-order.svg",
            strokeOrderAnimationPath: "animations/65E5_日-stroke-order.gif",
            audioPath: "audio/65E5_日-kanji-reading-日.mp3",
        },
    });

    assert.match(text, /日 \(N5\)/);
    assert.match(text, /Stroke-order image: present/);
    assert.match(text, /Audio: present/);
    assert.match(text, /Example: 日本です/);
});

test("formatPreviewCard surfaces per-card preview errors", () => {
    const text = formatPreviewCard({
        kanji: "日",
        levelLabel: "N5",
        error: "fetch failed",
    });

    assert.match(text, /Preview error: fetch failed/);
});

test("formatPreviewReport summarizes scope and empty results", () => {
    const text = formatPreviewReport({ cards: [], scope: "level=N5, limit=5" });
    assert.match(text, /Cards previewed: 0/);
    assert.match(text, /Preview errors: 0/);
    assert.match(text, /No cards matched/);
});
