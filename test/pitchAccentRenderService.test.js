const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildPitchAccentHtml,
    getPitchLevels,
    parsePitchAccentPattern,
    splitMoras,
} = require("../src/services/pitchAccentRenderService");

test("splitMoras keeps small kana attached to the previous mora", () => {
    assert.deepEqual(splitMoras("こんにちは"), ["こ", "ん", "に", "ち", "は"]);
    assert.deepEqual(splitMoras("じゅっぷん"), ["じゅ", "っ", "ぷ", "ん"]);
    assert.deepEqual(splitMoras("びーる"), ["び", "ー", "る"]);
});

test("getPitchLevels renders Tokyo pitch contour levels", () => {
    assert.deepEqual(getPitchLevels({ accent: 0, moraCount: 3 }), ["low", "high", "high", "high"]);
    assert.deepEqual(getPitchLevels({ accent: 1, moraCount: 3 }), ["high", "low", "low", "low"]);
    assert.deepEqual(getPitchLevels({ accent: 2, moraCount: 3 }), ["low", "high", "low", "low"]);
    assert.deepEqual(getPitchLevels({ accent: 3, moraCount: 3 }), ["low", "high", "high", "low"]);
});

test("parsePitchAccentPattern extracts unique accent numbers", () => {
    assert.deepEqual(parsePitchAccentPattern("2 [nakadaka] / 0 [heiban]"), [2, 0]);
});

test("buildPitchAccentHtml renders a learner-facing SVG graph and caption", () => {
    const html = buildPitchAccentHtml({
        pattern: "1 [atamadaka]",
        reading: "あとで",
    });

    assert.match(html, /class="pitch-accent-visual"/);
    assert.match(html, /<svg class="pitch-contour"/);
    assert.match(html, /width="122" height="78"/);
    assert.match(html, /Pitch: 1 \[atamadaka\]/);
    assert.match(html, />あ<\/text>/);
    assert.match(html, />と<\/text>/);
    assert.match(html, />で<\/text>/);
});
