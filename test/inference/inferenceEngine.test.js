const test = require("node:test");
const assert = require("node:assert/strict");

const { createInferenceEngine } = require("../../src/inference/inferenceEngine");

test("inference engine ranks candidates and returns learner-friendly output", () => {
    const inferenceEngine = createInferenceEngine();

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
    assert.equal(result.sentenceCandidates[0].type, "definition");
    assert.match(result.sentenceCandidates[0].japanese, /日本/);
    assert.match(result.sentenceCandidates[0].english, /Japan/);
});
