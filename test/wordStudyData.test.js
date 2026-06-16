const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildWordCoverageContractSummary,
    buildWordStudyDataStalenessReport,
    loadWordStudyData,
    buildWordStudyEntryKey,
    formatWordStudyDataOverlayProvenance,
    formatWordStudyDataStalenessWarning,
    isStarterDerivedEntry,
    normalizeWordStudyData,
    refreshStarterEntries,
    resolveTrackedStarterPaths,
} = require("../src/datasets/wordStudyData");
const { bootstrapWordStudyData } = require("../src/services/wordStudyBootstrapService");

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

test("tracked starter word data resolves per-level split files deterministically", () => {
    const starterPaths = resolveTrackedStarterPaths({
        starterPath: STARTER_WORD_STUDY_DATA_PATH,
    });
    const starterEntries = loadTrackedStarterWordEntries();
    const countsByLevel = Object.values(starterEntries)
        .reduce((counts, entry) => ({
            ...counts,
            [entry.jlpt]: (counts[entry.jlpt] || 0) + 1,
        }), {});

    assert.deepEqual(
        starterPaths.map((entryPath) => path.basename(entryPath)),
        [
            "starter_word_study_data.json",
            "starter_word_study_data_n1.json",
            "starter_word_study_data_n2.json",
            "starter_word_study_data_n3.json",
            "starter_word_study_data_n4.json",
            "starter_word_study_data_n5.json",
        ]
    );
    assert.equal(Object.keys(starterEntries).length, 1974);
    assert.deepEqual(countsByLevel, {
        1: 26,
        2: 28,
        3: 913,
        4: 700,
        5: 307,
    });
});

test("loadWordStudyData merges base and per-level word starter files", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-study-split-loader-"));
    const starterPath = path.join(rootDir, "starter_word_study_data.json");
    const n5Path = path.join(rootDir, "starter_word_study_data_n5.json");
    const n4Path = path.join(rootDir, "starter_word_study_data_n4.json");
    try {
        fs.writeFileSync(starterPath, `${JSON.stringify({
            "一|いち": {
                written: "一",
                reading: "いち",
                meaning: "one",
                source: "word-study-data",
                tags: ["starter", "n5"],
                jlpt: 5,
            },
        }, null, 2)}\n`);
        fs.writeFileSync(n5Path, `${JSON.stringify({
            "二|に": {
                written: "二",
                reading: "に",
                meaning: "two",
                source: "word-study-data",
                tags: ["starter", "n5"],
                jlpt: 5,
            },
        }, null, 2)}\n`);
        fs.writeFileSync(n4Path, `${JSON.stringify({
            "計画|けいかく": {
                written: "計画",
                reading: "けいかく",
                meaning: "plan",
                source: "word-study-data",
                tags: ["starter", "n4"],
                jlpt: 4,
            },
        }, null, 2)}\n`);

        const starterEntries = loadWordStudyData({
            starterPath,
            localPath: null,
        });

        assert.deepEqual(Object.keys(starterEntries), [
            "一|いち",
            "二|に",
            "計画|けいかく",
        ]);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test("tracked starter word data includes the first governed N4 source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["番組|ばんぐみ", "番", "ばん"],
        ["番組|ばんぐみ", "組", "ぐみ"],
        ["市民|しみん", "市", "し"],
        ["市民|しみん", "民", "みん"],
        ["首|くび", "首", "くび"],
        ["専門|せんもん", "専", "せん"],
        ["専門|せんもん", "門", "もん"],
        ["光|ひかり", "光", "ひかり"],
        ["森|もり", "森", "もり"],
        ["進む|すすむ", "進", "すすむ"],
        ["回る|まわる", "回", "まわる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["番組|ばんぐみ", "both"],
        ["市民|しみん", "both"],
        ["首|くび", "both"],
        ["専門|せんもん", "both"],
        ["光|ひかり", "both"],
        ["森|もり", "both"],
        ["進む|すすむ", "both"],
        ["回る|まわる", "both"],
    ]);
});

test("tracked starter word data includes the first governed routed N4 move-candidate batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    for (const key of [
        "牛乳|ぎゅうにゅう",
        "果物|くだもの",
        "紅茶|こうちゃ",
        "好き|すき",
        "洗濯|せんたく",
        "全部|ぜんぶ",
        "建物|たてもの",
        "手紙|てがみ",
    ]) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "jlptstudy.net-n5", key);
        assert.equal(starterEntries[key]?.coverage?.role, "both", key);
        assert.equal(starterEntries[key]?.tags?.includes("n4"), true, key);
    }

    assertCoverageReadings(starterEntries, [
        ["牛乳|ぎゅうにゅう", "牛", "ぎゅう"],
        ["牛乳|ぎゅうにゅう", "乳", "にゅう"],
        ["果物|くだもの", "果", "くだ"],
        ["果物|くだもの", "物", "もの"],
        ["紅茶|こうちゃ", "紅", "こう"],
        ["紅茶|こうちゃ", "茶", "ちゃ"],
        ["好き|すき", "好", "す"],
        ["洗濯|せんたく", "洗", "せん"],
        ["洗濯|せんたく", "濯", "たく"],
        ["全部|ぜんぶ", "全", "ぜん"],
        ["全部|ぜんぶ", "部", "ぶ"],
        ["建物|たてもの", "建", "たて"],
        ["建物|たてもの", "物", "もの"],
        ["手紙|てがみ", "手", "て"],
        ["手紙|てがみ", "紙", "がみ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["牛乳|ぎゅうにゅう", "<ruby>牛<rt>ぎゅう</rt></ruby><ruby>乳<rt>にゅう</rt></ruby>"],
        ["果物|くだもの", "<ruby>果<rt>くだ</rt></ruby><ruby>物<rt>もの</rt></ruby>"],
        ["紅茶|こうちゃ", "<ruby>紅<rt>こう</rt></ruby><ruby>茶<rt>ちゃ</rt></ruby>"],
        ["手紙|てがみ", "<ruby>手<rt>て</rt></ruby><ruby>紙<rt>がみ</rt></ruby>"],
    ]);
    assert.match(starterEntries["牛乳|ぎゅうにゅう"].notes, /乳 is harder N2 support/);
    assert.match(starterEntries["果物|くだもの"].notes, /果 is harder N3 support/);
    assert.match(starterEntries["紅茶|こうちゃ"].notes, /紅 is harder N2 support/);
    assert.match(starterEntries["洗濯|せんたく"].notes, /濯 is harder N2 support/);
    assert.match(starterEntries["手紙|てがみ"].notes, /手 -> て and 紙 -> がみ/);
});

test("tracked starter word data includes the second governed routed N4 move-candidate batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    for (const key of [
        "夏|なつ",
        "番号|ばんごう",
        "服|ふく",
        "文章|ぶんしょう",
        "便利|べんり",
        "両親|りょうしん",
        "お兄さん|おにいさん",
        "お姉さん|おねえさん",
    ]) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "jlptstudy.net-n5", key);
        assert.equal(starterEntries[key]?.coverage?.role, "both", key);
        assert.equal(starterEntries[key]?.tags?.includes("n4"), true, key);
    }

    assertCoverageReadings(starterEntries, [
        ["夏|なつ", "夏", "なつ"],
        ["番号|ばんごう", "番", "ばん"],
        ["番号|ばんごう", "号", "ごう"],
        ["服|ふく", "服", "ふく"],
        ["文章|ぶんしょう", "文", "ぶん"],
        ["文章|ぶんしょう", "章", "しょう"],
        ["便利|べんり", "便", "べん"],
        ["便利|べんり", "利", "り"],
        ["両親|りょうしん", "両", "りょう"],
        ["両親|りょうしん", "親", "しん"],
        ["お兄さん|おにいさん", "兄", "にい"],
        ["お姉さん|おねえさん", "姉", "ねえ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["夏|なつ", "<ruby>夏<rt>なつ</rt></ruby>"],
        ["番号|ばんごう", "<ruby>番<rt>ばん</rt></ruby><ruby>号<rt>ごう</rt></ruby>"],
        ["文章|ぶんしょう", "<ruby>文<rt>ぶん</rt></ruby><ruby>章<rt>しょう</rt></ruby>"],
        ["お兄さん|おにいさん", "お<ruby>兄<rt>にい</rt></ruby>さん"],
        ["お姉さん|おねえさん", "お<ruby>姉<rt>ねえ</rt></ruby>さん"],
    ]);
    assert.match(starterEntries["番号|ばんごう"].notes, /号 is harder N3 support/);
    assert.match(starterEntries["文章|ぶんしょう"].notes, /章 is harder N2 support/);
    assert.match(starterEntries["両親|りょうしん"].notes, /両 is harder N3 support/);
    assert.match(starterEntries["お兄さん|おにいさん"].notes, /兄 -> にい/);
    assert.match(starterEntries["お姉さん|おねえさん"].notes, /姉 -> ねえ/);
});

test("tracked starter word data includes the third governed routed N4 move-candidate batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    for (const key of [
        "青|あお",
        "赤|あか",
        "黄色|きいろ",
        "黄色い|きいろい",
        "黒|くろ",
        "お手洗い|おてあらい",
        "お風呂|おふろ",
        "風邪|かぜ",
    ]) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "jlptstudy.net-n5", key);
        assert.equal(starterEntries[key]?.coverage?.role, "both", key);
        assert.equal(starterEntries[key]?.tags?.includes("n4"), true, key);
    }

    assertCoverageReadings(starterEntries, [
        ["青|あお", "青", "あお"],
        ["赤|あか", "赤", "あか"],
        ["黄色|きいろ", "黄", "き"],
        ["黄色|きいろ", "色", "いろ"],
        ["黄色い|きいろい", "黄", "き"],
        ["黄色い|きいろい", "色", "いろ"],
        ["黒|くろ", "黒", "くろ"],
        ["お手洗い|おてあらい", "手", "て"],
        ["お手洗い|おてあらい", "洗", "あら"],
        ["お風呂|おふろ", "風", "ふ"],
        ["お風呂|おふろ", "呂", "ろ"],
        ["風邪|かぜ", "風邪", "かぜ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["青|あお", "<ruby>青<rt>あお</rt></ruby>"],
        ["赤|あか", "<ruby>赤<rt>あか</rt></ruby>"],
        ["黄色|きいろ", "<ruby>黄<rt>き</rt></ruby><ruby>色<rt>いろ</rt></ruby>"],
        ["黄色い|きいろい", "<ruby>黄<rt>き</rt></ruby><ruby>色<rt>いろ</rt></ruby>い"],
        ["お手洗い|おてあらい", "お<ruby>手<rt>て</rt></ruby><ruby>洗<rt>あら</rt></ruby>い"],
        ["お風呂|おふろ", "お<ruby>風<rt>ふ</rt></ruby><ruby>呂<rt>ろ</rt></ruby>"],
        ["風邪|かぜ", "<ruby>風邪<rt>かぜ</rt></ruby>"],
    ]);
    assert.match(starterEntries["黄色|きいろ"].notes, /黄 is harder N3 support/);
    assert.match(starterEntries["黄色い|きいろい"].notes, /黄 is harder N3 support/);
    assert.match(starterEntries["お風呂|おふろ"].notes, /呂 is harder N1 support/);
    assert.match(starterEntries["風邪|かぜ"].notes, /whole-word reading/);
});

test("tracked starter word data includes the final governed routed N4 move-candidate batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    for (const key of [
        "花瓶|かびん",
        "交番|こうばん",
        "字引|じびき",
        "背広|せびろ",
        "近く|ちかく",
        "とり肉|とりにく",
        "豚肉|ぶたにく",
        "門|もん",
        "昨夜|ゆうべ",
    ]) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "jlptstudy.net-n5", key);
        assert.equal(starterEntries[key]?.coverage?.role, "both", key);
        assert.equal(starterEntries[key]?.tags?.includes("n4"), true, key);
    }

    assertCoverageReadings(starterEntries, [
        ["花瓶|かびん", "花", "か"],
        ["花瓶|かびん", "瓶", "びん"],
        ["交番|こうばん", "交", "こう"],
        ["交番|こうばん", "番", "ばん"],
        ["字引|じびき", "字", "じ"],
        ["字引|じびき", "引", "びき"],
        ["背広|せびろ", "背", "せ"],
        ["背広|せびろ", "広", "びろ"],
        ["近く|ちかく", "近", "ちか"],
        ["とり肉|とりにく", "肉", "にく"],
        ["豚肉|ぶたにく", "豚", "ぶた"],
        ["豚肉|ぶたにく", "肉", "にく"],
        ["門|もん", "門", "もん"],
        ["昨夜|ゆうべ", "昨夜", "ゆうべ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["花瓶|かびん", "<ruby>花<rt>か</rt></ruby><ruby>瓶<rt>びん</rt></ruby>"],
        ["字引|じびき", "<ruby>字<rt>じ</rt></ruby><ruby>引<rt>びき</rt></ruby>"],
        ["近く|ちかく", "<ruby>近<rt>ちか</rt></ruby>く"],
        ["とり肉|とりにく", "とり<ruby>肉<rt>にく</rt></ruby>"],
        ["昨夜|ゆうべ", "<ruby>昨夜<rt>ゆうべ</rt></ruby>"],
    ]);
    assert.match(starterEntries["花瓶|かびん"].notes, /瓶 is harder N2 support/);
    assert.match(starterEntries["交番|こうばん"].notes, /交 is harder N3 support/);
    assert.match(starterEntries["背広|せびろ"].notes, /背 is harder N3 support/);
    assert.match(starterEntries["豚肉|ぶたにく"].notes, /豚 is harder N1 support/);
    assert.match(starterEntries["昨夜|ゆうべ"].notes, /whole-word reading/);
});

test("tracked starter word data includes the first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["愛|あい", "愛", "あい"],
        ["愛情|あいじょう", "愛", "あい"],
        ["愛情|あいじょう", "情", "じょう"],
        ["愛する|あいする", "愛", "あい"],
        ["相手|あいて", "相", "あい"],
        ["預ける|あずける", "預", "あずける"],
        ["与える|あたえる", "与", "あたえる"],
        ["辺り|あたり", "辺", "あたり"],
        ["当たる|あたる", "当", "あたる"],
        ["当てる|あてる", "当", "あてる"],
        ["油|あぶら", "油", "あぶら"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["愛|あい", "both"],
        ["愛情|あいじょう", "both"],
        ["愛する|あいする", "both"],
        ["相手|あいて", "both"],
        ["預ける|あずける", "both"],
        ["与える|あたえる", "both"],
        ["辺り|あたり", "both"],
        ["当たる|あたる", "both"],
        ["当てる|あてる", "both"],
        ["油|あぶら", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["愛|あい", "<ruby>愛<rt>あい</rt></ruby>"],
        ["愛情|あいじょう", "<ruby>愛<rt>あい</rt></ruby><ruby>情<rt>じょう</rt></ruby>"],
        ["愛する|あいする", "<ruby>愛<rt>あい</rt></ruby>する"],
        ["相手|あいて", "<ruby>相<rt>あい</rt></ruby><ruby>手<rt>て</rt></ruby>"],
        ["預ける|あずける", "<ruby>預<rt>あず</rt></ruby>ける"],
        ["与える|あたえる", "<ruby>与<rt>あた</rt></ruby>える"],
        ["辺り|あたり", "<ruby>辺<rt>あた</rt></ruby>り"],
        ["当たる|あたる", "<ruby>当<rt>あ</rt></ruby>たる"],
        ["当てる|あてる", "<ruby>当<rt>あ</rt></ruby>てる"],
        ["油|あぶら", "<ruby>油<rt>あぶら</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["余り|あまり", "余", "あまり"],
        ["誤り|あやまり", "誤", "あやまり"],
        ["表す|あらわす", "表", "あらわす"],
        ["現す|あらわす", "現", "あらわす"],
        ["現れ|あらわれ", "現", "あらわれ"],
        ["現れる|あらわれる", "現", "あらわれる"],
        ["息|いき", "息", "いき"],
        ["幾つ|いくつ", "幾", "いくつ"],
        ["幾ら|いくら", "幾", "いくら"],
        ["医師|いし", "師", "し"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["余り|あまり", "both"],
        ["誤り|あやまり", "both"],
        ["表す|あらわす", "both"],
        ["現す|あらわす", "both"],
        ["現れ|あらわれ", "both"],
        ["現れる|あらわれる", "both"],
        ["息|いき", "both"],
        ["幾つ|いくつ", "both"],
        ["幾ら|いくら", "both"],
        ["医師|いし", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["余り|あまり", "<ruby>余<rt>あま</rt></ruby>り"],
        ["誤り|あやまり", "<ruby>誤<rt>あやま</rt></ruby>り"],
        ["表す|あらわす", "<ruby>表<rt>あらわ</rt></ruby>す"],
        ["現す|あらわす", "<ruby>現<rt>あらわ</rt></ruby>す"],
        ["現れ|あらわれ", "<ruby>現<rt>あらわ</rt></ruby>れ"],
        ["現れる|あらわれる", "<ruby>現<rt>あらわ</rt></ruby>れる"],
        ["息|いき", "<ruby>息<rt>いき</rt></ruby>"],
        ["幾つ|いくつ", "<ruby>幾<rt>いく</rt></ruby>つ"],
        ["幾ら|いくら", "<ruby>幾<rt>いく</rt></ruby>ら"],
        ["医師|いし", "<ruby>医<rt>い</rt></ruby><ruby>師<rt>し</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["意識|いしき", "識", "しき"],
        ["異常|いじょう", "常", "じょう"],
        ["泉|いずみ", "泉", "いずみ"],
        ["抱く|いだく", "抱", "いだく"],
        ["頂く|いただく", "頂", "いただく"],
        ["痛み|いたみ", "痛", "いたみ"],
        ["位置|いち", "位", "い"],
        ["位置|いち", "置", "ち"],
        ["一種|いっしゅ", "種", "しゅ"],
        ["移動|いどう", "移", "い"],
        ["居眠り|いねむり", "眠", "ねむり"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["意識|いしき", "both"],
        ["異常|いじょう", "both"],
        ["泉|いずみ", "both"],
        ["抱く|いだく", "both"],
        ["頂く|いただく", "both"],
        ["痛み|いたみ", "both"],
        ["位置|いち", "both"],
        ["一種|いっしゅ", "both"],
        ["移動|いどう", "both"],
        ["居眠り|いねむり", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["意識|いしき", "<ruby>意<rt>い</rt></ruby><ruby>識<rt>しき</rt></ruby>"],
        ["異常|いじょう", "<ruby>異<rt>い</rt></ruby><ruby>常<rt>じょう</rt></ruby>"],
        ["泉|いずみ", "<ruby>泉<rt>いずみ</rt></ruby>"],
        ["抱く|いだく", "<ruby>抱<rt>いだ</rt></ruby>く"],
        ["頂く|いただく", "<ruby>頂<rt>いただ</rt></ruby>く"],
        ["痛み|いたみ", "<ruby>痛<rt>いた</rt></ruby>み"],
        ["位置|いち", "<ruby>位<rt>い</rt></ruby><ruby>置<rt>ち</rt></ruby>"],
        ["一種|いっしゅ", "<ruby>一<rt>いっ</rt></ruby><ruby>種<rt>しゅ</rt></ruby>"],
        ["移動|いどう", "<ruby>移<rt>い</rt></ruby><ruby>動<rt>どう</rt></ruby>"],
        ["居眠り|いねむり", "<ruby>居<rt>い</rt></ruby><ruby>眠<rt>ねむ</rt></ruby>り"],
    ]);
});

test("tracked starter word data includes the fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["命|いのち", "命", "いのち"],
        ["違反|いはん", "違", "い"],
        ["違反|いはん", "反", "はん"],
        ["依頼|いらい", "頼", "らい"],
        ["岩|いわ", "岩", "いわ"],
        ["引退|いんたい", "退", "たい"],
        ["受け取る|うけとる", "取", "とる"],
        ["失う|うしなう", "失", "うしなう"],
        ["疑う|うたがう", "疑", "うたがう"],
        ["移す|うつす", "移", "うつす"],
        ["馬|うま", "馬", "うま"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["命|いのち", "both"],
        ["違反|いはん", "both"],
        ["依頼|いらい", "both"],
        ["岩|いわ", "both"],
        ["引退|いんたい", "both"],
        ["受け取る|うけとる", "both"],
        ["失う|うしなう", "both"],
        ["疑う|うたがう", "both"],
        ["移す|うつす", "both"],
        ["馬|うま", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["命|いのち", "<ruby>命<rt>いのち</rt></ruby>"],
        ["違反|いはん", "<ruby>違<rt>い</rt></ruby><ruby>反<rt>はん</rt></ruby>"],
        ["依頼|いらい", "<ruby>依<rt>い</rt></ruby><ruby>頼<rt>らい</rt></ruby>"],
        ["岩|いわ", "<ruby>岩<rt>いわ</rt></ruby>"],
        ["引退|いんたい", "<ruby>引<rt>いん</rt></ruby><ruby>退<rt>たい</rt></ruby>"],
        ["受け取る|うけとる", "<ruby>受<rt>う</rt></ruby>け<ruby>取<rt>と</rt></ruby>る"],
        ["失う|うしなう", "<ruby>失<rt>うしな</rt></ruby>う"],
        ["疑う|うたがう", "<ruby>疑<rt>うたが</rt></ruby>う"],
        ["移す|うつす", "<ruby>移<rt>うつ</rt></ruby>す"],
        ["馬|うま", "<ruby>馬<rt>うま</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["裏切る|うらぎる", "裏", "うら"],
        ["笑顔|えがお", "笑", "え"],
        ["演技|えんぎ", "演", "えん"],
        ["援助|えんじょ", "助", "じょ"],
        ["演説|えんぜつ", "演", "えん"],
        ["演奏|えんそう", "演", "えん"],
        ["追い付く|おいつく", "追", "お"],
        ["追い付く|おいつく", "付", "つく"],
        ["追う|おう", "追", "おう"],
        ["横断|おうだん", "横", "おう"],
        ["横断|おうだん", "断", "だん"],
        ["奥|おく", "奥", "おく"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["裏切る|うらぎる", "both"],
        ["笑顔|えがお", "both"],
        ["演技|えんぎ", "both"],
        ["援助|えんじょ", "both"],
        ["演説|えんぜつ", "both"],
        ["演奏|えんそう", "both"],
        ["追い付く|おいつく", "both"],
        ["追う|おう", "both"],
        ["横断|おうだん", "both"],
        ["奥|おく", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["裏切る|うらぎる", "<ruby>裏<rt>うら</rt></ruby><ruby>切<rt>ぎ</rt></ruby>る"],
        ["笑顔|えがお", "<ruby>笑<rt>え</rt></ruby><ruby>顔<rt>がお</rt></ruby>"],
        ["演技|えんぎ", "<ruby>演<rt>えん</rt></ruby><ruby>技<rt>ぎ</rt></ruby>"],
        ["援助|えんじょ", "<ruby>援<rt>えん</rt></ruby><ruby>助<rt>じょ</rt></ruby>"],
        ["演説|えんぜつ", "<ruby>演<rt>えん</rt></ruby><ruby>説<rt>ぜつ</rt></ruby>"],
        ["演奏|えんそう", "<ruby>演<rt>えん</rt></ruby><ruby>奏<rt>そう</rt></ruby>"],
        ["追い付く|おいつく", "<ruby>追<rt>お</rt></ruby>い<ruby>付<rt>つ</rt></ruby>く"],
        ["追う|おう", "<ruby>追<rt>お</rt></ruby>う"],
        ["横断|おうだん", "<ruby>横<rt>おう</rt></ruby><ruby>断<rt>だん</rt></ruby>"],
        ["奥|おく", "<ruby>奥<rt>おく</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["収める|おさめる", "収", "おさめる"],
        ["汚染|おせん", "汚", "お"],
        ["恐れる|おそれる", "恐", "おそれる"],
        ["恐ろしい|おそろしい", "恐", "おそろしい"],
        ["お腹|おなか", "腹", "なか"],
        ["降ろす|おろす", "降", "おろす"],
        ["温度|おんど", "温", "おん"],
        ["絵画|かいが", "絵", "かい"],
        ["解決|かいけつ", "解", "かい"],
        ["回復|かいふく", "復", "ふく"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["収める|おさめる", "both"],
        ["汚染|おせん", "both"],
        ["恐れる|おそれる", "both"],
        ["恐ろしい|おそろしい", "both"],
        ["お腹|おなか", "both"],
        ["降ろす|おろす", "both"],
        ["温度|おんど", "both"],
        ["絵画|かいが", "both"],
        ["解決|かいけつ", "both"],
        ["回復|かいふく", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["収める|おさめる", "<ruby>収<rt>おさ</rt></ruby>める"],
        ["汚染|おせん", "<ruby>汚<rt>お</rt></ruby><ruby>染<rt>せん</rt></ruby>"],
        ["恐れる|おそれる", "<ruby>恐<rt>おそ</rt></ruby>れる"],
        ["恐ろしい|おそろしい", "<ruby>恐<rt>おそ</rt></ruby>ろしい"],
        ["お腹|おなか", "お<ruby>腹<rt>なか</rt></ruby>"],
        ["降ろす|おろす", "<ruby>降<rt>お</rt></ruby>ろす"],
        ["温度|おんど", "<ruby>温<rt>おん</rt></ruby><ruby>度<rt>ど</rt></ruby>"],
        ["絵画|かいが", "<ruby>絵<rt>かい</rt></ruby><ruby>画<rt>が</rt></ruby>"],
        ["解決|かいけつ", "<ruby>解<rt>かい</rt></ruby><ruby>決<rt>けつ</rt></ruby>"],
        ["回復|かいふく", "<ruby>回<rt>かい</rt></ruby><ruby>復<rt>ふく</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["換える|かえる", "換", "かえる"],
        ["香り|かおり", "香", "かおり"],
        ["抱える|かかえる", "抱", "かかえる"],
        ["価格|かかく", "価", "か"],
        ["価格|かかく", "格", "かく"],
        ["係|かかり", "係", "かかり"],
        ["確実|かくじつ", "確", "かく"],
        ["確実|かくじつ", "実", "じつ"],
        ["確認|かくにん", "確", "かく"],
        ["確認|かくにん", "認", "にん"],
        ["欠ける|かける", "欠", "かける"],
        ["菓子|かし", "菓", "か"],
        ["数える|かぞえる", "数", "かぞえる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["換える|かえる", "both"],
        ["香り|かおり", "both"],
        ["抱える|かかえる", "both"],
        ["価格|かかく", "both"],
        ["係|かかり", "both"],
        ["確実|かくじつ", "both"],
        ["確認|かくにん", "both"],
        ["欠ける|かける", "both"],
        ["菓子|かし", "both"],
        ["数える|かぞえる", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["換える|かえる", "<ruby>換<rt>か</rt></ruby>える"],
        ["香り|かおり", "<ruby>香<rt>かお</rt></ruby>り"],
        ["抱える|かかえる", "<ruby>抱<rt>かか</rt></ruby>える"],
        ["価格|かかく", "<ruby>価<rt>か</rt></ruby><ruby>格<rt>かく</rt></ruby>"],
        ["係|かかり", "<ruby>係<rt>かかり</rt></ruby>"],
        ["確実|かくじつ", "<ruby>確<rt>かく</rt></ruby><ruby>実<rt>じつ</rt></ruby>"],
        ["確認|かくにん", "<ruby>確<rt>かく</rt></ruby><ruby>認<rt>にん</rt></ruby>"],
        ["欠ける|かける", "<ruby>欠<rt>か</rt></ruby>ける"],
        ["菓子|かし", "<ruby>菓<rt>か</rt></ruby><ruby>子<rt>し</rt></ruby>"],
        ["数える|かぞえる", "<ruby>数<rt>かぞ</rt></ruby>える"],
    ]);
});

test("tracked starter word data includes the eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["課|か", "課", "か"],
        ["害|がい", "害", "がい"],
        ["外交|がいこう", "交", "こう"],
        ["解釈|かいしゃく", "解", "かい"],
        ["快適|かいてき", "適", "てき"],
        ["掛かる|かかる", "掛", "かかる"],
        ["覚悟|かくご", "覚", "かく"],
        ["加減|かげん", "加", "か"],
        ["数|かず", "数", "かず"],
        ["型|かた", "型", "かた"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["課|か", "both"],
        ["害|がい", "both"],
        ["外交|がいこう", "both"],
        ["解釈|かいしゃく", "both"],
        ["快適|かいてき", "both"],
        ["掛かる|かかる", "both"],
        ["覚悟|かくご", "both"],
        ["加減|かげん", "both"],
        ["数|かず", "both"],
        ["型|かた", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["課|か", "<ruby>課<rt>か</rt></ruby>"],
        ["害|がい", "<ruby>害<rt>がい</rt></ruby>"],
        ["外交|がいこう", "<ruby>外<rt>がい</rt></ruby><ruby>交<rt>こう</rt></ruby>"],
        ["解釈|かいしゃく", "<ruby>解<rt>かい</rt></ruby><ruby>釈<rt>しゃく</rt></ruby>"],
        ["快適|かいてき", "<ruby>快<rt>かい</rt></ruby><ruby>適<rt>てき</rt></ruby>"],
        ["掛かる|かかる", "<ruby>掛<rt>か</rt></ruby>かる"],
        ["覚悟|かくご", "<ruby>覚<rt>かく</rt></ruby><ruby>悟<rt>ご</rt></ruby>"],
        ["加減|かげん", "<ruby>加<rt>か</rt></ruby><ruby>減<rt>げん</rt></ruby>"],
        ["数|かず", "<ruby>数<rt>かず</rt></ruby>"],
        ["型|かた", "<ruby>型<rt>かた</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["勝ち|かち", "勝", "かち"],
        ["価値|かち", "価", "か"],
        ["価値|かち", "値", "ち"],
        ["活気|かっき", "活", "かっ"],
        ["格好|かっこう", "格", "かっ"],
        ["活動|かつどう", "活", "かつ"],
        ["活用|かつよう", "活", "かつ"],
        ["悲しむ|かなしむ", "悲", "かなしむ"],
        ["必ずしも|かならずしも", "必", "かなら"],
        ["構う|かまう", "構", "かまう"],
        ["神|かみ", "神", "かみ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["勝ち|かち", "both"],
        ["価値|かち", "both"],
        ["活気|かっき", "both"],
        ["格好|かっこう", "both"],
        ["活動|かつどう", "both"],
        ["活用|かつよう", "both"],
        ["悲しむ|かなしむ", "both"],
        ["必ずしも|かならずしも", "both"],
        ["構う|かまう", "both"],
        ["神|かみ", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["勝ち|かち", "<ruby>勝<rt>か</rt></ruby>ち"],
        ["価値|かち", "<ruby>価<rt>か</rt></ruby><ruby>値<rt>ち</rt></ruby>"],
        ["活気|かっき", "<ruby>活<rt>かっ</rt></ruby><ruby>気<rt>き</rt></ruby>"],
        ["格好|かっこう", "<ruby>格<rt>かっ</rt></ruby><ruby>好<rt>こう</rt></ruby>"],
        ["活動|かつどう", "<ruby>活<rt>かつ</rt></ruby><ruby>動<rt>どう</rt></ruby>"],
        ["活用|かつよう", "<ruby>活<rt>かつ</rt></ruby><ruby>用<rt>よう</rt></ruby>"],
        ["悲しむ|かなしむ", "<ruby>悲<rt>かな</rt></ruby>しむ"],
        ["必ずしも|かならずしも", "<ruby>必<rt>かなら</rt></ruby>ずしも"],
        ["構う|かまう", "<ruby>構<rt>かま</rt></ruby>う"],
        ["神|かみ", "<ruby>神<rt>かみ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the tenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["感覚|かんかく", "感", "かん"],
        ["感覚|かんかく", "覚", "かく"],
        ["観客|かんきゃく", "観", "かん"],
        ["歓迎|かんげい", "迎", "げい"],
        ["観察|かんさつ", "観", "かん"],
        ["観察|かんさつ", "察", "さつ"],
        ["感じ|かんじ", "感", "かんじ"],
        ["感謝|かんしゃ", "感", "かん"],
        ["感情|かんじょう", "感", "かん"],
        ["感情|かんじょう", "情", "じょう"],
        ["感じる|かんじる", "感", "かんじる"],
        ["関心|かんしん", "関", "かん"],
        ["関連|かんれん", "関", "かん"],
        ["関連|かんれん", "連", "れん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["感覚|かんかく", "both"],
        ["観客|かんきゃく", "both"],
        ["歓迎|かんげい", "both"],
        ["観察|かんさつ", "both"],
        ["感じ|かんじ", "both"],
        ["感謝|かんしゃ", "both"],
        ["感情|かんじょう", "both"],
        ["感じる|かんじる", "both"],
        ["関心|かんしん", "both"],
        ["関連|かんれん", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["感覚|かんかく", "<ruby>感<rt>かん</rt></ruby><ruby>覚<rt>かく</rt></ruby>"],
        ["観客|かんきゃく", "<ruby>観<rt>かん</rt></ruby><ruby>客<rt>きゃく</rt></ruby>"],
        ["歓迎|かんげい", "<ruby>歓<rt>かん</rt></ruby><ruby>迎<rt>げい</rt></ruby>"],
        ["観察|かんさつ", "<ruby>観<rt>かん</rt></ruby><ruby>察<rt>さつ</rt></ruby>"],
        ["感じ|かんじ", "<ruby>感<rt>かん</rt></ruby>じ"],
        ["感謝|かんしゃ", "<ruby>感<rt>かん</rt></ruby><ruby>謝<rt>しゃ</rt></ruby>"],
        ["感情|かんじょう", "<ruby>感<rt>かん</rt></ruby><ruby>情<rt>じょう</rt></ruby>"],
        ["感じる|かんじる", "<ruby>感<rt>かん</rt></ruby>じる"],
        ["関心|かんしん", "<ruby>関<rt>かん</rt></ruby><ruby>心<rt>しん</rt></ruby>"],
        ["関連|かんれん", "<ruby>関<rt>かん</rt></ruby><ruby>連<rt>れん</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the eleventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["永久|えいきゅう", "久", "きゅう"],
        ["老い|おい", "老", "おい"],
        ["王|おう", "王", "おう"],
        ["王様|おうさま", "王", "おう"],
        ["王子|おうじ", "王", "おう"],
        ["帯|おび", "帯", "おび"],
        ["温暖|おんだん", "温", "おん"],
        ["感心|かんしん", "感", "かん"],
        ["関する|かんする", "関", "かんする"],
        ["完成|かんせい", "成", "せい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["永久|えいきゅう", "both"],
        ["老い|おい", "both"],
        ["王|おう", "both"],
        ["王様|おうさま", "both"],
        ["王子|おうじ", "both"],
        ["帯|おび", "both"],
        ["温暖|おんだん", "both"],
        ["感心|かんしん", "both"],
        ["関する|かんする", "both"],
        ["完成|かんせい", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["永久|えいきゅう", "<ruby>永<rt>えい</rt></ruby><ruby>久<rt>きゅう</rt></ruby>"],
        ["老い|おい", "<ruby>老<rt>お</rt></ruby>い"],
        ["王|おう", "<ruby>王<rt>おう</rt></ruby>"],
        ["王様|おうさま", "<ruby>王<rt>おう</rt></ruby><ruby>様<rt>さま</rt></ruby>"],
        ["王子|おうじ", "<ruby>王<rt>おう</rt></ruby><ruby>子<rt>じ</rt></ruby>"],
        ["帯|おび", "<ruby>帯<rt>おび</rt></ruby>"],
        ["温暖|おんだん", "<ruby>温<rt>おん</rt></ruby><ruby>暖<rt>だん</rt></ruby>"],
        ["感心|かんしん", "<ruby>感<rt>かん</rt></ruby><ruby>心<rt>しん</rt></ruby>"],
        ["関する|かんする", "<ruby>関<rt>かん</rt></ruby>する"],
        ["完成|かんせい", "<ruby>完<rt>かん</rt></ruby><ruby>成<rt>せい</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twelfth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["感動|かんどう", "感", "かん"],
        ["議員|ぎいん", "議", "ぎ"],
        ["記憶|きおく", "記", "き"],
        ["気温|きおん", "温", "おん"],
        ["機械|きかい", "機", "き"],
        ["議会|ぎかい", "議", "ぎ"],
        ["機関|きかん", "機", "き"],
        ["機関|きかん", "関", "かん"],
        ["機嫌|きげん", "機", "き"],
        ["気候|きこう", "候", "こう"],
        ["記事|きじ", "記", "き"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["感動|かんどう", "both"],
        ["議員|ぎいん", "both"],
        ["記憶|きおく", "both"],
        ["気温|きおん", "both"],
        ["機械|きかい", "both"],
        ["議会|ぎかい", "both"],
        ["機関|きかん", "both"],
        ["機嫌|きげん", "both"],
        ["気候|きこう", "both"],
        ["記事|きじ", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["感動|かんどう", "<ruby>感<rt>かん</rt></ruby><ruby>動<rt>どう</rt></ruby>"],
        ["議員|ぎいん", "<ruby>議<rt>ぎ</rt></ruby><ruby>員<rt>いん</rt></ruby>"],
        ["記憶|きおく", "<ruby>記<rt>き</rt></ruby><ruby>憶<rt>おく</rt></ruby>"],
        ["気温|きおん", "<ruby>気<rt>き</rt></ruby><ruby>温<rt>おん</rt></ruby>"],
        ["機械|きかい", "<ruby>機<rt>き</rt></ruby><ruby>械<rt>かい</rt></ruby>"],
        ["議会|ぎかい", "<ruby>議<rt>ぎ</rt></ruby><ruby>会<rt>かい</rt></ruby>"],
        ["機関|きかん", "<ruby>機<rt>き</rt></ruby><ruby>関<rt>かん</rt></ruby>"],
        ["機嫌|きげん", "<ruby>機<rt>き</rt></ruby><ruby>嫌<rt>げん</rt></ruby>"],
        ["気候|きこう", "<ruby>気<rt>き</rt></ruby><ruby>候<rt>こう</rt></ruby>"],
        ["記事|きじ", "<ruby>記<rt>き</rt></ruby><ruby>事<rt>じ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the thirteenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["技師|ぎし", "師", "し"],
        ["記者|きしゃ", "記", "き"],
        ["議長|ぎちょう", "議", "ぎ"],
        ["気付く|きづく", "付", "づく"],
        ["記入|きにゅう", "記", "き"],
        ["記念|きねん", "記", "き"],
        ["記念|きねん", "念", "ねん"],
        ["機能|きのう", "機", "き"],
        ["機能|きのう", "能", "のう"],
        ["寄付|きふ", "寄", "き"],
        ["寄付|きふ", "付", "ふ"],
        ["希望|きぼう", "望", "ぼう"],
        ["義務|ぎむ", "務", "む"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["技師|ぎし", "both"],
        ["記者|きしゃ", "both"],
        ["議長|ぎちょう", "both"],
        ["気付く|きづく", "both"],
        ["記入|きにゅう", "both"],
        ["記念|きねん", "both"],
        ["機能|きのう", "both"],
        ["寄付|きふ", "both"],
        ["希望|きぼう", "both"],
        ["義務|ぎむ", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["技師|ぎし", "<ruby>技<rt>ぎ</rt></ruby><ruby>師<rt>し</rt></ruby>"],
        ["記者|きしゃ", "<ruby>記<rt>き</rt></ruby><ruby>者<rt>しゃ</rt></ruby>"],
        ["議長|ぎちょう", "<ruby>議<rt>ぎ</rt></ruby><ruby>長<rt>ちょう</rt></ruby>"],
        ["気付く|きづく", "<ruby>気<rt>き</rt></ruby><ruby>付<rt>づ</rt></ruby>く"],
        ["記入|きにゅう", "<ruby>記<rt>き</rt></ruby><ruby>入<rt>にゅう</rt></ruby>"],
        ["記念|きねん", "<ruby>記<rt>き</rt></ruby><ruby>念<rt>ねん</rt></ruby>"],
        ["機能|きのう", "<ruby>機<rt>き</rt></ruby><ruby>能<rt>のう</rt></ruby>"],
        ["寄付|きふ", "<ruby>寄<rt>き</rt></ruby><ruby>付<rt>ふ</rt></ruby>"],
        ["希望|きぼう", "<ruby>希<rt>き</rt></ruby><ruby>望<rt>ぼう</rt></ruby>"],
        ["義務|ぎむ", "<ruby>義<rt>ぎ</rt></ruby><ruby>務<rt>む</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the fourteenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["疑問|ぎもん", "疑", "ぎ"],
        ["吸収|きゅうしゅう", "吸", "きゅう"],
        ["吸収|きゅうしゅう", "収", "しゅう"],
        ["救助|きゅうじょ", "助", "じょ"],
        ["急速|きゅうそく", "速", "そく"],
        ["給料|きゅうりょう", "給", "きゅう"],
        ["供給|きょうきゅう", "供", "きょう"],
        ["供給|きょうきゅう", "給", "きゅう"],
        ["教師|きょうし", "師", "し"],
        ["強調|きょうちょう", "調", "ちょう"],
        ["恐怖|きょうふ", "恐", "きょう"],
        ["恐怖|きょうふ", "怖", "ふ"],
        ["協力|きょうりょく", "協", "きょう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["疑問|ぎもん", "both"],
        ["吸収|きゅうしゅう", "both"],
        ["救助|きゅうじょ", "both"],
        ["急速|きゅうそく", "both"],
        ["給料|きゅうりょう", "both"],
        ["供給|きょうきゅう", "both"],
        ["教師|きょうし", "both"],
        ["強調|きょうちょう", "both"],
        ["恐怖|きょうふ", "both"],
        ["協力|きょうりょく", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["疑問|ぎもん", "<ruby>疑<rt>ぎ</rt></ruby><ruby>問<rt>もん</rt></ruby>"],
        ["吸収|きゅうしゅう", "<ruby>吸<rt>きゅう</rt></ruby><ruby>収<rt>しゅう</rt></ruby>"],
        ["救助|きゅうじょ", "<ruby>救<rt>きゅう</rt></ruby><ruby>助<rt>じょ</rt></ruby>"],
        ["急速|きゅうそく", "<ruby>急<rt>きゅう</rt></ruby><ruby>速<rt>そく</rt></ruby>"],
        ["給料|きゅうりょう", "<ruby>給<rt>きゅう</rt></ruby><ruby>料<rt>りょう</rt></ruby>"],
        ["供給|きょうきゅう", "<ruby>供<rt>きょう</rt></ruby><ruby>給<rt>きゅう</rt></ruby>"],
        ["教師|きょうし", "<ruby>教<rt>きょう</rt></ruby><ruby>師<rt>し</rt></ruby>"],
        ["強調|きょうちょう", "<ruby>強<rt>きょう</rt></ruby><ruby>調<rt>ちょう</rt></ruby>"],
        ["恐怖|きょうふ", "<ruby>恐<rt>きょう</rt></ruby><ruby>怖<rt>ふ</rt></ruby>"],
        ["協力|きょうりょく", "<ruby>協<rt>きょう</rt></ruby><ruby>力<rt>りょく</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the fifteenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["記録|きろく", "記", "き"],
        ["記録|きろく", "録", "ろく"],
        ["議論|ぎろん", "議", "ぎ"],
        ["議論|ぎろん", "論", "ろん"],
        ["金額|きんがく", "額", "がく"],
        ["偶然|ぐうぜん", "然", "ぜん"],
        ["苦痛|くつう", "苦", "く"],
        ["苦痛|くつう", "痛", "つう"],
        ["組|くみ", "組", "くみ"],
        ["組合|くみあい", "組", "くみ"],
        ["組む|くむ", "組", "くむ"],
        ["暮らし|くらし", "暮", "くらし"],
        ["暮らす|くらす", "暮", "くらす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["記録|きろく", "both"],
        ["議論|ぎろん", "both"],
        ["金額|きんがく", "both"],
        ["偶然|ぐうぜん", "both"],
        ["苦痛|くつう", "both"],
        ["組|くみ", "both"],
        ["組合|くみあい", "both"],
        ["組む|くむ", "both"],
        ["暮らし|くらし", "both"],
        ["暮らす|くらす", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["記録|きろく", "<ruby>記<rt>き</rt></ruby><ruby>録<rt>ろく</rt></ruby>"],
        ["議論|ぎろん", "<ruby>議<rt>ぎ</rt></ruby><ruby>論<rt>ろん</rt></ruby>"],
        ["金額|きんがく", "<ruby>金<rt>きん</rt></ruby><ruby>額<rt>がく</rt></ruby>"],
        ["偶然|ぐうぜん", "<ruby>偶<rt>ぐう</rt></ruby><ruby>然<rt>ぜん</rt></ruby>"],
        ["苦痛|くつう", "<ruby>苦<rt>く</rt></ruby><ruby>痛<rt>つう</rt></ruby>"],
        ["組|くみ", "<ruby>組<rt>くみ</rt></ruby>"],
        ["組合|くみあい", "<ruby>組<rt>くみ</rt></ruby><ruby>合<rt>あい</rt></ruby>"],
        ["組む|くむ", "<ruby>組<rt>く</rt></ruby>む"],
        ["暮らし|くらし", "<ruby>暮<rt>く</rt></ruby>らし"],
        ["暮らす|くらす", "<ruby>暮<rt>く</rt></ruby>らす"],
    ]);
});

test("tracked starter word data includes the sixteenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["繰り返す|くりかえす", "返", "かえす"],
        ["苦しい|くるしい", "苦", "くるしい"],
        ["苦しむ|くるしむ", "苦", "くるしむ"],
        ["暮れ|くれ", "暮", "くれ"],
        ["苦労|くろう", "苦", "く"],
        ["苦労|くろう", "労", "ろう"],
        ["加える|くわえる", "加", "くわえる"],
        ["加わる|くわわる", "加", "くわわる"],
        ["経営|けいえい", "経", "けい"],
        ["景気|けいき", "景", "けい"],
        ["経験|けいけん", "経", "けい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["繰り返す|くりかえす", "both"],
        ["苦しい|くるしい", "both"],
        ["苦しむ|くるしむ", "both"],
        ["暮れ|くれ", "both"],
        ["苦労|くろう", "both"],
        ["加える|くわえる", "both"],
        ["加わる|くわわる", "both"],
        ["経営|けいえい", "both"],
        ["景気|けいき", "both"],
        ["経験|けいけん", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["繰り返す|くりかえす", "<ruby>繰<rt>く</rt></ruby>り<ruby>返<rt>かえ</rt></ruby>す"],
        ["苦しい|くるしい", "<ruby>苦<rt>くる</rt></ruby>しい"],
        ["苦しむ|くるしむ", "<ruby>苦<rt>くる</rt></ruby>しむ"],
        ["暮れ|くれ", "<ruby>暮<rt>く</rt></ruby>れ"],
        ["苦労|くろう", "<ruby>苦<rt>く</rt></ruby><ruby>労<rt>ろう</rt></ruby>"],
        ["加える|くわえる", "<ruby>加<rt>くわ</rt></ruby>える"],
        ["加わる|くわわる", "<ruby>加<rt>くわ</rt></ruby>わる"],
        ["経営|けいえい", "<ruby>経<rt>けい</rt></ruby><ruby>営<rt>えい</rt></ruby>"],
        ["景気|けいき", "<ruby>景<rt>けい</rt></ruby><ruby>気<rt>き</rt></ruby>"],
        ["経験|けいけん", "<ruby>経<rt>けい</rt></ruby><ruby>験<rt>けん</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the seventeenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["傾向|けいこう", "向", "こう"],
        ["警告|けいこく", "警", "けい"],
        ["警告|けいこく", "告", "こく"],
        ["計算|けいさん", "算", "さん"],
        ["掲示|けいじ", "示", "じ"],
        ["芸術|げいじゅつ", "芸", "げい"],
        ["芸術|げいじゅつ", "術", "じゅつ"],
        ["契約|けいやく", "約", "やく"],
        ["経由|けいゆ", "経", "けい"],
        ["経由|けいゆ", "由", "ゆ"],
        ["結果|けっか", "果", "か"],
        ["欠陥|けっかん", "欠", "けっ"],
        ["欠席|けっせき", "欠", "けっ"],
        ["欠席|けっせき", "席", "せき"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["傾向|けいこう", "both"],
        ["警告|けいこく", "both"],
        ["計算|けいさん", "both"],
        ["掲示|けいじ", "both"],
        ["芸術|げいじゅつ", "both"],
        ["契約|けいやく", "both"],
        ["経由|けいゆ", "both"],
        ["結果|けっか", "both"],
        ["欠陥|けっかん", "both"],
        ["欠席|けっせき", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["傾向|けいこう", "<ruby>傾<rt>けい</rt></ruby><ruby>向<rt>こう</rt></ruby>"],
        ["警告|けいこく", "<ruby>警<rt>けい</rt></ruby><ruby>告<rt>こく</rt></ruby>"],
        ["計算|けいさん", "<ruby>計<rt>けい</rt></ruby><ruby>算<rt>さん</rt></ruby>"],
        ["掲示|けいじ", "<ruby>掲<rt>けい</rt></ruby><ruby>示<rt>じ</rt></ruby>"],
        ["芸術|げいじゅつ", "<ruby>芸<rt>げい</rt></ruby><ruby>術<rt>じゅつ</rt></ruby>"],
        ["契約|けいやく", "<ruby>契<rt>けい</rt></ruby><ruby>約<rt>やく</rt></ruby>"],
        ["経由|けいゆ", "<ruby>経<rt>けい</rt></ruby><ruby>由<rt>ゆ</rt></ruby>"],
        ["結果|けっか", "<ruby>結<rt>けっ</rt></ruby><ruby>果<rt>か</rt></ruby>"],
        ["欠陥|けっかん", "<ruby>欠<rt>けっ</rt></ruby><ruby>陥<rt>かん</rt></ruby>"],
        ["欠席|けっせき", "<ruby>欠<rt>けっ</rt></ruby><ruby>席<rt>せき</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the eighteenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["欠点|けってん", "欠", "けっ"],
        ["結論|けつろん", "論", "ろん"],
        ["見解|けんかい", "解", "かい"],
        ["現金|げんきん", "現", "げん"],
        ["現在|げんざい", "現", "げん"],
        ["現在|げんざい", "在", "ざい"],
        ["現実|げんじつ", "現", "げん"],
        ["現実|げんじつ", "実", "じつ"],
        ["現象|げんしょう", "現", "げん"],
        ["現状|げんじょう", "現", "げん"],
        ["現状|げんじょう", "状", "じょう"],
        ["現代|げんだい", "現", "げん"],
        ["見当|けんとう", "当", "とう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["欠点|けってん", "both"],
        ["結論|けつろん", "both"],
        ["見解|けんかい", "both"],
        ["現金|げんきん", "both"],
        ["現在|げんざい", "both"],
        ["現実|げんじつ", "both"],
        ["現象|げんしょう", "both"],
        ["現状|げんじょう", "both"],
        ["現代|げんだい", "both"],
        ["見当|けんとう", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["欠点|けってん", "<ruby>欠<rt>けっ</rt></ruby><ruby>点<rt>てん</rt></ruby>"],
        ["結論|けつろん", "<ruby>結<rt>けつ</rt></ruby><ruby>論<rt>ろん</rt></ruby>"],
        ["見解|けんかい", "<ruby>見<rt>けん</rt></ruby><ruby>解<rt>かい</rt></ruby>"],
        ["現金|げんきん", "<ruby>現<rt>げん</rt></ruby><ruby>金<rt>きん</rt></ruby>"],
        ["現在|げんざい", "<ruby>現<rt>げん</rt></ruby><ruby>在<rt>ざい</rt></ruby>"],
        ["現実|げんじつ", "<ruby>現<rt>げん</rt></ruby><ruby>実<rt>じつ</rt></ruby>"],
        ["現象|げんしょう", "<ruby>現<rt>げん</rt></ruby><ruby>象<rt>しょう</rt></ruby>"],
        ["現状|げんじょう", "<ruby>現<rt>げん</rt></ruby><ruby>状<rt>じょう</rt></ruby>"],
        ["現代|げんだい", "<ruby>現<rt>げん</rt></ruby><ruby>代<rt>だい</rt></ruby>"],
        ["見当|けんとう", "<ruby>見<rt>けん</rt></ruby><ruby>当<rt>とう</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the nineteenth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["現場|げんば", "現", "げん"],
        ["憲法|けんぽう", "法", "ぽう"],
        ["権利|けんり", "権", "けん"],
        ["幸運|こううん", "幸", "こう"],
        ["講演|こうえん", "演", "えん"],
        ["効果|こうか", "果", "か"],
        ["高価|こうか", "価", "か"],
        ["合格|ごうかく", "格", "かく"],
        ["交換|こうかん", "交", "こう"],
        ["交換|こうかん", "換", "かん"],
        ["光景|こうけい", "景", "けい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["現場|げんば", "both"],
        ["憲法|けんぽう", "both"],
        ["権利|けんり", "both"],
        ["幸運|こううん", "both"],
        ["講演|こうえん", "both"],
        ["効果|こうか", "both"],
        ["高価|こうか", "both"],
        ["合格|ごうかく", "both"],
        ["交換|こうかん", "both"],
        ["光景|こうけい", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["現場|げんば", "<ruby>現<rt>げん</rt></ruby><ruby>場<rt>ば</rt></ruby>"],
        ["憲法|けんぽう", "<ruby>憲<rt>けん</rt></ruby><ruby>法<rt>ぽう</rt></ruby>"],
        ["権利|けんり", "<ruby>権<rt>けん</rt></ruby><ruby>利<rt>り</rt></ruby>"],
        ["幸運|こううん", "<ruby>幸<rt>こう</rt></ruby><ruby>運<rt>うん</rt></ruby>"],
        ["講演|こうえん", "<ruby>講<rt>こう</rt></ruby><ruby>演<rt>えん</rt></ruby>"],
        ["効果|こうか", "<ruby>効<rt>こう</rt></ruby><ruby>果<rt>か</rt></ruby>"],
        ["高価|こうか", "<ruby>高<rt>こう</rt></ruby><ruby>価<rt>か</rt></ruby>"],
        ["合格|ごうかく", "<ruby>合<rt>ごう</rt></ruby><ruby>格<rt>かく</rt></ruby>"],
        ["交換|こうかん", "<ruby>交<rt>こう</rt></ruby><ruby>換<rt>かん</rt></ruby>"],
        ["光景|こうけい", "<ruby>光<rt>こう</rt></ruby><ruby>景<rt>けい</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twentieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["交際|こうさい", "交", "こう"],
        ["交際|こうさい", "際", "さい"],
        ["構成|こうせい", "構", "こう"],
        ["構成|こうせい", "成", "せい"],
        ["高速|こうそく", "速", "そく"],
        ["強盗|ごうとう", "盗", "とう"],
        ["幸福|こうふく", "幸", "こう"],
        ["幸福|こうふく", "福", "ふく"],
        ["候補|こうほ", "候", "こう"],
        ["越える|こえる", "越", "こえる"],
        ["誤解|ごかい", "誤", "ご"],
        ["誤解|ごかい", "解", "かい"],
        ["呼吸|こきゅう", "呼", "こ"],
        ["呼吸|こきゅう", "吸", "きゅう"],
        ["越す|こす", "越", "こす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["交際|こうさい", "both"],
        ["構成|こうせい", "both"],
        ["高速|こうそく", "both"],
        ["強盗|ごうとう", "both"],
        ["幸福|こうふく", "both"],
        ["候補|こうほ", "both"],
        ["越える|こえる", "both"],
        ["誤解|ごかい", "both"],
        ["呼吸|こきゅう", "both"],
        ["越す|こす", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["交際|こうさい", "<ruby>交<rt>こう</rt></ruby><ruby>際<rt>さい</rt></ruby>"],
        ["構成|こうせい", "<ruby>構<rt>こう</rt></ruby><ruby>成<rt>せい</rt></ruby>"],
        ["高速|こうそく", "<ruby>高<rt>こう</rt></ruby><ruby>速<rt>そく</rt></ruby>"],
        ["強盗|ごうとう", "<ruby>強<rt>ごう</rt></ruby><ruby>盗<rt>とう</rt></ruby>"],
        ["幸福|こうふく", "<ruby>幸<rt>こう</rt></ruby><ruby>福<rt>ふく</rt></ruby>"],
        ["候補|こうほ", "<ruby>候<rt>こう</rt></ruby><ruby>補<rt>ほ</rt></ruby>"],
        ["越える|こえる", "<ruby>越<rt>こ</rt></ruby>える"],
        ["誤解|ごかい", "<ruby>誤<rt>ご</rt></ruby><ruby>解<rt>かい</rt></ruby>"],
        ["呼吸|こきゅう", "<ruby>呼<rt>こ</rt></ruby><ruby>吸<rt>きゅう</rt></ruby>"],
        ["越す|こす", "<ruby>越<rt>こ</rt></ruby>す"],
    ]);
});

test("tracked starter word data includes the twenty-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["骨折|こっせつ", "骨", "こっ"],
        ["骨折|こっせつ", "折", "せつ"],
        ["断る|ことわる", "断", "ことわる"],
        ["殺す|ころす", "殺", "ころす"],
        ["混雑|こんざつ", "雑", "ざつ"],
        ["婚約|こんやく", "婚", "こん"],
        ["婚約|こんやく", "約", "やく"],
        ["差|さ", "差", "さ"],
        ["際|さい", "際", "さい"],
        ["最高|さいこう", "最", "さい"],
        ["財産|ざいさん", "財", "ざい"],
        ["最中|さいちゅう", "最", "さい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["骨折|こっせつ", "both"],
        ["断る|ことわる", "both"],
        ["殺す|ころす", "both"],
        ["混雑|こんざつ", "both"],
        ["婚約|こんやく", "both"],
        ["差|さ", "both"],
        ["際|さい", "both"],
        ["最高|さいこう", "both"],
        ["財産|ざいさん", "both"],
        ["最中|さいちゅう", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["骨折|こっせつ", "<ruby>骨<rt>こっ</rt></ruby><ruby>折<rt>せつ</rt></ruby>"],
        ["断る|ことわる", "<ruby>断<rt>ことわ</rt></ruby>る"],
        ["殺す|ころす", "<ruby>殺<rt>ころ</rt></ruby>す"],
        ["混雑|こんざつ", "<ruby>混<rt>こん</rt></ruby><ruby>雑<rt>ざつ</rt></ruby>"],
        ["婚約|こんやく", "<ruby>婚<rt>こん</rt></ruby><ruby>約<rt>やく</rt></ruby>"],
        ["差|さ", "<ruby>差<rt>さ</rt></ruby>"],
        ["際|さい", "<ruby>際<rt>さい</rt></ruby>"],
        ["最高|さいこう", "<ruby>最<rt>さい</rt></ruby><ruby>高<rt>こう</rt></ruby>"],
        ["財産|ざいさん", "<ruby>財<rt>ざい</rt></ruby><ruby>産<rt>さん</rt></ruby>"],
        ["最中|さいちゅう", "<ruby>最<rt>さい</rt></ruby><ruby>中<rt>ちゅう</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twenty-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["最低|さいてい", "最", "さい"],
        ["才能|さいのう", "才", "さい"],
        ["才能|さいのう", "能", "のう"],
        ["裁判|さいばん", "判", "ばん"],
        ["幸い|さいわい", "幸", "さいわい"],
        ["酒|さけ", "酒", "さけ"],
        ["支える|ささえる", "支", "ささえる"],
        ["指す|さす", "指", "さす"],
        ["差別|さべつ", "差", "さ"],
        ["作法|さほう", "法", "ほう"],
        ["覚ます|さます", "覚", "さます"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["最低|さいてい", "both"],
        ["才能|さいのう", "both"],
        ["裁判|さいばん", "both"],
        ["幸い|さいわい", "both"],
        ["酒|さけ", "both"],
        ["支える|ささえる", "both"],
        ["指す|さす", "both"],
        ["差別|さべつ", "both"],
        ["作法|さほう", "both"],
        ["覚ます|さます", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["最低|さいてい", "<ruby>最<rt>さい</rt></ruby><ruby>低<rt>てい</rt></ruby>"],
        ["才能|さいのう", "<ruby>才<rt>さい</rt></ruby><ruby>能<rt>のう</rt></ruby>"],
        ["裁判|さいばん", "<ruby>裁<rt>さい</rt></ruby><ruby>判<rt>ばん</rt></ruby>"],
        ["幸い|さいわい", "<ruby>幸<rt>さいわい</rt></ruby>"],
        ["酒|さけ", "<ruby>酒<rt>さけ</rt></ruby>"],
        ["支える|ささえる", "<ruby>支<rt>ささ</rt></ruby>える"],
        ["指す|さす", "<ruby>指<rt>さ</rt></ruby>す"],
        ["差別|さべつ", "<ruby>差<rt>さ</rt></ruby><ruby>別<rt>べつ</rt></ruby>"],
        ["作法|さほう", "<ruby>作<rt>さ</rt></ruby><ruby>法<rt>ほう</rt></ruby>"],
        ["覚ます|さます", "<ruby>覚<rt>さ</rt></ruby>ます"],
    ]);
});

test("tracked starter word data includes the twenty-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["覚める|さめる", "覚", "さめる"],
        ["更に|さらに", "更", "さらに"],
        ["参加|さんか", "参", "さん"],
        ["参加|さんか", "加", "か"],
        ["散歩|さんぽ", "散", "さん"],
        ["幸せ|しあわせ", "幸", "しあわせ"],
        ["ジェット機|ジェットき", "機", "き"],
        ["直に|じかに", "直", "じかに"],
        ["式|しき", "式", "しき"],
        ["支給|しきゅう", "支", "し"],
        ["支給|しきゅう", "給", "きゅう"],
        ["資源|しげん", "資", "し"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["覚める|さめる", "both"],
        ["更に|さらに", "both"],
        ["参加|さんか", "both"],
        ["散歩|さんぽ", "both"],
        ["幸せ|しあわせ", "both"],
        ["ジェット機|ジェットき", "both"],
        ["直に|じかに", "both"],
        ["式|しき", "both"],
        ["支給|しきゅう", "both"],
        ["資源|しげん", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["覚める|さめる", "<ruby>覚<rt>さ</rt></ruby>める"],
        ["更に|さらに", "<ruby>更<rt>さら</rt></ruby>に"],
        ["参加|さんか", "<ruby>参<rt>さん</rt></ruby><ruby>加<rt>か</rt></ruby>"],
        ["散歩|さんぽ", "<ruby>散<rt>さん</rt></ruby><ruby>歩<rt>ぽ</rt></ruby>"],
        ["幸せ|しあわせ", "<ruby>幸<rt>しあわ</rt></ruby>せ"],
        ["ジェット機|ジェットき", "ジェット<ruby>機<rt>き</rt></ruby>"],
        ["直に|じかに", "<ruby>直<rt>じか</rt></ruby>に"],
        ["式|しき", "<ruby>式<rt>しき</rt></ruby>"],
        ["支給|しきゅう", "<ruby>支<rt>し</rt></ruby><ruby>給<rt>きゅう</rt></ruby>"],
        ["資源|しげん", "<ruby>資<rt>し</rt></ruby><ruby>源<rt>げん</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twenty-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["事件|じけん", "件", "けん"],
        ["時刻|じこく", "刻", "こく"],
        ["自殺|じさつ", "殺", "さつ"],
        ["事実|じじつ", "実", "じつ"],
        ["支出|ししゅつ", "支", "し"],
        ["思想|しそう", "想", "そう"],
        ["失業|しつぎょう", "失", "しつ"],
        ["実験|じっけん", "実", "じっ"],
        ["実現|じつげん", "実", "じつ"],
        ["実現|じつげん", "現", "げん"],
        ["実行|じっこう", "実", "じっ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["事件|じけん", "both"],
        ["時刻|じこく", "both"],
        ["自殺|じさつ", "both"],
        ["事実|じじつ", "both"],
        ["支出|ししゅつ", "both"],
        ["思想|しそう", "both"],
        ["失業|しつぎょう", "both"],
        ["実験|じっけん", "both"],
        ["実現|じつげん", "both"],
        ["実行|じっこう", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["事件|じけん", "<ruby>事<rt>じ</rt></ruby><ruby>件<rt>けん</rt></ruby>"],
        ["時刻|じこく", "<ruby>時<rt>じ</rt></ruby><ruby>刻<rt>こく</rt></ruby>"],
        ["自殺|じさつ", "<ruby>自<rt>じ</rt></ruby><ruby>殺<rt>さつ</rt></ruby>"],
        ["事実|じじつ", "<ruby>事<rt>じ</rt></ruby><ruby>実<rt>じつ</rt></ruby>"],
        ["支出|ししゅつ", "<ruby>支<rt>し</rt></ruby><ruby>出<rt>しゅつ</rt></ruby>"],
        ["思想|しそう", "<ruby>思<rt>し</rt></ruby><ruby>想<rt>そう</rt></ruby>"],
        ["失業|しつぎょう", "<ruby>失<rt>しつ</rt></ruby><ruby>業<rt>ぎょう</rt></ruby>"],
        ["実験|じっけん", "<ruby>実<rt>じっ</rt></ruby><ruby>験<rt>けん</rt></ruby>"],
        ["実現|じつげん", "<ruby>実<rt>じつ</rt></ruby><ruby>現<rt>げん</rt></ruby>"],
        ["実行|じっこう", "<ruby>実<rt>じっ</rt></ruby><ruby>行<rt>こう</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twenty-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["実際|じっさい", "実", "じっ"],
        ["実際|じっさい", "際", "さい"],
        ["実施|じっし", "実", "じっ"],
        ["実に|じつに", "実", "じつに"],
        ["実は|じつは", "実", "じつは"],
        ["失望|しつぼう", "失", "しつ"],
        ["失望|しつぼう", "望", "ぼう"],
        ["支店|してん", "支", "し"],
        ["指導|しどう", "指", "し"],
        ["支配|しはい", "支", "し"],
        ["支配|しはい", "配", "はい"],
        ["支払|しはらい", "支", "し"],
        ["支払|しはらい", "払", "はらい"],
        ["支払う|しはらう", "支", "し"],
        ["支払う|しはらう", "払", "はらう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["実際|じっさい", "both"],
        ["実施|じっし", "both"],
        ["実に|じつに", "both"],
        ["実は|じつは", "both"],
        ["失望|しつぼう", "both"],
        ["支店|してん", "both"],
        ["指導|しどう", "both"],
        ["支配|しはい", "both"],
        ["支払|しはらい", "both"],
        ["支払う|しはらう", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["実際|じっさい", "<ruby>実<rt>じっ</rt></ruby><ruby>際<rt>さい</rt></ruby>"],
        ["実施|じっし", "<ruby>実<rt>じっ</rt></ruby><ruby>施<rt>し</rt></ruby>"],
        ["実に|じつに", "<ruby>実<rt>じつ</rt></ruby>に"],
        ["実は|じつは", "<ruby>実<rt>じつ</rt></ruby>は"],
        ["失望|しつぼう", "<ruby>失<rt>しつ</rt></ruby><ruby>望<rt>ぼう</rt></ruby>"],
        ["支店|してん", "<ruby>支<rt>し</rt></ruby><ruby>店<rt>てん</rt></ruby>"],
        ["指導|しどう", "<ruby>指<rt>し</rt></ruby><ruby>導<rt>どう</rt></ruby>"],
        ["支配|しはい", "<ruby>支<rt>し</rt></ruby><ruby>配<rt>はい</rt></ruby>"],
        ["支払|しはらい", "<ruby>支<rt>し</rt></ruby><ruby>払<rt>はら</rt></ruby>い"],
        ["支払う|しはらう", "<ruby>支<rt>し</rt></ruby><ruby>払<rt>はら</rt></ruby>う"],
    ]);
});

test("tracked starter word data includes the twenty-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["易しい|やさしい", "易", "やさしい"],
        ["移る|うつる", "移", "うつる"],
        ["違う|ちがう", "違", "ちがう"],
        ["育てる|そだてる", "育", "そだてる"],
        ["原因|げんいん", "因", "いん"],
        ["雲|くも", "雲", "くも"],
        ["汚れる|よごれる", "汚", "よごれる"],
        ["押す|おす", "押", "おす"],
        ["過ぎる|すぎる", "過", "すぎる"],
        ["紹介|しょうかい", "介", "かい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["易しい|やさしい", "both"],
        ["移る|うつる", "both"],
        ["違う|ちがう", "both"],
        ["育てる|そだてる", "both"],
        ["原因|げんいん", "both"],
        ["雲|くも", "both"],
        ["汚れる|よごれる", "both"],
        ["押す|おす", "both"],
        ["過ぎる|すぎる", "both"],
        ["紹介|しょうかい", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["易しい|やさしい", "<ruby>易<rt>やさ</rt></ruby>しい"],
        ["移る|うつる", "<ruby>移<rt>うつ</rt></ruby>る"],
        ["違う|ちがう", "<ruby>違<rt>ちが</rt></ruby>う"],
        ["育てる|そだてる", "<ruby>育<rt>そだ</rt></ruby>てる"],
        ["原因|げんいん", "<ruby>原<rt>げん</rt></ruby><ruby>因<rt>いん</rt></ruby>"],
        ["雲|くも", "<ruby>雲<rt>くも</rt></ruby>"],
        ["汚れる|よごれる", "<ruby>汚<rt>よご</rt></ruby>れる"],
        ["押す|おす", "<ruby>押<rt>お</rt></ruby>す"],
        ["過ぎる|すぎる", "<ruby>過<rt>す</rt></ruby>ぎる"],
        ["紹介|しょうかい", "<ruby>紹<rt>しょう</rt></ruby><ruby>介<rt>かい</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the twenty-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["皆|みんな", "皆", "みんな"],
        ["絵|え", "絵", "え"],
        ["貝|かい", "貝", "かい"],
        ["覚える|おぼえる", "覚", "おぼえる"],
        ["掛ける|かける", "掛", "かける"],
        ["官庁|かんちょう", "官", "かん"],
        ["慣れる|なれる", "慣", "なれる"],
        ["願う|ねがう", "願", "ねがう"],
        ["危ない|あぶない", "危", "あぶない"],
        ["寄る|よる", "寄", "よる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["皆|みんな", "both"],
        ["絵|え", "both"],
        ["貝|かい", "both"],
        ["覚える|おぼえる", "both"],
        ["掛ける|かける", "both"],
        ["官庁|かんちょう", "both"],
        ["慣れる|なれる", "both"],
        ["願う|ねがう", "both"],
        ["危ない|あぶない", "both"],
        ["寄る|よる", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["皆|みんな", "<ruby>皆<rt>みんな</rt></ruby>"],
        ["絵|え", "<ruby>絵<rt>え</rt></ruby>"],
        ["貝|かい", "<ruby>貝<rt>かい</rt></ruby>"],
        ["覚える|おぼえる", "<ruby>覚<rt>おぼ</rt></ruby>える"],
        ["掛ける|かける", "<ruby>掛<rt>か</rt></ruby>ける"],
        ["官庁|かんちょう", "<ruby>官<rt>かん</rt></ruby><ruby>庁<rt>ちょう</rt></ruby>"],
        ["慣れる|なれる", "<ruby>慣<rt>な</rt></ruby>れる"],
        ["願う|ねがう", "<ruby>願<rt>ねが</rt></ruby>う"],
        ["危ない|あぶない", "<ruby>危<rt>あぶ</rt></ruby>ない"],
        ["寄る|よる", "<ruby>寄<rt>よ</rt></ruby>る"],
    ]);
    assert.match(starterEntries["官庁|かんちょう"].notes, /庁 is harder N2 support/);
});

test("tracked starter word data includes the twenty-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["規則|きそく", "規", "き"],
        ["久しい|ひさしい", "久", "ひさしい"],
        ["吸う|すう", "吸", "すう"],
        ["求める|もとめる", "求", "もとめる"],
        ["許す|ゆるす", "許", "ゆるす"],
        ["供える|そなえる", "供", "そなえる"],
        ["玉|たま", "玉", "たま"],
        ["勤務|きんむ", "勤", "きん"],
        ["君|きみ", "君", "きみ"],
        ["新型|しんがた", "型", "がた"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["規則|きそく", "both"],
        ["久しい|ひさしい", "both"],
        ["吸う|すう", "both"],
        ["求める|もとめる", "both"],
        ["許す|ゆるす", "both"],
        ["供える|そなえる", "both"],
        ["玉|たま", "both"],
        ["勤務|きんむ", "both"],
        ["君|きみ", "both"],
        ["新型|しんがた", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["規則|きそく", "<ruby>規<rt>き</rt></ruby><ruby>則<rt>そく</rt></ruby>"],
        ["久しい|ひさしい", "<ruby>久<rt>ひさ</rt></ruby>しい"],
        ["吸う|すう", "<ruby>吸<rt>す</rt></ruby>う"],
        ["求める|もとめる", "<ruby>求<rt>もと</rt></ruby>める"],
        ["許す|ゆるす", "<ruby>許<rt>ゆる</rt></ruby>す"],
        ["供える|そなえる", "<ruby>供<rt>そな</rt></ruby>える"],
        ["玉|たま", "<ruby>玉<rt>たま</rt></ruby>"],
        ["勤務|きんむ", "<ruby>勤<rt>きん</rt></ruby><ruby>務<rt>む</rt></ruby>"],
        ["君|きみ", "<ruby>君<rt>きみ</rt></ruby>"],
        ["新型|しんがた", "<ruby>新<rt>しん</rt></ruby><ruby>型<rt>がた</rt></ruby>"],
    ]);
    assert.match(starterEntries["規則|きそく"].notes, /則 is harder N2 support/);
    assert.match(starterEntries["新型|しんがた"].notes, /新 is easier N4 support/);
});

test("tracked starter word data includes the twenty-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["迎える|むかえる", "迎", "むかえる"],
        ["欠く|かく", "欠", "かく"],
        ["危険|きけん", "険", "けん"],
        ["呼ぶ|よぶ", "呼", "よぶ"],
        ["互い|たがい", "互", "たがい"],
        ["誤る|あやまる", "誤", "あやまる"],
        ["交わす|かわす", "交", "かわす"],
        ["向かう|むかう", "向", "むかう"],
        ["更新|こうしん", "更", "こう"],
        ["港|みなと", "港", "みなと"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["迎える|むかえる", "both"],
        ["欠く|かく", "both"],
        ["危険|きけん", "both"],
        ["呼ぶ|よぶ", "both"],
        ["互い|たがい", "both"],
        ["誤る|あやまる", "both"],
        ["交わす|かわす", "both"],
        ["向かう|むかう", "both"],
        ["更新|こうしん", "both"],
        ["港|みなと", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["迎える|むかえる", "<ruby>迎<rt>むか</rt></ruby>える"],
        ["欠く|かく", "<ruby>欠<rt>か</rt></ruby>く"],
        ["危険|きけん", "<ruby>危<rt>き</rt></ruby><ruby>険<rt>けん</rt></ruby>"],
        ["呼ぶ|よぶ", "<ruby>呼<rt>よ</rt></ruby>ぶ"],
        ["互い|たがい", "<ruby>互<rt>たが</rt></ruby>い"],
        ["誤る|あやまる", "<ruby>誤<rt>あやま</rt></ruby>る"],
        ["交わす|かわす", "<ruby>交<rt>かわ</rt></ruby>す"],
        ["向かう|むかう", "<ruby>向<rt>む</rt></ruby>かう"],
        ["更新|こうしん", "<ruby>更<rt>こう</rt></ruby><ruby>新<rt>しん</rt></ruby>"],
        ["港|みなと", "<ruby>港<rt>みなと</rt></ruby>"],
    ]);
    assert.match(starterEntries["更新|こうしん"].notes, /新 is easier N4 support/);
});

test("tracked starter word data includes the thirtieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["降る|ふる", "降", "ふる"],
        ["骨|ほね", "骨", "ほね"],
        ["込む|こむ", "込", "こむ"],
        ["根|ね", "根", "ね"],
        ["再開|さいかい", "再", "さい"],
        ["妻|つま", "妻", "つま"],
        ["歳|とし", "歳", "とし"],
        ["済む|すむ", "済", "すむ"],
        ["犯罪|はんざい", "罪", "ざい"],
        ["財布|さいふ", "財", "さい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["降る|ふる", "both"],
        ["骨|ほね", "both"],
        ["込む|こむ", "both"],
        ["根|ね", "both"],
        ["再開|さいかい", "both"],
        ["妻|つま", "both"],
        ["歳|とし", "both"],
        ["済む|すむ", "both"],
        ["犯罪|はんざい", "both"],
        ["財布|さいふ", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["降る|ふる", "<ruby>降<rt>ふ</rt></ruby>る"],
        ["骨|ほね", "<ruby>骨<rt>ほね</rt></ruby>"],
        ["込む|こむ", "<ruby>込<rt>こ</rt></ruby>む"],
        ["根|ね", "<ruby>根<rt>ね</rt></ruby>"],
        ["再開|さいかい", "<ruby>再<rt>さい</rt></ruby><ruby>開<rt>かい</rt></ruby>"],
        ["妻|つま", "<ruby>妻<rt>つま</rt></ruby>"],
        ["歳|とし", "<ruby>歳<rt>とし</rt></ruby>"],
        ["済む|すむ", "<ruby>済<rt>す</rt></ruby>む"],
        ["犯罪|はんざい", "<ruby>犯<rt>はん</rt></ruby><ruby>罪<rt>ざい</rt></ruby>"],
        ["財布|さいふ", "<ruby>財<rt>さい</rt></ruby><ruby>布<rt>ふ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the thirty-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["相殺|そうさい", "殺", "さい"],
        ["賛成|さんせい", "賛", "さん"],
        ["残る|のこる", "残", "のこる"],
        ["糸|いと", "糸", "いと"],
        ["寺|てら", "寺", "てら"],
        ["治る|なおる", "治", "なおる"],
        ["示す|しめす", "示", "しめす"],
        ["耳|みみ", "耳", "みみ"],
        ["辞める|やめる", "辞", "やめる"],
        ["捨てる|すてる", "捨", "すてる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["相殺|そうさい", "both"],
        ["賛成|さんせい", "both"],
        ["残る|のこる", "both"],
        ["糸|いと", "both"],
        ["寺|てら", "both"],
        ["治る|なおる", "both"],
        ["示す|しめす", "both"],
        ["耳|みみ", "both"],
        ["辞める|やめる", "both"],
        ["捨てる|すてる", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["相殺|そうさい", "<ruby>相<rt>そう</rt></ruby><ruby>殺<rt>さい</rt></ruby>"],
        ["賛成|さんせい", "<ruby>賛<rt>さん</rt></ruby><ruby>成<rt>せい</rt></ruby>"],
        ["残る|のこる", "<ruby>残<rt>のこ</rt></ruby>る"],
        ["糸|いと", "<ruby>糸<rt>いと</rt></ruby>"],
        ["寺|てら", "<ruby>寺<rt>てら</rt></ruby>"],
        ["治る|なおる", "<ruby>治<rt>なお</rt></ruby>る"],
        ["示す|しめす", "<ruby>示<rt>しめ</rt></ruby>す"],
        ["耳|みみ", "<ruby>耳<rt>みみ</rt></ruby>"],
        ["辞める|やめる", "<ruby>辞<rt>や</rt></ruby>める"],
        ["捨てる|すてる", "<ruby>捨<rt>す</rt></ruby>てる"],
    ]);
});

test("tracked starter word data includes the thirty-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["若い|わかい", "若", "わかい"],
        ["守る|まもる", "守", "まもる"],
        ["拾う|ひろう", "拾", "ひろう"],
        ["処理|しょり", "処", "しょ"],
        ["初めて|はじめて", "初", "はじめて"],
        ["助ける|たすける", "助", "たすける"],
        ["勝つ|かつ", "勝", "かつ"],
        ["招待|しょうたい", "招", "しょう"],
        ["消える|きえる", "消", "きえる"],
        ["焼く|やく", "焼", "やく"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["若い|わかい", "both"],
        ["守る|まもる", "both"],
        ["拾う|ひろう", "both"],
        ["処理|しょり", "both"],
        ["初めて|はじめて", "both"],
        ["助ける|たすける", "both"],
        ["勝つ|かつ", "both"],
        ["招待|しょうたい", "both"],
        ["消える|きえる", "both"],
        ["焼く|やく", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["若い|わかい", "<ruby>若<rt>わか</rt></ruby>い"],
        ["守る|まもる", "<ruby>守<rt>まも</rt></ruby>る"],
        ["拾う|ひろう", "<ruby>拾<rt>ひろ</rt></ruby>う"],
        ["処理|しょり", "<ruby>処<rt>しょ</rt></ruby><ruby>理<rt>り</rt></ruby>"],
        ["初めて|はじめて", "<ruby>初<rt>はじ</rt></ruby>めて"],
        ["助ける|たすける", "<ruby>助<rt>たす</rt></ruby>ける"],
        ["勝つ|かつ", "<ruby>勝<rt>か</rt></ruby>つ"],
        ["招待|しょうたい", "<ruby>招<rt>しょう</rt></ruby><ruby>待<rt>たい</rt></ruby>"],
        ["消える|きえる", "<ruby>消<rt>き</rt></ruby>える"],
        ["焼く|やく", "<ruby>焼<rt>や</rt></ruby>く"],
    ]);
});

test("tracked starter word data includes the thirty-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["省く|はぶく", "省", "はぶく"],
        ["笑う|わらう", "笑", "わらう"],
        ["植える|うえる", "植", "うえる"],
        ["職場|しょくば", "職", "しょく"],
        ["深い|ふかい", "深", "ふかい"],
        ["申し込む|もうしこむ", "申", "もうし"],
        ["吹く|ふく", "吹", "ふく"],
        ["数字|すうじ", "数", "すう"],
        ["制限|せいげん", "制", "せい"],
        ["性格|せいかく", "性", "せい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["省く|はぶく", "both"],
        ["笑う|わらう", "both"],
        ["植える|うえる", "both"],
        ["職場|しょくば", "both"],
        ["深い|ふかい", "both"],
        ["申し込む|もうしこむ", "both"],
        ["吹く|ふく", "both"],
        ["数字|すうじ", "both"],
        ["制限|せいげん", "both"],
        ["性格|せいかく", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["省く|はぶく", "<ruby>省<rt>はぶ</rt></ruby>く"],
        ["笑う|わらう", "<ruby>笑<rt>わら</rt></ruby>う"],
        ["植える|うえる", "<ruby>植<rt>う</rt></ruby>える"],
        ["職場|しょくば", "<ruby>職<rt>しょく</rt></ruby><ruby>場<rt>ば</rt></ruby>"],
        ["深い|ふかい", "<ruby>深<rt>ふか</rt></ruby>い"],
        ["申し込む|もうしこむ", "<ruby>申<rt>もう</rt></ruby>し<ruby>込<rt>こ</rt></ruby>む"],
        ["吹く|ふく", "<ruby>吹<rt>ふ</rt></ruby>く"],
        ["数字|すうじ", "<ruby>数<rt>すう</rt></ruby><ruby>字<rt>じ</rt></ruby>"],
        ["制限|せいげん", "<ruby>制<rt>せい</rt></ruby><ruby>限<rt>げん</rt></ruby>"],
        ["性格|せいかく", "<ruby>性<rt>せい</rt></ruby><ruby>格<rt>かく</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the thirty-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["政治|せいじ", "政", "せい"],
        ["精神|せいしん", "精", "せい"],
        ["昔|むかし", "昔", "むかし"],
        ["積もる|つもる", "積", "つもる"],
        ["責任|せきにん", "責", "せき"],
        ["接続|せつぞく", "接", "せつ"],
        ["折る|おる", "折", "おる"],
        ["雪|ゆき", "雪", "ゆき"],
        ["絶える|たえる", "絶", "たえる"],
        ["戦う|たたかう", "戦", "たたかう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["政治|せいじ", "both"],
        ["精神|せいしん", "both"],
        ["昔|むかし", "both"],
        ["積もる|つもる", "both"],
        ["責任|せきにん", "both"],
        ["接続|せつぞく", "both"],
        ["折る|おる", "both"],
        ["雪|ゆき", "both"],
        ["絶える|たえる", "both"],
        ["戦う|たたかう", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["政治|せいじ", "<ruby>政<rt>せい</rt></ruby><ruby>治<rt>じ</rt></ruby>"],
        ["精神|せいしん", "<ruby>精<rt>せい</rt></ruby><ruby>神<rt>しん</rt></ruby>"],
        ["昔|むかし", "<ruby>昔<rt>むかし</rt></ruby>"],
        ["積もる|つもる", "<ruby>積<rt>つ</rt></ruby>もる"],
        ["責任|せきにん", "<ruby>責<rt>せき</rt></ruby><ruby>任<rt>にん</rt></ruby>"],
        ["接続|せつぞく", "<ruby>接<rt>せつ</rt></ruby><ruby>続<rt>ぞく</rt></ruby>"],
        ["折る|おる", "<ruby>折<rt>お</rt></ruby>る"],
        ["雪|ゆき", "<ruby>雪<rt>ゆき</rt></ruby>"],
        ["絶える|たえる", "<ruby>絶<rt>た</rt></ruby>える"],
        ["戦う|たたかう", "<ruby>戦<rt>たたか</rt></ruby>う"],
    ]);
});

test("tracked starter word data includes the thirty-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["昨年|さくねん", "昨", "さく"],
        ["諸国|しょこく", "諸", "しょ"],
        ["船|ふね", "船", "ふね"],
        ["選ぶ|えらぶ", "選", "えらぶ"],
        ["祖父|そふ", "祖", "そ"],
        ["争う|あらそう", "争", "あらそう"],
        ["窓|まど", "窓", "まど"],
        ["草|くさ", "草", "くさ"],
        ["増える|ふえる", "増", "ふえる"],
        ["反対側|はんたいがわ", "側", "がわ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["昨年|さくねん", "both"],
        ["諸国|しょこく", "both"],
        ["船|ふね", "both"],
        ["選ぶ|えらぶ", "both"],
        ["祖父|そふ", "both"],
        ["争う|あらそう", "both"],
        ["窓|まど", "both"],
        ["草|くさ", "both"],
        ["増える|ふえる", "both"],
        ["反対側|はんたいがわ", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["昨年|さくねん", "<ruby>昨<rt>さく</rt></ruby><ruby>年<rt>ねん</rt></ruby>"],
        ["諸国|しょこく", "<ruby>諸<rt>しょ</rt></ruby><ruby>国<rt>こく</rt></ruby>"],
        ["船|ふね", "<ruby>船<rt>ふね</rt></ruby>"],
        ["選ぶ|えらぶ", "<ruby>選<rt>えら</rt></ruby>ぶ"],
        ["祖父|そふ", "<ruby>祖<rt>そ</rt></ruby><ruby>父<rt>ふ</rt></ruby>"],
        ["争う|あらそう", "<ruby>争<rt>あらそ</rt></ruby>う"],
        ["窓|まど", "<ruby>窓<rt>まど</rt></ruby>"],
        ["草|くさ", "<ruby>草<rt>くさ</rt></ruby>"],
        ["増える|ふえる", "<ruby>増<rt>ふ</rt></ruby>える"],
        ["反対側|はんたいがわ", "<ruby>反<rt>はん</rt></ruby><ruby>対<rt>たい</rt></ruby><ruby>側<rt>がわ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the thirty-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["約束|やくそく", "束", "そく"],
        ["速い|はやい", "速", "はやい"],
        ["続ける|つづける", "続", "つづける"],
        ["存在|そんざい", "存", "そん"],
        ["他|ほか", "他", "ほか"],
        ["打つ|うつ", "打", "うつ"],
        ["相談|そうだん", "談", "だん"],
        ["簡単|かんたん", "単", "たん"],
        ["探す|さがす", "探", "さがす"],
        ["段階|だんかい", "段", "だん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["約束|やくそく", "both"],
        ["速い|はやい", "both"],
        ["続ける|つづける", "both"],
        ["存在|そんざい", "both"],
        ["他|ほか", "both"],
        ["打つ|うつ", "both"],
        ["相談|そうだん", "both"],
        ["簡単|かんたん", "both"],
        ["探す|さがす", "both"],
        ["段階|だんかい", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["約束|やくそく", "<ruby>約<rt>やく</rt></ruby><ruby>束<rt>そく</rt></ruby>"],
        ["速い|はやい", "<ruby>速<rt>はや</rt></ruby>い"],
        ["続ける|つづける", "<ruby>続<rt>つづ</rt></ruby>ける"],
        ["存在|そんざい", "<ruby>存<rt>そん</rt></ruby><ruby>在<rt>ざい</rt></ruby>"],
        ["他|ほか", "<ruby>他<rt>ほか</rt></ruby>"],
        ["打つ|うつ", "<ruby>打<rt>う</rt></ruby>つ"],
        ["相談|そうだん", "<ruby>相<rt>そう</rt></ruby><ruby>談<rt>だん</rt></ruby>"],
        ["簡単|かんたん", "<ruby>簡<rt>かん</rt></ruby><ruby>単<rt>たん</rt></ruby>"],
        ["探す|さがす", "<ruby>探<rt>さが</rt></ruby>す"],
        ["段階|だんかい", "<ruby>段<rt>だん</rt></ruby><ruby>階<rt>かい</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the thirty-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["値段|ねだん", "値", "ね"],
        ["恥ずかしい|はずかしい", "恥", "はずかしい"],
        ["置く|おく", "置", "おく"],
        ["遅い|おそい", "遅", "おそい"],
        ["調べる|しらべる", "調", "しらべる"],
        ["直す|なおす", "直", "なおす"],
        ["痛い|いたい", "痛", "いたい"],
        ["庭|にわ", "庭", "にわ"],
        ["程|ほど", "程", "ほど"],
        ["伝える|つたえる", "伝", "つたえる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["値段|ねだん", "both"],
        ["恥ずかしい|はずかしい", "both"],
        ["置く|おく", "both"],
        ["遅い|おそい", "both"],
        ["調べる|しらべる", "both"],
        ["直す|なおす", "both"],
        ["痛い|いたい", "both"],
        ["庭|にわ", "both"],
        ["程|ほど", "both"],
        ["伝える|つたえる", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["値段|ねだん", "<ruby>値<rt>ね</rt></ruby><ruby>段<rt>だん</rt></ruby>"],
        ["恥ずかしい|はずかしい", "<ruby>恥<rt>は</rt></ruby>ずかしい"],
        ["置く|おく", "<ruby>置<rt>お</rt></ruby>く"],
        ["遅い|おそい", "<ruby>遅<rt>おそ</rt></ruby>い"],
        ["調べる|しらべる", "<ruby>調<rt>しら</rt></ruby>べる"],
        ["直す|なおす", "<ruby>直<rt>なお</rt></ruby>す"],
        ["痛い|いたい", "<ruby>痛<rt>いた</rt></ruby>い"],
        ["庭|にわ", "<ruby>庭<rt>にわ</rt></ruby>"],
        ["程|ほど", "<ruby>程<rt>ほど</rt></ruby>"],
        ["伝える|つたえる", "<ruby>伝<rt>つた</rt></ruby>える"],
    ]);
});

test("tracked starter word data includes the thirty-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["渡る|わたる", "渡", "わたる"],
        ["登る|のぼる", "登", "のぼる"],
        ["努力|どりょく", "努", "ど"],
        ["怒る|おこる", "怒", "おこる"],
        ["投げる|なげる", "投", "なげる"],
        ["盗む|ぬすむ", "盗", "ぬすむ"],
        ["湯|ゆ", "湯", "ゆ"],
        ["等|など", "等", "など"],
        ["到着|とうちゃく", "到", "とう"],
        ["逃げる|にげる", "逃", "にげる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["渡る|わたる", "both"],
        ["登る|のぼる", "both"],
        ["努力|どりょく", "both"],
        ["怒る|おこる", "both"],
        ["投げる|なげる", "both"],
        ["盗む|ぬすむ", "both"],
        ["湯|ゆ", "both"],
        ["等|など", "both"],
        ["到着|とうちゃく", "both"],
        ["逃げる|にげる", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["渡る|わたる", "<ruby>渡<rt>わた</rt></ruby>る"],
        ["登る|のぼる", "<ruby>登<rt>のぼ</rt></ruby>る"],
        ["努力|どりょく", "<ruby>努<rt>ど</rt></ruby><ruby>力<rt>りょく</rt></ruby>"],
        ["怒る|おこる", "<ruby>怒<rt>おこ</rt></ruby>る"],
        ["投げる|なげる", "<ruby>投<rt>な</rt></ruby>げる"],
        ["盗む|ぬすむ", "<ruby>盗<rt>ぬす</rt></ruby>む"],
        ["湯|ゆ", "<ruby>湯<rt>ゆ</rt></ruby>"],
        ["等|など", "<ruby>等<rt>など</rt></ruby>"],
        ["到着|とうちゃく", "<ruby>到<rt>とう</rt></ruby><ruby>着<rt>ちゃく</rt></ruby>"],
        ["逃げる|にげる", "<ruby>逃<rt>に</rt></ruby>げる"],
    ]);
});

test("tracked starter word data includes the thirty-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["任せる|まかせる", "任", "まかせる"],
        ["認める|みとめる", "認", "みとめる"],
        ["熱|ねつ", "熱", "ねつ"],
        ["波|なみ", "波", "なみ"],
        ["破る|やぶる", "破", "やぶる"],
        ["敗れる|やぶれる", "敗", "やぶれる"],
        ["杯|さかずき", "杯", "さかずき"],
        ["配る|くばる", "配", "くばる"],
        ["箱|はこ", "箱", "はこ"],
        ["判断|はんだん", "判", "はん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["任せる|まかせる", "both"],
        ["認める|みとめる", "both"],
        ["熱|ねつ", "both"],
        ["波|なみ", "both"],
        ["破る|やぶる", "both"],
        ["敗れる|やぶれる", "both"],
        ["杯|さかずき", "both"],
        ["配る|くばる", "both"],
        ["箱|はこ", "both"],
        ["判断|はんだん", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["任せる|まかせる", "<ruby>任<rt>まか</rt></ruby>せる"],
        ["認める|みとめる", "<ruby>認<rt>みと</rt></ruby>める"],
        ["熱|ねつ", "<ruby>熱<rt>ねつ</rt></ruby>"],
        ["波|なみ", "<ruby>波<rt>なみ</rt></ruby>"],
        ["破る|やぶる", "<ruby>破<rt>やぶ</rt></ruby>る"],
        ["敗れる|やぶれる", "<ruby>敗<rt>やぶ</rt></ruby>れる"],
        ["杯|さかずき", "<ruby>杯<rt>さかずき</rt></ruby>"],
        ["配る|くばる", "<ruby>配<rt>くば</rt></ruby>る"],
        ["箱|はこ", "<ruby>箱<rt>はこ</rt></ruby>"],
        ["判断|はんだん", "<ruby>判<rt>はん</rt></ruby><ruby>断<rt>だん</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the fortieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["否定|ひてい", "否", "ひ"],
        ["彼|かれ", "彼", "かれ"],
        ["悲しい|かなしい", "悲", "かなしい"],
        ["非|ひ", "非", "ひ"],
        ["飛ぶ|とぶ", "飛", "とぶ"],
        ["美しい|うつくしい", "美", "うつくしい"],
        ["表|おもて", "表", "おもて"],
        ["貧しい|まずしい", "貧", "まずしい"],
        ["付ける|つける", "付", "つける"],
        ["夫|おっと", "夫", "おっと"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["否定|ひてい", "both"],
        ["彼|かれ", "both"],
        ["悲しい|かなしい", "both"],
        ["非|ひ", "both"],
        ["飛ぶ|とぶ", "both"],
        ["美しい|うつくしい", "both"],
        ["表|おもて", "both"],
        ["貧しい|まずしい", "both"],
        ["付ける|つける", "both"],
        ["夫|おっと", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["否定|ひてい", "<ruby>否<rt>ひ</rt></ruby><ruby>定<rt>てい</rt></ruby>"],
        ["彼|かれ", "<ruby>彼<rt>かれ</rt></ruby>"],
        ["悲しい|かなしい", "<ruby>悲<rt>かな</rt></ruby>しい"],
        ["非|ひ", "<ruby>非<rt>ひ</rt></ruby>"],
        ["飛ぶ|とぶ", "<ruby>飛<rt>と</rt></ruby>ぶ"],
        ["美しい|うつくしい", "<ruby>美<rt>うつく</rt></ruby>しい"],
        ["表|おもて", "<ruby>表<rt>おもて</rt></ruby>"],
        ["貧しい|まずしい", "<ruby>貧<rt>まず</rt></ruby>しい"],
        ["付ける|つける", "<ruby>付<rt>つ</rt></ruby>ける"],
        ["夫|おっと", "<ruby>夫<rt>おっと</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the forty-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["夫婦|ふうふ", "婦", "ふ"],
        ["豊富|ほうふ", "富", "ふ"],
        ["怖い|こわい", "怖", "こわい"],
        ["浮かぶ|うかぶ", "浮", "うかぶ"],
        ["負ける|まける", "負", "まける"],
        ["舞台|ぶたい", "舞", "ぶ"],
        ["腹|はら", "腹", "はら"],
        ["並ぶ|ならぶ", "並", "ならぶ"],
        ["米|こめ", "米", "こめ"],
        ["変わる|かわる", "変", "かわる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["夫婦|ふうふ", "both"],
        ["豊富|ほうふ", "both"],
        ["怖い|こわい", "both"],
        ["浮かぶ|うかぶ", "both"],
        ["負ける|まける", "both"],
        ["舞台|ぶたい", "both"],
        ["腹|はら", "both"],
        ["並ぶ|ならぶ", "both"],
        ["米|こめ", "both"],
        ["変わる|かわる", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["夫婦|ふうふ", "<ruby>夫<rt>ふう</rt></ruby><ruby>婦<rt>ふ</rt></ruby>"],
        ["豊富|ほうふ", "<ruby>豊<rt>ほう</rt></ruby><ruby>富<rt>ふ</rt></ruby>"],
        ["怖い|こわい", "<ruby>怖<rt>こわ</rt></ruby>い"],
        ["浮かぶ|うかぶ", "<ruby>浮<rt>う</rt></ruby>かぶ"],
        ["負ける|まける", "<ruby>負<rt>ま</rt></ruby>ける"],
        ["舞台|ぶたい", "<ruby>舞<rt>ぶ</rt></ruby><ruby>台<rt>たい</rt></ruby>"],
        ["腹|はら", "<ruby>腹<rt>はら</rt></ruby>"],
        ["並ぶ|ならぶ", "<ruby>並<rt>なら</rt></ruby>ぶ"],
        ["米|こめ", "<ruby>米<rt>こめ</rt></ruby>"],
        ["変わる|かわる", "<ruby>変<rt>か</rt></ruby>わる"],
    ]);
});

test("tracked starter word data includes the forty-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["一枚|いちまい", "枚", "まい"],
        ["死亡|しぼう", "亡", "ぼう"],
        ["辺|へん", "辺", "へん"],
        ["報告|ほうこく", "報", "ほう"],
        ["忘れる|わすれる", "忘", "わすれる"],
        ["捕まえる|つかまえる", "捕", "つかまえる"],
        ["眠い|ねむい", "眠", "ねむい"],
        ["訪ねる|たずねる", "訪", "たずねる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["一枚|いちまい", "support"],
        ["死亡|しぼう", "support"],
        ["辺|へん", "support"],
        ["報告|ほうこく", "support"],
        ["忘れる|わすれる", "support"],
        ["捕まえる|つかまえる", "support"],
        ["眠い|ねむい", "support"],
        ["訪ねる|たずねる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["一枚|いちまい", "<ruby>一<rt>いち</rt></ruby><ruby>枚<rt>まい</rt></ruby>"],
        ["死亡|しぼう", "<ruby>死<rt>し</rt></ruby><ruby>亡<rt>ぼう</rt></ruby>"],
        ["辺|へん", "<ruby>辺<rt>へん</rt></ruby>"],
        ["報告|ほうこく", "<ruby>報<rt>ほう</rt></ruby><ruby>告<rt>こく</rt></ruby>"],
        ["忘れる|わすれる", "<ruby>忘<rt>わす</rt></ruby>れる"],
        ["捕まえる|つかまえる", "<ruby>捕<rt>つか</rt></ruby>まえる"],
        ["眠い|ねむい", "<ruby>眠<rt>ねむ</rt></ruby>い"],
        ["訪ねる|たずねる", "<ruby>訪<rt>たず</rt></ruby>ねる"],
    ]);
});

test("tracked starter word data includes the forty-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["貿易|ぼうえき", "易", "えき"],
        ["暗雲|あんうん", "雲", "うん"],
        ["優越感|ゆうえつかん", "越", "えつ"],
        ["越年|おつねん", "越", "おつ"],
        ["奥義|おうぎ", "奥", "おう"],
        ["押収|おうしゅう", "押", "おう"],
        ["卵黄|らんおう", "黄", "おう"],
        ["黄砂|こうさ", "黄", "こう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["貿易|ぼうえき", "support"],
        ["暗雲|あんうん", "support"],
        ["優越感|ゆうえつかん", "support"],
        ["越年|おつねん", "support"],
        ["奥義|おうぎ", "support"],
        ["押収|おうしゅう", "support"],
        ["卵黄|らんおう", "support"],
        ["黄砂|こうさ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["貿易|ぼうえき", "<ruby>貿<rt>ぼう</rt></ruby><ruby>易<rt>えき</rt></ruby>"],
        ["暗雲|あんうん", "<ruby>暗<rt>あん</rt></ruby><ruby>雲<rt>うん</rt></ruby>"],
        ["優越感|ゆうえつかん", "<ruby>優<rt>ゆう</rt></ruby><ruby>越<rt>えつ</rt></ruby><ruby>感<rt>かん</rt></ruby>"],
        ["越年|おつねん", "<ruby>越<rt>おつ</rt></ruby><ruby>年<rt>ねん</rt></ruby>"],
        ["奥義|おうぎ", "<ruby>奥<rt>おう</rt></ruby><ruby>義<rt>ぎ</rt></ruby>"],
        ["押収|おうしゅう", "<ruby>押<rt>おう</rt></ruby><ruby>収<rt>しゅう</rt></ruby>"],
        ["卵黄|らんおう", "<ruby>卵<rt>らん</rt></ruby><ruby>黄<rt>おう</rt></ruby>"],
        ["黄砂|こうさ", "<ruby>黄<rt>こう</rt></ruby><ruby>砂<rt>さ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the forty-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["出荷|しゅっか", "荷", "か"],
        ["過程|かてい", "過", "か"],
        ["解熱剤|げねつざい", "解", "げ"],
        ["皆無|かいむ", "皆", "かい"],
        ["格子|こうし", "格", "こう"],
        ["分割|ぶんかつ", "割", "かつ"],
        ["岩石|がんせき", "岩", "がん"],
        ["願望|がんぼう", "願", "がん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["出荷|しゅっか", "support"],
        ["過程|かてい", "support"],
        ["解熱剤|げねつざい", "support"],
        ["皆無|かいむ", "support"],
        ["格子|こうし", "support"],
        ["分割|ぶんかつ", "support"],
        ["岩石|がんせき", "support"],
        ["願望|がんぼう", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["出荷|しゅっか", "<ruby>出<rt>しゅっ</rt></ruby><ruby>荷<rt>か</rt></ruby>"],
        ["過程|かてい", "<ruby>過<rt>か</rt></ruby><ruby>程<rt>てい</rt></ruby>"],
        ["解熱剤|げねつざい", "<ruby>解<rt>げ</rt></ruby><ruby>熱<rt>ねつ</rt></ruby><ruby>剤<rt>ざい</rt></ruby>"],
        ["皆無|かいむ", "<ruby>皆<rt>かい</rt></ruby><ruby>無<rt>む</rt></ruby>"],
        ["格子|こうし", "<ruby>格<rt>こう</rt></ruby><ruby>子<rt>し</rt></ruby>"],
        ["分割|ぶんかつ", "<ruby>分<rt>ぶん</rt></ruby><ruby>割<rt>かつ</rt></ruby>"],
        ["岩石|がんせき", "<ruby>岩<rt>がん</rt></ruby><ruby>石<rt>せき</rt></ruby>"],
        ["願望|がんぼう", "<ruby>願<rt>がん</rt></ruby><ruby>望<rt>ぼう</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the forty-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["危機|きき", "危", "き"],
        ["幾何学|きかがく", "幾", "き"],
        ["要求|ようきゅう", "求", "きゅう"],
        ["許可|きょか", "許", "きょ"],
        ["供養|くよう", "供", "く"],
        ["関係|かんけい", "係", "けい"],
        ["典型|てんけい", "型", "けい"],
        ["不可欠|ふかけつ", "欠", "けつ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["危機|きき", "support"],
        ["幾何学|きかがく", "support"],
        ["要求|ようきゅう", "support"],
        ["許可|きょか", "support"],
        ["供養|くよう", "support"],
        ["関係|かんけい", "support"],
        ["典型|てんけい", "support"],
        ["不可欠|ふかけつ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["危機|きき", "<ruby>危<rt>き</rt></ruby><ruby>機<rt>き</rt></ruby>"],
        ["幾何学|きかがく", "<ruby>幾<rt>き</rt></ruby><ruby>何<rt>か</rt></ruby><ruby>学<rt>がく</rt></ruby>"],
        ["要求|ようきゅう", "<ruby>要<rt>よう</rt></ruby><ruby>求<rt>きゅう</rt></ruby>"],
        ["許可|きょか", "<ruby>許<rt>きょ</rt></ruby><ruby>可<rt>か</rt></ruby>"],
        ["供養|くよう", "<ruby>供<rt>く</rt></ruby><ruby>養<rt>よう</rt></ruby>"],
        ["関係|かんけい", "<ruby>関<rt>かん</rt></ruby><ruby>係<rt>けい</rt></ruby>"],
        ["典型|てんけい", "<ruby>典<rt>てん</rt></ruby><ruby>型<rt>けい</rt></ruby>"],
        ["不可欠|ふかけつ", "<ruby>不<rt>ふ</rt></ruby><ruby>可<rt>か</rt></ruby><ruby>欠<rt>けつ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the forty-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["君主|くんしゅ", "君", "くん"],
        ["経典|きょうてん", "経", "きょう"],
        ["権化|ごんげ", "権", "ごん"],
        ["相互|そうご", "互", "ご"],
        ["港湾|こうわん", "港", "こう"],
        ["以降|いこう", "降", "こう"],
        ["香水|こうすい", "香", "こう"],
        ["根拠|こんきょ", "根", "こん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["君主|くんしゅ", "support"],
        ["経典|きょうてん", "support"],
        ["権化|ごんげ", "support"],
        ["相互|そうご", "support"],
        ["港湾|こうわん", "support"],
        ["以降|いこう", "support"],
        ["香水|こうすい", "support"],
        ["根拠|こんきょ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["君主|くんしゅ", "<ruby>君<rt>くん</rt></ruby><ruby>主<rt>しゅ</rt></ruby>"],
        ["経典|きょうてん", "<ruby>経<rt>きょう</rt></ruby><ruby>典<rt>てん</rt></ruby>"],
        ["権化|ごんげ", "<ruby>権<rt>ごん</rt></ruby><ruby>化<rt>げ</rt></ruby>"],
        ["相互|そうご", "<ruby>相<rt>そう</rt></ruby><ruby>互<rt>ご</rt></ruby>"],
        ["港湾|こうわん", "<ruby>港<rt>こう</rt></ruby><ruby>湾<rt>わん</rt></ruby>"],
        ["以降|いこう", "<ruby>以<rt>い</rt></ruby><ruby>降<rt>こう</rt></ruby>"],
        ["香水|こうすい", "<ruby>香<rt>こう</rt></ruby><ruby>水<rt>すい</rt></ruby>"],
        ["根拠|こんきょ", "<ruby>根<rt>こん</rt></ruby><ruby>拠<rt>きょ</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the forty-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["骨盤|こつばん", "骨", "こつ"],
        ["夫妻|ふさい", "妻", "さい"],
        ["歳|さい", "歳", "さい"],
        ["返済|へんさい", "済", "さい"],
        ["雑煮|ぞうに", "雑", "ぞう"],
        ["残業|ざんぎょう", "残", "ざん"],
        ["寺院|じいん", "寺", "じ"],
        ["政治|せいじ", "治", "じ"],
        ["治療|ちりょう", "治", "ち"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["骨盤|こつばん", "support"],
        ["夫妻|ふさい", "support"],
        ["歳|さい", "support"],
        ["返済|へんさい", "support"],
        ["雑煮|ぞうに", "support"],
        ["残業|ざんぎょう", "support"],
        ["寺院|じいん", "support"],
        ["政治|せいじ", "both"],
        ["治療|ちりょう", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["骨盤|こつばん", "<ruby>骨<rt>こつ</rt></ruby><ruby>盤<rt>ばん</rt></ruby>"],
        ["夫妻|ふさい", "<ruby>夫<rt>ふ</rt></ruby><ruby>妻<rt>さい</rt></ruby>"],
        ["歳|さい", "<ruby>歳<rt>さい</rt></ruby>"],
        ["返済|へんさい", "<ruby>返<rt>へん</rt></ruby><ruby>済<rt>さい</rt></ruby>"],
        ["雑煮|ぞうに", "<ruby>雑<rt>ぞう</rt></ruby><ruby>煮<rt>に</rt></ruby>"],
        ["残業|ざんぎょう", "<ruby>残<rt>ざん</rt></ruby><ruby>業<rt>ぎょう</rt></ruby>"],
        ["寺院|じいん", "<ruby>寺<rt>じ</rt></ruby><ruby>院<rt>いん</rt></ruby>"],
        ["政治|せいじ", "<ruby>政<rt>せい</rt></ruby><ruby>治<rt>じ</rt></ruby>"],
        ["治療|ちりょう", "<ruby>治<rt>ち</rt></ruby><ruby>療<rt>りょう</rt></ruby>"],
    ]);
});

test("tracked starter word data includes the forty-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["夫婦|ふうふ", "夫", "ふう"],
        ["精神|せいしん", "神", "しん"],
        ["変化|へんか", "変", "へん"],
        ["接続|せつぞく", "続", "ぞく"],
        ["過程|かてい", "程", "てい"],
        ["責任|せきにん", "任", "にん"],
        ["夫妻|ふさい", "夫", "ふ"],
        ["優越感|ゆうえつかん", "優", "ゆう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["夫婦|ふうふ", "both"],
        ["精神|せいしん", "both"],
        ["変化|へんか", "support"],
        ["接続|せつぞく", "both"],
        ["過程|かてい", "support"],
        ["責任|せきにん", "both"],
        ["夫妻|ふさい", "support"],
        ["優越感|ゆうえつかん", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["夫婦|ふうふ", "<ruby>夫<rt>ふう</rt></ruby><ruby>婦<rt>ふ</rt></ruby>"],
        ["精神|せいしん", "<ruby>精<rt>せい</rt></ruby><ruby>神<rt>しん</rt></ruby>"],
        ["変化|へんか", "<ruby>変<rt>へん</rt></ruby><ruby>化<rt>か</rt></ruby>"],
        ["接続|せつぞく", "<ruby>接<rt>せつ</rt></ruby><ruby>続<rt>ぞく</rt></ruby>"],
        ["過程|かてい", "<ruby>過<rt>か</rt></ruby><ruby>程<rt>てい</rt></ruby>"],
        ["責任|せきにん", "<ruby>責<rt>せき</rt></ruby><ruby>任<rt>にん</rt></ruby>"],
        ["夫妻|ふさい", "<ruby>夫<rt>ふ</rt></ruby><ruby>妻<rt>さい</rt></ruby>"],
        ["優越感|ゆうえつかん", "<ruby>優<rt>ゆう</rt></ruby><ruby>越<rt>えつ</rt></ruby><ruby>感<rt>かん</rt></ruby>"],
    ]);
    assert.match(starterEntries["変化|へんか"].notes, /Tanos N3 row is only a discovery\/weak level hint/);
});

test("tracked starter word data includes the forty-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["歳暮|せいぼ", "歳", "せい"],
        ["耳鼻科|じびか", "耳", "じ"],
        ["辞任|じにん", "辞", "じ"],
        ["若年|じゃくねん", "若", "じゃく"],
        ["取得|しゅとく", "取", "しゅ"],
        ["保守|ほしゅ", "守", "しゅ"],
        ["留守|るす", "守", "す"],
        ["飲酒|いんしゅ", "酒", "しゅ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["歳暮|せいぼ", "support"],
        ["耳鼻科|じびか", "support"],
        ["辞任|じにん", "support"],
        ["若年|じゃくねん", "support"],
        ["取得|しゅとく", "support"],
        ["保守|ほしゅ", "support"],
        ["留守|るす", "support"],
        ["飲酒|いんしゅ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["歳暮|せいぼ", "<ruby>歳<rt>せい</rt></ruby><ruby>暮<rt>ぼ</rt></ruby>"],
        ["耳鼻科|じびか", "<ruby>耳<rt>じ</rt></ruby><ruby>鼻<rt>び</rt></ruby><ruby>科<rt>か</rt></ruby>"],
        ["辞任|じにん", "<ruby>辞<rt>じ</rt></ruby><ruby>任<rt>にん</rt></ruby>"],
        ["若年|じゃくねん", "<ruby>若<rt>じゃく</rt></ruby><ruby>年<rt>ねん</rt></ruby>"],
        ["取得|しゅとく", "<ruby>取<rt>しゅ</rt></ruby><ruby>得<rt>とく</rt></ruby>"],
        ["保守|ほしゅ", "<ruby>保<rt>ほ</rt></ruby><ruby>守<rt>しゅ</rt></ruby>"],
        ["留守|るす", "<ruby>留<rt>る</rt></ruby><ruby>守<rt>す</rt></ruby>"],
        ["飲酒|いんしゅ", "<ruby>飲<rt>いん</rt></ruby><ruby>酒<rt>しゅ</rt></ruby>"],
    ]);
    assert.match(starterEntries["辞任|じにん"].notes, /Existing frozen N5 辞書\|じしょ remains untouched/);
});

test("tracked starter word data includes the fiftieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["歳暮|せいぼ", "暮", "ぼ"],
        ["留守|るす", "留", "る"],
        ["収拾|しゅうしゅう", "拾", "しゅう"],
        ["最初|さいしょ", "初", "しょ"],
        ["勝利|しょうり", "勝", "しょう"],
        ["消費|しょうひ", "消", "しょう"],
        ["燃焼|ねんしょう", "焼", "しょう"],
        ["植物|しょくぶつ", "植", "しょく"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["歳暮|せいぼ", "support"],
        ["留守|るす", "support"],
        ["収拾|しゅうしゅう", "support"],
        ["最初|さいしょ", "support"],
        ["勝利|しょうり", "support"],
        ["消費|しょうひ", "support"],
        ["燃焼|ねんしょう", "support"],
        ["植物|しょくぶつ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["歳暮|せいぼ", "<ruby>歳<rt>せい</rt></ruby><ruby>暮<rt>ぼ</rt></ruby>"],
        ["留守|るす", "<ruby>留<rt>る</rt></ruby><ruby>守<rt>す</rt></ruby>"],
        ["収拾|しゅうしゅう", "<ruby>収<rt>しゅう</rt></ruby><ruby>拾<rt>しゅう</rt></ruby>"],
        ["最初|さいしょ", "<ruby>最<rt>さい</rt></ruby><ruby>初<rt>しょ</rt></ruby>"],
        ["勝利|しょうり", "<ruby>勝<rt>しょう</rt></ruby><ruby>利<rt>り</rt></ruby>"],
        ["消費|しょうひ", "<ruby>消<rt>しょう</rt></ruby><ruby>費<rt>ひ</rt></ruby>"],
        ["燃焼|ねんしょう", "<ruby>燃<rt>ねん</rt></ruby><ruby>焼<rt>しょう</rt></ruby>"],
        ["植物|しょくぶつ", "<ruby>植<rt>しょく</rt></ruby><ruby>物<rt>ぶつ</rt></ruby>"],
    ]);
    assert.match(starterEntries["最初|さいしょ"].notes, /Existing frozen N4 初夏\|しょか remains untouched/);
    assert.match(starterEntries["燃焼|ねんしょう"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["消費|しょうひ"].notes, /Tanos N3 row is only a discovery\/weak level hint/);
});

test("tracked starter word data includes the fifty-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["取捨|しゅしゃ", "捨", "しゃ"],
        ["端緒|たんちょ", "緒", "ちょ"],
        ["省略|しょうりゃく", "省", "しょう"],
        ["反省|はんせい", "省", "せい"],
        ["爆笑|ばくしょう", "笑", "しょう"],
        ["深刻|しんこく", "深", "しん"],
        ["申請|しんせい", "申", "しん"],
        ["吹奏楽|すいそうがく", "吹", "すい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["取捨|しゅしゃ", "support"],
        ["端緒|たんちょ", "support"],
        ["省略|しょうりゃく", "support"],
        ["反省|はんせい", "support"],
        ["爆笑|ばくしょう", "support"],
        ["深刻|しんこく", "support"],
        ["申請|しんせい", "support"],
        ["吹奏楽|すいそうがく", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["取捨|しゅしゃ", "<ruby>取<rt>しゅ</rt></ruby><ruby>捨<rt>しゃ</rt></ruby>"],
        ["端緒|たんちょ", "<ruby>端<rt>たん</rt></ruby><ruby>緒<rt>ちょ</rt></ruby>"],
        ["省略|しょうりゃく", "<ruby>省<rt>しょう</rt></ruby><ruby>略<rt>りゃく</rt></ruby>"],
        ["反省|はんせい", "<ruby>反<rt>はん</rt></ruby><ruby>省<rt>せい</rt></ruby>"],
        ["爆笑|ばくしょう", "<ruby>爆<rt>ばく</rt></ruby><ruby>笑<rt>しょう</rt></ruby>"],
        ["深刻|しんこく", "<ruby>深<rt>しん</rt></ruby><ruby>刻<rt>こく</rt></ruby>"],
        ["申請|しんせい", "<ruby>申<rt>しん</rt></ruby><ruby>請<rt>せい</rt></ruby>"],
        ["吹奏楽|すいそうがく", "<ruby>吹<rt>すい</rt></ruby><ruby>奏<rt>そう</rt></ruby><ruby>楽<rt>がく</rt></ruby>"],
    ]);
    assert.match(starterEntries["端緒|たんちょ"].notes, /alternate 端緒\|たんしょ row exists/);
    assert.match(starterEntries["省略|しょうりゃく"].notes, /Tanos N2 row is only a harder-level discovery hint/);
    assert.match(starterEntries["吹奏楽|すいそうがく"].notes, /lower-priority but recognizable school\/music support word/);
});

test("tracked starter word data includes the fifty-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["面積|めんせき", "積", "せき"],
        ["絶滅|ぜつめつ", "絶", "ぜつ"],
        ["温泉|おんせん", "泉", "せん"],
        ["選択|せんたく", "選", "せん"],
        ["天然|てんねん", "然", "ねん"],
        ["増加|ぞうか", "増", "ぞう"],
        ["保存|ほぞん", "存", "ぞん"],
        ["遅刻|ちこく", "遅", "ち"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["面積|めんせき", "support"],
        ["絶滅|ぜつめつ", "support"],
        ["温泉|おんせん", "support"],
        ["選択|せんたく", "support"],
        ["天然|てんねん", "support"],
        ["増加|ぞうか", "support"],
        ["保存|ほぞん", "support"],
        ["遅刻|ちこく", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["面積|めんせき", "<ruby>面<rt>めん</rt></ruby><ruby>積<rt>せき</rt></ruby>"],
        ["絶滅|ぜつめつ", "<ruby>絶<rt>ぜつ</rt></ruby><ruby>滅<rt>めつ</rt></ruby>"],
        ["温泉|おんせん", "<ruby>温<rt>おん</rt></ruby><ruby>泉<rt>せん</rt></ruby>"],
        ["選択|せんたく", "<ruby>選<rt>せん</rt></ruby><ruby>択<rt>たく</rt></ruby>"],
        ["天然|てんねん", "<ruby>天<rt>てん</rt></ruby><ruby>然<rt>ねん</rt></ruby>"],
        ["増加|ぞうか", "<ruby>増<rt>ぞう</rt></ruby><ruby>加<rt>か</rt></ruby>"],
        ["保存|ほぞん", "<ruby>保<rt>ほ</rt></ruby><ruby>存<rt>ぞん</rt></ruby>"],
        ["遅刻|ちこく", "<ruby>遅<rt>ち</rt></ruby><ruby>刻<rt>こく</rt></ruby>"],
    ]);
    assert.match(starterEntries["面積|めんせき"].notes, /Tanos N2 row is only a harder-level discovery hint/);
    assert.match(starterEntries["選択|せんたく"].notes, /Existing frozen N4 選手\|せんしゅ remains untouched/);
    assert.match(starterEntries["絶滅|ぜつめつ"].notes, /Tanos N3 row is only a discovery\/weak level hint/);
});

test("tracked starter word data includes the fifty-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["相性|あいしょう", "性", "しょう"],
        ["不精|ぶしょう", "精", "しょう"],
        ["積雪|せきせつ", "雪", "せつ"],
        ["戦争|せんそう", "戦", "せん"],
        ["船長|せんちょう", "船", "せん"],
        ["組織|そしき", "組", "そ"],
        ["首相|しゅしょう", "相", "しょう"],
        ["草原|そうげん", "草", "そう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["相性|あいしょう", "support"],
        ["不精|ぶしょう", "support"],
        ["積雪|せきせつ", "support"],
        ["戦争|せんそう", "support"],
        ["船長|せんちょう", "support"],
        ["組織|そしき", "support"],
        ["首相|しゅしょう", "support"],
        ["草原|そうげん", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["相性|あいしょう", "<ruby>相<rt>あい</rt></ruby><ruby>性<rt>しょう</rt></ruby>"],
        ["不精|ぶしょう", "<ruby>不<rt>ぶ</rt></ruby><ruby>精<rt>しょう</rt></ruby>"],
        ["積雪|せきせつ", "<ruby>積<rt>せき</rt></ruby><ruby>雪<rt>せつ</rt></ruby>"],
        ["戦争|せんそう", "<ruby>戦<rt>せん</rt></ruby><ruby>争<rt>そう</rt></ruby>"],
        ["船長|せんちょう", "<ruby>船<rt>せん</rt></ruby><ruby>長<rt>ちょう</rt></ruby>"],
        ["組織|そしき", "<ruby>組<rt>そ</rt></ruby><ruby>織<rt>しき</rt></ruby>"],
        ["首相|しゅしょう", "<ruby>首<rt>しゅ</rt></ruby><ruby>相<rt>しょう</rt></ruby>"],
        ["草原|そうげん", "<ruby>草<rt>そう</rt></ruby><ruby>原<rt>げん</rt></ruby>"],
    ]);
    assert.match(starterEntries["相性|あいしょう"].notes, /not the unprioritized five-elements readings/);
    assert.match(starterEntries["船長|せんちょう"].notes, /alternate 船長\|ふなおさ row exists/);
    assert.match(starterEntries["組織|そしき"].notes, /Tanos N3 row is only a discovery\/weak level hint/);
});

test("tracked starter word data includes the fifty-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["同窓会|どうそうかい", "窓", "そう"],
        ["側面|そくめん", "側", "そく"],
        ["休息|きゅうそく", "息", "そく"],
        ["他人|たにん", "他", "た"],
        ["打撃|だげき", "打", "だ"],
        ["対|つい", "対", "つい"],
        ["携帯|けいたい", "帯", "たい"],
        ["探検|たんけん", "探", "たん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["同窓会|どうそうかい", "support"],
        ["側面|そくめん", "support"],
        ["休息|きゅうそく", "support"],
        ["他人|たにん", "support"],
        ["打撃|だげき", "support"],
        ["対|つい", "support"],
        ["携帯|けいたい", "support"],
        ["探検|たんけん", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["同窓会|どうそうかい", "<ruby>同<rt>どう</rt></ruby><ruby>窓<rt>そう</rt></ruby><ruby>会<rt>かい</rt></ruby>"],
        ["側面|そくめん", "<ruby>側<rt>そく</rt></ruby><ruby>面<rt>めん</rt></ruby>"],
        ["休息|きゅうそく", "<ruby>休<rt>きゅう</rt></ruby><ruby>息<rt>そく</rt></ruby>"],
        ["他人|たにん", "<ruby>他<rt>た</rt></ruby><ruby>人<rt>にん</rt></ruby>"],
        ["打撃|だげき", "<ruby>打<rt>だ</rt></ruby><ruby>撃<rt>げき</rt></ruby>"],
        ["対|つい", "<ruby>対<rt>つい</rt></ruby>"],
        ["携帯|けいたい", "<ruby>携<rt>けい</rt></ruby><ruby>帯<rt>たい</rt></ruby>"],
        ["探検|たんけん", "<ruby>探<rt>たん</rt></ruby><ruby>検<rt>けん</rt></ruby>"],
    ]);
    assert.match(starterEntries["対|つい"].notes, /single-kanji support card is kept/);
    assert.match(starterEntries["同窓会|どうそうかい"].notes, /more learner-facing than narrower 車窓-style window terms/);
    assert.match(starterEntries["携帯|けいたい"].notes, /Tanos N1 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the fifty-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["羞恥|しゅうち", "恥", "ち"],
        ["頂上|ちょうじょう", "頂", "ちょう"],
        ["正直|しょうじき", "直", "じき"],
        ["直接|ちょくせつ", "直", "ちょく"],
        ["追加|ついか", "追", "つい"],
        ["庭園|ていえん", "庭", "てい"],
        ["伝統|でんとう", "伝", "でん"],
        ["登山|とざん", "登", "と"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["羞恥|しゅうち", "support"],
        ["頂上|ちょうじょう", "support"],
        ["正直|しょうじき", "support"],
        ["直接|ちょくせつ", "support"],
        ["追加|ついか", "support"],
        ["庭園|ていえん", "support"],
        ["伝統|でんとう", "support"],
        ["登山|とざん", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["羞恥|しゅうち", "<ruby>羞<rt>しゅう</rt></ruby><ruby>恥<rt>ち</rt></ruby>"],
        ["頂上|ちょうじょう", "<ruby>頂<rt>ちょう</rt></ruby><ruby>上<rt>じょう</rt></ruby>"],
        ["正直|しょうじき", "<ruby>正<rt>しょう</rt></ruby><ruby>直<rt>じき</rt></ruby>"],
        ["直接|ちょくせつ", "<ruby>直<rt>ちょく</rt></ruby><ruby>接<rt>せつ</rt></ruby>"],
        ["追加|ついか", "<ruby>追<rt>つい</rt></ruby><ruby>加<rt>か</rt></ruby>"],
        ["庭園|ていえん", "<ruby>庭<rt>てい</rt></ruby><ruby>園<rt>えん</rt></ruby>"],
        ["伝統|でんとう", "<ruby>伝<rt>でん</rt></ruby><ruby>統<rt>とう</rt></ruby>"],
        ["登山|とざん", "<ruby>登<rt>と</rt></ruby><ruby>山<rt>ざん</rt></ruby>"],
    ]);
    assert.match(starterEntries["羞恥|しゅうち"].notes, /formal but still learner-facing emotion vocabulary/);
    assert.match(starterEntries["庭園|ていえん"].notes, /Existing frozen N4 家庭\|かてい remains untouched/);
    assert.match(starterEntries["伝統|でんとう"].notes, /Existing frozen N4 伝言\|でんごん remains untouched/);
    assert.match(starterEntries["追加|ついか"].notes, /Tanos N2 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the fifty-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["渡航|とこう", "渡", "と"],
        ["怒鳴る|どなる", "怒", "ど"],
        ["投票|とうひょう", "投", "とう"],
        ["銭湯|せんとう", "湯", "とう"],
        ["同等|どうとう", "等", "とう"],
        ["逃走|とうそう", "逃", "とう"],
        ["波乱|はらん", "波", "は"],
        ["破壊|はかい", "破", "は"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["渡航|とこう", "support"],
        ["怒鳴る|どなる", "support"],
        ["投票|とうひょう", "support"],
        ["銭湯|せんとう", "support"],
        ["同等|どうとう", "support"],
        ["逃走|とうそう", "support"],
        ["波乱|はらん", "support"],
        ["破壊|はかい", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["渡航|とこう", "<ruby>渡<rt>と</rt></ruby><ruby>航<rt>こう</rt></ruby>"],
        ["怒鳴る|どなる", "<ruby>怒<rt>ど</rt></ruby><ruby>鳴<rt>な</rt></ruby>る"],
        ["投票|とうひょう", "<ruby>投<rt>とう</rt></ruby><ruby>票<rt>ひょう</rt></ruby>"],
        ["銭湯|せんとう", "<ruby>銭<rt>せん</rt></ruby><ruby>湯<rt>とう</rt></ruby>"],
        ["同等|どうとう", "<ruby>同<rt>どう</rt></ruby><ruby>等<rt>とう</rt></ruby>"],
        ["逃走|とうそう", "<ruby>逃<rt>とう</rt></ruby><ruby>走<rt>そう</rt></ruby>"],
        ["波乱|はらん", "<ruby>波<rt>は</rt></ruby><ruby>乱<rt>らん</rt></ruby>"],
        ["破壊|はかい", "<ruby>破<rt>は</rt></ruby><ruby>壊<rt>かい</rt></ruby>"],
    ]);
    assert.match(starterEntries["渡航|とこう"].notes, /broader learner-facing travel vocabulary than country-specific 渡米/);
    assert.match(starterEntries["銭湯|せんとう"].notes, /more learner-facing cultural vocabulary than narrow hot-water technical rows/);
    assert.match(starterEntries["波乱|はらん"].notes, /more general learner-facing vocabulary than technical 波長/);
    assert.match(starterEntries["怒鳴る|どなる"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["破壊|はかい"].notes, /Tanos N1 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the fifty-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["乗馬|じょうば", "馬", "ば"],
        ["敗北|はいぼく", "敗", "はい"],
        ["杯|はい", "杯", "はい"],
        ["背景|はいけい", "背", "はい"],
        ["反物|たんもの", "反", "たん"],
        ["彼岸|ひがん", "彼", "ひ"],
        ["悲劇|ひげき", "悲", "ひ"],
        ["必要|ひつよう", "必", "ひつ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["乗馬|じょうば", "support"],
        ["敗北|はいぼく", "support"],
        ["杯|はい", "support"],
        ["背景|はいけい", "support"],
        ["反物|たんもの", "support"],
        ["彼岸|ひがん", "support"],
        ["悲劇|ひげき", "support"],
        ["必要|ひつよう", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["乗馬|じょうば", "<ruby>乗<rt>じょう</rt></ruby><ruby>馬<rt>ば</rt></ruby>"],
        ["敗北|はいぼく", "<ruby>敗<rt>はい</rt></ruby><ruby>北<rt>ぼく</rt></ruby>"],
        ["杯|はい", "<ruby>杯<rt>はい</rt></ruby>"],
        ["背景|はいけい", "<ruby>背<rt>はい</rt></ruby><ruby>景<rt>けい</rt></ruby>"],
        ["反物|たんもの", "<ruby>反<rt>たん</rt></ruby><ruby>物<rt>もの</rt></ruby>"],
        ["彼岸|ひがん", "<ruby>彼<rt>ひ</rt></ruby><ruby>岸<rt>がん</rt></ruby>"],
        ["悲劇|ひげき", "<ruby>悲<rt>ひ</rt></ruby><ruby>劇<rt>げき</rt></ruby>"],
        ["必要|ひつよう", "<ruby>必<rt>ひつ</rt></ruby><ruby>要<rt>よう</rt></ruby>"],
    ]);
    assert.match(starterEntries["乗馬|じょうば"].notes, /avoids the more gambling-specific 競馬 row/);
    assert.match(starterEntries["杯|はい"].notes, /existing 杯\|さかずき row covers a different word-reading identity/);
    assert.match(starterEntries["反物|たんもの"].notes, /concrete clothing\/material vocabulary rather than agricultural 減反/);
    assert.match(starterEntries["彼岸|ひがん"].notes, /concrete Japanese culture\/calendar term/);
    assert.match(starterEntries["必要|ひつよう"].notes, /promoted from governed dictionary evidence without needing a Tanos row/);
});

test("tracked starter word data includes the fifty-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["表現|ひょうげん", "表", "ひょう"],
        ["貧困|ひんこん", "貧", "ひん"],
        ["貧乏|びんぼう", "貧", "びん"],
        ["丈夫|じょうぶ", "夫", "ぶ"],
        ["浮上|ふじょう", "浮", "ふ"],
        ["負担|ふたん", "負", "ふ"],
        ["腹痛|ふくつう", "腹", "ふく"],
        ["並行|へいこう", "並", "へい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["表現|ひょうげん", "support"],
        ["貧困|ひんこん", "support"],
        ["貧乏|びんぼう", "support"],
        ["丈夫|じょうぶ", "support"],
        ["浮上|ふじょう", "support"],
        ["負担|ふたん", "support"],
        ["腹痛|ふくつう", "support"],
        ["並行|へいこう", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["表現|ひょうげん", "<ruby>表<rt>ひょう</rt></ruby><ruby>現<rt>げん</rt></ruby>"],
        ["貧困|ひんこん", "<ruby>貧<rt>ひん</rt></ruby><ruby>困<rt>こん</rt></ruby>"],
        ["貧乏|びんぼう", "<ruby>貧<rt>びん</rt></ruby><ruby>乏<rt>ぼう</rt></ruby>"],
        ["丈夫|じょうぶ", "<ruby>丈<rt>じょう</rt></ruby><ruby>夫<rt>ぶ</rt></ruby>"],
        ["浮上|ふじょう", "<ruby>浮<rt>ふ</rt></ruby><ruby>上<rt>じょう</rt></ruby>"],
        ["負担|ふたん", "<ruby>負<rt>ふ</rt></ruby><ruby>担<rt>たん</rt></ruby>"],
        ["腹痛|ふくつう", "<ruby>腹<rt>ふく</rt></ruby><ruby>痛<rt>つう</rt></ruby>"],
        ["並行|へいこう", "<ruby>並<rt>へい</rt></ruby><ruby>行<rt>こう</rt></ruby>"],
    ]);
    assert.match(starterEntries["表現|ひょうげん"].notes, /Tanos N3 row is only a discovery\/weak level hint/);
    assert.match(starterEntries["貧乏|びんぼう"].notes, /covers 貧 -> びん separately from 貧困\|ひんこん/);
    assert.match(starterEntries["丈夫|じょうぶ"].notes, /Tanos normalized row found live uses 丈夫\|じょうふ/);
    assert.match(starterEntries["浮上|ふじょう"].notes, /rather than narrower 浮浪者 or technical buoyancy rows/);
    assert.match(starterEntries["腹痛|ふくつう"].notes, /same written word also has 腹痛\|はらいた/);
});

test("tracked starter word data includes the fifty-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["米国|べいこく", "米", "べい"],
        ["新米|しんまい", "米", "まい"],
        ["逮捕|たいほ", "捕", "ほ"],
        ["抱負|ほうふ", "抱", "ほう"],
        ["法被|はっぴ", "法", "はっ"],
        ["訪問|ほうもん", "訪", "ほう"],
        ["亡者|もうじゃ", "亡", "もう"],
        ["忘年会|ぼうねんかい", "忘", "ぼう"],
        ["本望|ほんもう", "望", "もう"],
        ["末路|ばつろ", "末", "ばつ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["米国|べいこく", "support"],
        ["新米|しんまい", "support"],
        ["逮捕|たいほ", "support"],
        ["抱負|ほうふ", "support"],
        ["法被|はっぴ", "support"],
        ["訪問|ほうもん", "support"],
        ["亡者|もうじゃ", "support"],
        ["忘年会|ぼうねんかい", "support"],
        ["本望|ほんもう", "support"],
        ["末路|ばつろ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["米国|べいこく", "<ruby>米<rt>べい</rt></ruby><ruby>国<rt>こく</rt></ruby>"],
        ["新米|しんまい", "<ruby>新<rt>しん</rt></ruby><ruby>米<rt>まい</rt></ruby>"],
        ["逮捕|たいほ", "<ruby>逮<rt>たい</rt></ruby><ruby>捕<rt>ほ</rt></ruby>"],
        ["抱負|ほうふ", "<ruby>抱<rt>ほう</rt></ruby><ruby>負<rt>ふ</rt></ruby>"],
        ["法被|はっぴ", "<ruby>法<rt>はっ</rt></ruby><ruby>被<rt>ぴ</rt></ruby>"],
        ["訪問|ほうもん", "<ruby>訪<rt>ほう</rt></ruby><ruby>問<rt>もん</rt></ruby>"],
        ["亡者|もうじゃ", "<ruby>亡<rt>もう</rt></ruby><ruby>者<rt>じゃ</rt></ruby>"],
        ["忘年会|ぼうねんかい", "<ruby>忘<rt>ぼう</rt></ruby><ruby>年<rt>ねん</rt></ruby><ruby>会<rt>かい</rt></ruby>"],
        ["本望|ほんもう", "<ruby>本<rt>ほん</rt></ruby><ruby>望<rt>もう</rt></ruby>"],
        ["末路|ばつろ", "<ruby>末<rt>ばつ</rt></ruby><ruby>路<rt>ろ</rt></ruby>"],
    ]);
    assert.match(starterEntries["米国|べいこく"].notes, /rather than narrower 米軍 or relation-only 日米 rows/);
    assert.match(starterEntries["新米|しんまい"].notes, /keeps frozen N5 白米\|はくまい untouched/);
    assert.match(starterEntries["逮捕|たいほ"].notes, /Tanos N3 row is only a discovery\/weak level hint/);
    assert.match(starterEntries["法被|はっぴ"].notes, /frozen N4 法度\|はっと already exists/);
    assert.match(starterEntries["本望|ほんもう"].notes, /alternate 願望\|がんもう/);
});

test("tracked starter word data includes the sixtieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["睡眠|すいみん", "眠", "みん"],
        ["夢中|むちゅう", "夢", "む"],
        ["解く|とく", "解", "とく"],
        ["寿命|じゅみょう", "命", "みょう"],
        ["命令|めいれい", "命", "めい"],
        ["迷惑|めいわく", "迷", "めい"],
        ["悲鳴|ひめい", "鳴", "めい"],
        ["兵役|へいえき", "役", "えき"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["睡眠|すいみん", "support"],
        ["夢中|むちゅう", "support"],
        ["解く|とく", "support"],
        ["寿命|じゅみょう", "support"],
        ["命令|めいれい", "support"],
        ["迷惑|めいわく", "support"],
        ["悲鳴|ひめい", "support"],
        ["兵役|へいえき", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["睡眠|すいみん", "<ruby>睡<rt>すい</rt></ruby><ruby>眠<rt>みん</rt></ruby>"],
        ["夢中|むちゅう", "<ruby>夢<rt>む</rt></ruby><ruby>中<rt>ちゅう</rt></ruby>"],
        ["解く|とく", "<ruby>解<rt>と</rt></ruby>く"],
        ["寿命|じゅみょう", "<ruby>寿<rt>じゅ</rt></ruby><ruby>命<rt>みょう</rt></ruby>"],
        ["命令|めいれい", "<ruby>命<rt>めい</rt></ruby><ruby>令<rt>れい</rt></ruby>"],
        ["迷惑|めいわく", "<ruby>迷<rt>めい</rt></ruby><ruby>惑<rt>わく</rt></ruby>"],
        ["悲鳴|ひめい", "<ruby>悲<rt>ひ</rt></ruby><ruby>鳴<rt>めい</rt></ruby>"],
        ["兵役|へいえき", "<ruby>兵<rt>へい</rt></ruby><ruby>役<rt>えき</rt></ruby>"],
    ]);
    assert.match(starterEntries["睡眠|すいみん"].notes, /Tanos N3 row is only a discovery\/weak level hint/);
    assert.match(starterEntries["夢中|むちゅう"].notes, /being absorbed in something/);
    assert.match(starterEntries["解く|とく"].notes, /after deferring 娘 -> じょう/);
    assert.match(starterEntries["寿命|じゅみょう"].notes, /service-life word/);
    assert.match(starterEntries["命令|めいれい"].notes, /command\/order word/);
    assert.match(starterEntries["迷惑|めいわく"].notes, /social-friction word/);
    assert.match(starterEntries["悲鳴|ひめい"].notes, /rather than rarer 鳴 technical compounds/);
    assert.match(starterEntries["兵役|へいえき"].notes, /clean 役 -> えき evidence/);
});

test("tracked starter word data includes the sixty-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["石油|せきゆ", "油", "ゆ"],
        ["遊園地|ゆうえんち", "遊", "ゆう"],
        ["余裕|よゆう", "余", "よ"],
        ["給与|きゅうよ", "与", "よ"],
        ["預金|よきん", "預", "よ"],
        ["紅葉|こうよう", "葉", "よう"],
        ["欲望|よくぼう", "欲", "よく"],
        ["連絡|れんらく", "絡", "らく"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["石油|せきゆ", "support"],
        ["遊園地|ゆうえんち", "support"],
        ["余裕|よゆう", "support"],
        ["給与|きゅうよ", "support"],
        ["預金|よきん", "support"],
        ["紅葉|こうよう", "support"],
        ["欲望|よくぼう", "support"],
        ["連絡|れんらく", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["石油|せきゆ", "<ruby>石<rt>せき</rt></ruby><ruby>油<rt>ゆ</rt></ruby>"],
        ["遊園地|ゆうえんち", "<ruby>遊<rt>ゆう</rt></ruby><ruby>園<rt>えん</rt></ruby><ruby>地<rt>ち</rt></ruby>"],
        ["余裕|よゆう", "<ruby>余<rt>よ</rt></ruby><ruby>裕<rt>ゆう</rt></ruby>"],
        ["給与|きゅうよ", "<ruby>給<rt>きゅう</rt></ruby><ruby>与<rt>よ</rt></ruby>"],
        ["預金|よきん", "<ruby>預<rt>よ</rt></ruby><ruby>金<rt>きん</rt></ruby>"],
        ["紅葉|こうよう", "<ruby>紅<rt>こう</rt></ruby><ruby>葉<rt>よう</rt></ruby>"],
        ["欲望|よくぼう", "<ruby>欲<rt>よく</rt></ruby><ruby>望<rt>ぼう</rt></ruby>"],
        ["連絡|れんらく", "<ruby>連<rt>れん</rt></ruby><ruby>絡<rt>らく</rt></ruby>"],
    ]);
    assert.match(starterEntries["石油|せきゆ"].notes, /resource\/energy vocabulary/);
    assert.match(starterEntries["遊園地|ゆうえんち"].notes, /concrete leisure\/place vocabulary/);
    assert.match(starterEntries["余裕|よゆう"].notes, /room\/leeway\/composure word/);
    assert.match(starterEntries["給与|きゅうよ"].notes, /work\/money vocabulary/);
    assert.match(starterEntries["預金|よきん"].notes, /banking vocabulary/);
    assert.match(starterEntries["紅葉|こうよう"].notes, /seasonal\/culture vocabulary/);
    assert.match(starterEntries["欲望|よくぼう"].notes, /instead of 欲求\|よっきゅう/);
    assert.match(starterEntries["連絡|れんらく"].notes, /communication word/);
});

test("tracked starter word data includes the sixty-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["落語|らくご", "落", "らく"],
        ["表裏|ひょうり", "裏", "り"],
        ["良好|りょうこう", "良", "りょう"],
        ["緑茶|りょくちゃ", "緑", "りょく"],
        ["車輪|しゃりん", "輪", "りん"],
        ["感涙|かんるい", "涙", "るい"],
        ["冷房|れいぼう", "冷", "れい"],
        ["横|よこ", "横", "よこ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["落語|らくご", "support"],
        ["表裏|ひょうり", "support"],
        ["良好|りょうこう", "support"],
        ["緑茶|りょくちゃ", "support"],
        ["車輪|しゃりん", "support"],
        ["感涙|かんるい", "support"],
        ["冷房|れいぼう", "support"],
        ["横|よこ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["落語|らくご", "<ruby>落<rt>らく</rt></ruby><ruby>語<rt>ご</rt></ruby>"],
        ["表裏|ひょうり", "<ruby>表<rt>ひょう</rt></ruby><ruby>裏<rt>り</rt></ruby>"],
        ["良好|りょうこう", "<ruby>良<rt>りょう</rt></ruby><ruby>好<rt>こう</rt></ruby>"],
        ["緑茶|りょくちゃ", "<ruby>緑<rt>りょく</rt></ruby><ruby>茶<rt>ちゃ</rt></ruby>"],
        ["車輪|しゃりん", "<ruby>車<rt>しゃ</rt></ruby><ruby>輪<rt>りん</rt></ruby>"],
        ["感涙|かんるい", "<ruby>感<rt>かん</rt></ruby><ruby>涙<rt>るい</rt></ruby>"],
        ["冷房|れいぼう", "<ruby>冷<rt>れい</rt></ruby><ruby>房<rt>ぼう</rt></ruby>"],
        ["横|よこ", "<ruby>横<rt>よこ</rt></ruby>"],
    ]);
    assert.match(starterEntries["落語|らくご"].notes, /Japanese culture vocabulary/);
    assert.match(starterEntries["表裏|ひょうり"].notes, /front\/back contrast word/);
    assert.match(starterEntries["良好|りょうこう"].notes, /condition\/status word/);
    assert.match(starterEntries["緑茶|りょくちゃ"].notes, /drink\/culture vocabulary/);
    assert.match(starterEntries["車輪|しゃりん"].notes, /concrete object vocabulary/);
    assert.match(starterEntries["感涙|かんるい"].notes, /instead of anatomy-only 涙腺/);
    assert.match(starterEntries["冷房|れいぼう"].notes, /home\/building vocabulary/);
    assert.match(starterEntries["横|よこ"].notes, /横断 already exists/);
});

test("tracked starter word data includes the sixty-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["取引|とりひき", "取", "とり"],
        ["押し付ける|おしつける", "押", "おし"],
        ["窓際|まどぎわ", "際", "ぎわ"],
        ["初雪|はつゆき", "初", "はつ"],
        ["折り返し|おりかえし", "折", "おり"],
        ["置き換える|おきかえる", "置", "おき"],
        ["雨雲|あまぐも", "雲", "ぐも"],
        ["年寄り|としより", "寄", "より"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["取引|とりひき", "support"],
        ["押し付ける|おしつける", "support"],
        ["窓際|まどぎわ", "support"],
        ["初雪|はつゆき", "support"],
        ["折り返し|おりかえし", "support"],
        ["置き換える|おきかえる", "support"],
        ["雨雲|あまぐも", "support"],
        ["年寄り|としより", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["取引|とりひき", "<ruby>取<rt>とり</rt></ruby><ruby>引<rt>ひき</rt></ruby>"],
        ["押し付ける|おしつける", "<ruby>押<rt>お</rt></ruby>し<ruby>付<rt>つ</rt></ruby>ける"],
        ["窓際|まどぎわ", "<ruby>窓<rt>まど</rt></ruby><ruby>際<rt>ぎわ</rt></ruby>"],
        ["初雪|はつゆき", "<ruby>初<rt>はつ</rt></ruby><ruby>雪<rt>ゆき</rt></ruby>"],
        ["折り返し|おりかえし", "<ruby>折<rt>お</rt></ruby>り<ruby>返<rt>かえ</rt></ruby>し"],
        ["置き換える|おきかえる", "<ruby>置<rt>お</rt></ruby>き<ruby>換<rt>か</rt></ruby>える"],
        ["雨雲|あまぐも", "<ruby>雨<rt>あま</rt></ruby><ruby>雲<rt>ぐも</rt></ruby>"],
        ["年寄り|としより", "<ruby>年<rt>とし</rt></ruby><ruby>寄<rt>よ</rt></ruby>り"],
    ]);
    assert.match(starterEntries["取引|とりひき"].notes, /business\/dealings vocabulary/);
    assert.match(starterEntries["押し付ける|おしつける"].notes, /impose\/foist verb/);
    assert.match(starterEntries["窓際|まどぎわ"].notes, /location vocabulary/);
    assert.match(starterEntries["初雪|はつゆき"].notes, /seasonal vocabulary/);
    assert.match(starterEntries["折り返し|おりかえし"].notes, /communication and route vocabulary/);
    assert.match(starterEntries["置き換える|おきかえる"].notes, /replace\/substitute verb/);
    assert.match(starterEntries["雨雲|あまぐも"].notes, /weather vocabulary/);
    assert.match(starterEntries["年寄り|としより"].notes, /people\/age vocabulary/);
});

test("tracked starter word data includes the sixty-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["皆様|みなさま", "皆", "みな"],
        ["酒屋|さかや", "酒", "さか"],
        ["宿屋|やどや", "宿", "やど"],
        ["焼き鳥|やきとり", "焼", "やき"],
        ["船便|ふなびん", "船", "ふな"],
        ["花束|はなたば", "束", "たば"],
        ["日付|ひづけ", "付", "づけ"],
        ["木の実|きのみ", "実", "み"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["皆様|みなさま", "support"],
        ["酒屋|さかや", "support"],
        ["宿屋|やどや", "support"],
        ["焼き鳥|やきとり", "support"],
        ["船便|ふなびん", "support"],
        ["花束|はなたば", "support"],
        ["日付|ひづけ", "support"],
        ["木の実|きのみ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["皆様|みなさま", "<ruby>皆<rt>みな</rt></ruby><ruby>様<rt>さま</rt></ruby>"],
        ["酒屋|さかや", "<ruby>酒<rt>さか</rt></ruby><ruby>屋<rt>や</rt></ruby>"],
        ["宿屋|やどや", "<ruby>宿<rt>やど</rt></ruby><ruby>屋<rt>や</rt></ruby>"],
        ["焼き鳥|やきとり", "<ruby>焼<rt>や</rt></ruby>き<ruby>鳥<rt>とり</rt></ruby>"],
        ["船便|ふなびん", "<ruby>船<rt>ふな</rt></ruby><ruby>便<rt>びん</rt></ruby>"],
        ["花束|はなたば", "<ruby>花<rt>はな</rt></ruby><ruby>束<rt>たば</rt></ruby>"],
        ["日付|ひづけ", "<ruby>日<rt>ひ</rt></ruby><ruby>付<rt>づけ</rt></ruby>"],
        ["木の実|きのみ", "<ruby>木<rt>き</rt></ruby>の<ruby>実<rt>み</rt></ruby>"],
    ]);
    assert.match(starterEntries["皆様|みなさま"].notes, /formal address vocabulary/);
    assert.match(starterEntries["酒屋|さかや"].notes, /shop vocabulary/);
    assert.match(starterEntries["宿屋|やどや"].notes, /travel\/lodging vocabulary/);
    assert.match(starterEntries["焼き鳥|やきとり"].notes, /food vocabulary/);
    assert.match(starterEntries["船便|ふなびん"].notes, /shipping\/mail vocabulary/);
    assert.match(starterEntries["花束|はなたば"].notes, /gift\/object vocabulary/);
    assert.match(starterEntries["日付|ひづけ"].notes, /document\/time vocabulary/);
    assert.match(starterEntries["木の実|きのみ"].notes, /nature\/food vocabulary/);
});

test("tracked starter word data includes the sixty-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["富|とみ", "富", "とみ"],
        ["際立つ|きわだつ", "際", "きわ"],
        ["種|たね", "種", "たね"],
        ["罪|つみ", "罪", "つみ"],
        ["顔付き|かおつき", "付", "つき"],
        ["打ち合わせ|うちあわせ", "打", "うち"],
        ["伝手|つて", "伝", "つて"],
        ["神主|かんぬし", "神", "かん"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["富|とみ", "support"],
        ["際立つ|きわだつ", "support"],
        ["種|たね", "support"],
        ["罪|つみ", "support"],
        ["顔付き|かおつき", "support"],
        ["打ち合わせ|うちあわせ", "support"],
        ["伝手|つて", "support"],
        ["神主|かんぬし", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["富|とみ", "<ruby>富<rt>とみ</rt></ruby>"],
        ["際立つ|きわだつ", "<ruby>際<rt>きわ</rt></ruby><ruby>立<rt>だ</rt></ruby>つ"],
        ["種|たね", "<ruby>種<rt>たね</rt></ruby>"],
        ["罪|つみ", "<ruby>罪<rt>つみ</rt></ruby>"],
        ["顔付き|かおつき", "<ruby>顔<rt>かお</rt></ruby><ruby>付<rt>つ</rt></ruby>き"],
        ["打ち合わせ|うちあわせ", "<ruby>打<rt>う</rt></ruby>ち<ruby>合<rt>あ</rt></ruby>わせ"],
        ["伝手|つて", "<ruby>伝<rt>つ</rt></ruby><ruby>手<rt>て</rt></ruby>"],
        ["神主|かんぬし", "<ruby>神<rt>かん</rt></ruby><ruby>主<rt>ぬし</rt></ruby>"],
    ]);
    assert.match(starterEntries["富|とみ"].notes, /wealth\/resources vocabulary/);
    assert.match(starterEntries["際立つ|きわだつ"].notes, /descriptive verb vocabulary/);
    assert.match(starterEntries["種|たね"].notes, /seed\/kind vocabulary/);
    assert.match(starterEntries["罪|つみ"].notes, /legal\/moral vocabulary/);
    assert.match(starterEntries["顔付き|かおつき"].notes, /expression\/features vocabulary/);
    assert.match(starterEntries["打ち合わせ|うちあわせ"].notes, /workplace\/planning vocabulary/);
    assert.match(starterEntries["伝手|つて"].notes, /connections\/intermediary vocabulary/);
    assert.match(starterEntries["神主|かんぬし"].notes, /Shinto priest sense only/);
});

test("tracked starter word data includes the sixty-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["冷える|ひえる", "冷", "ひえる"],
        ["冷やす|ひやす", "冷", "ひやす"],
        ["冷ます|さます", "冷", "さます"],
        ["冷める|さめる", "冷", "さめる"],
        ["散る|ちる", "散", "ちる"],
        ["散らかる|ちらかる", "散", "ちらかる"],
        ["散らかす|ちらかす", "散", "ちらかす"],
        ["散らす|ちらす", "散", "ちらす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["冷える|ひえる", "support"],
        ["冷やす|ひやす", "support"],
        ["冷ます|さます", "support"],
        ["冷める|さめる", "support"],
        ["散る|ちる", "support"],
        ["散らかる|ちらかる", "support"],
        ["散らかす|ちらかす", "support"],
        ["散らす|ちらす", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["冷える|ひえる", "<ruby>冷<rt>ひ</rt></ruby>える"],
        ["冷やす|ひやす", "<ruby>冷<rt>ひ</rt></ruby>やす"],
        ["冷ます|さます", "<ruby>冷<rt>さ</rt></ruby>ます"],
        ["冷める|さめる", "<ruby>冷<rt>さ</rt></ruby>める"],
        ["散る|ちる", "<ruby>散<rt>ち</rt></ruby>る"],
        ["散らかる|ちらかる", "<ruby>散<rt>ち</rt></ruby>らかる"],
        ["散らかす|ちらかす", "<ruby>散<rt>ち</rt></ruby>らかす"],
        ["散らす|ちらす", "<ruby>散<rt>ち</rt></ruby>らす"],
    ]);
    assert.match(starterEntries["冷える|ひえる"].notes, /temperature verb vocabulary/);
    assert.match(starterEntries["冷やす|ひやす"].notes, /cool\/chill transitive verb vocabulary/);
    assert.match(starterEntries["冷ます|さます"].notes, /cool-down transitive verb vocabulary/);
    assert.match(starterEntries["冷める|さめる"].notes, /cool-down intransitive verb vocabulary/);
    assert.match(starterEntries["散る|ちる"].notes, /blossom\/scatter verb vocabulary/);
    assert.match(starterEntries["散らかる|ちらかる"].notes, /mess\/disorder intransitive verb vocabulary/);
    assert.match(starterEntries["散らかす|ちらかす"].notes, /mess\/disorder transitive verb vocabulary/);
    assert.match(starterEntries["散らす|ちらす"].notes, /scatter\/disperse transitive verb vocabulary/);
});

test("tracked starter word data includes the sixty-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["因る|よる", "因", "よる"],
        ["果て|はて", "果", "はて"],
        ["果てる|はてる", "果", "はてる"],
        ["割く|さく", "割", "さく"],
        ["割る|わる", "割", "わる"],
        ["関わる|かかわる", "関", "かかわる"],
        ["関取|せきとり", "関", "せき"],
        ["窓越し|まどごし", "越", "ごし"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["因る|よる", "support"],
        ["果て|はて", "support"],
        ["果てる|はてる", "support"],
        ["割く|さく", "support"],
        ["割る|わる", "support"],
        ["関わる|かかわる", "support"],
        ["関取|せきとり", "support"],
        ["窓越し|まどごし", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["因る|よる", "<ruby>因<rt>よ</rt></ruby>る"],
        ["果て|はて", "<ruby>果<rt>は</rt></ruby>て"],
        ["果てる|はてる", "<ruby>果<rt>は</rt></ruby>てる"],
        ["割く|さく", "<ruby>割<rt>さ</rt></ruby>く"],
        ["割る|わる", "<ruby>割<rt>わ</rt></ruby>る"],
        ["関わる|かかわる", "<ruby>関<rt>かか</rt></ruby>わる"],
        ["関取|せきとり", "<ruby>関<rt>せき</rt></ruby><ruby>取<rt>とり</rt></ruby>"],
        ["窓越し|まどごし", "<ruby>窓<rt>まど</rt></ruby><ruby>越<rt>ご</rt></ruby>し"],
    ]);
    assert.match(starterEntries["因る|よる"].notes, /formal cause\/basis verb vocabulary/);
    assert.match(starterEntries["果て|はて"].notes, /end\/limit noun vocabulary/);
    assert.match(starterEntries["割く|さく"].notes, /spare\/allocate verb vocabulary/);
    assert.match(starterEntries["窓越し|まどごし"].notes, /through-a-window vocabulary/);
});

test("tracked starter word data includes the sixty-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["越え|ごえ", "越", "ごえ"],
        ["越し|ごし", "越", "ごし"],
        ["向かい|むかい", "向", "むかい"],
        ["向き|むき", "向", "むき"],
        ["向く|むく", "向", "むく"],
        ["向け|むけ", "向", "むけ"],
        ["向ける|むける", "向", "むける"],
        ["幸|さち", "幸", "さち"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["越え|ごえ", "support"],
        ["越し|ごし", "support"],
        ["向かい|むかい", "support"],
        ["向き|むき", "support"],
        ["向く|むく", "support"],
        ["向け|むけ", "support"],
        ["向ける|むける", "support"],
        ["幸|さち", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["越え|ごえ", "<ruby>越<rt>ご</rt></ruby>え"],
        ["越し|ごし", "<ruby>越<rt>ご</rt></ruby>し"],
        ["向かい|むかい", "<ruby>向<rt>む</rt></ruby>かい"],
        ["向き|むき", "<ruby>向<rt>む</rt></ruby>き"],
        ["向く|むく", "<ruby>向<rt>む</rt></ruby>く"],
        ["向け|むけ", "<ruby>向<rt>む</rt></ruby>け"],
        ["向ける|むける", "<ruby>向<rt>む</rt></ruby>ける"],
        ["幸|さち", "<ruby>幸<rt>さち</rt></ruby>"],
    ]);
    assert.match(starterEntries["越え|ごえ"].notes, /direct productive suffix support/);
    assert.match(starterEntries["向き|むき"].notes, /direction\/orientation vocabulary/);
    assert.match(starterEntries["向け|むけ"].notes, /audience\/target suffix vocabulary/);
    assert.match(starterEntries["幸|さち"].notes, /fortune\/harvest noun vocabulary/);
});

test("tracked starter word data includes the sixty-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["交ざる|まざる", "交", "まざる"],
        ["交じる|まじる", "交", "まじる"],
        ["交ぜる|まぜる", "交", "まぜる"],
        ["交える|まじえる", "交", "まじえる"],
        ["交わる|まじわる", "交", "まじわる"],
        ["経つ|たつ", "経", "たつ"],
        ["経る|へる", "経", "へる"],
        ["供|とも", "供", "とも"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["交ざる|まざる", "support"],
        ["交じる|まじる", "support"],
        ["交ぜる|まぜる", "support"],
        ["交える|まじえる", "support"],
        ["交わる|まじわる", "support"],
        ["経つ|たつ", "support"],
        ["経る|へる", "support"],
        ["供|とも", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["交ざる|まざる", "<ruby>交<rt>ま</rt></ruby>ざる"],
        ["交じる|まじる", "<ruby>交<rt>ま</rt></ruby>じる"],
        ["交ぜる|まぜる", "<ruby>交<rt>ま</rt></ruby>ぜる"],
        ["交える|まじえる", "<ruby>交<rt>まじ</rt></ruby>える"],
        ["交わる|まじわる", "<ruby>交<rt>まじ</rt></ruby>わる"],
        ["経つ|たつ", "<ruby>経<rt>た</rt></ruby>つ"],
        ["経る|へる", "<ruby>経<rt>へ</rt></ruby>る"],
        ["供|とも", "<ruby>供<rt>とも</rt></ruby>"],
    ]);
    assert.match(starterEntries["交える|まじえる"].notes, /mix\/include verb vocabulary/);
    assert.match(starterEntries["交わる|まじわる"].notes, /cross\/intersect verb vocabulary/);
    assert.match(starterEntries["経る|へる"].notes, /pass-through\/experience verb vocabulary/);
    assert.match(starterEntries["供|とも"].notes, /attendant\/companion noun vocabulary/);
});

test("tracked starter word data includes the seventieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["解かす|とかす", "解", "とかす"],
        ["解ける|とける", "解", "とける"],
        ["解ける|ほどける", "解", "ほどける"],
        ["解る|わかる", "解", "わかる"],
        ["汚い|きたない", "汚", "きたない"],
        ["汚す|よごす", "汚", "よごす"],
        ["降りる|おりる", "降", "おりる"],
        ["降り|ふり", "降", "ふり"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["解かす|とかす", "support"],
        ["解ける|とける", "support"],
        ["解ける|ほどける", "support"],
        ["解る|わかる", "support"],
        ["汚い|きたない", "support"],
        ["汚す|よごす", "support"],
        ["降りる|おりる", "support"],
        ["降り|ふり", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["解かす|とかす", "<ruby>解<rt>と</rt></ruby>かす"],
        ["解ける|とける", "<ruby>解<rt>と</rt></ruby>ける"],
        ["解ける|ほどける", "<ruby>解<rt>ほど</rt></ruby>ける"],
        ["解る|わかる", "<ruby>解<rt>わ</rt></ruby>かる"],
        ["汚い|きたない", "<ruby>汚<rt>きたな</rt></ruby>い"],
        ["汚す|よごす", "<ruby>汚<rt>よご</rt></ruby>す"],
        ["降りる|おりる", "<ruby>降<rt>お</rt></ruby>りる"],
        ["降り|ふり", "<ruby>降<rt>ふ</rt></ruby>り"],
    ]);
    assert.match(starterEntries["解ける|とける"].notes, /solved\/loosened verb vocabulary/);
    assert.match(starterEntries["解る|わかる"].notes, /understand verb vocabulary/);
    assert.match(starterEntries["汚い|きたない"].notes, /dirty\/messy adjective vocabulary/);
    assert.match(starterEntries["降り|ふり"].notes, /rainfall\/snowfall noun vocabulary/);
});

test("tracked starter word data includes the seventy-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["観る|みる", "観", "みる"],
        ["大関|おおぜき", "関", "ぜき"],
        ["機織り|はたおり", "機", "はた"],
        ["手許|てもと", "許", "もと"],
        ["行き交う|いきかう", "交", "かう"],
        ["向こう|むこう", "向", "むこ"],
        ["見込み|みこみ", "込", "こみ"],
        ["済み|ずみ", "済", "ずみ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["観る|みる", "support"],
        ["大関|おおぜき", "support"],
        ["機織り|はたおり", "support"],
        ["手許|てもと", "support"],
        ["行き交う|いきかう", "support"],
        ["向こう|むこう", "support"],
        ["見込み|みこみ", "support"],
        ["済み|ずみ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["観る|みる", "<ruby>観<rt>み</rt></ruby>る"],
        ["大関|おおぜき", "<ruby>大<rt>おお</rt></ruby><ruby>関<rt>ぜき</rt></ruby>"],
        ["機織り|はたおり", "<ruby>機<rt>はた</rt></ruby><ruby>織<rt>お</rt></ruby>り"],
        ["手許|てもと", "<ruby>手<rt>て</rt></ruby><ruby>許<rt>もと</rt></ruby>"],
        ["行き交う|いきかう", "<ruby>行<rt>い</rt></ruby>き<ruby>交<rt>か</rt></ruby>う"],
        ["向こう|むこう", "<ruby>向<rt>む</rt></ruby>こう"],
        ["見込み|みこみ", "<ruby>見<rt>み</rt></ruby><ruby>込<rt>こ</rt></ruby>み"],
        ["済み|ずみ", "<ruby>済<rt>ず</rt></ruby>み"],
    ]);
    assert.match(starterEntries["観る|みる"].notes, /watch\/view verb vocabulary/);
    assert.match(starterEntries["向こう|むこう"].notes, /KANJIDIC-style 向 -> むこ stem/);
    assert.match(starterEntries["見込み|みこみ"].notes, /prospect\/estimate noun vocabulary/);
    assert.match(starterEntries["済み|ずみ"].notes, /completed\/settled suffix vocabulary/);
});

test("tracked starter word data includes the seventy-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["参る|まいる", "参", "まい"],
        ["消す|けす", "消", "けす"],
        ["常|つね", "常", "つね"],
        ["直る|なおる", "直", "なおる"],
        ["山積み|やまづみ", "積", "づみ"],
        ["成す|なす", "成", "なす"],
        ["成る|なる", "成", "なる"],
        ["直ちに|ただちに", "直", "ただちに"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["参る|まいる", "support"],
        ["消す|けす", "support"],
        ["常|つね", "support"],
        ["直る|なおる", "support"],
        ["山積み|やまづみ", "support"],
        ["成す|なす", "support"],
        ["成る|なる", "support"],
        ["直ちに|ただちに", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["参る|まいる", "<ruby>参<rt>まい</rt></ruby>る"],
        ["消す|けす", "<ruby>消<rt>け</rt></ruby>す"],
        ["常|つね", "<ruby>常<rt>つね</rt></ruby>"],
        ["直る|なおる", "<ruby>直<rt>なお</rt></ruby>る"],
        ["山積み|やまづみ", "<ruby>山<rt>やま</rt></ruby><ruby>積<rt>づ</rt></ruby>み"],
        ["成す|なす", "<ruby>成<rt>な</rt></ruby>す"],
        ["成る|なる", "<ruby>成<rt>な</rt></ruby>る"],
        ["直ちに|ただちに", "<ruby>直<rt>ただ</rt></ruby>ちに"],
    ]);
    assert.match(starterEntries["参る|まいる"].notes, /humble go\/come verb vocabulary/);
    assert.match(starterEntries["直る|なおる"].notes, /intransitive repair\/return-to-normal verb/);
    assert.match(starterEntries["山積み|やまづみ"].notes, /huge-pile noun vocabulary/);
    assert.match(starterEntries["成る|なる"].notes, /Tanos N3 is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["直ちに|ただちに"].notes, /immediately adverb vocabulary/);
});

test("tracked starter word data includes the seventy-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["和む|なごむ", "和", "なごむ"],
        ["和やか|なごやか", "和", "なごやか"],
        ["和らぐ|やわらぐ", "和", "やわらぐ"],
        ["和らげる|やわらげる", "和", "やわらげる"],
        ["温かい|あたたかい", "温", "あたたかい"],
        ["温まる|あたたまる", "温", "あたたまる"],
        ["温める|あたためる", "温", "あたためる"],
        ["散らばる|ちらばる", "散", "ちらばる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["和む|なごむ", "support"],
        ["和やか|なごやか", "support"],
        ["和らぐ|やわらぐ", "support"],
        ["和らげる|やわらげる", "support"],
        ["温かい|あたたかい", "support"],
        ["温まる|あたたまる", "support"],
        ["温める|あたためる", "support"],
        ["散らばる|ちらばる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["和む|なごむ", "<ruby>和<rt>なご</rt></ruby>む"],
        ["和やか|なごやか", "<ruby>和<rt>なご</rt></ruby>やか"],
        ["和らぐ|やわらぐ", "<ruby>和<rt>やわ</rt></ruby>らぐ"],
        ["和らげる|やわらげる", "<ruby>和<rt>やわ</rt></ruby>らげる"],
        ["温かい|あたたかい", "<ruby>温<rt>あたた</rt></ruby>かい"],
        ["温まる|あたたまる", "<ruby>温<rt>あたた</rt></ruby>まる"],
        ["温める|あたためる", "<ruby>温<rt>あたた</rt></ruby>める"],
        ["散らばる|ちらばる", "<ruby>散<rt>ち</rt></ruby>らばる"],
    ]);
    assert.match(starterEntries["和やか|なごやか"].notes, /congenial adjective vocabulary/);
    assert.match(starterEntries["温める|あたためる"].notes, /warm-up verb vocabulary/);
    assert.match(starterEntries["散らばる|ちらばる"].notes, /scattered-state verb vocabulary/);
});

test("tracked starter word data includes the seventy-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["退く|どく", "退", "どく"],
        ["退く|のく", "退", "のく"],
        ["退く|しりぞく", "退", "しりぞく"],
        ["退ける|どける", "退", "どける"],
        ["退ける|のける", "退", "のける"],
        ["労る|いたわる", "労", "いたわる"],
        ["捕まる|つかまる", "捕", "つかまる"],
        ["捕らえる|とらえる", "捕", "とらえる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["退く|どく", "support"],
        ["退く|のく", "support"],
        ["退く|しりぞく", "support"],
        ["退ける|どける", "support"],
        ["退ける|のける", "support"],
        ["労る|いたわる", "support"],
        ["捕まる|つかまる", "support"],
        ["捕らえる|とらえる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["退く|どく", "<ruby>退<rt>ど</rt></ruby>く"],
        ["退く|のく", "<ruby>退<rt>の</rt></ruby>く"],
        ["退く|しりぞく", "<ruby>退<rt>しりぞ</rt></ruby>く"],
        ["退ける|どける", "<ruby>退<rt>ど</rt></ruby>ける"],
        ["退ける|のける", "<ruby>退<rt>の</rt></ruby>ける"],
        ["労る|いたわる", "<ruby>労<rt>いたわ</rt></ruby>る"],
        ["捕まる|つかまる", "<ruby>捕<rt>つか</rt></ruby>まる"],
        ["捕らえる|とらえる", "<ruby>捕<rt>と</rt></ruby>らえる"],
    ]);
    assert.match(starterEntries["退く|しりぞく"].notes, /retreat\/withdraw verb vocabulary/);
    assert.match(starterEntries["労る|いたわる"].notes, /care-for\/appreciate-effort verb vocabulary/);
    assert.match(starterEntries["捕まる|つかまる"].notes, /Tanos N3 is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["捕らえる|とらえる"].notes, /capture\/grasp verb vocabulary/);
});

test("tracked starter word data includes the seventy-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["増し|まし", "増", "まし"],
        ["増す|ます", "増", "ます"],
        ["側|そば", "側", "そば"],
        ["打つ|ぶつ", "打", "ぶつ"],
        ["反る|そる", "反", "そる"],
        ["反す|かえす", "反", "かえす"],
        ["過ち|あやまち", "過", "あやまち"],
        ["過ごす|すごす", "過", "すごす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["増し|まし", "support"],
        ["増す|ます", "support"],
        ["側|そば", "support"],
        ["打つ|ぶつ", "support"],
        ["反る|そる", "support"],
        ["反す|かえす", "support"],
        ["過ち|あやまち", "support"],
        ["過ごす|すごす", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["増し|まし", "<ruby>増<rt>ま</rt></ruby>し"],
        ["増す|ます", "<ruby>増<rt>ま</rt></ruby>す"],
        ["側|そば", "<ruby>側<rt>そば</rt></ruby>"],
        ["打つ|ぶつ", "<ruby>打<rt>ぶ</rt></ruby>つ"],
        ["反る|そる", "<ruby>反<rt>そ</rt></ruby>る"],
        ["反す|かえす", "<ruby>反<rt>かえ</rt></ruby>す"],
        ["過ち|あやまち", "<ruby>過<rt>あやま</rt></ruby>ち"],
        ["過ごす|すごす", "<ruby>過<rt>す</rt></ruby>ごす"],
    ]);
    assert.match(starterEntries["増す|ます"].notes, /Tanos N3 is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["側|そば"].notes, /side\/nearby noun vocabulary/);
    assert.match(starterEntries["反す|かえす"].notes, /turn-over\/return verb vocabulary/);
    assert.match(starterEntries["過ち|あやまち"].notes, /Tanos N1 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the seventy-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["恐る恐る|おそるおそる", "恐", "おそる"],
        ["恐い|こわい", "恐", "こわい"],
        ["恐がる|こわがる", "恐", "こわがる"],
        ["勤める|つとめる", "勤", "つとめる"],
        ["絶つ|たつ", "絶", "たつ"],
        ["選る|える", "選", "える"],
        ["選る|よる", "選", "よる"],
        ["眠る|ねむる", "眠", "ねむる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["恐る恐る|おそるおそる", "support"],
        ["恐い|こわい", "support"],
        ["恐がる|こわがる", "support"],
        ["勤める|つとめる", "support"],
        ["絶つ|たつ", "support"],
        ["選る|える", "support"],
        ["選る|よる", "support"],
        ["眠る|ねむる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["恐る恐る|おそるおそる", "<ruby>恐<rt>おそ</rt></ruby>る<ruby>恐<rt>おそ</rt></ruby>る"],
        ["恐い|こわい", "<ruby>恐<rt>こわ</rt></ruby>い"],
        ["恐がる|こわがる", "<ruby>恐<rt>こわ</rt></ruby>がる"],
        ["勤める|つとめる", "<ruby>勤<rt>つと</rt></ruby>める"],
        ["絶つ|たつ", "<ruby>絶<rt>た</rt></ruby>つ"],
        ["選る|える", "<ruby>選<rt>え</rt></ruby>る"],
        ["選る|よる", "<ruby>選<rt>よ</rt></ruby>る"],
        ["眠る|ねむる", "<ruby>眠<rt>ねむ</rt></ruby>る"],
    ]);
    assert.match(starterEntries["恐る恐る|おそるおそる"].notes, /cautious-action adverb vocabulary/);
    assert.match(starterEntries["勤める|つとめる"].notes, /employment\/service verb vocabulary/);
    assert.match(starterEntries["絶つ|たつ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["眠る|ねむる"].notes, /sleep\/rest verb vocabulary/);
});

test("tracked starter word data includes the seventy-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["招く|まねく", "招", "まねく"],
        ["焼ける|やける", "焼", "やける"],
        ["責める|せめる", "責", "せめる"],
        ["折れる|おれる", "折", "おれる"],
        ["続く|つづく", "続", "つづく"],
        ["渡す|わたす", "渡", "わたす"],
        ["飛ばす|とばす", "飛", "とばす"],
        ["預かる|あずかる", "預", "あずかる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["招く|まねく", "support"],
        ["焼ける|やける", "support"],
        ["責める|せめる", "support"],
        ["折れる|おれる", "support"],
        ["続く|つづく", "support"],
        ["渡す|わたす", "support"],
        ["飛ばす|とばす", "support"],
        ["預かる|あずかる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["招く|まねく", "<ruby>招<rt>まね</rt></ruby>く"],
        ["焼ける|やける", "<ruby>焼<rt>や</rt></ruby>ける"],
        ["責める|せめる", "<ruby>責<rt>せ</rt></ruby>める"],
        ["折れる|おれる", "<ruby>折<rt>お</rt></ruby>れる"],
        ["続く|つづく", "<ruby>続<rt>つづ</rt></ruby>く"],
        ["渡す|わたす", "<ruby>渡<rt>わた</rt></ruby>す"],
        ["飛ばす|とばす", "<ruby>飛<rt>と</rt></ruby>ばす"],
        ["預かる|あずかる", "<ruby>預<rt>あず</rt></ruby>かる"],
    ]);
    assert.match(starterEntries["招く|まねく"].notes, /Tanos N3 is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["責める|せめる"].notes, /blame\/criticize verb vocabulary/);
    assert.match(starterEntries["飛ばす|とばす"].notes, /let-fly\/skip verb vocabulary/);
    assert.match(starterEntries["預かる|あずかる"].notes, /Tanos N2 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the seventy-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["愛弟子|まなでし", "愛", "まな"],
        ["子供|こども", "供", "ども"],
        ["在る|ある", "在", "ある"],
        ["殺ぐ|そぐ", "殺", "そぐ"],
        ["段取り|だんどり", "取", "どり"],
        ["子守|こもり", "守", "もり"],
        ["術|すべ", "術", "すべ"],
        ["何処|どこ", "処", "こ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["愛弟子|まなでし", "support"],
        ["子供|こども", "support"],
        ["在る|ある", "support"],
        ["殺ぐ|そぐ", "support"],
        ["段取り|だんどり", "support"],
        ["子守|こもり", "support"],
        ["術|すべ", "support"],
        ["何処|どこ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["愛弟子|まなでし", "<ruby>愛<rt>まな</rt></ruby><ruby>弟<rt>で</rt></ruby><ruby>子<rt>し</rt></ruby>"],
        ["子供|こども", "<ruby>子<rt>こ</rt></ruby><ruby>供<rt>ども</rt></ruby>"],
        ["在る|ある", "<ruby>在<rt>あ</rt></ruby>る"],
        ["殺ぐ|そぐ", "<ruby>殺<rt>そ</rt></ruby>ぐ"],
        ["段取り|だんどり", "<ruby>段<rt>だん</rt></ruby><ruby>取<rt>ど</rt></ruby>り"],
        ["子守|こもり", "<ruby>子<rt>こ</rt></ruby><ruby>守<rt>もり</rt></ruby>"],
        ["術|すべ", "<ruby>術<rt>すべ</rt></ruby>"],
        ["何処|どこ", "<ruby>何<rt>ど</rt></ruby><ruby>処<rt>こ</rt></ruby>"],
    ]);
    assert.match(starterEntries["子供|こども"].notes, /without touching frozen N4\/N5 word rows/);
    assert.match(starterEntries["殺ぐ|そぐ"].notes, /source-thin priority data/);
    assert.match(starterEntries["段取り|だんどり"].notes, /planning vocabulary/);
    assert.match(starterEntries["何処|どこ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the seventy-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["初々しい|ういういしい", "初", "うい"],
        ["書き初め|かきぞめ", "初", "ぞめ"],
        ["諸々|もろもろ", "諸", "もろ"],
        ["勝ち|がち", "勝", "がち"],
        ["微笑む|ほほえむ", "笑", "えむ"],
        ["積む|つむ", "積", "つむ"],
        ["束の間|つかのま", "束", "つか"],
        ["断つ|たつ", "断", "たつ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["初々しい|ういういしい", "support"],
        ["書き初め|かきぞめ", "support"],
        ["諸々|もろもろ", "support"],
        ["勝ち|がち", "support"],
        ["微笑む|ほほえむ", "support"],
        ["積む|つむ", "support"],
        ["束の間|つかのま", "support"],
        ["断つ|たつ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["初々しい|ういういしい", "<ruby>初<rt>うい</rt></ruby><ruby>初<rt>うい</rt></ruby>しい"],
        ["書き初め|かきぞめ", "<ruby>書<rt>か</rt></ruby>き<ruby>初<rt>ぞ</rt></ruby>め"],
        ["諸々|もろもろ", "<ruby>諸<rt>もろ</rt></ruby><ruby>々<rt>もろ</rt></ruby>"],
        ["勝ち|がち", "<ruby>勝<rt>が</rt></ruby>ち"],
        ["微笑む|ほほえむ", "<ruby>微<rt>ほほ</rt></ruby><ruby>笑<rt>え</rt></ruby>む"],
        ["積む|つむ", "<ruby>積<rt>つ</rt></ruby>む"],
        ["束の間|つかのま", "<ruby>束<rt>つか</rt></ruby>の<ruby>間<rt>ま</rt></ruby>"],
        ["断つ|たつ", "<ruby>断<rt>た</rt></ruby>つ"],
    ]);
    assert.match(starterEntries["勝ち|がち"].notes, /source-thin priority data/);
    assert.match(starterEntries["微笑む|ほほえむ"].notes, /Tanos N3 is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["積む|つむ"].notes, /Tanos N2 row is only a harder-level discovery hint/);
    assert.match(starterEntries["束の間|つかのま"].notes, /Tanos N1 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the eightieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["識る|しる", "識", "しる"],
        ["申|さる", "申", "さる"],
        ["側|かわ", "側", "かわ"],
        ["彼等|かれら", "等", "ら"],
        ["私達|わたしたち", "達", "たち"],
        ["恥|はじ", "恥", "はじ"],
        ["直ぐ|すぐ", "直", "すぐ"],
        ["否|いな", "否", "いな"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["識る|しる", "support"],
        ["申|さる", "support"],
        ["側|かわ", "support"],
        ["彼等|かれら", "support"],
        ["私達|わたしたち", "support"],
        ["恥|はじ", "support"],
        ["直ぐ|すぐ", "support"],
        ["否|いな", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["識る|しる", "<ruby>識<rt>し</rt></ruby>る"],
        ["申|さる", "<ruby>申<rt>さる</rt></ruby>"],
        ["側|かわ", "<ruby>側<rt>かわ</rt></ruby>"],
        ["彼等|かれら", "<ruby>彼<rt>かれ</rt></ruby><ruby>等<rt>ら</rt></ruby>"],
        ["私達|わたしたち", "<ruby>私<rt>わたし</rt></ruby><ruby>達<rt>たち</rt></ruby>"],
        ["恥|はじ", "<ruby>恥<rt>はじ</rt></ruby>"],
        ["直ぐ|すぐ", "<ruby>直<rt>す</rt></ruby>ぐ"],
        ["否|いな", "<ruby>否<rt>いな</rt></ruby>"],
    ]);
    assert.match(starterEntries["側|かわ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["彼等|かれら"].notes, /instead of a bare suffix row/);
    assert.match(starterEntries["私達|わたしたち"].notes, /without editing frozen N4\/N5 word data/);
    assert.match(starterEntries["恥|はじ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["直ぐ|すぐ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the eighty-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["散蒔く|ばらまく", "散", "ばら"],
        ["へその緒|へそのお", "緒", "お"],
        ["常夏|とこなつ", "常", "とこ"],
        ["神々しい|こうごうしい", "神", "こう"],
        ["否|いや", "否", "いや"],
        ["富む|とむ", "富", "とむ"],
        ["浮く|うく", "浮", "うく"],
        ["負う|おう", "負", "おう"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["散蒔く|ばらまく", "support"],
        ["へその緒|へそのお", "support"],
        ["常夏|とこなつ", "support"],
        ["神々しい|こうごうしい", "support"],
        ["否|いや", "support"],
        ["富む|とむ", "support"],
        ["浮く|うく", "support"],
        ["負う|おう", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["散蒔く|ばらまく", "<ruby>散<rt>ばら</rt></ruby><ruby>蒔<rt>ま</rt></ruby>く"],
        ["へその緒|へそのお", "へその<ruby>緒<rt>お</rt></ruby>"],
        ["常夏|とこなつ", "<ruby>常<rt>とこ</rt></ruby><ruby>夏<rt>なつ</rt></ruby>"],
        ["神々しい|こうごうしい", "<ruby>神<rt>こう</rt></ruby><ruby>々<rt>ごう</rt></ruby>しい"],
        ["否|いや", "<ruby>否<rt>いや</rt></ruby>"],
        ["富む|とむ", "<ruby>富<rt>と</rt></ruby>む"],
        ["浮く|うく", "<ruby>浮<rt>う</rt></ruby>く"],
        ["負う|おう", "<ruby>負<rt>お</rt></ruby>う"],
    ]);
    assert.match(starterEntries["散蒔く|ばらまく"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["へその緒|へそのお"].notes, /source-thin priority data/);
    assert.match(starterEntries["神々しい|こうごうしい"].notes, /source-thin priority data/);
    assert.match(starterEntries["否|いや"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["浮く|うく"].notes, /Tanos N2 row is only a harder-level discovery hint/);
    assert.match(starterEntries["負う|おう"].notes, /Tanos N1 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the eighty-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["舞|まい", "舞", "まい"],
        ["舞う|まう", "舞", "まう"],
        ["並|なみ", "並", "なみ"],
        ["海辺|うみべ", "辺", "べ"],
        ["捕る|とる", "捕", "とる"],
        ["亡き|なき", "亡", "なき"],
        ["末|すえ", "末", "すえ"],
        ["気付き|きづき", "付", "づき"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["舞|まい", "support"],
        ["舞う|まう", "support"],
        ["並|なみ", "support"],
        ["海辺|うみべ", "support"],
        ["捕る|とる", "support"],
        ["亡き|なき", "support"],
        ["末|すえ", "support"],
        ["気付き|きづき", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["舞|まい", "<ruby>舞<rt>まい</rt></ruby>"],
        ["舞う|まう", "<ruby>舞<rt>ま</rt></ruby>う"],
        ["並|なみ", "<ruby>並<rt>なみ</rt></ruby>"],
        ["海辺|うみべ", "<ruby>海<rt>うみ</rt></ruby><ruby>辺<rt>べ</rt></ruby>"],
        ["捕る|とる", "<ruby>捕<rt>と</rt></ruby>る"],
        ["亡き|なき", "<ruby>亡<rt>な</rt></ruby>き"],
        ["末|すえ", "<ruby>末<rt>すえ</rt></ruby>"],
        ["気付き|きづき", "<ruby>気<rt>き</rt></ruby><ruby>付<rt>づ</rt></ruby>き"],
    ]);
    assert.match(starterEntries["舞う|まう"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["捕る|とる"].notes, /Tanos N2 row is only a harder-level discovery hint/);
    assert.match(starterEntries["亡き|なき"].notes, /source-thin priority data/);
    assert.match(starterEntries["末|すえ"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["気付き|きづき"].notes, /instead of the bare suffix/);
});

test("tracked starter word data includes the eighty-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["接ぐ|つぐ", "接", "つぐ"],
        ["語り草|かたりぐさ", "草", "ぐさ"],
        ["望月|もちづき", "望", "もち"],
        ["未だ|まだ", "未", "まだ"],
        ["連れ|づれ", "連", "づれ"],
        ["路|みち", "路", "みち"],
        ["録る|とる", "録", "とる"],
        ["愛しい|いとしい", "愛", "いとしい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["接ぐ|つぐ", "support"],
        ["語り草|かたりぐさ", "support"],
        ["望月|もちづき", "support"],
        ["未だ|まだ", "support"],
        ["連れ|づれ", "support"],
        ["路|みち", "support"],
        ["録る|とる", "support"],
        ["愛しい|いとしい", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["接ぐ|つぐ", "<ruby>接<rt>つ</rt></ruby>ぐ"],
        ["語り草|かたりぐさ", "<ruby>語<rt>かた</rt></ruby>り<ruby>草<rt>ぐさ</rt></ruby>"],
        ["望月|もちづき", "<ruby>望<rt>もち</rt></ruby><ruby>月<rt>づき</rt></ruby>"],
        ["未だ|まだ", "<ruby>未<rt>ま</rt></ruby>だ"],
        ["連れ|づれ", "<ruby>連<rt>づ</rt></ruby>れ"],
        ["路|みち", "<ruby>路<rt>みち</rt></ruby>"],
        ["録る|とる", "<ruby>録<rt>と</rt></ruby>る"],
        ["愛しい|いとしい", "<ruby>愛<rt>いと</rt></ruby>しい"],
    ]);
    assert.match(starterEntries["接ぐ|つぐ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["接ぐ|つぐ"].notes, /source-thin priority data/);
    assert.match(starterEntries["語り草|かたりぐさ"].notes, /priority\/commonness support/);
    assert.match(starterEntries["未だ|まだ"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["連れ|づれ"].notes, /suffix recognition vocabulary/);
    assert.match(starterEntries["録る|とる"].notes, /media-action vocabulary/);
});

test("tracked starter word data includes the eighty-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["愛しむ|おしむ", "愛", "おしむ"],
        ["愛でる|めでる", "愛", "めでる"],
        ["違う|たがう", "違", "たがう"],
        ["違える|たがえる", "違", "たがえる"],
        ["違える|ちがえる", "違", "ちがえる"],
        ["育ち|そだち", "育", "そだち"],
        ["育つ|そだつ", "育", "そだつ"],
        ["育む|はぐくむ", "育", "はぐくむ"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["愛しむ|おしむ", "support"],
        ["愛でる|めでる", "support"],
        ["違う|たがう", "support"],
        ["違える|たがえる", "support"],
        ["違える|ちがえる", "support"],
        ["育ち|そだち", "support"],
        ["育つ|そだつ", "support"],
        ["育む|はぐくむ", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["愛しむ|おしむ", "<ruby>愛<rt>お</rt></ruby>しむ"],
        ["愛でる|めでる", "<ruby>愛<rt>め</rt></ruby>でる"],
        ["違う|たがう", "<ruby>違<rt>たが</rt></ruby>う"],
        ["違える|たがえる", "<ruby>違<rt>たが</rt></ruby>える"],
        ["違える|ちがえる", "<ruby>違<rt>ちが</rt></ruby>える"],
        ["育ち|そだち", "<ruby>育<rt>そだ</rt></ruby>ち"],
        ["育つ|そだつ", "<ruby>育<rt>そだ</rt></ruby>つ"],
        ["育む|はぐくむ", "<ruby>育<rt>はぐく</rt></ruby>む"],
    ]);
    assert.match(starterEntries["愛でる|めでる"].notes, /source-thin priority data/);
    assert.match(starterEntries["違う|たがう"].notes, /source-thin priority data/);
    assert.match(starterEntries["違える|ちがえる"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["育ち|そだち"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["育つ|そだつ"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["育む|はぐくむ"].notes, /foster\/nurture vocabulary/);
});

test("tracked starter word data includes the eighty-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["陽焼け|ひやけ", "陽", "ひ"],
        ["面持ち|おももち", "面", "おも"],
        ["家路|いえじ", "路", "じ"],
        ["要る|いる", "要", "いる"],
        ["押さえる|おさえる", "押", "おさえる"],
        ["最も|もっとも", "最", "もっとも"],
        ["当たり前|あたりまえ", "当", "あたり"],
        ["済ます|すます", "済", "すます"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["陽焼け|ひやけ", "support"],
        ["面持ち|おももち", "support"],
        ["家路|いえじ", "support"],
        ["要る|いる", "support"],
        ["押さえる|おさえる", "support"],
        ["最も|もっとも", "support"],
        ["当たり前|あたりまえ", "support"],
        ["済ます|すます", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["陽焼け|ひやけ", "<ruby>陽<rt>ひ</rt></ruby><ruby>焼<rt>や</rt></ruby>け"],
        ["面持ち|おももち", "<ruby>面<rt>おも</rt></ruby><ruby>持<rt>も</rt></ruby>ち"],
        ["家路|いえじ", "<ruby>家<rt>いえ</rt></ruby><ruby>路<rt>じ</rt></ruby>"],
        ["要る|いる", "<ruby>要<rt>い</rt></ruby>る"],
        ["押さえる|おさえる", "<ruby>押<rt>お</rt></ruby>さえる"],
        ["最も|もっとも", "<ruby>最<rt>もっと</rt></ruby>も"],
        ["当たり前|あたりまえ", "<ruby>当<rt>あ</rt></ruby>たり<ruby>前<rt>まえ</rt></ruby>"],
        ["済ます|すます", "<ruby>済<rt>す</rt></ruby>ます"],
    ]);
    assert.match(starterEntries["押さえる|おさえる"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["最も|もっとも"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["当たり前|あたりまえ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["済ます|すます"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["陽焼け|ひやけ"].notes, /sun-exposure vocabulary/);
});

test("tracked starter word data includes the eighty-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["残す|のこす", "残", "のこす"],
        ["残り|のこり", "残", "のこり"],
        ["震える|ふるえる", "震", "ふるえる"],
        ["痛む|いたむ", "痛", "いたむ"],
        ["苦い|にがい", "苦", "にがい"],
        ["治まる|おさまる", "治", "おさまる"],
        ["治める|おさめる", "治", "おさめる"],
        ["危うい|あやうい", "危", "あやうい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["残す|のこす", "support"],
        ["残り|のこり", "support"],
        ["震える|ふるえる", "support"],
        ["痛む|いたむ", "support"],
        ["苦い|にがい", "support"],
        ["治まる|おさまる", "support"],
        ["治める|おさめる", "support"],
        ["危うい|あやうい", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["残す|のこす", "<ruby>残<rt>のこ</rt></ruby>す"],
        ["残り|のこり", "<ruby>残<rt>のこ</rt></ruby>り"],
        ["震える|ふるえる", "<ruby>震<rt>ふる</rt></ruby>える"],
        ["痛む|いたむ", "<ruby>痛<rt>いた</rt></ruby>む"],
        ["苦い|にがい", "<ruby>苦<rt>にが</rt></ruby>い"],
        ["治まる|おさまる", "<ruby>治<rt>おさ</rt></ruby>まる"],
        ["治める|おさめる", "<ruby>治<rt>おさ</rt></ruby>める"],
        ["危うい|あやうい", "<ruby>危<rt>あや</rt></ruby>うい"],
    ]);
    assert.match(starterEntries["残す|のこす"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["震える|ふるえる"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["痛む|いたむ"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["治める|おさめる"].notes, /Tanos N2 row is only a harder-level discovery hint/);
    assert.match(starterEntries["危うい|あやうい"].notes, /Tanos N2 row is only a harder-level discovery hint/);
});

test("tracked starter word data includes the eighty-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["活かす|いかす", "活", "いかす"],
        ["活きる|いきる", "活", "いきる"],
        ["活ける|いける", "活", "いける"],
        ["慣らす|ならす", "慣", "ならす"],
        ["記す|しるす", "記", "しるす"],
        ["告げる|つげる", "告", "つげる"],
        ["刻む|きざむ", "刻", "きざむ"],
        ["並びに|ならびに", "並", "ならびに"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["活かす|いかす", "support"],
        ["活きる|いきる", "support"],
        ["活ける|いける", "support"],
        ["慣らす|ならす", "support"],
        ["記す|しるす", "support"],
        ["告げる|つげる", "support"],
        ["刻む|きざむ", "support"],
        ["並びに|ならびに", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["活かす|いかす", "<ruby>活<rt>い</rt></ruby>かす"],
        ["活きる|いきる", "<ruby>活<rt>い</rt></ruby>きる"],
        ["活ける|いける", "<ruby>活<rt>い</rt></ruby>ける"],
        ["慣らす|ならす", "<ruby>慣<rt>なら</rt></ruby>す"],
        ["記す|しるす", "<ruby>記<rt>しる</rt></ruby>す"],
        ["告げる|つげる", "<ruby>告<rt>つ</rt></ruby>げる"],
        ["刻む|きざむ", "<ruby>刻<rt>きざ</rt></ruby>む"],
        ["並びに|ならびに", "<ruby>並<rt>なら</rt></ruby>びに"],
    ]);
    assert.match(starterEntries["活ける|いける"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["慣らす|ならす"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["記す|しるす"].notes, /Tanos N1 row is only a harder-level discovery hint/);
    assert.match(starterEntries["刻む|きざむ"].notes, /Tanos N2 row is only a harder-level discovery hint/);
    assert.match(starterEntries["並びに|ならびに"].notes, /formal connector vocabulary/);
});

test("tracked starter word data includes the eighty-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["出掛け|でがけ", "掛", "がけ"],
        ["見積もり|みつもり", "積", "つもり"],
        ["前払い|まえばらい", "払", "ばらい"],
        ["情けない|なさけない", "情", "なさけ"],
        ["変わり|かわり", "変", "かわり"],
        ["果たす|はたす", "果", "はたす"],
        ["浮かべる|うかべる", "浮", "うかべる"],
        ["落とす|おとす", "落", "おとす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["出掛け|でがけ", "support"],
        ["見積もり|みつもり", "support"],
        ["前払い|まえばらい", "support"],
        ["情けない|なさけない", "support"],
        ["変わり|かわり", "support"],
        ["果たす|はたす", "support"],
        ["浮かべる|うかべる", "support"],
        ["落とす|おとす", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["出掛け|でがけ", "<ruby>出<rt>で</rt></ruby><ruby>掛<rt>が</rt></ruby>け"],
        ["見積もり|みつもり", "<ruby>見<rt>み</rt></ruby><ruby>積<rt>つ</rt></ruby>もり"],
        ["前払い|まえばらい", "<ruby>前<rt>まえ</rt></ruby><ruby>払<rt>ばら</rt></ruby>い"],
        ["情けない|なさけない", "<ruby>情<rt>なさ</rt></ruby>けない"],
        ["変わり|かわり", "<ruby>変<rt>か</rt></ruby>わり"],
        ["果たす|はたす", "<ruby>果<rt>は</rt></ruby>たす"],
        ["浮かべる|うかべる", "<ruby>浮<rt>う</rt></ruby>かべる"],
        ["落とす|おとす", "<ruby>落<rt>お</rt></ruby>とす"],
    ]);
    assert.match(starterEntries["見積もり|みつもり"].notes, /common cost\/planning vocabulary/);
    assert.match(starterEntries["情けない|なさけない"].notes, /self-evaluation and feeling vocabulary/);
    assert.match(starterEntries["落とす|おとす"].notes, /common everyday action vocabulary/);
});

test("tracked starter word data includes the eighty-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["収まる|おさまる", "収", "おさまる"],
        ["助かる|たすかる", "助", "たすかる"],
        ["深まる|ふかまる", "深", "ふかまる"],
        ["深める|ふかめる", "深", "ふかめる"],
        ["絶やす|たやす", "絶", "たやす"],
        ["専ら|もっぱら", "専", "もっぱら"],
        ["想う|おもう", "想", "おもう"],
        ["増やす|ふやす", "増", "ふやす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["収まる|おさまる", "support"],
        ["助かる|たすかる", "support"],
        ["深まる|ふかまる", "support"],
        ["深める|ふかめる", "support"],
        ["絶やす|たやす", "support"],
        ["専ら|もっぱら", "support"],
        ["想う|おもう", "support"],
        ["増やす|ふやす", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["収まる|おさまる", "<ruby>収<rt>おさ</rt></ruby>まる"],
        ["助かる|たすかる", "<ruby>助<rt>たす</rt></ruby>かる"],
        ["深まる|ふかまる", "<ruby>深<rt>ふか</rt></ruby>まる"],
        ["深める|ふかめる", "<ruby>深<rt>ふか</rt></ruby>める"],
        ["絶やす|たやす", "<ruby>絶<rt>た</rt></ruby>やす"],
        ["専ら|もっぱら", "<ruby>専<rt>もっぱ</rt></ruby>ら"],
        ["想う|おもう", "<ruby>想<rt>おも</rt></ruby>う"],
        ["増やす|ふやす", "<ruby>増<rt>ふ</rt></ruby>やす"],
    ]);
    assert.match(starterEntries["深める|ふかめる"].notes, /understanding\/relationship vocabulary/);
    assert.match(starterEntries["専ら|もっぱら"].notes, /frequency\/focus adverb vocabulary/);
    assert.match(starterEntries["増やす|ふやす"].notes, /quantity\/change vocabulary/);
});

test("tracked starter word data includes the ninetieth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["速やか|すみやか", "速", "すみやか"],
        ["探る|さぐる", "探", "さぐる"],
        ["遅れる|おくれる", "遅", "おくれる"],
        ["伝わる|つたわる", "伝", "つたわる"],
        ["伝う|つたう", "伝", "つたう"],
        ["努める|つとめる", "努", "つとめる"],
        ["等しい|ひとしい", "等", "ひとしい"],
        ["逃がす|にがす", "逃", "にがす"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["速やか|すみやか", "support"],
        ["探る|さぐる", "support"],
        ["遅れる|おくれる", "support"],
        ["伝わる|つたわる", "support"],
        ["伝う|つたう", "support"],
        ["努める|つとめる", "support"],
        ["等しい|ひとしい", "support"],
        ["逃がす|にがす", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["速やか|すみやか", "<ruby>速<rt>すみ</rt></ruby>やか"],
        ["探る|さぐる", "<ruby>探<rt>さぐ</rt></ruby>る"],
        ["遅れる|おくれる", "<ruby>遅<rt>おく</rt></ruby>れる"],
        ["伝わる|つたわる", "<ruby>伝<rt>つた</rt></ruby>わる"],
        ["伝う|つたう", "<ruby>伝<rt>つた</rt></ruby>う"],
        ["努める|つとめる", "<ruby>努<rt>つと</rt></ruby>める"],
        ["等しい|ひとしい", "<ruby>等<rt>ひと</rt></ruby>しい"],
        ["逃がす|にがす", "<ruby>逃<rt>に</rt></ruby>がす"],
    ]);
    assert.match(starterEntries["等しい|ひとしい"].notes, /Tanos N3 row is used only as a discovery\/weak level hint/);
    assert.match(starterEntries["努める|つとめる"].notes, /effort\/commitment vocabulary/);
    assert.match(starterEntries["逃がす|にがす"].notes, /release\/missed-chance vocabulary/);
});

test("tracked starter word data includes the ninety-first N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["逃す|のがす", "逃", "のがす"],
        ["逃れる|のがれる", "逃", "のがれる"],
        ["犯す|おかす", "犯", "おかす"],
        ["怖がる|こわがる", "怖", "こわがる"],
        ["変える|かえる", "変", "かえる"],
        ["返る|かえる", "返", "かえる"],
        ["暮れる|くれる", "暮", "くれる"],
        ["報いる|むくいる", "報", "むくいる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["逃す|のがす", "support"],
        ["逃れる|のがれる", "support"],
        ["犯す|おかす", "support"],
        ["怖がる|こわがる", "support"],
        ["変える|かえる", "support"],
        ["返る|かえる", "support"],
        ["暮れる|くれる", "support"],
        ["報いる|むくいる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["逃す|のがす", "<ruby>逃<rt>のが</rt></ruby>す"],
        ["逃れる|のがれる", "<ruby>逃<rt>のが</rt></ruby>れる"],
        ["犯す|おかす", "<ruby>犯<rt>おか</rt></ruby>す"],
        ["怖がる|こわがる", "<ruby>怖<rt>こわ</rt></ruby>がる"],
        ["変える|かえる", "<ruby>変<rt>か</rt></ruby>える"],
        ["返る|かえる", "<ruby>返<rt>かえ</rt></ruby>る"],
        ["暮れる|くれる", "<ruby>暮<rt>く</rt></ruby>れる"],
        ["報いる|むくいる", "<ruby>報<rt>むく</rt></ruby>いる"],
    ]);
    assert.match(starterEntries["犯す|おかす"].notes, /rule\/crime vocabulary/);
    assert.match(starterEntries["怖がる|こわがる"].notes, /emotion\/reaction vocabulary/);
    assert.match(starterEntries["報いる|むくいる"].notes, /repayment\/reward vocabulary/);
});

test("tracked starter word data includes the ninety-second N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["鳴く|なく", "鳴", "なく"],
        ["確か|たしか", "確", "たしか"],
        ["確かめる|たしかめる", "確", "たしかめる"],
        ["汚す|けがす", "汚", "けがす"],
        ["汚れる|けがれる", "汚", "けがれる"],
        ["満たす|みたす", "満", "みたす"],
        ["満ちる|みちる", "満", "みちる"],
        ["退く|ひく", "退", "ひく"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["鳴く|なく", "support"],
        ["確か|たしか", "support"],
        ["確かめる|たしかめる", "support"],
        ["汚す|けがす", "support"],
        ["汚れる|けがれる", "support"],
        ["満たす|みたす", "support"],
        ["満ちる|みちる", "support"],
        ["退く|ひく", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["鳴く|なく", "<ruby>鳴<rt>な</rt></ruby>く"],
        ["確か|たしか", "<ruby>確<rt>たし</rt></ruby>か"],
        ["確かめる|たしかめる", "<ruby>確<rt>たし</rt></ruby>かめる"],
        ["汚す|けがす", "<ruby>汚<rt>けが</rt></ruby>す"],
        ["汚れる|けがれる", "<ruby>汚<rt>けが</rt></ruby>れる"],
        ["満たす|みたす", "<ruby>満<rt>み</rt></ruby>たす"],
        ["満ちる|みちる", "<ruby>満<rt>み</rt></ruby>ちる"],
        ["退く|ひく", "<ruby>退<rt>ひ</rt></ruby>く"],
    ]);
    assert.match(starterEntries["確かめる|たしかめる"].notes, /verification vocabulary/);
    assert.match(starterEntries["汚れる|けがれる"].notes, /no JMdict priority marker is treated as a limitation/);
    assert.match(starterEntries["退く|ひく"].notes, /receding\/subsiding vocabulary/);
});

test("tracked starter word data includes the ninety-third N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["面|つら", "面", "つら"],
        ["性|さが", "性", "さが"],
        ["労う|ねぎらう", "労", "ねぎらう"],
        ["戦|いくさ", "戦", "いくさ"],
        ["反らす|そらす", "反", "そらす"],
        ["忙しい|せわしい", "忙", "せわしい"],
        ["震わす|ふるわす", "震", "ふるわす"],
        ["震わせる|ふるわせる", "震", "ふるわせる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["面|つら", "support"],
        ["性|さが", "support"],
        ["労う|ねぎらう", "support"],
        ["戦|いくさ", "support"],
        ["反らす|そらす", "support"],
        ["忙しい|せわしい", "support"],
        ["震わす|ふるわす", "support"],
        ["震わせる|ふるわせる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["面|つら", "<ruby>面<rt>つら</rt></ruby>"],
        ["性|さが", "<ruby>性<rt>さが</rt></ruby>"],
        ["労う|ねぎらう", "<ruby>労<rt>ねぎら</rt></ruby>う"],
        ["戦|いくさ", "<ruby>戦<rt>いくさ</rt></ruby>"],
        ["反らす|そらす", "<ruby>反<rt>そ</rt></ruby>らす"],
        ["忙しい|せわしい", "<ruby>忙<rt>せわ</rt></ruby>しい"],
        ["震わす|ふるわす", "<ruby>震<rt>ふる</rt></ruby>わす"],
        ["震わせる|ふるわせる", "<ruby>震<rt>ふる</rt></ruby>わせる"],
    ]);
    assert.match(starterEntries["面|つら"].notes, /rough\/casual face-surface recognition vocabulary/);
    assert.match(starterEntries["労う|ねぎらう"].notes, /appreciation\/work-effort vocabulary/);
    assert.match(starterEntries["震わせる|ふるわせる"].notes, /trembling-motion vocabulary/);
});

test("tracked starter word data includes the ninety-fourth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["背く|そむく", "背", "そむく"],
        ["背ける|そむける", "背", "そむける"],
        ["更ける|ふける", "更", "ふける"],
        ["更かす|ふかす", "更", "ふかす"],
        ["勝る|まさる", "勝", "まさる"],
        ["勝れる|すぐれる", "勝", "すぐれる"],
        ["解く|ほどく", "解", "ほどく"],
        ["過る|よぎる", "過", "よぎる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["背く|そむく", "support"],
        ["背ける|そむける", "support"],
        ["更ける|ふける", "support"],
        ["更かす|ふかす", "support"],
        ["勝る|まさる", "support"],
        ["勝れる|すぐれる", "support"],
        ["解く|ほどく", "support"],
        ["過る|よぎる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["背く|そむく", "<ruby>背<rt>そむ</rt></ruby>く"],
        ["背ける|そむける", "<ruby>背<rt>そむ</rt></ruby>ける"],
        ["更ける|ふける", "<ruby>更<rt>ふ</rt></ruby>ける"],
        ["更かす|ふかす", "<ruby>更<rt>ふ</rt></ruby>かす"],
        ["勝る|まさる", "<ruby>勝<rt>まさ</rt></ruby>る"],
        ["勝れる|すぐれる", "<ruby>勝<rt>すぐ</rt></ruby>れる"],
        ["解く|ほどく", "<ruby>解<rt>ほど</rt></ruby>く"],
        ["過る|よぎる", "<ruby>過<rt>よぎ</rt></ruby>る"],
    ]);
    assert.match(starterEntries["背く|そむく"].notes, /rule\/promise\/opposition vocabulary/);
    assert.match(starterEntries["更かす|ふかす"].notes, /no JMdict priority marker is treated as a limitation/);
    assert.match(starterEntries["解く|ほどく"].notes, /untying\/unraveling action vocabulary/);
});

test("tracked starter word data includes the ninety-fifth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["過つ|あやまつ", "過", "あやまつ"],
        ["掛かり|かかり", "掛", "かかり"],
        ["手掛かり|てがかり", "掛", "がかり"],
        ["与る|あずかる", "与", "あずかる"],
        ["与する|くみする", "与", "くみする"],
        ["処|ところ", "処", "ところ"],
        ["由|よし", "由", "よし"],
        ["由る|よる", "由", "よる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["過つ|あやまつ", "support"],
        ["掛かり|かかり", "support"],
        ["手掛かり|てがかり", "support"],
        ["与る|あずかる", "support"],
        ["与する|くみする", "support"],
        ["処|ところ", "support"],
        ["由|よし", "support"],
        ["由る|よる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["過つ|あやまつ", "<ruby>過<rt>あやま</rt></ruby>つ"],
        ["掛かり|かかり", "<ruby>掛<rt>か</rt></ruby>かり"],
        ["手掛かり|てがかり", "手<ruby>掛<rt>が</rt></ruby>かり"],
        ["与る|あずかる", "<ruby>与<rt>あずか</rt></ruby>る"],
        ["与する|くみする", "<ruby>与<rt>くみ</rt></ruby>する"],
        ["処|ところ", "<ruby>処<rt>ところ</rt></ruby>"],
        ["由|よし", "<ruby>由<rt>よし</rt></ruby>"],
        ["由る|よる", "<ruby>由<rt>よ</rt></ruby>る"],
    ]);
    assert.match(starterEntries["過つ|あやまつ"].notes, /error\/judgment vocabulary/);
    assert.match(starterEntries["手掛かり|てがかり"].notes, /clue\/search vocabulary/);
    assert.match(starterEntries["由る|よる"].notes, /cause\/dependence written-register vocabulary/);
});

test("tracked starter word data includes the ninety-sixth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["彼の|かの", "彼", "かの"],
        ["訪う|とう", "訪", "とう"],
        ["訪れる|おとずれる", "訪", "おとずれる"],
        ["因む|ちなむ", "因", "ちなむ"],
        ["価|あたい", "価", "あたい"],
        ["覚る|さとる", "覚", "さとる"],
        ["額|ひたい", "額", "ひたい"],
        ["願い|ねがい", "願", "ねがい"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["彼の|かの", "support"],
        ["訪う|とう", "support"],
        ["訪れる|おとずれる", "support"],
        ["因む|ちなむ", "support"],
        ["価|あたい", "support"],
        ["覚る|さとる", "support"],
        ["額|ひたい", "support"],
        ["願い|ねがい", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["彼の|かの", "<ruby>彼<rt>か</rt></ruby>の"],
        ["訪う|とう", "<ruby>訪<rt>と</rt></ruby>う"],
        ["訪れる|おとずれる", "<ruby>訪<rt>おとず</rt></ruby>れる"],
        ["因む|ちなむ", "<ruby>因<rt>ちな</rt></ruby>む"],
        ["価|あたい", "<ruby>価<rt>あたい</rt></ruby>"],
        ["覚る|さとる", "<ruby>覚<rt>さと</rt></ruby>る"],
        ["額|ひたい", "<ruby>額<rt>ひたい</rt></ruby>"],
        ["願い|ねがい", "<ruby>願<rt>ねが</rt></ruby>い"],
    ]);
    assert.match(starterEntries["彼の|かの"].notes, /formal demonstrative recognition vocabulary/);
    assert.match(starterEntries["訪れる|おとずれる"].notes, /visit\/arrival vocabulary/);
    assert.match(starterEntries["願い|ねがい"].notes, /wish\/request vocabulary/);
});

test("tracked starter word data includes the ninety-seventh N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["危ぶむ|あやぶむ", "危", "あやぶむ"],
        ["寄せる|よせる", "寄", "よせる"],
        ["割れる|われる", "割", "われる"],
        ["換わる|かわる", "換", "かわる"],
        ["勤しむ|いそしむ", "勤", "いそしむ"],
        ["勤まる|つとまる", "勤", "つとまる"],
        ["復|また", "復", "また"],
        ["財|たから", "財", "たから"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["危ぶむ|あやぶむ", "support"],
        ["寄せる|よせる", "support"],
        ["割れる|われる", "support"],
        ["換わる|かわる", "support"],
        ["勤しむ|いそしむ", "support"],
        ["勤まる|つとまる", "support"],
        ["復|また", "support"],
        ["財|たから", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["危ぶむ|あやぶむ", "<ruby>危<rt>あや</rt></ruby>ぶむ"],
        ["寄せる|よせる", "<ruby>寄<rt>よ</rt></ruby>せる"],
        ["割れる|われる", "<ruby>割<rt>わ</rt></ruby>れる"],
        ["換わる|かわる", "<ruby>換<rt>か</rt></ruby>わる"],
        ["勤しむ|いそしむ", "<ruby>勤<rt>いそ</rt></ruby>しむ"],
        ["勤まる|つとまる", "<ruby>勤<rt>つと</rt></ruby>まる"],
        ["復|また", "<ruby>復<rt>また</rt></ruby>"],
        ["財|たから", "<ruby>財<rt>たから</rt></ruby>"],
    ]);
    assert.match(starterEntries["危ぶむ|あやぶむ"].notes, /risk\/concern vocabulary/);
    assert.match(starterEntries["勤しむ|いそしむ"].notes, /diligence\/effort vocabulary/);
    assert.match(starterEntries["財|たから"].notes, /treasure\/value vocabulary/);
});

test("tracked starter word data includes the ninety-eighth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["痛ましい|いたましい", "痛", "いたましい"],
        ["痛める|いためる", "痛", "いためる"],
        ["破れる|やぶれる", "破", "やぶれる"],
        ["満つ|みつ", "満", "みつ"],
        ["並べる|ならべる", "並", "ならべる"],
        ["降る|くだる", "降", "くだる"],
        ["降す|くだす", "降", "くだす"],
        ["殺める|あやめる", "殺", "あやめる"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["痛ましい|いたましい", "support"],
        ["痛める|いためる", "support"],
        ["破れる|やぶれる", "support"],
        ["満つ|みつ", "support"],
        ["並べる|ならべる", "support"],
        ["降る|くだる", "support"],
        ["降す|くだす", "support"],
        ["殺める|あやめる", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["痛ましい|いたましい", "<ruby>痛<rt>いた</rt></ruby>ましい"],
        ["痛める|いためる", "<ruby>痛<rt>いた</rt></ruby>める"],
        ["破れる|やぶれる", "<ruby>破<rt>やぶ</rt></ruby>れる"],
        ["満つ|みつ", "<ruby>満<rt>み</rt></ruby>つ"],
        ["並べる|ならべる", "<ruby>並<rt>なら</rt></ruby>べる"],
        ["降る|くだる", "<ruby>降<rt>くだ</rt></ruby>る"],
        ["降す|くだす", "<ruby>降<rt>くだ</rt></ruby>す"],
        ["殺める|あやめる", "<ruby>殺<rt>あや</rt></ruby>める"],
    ]);
    assert.match(starterEntries["痛める|いためる"].notes, /injury\/damage vocabulary/);
    assert.match(starterEntries["満つ|みつ"].notes, /fullness\/tide-moon vocabulary/);
    assert.match(starterEntries["殺める|あやめる"].notes, /serious harm\/crime vocabulary/);
});

test("tracked starter word data includes the ninety-ninth N3 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["怖れる|おそれる", "怖", "おそれる"],
        ["支える|つかえる", "支", "つかえる"],
        ["雑える|まじえる", "雑", "まじえる"],
        ["雑じる|まじる", "雑", "まじる"],
        ["調う|ととのう", "調", "ととのう"],
        ["調える|ととのえる", "調", "ととのえる"],
        ["政|まつりごと", "政", "まつりごと"],
        ["深山|みやま", "深", "み"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["怖れる|おそれる", "support"],
        ["支える|つかえる", "support"],
        ["雑える|まじえる", "support"],
        ["雑じる|まじる", "support"],
        ["調う|ととのう", "support"],
        ["調える|ととのえる", "support"],
        ["政|まつりごと", "support"],
        ["深山|みやま", "support"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["怖れる|おそれる", "<ruby>怖<rt>おそ</rt></ruby>れる"],
        ["支える|つかえる", "<ruby>支<rt>つか</rt></ruby>える"],
        ["雑える|まじえる", "<ruby>雑<rt>まじ</rt></ruby>える"],
        ["雑じる|まじる", "<ruby>雑<rt>ま</rt></ruby>じる"],
        ["調う|ととのう", "<ruby>調<rt>ととの</rt></ruby>う"],
        ["調える|ととのえる", "<ruby>調<rt>ととの</rt></ruby>える"],
        ["政|まつりごと", "<ruby>政<rt>まつりごと</rt></ruby>"],
        ["深山|みやま", "<ruby>深<rt>み</rt></ruby><ruby>山<rt>やま</rt></ruby>"],
    ]);
    assert.match(starterEntries["支える|つかえる"].notes, /blocked\/busy state vocabulary/);
    assert.match(starterEntries["雑える|まじえる"].notes, /mixing\/inclusion written-form recognition/);
    assert.match(starterEntries["政|まつりごと"].notes, /government\/rule written-form recognition/);
});

test("tracked starter word data includes the first N2 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["足跡|あしあと", "跡", "あと"],
        ["厚かましい|あつかましい", "厚", "あつかましい"],
        ["圧縮|あっしゅく", "圧", "あっ"],
        ["暴れる|あばれる", "暴", "あばれる"],
        ["脂|あぶら", "脂", "あぶら"],
        ["甘やかす|あまやかす", "甘", "あまやかす"],
        ["編物|あみもの", "編", "あみ"],
        ["編む|あむ", "編", "あむ"],
        ["荒い|あらい", "荒", "あらい"],
        ["改めて|あらためて", "改", "あらためて"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["足跡|あしあと", "both"],
        ["厚かましい|あつかましい", "both"],
        ["圧縮|あっしゅく", "both"],
        ["暴れる|あばれる", "both"],
        ["脂|あぶら", "both"],
        ["甘やかす|あまやかす", "both"],
        ["編物|あみもの", "both"],
        ["編む|あむ", "both"],
        ["荒い|あらい", "both"],
        ["改めて|あらためて", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["足跡|あしあと", "<ruby>足<rt>あし</rt></ruby><ruby>跡<rt>あと</rt></ruby>"],
        ["厚かましい|あつかましい", "<ruby>厚<rt>あつ</rt></ruby>かましい"],
        ["圧縮|あっしゅく", "<ruby>圧<rt>あっ</rt></ruby><ruby>縮<rt>しゅく</rt></ruby>"],
        ["暴れる|あばれる", "<ruby>暴<rt>あば</rt></ruby>れる"],
        ["脂|あぶら", "<ruby>脂<rt>あぶら</rt></ruby>"],
        ["甘やかす|あまやかす", "<ruby>甘<rt>あま</rt></ruby>やかす"],
        ["編物|あみもの", "<ruby>編<rt>あみ</rt></ruby><ruby>物<rt>もの</rt></ruby>"],
        ["編む|あむ", "<ruby>編<rt>あ</rt></ruby>む"],
        ["荒い|あらい", "<ruby>荒<rt>あら</rt></ruby>い"],
        ["改めて|あらためて", "<ruby>改<rt>あらた</rt></ruby>めて"],
    ]);
});

test("tracked starter word data includes the first N1 Silver source-expansion batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assertCoverageReadings(starterEntries, [
        ["間柄|あいだがら", "柄", "がら"],
        ["敢えて|あえて", "敢", "あえて"],
        ["仰ぐ|あおぐ", "仰", "あおぐ"],
        ["証|あかし", "証", "あかし"],
        ["憧れ|あこがれ", "憧", "あこがれ"],
        ["麻|あさ", "麻", "あさ"],
        ["欺く|あざむく", "欺", "あざむく"],
        ["鮮やか|あざやか", "鮮", "あざやか"],
        ["焦る|あせる", "焦", "あせる"],
        ["圧迫|あっぱく", "迫", "ぱく"],
    ]);
    assertCoverageRoles(starterEntries, [
        ["間柄|あいだがら", "both"],
        ["敢えて|あえて", "both"],
        ["仰ぐ|あおぐ", "both"],
        ["証|あかし", "both"],
        ["憧れ|あこがれ", "both"],
        ["麻|あさ", "both"],
        ["欺く|あざむく", "both"],
        ["鮮やか|あざやか", "both"],
        ["焦る|あせる", "both"],
        ["圧迫|あっぱく", "both"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["間柄|あいだがら", "<ruby>間<rt>あいだ</rt></ruby><ruby>柄<rt>がら</rt></ruby>"],
        ["敢えて|あえて", "<ruby>敢<rt>あ</rt></ruby>えて"],
        ["仰ぐ|あおぐ", "<ruby>仰<rt>あお</rt></ruby>ぐ"],
        ["証|あかし", "<ruby>証<rt>あかし</rt></ruby>"],
        ["憧れ|あこがれ", "<ruby>憧<rt>あこが</rt></ruby>れ"],
        ["麻|あさ", "<ruby>麻<rt>あさ</rt></ruby>"],
        ["欺く|あざむく", "<ruby>欺<rt>あざむ</rt></ruby>く"],
        ["鮮やか|あざやか", "<ruby>鮮<rt>あざ</rt></ruby>やか"],
        ["焦る|あせる", "<ruby>焦<rt>あせ</rt></ruby>る"],
        ["圧迫|あっぱく", "<ruby>圧<rt>あっ</rt></ruby><ruby>迫<rt>ぱく</rt></ruby>"],
    ]);
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

test("word study staleness report fingerprints stale ignored local data", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-study-preflight-"));
    const starterPath = path.join(rootDir, "starter_word_study_data.json");
    const localPath = path.join(rootDir, "word_study_data.json");
    try {
        fs.writeFileSync(starterPath, `${JSON.stringify({
            "計画|けいかく": {
                written: "計画",
                reading: "けいかく",
                meaning: "plan",
                source: "word-study-data",
                tags: ["starter", "n4"],
                jlpt: 4,
            },
            "安心|あんしん": {
                written: "安心",
                reading: "あんしん",
                meaning: "peace of mind",
                source: "word-study-data",
                tags: ["starter", "n4"],
                jlpt: 4,
            },
        }, null, 2)}\n`);
        fs.writeFileSync(localPath, `${JSON.stringify({
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
        }, null, 2)}\n`);

        const report = buildWordStudyDataStalenessReport({ localPath, starterPath });
        const warning = formatWordStudyDataStalenessWarning(report);
        const provenance = formatWordStudyDataOverlayProvenance(report);

        assert.equal(report.needsRefresh, true);
        assert.equal(report.localExists, true);
        assert.equal(report.localPath, path.resolve(localPath));
        assert.match(report.localMtimeIso, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(report.staleStarterDerivedEntryCount, 1);
        assert.equal(report.missingStarterEntryCount, 1);
        assert.equal(report.customLocalEntryCount, 1);
        assert.equal(report.refreshedEntryCount, 3);
        assert.match(report.starterFingerprint, /^[a-f0-9]{64}$/);
        assert.match(report.localFingerprint, /^[a-f0-9]{64}$/);
        assert.match(warning, /starter-derived mismatch: 1 stale, 1 missing/);
        assert.match(warning, /loader refreshes starter-derived entries in memory/);
        assert.match(provenance, /Local word overlay provenance:/);
        assert.match(provenance, new RegExp(`resolved path: ${localPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`));
        assert.match(provenance, /mtime: \d{4}-\d{2}-\d{2}T/);
        assert.match(provenance, /staleness counts: stale starter-derived rows=1; missing starter rows=1; custom local rows=1/);
        assert.match(provenance, /warning: stale_local_overlay/);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test("bootstrapWordStudyData refreshes split starter files into local word data", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-study-bootstrap-split-"));
    const starterPath = path.join(rootDir, "starter_word_study_data.json");
    const n3Path = path.join(rootDir, "starter_word_study_data_n3.json");
    const targetPath = path.join(rootDir, "word_study_data.json");

    try {
        fs.writeFileSync(starterPath, `${JSON.stringify({
            "一|いち": {
                written: "一",
                reading: "いち",
                meaning: "one",
                source: "word-study-data",
                tags: ["starter", "n5"],
                jlpt: 5,
            },
        }, null, 2)}\n`);
        fs.writeFileSync(n3Path, `${JSON.stringify({
            "一枚|いちまい": {
                written: "一枚",
                reading: "いちまい",
                meaning: "one flat thing / one sheet",
                source: "word-study-data",
                tags: ["starter", "common", "n3"],
                jlpt: 3,
                readingBreakdown: "<ruby>一<rt>いち</rt></ruby><ruby>枚<rt>まい</rt></ruby>",
                coverage: {
                    role: "support",
                    focusKanji: ["枚"],
                    coversReadings: { "枚": "まい" },
                },
            },
        }, null, 2)}\n`);
        fs.writeFileSync(targetPath, `${JSON.stringify({
            "一|いち": {
                written: "一",
                reading: "いち",
                meaning: "stale one",
                source: "word-study-data",
                tags: ["starter", "n5"],
                jlpt: 5,
            },
        }, null, 2)}\n`);

        const summary = bootstrapWordStudyData({
            targetPath,
            starterPath,
            refreshStarter: true,
        });
        const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

        assert.equal(summary.starterEntries, 2);
        assert.equal(summary.existingEntries, 1);
        assert.equal(summary.writtenEntries, 2);
        assert.equal(summary.preflight.inSync, true);
        assert.equal(summary.preflightBeforeWrite.missingStarterEntryCount, 1);
        assert.equal(written["一|いち"].meaning, "one");
        assert.equal(written["一枚|いちまい"].coverage.coversReadings["枚"], "まい");
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
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
        ["郵便|ゆうびん", "便", "びん"],
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
        ["強引|ごういん", "引", "いん"],
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

    assert.equal(starterEntries["女房|にょうぼう"].jlpt, 1);
    assert.equal(starterEntries["女房|にょうぼう"].tags.includes("n1"), true);
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
        "合う|あう",
        "お土産|おみやげ",
        "科学|かがく",
        "具合|ぐあい",
        "市|し",
        "小説|しょうせつ",
        "都合|つごう",
        "遠く|とおく",
        "乗り換える|のりかえる",
        "林|はやし",
        "光る|ひかる",
        "引き出し|ひきだし",
        "引っ越す|ひっこす",
        "太る|ふとる",
        "割合|わりあい",
    ];

    assert.equal(n4ExpansionKeys.length, 92);
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
        ["合う|あう", "合", "あう"],
        ["お土産|おみやげ", "お土産", "おみやげ"],
        ["科学|かがく", "科", "か"],
        ["科学|かがく", "学", "がく"],
        ["具合|ぐあい", "具", "ぐ"],
        ["具合|ぐあい", "合", "あい"],
        ["市|し", "市", "し"],
        ["小説|しょうせつ", "小", "しょう"],
        ["小説|しょうせつ", "説", "せつ"],
        ["都合|つごう", "都", "つ"],
        ["都合|つごう", "合", "ごう"],
        ["遠く|とおく", "遠", "とおく"],
        ["乗り換える|のりかえる", "乗", "のり"],
        ["乗り換える|のりかえる", "換", "かえる"],
        ["林|はやし", "林", "はやし"],
        ["光る|ひかる", "光", "ひかる"],
        ["引き出し|ひきだし", "引", "ひき"],
        ["引き出し|ひきだし", "出", "だし"],
        ["引っ越す|ひっこす", "引", "ひっ"],
        ["引っ越す|ひっこす", "越", "こす"],
        ["太る|ふとる", "太", "ふとる"],
        ["割合|わりあい", "割", "わり"],
        ["割合|わりあい", "合", "あい"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["明日|あす", "<ruby>明日<rt>あす</rt></ruby>"],
        ["田舎|いなか", "<ruby>田舎<rt>いなか</rt></ruby>"],
        ["歯医者|はいしゃ", "<ruby>歯<rt>は</rt></ruby><ruby>医<rt>い</rt></ruby><ruby>者<rt>しゃ</rt></ruby>"],
        ["お土産|おみやげ", "<ruby>お土産<rt>おみやげ</rt></ruby>"],
        ["乗り換える|のりかえる", "<ruby>乗り<rt>のり</rt></ruby><ruby>換える<rt>かえる</rt></ruby>"],
        ["引っ越す|ひっこす", "<ruby>引っ<rt>ひっ</rt></ruby><ruby>越す<rt>こす</rt></ruby>"],
    ]);
    assert.match(starterEntries["お土産|おみやげ"].notes, /whole-word reading/);
    assert.match(starterEntries["具合|ぐあい"].notes, /higher-level/);
    assert.match(starterEntries["太る|ふとる"].notes, /neutral self-reference/);
});

test("tracked starter word data includes the first N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingBacklogKeys = [
        "顔|かお",
        "県|けん",
        "次|つぎ",
        "頭|あたま",
        "薬|くすり",
        "声|こえ",
        "村|むら",
        "太い|ふとい",
        "池|いけ",
        "引く|ひく",
        "弱い|よわい",
        "軽い|かるい",
    ];

    for (const key of n4ReadingBacklogKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "both", key);
    }
    assert.equal(starterEntries["区|く"], undefined);
    assert.equal(starterEntries["産|さん"], undefined);
    assertCoverageReadings(starterEntries, [
        ["顔|かお", "顔", "かお"],
        ["県|けん", "県", "けん"],
        ["次|つぎ", "次", "つぎ"],
        ["頭|あたま", "頭", "あたま"],
        ["薬|くすり", "薬", "くすり"],
        ["声|こえ", "声", "こえ"],
        ["村|むら", "村", "むら"],
        ["太い|ふとい", "太", "ふとい"],
        ["池|いけ", "池", "いけ"],
        ["引く|ひく", "引", "ひく"],
        ["弱い|よわい", "弱", "よわい"],
        ["軽い|かるい", "軽", "かるい"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["顔|かお", "<ruby>顔<rt>かお</rt></ruby>"],
        ["太い|ふとい", "<ruby>太<rt>ふと</rt></ruby>い"],
        ["引く|ひく", "<ruby>引<rt>ひ</rt></ruby>く"],
        ["弱い|よわい", "<ruby>弱<rt>よわ</rt></ruby>い"],
        ["軽い|かるい", "<ruby>軽<rt>かる</rt></ruby>い"],
    ]);
    assert.match(starterEntries["引く|ひく"].notes, /distinct from 引き出し/);
    assert.match(starterEntries["太い|ふとい"].notes, /complements 太る/);
});

test("tracked starter word data includes the second N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingBacklogKeys = [
        "暗い|くらい",
        "遠い|とおい",
        "寒い|さむい",
        "洗う|あらう",
        "短い|みじかい",
        "低い|ひくい",
        "疲れる|つかれる",
    ];

    for (const key of n4ReadingBacklogKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "both", key);
    }
    assertCoverageReadings(starterEntries, [
        ["暗い|くらい", "暗", "くらい"],
        ["遠い|とおい", "遠", "とおい"],
        ["寒い|さむい", "寒", "さむい"],
        ["洗う|あらう", "洗", "あらう"],
        ["短い|みじかい", "短", "みじかい"],
        ["低い|ひくい", "低", "ひくい"],
        ["疲れる|つかれる", "疲", "つかれる"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["暗い|くらい", "<ruby>暗<rt>くら</rt></ruby>い"],
        ["遠い|とおい", "<ruby>遠<rt>とお</rt></ruby>い"],
        ["寒い|さむい", "<ruby>寒<rt>さむ</rt></ruby>い"],
        ["洗う|あらう", "<ruby>洗<rt>あら</rt></ruby>う"],
        ["短い|みじかい", "<ruby>短<rt>みじか</rt></ruby>い"],
        ["低い|ひくい", "<ruby>低<rt>ひく</rt></ruby>い"],
        ["疲れる|つかれる", "<ruby>疲<rt>つか</rt></ruby>れる"],
    ]);
    assert.match(starterEntries["遠い|とおい"].notes, /complements 遠く/);
    assert.match(starterEntries["洗う|あらう"].notes, /hygiene/);
});

test("tracked starter word data includes the third N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingSupportKeys = [
        "区別|くべつ",
        "産地|さんち",
        "労働|ろうどう",
        "首都|しゅと",
        "遠足|えんそく",
        "暗記|あんき",
        "好物|こうぶつ",
        "次回|じかい",
        "乗車|じょうしゃ",
        "森林|しんりん",
    ];

    for (const key of n4ReadingSupportKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "support", key);
    }
    assertCoverageReadings(starterEntries, [
        ["区別|くべつ", "区", "く"],
        ["区別|くべつ", "別", "べつ"],
        ["産地|さんち", "産", "さん"],
        ["産地|さんち", "地", "ち"],
        ["労働|ろうどう", "働", "どう"],
        ["首都|しゅと", "首", "しゅ"],
        ["首都|しゅと", "都", "と"],
        ["遠足|えんそく", "遠", "えん"],
        ["遠足|えんそく", "足", "そく"],
        ["暗記|あんき", "暗", "あん"],
        ["好物|こうぶつ", "好", "こう"],
        ["好物|こうぶつ", "物", "ぶつ"],
        ["次回|じかい", "次", "じ"],
        ["次回|じかい", "回", "かい"],
        ["乗車|じょうしゃ", "乗", "じょう"],
        ["乗車|じょうしゃ", "車", "しゃ"],
        ["森林|しんりん", "森", "しん"],
        ["森林|しんりん", "林", "りん"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["区別|くべつ", "<ruby>区<rt>く</rt></ruby><ruby>別<rt>べつ</rt></ruby>"],
        ["産地|さんち", "<ruby>産<rt>さん</rt></ruby><ruby>地<rt>ち</rt></ruby>"],
        ["労働|ろうどう", "<ruby>労<rt>ろう</rt></ruby><ruby>働<rt>どう</rt></ruby>"],
        ["首都|しゅと", "<ruby>首<rt>しゅ</rt></ruby><ruby>都<rt>と</rt></ruby>"],
        ["遠足|えんそく", "<ruby>遠<rt>えん</rt></ruby><ruby>足<rt>そく</rt></ruby>"],
        ["暗記|あんき", "<ruby>暗<rt>あん</rt></ruby><ruby>記<rt>き</rt></ruby>"],
        ["森林|しんりん", "<ruby>森<rt>しん</rt></ruby><ruby>林<rt>りん</rt></ruby>"],
    ]);
    assert.match(starterEntries["労働|ろうどう"].notes, /労=N3/);
    assert.match(starterEntries["暗記|あんき"].notes, /記=N3/);
    assert.match(starterEntries["産地|さんち"].notes, /product-origin/);
});

test("tracked starter word data includes the fourth N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingSupportKeys = [
        "進歩|しんぽ",
        "音声|おんせい",
        "強弱|きょうじゃく",
        "短所|たんしょ",
        "観光|かんこう",
        "軽食|けいしょく",
        "電池|でんち",
        "洗顔|せんがん",
        "太陽|たいよう",
        "市場|いちば",
    ];

    for (const key of n4ReadingSupportKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "support", key);
    }
    assert.equal(starterEntries["市場|しじょう"], undefined);
    assertCoverageReadings(starterEntries, [
        ["進歩|しんぽ", "進", "しん"],
        ["音声|おんせい", "声", "せい"],
        ["強弱|きょうじゃく", "弱", "じゃく"],
        ["短所|たんしょ", "短", "たん"],
        ["観光|かんこう", "光", "こう"],
        ["軽食|けいしょく", "軽", "けい"],
        ["電池|でんち", "池", "ち"],
        ["洗顔|せんがん", "洗", "せん"],
        ["洗顔|せんがん", "顔", "がん"],
        ["太陽|たいよう", "太", "たい"],
        ["市場|いちば", "市", "いち"],
        ["市場|いちば", "場", "ば"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["進歩|しんぽ", "<ruby>進<rt>しん</rt></ruby><ruby>歩<rt>ぽ</rt></ruby>"],
        ["音声|おんせい", "<ruby>音<rt>おん</rt></ruby><ruby>声<rt>せい</rt></ruby>"],
        ["強弱|きょうじゃく", "<ruby>強<rt>きょう</rt></ruby><ruby>弱<rt>じゃく</rt></ruby>"],
        ["短所|たんしょ", "<ruby>短<rt>たん</rt></ruby><ruby>所<rt>しょ</rt></ruby>"],
        ["観光|かんこう", "<ruby>観<rt>かん</rt></ruby><ruby>光<rt>こう</rt></ruby>"],
        ["軽食|けいしょく", "<ruby>軽<rt>けい</rt></ruby><ruby>食<rt>しょく</rt></ruby>"],
        ["電池|でんち", "<ruby>電<rt>でん</rt></ruby><ruby>池<rt>ち</rt></ruby>"],
        ["洗顔|せんがん", "<ruby>洗<rt>せん</rt></ruby><ruby>顔<rt>がん</rt></ruby>"],
        ["太陽|たいよう", "<ruby>太<rt>たい</rt></ruby><ruby>陽<rt>よう</rt></ruby>"],
        ["市場|いちば", "<ruby>市<rt>いち</rt></ruby><ruby>場<rt>ば</rt></ruby>"],
    ]);
    assert.match(starterEntries["観光|かんこう"].notes, /観=N3/);
    assert.match(starterEntries["太陽|たいよう"].notes, /陽=N3/);
    assert.match(starterEntries["市場|いちば"].notes, /市場（しじょう）/);
});

test("tracked starter word data includes the fifth N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingSupportKeys = [
        "低音|ていおん",
        "薬品|やくひん",
        "頭痛|ずつう",
        "先頭|せんとう",
        "疲労|ひろう",
        "青菜|あおな",
        "合宿|がっしゅく",
        "回り道|まわりみち",
    ];

    for (const key of n4ReadingSupportKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "support", key);
    }
    assertCoverageReadings(starterEntries, [
        ["低音|ていおん", "低", "てい"],
        ["薬品|やくひん", "薬", "やく"],
        ["頭痛|ずつう", "頭", "ず"],
        ["先頭|せんとう", "頭", "とう"],
        ["疲労|ひろう", "疲", "ひ"],
        ["青菜|あおな", "菜", "な"],
        ["合宿|がっしゅく", "合", "がっ"],
        ["回り道|まわりみち", "回", "まわり"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["低音|ていおん", "<ruby>低<rt>てい</rt></ruby><ruby>音<rt>おん</rt></ruby>"],
        ["薬品|やくひん", "<ruby>薬<rt>やく</rt></ruby><ruby>品<rt>ひん</rt></ruby>"],
        ["頭痛|ずつう", "<ruby>頭<rt>ず</rt></ruby><ruby>痛<rt>つう</rt></ruby>"],
        ["先頭|せんとう", "<ruby>先<rt>せん</rt></ruby><ruby>頭<rt>とう</rt></ruby>"],
        ["疲労|ひろう", "<ruby>疲<rt>ひ</rt></ruby><ruby>労<rt>ろう</rt></ruby>"],
        ["青菜|あおな", "<ruby>青<rt>あお</rt></ruby><ruby>菜<rt>な</rt></ruby>"],
        ["合宿|がっしゅく", "<ruby>合<rt>がっ</rt></ruby><ruby>宿<rt>しゅく</rt></ruby>"],
        ["回り道|まわりみち", "<ruby>回り<rt>まわり</rt></ruby><ruby>道<rt>みち</rt></ruby>"],
    ]);
    assert.match(starterEntries["頭痛|ずつう"].notes, /痛=N3/);
    assert.match(starterEntries["疲労|ひろう"].notes, /労=N3/);
    assert.match(starterEntries["合宿|がっしゅく"].notes, /宿=N3/);
    assert.match(starterEntries["回り道|まわりみち"].notes, /回 -> まわり/);
});

test("tracked starter word data includes the sixth N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingSupportKeys = [
        "寒波|かんぱ",
        "村民|そんみん",
        "次第|しだい",
        "声色|こわいろ",
    ];

    for (const key of n4ReadingSupportKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "support", key);
    }
    assertCoverageReadings(starterEntries, [
        ["寒波|かんぱ", "寒", "かん"],
        ["村民|そんみん", "村", "そん"],
        ["次第|しだい", "次", "し"],
        ["声色|こわいろ", "声", "こわ"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["寒波|かんぱ", "<ruby>寒<rt>かん</rt></ruby><ruby>波<rt>ぱ</rt></ruby>"],
        ["村民|そんみん", "<ruby>村<rt>そん</rt></ruby><ruby>民<rt>みん</rt></ruby>"],
        ["次第|しだい", "<ruby>次<rt>し</rt></ruby><ruby>第<rt>だい</rt></ruby>"],
        ["声色|こわいろ", "<ruby>声<rt>こわ</rt></ruby><ruby>色<rt>いろ</rt></ruby>"],
    ]);
    assert.match(starterEntries["寒波|かんぱ"].notes, /波=N3/);
    assert.match(starterEntries["村民|そんみん"].notes, /民 support/);
    assert.match(starterEntries["次第|しだい"].notes, /第=N1/);
    assert.match(starterEntries["声色|こわいろ"].notes, /声色（せいしょく）/);
});

test("tracked starter word data includes the seventh N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingSupportKeys = [
        "門出|かどで",
        "産声|うぶごえ",
        "目頭|めがしら",
        "頭文字|かしらもじ",
    ];

    for (const key of n4ReadingSupportKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "support", key);
    }
    assert.equal(starterEntries["合戦|かっせん"], undefined);
    assert.equal(starterEntries["遊説|ゆうぜい"], undefined);
    assertCoverageReadings(starterEntries, [
        ["門出|かどで", "門", "かど"],
        ["産声|うぶごえ", "産", "うぶ"],
        ["目頭|めがしら", "頭", "がしら"],
        ["頭文字|かしらもじ", "頭", "かしら"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["門出|かどで", "<ruby>門<rt>かど</rt></ruby><ruby>出<rt>で</rt></ruby>"],
        ["産声|うぶごえ", "<ruby>産<rt>うぶ</rt></ruby><ruby>声<rt>ごえ</rt></ruby>"],
        ["目頭|めがしら", "<ruby>目<rt>め</rt></ruby><ruby>頭<rt>がしら</rt></ruby>"],
        ["頭文字|かしらもじ", "<ruby>頭<rt>かしら</rt></ruby><ruby>文字<rt>もじ</rt></ruby>"],
    ]);
    assert.match(starterEntries["門出|かどで"].notes, /N5 出 support/);
    assert.match(starterEntries["産声|うぶごえ"].notes, /birth\/new-beginning/);
    assert.match(starterEntries["目頭|めがしら"].notes, /目頭が熱くなる/);
    assert.match(starterEntries["頭文字|かしらもじ"].notes, /文字 support/);
});

test("tracked starter word data includes the eighth N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingSupportKeys = [
        "産む|うむ",
        "産まれる|うまれる",
        "好む|このむ",
        "弱まる|よわまる",
        "弱める|よわめる",
        "弱る|よわる",
        "回す|まわす",
        "合わせる|あわせる",
        "全く|まったく",
        "全て|すべて",
        "便り|たより",
    ];

    for (const key of n4ReadingSupportKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "support", key);
    }
    assert.equal(starterEntries["好い|よい"], undefined);
    assert.equal(starterEntries["回し|まわし"], undefined);
    assert.equal(starterEntries["剽軽|ひょうきん"], undefined);
    assertCoverageReadings(starterEntries, [
        ["産む|うむ", "産", "うむ"],
        ["産まれる|うまれる", "産", "うまれる"],
        ["好む|このむ", "好", "このむ"],
        ["弱まる|よわまる", "弱", "よわまる"],
        ["弱める|よわめる", "弱", "よわめる"],
        ["弱る|よわる", "弱", "よわる"],
        ["回す|まわす", "回", "まわす"],
        ["合わせる|あわせる", "合", "あわせる"],
        ["全く|まったく", "全", "まったく"],
        ["全て|すべて", "全", "すべて"],
        ["便り|たより", "便", "たより"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["産む|うむ", "<ruby>産<rt>う</rt></ruby>む"],
        ["産まれる|うまれる", "<ruby>産<rt>う</rt></ruby>まれる"],
        ["好む|このむ", "<ruby>好<rt>この</rt></ruby>む"],
        ["弱まる|よわまる", "<ruby>弱<rt>よわ</rt></ruby>まる"],
        ["弱める|よわめる", "<ruby>弱<rt>よわ</rt></ruby>める"],
        ["弱る|よわる", "<ruby>弱<rt>よわ</rt></ruby>る"],
        ["回す|まわす", "<ruby>回<rt>まわ</rt></ruby>す"],
        ["合わせる|あわせる", "<ruby>合<rt>あ</rt></ruby>わせる"],
        ["全く|まったく", "<ruby>全<rt>まった</rt></ruby>く"],
        ["全て|すべて", "<ruby>全<rt>すべ</rt></ruby>て"],
        ["便り|たより", "<ruby>便<rt>たよ</rt></ruby>り"],
    ]);
    assert.match(starterEntries["産まれる|うまれる"].notes, /N5 生まれる remains/);
    assert.match(starterEntries["好む|このむ"].notes, /好い spelling variants/);
    assert.match(starterEntries["回す|まわす"].notes, /nominal 回し/);
    assert.match(starterEntries["便り|たより"].notes, /proverb-shaped/);
});

test("tracked starter word data includes the ninth N4 active reading backlog batch", () => {
    const starterEntries = loadTrackedStarterWordEntries();
    const n4ReadingSupportKeys = [
        "民|たみ",
        "都|みやこ",
        "次ぐ|つぐ",
        "説く|とく",
        "利く|きく",
        "軽やか|かろやか",
        "乗せる|のせる",
        "進める|すすめる",
        "低める|ひくめる",
    ];

    for (const key of n4ReadingSupportKeys) {
        assert.equal(starterEntries[key]?.jlpt, 4, key);
        assert.equal(starterEntries[key]?.source, "starter-word", key);
        assert.equal(starterEntries[key]?.coverage?.role, "support", key);
    }
    assert.equal(starterEntries["頭を振る|かぶりをふる"], undefined);
    assert.equal(starterEntries["暗れる|くれる"], undefined);
    assert.equal(starterEntries["合わす|あわす"], undefined);
    assert.equal(starterEntries["軽んじる|かろんじる"], undefined);
    assertCoverageReadings(starterEntries, [
        ["民|たみ", "民", "たみ"],
        ["都|みやこ", "都", "みやこ"],
        ["次ぐ|つぐ", "次", "つぐ"],
        ["説く|とく", "説", "とく"],
        ["利く|きく", "利", "きく"],
        ["軽やか|かろやか", "軽", "かろやか"],
        ["乗せる|のせる", "乗", "のせる"],
        ["進める|すすめる", "進", "すすめる"],
        ["低める|ひくめる", "低", "ひくめる"],
    ]);
    assertReadingBreakdowns(starterEntries, [
        ["民|たみ", "<ruby>民<rt>たみ</rt></ruby>"],
        ["都|みやこ", "<ruby>都<rt>みやこ</rt></ruby>"],
        ["次ぐ|つぐ", "<ruby>次<rt>つ</rt></ruby>ぐ"],
        ["説く|とく", "<ruby>説<rt>と</rt></ruby>く"],
        ["利く|きく", "<ruby>利<rt>き</rt></ruby>く"],
        ["軽やか|かろやか", "<ruby>軽<rt>かろ</rt></ruby>やか"],
        ["乗せる|のせる", "<ruby>乗<rt>の</rt></ruby>せる"],
        ["進める|すすめる", "<ruby>進<rt>すす</rt></ruby>める"],
        ["低める|ひくめる", "<ruby>低<rt>ひく</rt></ruby>める"],
    ]);
    assert.match(starterEntries["民|たみ"].notes, /市民 and 村民/);
    assert.match(starterEntries["都|みやこ"].notes, /municipal 都 -> と/);
    assert.match(starterEntries["利く|きく"].notes, /聞く and 効く/);
    assert.match(starterEntries["低める|ひくめる"].notes, /低まる/);
});

test("tracked starter word data protects first N4 platinum examples and notes", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["言う|いう"].exampleSentence.japanese, "正しい答えを言う練習をします。");
    assert.equal(starterEntries["言う|いう"].exampleSentence.reading, "ただしいこたえをいうれんしゅうをします。");
    assert.equal(starterEntries["洗う|あらう"].exampleSentence.japanese, "食事の前に手を洗うことは大切です。");
    assert.equal(starterEntries["洗う|あらう"].exampleSentence.reading, "しょくじのまえにてをあらうことはたいせつです。");
    assert.equal(starterEntries["引く|ひく"].exampleSentence.japanese, "このドアは手前に引くと開きます。");
    assert.equal(starterEntries["引く|ひく"].exampleSentence.reading, "このドアはてまえにひくとあきます。");
    assert.match(starterEntries["弟|おとうと"].notes, /word-card reading is おとうと/);
    assertCoverageReadings(starterEntries, [
        ["弟|おとうと", "弟", "おとうと"],
    ]);
});

test("tracked starter word data protects second N4 platinum surface fixes", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["通う|かよう"].exampleSentence.japanese, "毎日電車で学校に通うのは大変です。");
    assert.equal(starterEntries["通う|かよう"].exampleSentence.reading, "まいにちでんしゃでがっこうにかようのはたいへんです。");
    assert.match(starterEntries["夜|よる"].notes, /Core N4 time word/);
    assert.match(starterEntries["朝|あさ"].notes, /Core N4 time word/);
    assert.match(starterEntries["急ぐ|いそぐ"].notes, /Common N4 action verb/);
    assert.match(starterEntries["兄|あに"].notes, /word-card reading is あに/);
    assertCoverageReadings(starterEntries, [
        ["夜|よる", "夜", "よる"],
        ["朝|あさ", "朝", "あさ"],
        ["会う|あう", "会", "あう"],
        ["急ぐ|いそぐ", "急", "いそぐ"],
        ["兄|あに", "兄", "あに"],
    ]);
});

test("tracked starter word data protects third N4 platinum surface fixes", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["住む|すむ"].exampleSentence.japanese, "家族と近くの町に住む予定です。");
    assert.equal(starterEntries["住む|すむ"].exampleSentence.reading, "かぞくとちかくのまちにすむよていです。");
    assert.equal(starterEntries["乗る|のる"].exampleSentence.japanese, "朝の電車に乗る人が多いです。");
    assert.equal(starterEntries["乗る|のる"].exampleSentence.reading, "あさのでんしゃにのるひとがおおいです。");
    assert.match(starterEntries["手|て"].notes, /word-card reading is て/);
    assert.match(starterEntries["魚|さかな"].notes, /word-card reading is さかな/);
    assert.match(starterEntries["屋|や"].notes, /shop\/seller suffix/);
    assert.match(starterEntries["屋|や"].notes, /word-card reading is や/);
    assertCoverageReadings(starterEntries, [
        ["住む|すむ", "住", "すむ"],
        ["乗る|のる", "乗", "のる"],
        ["手|て", "手", "て"],
        ["魚|さかな", "魚", "さかな"],
        ["青い|あおい", "青", "あおい"],
    ]);
});

test("tracked starter word data protects fourth N4 platinum surface fixes", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["晩|ばん"].exampleSentence.japanese, "その晩は家でゆっくり休みました。");
    assert.equal(starterEntries["晩|ばん"].exampleSentence.reading, "そのばんはいえでゆっくりやすみました。");
    assert.equal(starterEntries["死ぬ|しぬ"].exampleSentence.japanese, "水が少ないと魚が死ぬことがあります。");
    assert.equal(starterEntries["死ぬ|しぬ"].exampleSentence.reading, "みずがすくないとさかながしぬことがあります。");
    assert.equal(starterEntries["待つ|まつ"].exampleSentence.japanese, "駅で友だちを待つのは少し寒いです。");
    assert.equal(starterEntries["待つ|まつ"].exampleSentence.reading, "えきでともだちをまつのはすこしさむいです。");
    assert.match(starterEntries["海|うみ"].notes, /word-card reading is うみ/);
    assertCoverageReadings(starterEntries, [
        ["赤い|あかい", "赤", "あかい"],
        ["歩く|あるく", "歩", "あるく"],
        ["海|うみ", "海", "うみ"],
        ["起きる|おきる", "起", "おきる"],
        ["使う|つかう", "使", "つかう"],
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
    assert.match(starterEntries["一緒|いっしょ"].notes, /doing something together/);
    assert.equal(starterEntries["一緒|いっしょ"].exampleSentence.japanese, "友だちと一緒に行きます。");
    assert.equal(starterEntries["大好き|だいすき"].exampleSentence.japanese, "日本語が大好きです。");
    assert.equal(starterEntries["毎晩|まいばん"].exampleSentence.japanese, "毎晩、本を読みます。");
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
    assert.match(starterEntries["生徒|せいと"].notes, /higher-level kanji/);
    assert.match(starterEntries["二十歳|はたち"].notes, /must not be split/);
    assert.equal(starterEntries["飛行機|ひこうき"].exampleSentence.japanese, "飛行機で行きます。");
    assert.equal(starterEntries["廊下|ろうか"].exampleSentence.japanese, "廊下を歩きます。");
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

test("tracked starter word data protects current-standard N5 platinum examples and support notes", () => {
    const starterEntries = loadTrackedStarterWordEntries();

    assert.equal(starterEntries["一日|ついたち"].exampleSentence.japanese, "来月の一日に学校へ行きます。");
    assert.match(starterEntries["子犬|こいぬ"].notes, /犬 is higher-level support/);
    assert.equal(starterEntries["子犬|こいぬ"].exampleSentence.japanese, "小さい子犬がいます。");
    assert.match(starterEntries["駅前|えきまえ"].notes, /駅 is higher-level support/);
    assert.equal(starterEntries["行き先|ゆきさき"].exampleSentence.japanese, "行き先を書いてください。");
    assert.equal(starterEntries["東京|とうきょう"].exampleSentence.japanese, "東京へ行きます。");
    assert.equal(starterEntries["会話|かいわ"].exampleSentence.japanese, "友だちと会話をします。");
    assert.match(starterEntries["来い|こい"].notes, /blunt and commanding/);
    assert.equal(starterEntries["来い|こい"].exampleSentence.japanese, "いぬに「来い」と言います。");
    assert.equal(starterEntries["英語|えいご"].exampleSentence.japanese, "英語を勉強します。");
    assert.equal(starterEntries["二日|ふつか"].exampleSentence.japanese, "二日に学校へ行きます。");
    assert.equal(starterEntries["食事|しょくじ"].exampleSentence.japanese, "家で食事をします。");
    assert.equal(starterEntries["今晩|こんばん"].exampleSentence.japanese, "今晩、家で本を読みます。");
    assert.match(starterEntries["生ビール|なまびーる"].notes, /adult restaurant word/);
    assert.match(starterEntries["椅子|いす"].notes, /outside the JLPT kanji contract/);
    assert.match(starterEntries["月曜日|げつようび"].notes, /Core weekday word for Monday/);
    assert.match(starterEntries["火曜日|かようび"].notes, /火 -> か and 日 -> び/);
    assert.equal(starterEntries["男子|だんし"].exampleSentence.japanese, "男子は先に入ります。");
    assert.match(starterEntries["男子|だんし"].notes, /recognition\/support for 男 -> だん/);
    assert.match(starterEntries["金曜日|きんようび"].notes, /Core weekday word for Friday/);
    assert.equal(starterEntries["誕生日|たんじょうび"].exampleSentence.japanese, "今日は私の誕生日です。");
    assert.match(starterEntries["誕生日|たんじょうび"].notes, /誕 is higher-level support/);
    assert.equal(starterEntries["水曜日|すいようび"].exampleSentence.japanese, "水曜日に学校へ行きます。");
    assert.match(starterEntries["自転車|じてんしゃ"].notes, /自 and 転 are higher-level support/);
    assert.equal(starterEntries["金具|かなぐ"].exampleSentence.japanese, "かばんの金具は小さいです。");
    assert.match(starterEntries["金具|かなぐ"].notes, /具 visibly labeled as higher-level/);
    assert.equal(starterEntries["四月|しがつ"].exampleSentence.japanese, "四月に学校が始まります。");
    assert.equal(starterEntries["左折|させつ"].exampleSentence.japanese, "ここで左折します。");
    assert.equal(starterEntries["葉書|はがき"].exampleSentence.japanese, "友だちに葉書を書きます。");
    assert.match(starterEntries["葉書|はがき"].notes, /often written はがき or ハガキ/);
    assert.match(starterEntries["万事|ばんじ"].notes, /not the default beginner word/);
    assert.match(starterEntries["上着|うわぎ"].notes, /着 visibly labeled as higher-level/);
    assert.equal(starterEntries["小指|こゆび"].exampleSentence.japanese, "小指が痛いです。");
    assert.match(starterEntries["小指|こゆび"].notes, /指 visibly labeled as higher-level/);
    assert.equal(starterEntries["外科|げか"].exampleSentence.japanese, "父は外科へ行きます。");
    assert.equal(starterEntries["生地|きじ"].exampleSentence.japanese, "この生地はやわらかいです。");
    assert.match(starterEntries["生地|きじ"].notes, /生地 is ambiguous/);
    assert.equal(starterEntries["土地|とち"].exampleSentence.japanese, "この土地は大きいです。");
    assert.match(starterEntries["大使館|たいしかん"].notes, /generated pitch remains visibly labeled/);
    assert.equal(starterEntries["木陰|こかげ"].exampleSentence.japanese, "木陰で少し休みます。");
    assert.equal(starterEntries["手本|てほん"].exampleSentence.japanese, "手本を見て書きます。");
    assert.match(starterEntries["十回|じっかい"].notes, /generated pitch visibly labeled/);
    assert.match(starterEntries["行事|ぎょうじ"].notes, /事 visibly labeled as higher-level/);
    assert.match(starterEntries["帽子|ぼうし"].notes, /Core clothing word/);
    assert.match(starterEntries["五月|ごがつ"].notes, /Core month word for May/);
    assert.match(starterEntries["飛行機|ひこうき"].notes, /generated pitch remains visibly labeled/);
    assert.match(starterEntries["下手|へた"].notes, /上手 counterpart/);
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
        ["元気|げんき", "元", "げん"],
        ["元気|げんき", "気", "き"],
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
    assertReadingBreakdowns(starterEntries, [
        ["行う|おこなう", "<ruby>行<rt>おこな</rt></ruby>う"],
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
    assert.match(starterEntries["小雨|こさめ"].notes, /support-only/);
    assert.match(starterEntries["三百|さんびゃく"].notes, /number-sound change/);
    assert.equal(starterEntries["上手|じょうず"].exampleSentence.japanese, "友だちは日本語が上手です。");
    assert.equal(starterEntries["生える|はえる"].exampleSentence.japanese, "草が生えています。");
    assert.equal(starterEntries["北東|ほくとう"].exampleSentence.japanese, "学校は北東にあります。");
    assert.equal(starterEntries["小川|おがわ"].exampleSentence.japanese, "小川があります。");
    assert.equal(starterEntries["上下|じょうげ"].exampleSentence.japanese, "上下に動きます。");
    assert.match(starterEntries["元気|げんき"].notes, /N4 元 -> げん/);
});
