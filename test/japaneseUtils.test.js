const test = require("node:test");
const assert = require("node:assert/strict");

const {
    hasHanChar,
    hasOnlyTargetKanji,
    isHiraganaOnly,
    isKanaOnly,
    isKatakanaOnly,
    katakanaToHiragana,
    normalizeJapaneseReading,
} = require("../src/utils/japanese");

test("katakanaToHiragana converts full-width katakana while leaving other text intact", () => {
    assert.equal(katakanaToHiragana("ガク"), "がく");
    assert.equal(katakanaToHiragana("スーパー"), "すーぱー");
    assert.equal(katakanaToHiragana("学ぶ"), "学ぶ");
});

test("Japanese script helpers distinguish kana and kanji correctly", () => {
    assert.equal(isKatakanaOnly("ガク"), true);
    assert.equal(isKatakanaOnly("がく"), false);
    assert.equal(isHiraganaOnly("がく"), true);
    assert.equal(isHiraganaOnly("ガク"), false);
    assert.equal(isKanaOnly("がくー"), true);
    assert.equal(isKanaOnly("ガク"), true);
    assert.equal(isKanaOnly("学"), false);
    assert.equal(hasHanChar("勉強"), true);
    assert.equal(hasHanChar("べんきょう"), false);
});

test("Japanese reading helpers normalize dictionary punctuation and target-kanji scope", () => {
    assert.equal(normalizeJapaneseReading("オン: ガク"), "おん:がく");
    assert.equal(normalizeJapaneseReading("-まな.ぶ"), "まなぶ");
    assert.equal(hasOnlyTargetKanji("日日", "日"), true);
    assert.equal(hasOnlyTargetKanji("日々", "日"), false);
    assert.equal(hasOnlyTargetKanji("日本", "日"), false);
    assert.equal(hasOnlyTargetKanji("ひ", "日"), false);
});
