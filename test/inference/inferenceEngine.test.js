const test = require("node:test");
const assert = require("node:assert/strict");

const { createInferenceEngine } = require("../../src/inference/inferenceEngine");
const { scoreCorpusSentence } = require("../../src/inference/sentenceInference");

test("corpus sentence scoring rewards quality metadata", () => {
    const candidate = {
        written: "日本",
        pron: "にほん",
        gloss: "Japan",
        score: 100,
    };

    const strong = scoreCorpusSentence({
        kanji: "日",
        written: "日本",
        japanese: "日本へ行きます。",
        english: "I will go to Japan.",
        source: "manual-curated",
        tags: ["core", "common", "beginner"],
        register: "neutral",
        frequencyRank: 120,
        jlpt: 5,
    }, candidate, "日");

    const weak = scoreCorpusSentence({
        kanji: "日",
        written: "日本",
        japanese: "日本に参る。",
        english: "I go to Japan.",
        source: "dictionary-import",
        tags: ["rare", "archaic"],
        register: "literary",
        frequencyRank: 4000,
        jlpt: 1,
    }, candidate, "日");

    assert.equal(strong > weak, true);
});

test("inference engine ranks candidates and returns learner-friendly output", () => {
    const inferenceEngine = createInferenceEngine({
        sentenceCorpus: [
            {
                kanji: "日",
                written: "日本",
                japanese: "日本に参る。",
                reading: "にほんにまいる。",
                english: "I go to Japan.",
                source: "dictionary-import",
                tags: ["rare", "archaic"],
                register: "literary",
                frequencyRank: 4000,
                jlpt: 1,
            },
            {
                kanji: "日",
                written: "日本",
                japanese: "日本へ行きます。",
                reading: "にほんへいきます。",
                english: "I will go to Japan.",
                source: "manual-curated",
                tags: ["core", "common", "beginner"],
                register: "neutral",
                frequencyRank: 120,
                jlpt: 5,
            },
        ],
    });

    const result = inferenceEngine.inferKanjiStudyData({
        kanji: "日",
        kanjiInfo: {
            meanings: ["day", "sun"],
        },
        words: [
            {
                variants: [
                    {
                        written: "日よう日",
                        pronounced: "にちようび",
                        priorities: ["ichi1"],
                    },
                ],
                meanings: [
                    {
                        glosses: ["Sunday"],
                    },
                ],
            },
            {
                variants: [
                    {
                        written: "日本",
                        pronounced: "にほん",
                        priorities: ["news1", "ichi1"],
                    },
                ],
                meanings: [
                    {
                        glosses: ["Japan"],
                    },
                ],
            },
        ],
    });

    assert.equal(result.bestWord.written, "日本");
    assert.equal(result.englishMeaning, "day");
    assert.equal(result.meaningJP, "日本 （にほん） ／ day");
    assert.match(result.notes, /日本/);
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].score > result.candidates[1].score, true);
    assert.equal(result.sentenceCandidates.length >= 2, true);
    assert.equal(result.sentenceCandidates[0].type, "corpus");
    assert.equal(result.sentenceCandidates[0].source, "manual-curated");
    assert.equal(result.sentenceCandidates[0].register, "neutral");
    assert.equal(result.sentenceCandidates[0].frequencyRank, 120);
    assert.match(result.sentenceCandidates[0].japanese, /日本へ行きます/);
    assert.match(result.sentenceCandidates[0].english, /go to Japan/);
});

test("inference engine falls back to templates when no corpus sentence exists", () => {
    const inferenceEngine = createInferenceEngine();

    const result = inferenceEngine.inferKanjiStudyData({
        kanji: "本",
        kanjiInfo: {
            meanings: ["book", "origin"],
        },
        words: [
            {
                variants: [
                    {
                        written: "本",
                        pronounced: "ほん",
                        priorities: ["ichi1"],
                    },
                ],
                meanings: [
                    {
                        glosses: ["book"],
                    },
                ],
            },
        ],
    });

    assert.equal(result.sentenceCandidates[0].type, "definition");
    assert.equal(result.sentenceCandidates[0].source, "template");
});
