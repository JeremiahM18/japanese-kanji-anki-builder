const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    buildWordCoverageContractSummary,
    loadWordStudyData,
    buildWordStudyEntryKey,
    isStarterDerivedEntry,
    normalizeWordStudyData,
    refreshStarterEntries,
} = require("../src/datasets/wordStudyData");

const STARTER_WORD_STUDY_DATA_PATH = path.resolve(process.cwd(), "templates", "starter_word_study_data.json");
let trackedStarterWordEntriesCache = null;

function loadTrackedStarterWordEntries() {
    if (!trackedStarterWordEntriesCache) {
        trackedStarterWordEntriesCache = loadWordStudyData({
            starterPath: STARTER_WORD_STUDY_DATA_PATH,
            localPath: null,
        });
    }
    return trackedStarterWordEntriesCache;
}

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

test("normalizeWordStudyData rejects legacy non-ruby reading breakdowns", () => {
    assert.throws(() => normalizeWordStudyData({
        today: {
            written: "今日",
            reading: "きょう",
            meaning: "today",
            readingBreakdown: "今+日=きょう",
        },
    }), /readingBreakdown must use ruby furigana markup/);

    const normalized = normalizeWordStudyData({
        today: {
            written: "今日",
            reading: "きょう",
            meaning: "today",
            readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        },
    });

    assert.equal(normalized["今日|きょう"].readingBreakdown, "<ruby>今日<rt>きょう</rt></ruby>");
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
        "高い山|たかいやま": {
            written: "高い山",
            reading: "たかいやま",
            meaning: "high mountain",
            jlpt: 5,
            tags: ["starter", "phrase"],
        },
    });

    assert.equal(summary.starterEntriesByLevel[5], 2);
    assert.equal(summary.excludedPhraseEntriesByLevel[5], 1);
    assert.equal(summary.explicitCoverageEntriesByLevel[5], 1);
    assert.equal(summary.explicitReadingTargetsByLevel[5], 2);
    assert.equal(summary.explicitCoveragePercentByLevel[5], 50);
});

test("word study dataset helpers detect and refresh starter-derived entries", () => {
    assert.equal(isStarterDerivedEntry({ source: "word-study-data" }), true);
    assert.equal(isStarterDerivedEntry({ tags: ["starter", "n4"] }), true);
    assert.equal(isStarterDerivedEntry({ source: "manual-curation", tags: ["n4"] }), false);

    const refreshed = refreshStarterEntries(
        {
            "計画|けいかく": {
                written: "計画",
                reading: "けいかく",
                meaning: "plan",
                source: "word-study-data",
                tags: ["starter", "n4"],
                jlpt: 4,
            },
        },
        {
            "計画|けいかく": {
                written: "計画",
                reading: "けいかく",
                meaning: "old meaning",
                source: "word-study-data",
                tags: ["starter", "n4"],
                jlpt: 4,
            },
            "自作|じさく": {
                written: "自作",
                reading: "じさく",
                meaning: "self-made",
                source: "manual-curation",
                tags: ["n4"],
                jlpt: 4,
            },
        },
    );

    assert.equal(refreshed["計画|けいかく"].meaning, "plan");
    assert.equal(refreshed["自作|じさく"].meaning, "self-made");
});

test("tracked starter word data includes the first governed N4 starter entries", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["安心|あんしん"].jlpt, 4);
    assert.deepEqual(starterEntries["安心|あんしん"].tags, ["common", "n4", "starter"]);
    assert.equal(starterEntries["急ぐ|いそぐ"].jlpt, 4);
    assert.deepEqual(starterEntries["急ぐ|いそぐ"].tags, ["core", "n4", "starter"]);
    assert.equal(starterEntries["海岸|かいがん"].jlpt, 4);
    assert.equal(starterEntries["世界|せかい"].jlpt, 4);
    assert.equal(starterEntries["花見|はなみ"].jlpt, 4);
    assert.equal(starterEntries["開く|ひらく"].jlpt, 4);
});

test("tracked starter word data includes the first promoted N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["文|ぶん"].jlpt, 4);
    assert.deepEqual(starterEntries["文|ぶん"].coverage, {
        role: "both",
        focusKanji: ["文"],
        coversReadings: {
            文: "ぶん",
        },
    });
    assert.equal(starterEntries["別|べつ"].jlpt, 4);
    assert.equal(starterEntries["別れる|わかれる"].coverage.coversReadings["別"], "わかれる");
    assert.equal(starterEntries["問|もん"].coverage.coversReadings["問"], "もん");
    assert.equal(starterEntries["有る|ある"].coverage.coversReadings["有"], "ある");
    assert.equal(starterEntries["郵便|ゆうびん"].coverage.coversReadings["郵"], "ゆう");
    assert.equal(starterEntries["曜日|ようび"].coverage.coversReadings["曜"], "よう");
    assert.equal(starterEntries["洋服|ようふく"].coverage.coversReadings["洋"], "よう");
    assert.equal(starterEntries["理由|りゆう"].coverage.coversReadings["理"], "り");
    assert.equal(starterEntries["旅行|りょこう"].coverage.coversReadings["旅"], "りょ");
    assert.equal(starterEntries["料金|りょうきん"].coverage.coversReadings["料"], "りょう");
    assert.equal(starterEntries["立つ|たつ"].coverage.coversReadings["立"], "たつ");
    assert.equal(starterEntries["味|あじ"].coverage.coversReadings["味"], "あじ");
    assert.equal(starterEntries["明るい|あかるい"].coverage.coversReadings["明"], "あかるい");
    assert.equal(starterEntries["野原|のはら"].coverage.coversReadings["野"], "の");
});

test("tracked starter word data includes the second governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["不便|ふべん"].coverage.coversReadings["不"], "ふ");
    assert.equal(starterEntries["歌|うた"].coverage.coversReadings["歌"], "うた");
    assert.equal(starterEntries["売る|うる"].coverage.coversReadings["売"], "うる");
    assert.equal(starterEntries["晩|ばん"].coverage.coversReadings["晩"], "ばん");
    assert.equal(starterEntries["品|しな"].coverage.coversReadings["品"], "しな");
    assert.equal(starterEntries["部|ぶ"].coverage.coversReadings["部"], "ぶ");
    assert.equal(starterEntries["風|かぜ"].coverage.coversReadings["風"], "かぜ");
    assert.equal(starterEntries["台風|たいふう"].coverage.coversReadings["風"], "ふう");
    assert.equal(starterEntries["物|もの"].coverage.coversReadings["物"], "もの");
    assert.equal(starterEntries["閉まる|しまる"].coverage.coversReadings["閉"], "しまる");
    assert.equal(starterEntries["野菜|やさい"].coverage.coversReadings["野"], "や");
    assert.equal(starterEntries["用|よう"].coverage.coversReadings["用"], "よう");
    assert.equal(starterEntries["力|ちから"].coverage.coversReadings["力"], "ちから");
    assert.equal(starterEntries["入力|にゅうりょく"].coverage.coversReadings["力"], "りょく");
    assert.equal(starterEntries["意味|いみ"].coverage.coversReadings["味"], "み");
    assert.equal(starterEntries["今夜|こんや"].coverage.coversReadings["夜"], "や");
    assert.equal(starterEntries["道|みち"].coverage.coversReadings["道"], "みち");
    assert.equal(starterEntries["道具|どうぐ"].coverage.coversReadings["道"], "どう");
    assert.equal(starterEntries["特に|とくに"].coverage.coversReadings["特"], "とく");
});

test("tracked starter word data includes the third governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["町|まち"].coverage.coversReadings["町"], "まち");
    assert.equal(starterEntries["通う|かよう"].coverage.coversReadings["通"], "かよう");
    assert.equal(starterEntries["通る|とおる"].coverage.coversReadings["通"], "とおる");
    assert.equal(starterEntries["兄弟|きょうだい"].coverage.coversReadings["弟"], "だい");
    assert.equal(starterEntries["書店|しょてん"].coverage.coversReadings["店"], "てん");
    assert.equal(starterEntries["転ぶ|ころぶ"].coverage.coversReadings["転"], "ころぶ");
    assert.equal(starterEntries["田|た"].coverage.coversReadings["田"], "た");
    assert.equal(starterEntries["今度|こんど"].coverage.coversReadings["度"], "ど");
    assert.equal(starterEntries["冬|ふゆ"].coverage.coversReadings["冬"], "ふゆ");
    assert.equal(starterEntries["答える|こたえる"].coverage.coversReadings["答"], "こたえる");
    assert.equal(starterEntries["答え|こたえ"].coverage.coversReadings["答"], "こたえ");
    assert.equal(starterEntries["動く|うごく"].coverage.coversReadings["動"], "うごく");
    assert.equal(starterEntries["動物|どうぶつ"].coverage.coversReadings["動"], "どう");
    assert.equal(starterEntries["動物|どうぶつ"].coverage.coversReadings["物"], "ぶつ");
    assert.equal(starterEntries["同じ|おなじ"].coverage.coversReadings["同"], "おなじ");
    assert.equal(starterEntries["同時|どうじ"].coverage.coversReadings["同"], "どう");
    assert.equal(starterEntries["忙しい|いそがしい"].coverage.coversReadings["忙"], "いそがしい");
    assert.equal(starterEntries["夕食|ゆうしょく"].coverage.coversReadings["夕"], "ゆう");
});

test("tracked starter word data includes the fourth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["以内|いない"].coverage.coversReadings["以"], "い");
    assert.equal(starterEntries["入院|にゅういん"].coverage.coversReadings["院"], "いん");
    assert.equal(starterEntries["運動|うんどう"].coverage.coversReadings["運"], "うん");
    assert.equal(starterEntries["運ぶ|はこぶ"].coverage.coversReadings["運"], "はこぶ");
    assert.equal(starterEntries["映る|うつる"].coverage.coversReadings["映"], "うつる");
    assert.equal(starterEntries["英文|えいぶん"].coverage.coversReadings["英"], "えい");
    assert.equal(starterEntries["家族|かぞく"].coverage.coversReadings["家"], "か");
    assert.equal(starterEntries["歌う|うたう"].coverage.coversReadings["歌"], "うたう");
    assert.equal(starterEntries["計画|けいかく"].coverage.coversReadings["計"], "けい");
    assert.equal(starterEntries["計画|けいかく"].coverage.coversReadings["画"], "かく");
    assert.equal(starterEntries["図書館|としょかん"].coverage.coversReadings["館"], "かん");
    assert.equal(starterEntries["図書館|としょかん"].coverage.coversReadings["図"], "と");
    assert.equal(starterEntries["起こす|おこす"].coverage.coversReadings["起"], "おこす");
    assert.equal(starterEntries["急に|きゅうに"].coverage.coversReadings["急"], "きゅう");
    assert.equal(starterEntries["研究|けんきゅう"].coverage.coversReadings["研"], "けん");
    assert.equal(starterEntries["研究|けんきゅう"].coverage.coversReadings["究"], "きゅう");
    assert.equal(starterEntries["牛肉|ぎゅうにく"].coverage.coversReadings["牛"], "ぎゅう");
    assert.equal(starterEntries["去る|さる"].coverage.coversReadings["去"], "さる");
    assert.equal(starterEntries["建てる|たてる"].coverage.coversReadings["建"], "たて");
    assert.equal(starterEntries["公立|こうりつ"].coverage.coversReadings["公"], "こう");
    assert.equal(starterEntries["工場|こうじょう"].coverage.coversReadings["工"], "こう");
    assert.equal(starterEntries["銀色|ぎんいろ"].coverage.coversReadings["銀"], "ぎん");
    assert.equal(starterEntries["座席|ざせき"].coverage.coversReadings["座"], "ざ");
    assert.equal(starterEntries["作文|さくぶん"].coverage.coversReadings["作"], "さ");
    assert.equal(starterEntries["姉妹|しまい"].coverage.coversReadings["姉"], "し");
    assert.equal(starterEntries["質問|しつもん"].coverage.coversReadings["質"], "しつ");
    assert.equal(starterEntries["写真|しゃしん"].coverage.coversReadings["写"], "しゃ");
    assert.equal(starterEntries["主人|しゅじん"].coverage.coversReadings["主"], "しゅ");
    assert.equal(starterEntries["秋|あき"].coverage.coversReadings["秋"], "あき");
});

test("tracked starter word data includes the fifth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["待つ|まつ"].coverage.coversReadings["待"], "まつ");
    assert.equal(starterEntries["待ち合わせ|まちあわせ"].coverage.coversReadings["待"], "まち");
    assert.equal(starterEntries["貸す|かす"].coverage.coversReadings["貸"], "かす");
    assert.equal(starterEntries["貸し出し|かしだし"].coverage.coversReadings["貸"], "かし");
    assert.equal(starterEntries["台|だい"].coverage.coversReadings["台"], "だい");
    assert.equal(starterEntries["題|だい"].coverage.coversReadings["題"], "だい");
    assert.equal(starterEntries["知る|しる"].coverage.coversReadings["知"], "しる");
    assert.equal(starterEntries["地図|ちず"].coverage.coversReadings["地"], "ち");
    assert.equal(starterEntries["地下鉄|ちかてつ"].coverage.coversReadings["地"], "ち");
    assert.equal(starterEntries["着る|きる"].coverage.coversReadings["着"], "きる");
    assert.equal(starterEntries["着く|つく"].coverage.coversReadings["着"], "つく");
    assert.equal(starterEntries["昼|ひる"].coverage.coversReadings["昼"], "ひる");
    assert.equal(starterEntries["注意|ちゅうい"].coverage.coversReadings["注"], "ちゅう");
    assert.equal(starterEntries["注文|ちゅうもん"].coverage.coversReadings["注"], "ちゅう");
    assert.equal(starterEntries["注文|ちゅうもん"].coverage.coversReadings["文"], "もん");
    assert.equal(starterEntries["茶色|ちゃいろ"].coverage.coversReadings["茶"], "ちゃ");
    assert.equal(starterEntries["町長|ちょうちょう"].coverage.coversReadings["町"], "ちょう");
    assert.equal(starterEntries["鳥|とり"].coverage.coversReadings["鳥"], "とり");
    assert.equal(starterEntries["食堂|しょくどう"].coverage.coversReadings["堂"], "どう");
    assert.equal(starterEntries["病気|びょうき"].coverage.coversReadings["病"], "びょう");
    assert.equal(starterEntries["使い方|つかいかた"].coverage.coversReadings["方"], "かた");
});

test("tracked starter word data includes the sixth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["親切|しんせつ"].coverage.coversReadings["親"], "しん");
    assert.equal(starterEntries["親切|しんせつ"].coverage.coversReadings["切"], "せつ");
    assert.equal(starterEntries["世の中|よのなか"].coverage.coversReadings["世"], "よ");
    assert.equal(starterEntries["正午|しょうご"].coverage.coversReadings["正"], "しょう");
    assert.equal(starterEntries["切る|きる"].coverage.coversReadings["切"], "きる");
    assert.equal(starterEntries["大切|たいせつ"].coverage.coversReadings["切"], "せつ");
    assert.equal(starterEntries["多分|たぶん"].coverage.coversReadings["多"], "た");
    assert.equal(starterEntries["体|からだ"].coverage.coversReadings["体"], "からだ");
    assert.equal(starterEntries["体調|たいちょう"].coverage.coversReadings["体"], "たい");
    assert.equal(starterEntries["時代|じだい"].coverage.coversReadings["代"], "だい");
    assert.equal(starterEntries["知らせる|しらせる"].coverage.coversReadings["知"], "しらせる");
    assert.equal(starterEntries["競走|きょうそう"].coverage.coversReadings["走"], "そう");
    assert.equal(starterEntries["送る|おくる"].coverage.coversReadings["送"], "おくる");
    assert.equal(starterEntries["正しい|ただしい"].coverage.coversReadings["正"], "ただしい");
    assert.equal(starterEntries["試す|ためす"].coverage.coversReadings["試"], "ためす");
    assert.equal(starterEntries["試験|しけん"].coverage.coversReadings["験"], "けん");
    assert.equal(starterEntries["練習|れんしゅう"].coverage.coversReadings["習"], "しゅう");
    assert.equal(starterEntries["習う|ならう"].coverage.coversReadings["習"], "ならう");
    assert.equal(starterEntries["近所|きんじょ"].coverage.coversReadings["近"], "きん");
    assert.equal(starterEntries["郵便局|ゆうびんきょく"].coverage.coversReadings["局"], "きょく");
    assert.equal(starterEntries["自由|じゆう"].coverage.coversReadings["自"], "じ");
    assert.equal(starterEntries["集める|あつめる"].coverage.coversReadings["集"], "あつめる");
});

test("tracked starter word data includes the seventh governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["不足|ふそく"].coverage.coversReadings["足"], "そく");
    assert.equal(starterEntries["主に|おもに"].coverage.coversReadings["主"], "おも");
    assert.equal(starterEntries["京都|きょうと"].coverage.coversReadings["京"], "きょう");
    assert.equal(starterEntries["会員|かいいん"].coverage.coversReadings["員"], "いん");
    assert.equal(starterEntries["会議室|かいぎしつ"].coverage.coversReadings["室"], "しつ");
    assert.equal(starterEntries["住所|じゅうしょ"].coverage.coversReadings["住"], "じゅう");
    assert.equal(starterEntries["住所|じゅうしょ"].coverage.coversReadings["所"], "しょ");
    assert.equal(starterEntries["作る|つくる"].coverage.coversReadings["作"], "つくる");
    assert.equal(starterEntries["借りる|かりる"].coverage.coversReadings["借"], "かりる");
    assert.equal(starterEntries["場所|ばしょ"].coverage.coversReadings["場"], "ば");
    assert.equal(starterEntries["夏休み|なつやすみ"].coverage.coversReadings["夏"], "なつ");
    assert.equal(starterEntries["始まる|はじまる"].coverage.coversReadings["始"], "はじまる");
    assert.equal(starterEntries["始める|はじめる"].coverage.coversReadings["始"], "はじめる");
    assert.equal(starterEntries["少ない|すくない"].coverage.coversReadings["少"], "すくない");
    assert.equal(starterEntries["教える|おしえる"].coverage.coversReadings["教"], "おしえる");
    assert.equal(starterEntries["教室|きょうしつ"].coverage.coversReadings["教"], "きょう");
    assert.equal(starterEntries["真ん中|まんなか"].coverage.coversReadings["真"], "ま");
    assert.equal(starterEntries["言葉|ことば"].coverage.coversReadings["言"], "こと");
    assert.equal(starterEntries["週末|しゅうまつ"].coverage.coversReadings["週"], "しゅう");
    assert.equal(starterEntries["音楽|おんがく"].coverage.coversReadings["音"], "おん");
    assert.equal(starterEntries["黒板|こくばん"].coverage.coversReadings["黒"], "こく");
});

test("tracked starter word data includes the eighth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["悪い|わるい"].coverage.coversReadings["悪"], "わるい");
    assert.equal(starterEntries["医者|いしゃ"].coverage.coversReadings["医"], "い");
    assert.equal(starterEntries["医者|いしゃ"].coverage.coversReadings["者"], "しゃ");
    assert.equal(starterEntries["音|おと"].coverage.coversReadings["音"], "おと");
    assert.equal(starterEntries["漢字|かんじ"].coverage.coversReadings["漢"], "かん");
    assert.equal(starterEntries["漢字|かんじ"].coverage.coversReadings["字"], "じ");
    assert.equal(starterEntries["金魚|きんぎょ"].coverage.coversReadings["魚"], "ぎょ");
    assert.equal(starterEntries["強い|つよい"].coverage.coversReadings["強"], "つよい");
    assert.equal(starterEntries["授業|じゅぎょう"].coverage.coversReadings["業"], "ぎょう");
    assert.equal(starterEntries["空港|くうこう"].coverage.coversReadings["空"], "くう");
    assert.equal(starterEntries["言う|いう"].coverage.coversReadings["言"], "いう");
    assert.equal(starterEntries["中古|ちゅうこ"].coverage.coversReadings["古"], "こ");
    assert.equal(starterEntries["広い|ひろい"].coverage.coversReadings["広"], "ひろい");
    assert.equal(starterEntries["考える|かんがえる"].coverage.coversReadings["考"], "かんがえる");
    assert.equal(starterEntries["黒い|くろい"].coverage.coversReadings["黒"], "くろい");
    assert.equal(starterEntries["思う|おもう"].coverage.coversReadings["思"], "おもう");
    assert.equal(starterEntries["止まる|とまる"].coverage.coversReadings["止"], "とまる");
    assert.equal(starterEntries["止める|とめる"].coverage.coversReadings["止"], "とめる");
    assert.equal(starterEntries["死ぬ|しぬ"].coverage.coversReadings["死"], "しぬ");
    assert.equal(starterEntries["私|わたし"].coverage.coversReadings["私"], "わたし");
    assert.equal(starterEntries["紙|かみ"].coverage.coversReadings["紙"], "かみ");
    assert.equal(starterEntries["持つ|もつ"].coverage.coversReadings["持"], "もつ");
});

test("tracked starter word data includes the ninth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["空|から"].coverage.coversReadings["空"], "から");
    assert.equal(starterEntries["元|もと"].coverage.coversReadings["元"], "もと");
    assert.equal(starterEntries["事|こと"].coverage.coversReadings["事"], "こと");
    assert.equal(starterEntries["気持ち|きもち"].coverage.coversReadings["持"], "もち");
    assert.equal(starterEntries["写す|うつす"].coverage.coversReadings["写"], "うつす");
    assert.equal(starterEntries["終わる|おわる"].coverage.coversReadings["終"], "おわる");
    assert.equal(starterEntries["最終|さいしゅう"].coverage.coversReadings["終"], "しゅう");
    assert.equal(starterEntries["集まる|あつまる"].coverage.coversReadings["集"], "あつまる");
    assert.equal(starterEntries["重い|おもい"].coverage.coversReadings["重"], "おもい");
    assert.equal(starterEntries["重要|じゅうよう"].coverage.coversReadings["重"], "じゅう");
    assert.equal(starterEntries["春|はる"].coverage.coversReadings["春"], "はる");
    assert.equal(starterEntries["所|ところ"].coverage.coversReadings["所"], "ところ");
    assert.equal(starterEntries["少し|すこし"].coverage.coversReadings["少"], "すこし");
    assert.equal(starterEntries["景色|けしき"].coverage.coversReadings["色"], "しき");
    assert.equal(starterEntries["景色|けしき"].readingBreakdown, "<ruby>景<rt>け</rt></ruby><ruby>色<rt>しき</rt></ruby>");
    assert.equal(starterEntries["親|おや"].coverage.coversReadings["親"], "おや");
    assert.equal(starterEntries["早い|はやい"].coverage.coversReadings["早"], "はやい");
    assert.equal(starterEntries["走る|はしる"].coverage.coversReadings["走"], "はしる");
    assert.equal(starterEntries["足|あし"].coverage.coversReadings["足"], "あし");
    assert.equal(starterEntries["多い|おおい"].coverage.coversReadings["多"], "おおい");
    assert.equal(starterEntries["仕える|つかえる"].coverage.coversReadings["仕"], "つかえる");
});

test("tracked starter word data includes the tenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["屋|や"].coverage.coversReadings["屋"], "や");
    assert.equal(starterEntries["社会|しゃかい"].coverage.coversReadings["社"], "しゃ");
    assert.equal(starterEntries["青空|あおぞら"].coverage.coversReadings["青"], "あお");
    assert.equal(starterEntries["赤ちゃん|あかちゃん"].coverage.coversReadings["赤"], "あか");
    assert.equal(starterEntries["家|うち"].coverage.coversReadings["家"], "うち");
    assert.equal(starterEntries["花火|はなび"].coverage.coversReadings["花"], "か");
    assert.equal(starterEntries["終点|しゅうてん"].coverage.coversReadings["終"], "しゅう");
    assert.equal(starterEntries["事情|じじょう"].coverage.coversReadings["事"], "じ");
    assert.equal(starterEntries["集中|しゅうちゅう"].coverage.coversReadings["集"], "しゅう");
    assert.equal(starterEntries["会場|かいじょう"].coverage.coversReadings["会"], "かい");
    assert.equal(starterEntries["会場|かいじょう"].coverage.coversReadings["場"], "じょう");
    assert.equal(starterEntries["色|いろ"].coverage.coversReadings["色"], "いろ");
    assert.equal(starterEntries["人気|にんき"].coverage.coversReadings["人"], "にん");
    assert.equal(starterEntries["人気|にんき"].coverage.coversReadings["気"], "き");
});

test("tracked starter word data includes the eleventh governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["悪口|わるくち"].coverage.coversReadings["悪"], "わる");
    assert.equal(starterEntries["開始|かいし"].coverage.coversReadings["開"], "かい");
    assert.equal(starterEntries["開始|かいし"].coverage.coversReadings["始"], "し");
    assert.equal(starterEntries["楽しむ|たのしむ"].coverage.coversReadings["楽"], "たのしむ");
    assert.equal(starterEntries["起こる|おこる"].coverage.coversReadings["起"], "おこる");
    assert.equal(starterEntries["歌手|かしゅ"].coverage.coversReadings["歌"], "か");
    assert.equal(starterEntries["帰国|きこく"].coverage.coversReadings["帰"], "き");
    assert.equal(starterEntries["仕事中|しごとちゅう"].coverage.coversReadings["仕"], "し");
    assert.equal(starterEntries["住民|じゅうみん"].coverage.coversReadings["住"], "じゅう");
    assert.equal(starterEntries["手伝う|てつだう"].coverage.coversReadings["手"], "て");
    assert.equal(starterEntries["買い物|かいもの"].coverage.coversReadings["買"], "かい");
    assert.equal(starterEntries["有名人|ゆうめいじん"].coverage.coversReadings["人"], "じん");
    assert.equal(starterEntries["青信号|あおしんごう"].coverage.coversReadings["青"], "あお");
    assert.equal(starterEntries["赤信号|あかしんごう"].coverage.coversReadings["赤"], "あか");
    assert.equal(starterEntries["古本|ふるほん"].coverage.coversReadings["古"], "ふる");
    assert.equal(starterEntries["歩道|ほどう"].coverage.coversReadings["歩"], "ほ");
    assert.equal(starterEntries["閉会|へいかい"].coverage.coversReadings["閉"], "へい");
});

test("tracked starter word data includes the twelfth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["悪人|あくにん"].coverage.coversReadings["悪"], "あく");
    assert.equal(starterEntries["開会|かいかい"].coverage.coversReadings["開"], "かい");
    assert.equal(starterEntries["楽器|がっき"].coverage.coversReadings["楽"], "がく");
    assert.equal(starterEntries["画家|がか"].coverage.coversReadings["画"], "が");
    assert.equal(starterEntries["映す|うつす"].coverage.coversReadings["映"], "うつす");
    assert.equal(starterEntries["家庭|かてい"].coverage.coversReadings["家"], "か");
    assert.equal(starterEntries["家賃|やちん"].coverage.coversReadings["家"], "や");
    assert.equal(starterEntries["館内|かんない"].coverage.coversReadings["館"], "かん");
    assert.equal(starterEntries["帰宅|きたく"].coverage.coversReadings["帰"], "き");
    assert.equal(starterEntries["急行|きゅうこう"].coverage.coversReadings["急"], "きゅう");
    assert.equal(starterEntries["魚屋|さかなや"].coverage.coversReadings["魚"], "ざかな");
    assert.equal(starterEntries["花屋|はなや"].coverage.coversReadings["花"], "はな");
    assert.equal(starterEntries["本音|ほんね"].coverage.coversReadings["音"], "ね");
});

test("tracked starter word data includes the thirteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["会計|かいけい"].coverage.coversReadings["計"], "けい");
    assert.equal(starterEntries["帰り道|かえりみち"].coverage.coversReadings["帰"], "かえり");
    assert.equal(starterEntries["帰り道|かえりみち"].coverage.coversReadings["道"], "みち");
    assert.equal(starterEntries["元々|もともと"].coverage.coversReadings["元"], "もと");
    assert.equal(starterEntries["元日|がんじつ"].coverage.coversReadings["元"], "がん");
    assert.equal(starterEntries["住まい|すまい"].coverage.coversReadings["住"], "すまい");
    assert.equal(starterEntries["寝室|しんしつ"].coverage.coversReadings["寝"], "しん");
    assert.equal(starterEntries["新年|しんねん"].coverage.coversReadings["新"], "しん");
    assert.equal(starterEntries["閉店|へいてん"].coverage.coversReadings["閉"], "へい");
    assert.equal(starterEntries["使い道|つかいみち"].coverage.coversReadings["使"], "つかい");
    assert.equal(starterEntries["使い道|つかいみち"].coverage.coversReadings["道"], "みち");
    assert.equal(starterEntries["夏服|なつふく"].coverage.coversReadings["服"], "ふく");
    assert.equal(starterEntries["近道|ちかみち"].coverage.coversReadings["近"], "ちか");
    assert.equal(starterEntries["売店|ばいてん"].coverage.coversReadings["売"], "ばい");
    assert.equal(starterEntries["売店|ばいてん"].coverage.coversReadings["店"], "てん");
    assert.equal(starterEntries["音色|ねいろ"].coverage.coversReadings["音"], "ね");
    assert.equal(starterEntries["音色|ねいろ"].coverage.coversReadings["色"], "いろ");
});

test("tracked starter word data includes the fourteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["悪夢|あくむ"].coverage.coversReadings["悪"], "あく");
    assert.equal(starterEntries["近づく|ちかづく"].coverage.coversReadings["近"], "ちか");
    assert.equal(starterEntries["寝坊|ねぼう"].coverage.coversReadings["寝"], "ね");
    assert.equal(starterEntries["寝坊|ねぼう"].readingBreakdown, "<ruby>寝<rt>ね</rt></ruby><ruby>坊<rt>ぼう</rt></ruby>");
    assert.equal(starterEntries["仕方|しかた"].coverage.coversReadings["方"], "かた");
    assert.equal(starterEntries["勉強中|べんきょうちゅう"].coverage.coversReadings["勉"], "べん");
    assert.equal(starterEntries["勉強中|べんきょうちゅう"].coverage.coversReadings["強"], "きょう");
    assert.equal(starterEntries["会費|かいひ"].coverage.coversReadings["会"], "かい");
    assert.equal(starterEntries["売上|うりあげ"].coverage.coversReadings["売"], "うり");
    assert.equal(starterEntries["開店|かいてん"].coverage.coversReadings["開"], "かい");
    assert.equal(starterEntries["映画館|えいがかん"].coverage.coversReadings["映"], "えい");
    assert.equal(starterEntries["映画館|えいがかん"].coverage.coversReadings["館"], "かん");
});

test("tracked starter word data includes the fifteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["明ける|あける"].coverage.coversReadings["明"], "あける");
    assert.equal(starterEntries["説明|せつめい"].coverage.coversReadings["明"], "めい");
    assert.equal(starterEntries["目的|もくてき"].coverage.coversReadings["目"], "もく");
    assert.equal(starterEntries["目的|もくてき"].readingBreakdown, "<ruby>目<rt>もく</rt></ruby><ruby>的<rt>てき</rt></ruby>");
    assert.equal(starterEntries["方法|ほうほう"].coverage.coversReadings["方"], "ほう");
    assert.equal(starterEntries["立てる|たてる"].coverage.coversReadings["立"], "たてる");
    assert.equal(starterEntries["国立|こくりつ"].coverage.coversReadings["立"], "りつ");
    assert.equal(starterEntries["立場|たちば"].coverage.coversReadings["立"], "たち");
    assert.equal(starterEntries["閉じる|とじる"].coverage.coversReadings["閉"], "とじる");
    assert.equal(starterEntries["旅|たび"].coverage.coversReadings["旅"], "たび");
    assert.equal(starterEntries["文化|ぶんか"].coverage.coversReadings["文"], "ぶん");
    assert.equal(starterEntries["問題|もんだい"].coverage.coversReadings["問"], "もん");
    assert.equal(starterEntries["別に|べつに"].coverage.coversReadings["別"], "べつ");
});

test("tracked starter word data includes the sixteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["中止|ちゅうし"].coverage.coversReadings["止"], "し");
    assert.equal(starterEntries["出発|しゅっぱつ"].coverage.coversReadings["発"], "はつ");
    assert.equal(starterEntries["普通|ふつう"].coverage.coversReadings["通"], "つう");
    assert.equal(starterEntries["通り|とおり"].coverage.coversReadings["通"], "とおり");
    assert.equal(starterEntries["空く|あく"].coverage.coversReadings["空"], "あく");
    assert.equal(starterEntries["空ける|あける"].coverage.coversReadings["空"], "あける");
    assert.equal(starterEntries["切れる|きれる"].coverage.coversReadings["切"], "きれる");
    assert.equal(starterEntries["交代|こうたい"].coverage.coversReadings["代"], "たい");
    assert.equal(starterEntries["代わり|かわり"].coverage.coversReadings["代"], "かわり");
    assert.equal(starterEntries["広告|こうこく"].coverage.coversReadings["広"], "こう");
    assert.equal(starterEntries["広がる|ひろがる"].coverage.coversReadings["広"], "ひろがる");
});

test("tracked starter word data includes the seventeenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["家計|かけい"].coverage.coversReadings["家"], "け");
    assert.equal(starterEntries["飲料|いんりょう"].coverage.coversReadings["飲"], "いん");
    assert.equal(starterEntries["開き|ひらき"].coverage.coversReadings["開"], "ひらき");
    assert.equal(starterEntries["気楽|きらく"].coverage.coversReadings["楽"], "らく");
    assert.equal(starterEntries["観音|かんのん"].coverage.coversReadings["音"], "のん");
    assert.equal(starterEntries["屋上|おくじょう"].coverage.coversReadings["屋"], "おく");
    assert.equal(starterEntries["会釈|えしゃく"].coverage.coversReadings["会"], "え");
    assert.equal(starterEntries["力士|りきし"].coverage.coversReadings["力"], "りき");
    assert.equal(starterEntries["魚|うお"].coverage.coversReadings["魚"], "うお");
    assert.equal(starterEntries["牛|うし"].coverage.coversReadings["牛"], "うし");
});

test("tracked starter word data includes the eighteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["教わる|おそわる"].coverage.coversReadings["教"], "おそわる");
    assert.equal(starterEntries["強まる|つよまる"].coverage.coversReadings["強"], "つよまる");
    assert.equal(starterEntries["強める|つよめる"].coverage.coversReadings["強"], "つよめる");
    assert.equal(starterEntries["最近|さいきん"].coverage.coversReadings["近"], "きん");
    assert.equal(starterEntries["問う|とう"].coverage.coversReadings["問"], "とう");
    assert.equal(starterEntries["母音|ぼいん"].coverage.coversReadings["音"], "いん");
    assert.equal(starterEntries["起立|きりつ"].coverage.coversReadings["起"], "き");
    assert.equal(starterEntries["初夏|しょか"].coverage.coversReadings["夏"], "か");
    assert.equal(starterEntries["帰す|かえす"].coverage.coversReadings["帰"], "かえす");
    assert.equal(starterEntries["作業|さぎょう"].coverage.coversReadings["業"], "ぎょう");
    assert.equal(starterEntries["用いる|もちいる"].coverage.coversReadings["用"], "もちいる");
});

test("tracked starter word data includes the nineteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["開く|あく"].coverage.coversReadings["開"], "あく");
    assert.equal(starterEntries["問い|とい"].coverage.coversReadings["問"], "とい");
    assert.equal(starterEntries["問屋|とんや"].coverage.coversReadings["問"], "とん");
    assert.equal(starterEntries["手強い|てごわい"].coverage.coversReadings["強"], "こわい");
    assert.equal(starterEntries["観音開き|かんのんびらき"].coverage.coversReadings["開"], "びらき");
    assert.equal(starterEntries["夏毛|なつげ"].coverage.coversReadings["夏"], "げ");
    assert.equal(starterEntries["音信|いんしん"].coverage.coversReadings["音"], "いん");
    assert.equal(starterEntries["明朝|みょうちょう"].coverage.coversReadings["明"], "みょう");
    assert.equal(starterEntries["明朝|みょうちょう"].coverage.coversReadings["朝"], "ちょう");
});

test("tracked starter word data includes the twentieth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["強引|ごういん"].coverage.coversReadings["強"], "ごう");
    assert.equal(starterEntries["建設|けんせつ"].coverage.coversReadings["建"], "けん");
    assert.equal(starterEntries["愛犬|あいけん"].coverage.coversReadings["犬"], "けん");
    assert.equal(starterEntries["言語|げんご"].coverage.coversReadings["言"], "げん");
    assert.equal(starterEntries["伝言|でんごん"].coverage.coversReadings["言"], "ごん");
    assert.equal(starterEntries["人口|じんこう"].coverage.coversReadings["口"], "こう");
    assert.equal(starterEntries["工夫|くふう"].coverage.coversReadings["工"], "く");
    assert.equal(starterEntries["参考|さんこう"].coverage.coversReadings["考"], "こう");
    assert.equal(starterEntries["使用|しよう"].coverage.coversReadings["使"], "し");
    assert.equal(starterEntries["思想|しそう"].coverage.coversReadings["思"], "し");
    assert.equal(starterEntries["用紙|ようし"].coverage.coversReadings["紙"], "し");
    assert.equal(starterEntries["持参|じさん"].coverage.coversReadings["持"], "じ");
    assert.equal(starterEntries["自然|しぜん"].coverage.coversReadings["自"], "し");
    assert.equal(starterEntries["質屋|しちや"].coverage.coversReadings["質"], "しち");
    assert.equal(starterEntries["借用|しゃくよう"].coverage.coversReadings["借"], "しゃく");
    assert.equal(starterEntries["選手|せんしゅ"].coverage.coversReadings["手"], "しゅ");
    assert.equal(starterEntries["秋分|しゅうぶん"].coverage.coversReadings["秋"], "しゅう");
    assert.equal(starterEntries["青春|せいしゅん"].coverage.coversReadings["青"], "せい");
    assert.equal(starterEntries["青春|せいしゅん"].coverage.coversReadings["春"], "しゅん");
    assert.equal(starterEntries["売買|ばいばい"].coverage.coversReadings["買"], "ばい");
});

test("tracked starter word data includes the twenty-first governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["商品|しょうひん"].coverage.coversReadings["品"], "ひん");
    assert.equal(starterEntries["多忙|たぼう"].coverage.coversReadings["忙"], "ぼう");
    assert.equal(starterEntries["特色|とくしょく"].coverage.coversReadings["色"], "しょく");
    assert.equal(starterEntries["早朝|そうちょう"].coverage.coversReadings["早"], "そう");
    assert.equal(starterEntries["郵送|ゆうそう"].coverage.coversReadings["送"], "そう");
    assert.equal(starterEntries["通知|つうち"].coverage.coversReadings["知"], "ち");
    assert.equal(starterEntries["白鳥|はくちょう"].coverage.coversReadings["鳥"], "ちょう");
    assert.equal(starterEntries["荷物|にもつ"].coverage.coversReadings["物"], "もつ");
    assert.equal(starterEntries["貴重|きちょう"].coverage.coversReadings["重"], "ちょう");
    assert.equal(starterEntries["期待|きたい"].coverage.coversReadings["待"], "たい");
    assert.equal(starterEntries["水田|すいでん"].coverage.coversReadings["田"], "でん");
    assert.equal(starterEntries["回答|かいとう"].coverage.coversReadings["答"], "とう");
    assert.equal(starterEntries["度々|たびたび"].coverage.coversReadings["度"], "たび");
    assert.equal(starterEntries["空き地|あきち"].coverage.coversReadings["空"], "あき");
    assert.equal(starterEntries["悪者|わるもの"].coverage.coversReadings["者"], "もの");
    assert.equal(starterEntries["貸切|かしきり"].coverage.coversReadings["切"], "きり");
    assert.equal(starterEntries["昼飯|ひるめし"].coverage.coversReadings["飯"], "めし");
    assert.equal(starterEntries["早速|さっそく"].coverage.coversReadings["早"], "さっ");
    assert.equal(starterEntries["支度|したく"].coverage.coversReadings["度"], "たく");
    assert.equal(starterEntries["過去|かこ"].coverage.coversReadings["去"], "こ");
});

test("tracked starter word data includes the twenty-second governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["弟子|でし"].coverage.coversReadings["弟"], "で");
    assert.equal(starterEntries["喫茶店|きっさてん"].coverage.coversReadings["茶"], "さ");
    assert.equal(starterEntries["一切|いっさい"].coverage.coversReadings["切"], "さい");
    assert.equal(starterEntries["持ち主|もちぬし"].coverage.coversReadings["主"], "ぬし");
    assert.equal(starterEntries["風向き|かざむき"].coverage.coversReadings["風"], "かざ");
    assert.equal(starterEntries["献立|こんだて"].coverage.coversReadings["立"], "だて");
    assert.equal(starterEntries["新手|あらて"].coverage.coversReadings["新"], "あら");
    assert.equal(starterEntries["代物|しろもの"].coverage.coversReadings["代"], "しろ");
    assert.equal(starterEntries["面目|めんぼく"].coverage.coversReadings["目"], "ぼく");
    assert.equal(starterEntries["通行止め|つうこうどめ"].coverage.coversReadings["止"], "どめ");
    assert.equal(starterEntries["室町|むろまち"].coverage.coversReadings["室"], "むろ");
    assert.equal(starterEntries["仕業|しわざ"].coverage.coversReadings["業"], "わざ");
    assert.equal(starterEntries["通行止め|つうこうどめ"].readingBreakdown, "<ruby>通<rt>つう</rt></ruby><ruby>行<rt>こう</rt></ruby><ruby>止<rt>ど</rt></ruby>め");
});

test("tracked starter word data includes the twenty-third governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["賃貸|ちんたい"].coverage.coversReadings["貸"], "たい");
    assert.equal(starterEntries["師弟|してい"].coverage.coversReadings["弟"], "てい");
    assert.equal(starterEntries["嫌悪|けんお"].coverage.coversReadings["悪"], "お");
    assert.equal(starterEntries["義兄|ぎけい"].coverage.coversReadings["兄"], "けい");
    assert.equal(starterEntries["体裁|ていさい"].coverage.coversReadings["体"], "てい");
    assert.equal(starterEntries["神道|しんとう"].coverage.coversReadings["道"], "とう");
    assert.equal(starterEntries["不器用|ぶきよう"].coverage.coversReadings["不"], "ぶ");
    assert.equal(starterEntries["歩合|ぶあい"].coverage.coversReadings["歩"], "ぶ");
    assert.equal(starterEntries["建立|こんりゅう"].coverage.coversReadings["建"], "こん");
    assert.equal(starterEntries["建立|こんりゅう"].coverage.coversReadings["立"], "りゅう");
    assert.equal(starterEntries["給仕|きゅうじ"].coverage.coversReadings["仕"], "じ");
    assert.equal(starterEntries["今夕|こんせき"].coverage.coversReadings["夕"], "せき");
    assert.equal(starterEntries["心掛け|こころがけ"].coverage.coversReadings["心"], "こころ");
    assert.equal(starterEntries["真心|まごころ"].coverage.coversReadings["心"], "ごころ");
    assert.equal(starterEntries["見通し|みとおし"].coverage.coversReadings["通"], "とおし");
    assert.equal(starterEntries["大通り|おおどおり"].coverage.coversReadings["通"], "どおり");
    assert.equal(starterEntries["大通り|おおどおり"].readingBreakdown, "<ruby>大<rt>おお</rt></ruby><ruby>通<rt>どお</rt></ruby>り");
});

test("tracked starter word data includes the twenty-fourth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["作り出す|つくりだす"].coverage.coversReadings["作"], "つくり");
    assert.equal(starterEntries["二階建て|にかいだて"].coverage.coversReadings["建"], "だて");
    assert.equal(starterEntries["急ぎ足|いそぎあし"].coverage.coversReadings["急"], "いそぎ");
    assert.equal(starterEntries["明くる日|あくるひ"].coverage.coversReadings["明"], "あくる");
    assert.equal(starterEntries["正夢|まさゆめ"].coverage.coversReadings["正"], "まさ");
    assert.equal(starterEntries["空く|すく"].coverage.coversReadings["空"], "すく");
    assert.equal(starterEntries["注ぐ|つぐ"].coverage.coversReadings["注"], "つぐ");
    assert.equal(starterEntries["研ぐ|とぐ"].coverage.coversReadings["研"], "とぐ");
    assert.equal(starterEntries["自ら|みずから"].coverage.coversReadings["自"], "みずから");
    assert.equal(starterEntries["足る|たる"].coverage.coversReadings["足"], "たる");
    assert.equal(starterEntries["発つ|たつ"].coverage.coversReadings["発"], "たつ");
    assert.equal(starterEntries["仮住まい|かりずまい"].coverage.coversReadings["住"], "ずまい");
    assert.equal(starterEntries["見習い|みならい"].coverage.coversReadings["習"], "ならい");
    assert.equal(starterEntries["八重|やえ"].coverage.coversReadings["重"], "え");
    assert.equal(starterEntries["映え|ばえ"].coverage.coversReadings["映"], "ばえ");
    assert.equal(starterEntries["仮住まい|かりずまい"].readingBreakdown, "<ruby>仮<rt>かり</rt></ruby><ruby>住<rt>ず</rt></ruby>まい");
});

test("tracked starter word data includes the twenty-fifth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["目蓋|まぶた"].coverage.coversReadings["目"], "ま");
    assert.equal(starterEntries["止む|やむ"].coverage.coversReadings["止"], "やむ");
    assert.equal(starterEntries["止まる|とどまる"].coverage.coversReadings["止"], "とどまる");
    assert.equal(starterEntries["新妻|にいづま"].coverage.coversReadings["新"], "にい");
    assert.equal(starterEntries["文|ふみ"].coverage.coversReadings["文"], "ふみ");
    assert.equal(starterEntries["大字|おおあざ"].coverage.coversReadings["字"], "あざ");
    assert.equal(starterEntries["青写真|あおじゃしん"].coverage.coversReadings["写"], "じゃ");
    assert.equal(starterEntries["明かり|あかり"].coverage.coversReadings["明"], "あかり");
    assert.equal(starterEntries["公|おおやけ"].coverage.coversReadings["公"], "おおやけ");
    assert.equal(starterEntries["持てる|もてる"].coverage.coversReadings["持"], "もてる");
    assert.equal(starterEntries["目蓋|まぶた"].readingBreakdown, "<ruby>目<rt>ま</rt></ruby><ruby>蓋<rt>ぶた</rt></ruby>");
});

test("tracked starter word data includes the twenty-sixth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["明かす|あかす"].coverage.coversReadings["明"], "あかす");
    assert.equal(starterEntries["明らか|あきらか"].coverage.coversReadings["明"], "あきらか");
    assert.equal(starterEntries["映える|はえる"].coverage.coversReadings["映"], "はえる");
    assert.equal(starterEntries["広げる|ひろげる"].coverage.coversReadings["広"], "ひろげる");
    assert.equal(starterEntries["広まる|ひろまる"].coverage.coversReadings["広"], "ひろまる");
    assert.equal(starterEntries["広める|ひろめる"].coverage.coversReadings["広"], "ひろめる");
    assert.equal(starterEntries["重なる|かさなる"].coverage.coversReadings["重"], "かさなる");
    assert.equal(starterEntries["重ねる|かさねる"].coverage.coversReadings["重"], "かさねる");
    assert.equal(starterEntries["終える|おえる"].coverage.coversReadings["終"], "おえる");
    assert.equal(starterEntries["集う|つどう"].coverage.coversReadings["集"], "つどう");
    assert.equal(starterEntries["計る|はかる"].coverage.coversReadings["計"], "はかる");
    assert.equal(starterEntries["強いる|しいる"].coverage.coversReadings["強"], "しいる");
    assert.equal(starterEntries["空しい|むなしい"].coverage.coversReadings["空"], "むなしい");
    assert.equal(starterEntries["親しい|したしい"].coverage.coversReadings["親"], "したしい");
    assert.equal(starterEntries["親しむ|したしむ"].coverage.coversReadings["親"], "したしむ");
    assert.equal(starterEntries["重なる|かさなる"].readingBreakdown, "<ruby>重<rt>かさ</rt></ruby>なる");
});

test("tracked starter word data carries explicit N5 reading-coverage contracts for key learner-facing words", () => {
    const starterEntries = loadTrackedStarterWordEntries();

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
    assert.equal(starterEntries["下手|へた"].coverage.coversReadings["手"], "た");
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
    assert.equal(starterEntries["木刀|ぼくとう"].coverage.coversReadings["木"], "ぼく");
    assert.equal(starterEntries["木陰|こかげ"].coverage.coversReadings["木"], "こ");
    assert.equal(starterEntries["春雨|はるさめ"].coverage.coversReadings["雨"], "さめ");
    assert.equal(starterEntries["女神|めがみ"].coverage.coversReadings["女"], "め");
    assert.equal(starterEntries["子年|ねどし"].coverage.coversReadings["子"], "ね");
    assert.equal(starterEntries["午年|うまどし"].coverage.coversReadings["午"], "うま");
    assert.equal(starterEntries["天の川|あまのがわ"].coverage.coversReadings["天"], "あま");
    assert.equal(starterEntries["天気雨|てんきあめ"].coverage.coversReadings["天"], "あめ");
    assert.equal(starterEntries["河川|かせん"].coverage.coversReadings["川"], "せん");
    assert.equal(starterEntries["白髪|しらが"].coverage.coversReadings["白"], "しら");
    assert.equal(starterEntries["話|はなし"].coverage.coversReadings["話"], "はなし");
    assert.equal(starterEntries["後れる|おくれる"].coverage.coversReadings["後"], "おくれる");
    assert.equal(starterEntries["上り|のぼり"].coverage.coversReadings["上"], "のぼり");
    assert.equal(starterEntries["下り|くだり"].coverage.coversReadings["下"], "くだり");
    assert.equal(starterEntries["左折|させつ"].coverage.coversReadings["左"], "しゃ");
    assert.equal(starterEntries["新聞|しんぶん"].coverage.role, "both");
    assert.equal(starterEntries["新聞|しんぶん"].coverage.coversReadings["聞"], "もん");
    assert.equal(starterEntries["母語|ぼご"].coverage.coversReadings["母"], "も");
    assert.equal(starterEntries["小川|おがわ"].coverage.coversReadings["小"], "お");
    assert.equal(starterEntries["小雨|こさめ"].coverage.coversReadings["小"], "さ");
    assert.equal(starterEntries["円高|えんだか"].coverage.coversReadings["高"], "だか");
    assert.equal(starterEntries["来い|こい"].coverage.coversReadings["来"], "こ");
    assert.equal(starterEntries["金具|かなぐ"].coverage.coversReadings["金"], "かな");
    assert.equal(starterEntries["黄金|おうごん"].coverage.coversReadings["金"], "ごん");
    assert.equal(starterEntries["食う|くう"].coverage.coversReadings["食"], "くう");
    assert.equal(starterEntries["上座|かみざ"].coverage.coversReadings["上"], "かみ");
    assert.equal(starterEntries["女房|にょうぼう"].coverage.coversReadings["女"], "にょう");
    assert.equal(starterEntries["白夜|びゃくや"].coverage.coversReadings["白"], "びゃく");
    assert.equal(starterEntries["足下|あしもと"].coverage.coversReadings["下"], "もと");
    assert.equal(starterEntries["出来上がり|できあがり"].coverage.coversReadings["上"], "あがり");
    assert.equal(starterEntries["一生|いっしょう"].coverage.coversReadings["生"], "しょう");
    assert.equal(starterEntries["上昇|じょうしょう"].coverage.coversReadings["上"], "しょう");
    assert.equal(starterEntries["行方|ゆくえ"].coverage.coversReadings["行"], "ゆく");
    assert.equal(starterEntries["生地|きじ"].coverage.coversReadings["生"], "き");
    assert.equal(starterEntries["生地|きじ"].coverage.coversReadings["地"], "じ");
    assert.equal(starterEntries["生やす|はやす"].coverage.coversReadings["生"], "はやす");
    assert.equal(starterEntries["火照る|ほてる"].coverage.coversReadings["火"], "ほ");
    assert.equal(starterEntries["生かす|いかす"].coverage.coversReadings["生"], "いかす");
    assert.equal(starterEntries["眼鏡|めがね"].coverage.coversReadings["金"], "がね");
    assert.equal(starterEntries["断食|だんじき"].coverage.coversReadings["食"], "じき");
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
