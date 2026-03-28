const test = require("node:test");
const assert = require("node:assert/strict");

const { createInferenceEngine } = require("../../src/inference/inferenceEngine");
const {
    buildMeaningJP,
    chooseEnglishMeaning,
    chooseMeaningDisplayCandidate,
    pickBestEnglishMeaning,
} = require("../../src/inference/meaningInference");
const { buildNotesFromRankedCandidates } = require("../../src/inference/notesInference");
const { scoreCandidate } = require("../../src/inference/ranking");
const {
    scoreCorpusSentence,
    scoreSentenceLength,
    scoreSentenceNaturalness,
    scoreReadingPresence,
} = require("../../src/inference/sentenceInference");

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
        reading: "にほんへいきます。",
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
        reading: "にほんにまいる。",
        english: "I go to Japan.",
        source: "dictionary-import",
        tags: ["rare", "archaic"],
        register: "literary",
        frequencyRank: 4000,
        jlpt: 1,
    }, candidate, "日");

    assert.equal(strong > weak, true);
});

test("sentence scoring rewards short natural examples with reading metadata", () => {
    assert.equal(scoreSentenceLength("日本へ行きます。") > scoreSentenceLength("日本国において文化的歴史的背景を深く学びます。"), true);
    assert.equal(scoreReadingPresence("にほんへいきます。") > scoreReadingPresence(""), true);
    assert.equal(
        scoreSentenceNaturalness({ japanese: "日本へ行きます。", english: "I will go to Japan." })
            > scoreSentenceNaturalness({ japanese: "「日本」は「Japan」です。", english: '"日本" means "Japan."' }),
        true
    );
});

test("scoreCandidate returns a structured score breakdown", () => {
    const scored = scoreCandidate({
        written: "日本",
        pron: "にほん",
        gloss: "Japan",
        allGlossText: "japan",
        text: "日本 （にほん） - Japan",
        variant: {
            priorities: ["ichi1", "news1"],
        },
        meaning: {
            glosses: ["Japan"],
        },
    }, "日", ["day", "sun"], [
        {
            kanji: "日",
            written: "日本",
            japanese: "日本へ行きます。",
            english: "I will go to Japan.",
            source: "manual-curated",
            tags: ["core", "common"],
            register: "neutral",
            frequencyRank: 120,
            jlpt: 5,
        },
    ]);

    assert.equal(Array.isArray(scored.scoreBreakdown.heuristic), true);
    assert.equal(Array.isArray(scored.scoreBreakdown.corpusSupport), true);
    assert.equal(scored.scoreBreakdown.heuristic.some((item) => item.key === "contains_target_kanji"), true);
    assert.equal(scored.scoreBreakdown.corpusSupport.some((item) => item.key === "corpus_exact_written_bonus"), true);
    assert.equal(
        scored.scoreBreakdown.totals.finalScore,
        scored.scoreBreakdown.totals.heuristicScore + scored.scoreBreakdown.totals.corpusSupportScore
    );
});

test("curated study data overrides meaning notes and top sentence", () => {
    const inferenceEngine = createInferenceEngine({
        sentenceCorpus: [
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
            {
                kanji: "日",
                written: "日中",
                japanese: "日中は暑いです。",
                reading: "にっちゅうはあついです。",
                english: "It is hot in the daytime.",
                source: "dictionary-import",
                tags: ["rare"],
                register: "neutral",
                frequencyRank: 800,
            },
        ],
        curatedStudyData: {
            日: {
                englishMeaning: "sun / day marker",
                source: "manual-curated",
                tags: ["curated", "core"],
                jlpt: 5,
                preferredWords: ["日本"],
                blockedWords: ["日中"],
                blockedSentencePhrases: ["daytime"],
                alternativeNotes: ["alt-a", "alt-b"],
                notes: "日本 （にほん） - Japan ／ curated-note",
                exampleSentence: {
                    japanese: "日本は島国です。",
                    reading: "にほんはしまぐにです。",
                    english: "Japan is an island nation.",
                },
            },
        },
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
                        written: "日中",
                        pronounced: "にっちゅう",
                        priorities: ["ichi1", "news1"],
                    },
                ],
                meanings: [
                    {
                        glosses: ["daytime"],
                    },
                ],
            },
            {
                variants: [
                    {
                        written: "日本",
                        pronounced: "にほん",
                        priorities: ["ichi1"],
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
    assert.equal(result.englishMeaning, "sun / day marker");
    assert.equal(result.meaningJP, "日本 （にほん） ／ sun / day marker");
    assert.equal(result.notes, "日本 （にほん） - Japan ／ curated-note");
    assert.equal(result.candidates.some((candidate) => candidate.written === "日中"), false);
    assert.equal(result.sentenceCandidates[0].type, "curated");
    assert.equal(result.sentenceCandidates[0].source, "curated-study-data");
    assert.match(result.sentenceCandidates[0].japanese, /日本は島国です/);
    assert.equal(result.curated.hasOverride, true);
    assert.equal(result.curated.source, "manual-curated");
    assert.deepEqual(result.curated.tags, ["curated", "core"]);
    assert.equal(result.curated.jlpt, 5);
    assert.deepEqual(result.curated.blockedSentencePhrases, ["daytime"]);
    assert.deepEqual(result.curated.alternativeNotes, ["alt-a", "alt-b"]);
    assert.equal(result.curated.hasCustomMeaning, true);
    assert.equal(result.curated.hasCustomNotes, true);
    assert.equal(result.curated.hasCustomExampleSentence, true);
    assert.equal(result.sentenceCandidates.some((sentence) => /daytime/i.test(sentence.english)), false);
});

test("curated displayWord can override learner-facing meaning text without changing bestWord", () => {
    const inferenceEngine = createInferenceEngine({
        curatedStudyData: {
            日: {
                englishMeaning: "sun / day marker",
                displayWord: { written: "日", pron: "ひ" },
                preferredWords: ["日本"],
            },
        },
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
                        written: "日本",
                        pronounced: "にほん",
                        priorities: ["ichi1"],
                    },
                ],
                meanings: [
                    {
                        glosses: ["Japan"],
                    },
                ],
            },
            {
                variants: [
                    {
                        written: "日",
                        pronounced: "にち",
                        priorities: ["news1"],
                    },
                ],
                meanings: [
                    {
                        glosses: ["day"],
                    },
                ],
            },
        ],
    });

    assert.equal(result.bestWord.written, "日本");
    assert.equal(result.meaningJP, "日 （ひ） ／ sun / day marker");
    assert.equal(result.curated.hasCustomDisplayWord, true);
});

test("curated displayWord can intentionally suppress pronunciation in learner-facing meaning text", () => {
    const inferenceEngine = createInferenceEngine({
        curatedStudyData: {
            一: {
                englishMeaning: "one",
                displayWord: { written: "一" },
                preferredWords: ["一つ"],
            },
        },
    });

    const result = inferenceEngine.inferKanjiStudyData({
        kanji: "一",
        kanjiInfo: {
            meanings: ["one"],
        },
        words: [
            {
                variants: [
                    {
                        written: "一",
                        pronounced: "ひと",
                        priorities: ["news1"],
                    },
                ],
                meanings: [
                    {
                        glosses: ["one"],
                    },
                ],
            },
        ],
    });

    assert.equal(result.meaningJP, "一 ／ one");
});

test("corpus support can rerank bestWord and notes", () => {
    const words = [
        {
            variants: [
                {
                    written: "日中",
                    pronounced: "にっちゅう",
                    priorities: ["ichi1", "news1"],
                },
            ],
            meanings: [
                {
                    glosses: ["daytime"],
                },
            ],
        },
        {
            variants: [
                {
                    written: "日本",
                    pronounced: "にほん",
                    priorities: ["ichi1"],
                },
            ],
            meanings: [
                {
                    glosses: ["Japan"],
                },
            ],
        },
    ];

    const plainInference = createInferenceEngine();
    const corpusBackedInference = createInferenceEngine({
        sentenceCorpus: [
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

    const plainResult = plainInference.inferKanjiStudyData({
        kanji: "日",
        kanjiInfo: {
            meanings: ["day", "sun"],
        },
        words,
    });

    const corpusResult = corpusBackedInference.inferKanjiStudyData({
        kanji: "日",
        kanjiInfo: {
            meanings: ["day", "sun"],
        },
        words,
    });

    assert.equal(plainResult.bestWord.written, "日中");
    assert.equal(corpusResult.bestWord.written, "日本");
    assert.equal(corpusResult.candidates[0].corpusSupportScore > 0, true);
    assert.equal(corpusResult.candidates[0].written, "日本");
    assert.match(corpusResult.notes, /^日本/);
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
    assert.equal(result.notes, "日本 （にほん） - Japan ／ 日よう日 （にちようび） - Sunday");
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].score > result.candidates[1].score, true);
    assert.equal(result.candidates[0].corpusSupportScore > 0, true);
    assert.equal(Array.isArray(result.candidates[0].scoreBreakdown.heuristic), true);
    assert.equal(Array.isArray(result.candidates[0].scoreBreakdown.corpusSupport), true);
    assert.equal(result.candidates[0].scoreBreakdown.totals.finalScore, result.candidates[0].score);
    assert.equal(result.sentenceCandidates.length >= 2, true);
    assert.equal(result.sentenceCandidates[0].type, "corpus");
    assert.equal(result.sentenceCandidates[0].source, "manual-curated");
    assert.equal(result.sentenceCandidates[0].register, "neutral");
    assert.equal(result.sentenceCandidates[0].frequencyRank, 120);
    assert.match(result.sentenceCandidates[0].japanese, /日本へ行きます/);
    assert.match(result.sentenceCandidates[0].english, /go to Japan/);
    assert.equal(result.curated.hasOverride, false);
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

    assert.equal(result.englishMeaning, "book");
    assert.equal(result.sentenceCandidates[0].type, "study");
    assert.equal(result.sentenceCandidates[0].source, "template");
    assert.match(result.sentenceCandidates[0].japanese, /勉強します/);
    assert.equal(result.curated.hasOverride, false);
    assert.equal(result.candidates[0].scoreBreakdown.totals.finalScore, result.candidates[0].score);
});

test("chooseEnglishMeaning can prefer the exact-match word gloss over noisy kanji meanings", () => {
    const result = chooseEnglishMeaning({
        kanji: "本",
        kanjiMeanings: ["counter for long cylindrical things", "origin"],
        bestWord: { written: "本", gloss: "book" },
    });

    assert.equal(result, "book");
});

test("chooseMeaningDisplayCandidate prefers an exact kanji match for learner-facing meanings", () => {
    const result = chooseMeaningDisplayCandidate({
        kanji: "五",
        englishMeaning: "five",
        rankedCandidates: [
            { written: "五分", pron: "ごふん", gloss: "five minutes", score: 106 },
            { written: "五", pron: "ウー", gloss: "five", score: 95 },
        ],
    });

    assert.equal(result.written, "五");
});

test("buildMeaningJP hides exact-match katakana-only readings that look non-learner-friendly", () => {
    const result = buildMeaningJP({ written: "七", pron: "チー" }, "seven");

    assert.equal(result, "七 ／ seven");
});

test("pickBestEnglishMeaning prefers learner-friendly meanings over metadata noise", () => {
    const result = pickBestEnglishMeaning([
        "one radical (no.1)",
        "day",
        "counter for long cylindrical things",
    ]);

    assert.equal(result, "day");
});

test("buildNotesFromRankedCandidates favors exact-match and contextual notes without duplicates", () => {
    const result = buildNotesFromRankedCandidates([
        { written: "日本", gloss: "Japan", text: "日本 （にほん） - Japan" },
        { written: "日", gloss: "day", text: "日 （ひ） - day" },
        { written: "日", gloss: "day", text: "日 （ひ） - day" },
        { written: "日よう日", gloss: "Sunday", text: "日よう日 （にちようび） - Sunday" },
    ], 3, "日");

    assert.equal(result, "日 （ひ） - day ／ 日本 （にほん） - Japan ／ 日よう日 （にちようび） - Sunday");
});

test("buildNotesFromRankedCandidates skips exact-match katakana-only notes", () => {
    const result = buildNotesFromRankedCandidates([
        { written: "九", pron: "チュー", gloss: "nine", text: "九 （チュー） - nine" },
        { written: "九分", pron: "くぶ", gloss: "nine parts", text: "九分 （くぶ） - nine parts" },
        { written: "九回", pron: "きゅうかい", gloss: "nine times", text: "九回 （きゅうかい） - nine times" },
    ], 3, "九");

    assert.equal(result, "九分 （くぶ） - nine parts ／ 九回 （きゅうかい） - nine times");
});
