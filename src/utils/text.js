const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー]+$/u;
const KANA_ONLY_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const HAN_CHAR_RE = /\p{Script=Han}/u;

function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeGlosses(glosses) {
    return (Array.isArray(glosses) ? glosses : [])
        .map((gloss) => normalizeText(gloss))
        .filter(Boolean);
}

function tsvEscape(value) {
    return String(value ?? "")
        .replace(/\t/g, " ")
        .replace(/\r?\n/g, " ")
        .trim();
}

function labelOnReading(onArr) {
    return Array.isArray(onArr) && onArr.length ? `オン: ${onArr.join("、 ")}` : "";
}

function labelKunReading(kunArr) {
    return Array.isArray(kunArr) && kunArr.length ? `くん: ${kunArr.join("、 ")}` : "";
}

function labelReading(onArr, kunArr) {
    const on = labelOnReading(onArr);
    const kun = labelKunReading(kunArr);
    return [on, kun].filter(Boolean).join(" ／ ");
}

module.exports = {
    HAN_CHAR_RE,
    KANA_ONLY_RE,
    KATAKANA_ONLY_RE,
    labelKunReading,
    labelOnReading,
    labelReading,
    normalizeGlosses,
    normalizeText,
    tsvEscape,
};

