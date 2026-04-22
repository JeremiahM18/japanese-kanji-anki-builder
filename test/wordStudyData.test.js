const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordCoverageContractSummary,
    loadWordStudyData,
    buildWordStudyEntryKey,
    normalizeWordStudyData,
} = require("../src/datasets/wordStudyData");

test("buildWordStudyEntryKey uses written and reading", () => {
    assert.equal(buildWordStudyEntryKey({ written: "今日", reading: "きょう" }), "今日|きょう");
});

test("normalizeWordStudyData canonicalizes keys from entry content", () => {
    const normalized = normalizeWordStudyData({
        today: {
            written: " 今日 ",
            reading: " きょう ",
            meaning: " today ",
            tags: [" Starter ", "starter"],
            exampleSentence: {
                japanese: "今日は忙しいです。",
                reading: "きょうはいそがしいです。",
                english: "Today is busy.",
            },
        },
    });

    assert.deepEqual(Object.keys(normalized), ["今日|きょう"]);
    assert.equal(normalized["今日|きょう"].written, "今日");
    assert.equal(normalized["今日|きょう"].reading, "きょう");
    assert.equal(normalized["今日|きょう"].meaning, "today");
    assert.deepEqual(normalized["今日|きょう"].tags, ["starter"]);
});

test("normalizeWordStudyData keeps explicit reading-coverage contracts", () => {
    const normalized = normalizeWordStudyData({
        today: {
            written: "今日",
            reading: "きょう",
            meaning: "today",
            jlpt: 5,
            coverage: {
                role: "both",
                focusKanji: [" 今 ", "日", "今"],
                coversReadings: {
                    " 今 ": " いま ",
                    日: "ひ",
                },
            },
        },
    });

    assert.deepEqual(normalized["今日|きょう"].coverage, {
        role: "both",
        focusKanji: ["今", "日"],
        coversReadings: {
            今: "いま",
            日: "ひ",
        },
    });
});

test("buildWordCoverageContractSummary reports explicit reading-coverage tracking by level", () => {
    const summary = buildWordCoverageContractSummary({
        "今日|きょう": {
            written: "今日",
            reading: "きょう",
            meaning: "today",
            jlpt: 5,
            coverage: {
                role: "both",
                focusKanji: ["今", "日"],
                coversReadings: {
                    今: "いま",
                    日: "ひ",
                },
            },
        },
        "本|ほん": {
            written: "本",
            reading: "ほん",
            meaning: "book",
            jlpt: 5,
        },
    });

    assert.equal(summary.starterEntriesByLevel[5], 2);
    assert.equal(summary.explicitCoverageEntriesByLevel[5], 1);
    assert.equal(summary.explicitReadingTargetsByLevel[5], 2);
    assert.equal(summary.explicitCoveragePercentByLevel[5], 50);
});

test("tracked starter word data includes the first governed N4 starter entries", () => {
    const starterEntries = loadWordStudyData({
        starterPath: require("node:path").resolve(process.cwd(), "templates", "starter_word_study_data.json"),
        localPath: null,
    });

    assert.equal(starterEntries["安心|あんしん"].jlpt, 4);
    assert.deepEqual(starterEntries["安心|あんしん"].tags, ["common", "n4", "starter"]);
    assert.equal(starterEntries["急ぐ|いそぐ"].jlpt, 4);
    assert.deepEqual(starterEntries["急ぐ|いそぐ"].tags, ["core", "n4", "starter"]);
    assert.equal(starterEntries["海岸|かいがん"].jlpt, 4);
    assert.equal(starterEntries["世界|せかい"].jlpt, 4);
    assert.equal(starterEntries["花見|はなみ"].jlpt, 4);
    assert.equal(starterEntries["開く|ひらく"].jlpt, 4);
});

test("tracked starter word data carries explicit N5 reading-coverage contracts for key learner-facing words", () => {
    const starterEntries = loadWordStudyData({
        starterPath: require("node:path").resolve(process.cwd(), "templates", "starter_word_study_data.json"),
        localPath: null,
    });

    assert.deepEqual(starterEntries["今日|きょう"].coverage, {
        role: "both",
        focusKanji: ["今", "日"],
        coversReadings: {
            今: "いま",
            日: "ひ",
        },
    });
    assert.equal(starterEntries["休み時間|やすみじかん"].coverage.role, "support");
    assert.equal(starterEntries["時間|じかん"].coverage.coversReadings["間"], "かん");
    assert.equal(starterEntries["五分|ごふん"].coverage.coversReadings["分"], "ふん");
    assert.equal(starterEntries["午前|ごぜん"].coverage.coversReadings["前"], "ぜん");
    assert.equal(starterEntries["今月|こんげつ"].coverage.coversReadings["今"], "こん");
    assert.equal(starterEntries["友人|ゆうじん"].coverage.coversReadings["友"], "ゆう");
    assert.equal(starterEntries["月曜日|げつようび"].coverage.coversReadings["月"], "げつ");
    assert.equal(starterEntries["中|なか"].coverage.coversReadings["中"], "なか");
    assert.equal(starterEntries["下さい|ください"].coverage.coversReadings["下"], "くださる");
    assert.equal(starterEntries["有名|ゆうめい"].coverage.role, "support");
    assert.equal(starterEntries["有名|ゆうめい"].coverage.coversReadings["名"], "めい");
    assert.equal(starterEntries["帽子|ぼうし"].coverage.role, "support");
    assert.equal(starterEntries["帽子|ぼうし"].coverage.coversReadings["子"], "し");
    assert.equal(starterEntries["彼女|かのじょ"].coverage.role, "support");
    assert.equal(starterEntries["彼女|かのじょ"].coverage.coversReadings["女"], "じょ");
    assert.equal(starterEntries["中国|ちゅうごく"].coverage.role, "support");
    assert.equal(starterEntries["中国|ちゅうごく"].coverage.coversReadings["中"], "ちゅう");
    assert.equal(starterEntries["二日|ふつか"].coverage.coversReadings["日"], "か");
    assert.equal(starterEntries["二時|にじ"].coverage.coversReadings["二"], "じ");
    assert.equal(starterEntries["地下|ちか"].coverage.coversReadings["下"], "か");
    assert.equal(starterEntries["上下|じょうげ"].coverage.coversReadings["下"], "げ");
    assert.equal(starterEntries["外す|はずす"].coverage.coversReadings["外"], "はずす");
    assert.equal(starterEntries["入学|にゅうがく"].coverage.coversReadings["入"], "にゅう");
    assert.equal(starterEntries["大変|たいへん"].coverage.coversReadings["大"], "たい");
    assert.equal(starterEntries["火山|かざん"].coverage.coversReadings["山"], "さん");
    assert.equal(starterEntries["社長|しゃちょう"].coverage.coversReadings["長"], "ちょう");
    assert.equal(starterEntries["十回|じっかい"].coverage.coversReadings["十"], "じっ");
    assert.equal(starterEntries["土地|とち"].coverage.coversReadings["土"], "と");
    assert.equal(starterEntries["名字|みょうじ"].coverage.coversReadings["名"], "みょう");
    assert.equal(starterEntries["葉書|はがき"].coverage.coversReadings["書"], "がき");
    assert.equal(starterEntries["三百|さんびゃく"].coverage.coversReadings["百"], "びゃく");
    assert.equal(starterEntries["左右|さゆう"].coverage.coversReadings["左"], "さ");
    assert.equal(starterEntries["左右|さゆう"].coverage.coversReadings["右"], "ゆう");
    assert.equal(starterEntries["見学|けんがく"].coverage.coversReadings["見"], "けん");
    assert.equal(starterEntries["雨戸|あまど"].coverage.coversReadings["雨"], "あま");
    assert.equal(starterEntries["北東|ほくとう"].coverage.coversReadings["北"], "ほく");
    assert.equal(starterEntries["見せる|みせる"].coverage.coversReadings["見"], "みせる");
    assert.equal(starterEntries["見る|みる"].coverage.coversReadings["見"], "みる");
    assert.equal(starterEntries["見える|みえる"].coverage.coversReadings["見"], "みえる");
    assert.equal(starterEntries["毎月|まいつき"].coverage.coversReadings["月"], "つき");
    assert.equal(starterEntries["名前|なまえ"].coverage.coversReadings["名"], "な");
    assert.equal(starterEntries["男子|だんし"].coverage.coversReadings["男"], "だん");
    assert.equal(starterEntries["手本|てほん"].coverage.coversReadings["本"], "もと");
    assert.equal(starterEntries["母校|ぼこう"].coverage.coversReadings["母"], "ぼ");
    assert.equal(starterEntries["雨天|うてん"].coverage.coversReadings["雨"], "う");
    assert.equal(starterEntries["八日|ようか"].coverage.coversReadings["八"], "よう");
    assert.equal(starterEntries["校長|こうちょう"].coverage.coversReadings["校"], "きょう");
    assert.equal(starterEntries["長男|ちょうなん"].coverage.coversReadings["男"], "なん");
    assert.equal(starterEntries["白米|はくまい"].coverage.coversReadings["白"], "はく");
    assert.equal(starterEntries["後半|こうはん"].coverage.coversReadings["後"], "こう");
    assert.equal(starterEntries["一日|ついたち"].coverage.coversReadings["一"], "いつ");
    assert.equal(starterEntries["後ほど|のちほど"].coverage.coversReadings["後"], "のち");
    assert.equal(starterEntries["行事|ぎょうじ"].coverage.coversReadings["行"], "ぎょう");
    assert.equal(starterEntries["南北|なんぼく"].coverage.coversReadings["南"], "なん");
    assert.equal(starterEntries["父母|ふぼ"].coverage.coversReadings["父"], "ふ");
    assert.equal(starterEntries["分かれる|わかれる"].coverage.coversReadings["分"], "わかれる");
    assert.equal(starterEntries["分ける|わける"].coverage.coversReadings["分"], "わける");
    assert.equal(starterEntries["休める|やすめる"].coverage.coversReadings["休"], "やすめる");
    assert.equal(starterEntries["下す|くだす"].coverage.coversReadings["下"], "くだす");
    assert.equal(starterEntries["生える|はえる"].coverage.coversReadings["生"], "はえる");
    assert.equal(starterEntries["休まる|やすまる"].coverage.coversReadings["休"], "やすまる");
    assert.equal(starterEntries["生け花|いけばな"].coverage.coversReadings["生"], "いける");
    assert.equal(starterEntries["西洋|せいよう"].coverage.coversReadings["西"], "せい");
    assert.equal(starterEntries["関西|かんさい"].coverage.coversReadings["西"], "さい");
    assert.equal(starterEntries["語る|かたる"].coverage.coversReadings["語"], "かたる");
    assert.equal(starterEntries["下町|したまち"].coverage.coversReadings["下"], "しも");
    assert.equal(starterEntries["外科|げか"].coverage.coversReadings["外"], "げ");
    assert.equal(starterEntries["外れる|はずれる"].coverage.coversReadings["外"], "はずれる");
    assert.equal(starterEntries["行う|おこなう"].coverage.coversReadings["行"], "おこなう");
    assert.equal(starterEntries["生ビール|なまびーる"].coverage.coversReadings["生"], "なま");
    assert.equal(starterEntries["西瓜|すいか"].coverage.coversReadings["西"], "す");
    assert.equal(starterEntries["椅子|いす"].coverage.coversReadings["子"], "す");
    assert.equal(starterEntries["気配|けはい"].coverage.coversReadings["気"], "け");
    assert.equal(starterEntries["世間|せけん"].coverage.coversReadings["間"], "けん");
    assert.equal(starterEntries["半ば|なかば"].coverage.coversReadings["半"], "なかば");
    assert.equal(starterEntries["小指|こゆび"].coverage.coversReadings["小"], "こ");
    assert.equal(starterEntries["手間|てま"].coverage.coversReadings["間"], "ま");
    assert.equal(starterEntries["白紙|はくし"].coverage.coversReadings["白"], "はく");
    assert.equal(starterEntries["音読|おんどく"].coverage.coversReadings["読"], "とう");
    assert.equal(starterEntries["万事|ばんじ"].coverage.coversReadings["万"], "ばん");
    assert.equal(starterEntries["四月|しがつ"].coverage.role, "support");
    assert.equal(starterEntries["四月|しがつ"].coverage.coversReadings["四"], "し");
    assert.equal(starterEntries["五月|ごがつ"].coverage.coversReadings["月"], "がつ");
    assert.equal(starterEntries["七日|なのか"].coverage.coversReadings["七"], "なの");
    assert.equal(starterEntries["十日|とおか"].coverage.coversReadings["十"], "とお");
});
