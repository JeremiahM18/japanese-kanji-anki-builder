const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    auditWordStudyEntriesAgainstContract,
    buildStarterWordGovernanceSummary,
    buildInventoryCountsFromWordLevels,
    buildJlptWordLevelContract,
    getJlptWordLevel,
    loadJlptWordLevelContract,
} = require("../src/datasets/jlptWordLevelContract");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-level-contract-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildJlptWordLevelContract computes inventory counts from canonical word levels", () => {
    const contract = buildJlptWordLevelContract({
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 4 },
        },
        excludedWordLevels: {
            "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, exclusionReason: "phrase" },
        },
    });

    assert.equal(contract.inventoryCounts["5"], 1);
    assert.equal(contract.inventoryCounts["4"], 1);
    assert.equal(contract.inventoryCounts["3"], 0);
    assert.equal(contract.excludedCounts["5"], 1);
});

test("loadJlptWordLevelContract parses a tracked contract file", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "jlpt_word_level_contract.json");
        fs.writeFileSync(filePath, JSON.stringify({
            version: 1,
            inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            },
        }), "utf-8");

        const contract = loadJlptWordLevelContract(filePath);
        assert.equal(getJlptWordLevel(contract, "今日|きょう"), 5);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("loadJlptWordLevelContract rejects stale derived inventory counts", () => {
    const rootDir = makeTempDir();

    try {
        const filePath = path.join(rootDir, "jlpt_word_level_contract.json");
        fs.writeFileSync(filePath, JSON.stringify({
            version: 1,
            inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 99 },
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            },
        }), "utf-8");

        assert.throws(
            () => loadJlptWordLevelContract(filePath),
            /inventoryCounts\.5 is stale/i,
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("tracked JLPT word contract keeps standalone words in their governed word level", () => {
    const contract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));
    const n5StandaloneNumberWords = [
        "一|いち",
        "二|に",
        "三|さん",
        "四|よん",
        "五|ご",
        "六|ろく",
        "七|なな",
        "八|はち",
        "九|きゅう",
        "十|じゅう",
    ];

    assert.equal(contract.inventoryCounts["1"], 26);
    assert.equal(contract.inventoryCounts["2"], 28);
    assert.equal(contract.inventoryCounts["3"], 179);
    assert.equal(contract.inventoryCounts["4"], 667);
    assert.equal(contract.inventoryCounts["5"], 287);
    assert.equal(contract.excludedCounts["5"], 20);
    for (const key of n5StandaloneNumberWords) {
        assert.equal(getJlptWordLevel(contract, key), 5);
    }
    assert.equal(getJlptWordLevel(contract, "安心|あんしん"), 4);
    assert.equal(getJlptWordLevel(contract, "聞こえる|きこえる"), 4);
    assert.equal(getJlptWordLevel(contract, "番組|ばんぐみ"), 4);
    assert.equal(getJlptWordLevel(contract, "市民|しみん"), 4);
    assert.equal(getJlptWordLevel(contract, "首|くび"), 4);
    assert.equal(getJlptWordLevel(contract, "専門|せんもん"), 4);
    assert.equal(getJlptWordLevel(contract, "光|ひかり"), 4);
    assert.equal(getJlptWordLevel(contract, "森|もり"), 4);
    assert.equal(getJlptWordLevel(contract, "進む|すすむ"), 4);
    assert.equal(getJlptWordLevel(contract, "回る|まわる"), 4);
    assert.equal(getJlptWordLevel(contract, "合う|あう"), 4);
    assert.equal(getJlptWordLevel(contract, "お土産|おみやげ"), 4);
    assert.equal(getJlptWordLevel(contract, "科学|かがく"), 4);
    assert.equal(getJlptWordLevel(contract, "具合|ぐあい"), 4);
    assert.equal(getJlptWordLevel(contract, "市|し"), 4);
    assert.equal(getJlptWordLevel(contract, "小説|しょうせつ"), 4);
    assert.equal(getJlptWordLevel(contract, "都合|つごう"), 4);
    assert.equal(getJlptWordLevel(contract, "遠く|とおく"), 4);
    assert.equal(getJlptWordLevel(contract, "乗り換える|のりかえる"), 4);
    assert.equal(getJlptWordLevel(contract, "林|はやし"), 4);
    assert.equal(getJlptWordLevel(contract, "光る|ひかる"), 4);
    assert.equal(getJlptWordLevel(contract, "引き出し|ひきだし"), 4);
    assert.equal(getJlptWordLevel(contract, "引っ越す|ひっこす"), 4);
    assert.equal(getJlptWordLevel(contract, "太る|ふとる"), 4);
    assert.equal(getJlptWordLevel(contract, "割合|わりあい"), 4);
    assert.equal(getJlptWordLevel(contract, "顔|かお"), 4);
    assert.equal(getJlptWordLevel(contract, "県|けん"), 4);
    assert.equal(getJlptWordLevel(contract, "次|つぎ"), 4);
    assert.equal(getJlptWordLevel(contract, "頭|あたま"), 4);
    assert.equal(getJlptWordLevel(contract, "薬|くすり"), 4);
    assert.equal(getJlptWordLevel(contract, "声|こえ"), 4);
    assert.equal(getJlptWordLevel(contract, "村|むら"), 4);
    assert.equal(getJlptWordLevel(contract, "太い|ふとい"), 4);
    assert.equal(getJlptWordLevel(contract, "池|いけ"), 4);
    assert.equal(getJlptWordLevel(contract, "引く|ひく"), 4);
    assert.equal(getJlptWordLevel(contract, "弱い|よわい"), 4);
    assert.equal(getJlptWordLevel(contract, "軽い|かるい"), 4);
    assert.equal(getJlptWordLevel(contract, "暗い|くらい"), 4);
    assert.equal(getJlptWordLevel(contract, "遠い|とおい"), 4);
    assert.equal(getJlptWordLevel(contract, "寒い|さむい"), 4);
    assert.equal(getJlptWordLevel(contract, "洗う|あらう"), 4);
    assert.equal(getJlptWordLevel(contract, "短い|みじかい"), 4);
    assert.equal(getJlptWordLevel(contract, "低い|ひくい"), 4);
    assert.equal(getJlptWordLevel(contract, "疲れる|つかれる"), 4);
    assert.equal(getJlptWordLevel(contract, "区別|くべつ"), 4);
    assert.equal(getJlptWordLevel(contract, "産地|さんち"), 4);
    assert.equal(getJlptWordLevel(contract, "労働|ろうどう"), 4);
    assert.equal(getJlptWordLevel(contract, "首都|しゅと"), 4);
    assert.equal(getJlptWordLevel(contract, "遠足|えんそく"), 4);
    assert.equal(getJlptWordLevel(contract, "暗記|あんき"), 4);
    assert.equal(getJlptWordLevel(contract, "好物|こうぶつ"), 4);
    assert.equal(getJlptWordLevel(contract, "次回|じかい"), 4);
    assert.equal(getJlptWordLevel(contract, "乗車|じょうしゃ"), 4);
    assert.equal(getJlptWordLevel(contract, "森林|しんりん"), 4);
    assert.equal(getJlptWordLevel(contract, "進歩|しんぽ"), 4);
    assert.equal(getJlptWordLevel(contract, "音声|おんせい"), 4);
    assert.equal(getJlptWordLevel(contract, "強弱|きょうじゃく"), 4);
    assert.equal(getJlptWordLevel(contract, "短所|たんしょ"), 4);
    assert.equal(getJlptWordLevel(contract, "観光|かんこう"), 4);
    assert.equal(getJlptWordLevel(contract, "軽食|けいしょく"), 4);
    assert.equal(getJlptWordLevel(contract, "電池|でんち"), 4);
    assert.equal(getJlptWordLevel(contract, "洗顔|せんがん"), 4);
    assert.equal(getJlptWordLevel(contract, "太陽|たいよう"), 4);
    assert.equal(getJlptWordLevel(contract, "市場|いちば"), 4);
    assert.equal(getJlptWordLevel(contract, "低音|ていおん"), 4);
    assert.equal(getJlptWordLevel(contract, "薬品|やくひん"), 4);
    assert.equal(getJlptWordLevel(contract, "頭痛|ずつう"), 4);
    assert.equal(getJlptWordLevel(contract, "先頭|せんとう"), 4);
    assert.equal(getJlptWordLevel(contract, "疲労|ひろう"), 4);
    assert.equal(getJlptWordLevel(contract, "青菜|あおな"), 4);
    assert.equal(getJlptWordLevel(contract, "合宿|がっしゅく"), 4);
    assert.equal(getJlptWordLevel(contract, "回り道|まわりみち"), 4);
    assert.equal(getJlptWordLevel(contract, "寒波|かんぱ"), 4);
    assert.equal(getJlptWordLevel(contract, "村民|そんみん"), 4);
    assert.equal(getJlptWordLevel(contract, "次第|しだい"), 4);
    assert.equal(getJlptWordLevel(contract, "声色|こわいろ"), 4);
    assert.equal(getJlptWordLevel(contract, "市場|しじょう"), null);
    assert.equal(contract.excludedWordLevels["山の上|やまのうえ"].exclusionReason, "phrase");
    assert.equal(contract.excludedWordLevels["雨の日|あめのひ"].exclusionReason, "phrase");
    assert.equal(contract.excludedWordLevels["駅の前|えきのまえ"].exclusionReason, "phrase");
    assert.equal(contract.excludedWordLevels["駅の中|えきのなか"].exclusionReason, "phrase");
    assert.equal(contract.excludedWordLevels["家の中|いえのなか"].exclusionReason, "phrase");
    assert.equal(contract.excludedWordLevels["海の水|うみのみず"].exclusionReason, "phrase");
    assert.equal(contract.excludedWordLevels["公園の中|こうえんのなか"].exclusionReason, "phrase");
    assert.equal(getJlptWordLevel(contract, "母校|ぼこう"), 1);
    assert.equal(getJlptWordLevel(contract, "上座|かみざ"), null);
    assert.equal(getJlptWordLevel(contract, "気配|けはい"), null);
    assert.equal(getJlptWordLevel(contract, "天気雨|てんきあめ"), null);
    assert.equal(getJlptWordLevel(contract, "行う|おこなう"), 4);
    assert.equal(getJlptWordLevel(contract, "生きる|いきる"), 4);
    assert.equal(getJlptWordLevel(contract, "下げる|さげる"), 4);
    assert.equal(getJlptWordLevel(contract, "土|つち"), 5);
    assert.equal(getJlptWordLevel(contract, "月|つき"), 5);
    assert.equal(getJlptWordLevel(contract, "一生|いっしょう"), 3);
    assert.equal(getJlptWordLevel(contract, "友人|ゆうじん"), 3);
    assert.equal(getJlptWordLevel(contract, "読書|どくしょ"), 3);
    assert.equal(getJlptWordLevel(contract, "下る|くだる"), 2);
    assert.equal(getJlptWordLevel(contract, "下ろす|おろす"), 3);
    assert.equal(getJlptWordLevel(contract, "学ぶ|まなぶ"), 3);
    assert.equal(getJlptWordLevel(contract, "愛|あい"), 3);
    assert.equal(getJlptWordLevel(contract, "愛情|あいじょう"), 3);
    assert.equal(getJlptWordLevel(contract, "愛する|あいする"), 3);
    assert.equal(getJlptWordLevel(contract, "相手|あいて"), 3);
    assert.equal(getJlptWordLevel(contract, "預ける|あずける"), 3);
    assert.equal(getJlptWordLevel(contract, "与える|あたえる"), 3);
    assert.equal(getJlptWordLevel(contract, "辺り|あたり"), 3);
    assert.equal(getJlptWordLevel(contract, "当たる|あたる"), 3);
    assert.equal(getJlptWordLevel(contract, "当てる|あてる"), 3);
    assert.equal(getJlptWordLevel(contract, "油|あぶら"), 3);
    assert.equal(getJlptWordLevel(contract, "余り|あまり"), 3);
    assert.equal(getJlptWordLevel(contract, "誤り|あやまり"), 3);
    assert.equal(getJlptWordLevel(contract, "表す|あらわす"), 3);
    assert.equal(getJlptWordLevel(contract, "現す|あらわす"), 3);
    assert.equal(getJlptWordLevel(contract, "現れ|あらわれ"), 3);
    assert.equal(getJlptWordLevel(contract, "現れる|あらわれる"), 3);
    assert.equal(getJlptWordLevel(contract, "息|いき"), 3);
    assert.equal(getJlptWordLevel(contract, "幾つ|いくつ"), 3);
    assert.equal(getJlptWordLevel(contract, "幾ら|いくら"), 3);
    assert.equal(getJlptWordLevel(contract, "医師|いし"), 3);
    assert.equal(getJlptWordLevel(contract, "意識|いしき"), 3);
    assert.equal(getJlptWordLevel(contract, "異常|いじょう"), 3);
    assert.equal(getJlptWordLevel(contract, "泉|いずみ"), 3);
    assert.equal(getJlptWordLevel(contract, "抱く|いだく"), 3);
    assert.equal(getJlptWordLevel(contract, "頂く|いただく"), 3);
    assert.equal(getJlptWordLevel(contract, "痛み|いたみ"), 3);
    assert.equal(getJlptWordLevel(contract, "位置|いち"), 3);
    assert.equal(getJlptWordLevel(contract, "一種|いっしゅ"), 3);
    assert.equal(getJlptWordLevel(contract, "移動|いどう"), 3);
    assert.equal(getJlptWordLevel(contract, "居眠り|いねむり"), 3);
    assert.equal(getJlptWordLevel(contract, "命|いのち"), 3);
    assert.equal(getJlptWordLevel(contract, "違反|いはん"), 3);
    assert.equal(getJlptWordLevel(contract, "依頼|いらい"), 3);
    assert.equal(getJlptWordLevel(contract, "岩|いわ"), 3);
    assert.equal(getJlptWordLevel(contract, "引退|いんたい"), 3);
    assert.equal(getJlptWordLevel(contract, "受け取る|うけとる"), 3);
    assert.equal(getJlptWordLevel(contract, "失う|うしなう"), 3);
    assert.equal(getJlptWordLevel(contract, "疑う|うたがう"), 3);
    assert.equal(getJlptWordLevel(contract, "移す|うつす"), 3);
    assert.equal(getJlptWordLevel(contract, "馬|うま"), 3);
    assert.equal(getJlptWordLevel(contract, "裏切る|うらぎる"), 3);
    assert.equal(getJlptWordLevel(contract, "笑顔|えがお"), 3);
    assert.equal(getJlptWordLevel(contract, "演技|えんぎ"), 3);
    assert.equal(getJlptWordLevel(contract, "援助|えんじょ"), 3);
    assert.equal(getJlptWordLevel(contract, "演説|えんぜつ"), 3);
    assert.equal(getJlptWordLevel(contract, "演奏|えんそう"), 3);
    assert.equal(getJlptWordLevel(contract, "追い付く|おいつく"), 3);
    assert.equal(getJlptWordLevel(contract, "追う|おう"), 3);
    assert.equal(getJlptWordLevel(contract, "横断|おうだん"), 3);
    assert.equal(getJlptWordLevel(contract, "奥|おく"), 3);
    assert.equal(getJlptWordLevel(contract, "収める|おさめる"), 3);
    assert.equal(getJlptWordLevel(contract, "汚染|おせん"), 3);
    assert.equal(getJlptWordLevel(contract, "恐れる|おそれる"), 3);
    assert.equal(getJlptWordLevel(contract, "恐ろしい|おそろしい"), 3);
    assert.equal(getJlptWordLevel(contract, "お腹|おなか"), 3);
    assert.equal(getJlptWordLevel(contract, "降ろす|おろす"), 3);
    assert.equal(getJlptWordLevel(contract, "温度|おんど"), 3);
    assert.equal(getJlptWordLevel(contract, "絵画|かいが"), 3);
    assert.equal(getJlptWordLevel(contract, "解決|かいけつ"), 3);
    assert.equal(getJlptWordLevel(contract, "回復|かいふく"), 3);
    assert.equal(getJlptWordLevel(contract, "換える|かえる"), 3);
    assert.equal(getJlptWordLevel(contract, "香り|かおり"), 3);
    assert.equal(getJlptWordLevel(contract, "抱える|かかえる"), 3);
    assert.equal(getJlptWordLevel(contract, "価格|かかく"), 3);
    assert.equal(getJlptWordLevel(contract, "係|かかり"), 3);
    assert.equal(getJlptWordLevel(contract, "確実|かくじつ"), 3);
    assert.equal(getJlptWordLevel(contract, "確認|かくにん"), 3);
    assert.equal(getJlptWordLevel(contract, "欠ける|かける"), 3);
    assert.equal(getJlptWordLevel(contract, "菓子|かし"), 3);
    assert.equal(getJlptWordLevel(contract, "数える|かぞえる"), 3);
    assert.equal(getJlptWordLevel(contract, "課|か"), 3);
    assert.equal(getJlptWordLevel(contract, "害|がい"), 3);
    assert.equal(getJlptWordLevel(contract, "外交|がいこう"), 3);
    assert.equal(getJlptWordLevel(contract, "解釈|かいしゃく"), 3);
    assert.equal(getJlptWordLevel(contract, "快適|かいてき"), 3);
    assert.equal(getJlptWordLevel(contract, "掛かる|かかる"), 3);
    assert.equal(getJlptWordLevel(contract, "覚悟|かくご"), 3);
    assert.equal(getJlptWordLevel(contract, "加減|かげん"), 3);
    assert.equal(getJlptWordLevel(contract, "数|かず"), 3);
    assert.equal(getJlptWordLevel(contract, "型|かた"), 3);
    assert.equal(getJlptWordLevel(contract, "勝ち|かち"), 3);
    assert.equal(getJlptWordLevel(contract, "価値|かち"), 3);
    assert.equal(getJlptWordLevel(contract, "活気|かっき"), 3);
    assert.equal(getJlptWordLevel(contract, "格好|かっこう"), 3);
    assert.equal(getJlptWordLevel(contract, "活動|かつどう"), 3);
    assert.equal(getJlptWordLevel(contract, "活用|かつよう"), 3);
    assert.equal(getJlptWordLevel(contract, "悲しむ|かなしむ"), 3);
    assert.equal(getJlptWordLevel(contract, "必ずしも|かならずしも"), 3);
    assert.equal(getJlptWordLevel(contract, "構う|かまう"), 3);
    assert.equal(getJlptWordLevel(contract, "神|かみ"), 3);
    assert.equal(getJlptWordLevel(contract, "感覚|かんかく"), 3);
    assert.equal(getJlptWordLevel(contract, "観客|かんきゃく"), 3);
    assert.equal(getJlptWordLevel(contract, "歓迎|かんげい"), 3);
    assert.equal(getJlptWordLevel(contract, "観察|かんさつ"), 3);
    assert.equal(getJlptWordLevel(contract, "感じ|かんじ"), 3);
    assert.equal(getJlptWordLevel(contract, "感謝|かんしゃ"), 3);
    assert.equal(getJlptWordLevel(contract, "感情|かんじょう"), 3);
    assert.equal(getJlptWordLevel(contract, "感じる|かんじる"), 3);
    assert.equal(getJlptWordLevel(contract, "関心|かんしん"), 3);
    assert.equal(getJlptWordLevel(contract, "関連|かんれん"), 3);
    assert.equal(getJlptWordLevel(contract, "永久|えいきゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "老い|おい"), 3);
    assert.equal(getJlptWordLevel(contract, "王|おう"), 3);
    assert.equal(getJlptWordLevel(contract, "王様|おうさま"), 3);
    assert.equal(getJlptWordLevel(contract, "王子|おうじ"), 3);
    assert.equal(getJlptWordLevel(contract, "帯|おび"), 3);
    assert.equal(getJlptWordLevel(contract, "温暖|おんだん"), 3);
    assert.equal(getJlptWordLevel(contract, "感心|かんしん"), 3);
    assert.equal(getJlptWordLevel(contract, "関する|かんする"), 3);
    assert.equal(getJlptWordLevel(contract, "完成|かんせい"), 3);
    assert.equal(getJlptWordLevel(contract, "感動|かんどう"), 3);
    assert.equal(getJlptWordLevel(contract, "議員|ぎいん"), 3);
    assert.equal(getJlptWordLevel(contract, "記憶|きおく"), 3);
    assert.equal(getJlptWordLevel(contract, "気温|きおん"), 3);
    assert.equal(getJlptWordLevel(contract, "機械|きかい"), 3);
    assert.equal(getJlptWordLevel(contract, "議会|ぎかい"), 3);
    assert.equal(getJlptWordLevel(contract, "機関|きかん"), 3);
    assert.equal(getJlptWordLevel(contract, "機嫌|きげん"), 3);
    assert.equal(getJlptWordLevel(contract, "気候|きこう"), 3);
    assert.equal(getJlptWordLevel(contract, "記事|きじ"), 3);
    assert.equal(getJlptWordLevel(contract, "技師|ぎし"), 3);
    assert.equal(getJlptWordLevel(contract, "記者|きしゃ"), 3);
    assert.equal(getJlptWordLevel(contract, "議長|ぎちょう"), 3);
    assert.equal(getJlptWordLevel(contract, "気付く|きづく"), 3);
    assert.equal(getJlptWordLevel(contract, "記入|きにゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "記念|きねん"), 3);
    assert.equal(getJlptWordLevel(contract, "機能|きのう"), 3);
    assert.equal(getJlptWordLevel(contract, "寄付|きふ"), 3);
    assert.equal(getJlptWordLevel(contract, "希望|きぼう"), 3);
    assert.equal(getJlptWordLevel(contract, "義務|ぎむ"), 3);
    assert.equal(getJlptWordLevel(contract, "疑問|ぎもん"), 3);
    assert.equal(getJlptWordLevel(contract, "吸収|きゅうしゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "救助|きゅうじょ"), 3);
    assert.equal(getJlptWordLevel(contract, "急速|きゅうそく"), 3);
    assert.equal(getJlptWordLevel(contract, "給料|きゅうりょう"), 3);
    assert.equal(getJlptWordLevel(contract, "供給|きょうきゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "教師|きょうし"), 3);
    assert.equal(getJlptWordLevel(contract, "強調|きょうちょう"), 3);
    assert.equal(getJlptWordLevel(contract, "恐怖|きょうふ"), 3);
    assert.equal(getJlptWordLevel(contract, "協力|きょうりょく"), 3);
    assert.equal(getJlptWordLevel(contract, "記録|きろく"), 3);
    assert.equal(getJlptWordLevel(contract, "議論|ぎろん"), 3);
    assert.equal(getJlptWordLevel(contract, "金額|きんがく"), 3);
    assert.equal(getJlptWordLevel(contract, "偶然|ぐうぜん"), 3);
    assert.equal(getJlptWordLevel(contract, "苦痛|くつう"), 3);
    assert.equal(getJlptWordLevel(contract, "組|くみ"), 3);
    assert.equal(getJlptWordLevel(contract, "組合|くみあい"), 3);
    assert.equal(getJlptWordLevel(contract, "組む|くむ"), 3);
    assert.equal(getJlptWordLevel(contract, "暮らし|くらし"), 3);
    assert.equal(getJlptWordLevel(contract, "暮らす|くらす"), 3);
    assert.equal(getJlptWordLevel(contract, "位|くらい"), null);
    assert.equal(getJlptWordLevel(contract, "繰り返す|くりかえす"), 3);
    assert.equal(getJlptWordLevel(contract, "苦しい|くるしい"), 3);
    assert.equal(getJlptWordLevel(contract, "苦しむ|くるしむ"), 3);
    assert.equal(getJlptWordLevel(contract, "暮れ|くれ"), 3);
    assert.equal(getJlptWordLevel(contract, "苦労|くろう"), 3);
    assert.equal(getJlptWordLevel(contract, "加える|くわえる"), 3);
    assert.equal(getJlptWordLevel(contract, "加わる|くわわる"), 3);
    assert.equal(getJlptWordLevel(contract, "経営|けいえい"), 3);
    assert.equal(getJlptWordLevel(contract, "景気|けいき"), 3);
    assert.equal(getJlptWordLevel(contract, "経験|けいけん"), 3);
    assert.equal(getJlptWordLevel(contract, "足跡|あしあと"), 2);
    assert.equal(getJlptWordLevel(contract, "厚かましい|あつかましい"), 2);
    assert.equal(getJlptWordLevel(contract, "圧縮|あっしゅく"), 2);
    assert.equal(getJlptWordLevel(contract, "暴れる|あばれる"), 2);
    assert.equal(getJlptWordLevel(contract, "脂|あぶら"), 2);
    assert.equal(getJlptWordLevel(contract, "甘やかす|あまやかす"), 2);
    assert.equal(getJlptWordLevel(contract, "編物|あみもの"), 2);
    assert.equal(getJlptWordLevel(contract, "編む|あむ"), 2);
    assert.equal(getJlptWordLevel(contract, "荒い|あらい"), 2);
    assert.equal(getJlptWordLevel(contract, "改めて|あらためて"), 2);
    assert.equal(getJlptWordLevel(contract, "間柄|あいだがら"), 1);
    assert.equal(getJlptWordLevel(contract, "敢えて|あえて"), 1);
    assert.equal(getJlptWordLevel(contract, "仰ぐ|あおぐ"), 1);
    assert.equal(getJlptWordLevel(contract, "証|あかし"), 1);
    assert.equal(getJlptWordLevel(contract, "憧れ|あこがれ"), 1);
    assert.equal(getJlptWordLevel(contract, "麻|あさ"), 1);
    assert.equal(getJlptWordLevel(contract, "欺く|あざむく"), 1);
    assert.equal(getJlptWordLevel(contract, "鮮やか|あざやか"), 1);
    assert.equal(getJlptWordLevel(contract, "焦る|あせる"), 1);
    assert.equal(getJlptWordLevel(contract, "圧迫|あっぱく"), 1);
    assert.equal(getJlptWordLevel(contract, "急ぐ|いそぐ"), 4);
    assert.equal(getJlptWordLevel(contract, "海岸|かいがん"), 4);
    assert.equal(getJlptWordLevel(contract, "世界|せかい"), 4);
    assert.equal(getJlptWordLevel(contract, "花見|はなみ"), 4);
    assert.equal(getJlptWordLevel(contract, "開く|ひらく"), 4);
    assert.equal(getJlptWordLevel(contract, "兄|あに"), 4);
    assert.equal(getJlptWordLevel(contract, "口|くち"), 4);
    assert.equal(getJlptWordLevel(contract, "夜|よる"), 4);
    assert.equal(getJlptWordLevel(contract, "妹|いもうと"), 4);
    assert.equal(getJlptWordLevel(contract, "姉|あね"), 4);
    assert.equal(getJlptWordLevel(contract, "家|いえ"), 4);
    assert.equal(getJlptWordLevel(contract, "店|みせ"), 4);
    assert.equal(getJlptWordLevel(contract, "弟|おとうと"), 4);
    assert.equal(getJlptWordLevel(contract, "手|て"), 4);
    assert.equal(getJlptWordLevel(contract, "朝|あさ"), 4);
    assert.equal(getJlptWordLevel(contract, "海|うみ"), 4);
    assert.equal(getJlptWordLevel(contract, "犬|いぬ"), 4);
    assert.equal(getJlptWordLevel(contract, "猫|ねこ"), 3);
    assert.equal(getJlptWordLevel(contract, "目|め"), 4);
    assert.equal(getJlptWordLevel(contract, "空|そら"), 4);
    assert.equal(getJlptWordLevel(contract, "肉|にく"), 4);
    assert.equal(getJlptWordLevel(contract, "花|はな"), 4);
    assert.equal(getJlptWordLevel(contract, "駅|えき"), 4);
    assert.equal(getJlptWordLevel(contract, "魚|さかな"), 4);
    assert.equal(getJlptWordLevel(contract, "文|ぶん"), 4);
    assert.equal(getJlptWordLevel(contract, "別|べつ"), 4);
    assert.equal(getJlptWordLevel(contract, "別れる|わかれる"), 4);
    assert.equal(getJlptWordLevel(contract, "問|もん"), 4);
    assert.equal(getJlptWordLevel(contract, "有る|ある"), 4);
    assert.equal(getJlptWordLevel(contract, "郵便|ゆうびん"), 4);
    assert.equal(getJlptWordLevel(contract, "曜日|ようび"), 4);
    assert.equal(getJlptWordLevel(contract, "洋服|ようふく"), 4);
    assert.equal(getJlptWordLevel(contract, "理由|りゆう"), 4);
    assert.equal(getJlptWordLevel(contract, "旅行|りょこう"), 4);
    assert.equal(getJlptWordLevel(contract, "料金|りょうきん"), 4);
    assert.equal(getJlptWordLevel(contract, "立つ|たつ"), 4);
    assert.equal(getJlptWordLevel(contract, "味|あじ"), 4);
    assert.equal(getJlptWordLevel(contract, "明るい|あかるい"), 4);
    assert.equal(getJlptWordLevel(contract, "野原|のはら"), 4);
    assert.equal(getJlptWordLevel(contract, "不便|ふべん"), 4);
    assert.equal(getJlptWordLevel(contract, "歌|うた"), 4);
    assert.equal(getJlptWordLevel(contract, "売る|うる"), 4);
    assert.equal(getJlptWordLevel(contract, "晩|ばん"), 4);
    assert.equal(getJlptWordLevel(contract, "品|しな"), 4);
    assert.equal(getJlptWordLevel(contract, "部|ぶ"), 4);
    assert.equal(getJlptWordLevel(contract, "風|かぜ"), 4);
    assert.equal(getJlptWordLevel(contract, "台風|たいふう"), 4);
    assert.equal(getJlptWordLevel(contract, "物|もの"), 4);
    assert.equal(getJlptWordLevel(contract, "閉まる|しまる"), 2);
    assert.equal(getJlptWordLevel(contract, "野菜|やさい"), 4);
    assert.equal(getJlptWordLevel(contract, "用|よう"), 4);
    assert.equal(getJlptWordLevel(contract, "力|ちから"), 4);
    assert.equal(getJlptWordLevel(contract, "入力|にゅうりょく"), 4);
    assert.equal(getJlptWordLevel(contract, "意味|いみ"), 4);
    assert.equal(getJlptWordLevel(contract, "今夜|こんや"), 4);
    assert.equal(getJlptWordLevel(contract, "道|みち"), 4);
    assert.equal(getJlptWordLevel(contract, "道具|どうぐ"), 4);
    assert.equal(getJlptWordLevel(contract, "特に|とくに"), 4);
    assert.equal(getJlptWordLevel(contract, "町|まち"), 4);
    assert.equal(getJlptWordLevel(contract, "通う|かよう"), 4);
    assert.equal(getJlptWordLevel(contract, "通る|とおる"), 4);
    assert.equal(getJlptWordLevel(contract, "兄弟|きょうだい"), 4);
    assert.equal(getJlptWordLevel(contract, "書店|しょてん"), 4);
    assert.equal(getJlptWordLevel(contract, "転ぶ|ころぶ"), 4);
    assert.equal(getJlptWordLevel(contract, "田|た"), 4);
    assert.equal(getJlptWordLevel(contract, "今度|こんど"), 4);
    assert.equal(getJlptWordLevel(contract, "冬|ふゆ"), 4);
    assert.equal(getJlptWordLevel(contract, "答える|こたえる"), 4);
    assert.equal(getJlptWordLevel(contract, "答え|こたえ"), 4);
    assert.equal(getJlptWordLevel(contract, "動く|うごく"), 4);
    assert.equal(getJlptWordLevel(contract, "動物|どうぶつ"), 4);
    assert.equal(getJlptWordLevel(contract, "同じ|おなじ"), 4);
    assert.equal(getJlptWordLevel(contract, "同時|どうじ"), 4);
    assert.equal(getJlptWordLevel(contract, "忙しい|いそがしい"), 3);
    assert.equal(getJlptWordLevel(contract, "夕食|ゆうしょく"), 4);
    assert.equal(getJlptWordLevel(contract, "以内|いない"), 4);
    assert.equal(getJlptWordLevel(contract, "入院|にゅういん"), 4);
    assert.equal(getJlptWordLevel(contract, "運動|うんどう"), 4);
    assert.equal(getJlptWordLevel(contract, "運ぶ|はこぶ"), 4);
    assert.equal(getJlptWordLevel(contract, "映る|うつる"), 4);
    assert.equal(getJlptWordLevel(contract, "英文|えいぶん"), 4);
    assert.equal(getJlptWordLevel(contract, "家族|かぞく"), 4);
    assert.equal(getJlptWordLevel(contract, "歌う|うたう"), 4);
    assert.equal(getJlptWordLevel(contract, "計画|けいかく"), 4);
    assert.equal(getJlptWordLevel(contract, "図書館|としょかん"), 4);
    assert.equal(getJlptWordLevel(contract, "起こす|おこす"), 4);
    assert.equal(getJlptWordLevel(contract, "急に|きゅうに"), 4);
    assert.equal(getJlptWordLevel(contract, "研究|けんきゅう"), 4);
    assert.equal(getJlptWordLevel(contract, "牛肉|ぎゅうにく"), 4);
    assert.equal(getJlptWordLevel(contract, "去る|さる"), 4);
    assert.equal(getJlptWordLevel(contract, "建てる|たてる"), 4);
    assert.equal(getJlptWordLevel(contract, "公立|こうりつ"), 4);
    assert.equal(getJlptWordLevel(contract, "工場|こうじょう"), 4);
    assert.equal(getJlptWordLevel(contract, "銀色|ぎんいろ"), 4);
    assert.equal(getJlptWordLevel(contract, "座席|ざせき"), 3);
    assert.equal(getJlptWordLevel(contract, "作文|さくぶん"), 4);
    assert.equal(getJlptWordLevel(contract, "姉妹|しまい"), 4);
    assert.equal(getJlptWordLevel(contract, "質問|しつもん"), 4);
    assert.equal(getJlptWordLevel(contract, "写真|しゃしん"), 4);
    assert.equal(getJlptWordLevel(contract, "主人|しゅじん"), 4);
    assert.equal(getJlptWordLevel(contract, "秋|あき"), 4);
    assert.equal(getJlptWordLevel(contract, "待つ|まつ"), 4);
    assert.equal(getJlptWordLevel(contract, "待ち合わせ|まちあわせ"), 4);
    assert.equal(getJlptWordLevel(contract, "貸す|かす"), 4);
    assert.equal(getJlptWordLevel(contract, "貸し出し|かしだし"), 4);
    assert.equal(getJlptWordLevel(contract, "台|だい"), 4);
    assert.equal(getJlptWordLevel(contract, "題|だい"), 4);
    assert.equal(getJlptWordLevel(contract, "知る|しる"), 4);
    assert.equal(getJlptWordLevel(contract, "地図|ちず"), 4);
    assert.equal(getJlptWordLevel(contract, "地下鉄|ちかてつ"), 4);
    assert.equal(getJlptWordLevel(contract, "着る|きる"), 4);
    assert.equal(getJlptWordLevel(contract, "着く|つく"), 4);
    assert.equal(getJlptWordLevel(contract, "昼|ひる"), 4);
    assert.equal(getJlptWordLevel(contract, "注意|ちゅうい"), 4);
    assert.equal(getJlptWordLevel(contract, "注文|ちゅうもん"), 4);
    assert.equal(getJlptWordLevel(contract, "茶色|ちゃいろ"), 4);
    assert.equal(getJlptWordLevel(contract, "町長|ちょうちょう"), 4);
    assert.equal(getJlptWordLevel(contract, "鳥|とり"), 4);
    assert.equal(getJlptWordLevel(contract, "食堂|しょくどう"), 4);
    assert.equal(getJlptWordLevel(contract, "病気|びょうき"), 4);
    assert.equal(getJlptWordLevel(contract, "使い方|つかいかた"), 4);
    assert.equal(getJlptWordLevel(contract, "親切|しんせつ"), 4);
    assert.equal(getJlptWordLevel(contract, "世の中|よのなか"), 4);
    assert.equal(getJlptWordLevel(contract, "正午|しょうご"), 4);
    assert.equal(getJlptWordLevel(contract, "切る|きる"), 4);
    assert.equal(getJlptWordLevel(contract, "大切|たいせつ"), 4);
    assert.equal(getJlptWordLevel(contract, "多分|たぶん"), 4);
    assert.equal(getJlptWordLevel(contract, "体|からだ"), 4);
    assert.equal(getJlptWordLevel(contract, "体調|たいちょう"), 4);
    assert.equal(getJlptWordLevel(contract, "時代|じだい"), 4);
    assert.equal(getJlptWordLevel(contract, "知らせる|しらせる"), 4);
    assert.equal(getJlptWordLevel(contract, "競走|きょうそう"), 4);
    assert.equal(getJlptWordLevel(contract, "送る|おくる"), 4);
    assert.equal(getJlptWordLevel(contract, "正しい|ただしい"), 4);
    assert.equal(getJlptWordLevel(contract, "試す|ためす"), 4);
    assert.equal(getJlptWordLevel(contract, "試験|しけん"), 4);
    assert.equal(getJlptWordLevel(contract, "練習|れんしゅう"), 4);
    assert.equal(getJlptWordLevel(contract, "習う|ならう"), 4);
    assert.equal(getJlptWordLevel(contract, "近所|きんじょ"), 4);
    assert.equal(getJlptWordLevel(contract, "郵便局|ゆうびんきょく"), 4);
    assert.equal(getJlptWordLevel(contract, "自由|じゆう"), 4);
    assert.equal(getJlptWordLevel(contract, "集める|あつめる"), 4);
    assert.equal(getJlptWordLevel(contract, "不足|ふそく"), 4);
    assert.equal(getJlptWordLevel(contract, "主に|おもに"), 4);
    assert.equal(getJlptWordLevel(contract, "京都|きょうと"), 4);
    assert.equal(getJlptWordLevel(contract, "会員|かいいん"), 4);
    assert.equal(getJlptWordLevel(contract, "会議室|かいぎしつ"), 4);
    assert.equal(getJlptWordLevel(contract, "住所|じゅうしょ"), 4);
    assert.equal(getJlptWordLevel(contract, "作る|つくる"), 4);
    assert.equal(getJlptWordLevel(contract, "借りる|かりる"), 4);
    assert.equal(getJlptWordLevel(contract, "場所|ばしょ"), 4);
    assert.equal(getJlptWordLevel(contract, "夏休み|なつやすみ"), 4);
    assert.equal(getJlptWordLevel(contract, "始まる|はじまる"), 4);
    assert.equal(getJlptWordLevel(contract, "始める|はじめる"), 4);
    assert.equal(getJlptWordLevel(contract, "少ない|すくない"), 4);
    assert.equal(getJlptWordLevel(contract, "教える|おしえる"), 4);
    assert.equal(getJlptWordLevel(contract, "教室|きょうしつ"), 4);
    assert.equal(getJlptWordLevel(contract, "真ん中|まんなか"), 4);
    assert.equal(getJlptWordLevel(contract, "言葉|ことば"), 4);
    assert.equal(getJlptWordLevel(contract, "週末|しゅうまつ"), 4);
    assert.equal(getJlptWordLevel(contract, "音楽|おんがく"), 4);
    assert.equal(getJlptWordLevel(contract, "黒板|こくばん"), 4);
    assert.equal(getJlptWordLevel(contract, "悪い|わるい"), 4);
    assert.equal(getJlptWordLevel(contract, "医者|いしゃ"), 4);
    assert.equal(getJlptWordLevel(contract, "音|おと"), 4);
    assert.equal(getJlptWordLevel(contract, "漢字|かんじ"), 4);
    assert.equal(getJlptWordLevel(contract, "金魚|きんぎょ"), 4);
    assert.equal(getJlptWordLevel(contract, "強い|つよい"), 4);
    assert.equal(getJlptWordLevel(contract, "授業|じゅぎょう"), 4);
    assert.equal(getJlptWordLevel(contract, "空港|くうこう"), 4);
    assert.equal(getJlptWordLevel(contract, "言う|いう"), 4);
    assert.equal(getJlptWordLevel(contract, "中古|ちゅうこ"), 4);
    assert.equal(getJlptWordLevel(contract, "広い|ひろい"), 4);
    assert.equal(getJlptWordLevel(contract, "考える|かんがえる"), 4);
    assert.equal(getJlptWordLevel(contract, "黒い|くろい"), 4);
    assert.equal(getJlptWordLevel(contract, "思う|おもう"), 4);
    assert.equal(getJlptWordLevel(contract, "止まる|とまる"), 4);
    assert.equal(getJlptWordLevel(contract, "止める|とめる"), 4);
    assert.equal(getJlptWordLevel(contract, "死ぬ|しぬ"), 4);
    assert.equal(getJlptWordLevel(contract, "私|わたし"), 4);
    assert.equal(getJlptWordLevel(contract, "紙|かみ"), 4);
    assert.equal(getJlptWordLevel(contract, "持つ|もつ"), 4);
    assert.equal(getJlptWordLevel(contract, "空|から"), 4);
    assert.equal(getJlptWordLevel(contract, "元|もと"), 4);
    assert.equal(getJlptWordLevel(contract, "事|こと"), 4);
    assert.equal(getJlptWordLevel(contract, "気持ち|きもち"), 4);
    assert.equal(getJlptWordLevel(contract, "写す|うつす"), 4);
    assert.equal(getJlptWordLevel(contract, "終わる|おわる"), 4);
    assert.equal(getJlptWordLevel(contract, "最終|さいしゅう"), 4);
    assert.equal(getJlptWordLevel(contract, "集まる|あつまる"), 4);
    assert.equal(getJlptWordLevel(contract, "重い|おもい"), 4);
    assert.equal(getJlptWordLevel(contract, "重要|じゅうよう"), 4);
    assert.equal(getJlptWordLevel(contract, "春|はる"), 4);
    assert.equal(getJlptWordLevel(contract, "所|ところ"), 4);
    assert.equal(getJlptWordLevel(contract, "少し|すこし"), 4);
    assert.equal(getJlptWordLevel(contract, "景色|けしき"), 4);
    assert.equal(getJlptWordLevel(contract, "親|おや"), 4);
    assert.equal(getJlptWordLevel(contract, "早い|はやい"), 4);
    assert.equal(getJlptWordLevel(contract, "走る|はしる"), 4);
    assert.equal(getJlptWordLevel(contract, "足|あし"), 4);
    assert.equal(getJlptWordLevel(contract, "多い|おおい"), 4);
    assert.equal(getJlptWordLevel(contract, "仕える|つかえる"), 4);
    assert.equal(getJlptWordLevel(contract, "屋|や"), 4);
    assert.equal(getJlptWordLevel(contract, "社会|しゃかい"), 4);
    assert.equal(getJlptWordLevel(contract, "青空|あおぞら"), 4);
    assert.equal(getJlptWordLevel(contract, "赤ちゃん|あかちゃん"), 4);
    assert.equal(getJlptWordLevel(contract, "家|うち"), 4);
    assert.equal(getJlptWordLevel(contract, "花火|はなび"), 4);
    assert.equal(getJlptWordLevel(contract, "終点|しゅうてん"), 4);
    assert.equal(getJlptWordLevel(contract, "事情|じじょう"), 4);
    assert.equal(getJlptWordLevel(contract, "集中|しゅうちゅう"), 4);
    assert.equal(getJlptWordLevel(contract, "会場|かいじょう"), 4);
    assert.equal(getJlptWordLevel(contract, "色|いろ"), 4);
    assert.equal(getJlptWordLevel(contract, "人気|にんき"), 4);
    assert.equal(getJlptWordLevel(contract, "悪口|わるくち"), 4);
    assert.equal(getJlptWordLevel(contract, "開始|かいし"), 4);
    assert.equal(getJlptWordLevel(contract, "楽しむ|たのしむ"), 4);
    assert.equal(getJlptWordLevel(contract, "起こる|おこる"), 4);
    assert.equal(getJlptWordLevel(contract, "歌手|かしゅ"), 4);
    assert.equal(getJlptWordLevel(contract, "帰国|きこく"), 4);
    assert.equal(getJlptWordLevel(contract, "仕事中|しごとちゅう"), 4);
    assert.equal(getJlptWordLevel(contract, "住民|じゅうみん"), 4);
    assert.equal(getJlptWordLevel(contract, "手伝う|てつだう"), 4);
    assert.equal(getJlptWordLevel(contract, "買い物|かいもの"), 4);
    assert.equal(getJlptWordLevel(contract, "有名人|ゆうめいじん"), 4);
    assert.equal(getJlptWordLevel(contract, "青信号|あおしんごう"), 4);
    assert.equal(getJlptWordLevel(contract, "赤信号|あかしんごう"), 4);
    assert.equal(getJlptWordLevel(contract, "古本|ふるほん"), 4);
    assert.equal(getJlptWordLevel(contract, "歩道|ほどう"), 4);
    assert.equal(getJlptWordLevel(contract, "閉会|へいかい"), 4);
    assert.equal(getJlptWordLevel(contract, "悪人|あくにん"), 4);
    assert.equal(getJlptWordLevel(contract, "開会|かいかい"), 4);
    assert.equal(getJlptWordLevel(contract, "楽器|がっき"), 4);
    assert.equal(getJlptWordLevel(contract, "画家|がか"), 4);
    assert.equal(getJlptWordLevel(contract, "映す|うつす"), 4);
    assert.equal(getJlptWordLevel(contract, "家庭|かてい"), 4);
    assert.equal(getJlptWordLevel(contract, "家賃|やちん"), 4);
    assert.equal(getJlptWordLevel(contract, "館内|かんない"), 4);
    assert.equal(getJlptWordLevel(contract, "帰宅|きたく"), 4);
    assert.equal(getJlptWordLevel(contract, "急行|きゅうこう"), 4);
    assert.equal(getJlptWordLevel(contract, "魚屋|さかなや"), 4);
    assert.equal(getJlptWordLevel(contract, "花屋|はなや"), 4);
    assert.equal(getJlptWordLevel(contract, "本音|ほんね"), 4);
    assert.equal(getJlptWordLevel(contract, "会計|かいけい"), 4);
    assert.equal(getJlptWordLevel(contract, "帰り道|かえりみち"), 4);
    assert.equal(getJlptWordLevel(contract, "元々|もともと"), 4);
    assert.equal(getJlptWordLevel(contract, "元日|がんじつ"), 4);
    assert.equal(getJlptWordLevel(contract, "住まい|すまい"), 4);
    assert.equal(getJlptWordLevel(contract, "寝室|しんしつ"), 4);
    assert.equal(getJlptWordLevel(contract, "新年|しんねん"), 4);
    assert.equal(getJlptWordLevel(contract, "閉店|へいてん"), 4);
    assert.equal(getJlptWordLevel(contract, "使い道|つかいみち"), 4);
    assert.equal(getJlptWordLevel(contract, "夏服|なつふく"), 4);
    assert.equal(getJlptWordLevel(contract, "近道|ちかみち"), 4);
    assert.equal(getJlptWordLevel(contract, "売店|ばいてん"), 4);
    assert.equal(getJlptWordLevel(contract, "音色|ねいろ"), 4);
    assert.equal(getJlptWordLevel(contract, "悪夢|あくむ"), 4);
    assert.equal(getJlptWordLevel(contract, "近づく|ちかづく"), 4);
    assert.equal(getJlptWordLevel(contract, "寝坊|ねぼう"), 3);
    assert.equal(getJlptWordLevel(contract, "仕方|しかた"), 4);
    assert.equal(getJlptWordLevel(contract, "勉強中|べんきょうちゅう"), 4);
    assert.equal(getJlptWordLevel(contract, "会費|かいひ"), 4);
    assert.equal(getJlptWordLevel(contract, "売上|うりあげ"), 4);
    assert.equal(getJlptWordLevel(contract, "開店|かいてん"), 4);
    assert.equal(getJlptWordLevel(contract, "映画館|えいがかん"), 4);
    assert.equal(getJlptWordLevel(contract, "明ける|あける"), 4);
    assert.equal(getJlptWordLevel(contract, "説明|せつめい"), 4);
    assert.equal(getJlptWordLevel(contract, "目的|もくてき"), 4);
    assert.equal(getJlptWordLevel(contract, "方法|ほうほう"), 4);
    assert.equal(getJlptWordLevel(contract, "立てる|たてる"), 4);
    assert.equal(getJlptWordLevel(contract, "国立|こくりつ"), 4);
    assert.equal(getJlptWordLevel(contract, "立場|たちば"), 4);
    assert.equal(getJlptWordLevel(contract, "閉じる|とじる"), 2);
    assert.equal(getJlptWordLevel(contract, "旅|たび"), 4);
    assert.equal(getJlptWordLevel(contract, "文化|ぶんか"), 4);
    assert.equal(getJlptWordLevel(contract, "問題|もんだい"), 4);
    assert.equal(getJlptWordLevel(contract, "別に|べつに"), 4);
    assert.equal(getJlptWordLevel(contract, "中止|ちゅうし"), 4);
    assert.equal(getJlptWordLevel(contract, "出発|しゅっぱつ"), 4);
    assert.equal(getJlptWordLevel(contract, "発音|はつおん"), 4);
    assert.equal(getJlptWordLevel(contract, "普通|ふつう"), 4);
    assert.equal(getJlptWordLevel(contract, "通り|とおり"), 4);
    assert.equal(getJlptWordLevel(contract, "空く|あく"), 4);
    assert.equal(getJlptWordLevel(contract, "空ける|あける"), 4);
    assert.equal(getJlptWordLevel(contract, "切れる|きれる"), 4);
    assert.equal(getJlptWordLevel(contract, "交代|こうたい"), 4);
    assert.equal(getJlptWordLevel(contract, "代わり|かわり"), 4);
    assert.equal(getJlptWordLevel(contract, "広告|こうこく"), 4);
    assert.equal(getJlptWordLevel(contract, "広がる|ひろがる"), 4);
    assert.equal(getJlptWordLevel(contract, "五月|ごがつ"), 5);
    assert.equal(getJlptWordLevel(contract, "四月|しがつ"), 5);
    assert.equal(getJlptWordLevel(contract, "七日|なのか"), 5);
    assert.equal(getJlptWordLevel(contract, "十日|とおか"), 5);
    assert.equal(getJlptWordLevel(contract, "子猫|こねこ"), 5);
    assert.equal(getJlptWordLevel(contract, "有名|ゆうめい"), 5);
    assert.equal(getJlptWordLevel(contract, "帽子|ぼうし"), 5);
    assert.equal(getJlptWordLevel(contract, "彼女|かのじょ"), 5);
    assert.equal(getJlptWordLevel(contract, "中国|ちゅうごく"), 5);
    assert.equal(getJlptWordLevel(contract, "地下|ちか"), 5);
    assert.equal(getJlptWordLevel(contract, "上下|じょうげ"), 5);
    assert.equal(getJlptWordLevel(contract, "外す|はずす"), 5);
    assert.equal(getJlptWordLevel(contract, "二日|ふつか"), 5);
    assert.equal(getJlptWordLevel(contract, "二時|にじ"), 5);
    assert.equal(getJlptWordLevel(contract, "入学|にゅうがく"), 5);
    assert.equal(getJlptWordLevel(contract, "大変|たいへん"), 5);
    assert.equal(getJlptWordLevel(contract, "火山|かざん"), 2);
    assert.equal(getJlptWordLevel(contract, "社長|しゃちょう"), 5);
    assert.equal(getJlptWordLevel(contract, "十回|じっかい"), 5);
    assert.equal(getJlptWordLevel(contract, "土地|とち"), 5);
    assert.equal(getJlptWordLevel(contract, "名字|みょうじ"), 5);
    assert.equal(getJlptWordLevel(contract, "葉書|はがき"), 5);
    assert.equal(getJlptWordLevel(contract, "三百|さんびゃく"), 5);
    assert.equal(getJlptWordLevel(contract, "左右|さゆう"), 5);
    assert.equal(getJlptWordLevel(contract, "見学|けんがく"), 2);
    assert.equal(getJlptWordLevel(contract, "雨戸|あまど"), 2);
    assert.equal(getJlptWordLevel(contract, "北東|ほくとう"), 5);
    assert.equal(getJlptWordLevel(contract, "男子|だんし"), 5);
    assert.equal(getJlptWordLevel(contract, "手本|てほん"), 5);
    assert.equal(getJlptWordLevel(contract, "母校|ぼこう"), 1);
    assert.equal(getJlptWordLevel(contract, "雨天|うてん"), 1);
    assert.equal(getJlptWordLevel(contract, "八日|ようか"), 5);
    assert.equal(getJlptWordLevel(contract, "校長|こうちょう"), 4);
    assert.equal(getJlptWordLevel(contract, "長男|ちょうなん"), 2);
    assert.equal(getJlptWordLevel(contract, "白米|はくまい"), 5);
    assert.equal(getJlptWordLevel(contract, "後半|こうはん"), 5);
    assert.equal(getJlptWordLevel(contract, "一日|ついたち"), 5);
    assert.equal(getJlptWordLevel(contract, "後ほど|のちほど"), 5);
    assert.equal(getJlptWordLevel(contract, "行事|ぎょうじ"), 5);
    assert.equal(getJlptWordLevel(contract, "南北|なんぼく"), 2);
    assert.equal(getJlptWordLevel(contract, "父母|ふぼ"), 2);
    assert.equal(getJlptWordLevel(contract, "分かれる|わかれる"), 5);
    assert.equal(getJlptWordLevel(contract, "分ける|わける"), 5);
    assert.equal(getJlptWordLevel(contract, "休める|やすめる"), 1);
    assert.equal(getJlptWordLevel(contract, "下す|くだす"), 2);
    assert.equal(getJlptWordLevel(contract, "生える|はえる"), 5);
    assert.equal(getJlptWordLevel(contract, "休まる|やすまる"), 3);
    assert.equal(getJlptWordLevel(contract, "生け花|いけばな"), 5);
    assert.equal(getJlptWordLevel(contract, "西洋|せいよう"), 5);
    assert.equal(getJlptWordLevel(contract, "関西|かんさい"), 5);
    assert.equal(getJlptWordLevel(contract, "語る|かたる"), 3);
    assert.equal(getJlptWordLevel(contract, "下町|したまち"), 5);
    assert.equal(getJlptWordLevel(contract, "外科|げか"), 5);
    assert.equal(getJlptWordLevel(contract, "外れる|はずれる"), 2);
    assert.equal(getJlptWordLevel(contract, "行う|おこなう"), 4);
    assert.equal(getJlptWordLevel(contract, "生ビール|なまびーる"), 5);
    assert.equal(getJlptWordLevel(contract, "西瓜|すいか"), 1);
    assert.equal(getJlptWordLevel(contract, "分かつ|わかつ"), 1);
    assert.equal(getJlptWordLevel(contract, "駅の前|えきのまえ"), null);
    assert.equal(getJlptWordLevel(contract, "手間|てま"), 5);
    assert.equal(getJlptWordLevel(contract, "白紙|はくし"), 5);
    assert.equal(getJlptWordLevel(contract, "音読|おんどく"), 5);
    assert.equal(getJlptWordLevel(contract, "万事|ばんじ"), 5);
    assert.equal(getJlptWordLevel(contract, "椅子|いす"), 5);
    assert.equal(getJlptWordLevel(contract, "気配|けはい"), null);
    assert.equal(getJlptWordLevel(contract, "世間|せけん"), 3);
    assert.equal(getJlptWordLevel(contract, "半ば|なかば"), 3);
    assert.equal(getJlptWordLevel(contract, "小指|こゆび"), 5);
    assert.equal(getJlptWordLevel(contract, "木刀|ぼくとう"), 1);
    assert.equal(getJlptWordLevel(contract, "木陰|こかげ"), 5);
    assert.equal(getJlptWordLevel(contract, "春雨|はるさめ"), 5);
    assert.equal(getJlptWordLevel(contract, "女神|めがみ"), 5);
    assert.equal(getJlptWordLevel(contract, "子年|ねどし"), 5);
    assert.equal(getJlptWordLevel(contract, "午年|うまどし"), 5);
    assert.equal(getJlptWordLevel(contract, "天の川|あまのがわ"), 5);
    assert.equal(getJlptWordLevel(contract, "天気雨|てんきあめ"), null);
    assert.equal(getJlptWordLevel(contract, "河川|かせん"), 1);
    assert.equal(getJlptWordLevel(contract, "白髪|しらが"), 5);
    assert.equal(getJlptWordLevel(contract, "話|はなし"), 5);
    assert.equal(getJlptWordLevel(contract, "後れる|おくれる"), 1);
    assert.equal(getJlptWordLevel(contract, "上り|のぼり"), 2);
    assert.equal(getJlptWordLevel(contract, "下り|くだり"), 3);
    assert.equal(getJlptWordLevel(contract, "左折|させつ"), 5);
    assert.equal(getJlptWordLevel(contract, "母語|ぼご"), 5);
    assert.equal(getJlptWordLevel(contract, "小川|おがわ"), 5);
    assert.equal(getJlptWordLevel(contract, "円高|えんだか"), 5);
    assert.equal(getJlptWordLevel(contract, "小雨|こさめ"), 5);
    assert.equal(getJlptWordLevel(contract, "来い|こい"), 5);
    assert.equal(getJlptWordLevel(contract, "金具|かなぐ"), 5);
    assert.equal(getJlptWordLevel(contract, "黄金|おうごん"), 1);
    assert.equal(getJlptWordLevel(contract, "食う|くう"), 3);
    assert.equal(getJlptWordLevel(contract, "上座|かみざ"), null);
    assert.equal(getJlptWordLevel(contract, "女房|にょうぼう"), 1);
    assert.equal(getJlptWordLevel(contract, "白夜|びゃくや"), 2);
    assert.equal(getJlptWordLevel(contract, "足下|あしもと"), 5);
    assert.equal(getJlptWordLevel(contract, "出来上がり|できあがり"), 2);
    assert.equal(getJlptWordLevel(contract, "上昇|じょうしょう"), 1);
    assert.equal(getJlptWordLevel(contract, "行方|ゆくえ"), 2);
    assert.equal(getJlptWordLevel(contract, "生地|きじ"), 5);
    assert.equal(getJlptWordLevel(contract, "生やす|はやす"), 1);
    assert.equal(getJlptWordLevel(contract, "火照る|ほてる"), 5);
    assert.equal(getJlptWordLevel(contract, "生かす|いかす"), 1);
    assert.equal(getJlptWordLevel(contract, "眼鏡|めがね"), 1);
    assert.equal(getJlptWordLevel(contract, "断食|だんじき"), 3);
    assert.equal(getJlptWordLevel(contract, "家計|かけい"), 4);
    assert.equal(getJlptWordLevel(contract, "飲料|いんりょう"), 4);
    assert.equal(getJlptWordLevel(contract, "開き|ひらき"), 4);
    assert.equal(getJlptWordLevel(contract, "気楽|きらく"), 4);
    assert.equal(getJlptWordLevel(contract, "観音|かんのん"), 4);
    assert.equal(getJlptWordLevel(contract, "屋上|おくじょう"), 4);
    assert.equal(getJlptWordLevel(contract, "会釈|えしゃく"), 4);
    assert.equal(getJlptWordLevel(contract, "力士|りきし"), 4);
    assert.equal(getJlptWordLevel(contract, "魚|うお"), 4);
    assert.equal(getJlptWordLevel(contract, "牛|うし"), 4);
    assert.equal(getJlptWordLevel(contract, "教わる|おそわる"), 4);
    assert.equal(getJlptWordLevel(contract, "強まる|つよまる"), 4);
    assert.equal(getJlptWordLevel(contract, "強める|つよめる"), 4);
    assert.equal(getJlptWordLevel(contract, "最近|さいきん"), 4);
    assert.equal(getJlptWordLevel(contract, "問う|とう"), 2);
    assert.equal(getJlptWordLevel(contract, "建立|こんりゅう"), 1);
    assert.equal(getJlptWordLevel(contract, "強いる|しいる"), 1);
    assert.equal(getJlptWordLevel(contract, "母音|ぼいん"), 4);
    assert.equal(getJlptWordLevel(contract, "起立|きりつ"), 4);
    assert.equal(getJlptWordLevel(contract, "初夏|しょか"), 4);
    assert.equal(getJlptWordLevel(contract, "帰す|かえす"), 4);
    assert.equal(getJlptWordLevel(contract, "作業|さぎょう"), 4);
    assert.equal(getJlptWordLevel(contract, "用いる|もちいる"), 4);
    assert.equal(getJlptWordLevel(contract, "開く|あく"), 4);
    assert.equal(getJlptWordLevel(contract, "問い|とい"), 4);
    assert.equal(getJlptWordLevel(contract, "問屋|とんや"), 4);
    assert.equal(getJlptWordLevel(contract, "手強い|てごわい"), 4);
    assert.equal(getJlptWordLevel(contract, "明朝|みょうちょう"), 4);
    assert.equal(getJlptWordLevel(contract, "寝かす|ねかす"), 3);
    assert.equal(getJlptWordLevel(contract, "建つ|たつ"), 4);
    assert.equal(getJlptWordLevel(contract, "行き止まり|いきどまり"), 4);
    assert.equal(getJlptWordLevel(contract, "安全|あんぜん"), 4);
    assert.equal(getJlptWordLevel(contract, "田舎|いなか"), 4);
    assert.equal(getJlptWordLevel(contract, "文法|ぶんぽう"), 4);
    assert.equal(getJlptWordLevel(contract, "忘れ物|わすれもの"), 4);
    assert.equal(getJlptWordLevel(contract, "門出|かどで"), 4);
    assert.equal(getJlptWordLevel(contract, "産声|うぶごえ"), 4);
    assert.equal(getJlptWordLevel(contract, "目頭|めがしら"), 4);
    assert.equal(getJlptWordLevel(contract, "頭文字|かしらもじ"), 4);
    assert.equal(getJlptWordLevel(contract, "産む|うむ"), 4);
    assert.equal(getJlptWordLevel(contract, "産まれる|うまれる"), 4);
    assert.equal(getJlptWordLevel(contract, "好む|このむ"), 4);
    assert.equal(getJlptWordLevel(contract, "弱まる|よわまる"), 4);
    assert.equal(getJlptWordLevel(contract, "弱める|よわめる"), 4);
    assert.equal(getJlptWordLevel(contract, "弱る|よわる"), 4);
    assert.equal(getJlptWordLevel(contract, "回す|まわす"), 4);
    assert.equal(getJlptWordLevel(contract, "合わせる|あわせる"), 4);
    assert.equal(getJlptWordLevel(contract, "全く|まったく"), 4);
    assert.equal(getJlptWordLevel(contract, "全て|すべて"), 4);
    assert.equal(getJlptWordLevel(contract, "便り|たより"), 4);
    assert.equal(getJlptWordLevel(contract, "民|たみ"), 4);
    assert.equal(getJlptWordLevel(contract, "都|みやこ"), 4);
    assert.equal(getJlptWordLevel(contract, "次ぐ|つぐ"), 4);
    assert.equal(getJlptWordLevel(contract, "説く|とく"), 4);
    assert.equal(getJlptWordLevel(contract, "利く|きく"), 4);
    assert.equal(getJlptWordLevel(contract, "軽やか|かろやか"), 4);
    assert.equal(getJlptWordLevel(contract, "乗せる|のせる"), 4);
    assert.equal(getJlptWordLevel(contract, "進める|すすめる"), 4);
    assert.equal(getJlptWordLevel(contract, "低める|ひくめる"), 4);
    assert.equal(getJlptWordLevel(contract, "後|あと"), 5);
    assert.equal(getJlptWordLevel(contract, "男の子|おとこのこ"), 5);
    assert.equal(getJlptWordLevel(contract, "大人|おとな"), 5);
    assert.equal(getJlptWordLevel(contract, "白|しろ"), 5);
    assert.equal(getJlptWordLevel(contract, "千|せん"), 5);
    assert.equal(getJlptWordLevel(contract, "出かける|でかける"), 5);
    assert.equal(getJlptWordLevel(contract, "年|とし"), 5);
    assert.equal(getJlptWordLevel(contract, "半|はん"), 5);
    assert.equal(getJlptWordLevel(contract, "百|ひゃく"), 5);
    assert.equal(getJlptWordLevel(contract, "前|まえ"), 5);
    assert.equal(getJlptWordLevel(contract, "万|まん"), 5);
    assert.equal(getJlptWordLevel(contract, "五日|いつか"), 5);
    assert.equal(getJlptWordLevel(contract, "一日|いちにち"), 5);
    assert.equal(getJlptWordLevel(contract, "一緒|いっしょ"), 5);
    assert.equal(getJlptWordLevel(contract, "九日|ここのか"), 5);
    assert.equal(getJlptWordLevel(contract, "今週|こんしゅう"), 5);
    assert.equal(getJlptWordLevel(contract, "時計|とけい"), 5);
    assert.equal(getJlptWordLevel(contract, "大好き|だいすき"), 5);
    assert.equal(getJlptWordLevel(contract, "二十日|はつか"), 5);
    assert.equal(getJlptWordLevel(contract, "毎朝|まいあさ"), 5);
    assert.equal(getJlptWordLevel(contract, "毎晩|まいばん"), 5);
    assert.equal(getJlptWordLevel(contract, "三日|みっか"), 5);
    assert.equal(getJlptWordLevel(contract, "六日|むいか"), 5);
    assert.equal(getJlptWordLevel(contract, "四日|よっか"), 5);
    assert.equal(getJlptWordLevel(contract, "大勢|おおぜい"), 5);
    assert.equal(getJlptWordLevel(contract, "お菓子|おかし"), 5);
    assert.equal(getJlptWordLevel(contract, "昨日|きのう"), 5);
    assert.equal(getJlptWordLevel(contract, "靴下|くつした"), 5);
    assert.equal(getJlptWordLevel(contract, "今朝|けさ"), 5);
    assert.equal(getJlptWordLevel(contract, "自分|じぶん"), 5);
    assert.equal(getJlptWordLevel(contract, "生徒|せいと"), 5);
    assert.equal(getJlptWordLevel(contract, "大使館|たいしかん"), 5);
    assert.equal(getJlptWordLevel(contract, "二十歳|はたち"), 5);
    assert.equal(getJlptWordLevel(contract, "飛行機|ひこうき"), 5);
    assert.equal(getJlptWordLevel(contract, "八百屋|やおや"), 5);
    assert.equal(getJlptWordLevel(contract, "廊下|ろうか"), 5);
    assert.equal(getJlptWordLevel(contract, "本棚|ほんだな"), 5);
    assert.equal(getJlptWordLevel(contract, "留学生|りゅうがくせい"), 5);
    assert.equal(contract.excludedWordLevels["高い山|たかいやま"].exclusionReason, "phrase");
    assert.equal(contract.excludedWordLevels["赤い花|あかいはな"].exclusionReason, "phrase");
});

test("auditWordStudyEntriesAgainstContract reports starter drift against the canonical word contract", () => {
    const audit = auditWordStudyEntriesAgainstContract({
        "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 4 },
    }, {
        inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 },
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 5 },
        },
    });

    assert.equal(audit.valid, false);
    assert.equal(audit.mismatchCount, 1);
    assert.equal(audit.mismatches[0].key, "仕事|しごと");
    assert.equal(audit.mismatches[0].expected.jlpt, 5);
    assert.equal(audit.mismatches[0].actual.jlpt, 4);
});

test("buildInventoryCountsFromWordLevels totals all jlpt buckets", () => {
    const counts = buildInventoryCountsFromWordLevels({
        "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        "公園|こうえん": { written: "公園", reading: "こうえん", jlpt: 5 },
        "仕事|しごと": { written: "仕事", reading: "しごと", jlpt: 4 },
    });

    assert.deepEqual(counts, {
        1: 0,
        2: 0,
        3: 0,
        4: 1,
        5: 2,
    });
});

test("buildStarterWordGovernanceSummary distinguishes canonical starter entries from curated-only and excluded ones", () => {
    const summary = buildStarterWordGovernanceSummary({
        "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5, tags: ["starter"] },
        "今年|ことし": { written: "今年", reading: "ことし", jlpt: 4, tags: ["starter"] },
        "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, tags: ["starter", "phrase"] },
    }, {
        inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        },
    });

    assert.equal(summary.defaultDeckStarterCount, 2);
    assert.equal(summary.canonicalStarterCount, 1);
    assert.equal(summary.curatedOnlyStarterCount, 1);
    assert.equal(summary.mismatchStarterCount, 0);
    assert.equal(summary.excludedPhraseCount, 1);
    assert.equal(summary.overallCoverage, 50);
    assert.equal(summary.coverageByLevel[5], 100);
    assert.equal(summary.coverageByLevel[4], 0);
});

test("auditWordStudyEntriesAgainstContract expects phrase-tagged starter rows in excluded contract entries", () => {
    const audit = auditWordStudyEntriesAgainstContract({
        "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, tags: ["starter", "phrase"] },
    }, {
        inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        excludedCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
        wordLevels: {},
        excludedWordLevels: {
            "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, exclusionReason: "phrase" },
        },
    });

    assert.equal(audit.valid, true);
    assert.equal(audit.excludedContractEntryCount, 1);
    assert.equal(audit.missingExcludedContractEntryCount, 0);
    assert.equal(audit.unexpectedExcludedContractEntryCount, 0);
});

test("auditWordStudyEntriesAgainstContract includes reading-coverage contract tracking summary", () => {
    const audit = auditWordStudyEntriesAgainstContract({
        "今日|きょう": {
            written: "今日",
            reading: "きょう",
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
    }, {
        inventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
        wordLevels: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
        },
    });

    assert.equal(audit.readingCoverageContract.totalExplicitCoverageEntries, 1);
    assert.equal(audit.readingCoverageContract.totalExplicitReadingTargets, 2);
    assert.equal(audit.readingCoverageContract.explicitCoveragePercentByLevel[5], 100);
});
