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
        ["作文|さくぶん", "作", "さ"],
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
        ["花火|はなび", "花", "か"],
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
        ["楽器|がっき", "楽", "がく"],
        ["画家|がか", "画", "が"],
        ["映す|うつす", "映", "うつす"],
        ["家庭|かてい", "家", "か"],
        ["家賃|やちん", "家", "や"],
        ["館内|かんない", "館", "かん"],
        ["帰宅|きたく", "帰", "き"],
        ["急行|きゅうこう", "急", "きゅう"],
        ["魚屋|さかなや", "魚", "ざかな"],
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
        ["出発|しゅっぱつ", "発", "はつ"],
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
        ["家計|かけい", "家", "け"],
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
        ["問う|とう", "問", "とう"],
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
        ["手強い|てごわい", "強", "こわい"],
        ["観音開き|かんのんびらき", "開", "びらき"],
        ["夏毛|なつげ", "夏", "げ"],
        ["音信|いんしん", "音", "いん"],
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
        ["思想|しそう", "思", "し"],
        ["用紙|ようし", "紙", "し"],
        ["持参|じさん", "持", "じ"],
        ["自然|しぜん", "自", "し"],
        ["質屋|しちや", "質", "しち"],
        ["借用|しゃくよう", "借", "しゃく"],
        ["選手|せんしゅ", "手", "しゅ"],
        ["秋分|しゅうぶん", "秋", "しゅう"],
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
        ["師弟|してい", "弟", "てい"],
        ["嫌悪|けんお", "悪", "お"],
        ["義兄|ぎけい", "兄", "けい"],
        ["体裁|ていさい", "体", "てい"],
        ["神道|しんとう", "道", "とう"],
        ["不器用|ぶきよう", "不", "ぶ"],
        ["歩合|ぶあい", "歩", "ぶ"],
        ["建立|こんりゅう", "建", "こん"],
        ["建立|こんりゅう", "立", "りゅう"],
        ["給仕|きゅうじ", "仕", "じ"],
        ["今夕|こんせき", "夕", "せき"],
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
        ["明くる日|あくるひ", "明", "あくる"],
        ["正夢|まさゆめ", "正", "まさ"],
        ["空く|すく", "空", "すく"],
        ["注ぐ|つぐ", "注", "つぐ"],
        ["研ぐ|とぐ", "研", "とぐ"],
        ["自ら|みずから", "自", "みずから"],
        ["足る|たる", "足", "たる"],
        ["発つ|たつ", "発", "たつ"],
        ["仮住まい|かりずまい", "住", "ずまい"],
        ["見習い|みならい", "習", "ならい"],
        ["八重|やえ", "重", "え"],
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
        ["新妻|にいづま", "新", "にい"],
        ["文|ふみ", "文", "ふみ"],
        ["大字|おおあざ", "字", "あざ"],
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
        ["強いる|しいる", "強", "しいる"],
        ["空しい|むなしい", "空", "むなしい"],
        ["親しい|したしい", "親", "したしい"],
        ["親しむ|したしむ", "親", "したしむ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["重なる|かさなる", "<ruby>重<rt>かさ</rt></ruby>なる"],
    ]);
});

test("tracked starter word data includes the twenty-seventh governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["千代|ちよ", "代", "よ"],
        ["病み付き|やみつき", "病", "やみ"],
        ["白銀|しろがね", "銀", "しろがね"],
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
        ["南京|なんきん", "京", "きん"],
        ["北京|ペキン", "京", "キン"],
        ["明朝|みんちょう", "明", "みん"],
        ["法度|はっと", "度", "と"],
        ["自業自得|じごうじとく", "業", "ごう"],
        ["愛猫|あいびょう", "猫", "びょう"],
        ["主人|あるじ", "主", "あるじ"],
        ["病|やまい", "病", "やまい"],
        ["会わせる|あわせる", "会", "あわせる"],
        ["開ける|ひらける", "開", "ひらける"],
        ["究める|きわめる", "究", "きわめる"],
        ["計らう|はからう", "計", "はからう"],
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
        ["緑青|ろくしょう", "青", "しょう"],
        ["験担ぎ|げんかつぎ", "験", "げん"],
        ["店子|たなこ", "店", "たな"],
        ["仮字|かな", "字", "な"],
        ["相部屋|あいべや", "部", "べ"],
        ["創世記|そうせいき", "世", "そう"],
        ["大社|おおやしろ", "社", "やしろ"],
        ["転寝|うたたね", "転", "うたた"],
        ["裏切り|うらぎり", "切", "ぎり"],
        ["夜通し|よどおし", "通", "どおし"],
        ["赤銅|しゃくどう", "赤", "しゃく"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["夜通し|よどおし", "<ruby>夜<rt>よ</rt></ruby><ruby>通<rt>どお</rt></ruby>し"],
    ]);
});

test("tracked starter word data includes the thirtieth governed N4 completion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["品切れ|しなぎれ", "切", "ぎれ"],
        ["以て|もって", "以", "もって"],
        ["止す|よす", "止", "よす"],
        ["止める|やめる", "止", "やめる"],
        ["病む|やむ", "病", "やむ"],
        ["空かす|すかす", "空", "すかす"],
        ["手作り|てづくり", "作", "づくり"],
        ["閉ざす|とざす", "閉", "とざす"],
        ["明るむ|あかるむ", "明", "あかるむ"],
        ["自ずと|おのずと", "自", "おのずと"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["品切れ|しなぎれ", "<ruby>品<rt>しな</rt></ruby><ruby>切<rt>ぎ</rt></ruby>れ"],
        ["手作り|てづくり", "<ruby>手<rt>て</rt></ruby><ruby>作<rt>づく</rt></ruby>り"],
        ["自ずと|おのずと", "<ruby>自<rt>おの</rt></ruby>ずと"],
    ]);
});

test("tracked starter word data includes the thirty-first governed N4 support batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["急く|せく", "急", "せく"],
        ["寝かす|ねかす", "寝", "ねかす"],
        ["転げる|ころげる", "転", "ころげる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["急く|せく", "support"],
        ["寝かす|ねかす", "support"],
        ["転げる|ころげる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["急く|せく", "<ruby>急<rt>せ</rt></ruby>く"],
        ["寝かす|ねかす", "<ruby>寝<rt>ね</rt></ruby>かす"],
        ["転げる|ころげる", "<ruby>転<rt>ころ</rt></ruby>げる"],
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
    assertCoverageRoles(starterEntries, [
        ["休み時間|やすみじかん", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["時間|じかん", "間", "かん"],
        ["五分|ごふん", "分", "ふん"],
        ["午前|ごぜん", "前", "ぜん"],
        ["今月|こんげつ", "今", "こん"],
        ["友人|ゆうじん", "友", "ゆう"],
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
        ["東京|とうきょう", "東", "とう"],
        ["読書|どくしょ", "読", "どく"],
        ["読書|どくしょ", "書", "しょ"],
        ["毎日|まいにち", "日", "にち"],
        ["木曜日|もくようび", "木", "もく"],
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
        ["二日|ふつか", "日", "か"],
        ["二時|にじ", "二", "じ"],
        ["地下|ちか", "下", "か"],
        ["上下|じょうげ", "下", "げ"],
        ["下手|へた", "手", "た"],
        ["外す|はずす", "外", "はずす"],
        ["入学|にゅうがく", "入", "にゅう"],
        ["大変|たいへん", "大", "たい"],
        ["火山|かざん", "山", "さん"],
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
        ["手本|てほん", "本", "もと"],
        ["母校|ぼこう", "母", "ぼ"],
        ["雨天|うてん", "雨", "う"],
        ["八日|ようか", "八", "よう"],
        ["校長|こうちょう", "校", "きょう"],
        ["長男|ちょうなん", "男", "なん"],
        ["白米|はくまい", "白", "はく"],
        ["後半|こうはん", "後", "こう"],
        ["一日|ついたち", "一", "いつ"],
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
        ["下町|したまち", "下", "しも"],
        ["外科|げか", "外", "げ"],
        ["外れる|はずれる", "外", "はずれる"],
        ["行う|おこなう", "行", "おこなう"],
        ["生ビール|なまびーる", "生", "なま"],
        ["西瓜|すいか", "西", "す"],
        ["椅子|いす", "子", "す"],
        ["気配|けはい", "気", "け"],
        ["世間|せけん", "間", "けん"],
        ["半ば|なかば", "半", "なかば"],
        ["小指|こゆび", "小", "こ"],
        ["木刀|ぼくとう", "木", "ぼく"],
        ["木陰|こかげ", "木", "こ"],
        ["春雨|はるさめ", "雨", "さめ"],
        ["女神|めがみ", "女", "め"],
        ["子年|ねどし", "子", "ね"],
        ["午年|うまどし", "午", "うま"],
        ["天の川|あまのがわ", "天", "あま"],
        ["天気雨|てんきあめ", "天", "あめ"],
        ["河川|かせん", "川", "せん"],
        ["白髪|しらが", "白", "しら"],
        ["話|はなし", "話", "はなし"],
        ["後れる|おくれる", "後", "おくれる"],
        ["上り|のぼり", "上", "のぼり"],
        ["下り|くだり", "下", "くだり"],
        ["左折|させつ", "左", "しゃ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["新聞|しんぶん", "both"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["新聞|しんぶん", "聞", "ぶん"],
        ["母語|ぼご", "母", "も"],
        ["小川|おがわ", "小", "お"],
        ["小雨|こさめ", "小", "さ"],
        ["円高|えんだか", "高", "だか"],
        ["来い|こい", "来", "こ"],
        ["金具|かなぐ", "金", "かな"],
        ["黄金|おうごん", "金", "ごん"],
        ["食う|くう", "食", "くう"],
        ["上座|かみざ", "上", "かみ"],
        ["女房|にょうぼう", "女", "にょう"],
        ["白夜|びゃくや", "白", "びゃく"],
        ["足下|あしもと", "下", "もと"],
        ["出来上がり|できあがり", "上", "あがり"],
        ["一生|いっしょう", "生", "しょう"],
        ["上昇|じょうしょう", "上", "しょう"],
        ["行方|ゆくえ", "行", "ゆく"],
        ["生地|きじ", "生", "き"],
        ["生地|きじ", "地", "じ"],
        ["生やす|はやす", "生", "はやす"],
        ["火照る|ほてる", "火", "ほ"],
        ["生かす|いかす", "生", "いかす"],
        ["眼鏡|めがね", "金", "がね"],
        ["断食|だんじき", "食", "じき"],
        ["手間|てま", "間", "ま"],
        ["白紙|はくし", "白", "はく"],
        ["音読|おんどく", "読", "とう"],
        ["万事|ばんじ", "万", "ばん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["四月|しがつ", "support"],
    ]);
    assertCoverageReadings(starterEntries, [
        ["四月|しがつ", "四", "し"],
        ["五月|ごがつ", "月", "がつ"],
        ["七日|なのか", "七", "なの"],
        ["十日|とおか", "十", "とお"],
    ]);
});
