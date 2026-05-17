const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー]+$/u;
const HIRAGANA_ONLY_RE = /^[\p{Script=Hiragana}ー]+$/u;
const KANA_ONLY_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const HAN_CHAR_RE = /\p{Script=Han}/u;

function katakanaToHiragana(value) {
    return Array.from(String(value || "")).map((char) => {
        const code = char.charCodeAt(0);
        if (code >= 0x30A1 && code <= 0x30F6) {
            return String.fromCharCode(code - 0x60);
        }
        return char;
    }).join("");
}

function hasHanChar(value) {
    return HAN_CHAR_RE.test(String(value ?? ""));
}

function isKatakanaOnly(value) {
    return KATAKANA_ONLY_RE.test(String(value ?? ""));
}

function isHiraganaOnly(value) {
    return HIRAGANA_ONLY_RE.test(String(value ?? ""));
}

function isKanaOnly(value) {
    return KANA_ONLY_RE.test(String(value ?? ""));
}

function normalizeJapaneseReading(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/[.・]/g, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .trim();
}

function hasOnlyTargetKanji(value, kanji) {
    const kanjiChars = String(value || "").match(/\p{Script=Han}/gu) || [];
    return kanjiChars.length > 0 && kanjiChars.every((char) => char === kanji);
}

module.exports = {
    HAN_CHAR_RE,
    HIRAGANA_ONLY_RE,
    KANA_ONLY_RE,
    KATAKANA_ONLY_RE,
    hasHanChar,
    hasOnlyTargetKanji,
    isHiraganaOnly,
    isKanaOnly,
    isKatakanaOnly,
    katakanaToHiragana,
    normalizeJapaneseReading,
};
