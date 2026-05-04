const { parsePitchAccentPattern } = require("./pitchAccentRenderService");
const { katakanaToHiragana } = require("../utils/japanese");

const GENERATED_PITCH_LABEL = "Generated pitch (unverified)";

function arraysMatch(left = [], right = []) {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function normalizeKana(value) {
    return katakanaToHiragana(String(value || "").trim());
}

function isGeneratedPitchAccentSource({ sourceId = "", source = null } = {}) {
    const normalizedSourceId = String(sourceId || "").trim();
    if (normalizedSourceId === "voicevox-nemo-accent-query" || normalizedSourceId === "voicevox-nemo-reading-query") {
        return true;
    }

    const sourceText = [
        source?.name,
        source?.attribution,
        source?.notes,
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    return /\bgenerated\b/.test(sourceText);
}

function validateDeclaredPitchIdentity({
    label = "pitch source",
    word = "",
    reading = "",
    sourceEntry = null,
    sourceAccents = [],
} = {}) {
    const failures = [];

    if (String(sourceEntry?.sourceWord || "").trim() !== String(word || "").trim()) {
        failures.push(`${label} sourceWord does not match the card word`);
    }
    if (normalizeKana(sourceEntry?.sourceReading) !== normalizeKana(reading)) {
        failures.push(`${label} sourceReading does not match the card reading`);
    }
    const rawSourceAccents = parsePitchAccentPattern(sourceEntry?.sourceAccent || "");
    if (!arraysMatch(rawSourceAccents, sourceAccents)) {
        failures.push(`${label} sourceAccent does not match the governed pitch pattern`);
    }

    return failures;
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
        failures.push(...validateDeclaredPitchIdentity({
            label: "Kanjium",
            word,
            reading,
            sourceEntry,
            sourceAccents,
        }));
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
    } else {
        failures.push(...validateDeclaredPitchIdentity({
            word,
            reading,
            sourceEntry,
            sourceAccents,
        }));
    }

    return failures;
}

module.exports = {
    GENERATED_PITCH_LABEL,
    arraysMatch,
    isGeneratedPitchAccentSource,
    validateDeclaredPitchIdentity,
    validateWordPitchAccentSource,
};
