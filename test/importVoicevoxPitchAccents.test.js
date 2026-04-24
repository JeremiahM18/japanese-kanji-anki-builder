const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildVoicevoxPitchAccentEntry,
    flattenAudioQueryReading,
    formatVoicevoxPitchPattern,
} = require("../scripts/importVoicevoxPitchAccents");

function audioQuery({ accent = 1, moraTexts = [] } = {}) {
    return {
        accent_phrases: [{
            accent,
            moras: moraTexts.map((text) => ({ text })),
        }],
    };
}

test("flattenAudioQueryReading joins VOICEVOX mora text", () => {
    assert.equal(flattenAudioQueryReading(audioQuery({ moraTexts: ["ア", "メ"] })), "アメ");
});

test("formatVoicevoxPitchPattern formats accent phrases", () => {
    assert.equal(formatVoicevoxPitchPattern(audioQuery({ accent: 1, moraTexts: ["ア", "メ"] }), "あめ"), "1 [atamadaka]");
});

test("buildVoicevoxPitchAccentEntry rejects written-query reading mismatch without fallback", async () => {
    const entry = await buildVoicevoxPitchAccentEntry({
        entry: { written: "十分", reading: "じゅっぷん" },
        speakerId: 10005,
        allowReadingFallback: false,
        voicevoxClient: {
            createAudioQuery: async () => audioQuery({ accent: 3, moraTexts: ["ジュ", "ウ", "ブ", "ン"] }),
        },
    });

    assert.match(entry.error, /reading mismatch/);
});

test("buildVoicevoxPitchAccentEntry marks reading-query fallback source explicitly", async () => {
    let calls = 0;
    const entry = await buildVoicevoxPitchAccentEntry({
        entry: { written: "十分", reading: "じゅっぷん" },
        speakerId: 10005,
        allowReadingFallback: true,
        voicevoxClient: {
            createAudioQuery: async () => {
                calls += 1;
                return calls === 1
                    ? audioQuery({ accent: 3, moraTexts: ["ジュ", "ウ", "ブ", "ン"] })
                    : audioQuery({ accent: 3, moraTexts: ["ジュ", "ッ", "プ", "ン"] });
            },
        },
    });

    assert.equal(entry.sourceId, "voicevox-nemo-reading-query");
    assert.equal(entry.pattern, "3 [nakadaka]");
});
