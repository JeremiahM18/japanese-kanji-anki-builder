const { parsePitchAccentPattern } = require("./pitchAccentRenderService");
const { katakanaToHiragana } = require("../utils/japanese");

function arraysMatch(left = [], right = []) {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function normalizeKana(value) {
    return katakanaToHiragana(String(value || "").trim());
}

function validateWordPitchAccentSource({
    word = "",
    reading = "",
    sourceEntry = null,
    sources = {},
} = {}) {
    const failures = [];
    const sourceId = String(sourceEntry?.sourceId || "").trim();
    const pattern = String(sourceEntry?.pattern || "").trim();

    if (!sourceEntry) {
        return ["pitch accent source entry is missing"];
    }
    if (!sourceId) {
        failures.push("sourceId is missing");
    } else if (!sources?.[sourceId]) {
        failures.push(`sourceId is not declared in word_pitch_accent_data sources: ${sourceId}`);
    }

    const sourceAccents = parsePitchAccentPattern(pattern);
    if (sourceId === "kanjium-cc-by-sa-4.0") {
        if (String(sourceEntry.sourceWord || "").trim() !== String(word || "").trim()) {
            failures.push("Kanjium sourceWord does not match the card word");
        }
        if (normalizeKana(sourceEntry.sourceReading) !== normalizeKana(reading)) {
            failures.push("Kanjium sourceReading does not match the card reading");
        }
        const rawSourceAccents = parsePitchAccentPattern(sourceEntry.sourceAccent || "");
        if (!arraysMatch(rawSourceAccents, sourceAccents)) {
            failures.push("Kanjium sourceAccent does not match the governed pitch pattern");
        }
    } else if (sourceId === "voicevox-nemo-accent-query") {
        if (String(sourceEntry.sourceQuery || "").trim() !== String(word || "").trim()) {
            failures.push("VOICEVOX written query does not match the card word");
        }
        if (normalizeKana(sourceEntry.generatedReading) !== normalizeKana(reading)) {
            failures.push("VOICEVOX generatedReading does not match the card reading");
        }
    } else if (sourceId === "voicevox-nemo-reading-query") {
        if (normalizeKana(sourceEntry.sourceQuery) !== normalizeKana(reading)) {
            failures.push("VOICEVOX reading-query sourceQuery does not match the card reading");
        }
        if (!String(sourceEntry.generatedReading || "").trim()) {
            failures.push("VOICEVOX reading-query generatedReading is missing");
        }
    }

    return failures;
}

module.exports = {
    arraysMatch,
    validateWordPitchAccentSource,
};
