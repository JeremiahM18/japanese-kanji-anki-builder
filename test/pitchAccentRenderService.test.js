const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildPitchAccentHtml,
    extractRenderedPitchAccentPattern,
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

test("buildPitchAccentHtml renders a learner-facing SVG graph without redundant caption text", () => {
    const html = buildPitchAccentHtml({
        pattern: "1 [atamadaka]",
        reading: "あとで",
        sourceLabel: "Generated pitch guide",
    });

    assert.match(html, /class="pitch-accent-visual"/);
    assert.match(html, /<svg class="pitch-contour"/);
    assert.match(html, /class="pitch-source-label">Generated pitch guide/);
    assert.match(html, /width="122" height="78"/);
    assert.doesNotMatch(html, /Pitch:/);
    assert.doesNotMatch(html, /atamadaka/);
    assert.match(html, />あ<\/text>/);
    assert.match(html, />と<\/text>/);
    assert.match(html, />で<\/text>/);
});

test("extractRenderedPitchAccentPattern reads rendered pitch labels without SVG coordinate noise", () => {
    const html = buildPitchAccentHtml({
        pattern: "0 [heiban] / 2 [odaka]",
        reading: "きた",
    });

    assert.deepEqual(extractRenderedPitchAccentPattern(html), [0, 2]);
    assert.deepEqual(extractRenderedPitchAccentPattern("<div>Pitch: 1 [atamadaka]</div>"), [1]);
    assert.deepEqual(extractRenderedPitchAccentPattern("2 [nakadaka]"), [2]);
});
