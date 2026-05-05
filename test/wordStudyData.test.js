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

const N5_STANDALONE_NUMBER_WORDS = [
    { key: "一|いち", kanji: "一", reading: "いち", meaning: "one" },
    { key: "二|に", kanji: "二", reading: "に", meaning: "two" },
    { key: "三|さん", kanji: "三", reading: "さん", meaning: "three" },
    { key: "四|よん", kanji: "四", reading: "よん", meaning: "four" },
    { key: "五|ご", kanji: "五", reading: "ご", meaning: "five" },
    { key: "六|ろく", kanji: "六", reading: "ろく", meaning: "six" },
    { key: "七|なな", kanji: "七", reading: "なな", meaning: "seven" },
    { key: "八|はち", kanji: "八", reading: "はち", meaning: "eight" },
    { key: "九|きゅう", kanji: "九", reading: "きゅう", meaning: "nine" },
    { key: "十|じゅう", kanji: "十", reading: "じゅう", meaning: "ten" },
];

function loadTrackedStarterWordEntries() {
    if (!trackedStarterWordEntriesCache) {
        trackedStarterWordEntriesCache = loadWordStudyData({
            starterPath: STARTER_WORD_STUDY_DATA_PATH,
            localPath: null,
        });
    }
    return trackedStarterWordEntriesCache;
}

function assertCoverageReadings(starterEntries, rows) {
    for (const [key, kanji, reading] of rows) {
        assert.equal(starterEntries[key].coverage.coversReadings[kanji], reading);
    }
}

function assertCoverageRoles(starterEntries, rows) {
    for (const [key, role] of rows) {
        assert.equal(starterEntries[key].coverage.role, role);
    }
}

function assertReadingBreakdowns(starterEntries, rows) {
    for (const [key, breakdown] of rows) {
        assert.equal(starterEntries[key].readingBreakdown, breakdown);
    }
}

test("tracked starter word data governs N5 standalone number words as a family", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    for (const { key, kanji, reading, meaning } of N5_STANDALONE_NUMBER_WORDS) {
        const entry = starterEntries[key];

        assert.equal(entry?.written, kanji);
        assert.equal(entry?.reading, reading);
        assert.equal(entry?.meaning, meaning);
        assert.equal(entry?.jlpt, 5);
        assert.equal(entry?.coverage?.role, "both");
        assert.deepEqual(entry?.coverage?.focusKanji, [kanji]);
        assert.equal(entry?.coverage?.coversReadings?.[kanji], reading);
        assert.equal(entry?.tags?.includes("core"), true);
        assert.equal(entry?.tags?.includes("n5"), true);
        assert.match(entry?.notes || "", /standalone number form/);
    }
});

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

test("normalizeWordStudyData keeps explicit learner-fit level placement reasons", () => {
    const normalized = normalizeWordStudyData({
        "人気|にんき": {
            written: "人気",
            reading: "にんき",
            meaning: "popularity / popular",
            jlpt: 4,
            levelPlacement: {
                reason: " Common and useful, but N4 is a better learner-fit introduction than N5. ",
            },
        },
    });

    assert.deepEqual(normalized["人気|にんき"].levelPlacement, {
        reason: "Common and useful, but N4 is a better learner-fit introduction than N5.",
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

test("common starter words label all governed constituent readings", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["安心|あんしん", "安", "あん"],
        ["安心|あんしん", "心", "しん"],
        ["飲み物|のみもの", "飲", "のみ"],
        ["飲み物|のみもの", "物", "もの"],
        ["上手|じょうず", "上", "じょう"],
        ["上手|じょうず", "手", "ず"],
        ["有名|ゆうめい", "有", "ゆう"],
        ["有名|ゆうめい", "名", "めい"],
        ["台風|たいふう", "台", "たい"],
        ["台風|たいふう", "風", "ふう"],
        ["兄弟|きょうだい", "兄", "きょう"],
        ["兄弟|きょうだい", "弟", "だい"],
        ["姉妹|しまい", "姉", "し"],
        ["姉妹|しまい", "妹", "まい"],
        ["写真|しゃしん", "写", "しゃ"],
        ["写真|しゃしん", "真", "しん"],
        ["地図|ちず", "地", "ち"],
        ["地図|ちず", "図", "ず"],
    ]);
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
    assertCoverageReadings(starterEntries, [
        ["別れる|わかれる", "別", "わかれる"],
        ["問|もん", "問", "もん"],
        ["有る|ある", "有", "ある"],
        ["郵便|ゆうびん", "郵", "ゆう"],
        ["曜日|ようび", "曜", "よう"],
        ["洋服|ようふく", "洋", "よう"],
        ["理由|りゆう", "理", "り"],
        ["旅行|りょこう", "旅", "りょ"],
        ["料金|りょうきん", "料", "りょう"],
        ["立つ|たつ", "立", "たつ"],
        ["味|あじ", "味", "あじ"],
        ["明るい|あかるい", "明", "あかるい"],
        ["野原|のはら", "野", "の"],
    ]);
});

test("tracked starter word data includes the second governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["不便|ふべん", "不", "ふ"],
        ["歌|うた", "歌", "うた"],
        ["売る|うる", "売", "うる"],
        ["晩|ばん", "晩", "ばん"],
        ["品|しな", "品", "しな"],
        ["部|ぶ", "部", "ぶ"],
        ["風|かぜ", "風", "かぜ"],
        ["台風|たいふう", "風", "ふう"],
        ["物|もの", "物", "もの"],
        ["閉まる|しまる", "閉", "しまる"],
        ["野菜|やさい", "野", "や"],
        ["用|よう", "用", "よう"],
        ["力|ちから", "力", "ちから"],
        ["入力|にゅうりょく", "力", "りょく"],
        ["意味|いみ", "味", "み"],
        ["今夜|こんや", "夜", "や"],
        ["道|みち", "道", "みち"],
        ["道具|どうぐ", "道", "どう"],
        ["特に|とくに", "特", "とく"],
    ]);
});

test("tracked starter word data includes the third governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["町|まち", "町", "まち"],
        ["通う|かよう", "通", "かよう"],
        ["通る|とおる", "通", "とおる"],
        ["兄弟|きょうだい", "弟", "だい"],
        ["書店|しょてん", "店", "てん"],
        ["転ぶ|ころぶ", "転", "ころぶ"],
        ["田|た", "田", "た"],
        ["今度|こんど", "度", "ど"],
        ["冬|ふゆ", "冬", "ふゆ"],
        ["答える|こたえる", "答", "こたえる"],
        ["答え|こたえ", "答", "こたえ"],
        ["動く|うごく", "動", "うごく"],
        ["動物|どうぶつ", "動", "どう"],
        ["動物|どうぶつ", "物", "ぶつ"],
        ["同じ|おなじ", "同", "おなじ"],
        ["同時|どうじ", "同", "どう"],
        ["忙しい|いそがしい", "忙", "いそがしい"],
        ["夕食|ゆうしょく", "夕", "ゆう"],
    ]);
});

test("tracked starter word data includes the fourth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["以内|いない", "以", "い"],
        ["入院|にゅういん", "院", "いん"],
        ["運動|うんどう", "運", "うん"],
        ["運ぶ|はこぶ", "運", "はこぶ"],
        ["映る|うつる", "映", "うつる"],
        ["英文|えいぶん", "英", "えい"],
        ["家族|かぞく", "家", "か"],
        ["歌う|うたう", "歌", "うたう"],
        ["計画|けいかく", "計", "けい"],
        ["計画|けいかく", "画", "かく"],
        ["図書館|としょかん", "館", "かん"],
        ["図書館|としょかん", "図", "と"],
        ["起こす|おこす", "起", "おこす"],
        ["急に|きゅうに", "急", "きゅう"],
        ["研究|けんきゅう", "研", "けん"],
        ["研究|けんきゅう", "究", "きゅう"],
        ["牛肉|ぎゅうにく", "牛", "ぎゅう"],
        ["去る|さる", "去", "さる"],
        ["建てる|たてる", "建", "たて"],
        ["公立|こうりつ", "公", "こう"],
        ["工場|こうじょう", "工", "こう"],
        ["銀色|ぎんいろ", "銀", "ぎん"],
        ["座席|ざせき", "座", "ざ"],
        ["作文|さくぶん", "作", "さく"],
        ["姉妹|しまい", "姉", "し"],
        ["質問|しつもん", "質", "しつ"],
        ["写真|しゃしん", "写", "しゃ"],
        ["主人|しゅじん", "主", "しゅ"],
        ["秋|あき", "秋", "あき"],
    ]);
});

test("tracked starter word data includes the fifth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["待つ|まつ", "待", "まつ"],
        ["待ち合わせ|まちあわせ", "待", "まち"],
        ["貸す|かす", "貸", "かす"],
        ["貸し出し|かしだし", "貸", "かし"],
        ["台|だい", "台", "だい"],
        ["題|だい", "題", "だい"],
        ["知る|しる", "知", "しる"],
        ["地図|ちず", "地", "ち"],
        ["地下鉄|ちかてつ", "地", "ち"],
        ["着る|きる", "着", "きる"],
        ["着く|つく", "着", "つく"],
        ["昼|ひる", "昼", "ひる"],
        ["注意|ちゅうい", "注", "ちゅう"],
        ["注文|ちゅうもん", "注", "ちゅう"],
        ["注文|ちゅうもん", "文", "もん"],
        ["茶色|ちゃいろ", "茶", "ちゃ"],
        ["町長|ちょうちょう", "町", "ちょう"],
        ["鳥|とり", "鳥", "とり"],
        ["食堂|しょくどう", "堂", "どう"],
        ["病気|びょうき", "病", "びょう"],
        ["使い方|つかいかた", "方", "かた"],
    ]);
});

test("tracked starter word data includes the sixth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["親切|しんせつ", "親", "しん"],
        ["親切|しんせつ", "切", "せつ"],
        ["世の中|よのなか", "世", "よ"],
        ["正午|しょうご", "正", "しょう"],
        ["切る|きる", "切", "きる"],
        ["大切|たいせつ", "切", "せつ"],
        ["多分|たぶん", "多", "た"],
        ["体|からだ", "体", "からだ"],
        ["体調|たいちょう", "体", "たい"],
        ["時代|じだい", "代", "だい"],
        ["知らせる|しらせる", "知", "しらせる"],
        ["競走|きょうそう", "走", "そう"],
        ["送る|おくる", "送", "おくる"],
        ["正しい|ただしい", "正", "ただしい"],
        ["試す|ためす", "試", "ためす"],
        ["試験|しけん", "験", "けん"],
        ["練習|れんしゅう", "習", "しゅう"],
        ["習う|ならう", "習", "ならう"],
        ["近所|きんじょ", "近", "きん"],
        ["郵便局|ゆうびんきょく", "局", "きょく"],
        ["自由|じゆう", "自", "じ"],
        ["集める|あつめる", "集", "あつめる"],
    ]);
});

test("tracked starter word data includes the seventh governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["不足|ふそく", "足", "そく"],
        ["主に|おもに", "主", "おも"],
        ["京都|きょうと", "京", "きょう"],
        ["会員|かいいん", "員", "いん"],
        ["会議室|かいぎしつ", "室", "しつ"],
        ["住所|じゅうしょ", "住", "じゅう"],
        ["住所|じゅうしょ", "所", "しょ"],
        ["作る|つくる", "作", "つくる"],
        ["借りる|かりる", "借", "かりる"],
        ["場所|ばしょ", "場", "ば"],
        ["夏休み|なつやすみ", "夏", "なつ"],
        ["始まる|はじまる", "始", "はじまる"],
        ["始める|はじめる", "始", "はじめる"],
        ["少ない|すくない", "少", "すくない"],
        ["教える|おしえる", "教", "おしえる"],
        ["教室|きょうしつ", "教", "きょう"],
        ["真ん中|まんなか", "真", "ま"],
        ["言葉|ことば", "言", "こと"],
        ["週末|しゅうまつ", "週", "しゅう"],
        ["音楽|おんがく", "音", "おん"],
        ["音楽|おんがく", "楽", "がく"],
        ["黒板|こくばん", "黒", "こく"],
    ]);
});

test("tracked starter word data includes the eighth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["悪い|わるい", "悪", "わるい"],
        ["医者|いしゃ", "医", "い"],
        ["医者|いしゃ", "者", "しゃ"],
        ["音|おと", "音", "おと"],
        ["漢字|かんじ", "漢", "かん"],
        ["漢字|かんじ", "字", "じ"],
        ["金魚|きんぎょ", "魚", "ぎょ"],
        ["強い|つよい", "強", "つよい"],
        ["授業|じゅぎょう", "業", "ぎょう"],
        ["空港|くうこう", "空", "くう"],
        ["言う|いう", "言", "いう"],
        ["中古|ちゅうこ", "古", "こ"],
        ["広い|ひろい", "広", "ひろい"],
        ["考える|かんがえる", "考", "かんがえる"],
        ["黒い|くろい", "黒", "くろい"],
        ["思う|おもう", "思", "おもう"],
        ["止まる|とまる", "止", "とまる"],
        ["止める|とめる", "止", "とめる"],
        ["死ぬ|しぬ", "死", "しぬ"],
        ["私|わたし", "私", "わたし"],
        ["紙|かみ", "紙", "かみ"],
        ["持つ|もつ", "持", "もつ"],
    ]);
});

test("tracked starter word data includes the ninth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["空|から", "空", "から"],
        ["元|もと", "元", "もと"],
        ["事|こと", "事", "こと"],
        ["気持ち|きもち", "持", "もち"],
        ["写す|うつす", "写", "うつす"],
        ["終わる|おわる", "終", "おわる"],
        ["最終|さいしゅう", "終", "しゅう"],
        ["集まる|あつまる", "集", "あつまる"],
        ["重い|おもい", "重", "おもい"],
        ["重要|じゅうよう", "重", "じゅう"],
        ["春|はる", "春", "はる"],
        ["所|ところ", "所", "ところ"],
        ["少し|すこし", "少", "すこし"],
        ["景色|けしき", "色", "しき"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["景色|けしき", "<ruby>景<rt>け</rt></ruby><ruby>色<rt>しき</rt></ruby>"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["親|おや", "親", "おや"],
        ["早い|はやい", "早", "はやい"],
        ["走る|はしる", "走", "はしる"],
        ["足|あし", "足", "あし"],
        ["多い|おおい", "多", "おおい"],
        ["仕える|つかえる", "仕", "つかえる"],
    ]);
});

test("tracked starter word data includes the tenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["屋|や", "屋", "や"],
        ["社会|しゃかい", "社", "しゃ"],
        ["青空|あおぞら", "青", "あお"],
        ["赤ちゃん|あかちゃん", "赤", "あか"],
        ["家|うち", "家", "うち"],
        ["花火|はなび", "火", "び"],
        ["終点|しゅうてん", "終", "しゅう"],
        ["事情|じじょう", "事", "じ"],
        ["集中|しゅうちゅう", "集", "しゅう"],
        ["会場|かいじょう", "会", "かい"],
        ["会場|かいじょう", "場", "じょう"],
        ["色|いろ", "色", "いろ"],
        ["人気|にんき", "人", "にん"],
        ["人気|にんき", "気", "き"],
    ]);
});

test("tracked starter word data includes the eleventh governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["悪口|わるくち", "悪", "わる"],
        ["開始|かいし", "開", "かい"],
        ["開始|かいし", "始", "し"],
        ["楽しむ|たのしむ", "楽", "たのしむ"],
        ["起こる|おこる", "起", "おこる"],
        ["歌手|かしゅ", "歌", "か"],
        ["帰国|きこく", "帰", "き"],
        ["仕事中|しごとちゅう", "仕", "し"],
        ["住民|じゅうみん", "住", "じゅう"],
        ["手伝う|てつだう", "手", "て"],
        ["買い物|かいもの", "買", "かい"],
        ["有名人|ゆうめいじん", "人", "じん"],
        ["青信号|あおしんごう", "青", "あお"],
        ["赤信号|あかしんごう", "赤", "あか"],
        ["古本|ふるほん", "古", "ふる"],
        ["歩道|ほどう", "歩", "ほ"],
        ["閉会|へいかい", "閉", "へい"],
    ]);
});

test("tracked starter word data includes the twelfth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["悪人|あくにん", "悪", "あく"],
        ["開会|かいかい", "開", "かい"],
        ["楽器|がっき", "楽", "がっ"],
        ["画家|がか", "画", "が"],
        ["映す|うつす", "映", "うつす"],
        ["家庭|かてい", "家", "か"],
        ["家賃|やちん", "家", "や"],
        ["館内|かんない", "館", "かん"],
        ["帰宅|きたく", "帰", "き"],
        ["急行|きゅうこう", "急", "きゅう"],
        ["魚屋|さかなや", "魚", "さかな"],
        ["花屋|はなや", "花", "はな"],
        ["本音|ほんね", "音", "ね"],
    ]);
});

test("tracked starter word data includes the thirteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["会計|かいけい", "計", "けい"],
        ["帰り道|かえりみち", "帰", "かえり"],
        ["帰り道|かえりみち", "道", "みち"],
        ["元々|もともと", "元", "もと"],
        ["元日|がんじつ", "元", "がん"],
        ["住まい|すまい", "住", "すまい"],
        ["寝室|しんしつ", "寝", "しん"],
        ["新年|しんねん", "新", "しん"],
        ["閉店|へいてん", "閉", "へい"],
        ["使い道|つかいみち", "使", "つかい"],
        ["使い道|つかいみち", "道", "みち"],
        ["夏服|なつふく", "服", "ふく"],
        ["近道|ちかみち", "近", "ちか"],
        ["売店|ばいてん", "売", "ばい"],
        ["売店|ばいてん", "店", "てん"],
        ["音色|ねいろ", "音", "ね"],
        ["音色|ねいろ", "色", "いろ"],
    ]);
});

test("tracked starter word data includes the fourteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["悪夢|あくむ", "悪", "あく"],
        ["近づく|ちかづく", "近", "ちか"],
        ["寝坊|ねぼう", "寝", "ね"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["寝坊|ねぼう", "<ruby>寝<rt>ね</rt></ruby><ruby>坊<rt>ぼう</rt></ruby>"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["仕方|しかた", "方", "かた"],
        ["勉強中|べんきょうちゅう", "勉", "べん"],
        ["勉強中|べんきょうちゅう", "強", "きょう"],
        ["会費|かいひ", "会", "かい"],
        ["売上|うりあげ", "売", "うり"],
        ["開店|かいてん", "開", "かい"],
        ["映画館|えいがかん", "映", "えい"],
        ["映画館|えいがかん", "館", "かん"],
    ]);
});

test("tracked starter word data includes the fifteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["明ける|あける", "明", "あける"],
        ["説明|せつめい", "明", "めい"],
        ["目的|もくてき", "目", "もく"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["目的|もくてき", "<ruby>目<rt>もく</rt></ruby><ruby>的<rt>てき</rt></ruby>"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["方法|ほうほう", "方", "ほう"],
        ["立てる|たてる", "立", "たてる"],
        ["国立|こくりつ", "立", "りつ"],
        ["立場|たちば", "立", "たち"],
        ["閉じる|とじる", "閉", "とじる"],
        ["旅|たび", "旅", "たび"],
        ["文化|ぶんか", "文", "ぶん"],
        ["問題|もんだい", "問", "もん"],
        ["別に|べつに", "別", "べつ"],
    ]);
});

test("tracked starter word data includes the sixteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["中止|ちゅうし", "止", "し"],
        ["出発|しゅっぱつ", "発", "ぱつ"],
        ["発音|はつおん", "発", "はつ"],
        ["普通|ふつう", "通", "つう"],
        ["通り|とおり", "通", "とおり"],
        ["空く|あく", "空", "あく"],
        ["空ける|あける", "空", "あける"],
        ["切れる|きれる", "切", "きれる"],
        ["交代|こうたい", "代", "たい"],
        ["代わり|かわり", "代", "かわり"],
        ["広告|こうこく", "広", "こう"],
        ["広がる|ひろがる", "広", "ひろがる"],
    ]);
});

test("tracked starter word data includes the seventeenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["家計|かけい", "家", "か"],
        ["飲料|いんりょう", "飲", "いん"],
        ["開き|ひらき", "開", "ひらき"],
        ["気楽|きらく", "楽", "らく"],
        ["観音|かんのん", "音", "のん"],
        ["屋上|おくじょう", "屋", "おく"],
        ["会釈|えしゃく", "会", "え"],
        ["力士|りきし", "力", "りき"],
        ["魚|うお", "魚", "うお"],
        ["牛|うし", "牛", "うし"],
    ]);
});

test("tracked starter word data includes the eighteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["教わる|おそわる", "教", "おそわる"],
        ["強まる|つよまる", "強", "つよまる"],
        ["強める|つよめる", "強", "つよめる"],
        ["最近|さいきん", "近", "きん"],
        ["母音|ぼいん", "音", "いん"],
        ["起立|きりつ", "起", "き"],
        ["初夏|しょか", "夏", "か"],
        ["帰す|かえす", "帰", "かえす"],
        ["作業|さぎょう", "業", "ぎょう"],
        ["用いる|もちいる", "用", "もちいる"],
    ]);
});

test("tracked starter word data includes the nineteenth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["開く|あく", "開", "あく"],
        ["問い|とい", "問", "とい"],
        ["問屋|とんや", "問", "とん"],
        ["手強い|てごわい", "強", "ごわい"],
        ["明朝|みょうちょう", "明", "みょう"],
        ["明朝|みょうちょう", "朝", "ちょう"],
    ]);
});

test("tracked starter word data includes the twentieth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["強引|ごういん", "強", "ごう"],
        ["建設|けんせつ", "建", "けん"],
        ["愛犬|あいけん", "犬", "けん"],
        ["言語|げんご", "言", "げん"],
        ["伝言|でんごん", "言", "ごん"],
        ["人口|じんこう", "口", "こう"],
        ["工夫|くふう", "工", "く"],
        ["参考|さんこう", "考", "こう"],
        ["使用|しよう", "使", "し"],
        ["用紙|ようし", "紙", "し"],
        ["持参|じさん", "持", "じ"],
        ["自然|しぜん", "自", "し"],
        ["質屋|しちや", "質", "しち"],
        ["借用|しゃくよう", "借", "しゃく"],
        ["選手|せんしゅ", "手", "しゅ"],
        ["青春|せいしゅん", "青", "せい"],
        ["青春|せいしゅん", "春", "しゅん"],
        ["売買|ばいばい", "買", "ばい"],
    ]);
});

test("tracked starter word data includes the twenty-first governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["商品|しょうひん", "品", "ひん"],
        ["多忙|たぼう", "忙", "ぼう"],
        ["特色|とくしょく", "色", "しょく"],
        ["早朝|そうちょう", "早", "そう"],
        ["郵送|ゆうそう", "送", "そう"],
        ["通知|つうち", "知", "ち"],
        ["白鳥|はくちょう", "鳥", "ちょう"],
        ["荷物|にもつ", "物", "もつ"],
        ["貴重|きちょう", "重", "ちょう"],
        ["期待|きたい", "待", "たい"],
        ["水田|すいでん", "田", "でん"],
        ["回答|かいとう", "答", "とう"],
        ["度々|たびたび", "度", "たび"],
        ["空き地|あきち", "空", "あき"],
        ["悪者|わるもの", "者", "もの"],
        ["貸切|かしきり", "切", "きり"],
        ["昼飯|ひるめし", "飯", "めし"],
        ["早速|さっそく", "早", "さっ"],
        ["支度|したく", "度", "たく"],
        ["過去|かこ", "去", "こ"],
    ]);
});

test("tracked starter word data includes the twenty-second governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["弟子|でし", "弟", "で"],
        ["喫茶店|きっさてん", "茶", "さ"],
        ["一切|いっさい", "切", "さい"],
        ["持ち主|もちぬし", "主", "ぬし"],
        ["風向き|かざむき", "風", "かざ"],
        ["献立|こんだて", "立", "だて"],
        ["新手|あらて", "新", "あら"],
        ["代物|しろもの", "代", "しろ"],
        ["面目|めんぼく", "目", "ぼく"],
        ["通行止め|つうこうどめ", "止", "どめ"],
        ["室町|むろまち", "室", "むろ"],
        ["仕業|しわざ", "業", "わざ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["通行止め|つうこうどめ", "<ruby>通<rt>つう</rt></ruby><ruby>行<rt>こう</rt></ruby><ruby>止<rt>ど</rt></ruby>め"],
    ]);
});

test("tracked starter word data includes the twenty-third governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["賃貸|ちんたい", "貸", "たい"],
        ["義兄|ぎけい", "兄", "けい"],
        ["神道|しんとう", "道", "とう"],
        ["不器用|ぶきよう", "不", "ぶ"],
        ["心掛け|こころがけ", "心", "こころ"],
        ["真心|まごころ", "心", "ごころ"],
        ["見通し|みとおし", "通", "とおし"],
        ["大通り|おおどおり", "通", "どおり"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["大通り|おおどおり", "<ruby>大<rt>おお</rt></ruby><ruby>通<rt>どお</rt></ruby>り"],
    ]);
});

test("tracked starter word data includes the twenty-fourth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["作り出す|つくりだす", "作", "つくり"],
        ["二階建て|にかいだて", "建", "だて"],
        ["急ぎ足|いそぎあし", "急", "いそぎ"],
        ["正夢|まさゆめ", "正", "まさ"],
        ["空く|すく", "空", "すく"],
        ["注ぐ|つぐ", "注", "つぐ"],
        ["研ぐ|とぐ", "研", "とぐ"],
        ["自ら|みずから", "自", "みずから"],
        ["足る|たる", "足", "たる"],
        ["発つ|たつ", "発", "たつ"],
        ["仮住まい|かりずまい", "住", "ずまい"],
        ["見習い|みならい", "習", "ならい"],
        ["映え|ばえ", "映", "ばえ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["仮住まい|かりずまい", "<ruby>仮<rt>かり</rt></ruby><ruby>住<rt>ず</rt></ruby>まい"],
    ]);
});

test("tracked starter word data includes the twenty-fifth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["目蓋|まぶた", "目", "ま"],
        ["止む|やむ", "止", "やむ"],
        ["止まる|とどまる", "止", "とどまる"],
        ["文|ふみ", "文", "ふみ"],
        ["青写真|あおじゃしん", "写", "じゃ"],
        ["明かり|あかり", "明", "あかり"],
        ["公|おおやけ", "公", "おおやけ"],
        ["持てる|もてる", "持", "もてる"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["目蓋|まぶた", "<ruby>目<rt>ま</rt></ruby><ruby>蓋<rt>ぶた</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twenty-sixth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["明かす|あかす", "明", "あかす"],
        ["明らか|あきらか", "明", "あきらか"],
        ["映える|はえる", "映", "はえる"],
        ["広げる|ひろげる", "広", "ひろげる"],
        ["広まる|ひろまる", "広", "ひろまる"],
        ["広める|ひろめる", "広", "ひろめる"],
        ["重なる|かさなる", "重", "かさなる"],
        ["重ねる|かさねる", "重", "かさねる"],
        ["終える|おえる", "終", "おえる"],
        ["集う|つどう", "集", "つどう"],
        ["計る|はかる", "計", "はかる"],
        ["空しい|むなしい", "空", "むなしい"],
        ["親しい|したしい", "親", "したしい"],
        ["親しむ|したしむ", "親", "したしむ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["重なる|かさなる", "<ruby>重<rt>かさ</rt></ruby>なる"],
    ]);
});

test("tracked starter word data keeps formal support words on harder decks", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["問う|とう"].jlpt, 2);
    assert.equal(starterEntries["問う|とう"].tags.includes("n2"), true);
    assert.equal(starterEntries["問う|とう"].coverage.coversReadings["問"], "とう");

    assert.equal(starterEntries["強いる|しいる"].jlpt, 1);
    assert.equal(starterEntries["強いる|しいる"].tags.includes("n1"), true);
    assert.equal(starterEntries["強いる|しいる"].coverage.coversReadings["強"], "しいる");

    assert.equal(starterEntries["建立|こんりゅう"].jlpt, 1);
    assert.equal(starterEntries["建立|こんりゅう"].tags.includes("n1"), true);
    assert.equal(starterEntries["建立|こんりゅう"].coverage.coversReadings["建"], "こん");
    assert.equal(starterEntries["建立|こんりゅう"].coverage.coversReadings["立"], "りゅう");

    assert.equal(starterEntries["友人|ゆうじん"].jlpt, 3);
    assert.equal(starterEntries["友人|ゆうじん"].tags.includes("n3"), true);
    assert.equal(starterEntries["友人|ゆうじん"].coverage.coversReadings["友"], "ゆう");

    assert.equal(starterEntries["読書|どくしょ"].jlpt, 3);
    assert.equal(starterEntries["読書|どくしょ"].tags.includes("n3"), true);
    assert.equal(starterEntries["読書|どくしょ"].coverage.coversReadings["読"], "どく");
    assert.equal(starterEntries["読書|どくしょ"].coverage.coversReadings["書"], "しょ");

    assert.equal(starterEntries["上昇|じょうしょう"].jlpt, 1);
    assert.equal(starterEntries["上昇|じょうしょう"].tags.includes("n1"), true);
    assert.equal(starterEntries["上昇|じょうしょう"].coverage.coversReadings["上"], "じょう");

    assert.equal(starterEntries["木刀|ぼくとう"].jlpt, 1);
    assert.equal(starterEntries["木刀|ぼくとう"].tags.includes("n1"), true);
    assert.equal(starterEntries["木刀|ぼくとう"].coverage.coversReadings["木"], "ぼく");

    assert.equal(starterEntries["出来上がり|できあがり"].jlpt, 2);
    assert.equal(starterEntries["出来上がり|できあがり"].tags.includes("n2"), true);
    assert.equal(starterEntries["出来上がり|できあがり"].coverage.coversReadings["来"], "き");
    assert.equal(starterEntries["出来上がり|できあがり"].coverage.coversReadings["上"], "あがり");

    assert.equal(starterEntries["女房|にょうぼう"].jlpt, 2);
    assert.equal(starterEntries["女房|にょうぼう"].tags.includes("n2"), true);
    assert.equal(starterEntries["女房|にょうぼう"].coverage.coversReadings["女"], "にょう");

    assert.equal(starterEntries["世間|せけん"].jlpt, 3);
    assert.equal(starterEntries["世間|せけん"].tags.includes("n3"), true);
    assert.equal(starterEntries["世間|せけん"].coverage.coversReadings["間"], "けん");

    assert.equal(starterEntries["行方|ゆくえ"].jlpt, 2);
    assert.equal(starterEntries["行方|ゆくえ"].tags.includes("n2"), true);
    assert.equal(starterEntries["行方|ゆくえ"].coverage.coversReadings["行"], "ゆく");

    assert.equal(starterEntries["白夜|びゃくや"].jlpt, 2);
    assert.equal(starterEntries["白夜|びゃくや"].tags.includes("n2"), true);
    assert.equal(starterEntries["白夜|びゃくや"].coverage.coversReadings["白"], "びゃく");
});

test("tracked starter word data includes the twenty-seventh governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["病み付き|やみつき", "病", "やみ"],
        ["足りる|たりる", "足", "たりる"],
        ["注ぐ|そそぐ", "注", "そそぐ"],
        ["通す|とおす", "通", "とおす"],
        ["動かす|うごかす", "動", "うごかす"],
        ["売れる|うれる", "売", "うれる"],
        ["歩む|あゆむ", "歩", "あゆむ"],
        ["着せる|きせる", "着", "きせる"],
        ["着ける|つける", "着", "つける"],
        ["代える|かえる", "代", "かえる"],
        ["代わる|かわる", "代", "かわる"],
        ["身代わり|みがわり", "代", "がわり"],
        ["転がる|ころがる", "転", "ころがる"],
        ["転がす|ころがす", "転", "ころがす"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["病み付き|やみつき", "<ruby>病<rt>や</rt></ruby>み<ruby>付<rt>つ</rt></ruby>き"],
    ]);
});

test("tracked starter word data includes the twenty-eighth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["京|みやこ", "京", "みやこ"],
        ["北京|ペキン", "京", "キン"],
        ["法度|はっと", "度", "と"],
        ["自業自得|じごうじとく", "業", "ごう"],
        ["主人|あるじ", "主人", "あるじ"],
        ["病|やまい", "病", "やまい"],
        ["会わせる|あわせる", "会", "あわせる"],
        ["開ける|ひらける", "開", "ひらける"],
        ["究める|きわめる", "究", "きわめる"],
        ["試みる|こころみる", "試", "こころみる"],
        ["正す|ただす", "正", "ただす"],
        ["足す|たす", "足", "たす"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["北京|ペキン", "<ruby>北<rt>ペ</rt></ruby><ruby>京<rt>キン</rt></ruby>"],
        ["主人|あるじ", "<ruby>主人<rt>あるじ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twenty-ninth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["京阪|けいはん", "京", "けい"],
        ["相部屋|あいべや", "部", "べ"],
        ["裏切り|うらぎり", "切", "ぎり"],
        ["夜通し|よどおし", "通", "どおし"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["夜通し|よどおし", "<ruby>夜<rt>よ</rt></ruby><ruby>通し<rt>どおし</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the thirtieth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["品切れ|しなぎれ", "切", "ぎれ"],
        ["以て|もって", "以", "もって"],
        ["止める|やめる", "止", "やめる"],
        ["病む|やむ", "病", "やむ"],
        ["空かす|すかす", "空", "すかす"],
        ["手作り|てづくり", "作", "づくり"],
        ["閉ざす|とざす", "閉", "とざす"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["品切れ|しなぎれ", "<ruby>品<rt>しな</rt></ruby><ruby>切れ<rt>ぎれ</rt></ruby>"],
        ["手作り|てづくり", "<ruby>手<rt>て</rt></ruby><ruby>作り<rt>づくり</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the thirty-first governed N4 support batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["寝かす|ねかす", "寝", "ねかす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["寝かす|ねかす", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["寝かす|ねかす", "<ruby>寝<rt>ね</rt></ruby>かす"],
    ]);
});

test("tracked starter word data includes the thirty-second governed N4 support batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["建つ|たつ", "建", "たつ"],
        ["行き止まり|いきどまり", "止", "どまり"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["建つ|たつ", "support"],
        ["行き止まり|いきどまり", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["建つ|たつ", "<ruby>建<rt>た</rt></ruby>つ"],
        ["行き止まり|いきどまり", "<ruby>行<rt>い</rt></ruby>き<ruby>止<rt>ど</rt></ruby>まり"],
    ]);
});

test("tracked starter word data includes the N4 source expansion pass without reject or defer rows", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ExpansionKeys = [
        "明日|あす",
        "安全|あんぜん",
        "以下|いか",
        "以外|いがい",
        "医学|いがく",
        "意見|いけん",
        "以上|いじょう",
        "一度|いちど",
        "田舎|いなか",
        "売り場|うりば",
        "運転手|うんてんしゅ",
        "贈り物|おくりもの",
        "思い出す|おもいだす",
        "終わり|おわり",
        "会議|かいぎ",
        "帰り|かえり",
        "火事|かじ",
        "方|かた",
        "機会|きかい",
        "着物|きもの",
        "急|きゅう",
        "教育|きょういく",
        "教会|きょうかい",
        "興味|きょうみ",
        "空気|くうき",
        "研究室|けんきゅうしつ",
        "交通|こうつう",
        "公務員|こうむいん",
        "心|こころ",
        "ご主人|ごしゅじん",
        "答|こたえ",
        "小鳥|ことり",
        "字|じ",
        "試合|しあい",
        "事故|じこ",
        "地震|じしん",
        "下着|したぎ",
        "品物|しなもの",
        "事務所|じむしょ",
        "習慣|しゅうかん",
        "柔道|じゅうどう",
        "趣味|しゅみ",
        "正月|しょうがつ",
        "食料品|しょくりょうひん",
        "神社|じんじゃ",
        "水道|すいどう",
        "卒業|そつぎょう",
        "大事|だいじ",
        "大体|だいたい",
        "楽しみ|たのしみ",
        "注射|ちゅうしゃ",
        "駐車場|ちゅうしゃじょう",
        "地理|ちり",
        "手袋|てぶくろ",
        "動物園|どうぶつえん",
        "特別|とくべつ",
        "特急|とっきゅう",
        "乗り物|のりもの",
        "場合|ばあい",
        "歯医者|はいしゃ",
        "美術館|びじゅつかん",
        "昼間|ひるま",
        "昼休み|ひるやすみ",
        "復習|ふくしゅう",
        "部長|ぶちょう",
        "文学|ぶんがく",
        "文法|ぶんぽう",
        "返事|へんじ",
        "漫画|まんが",
        "夕飯|ゆうはん",
        "用意|ようい",
        "用事|ようじ",
        "予習|よしゅう",
        "利用|りよう",
        "両方|りょうほう",
        "旅館|りょかん",
        "忘れ物|わすれもの",
    ];

    assert.equal(n4ExpansionKeys.length, 77);
    for (const key of n4ExpansionKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "jlptstudy.net-n4", key);
        assert.equal(starterEntries[key]?.coverage?.role, "both", key);
    }
    assert.equal(starterEntries["集る|あつまる"], undefined);
    assert.equal(starterEntries["楽む|たのしむ"], undefined);
    assert.equal(starterEntries["家内|かない"], undefined);
    assert.equal(starterEntries["役に立つ|やくにたつ"], undefined);
    assertCoverageReadings(starterEntries, [
        ["明日|あす", "明日", "あす"],
        ["田舎|いなか", "田舎", "いなか"],
        ["売り場|うりば", "売", "うり"],
        ["売り場|うりば", "場", "ば"],
        ["文法|ぶんぽう", "法", "ぽう"],
        ["歯医者|はいしゃ", "歯", "は"],
        ["歯医者|はいしゃ", "医", "い"],
        ["忘れ物|わすれもの", "忘", "わすれ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["明日|あす", "<ruby>明日<rt>あす</rt></ruby>"],
        ["田舎|いなか", "<ruby>田舎<rt>いなか</rt></ruby>"],
        ["歯医者|はいしゃ", "<ruby>歯<rt>は</rt></ruby><ruby>医<rt>い</rt></ruby><ruby>者<rt>しゃ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the first N5 enhancement batch without duplicate junk", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageRoles(starterEntries, [
        ["後|あと", "both"],
        ["男の子|おとこのこ", "both"],
        ["大人|おとな", "both"],
        ["白|しろ", "both"],
        ["千|せん", "both"],
        ["出かける|でかける", "both"],
        ["年|とし", "both"],
        ["半|はん", "both"],
        ["百|ひゃく", "both"],
        ["前|まえ", "both"],
        ["万|まん", "both"],
        ["五日|いつか", "both"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["後|あと", "後", "あと"],
        ["男の子|おとこのこ", "男", "おとこ"],
        ["男の子|おとこのこ", "子", "こ"],
        ["大人|おとな", "大人", "おとな"],
        ["白|しろ", "白", "しろ"],
        ["千|せん", "千", "せん"],
        ["出かける|でかける", "出", "で"],
        ["年|とし", "年", "とし"],
        ["半|はん", "半", "はん"],
        ["百|ひゃく", "百", "ひゃく"],
        ["前|まえ", "前", "まえ"],
        ["万|まん", "万", "まん"],
        ["五日|いつか", "五日", "いつか"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["男の子|おとこのこ", "<ruby>男<rt>おとこ</rt></ruby>の<ruby>子<rt>こ</rt></ruby>"],
        ["大人|おとな", "<ruby>大人<rt>おとな</rt></ruby>"],
        ["出かける|でかける", "<ruby>出<rt>で</rt></ruby>かける"],
        ["五日|いつか", "<ruby>五日<rt>いつか</rt></ruby>"],
    ]);
    assert.equal(starterEntries["万|まん"].exampleSentence.japanese, "一万まで数えます。");
});

test("tracked starter word data includes the second N5 enhancement batch without duplicate junk", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageRoles(starterEntries, [
        ["一日|いちにち", "both"],
        ["一緒|いっしょ", "both"],
        ["九日|ここのか", "both"],
        ["今週|こんしゅう", "both"],
        ["時計|とけい", "both"],
        ["大好き|だいすき", "both"],
        ["二十日|はつか", "both"],
        ["毎朝|まいあさ", "both"],
        ["毎晩|まいばん", "both"],
        ["三日|みっか", "both"],
        ["六日|むいか", "both"],
        ["四日|よっか", "both"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["一日|いちにち", "一", "いち"],
        ["一日|いちにち", "日", "にち"],
        ["一緒|いっしょ", "一", "いっ"],
        ["一緒|いっしょ", "緒", "しょ"],
        ["九日|ここのか", "九日", "ここのか"],
        ["今週|こんしゅう", "今", "こん"],
        ["今週|こんしゅう", "週", "しゅう"],
        ["時計|とけい", "時", "と"],
        ["時計|とけい", "計", "けい"],
        ["大好き|だいすき", "大", "だい"],
        ["大好き|だいすき", "好", "す"],
        ["二十日|はつか", "二十日", "はつか"],
        ["毎朝|まいあさ", "毎", "まい"],
        ["毎朝|まいあさ", "朝", "あさ"],
        ["毎晩|まいばん", "毎", "まい"],
        ["毎晩|まいばん", "晩", "ばん"],
        ["三日|みっか", "三日", "みっか"],
        ["六日|むいか", "六日", "むいか"],
        ["四日|よっか", "四日", "よっか"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["一日|いちにち", "<ruby>一<rt>いち</rt></ruby><ruby>日<rt>にち</rt></ruby>"],
        ["一緒|いっしょ", "<ruby>一<rt>いっ</rt></ruby><ruby>緒<rt>しょ</rt></ruby>"],
        ["九日|ここのか", "<ruby>九日<rt>ここのか</rt></ruby>"],
        ["今週|こんしゅう", "<ruby>今<rt>こん</rt></ruby><ruby>週<rt>しゅう</rt></ruby>"],
        ["時計|とけい", "<ruby>時<rt>と</rt></ruby><ruby>計<rt>けい</rt></ruby>"],
        ["大好き|だいすき", "<ruby>大<rt>だい</rt></ruby><ruby>好<rt>す</rt></ruby>き"],
        ["二十日|はつか", "<ruby>二十日<rt>はつか</rt></ruby>"],
        ["三日|みっか", "<ruby>三日<rt>みっか</rt></ruby>"],
        ["六日|むいか", "<ruby>六日<rt>むいか</rt></ruby>"],
        ["四日|よっか", "<ruby>四日<rt>よっか</rt></ruby>"],
    ]);
    assert.match(starterEntries["一日|いちにち"].notes, /distinguish from 一日\|ついたち/);
    assert.equal(starterEntries["大好き|だいすき"].exampleSentence.japanese, "日本語が大好きです。");
});

test("tracked starter word data includes the third N5 enhancement batch with higher-level labels", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageRoles(starterEntries, [
        ["大勢|おおぜい", "both"],
        ["お菓子|おかし", "both"],
        ["昨日|きのう", "both"],
        ["靴下|くつした", "both"],
        ["今朝|けさ", "both"],
        ["自分|じぶん", "both"],
        ["生徒|せいと", "both"],
        ["大使館|たいしかん", "both"],
        ["二十歳|はたち", "both"],
        ["飛行機|ひこうき", "both"],
        ["八百屋|やおや", "both"],
        ["廊下|ろうか", "both"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["大勢|おおぜい", "大", "おお"],
        ["大勢|おおぜい", "勢", "ぜい"],
        ["お菓子|おかし", "菓", "か"],
        ["お菓子|おかし", "子", "し"],
        ["昨日|きのう", "昨日", "きのう"],
        ["靴下|くつした", "靴", "くつ"],
        ["靴下|くつした", "下", "した"],
        ["今朝|けさ", "今朝", "けさ"],
        ["自分|じぶん", "自", "じ"],
        ["自分|じぶん", "分", "ぶん"],
        ["生徒|せいと", "生", "せい"],
        ["生徒|せいと", "徒", "と"],
        ["大使館|たいしかん", "大", "たい"],
        ["大使館|たいしかん", "使", "し"],
        ["大使館|たいしかん", "館", "かん"],
        ["二十歳|はたち", "二十歳", "はたち"],
        ["飛行機|ひこうき", "飛", "ひ"],
        ["飛行機|ひこうき", "行", "こう"],
        ["飛行機|ひこうき", "機", "き"],
        ["八百屋|やおや", "八百屋", "やおや"],
        ["廊下|ろうか", "廊", "ろう"],
        ["廊下|ろうか", "下", "か"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["大勢|おおぜい", "<ruby>大<rt>おお</rt></ruby><ruby>勢<rt>ぜい</rt></ruby>"],
        ["お菓子|おかし", "お<ruby>菓<rt>か</rt></ruby><ruby>子<rt>し</rt></ruby>"],
        ["昨日|きのう", "<ruby>昨日<rt>きのう</rt></ruby>"],
        ["靴下|くつした", "<ruby>靴<rt>くつ</rt></ruby><ruby>下<rt>した</rt></ruby>"],
        ["今朝|けさ", "<ruby>今朝<rt>けさ</rt></ruby>"],
        ["二十歳|はたち", "<ruby>二十歳<rt>はたち</rt></ruby>"],
        ["八百屋|やおや", "<ruby>八百屋<rt>やおや</rt></ruby>"],
    ]);
    assert.match(starterEntries["昨日|きのう"].notes, /whole-word reading/);
    assert.match(starterEntries["二十歳|はたち"].notes, /must not be split/);
    assert.equal(starterEntries["飛行機|ひこうき"].exampleSentence.japanese, "飛行機で行きます。");
});

test("tracked starter word data includes the final N5 source expansion keepers", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageRoles(starterEntries, [
        ["本棚|ほんだな", "both"],
        ["留学生|りゅうがくせい", "both"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["本棚|ほんだな", "本", "ほん"],
        ["本棚|ほんだな", "棚", "だな"],
        ["留学生|りゅうがくせい", "留", "りゅう"],
        ["留学生|りゅうがくせい", "学", "がく"],
        ["留学生|りゅうがくせい", "生", "せい"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["本棚|ほんだな", "<ruby>本<rt>ほん</rt></ruby><ruby>棚<rt>だな</rt></ruby>"],
        ["留学生|りゅうがくせい", "<ruby>留<rt>りゅう</rt></ruby><ruby>学<rt>がく</rt></ruby><ruby>生<rt>せい</rt></ruby>"],
    ]);
    assert.equal(starterEntries["本棚|ほんだな"].source, "jlptstudy.net-n5");
    assert.equal(starterEntries["留学生|りゅうがくせい"].source, "jlptstudy.net-n5");
    assert.match(starterEntries["本棚|ほんだな"].notes, /higher-level kanji/);
    assert.match(starterEntries["留学生|りゅうがくせい"].notes, /higher-level kanji/);
});

test("tracked starter word data carries explicit N5 reading-coverage contracts for key learner-facing words", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.deepEqual(starterEntries["今日|きょう"].coverage, {
        role: "both",
        focusKanji: ["今", "日"],
        coversReadings: {
            今日: "きょう",
        },
    });
    assertCoverageRoles(starterEntries, [
        ["休み時間|やすみじかん", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["時間|じかん", "間", "かん"],
        ["五分|ごふん", "分", "ふん"],
        ["午前|ごぜん", "前", "ぜん"],
        ["今月|こんげつ", "今", "こん"],
        ["月曜日|げつようび", "月", "げつ"],
        ["火曜日|かようび", "火", "か"],
        ["火曜日|かようび", "日", "び"],
        ["中|なか", "中", "なか"],
        ["下さい|ください", "下", "くださる"],
        ["外国|がいこく", "外", "がい"],
        ["外国|がいこく", "国", "こく"],
        ["金曜日|きんようび", "金", "きん"],
        ["九時|くじ", "九", "く"],
        ["高校|こうこう", "高", "こう"],
        ["七時|しちじ", "七", "しち"],
        ["食事|しょくじ", "食", "しょく"],
        ["電車|でんしゃ", "車", "しゃ"],
        ["電話|でんわ", "話", "わ"],
        ["土曜日|どようび", "土", "ど"],
        ["台所|だいどころ", "台", "だい"],
        ["台所|だいどころ", "所", "どころ"],
        ["東京|とうきょう", "東", "とう"],
        ["毎日|まいにち", "日", "にち"],
        ["木曜日|もくようび", "木", "もく"],
        ["日曜日|にちようび", "日", "にち"],
        ["来年|らいねん", "年", "ねん"],
        ["一人|ひとり", "人", "り"],
        ["上着|うわぎ", "上", "うわ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["有名|ゆうめい", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["有名|ゆうめい", "名", "めい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["帽子|ぼうし", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["帽子|ぼうし", "子", "し"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["彼女|かのじょ", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["彼女|かのじょ", "女", "じょ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["中国|ちゅうごく", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["中国|ちゅうごく", "中", "ちゅう"],
        ["二日|ふつか", "二日", "ふつか"],
        ["二時|にじ", "二", "に"],
        ["二時|にじ", "時", "じ"],
        ["地下|ちか", "下", "か"],
        ["上下|じょうげ", "下", "げ"],
        ["下手|へた", "手", "た"],
        ["外す|はずす", "外", "はずす"],
        ["入学|にゅうがく", "入", "にゅう"],
        ["大変|たいへん", "大", "たい"],
        ["火山|かざん", "山", "ざん"],
        ["社長|しゃちょう", "長", "ちょう"],
        ["十回|じっかい", "十", "じっ"],
        ["土地|とち", "土", "と"],
        ["名字|みょうじ", "名", "みょう"],
        ["葉書|はがき", "書", "がき"],
        ["三百|さんびゃく", "百", "びゃく"],
        ["左右|さゆう", "左", "さ"],
        ["左右|さゆう", "右", "ゆう"],
        ["見学|けんがく", "見", "けん"],
        ["雨戸|あまど", "雨", "あま"],
        ["北東|ほくとう", "北", "ほく"],
        ["見せる|みせる", "見", "みせる"],
        ["見る|みる", "見", "みる"],
        ["見える|みえる", "見", "みえる"],
        ["毎月|まいつき", "月", "つき"],
        ["名前|なまえ", "名", "な"],
        ["男子|だんし", "男", "だん"],
        ["手本|てほん", "本", "ほん"],
        ["母校|ぼこう", "母", "ぼ"],
        ["雨天|うてん", "雨", "う"],
        ["八日|ようか", "八", "よう"],
        ["校長|こうちょう", "校", "こう"],
        ["長男|ちょうなん", "男", "なん"],
        ["白米|はくまい", "白", "はく"],
        ["後半|こうはん", "後", "こう"],
        ["一日|ついたち", "一日", "ついたち"],
        ["後ほど|のちほど", "後", "のち"],
        ["行事|ぎょうじ", "行", "ぎょう"],
        ["南北|なんぼく", "南", "なん"],
        ["父母|ふぼ", "父", "ふ"],
        ["分かれる|わかれる", "分", "わかれる"],
        ["分ける|わける", "分", "わける"],
        ["休める|やすめる", "休", "やすめる"],
        ["下す|くだす", "下", "くだす"],
        ["生える|はえる", "生", "はえる"],
        ["休まる|やすまる", "休", "やすまる"],
        ["生け花|いけばな", "生", "いける"],
        ["西洋|せいよう", "西", "せい"],
        ["関西|かんさい", "西", "さい"],
        ["語る|かたる", "語", "かたる"],
        ["下町|したまち", "下", "した"],
        ["外科|げか", "外", "げ"],
        ["外れる|はずれる", "外", "はずれる"],
        ["行う|おこなう", "行", "おこなう"],
        ["生ビール|なまびーる", "生", "なま"],
        ["西瓜|すいか", "西", "すい"],
        ["椅子|いす", "子", "す"],
        ["半ば|なかば", "半", "なかば"],
        ["小指|こゆび", "小", "こ"],
        ["木陰|こかげ", "木", "こ"],
        ["春雨|はるさめ", "雨", "さめ"],
        ["女神|めがみ", "女", "め"],
        ["子年|ねどし", "子", "ね"],
        ["午年|うまどし", "午", "うま"],
        ["天の川|あまのがわ", "天", "あま"],
        ["河川|かせん", "川", "せん"],
        ["白髪|しらが", "白", "しら"],
        ["話|はなし", "話", "はなし"],
        ["後れる|おくれる", "後", "おくれる"],
        ["上り|のぼり", "上", "のぼり"],
        ["下り|くだり", "下", "くだり"],
        ["左折|させつ", "左", "さ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["新聞|しんぶん", "both"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["新聞|しんぶん", "聞", "ぶん"],
        ["母語|ぼご", "母", "ぼ"],
        ["小川|おがわ", "小", "お"],
        ["小雨|こさめ", "雨", "さめ"],
        ["円高|えんだか", "高", "だか"],
        ["来い|こい", "来", "こ"],
        ["金具|かなぐ", "金", "かな"],
        ["黄金|おうごん", "金", "ごん"],
        ["食う|くう", "食", "くう"],
        ["女房|にょうぼう", "女", "にょう"],
        ["白夜|びゃくや", "白", "びゃく"],
        ["足下|あしもと", "下", "もと"],
        ["出来上がり|できあがり", "上", "あがり"],
        ["一生|いっしょう", "生", "しょう"],
        ["行方|ゆくえ", "行", "ゆく"],
        ["生地|きじ", "生", "き"],
        ["生地|きじ", "地", "じ"],
        ["生やす|はやす", "生", "はやす"],
        ["火照る|ほてる", "火", "ほ"],
        ["生かす|いかす", "生", "いかす"],
        ["眼鏡|めがね", "鏡", "がね"],
        ["断食|だんじき", "食", "じき"],
        ["手間|てま", "間", "ま"],
        ["白紙|はくし", "白", "はく"],
        ["音読|おんどく", "読", "どく"],
        ["万事|ばんじ", "万", "ばん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["四月|しがつ", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["四月|しがつ", "四", "し"],
        ["五月|ごがつ", "月", "がつ"],
        ["七日|なのか", "七", "なの"],
        ["七日|なのか", "日", "か"],
        ["十日|とおか", "十", "とお"],
    ]);
});
