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

    assert.equal(contract.inventoryCounts["1"], 2);
    assert.equal(contract.inventoryCounts["3"], 3);
    assert.equal(contract.inventoryCounts["4"], 455);
    assert.equal(contract.inventoryCounts["5"], 343);
    assert.equal(contract.excludedCounts["5"], 13);
    for (const key of n5StandaloneNumberWords) {
        assert.equal(getJlptWordLevel(contract, key), 5);
    }
    assert.equal(getJlptWordLevel(contract, "安心|あんしん"), 4);
    assert.equal(getJlptWordLevel(contract, "生きる|いきる"), 4);
    assert.equal(getJlptWordLevel(contract, "下げる|さげる"), 4);
    assert.equal(getJlptWordLevel(contract, "土|つち"), 3);
    assert.equal(getJlptWordLevel(contract, "月|つき"), 3);
    assert.equal(getJlptWordLevel(contract, "一生|いっしょう"), 3);
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
    assert.equal(getJlptWordLevel(contract, "猫|ねこ"), 4);
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
    assert.equal(getJlptWordLevel(contract, "閉まる|しまる"), 4);
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
    assert.equal(getJlptWordLevel(contract, "忙しい|いそがしい"), 4);
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
    assert.equal(getJlptWordLevel(contract, "座席|ざせき"), 4);
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
    assert.equal(getJlptWordLevel(contract, "寝坊|ねぼう"), 4);
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
    assert.equal(getJlptWordLevel(contract, "閉じる|とじる"), 4);
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
    assert.equal(getJlptWordLevel(contract, "火山|かざん"), 5);
    assert.equal(getJlptWordLevel(contract, "社長|しゃちょう"), 5);
    assert.equal(getJlptWordLevel(contract, "十回|じっかい"), 5);
    assert.equal(getJlptWordLevel(contract, "土地|とち"), 5);
    assert.equal(getJlptWordLevel(contract, "名字|みょうじ"), 5);
    assert.equal(getJlptWordLevel(contract, "葉書|はがき"), 5);
    assert.equal(getJlptWordLevel(contract, "三百|さんびゃく"), 5);
    assert.equal(getJlptWordLevel(contract, "左右|さゆう"), 5);
    assert.equal(getJlptWordLevel(contract, "見学|けんがく"), 5);
    assert.equal(getJlptWordLevel(contract, "雨戸|あまど"), 5);
    assert.equal(getJlptWordLevel(contract, "北東|ほくとう"), 5);
    assert.equal(getJlptWordLevel(contract, "男子|だんし"), 5);
    assert.equal(getJlptWordLevel(contract, "手本|てほん"), 5);
    assert.equal(getJlptWordLevel(contract, "母校|ぼこう"), 5);
    assert.equal(getJlptWordLevel(contract, "雨天|うてん"), 5);
    assert.equal(getJlptWordLevel(contract, "八日|ようか"), 5);
    assert.equal(getJlptWordLevel(contract, "校長|こうちょう"), 5);
    assert.equal(getJlptWordLevel(contract, "長男|ちょうなん"), 5);
    assert.equal(getJlptWordLevel(contract, "白米|はくまい"), 5);
    assert.equal(getJlptWordLevel(contract, "後半|こうはん"), 5);
    assert.equal(getJlptWordLevel(contract, "一日|ついたち"), 5);
    assert.equal(getJlptWordLevel(contract, "後ほど|のちほど"), 5);
    assert.equal(getJlptWordLevel(contract, "行事|ぎょうじ"), 5);
    assert.equal(getJlptWordLevel(contract, "南北|なんぼく"), 5);
    assert.equal(getJlptWordLevel(contract, "父母|ふぼ"), 5);
    assert.equal(getJlptWordLevel(contract, "分かれる|わかれる"), 5);
    assert.equal(getJlptWordLevel(contract, "分ける|わける"), 5);
    assert.equal(getJlptWordLevel(contract, "休める|やすめる"), 5);
    assert.equal(getJlptWordLevel(contract, "下す|くだす"), 5);
    assert.equal(getJlptWordLevel(contract, "生える|はえる"), 5);
    assert.equal(getJlptWordLevel(contract, "休まる|やすまる"), 5);
    assert.equal(getJlptWordLevel(contract, "生け花|いけばな"), 5);
    assert.equal(getJlptWordLevel(contract, "西洋|せいよう"), 5);
    assert.equal(getJlptWordLevel(contract, "関西|かんさい"), 5);
    assert.equal(getJlptWordLevel(contract, "語る|かたる"), 5);
    assert.equal(getJlptWordLevel(contract, "下町|したまち"), 5);
    assert.equal(getJlptWordLevel(contract, "外科|げか"), 5);
    assert.equal(getJlptWordLevel(contract, "外れる|はずれる"), 5);
    assert.equal(getJlptWordLevel(contract, "行う|おこなう"), 5);
    assert.equal(getJlptWordLevel(contract, "生ビール|なまびーる"), 5);
    assert.equal(getJlptWordLevel(contract, "西瓜|すいか"), 5);
    assert.equal(getJlptWordLevel(contract, "手間|てま"), 5);
    assert.equal(getJlptWordLevel(contract, "白紙|はくし"), 5);
    assert.equal(getJlptWordLevel(contract, "音読|おんどく"), 5);
    assert.equal(getJlptWordLevel(contract, "万事|ばんじ"), 5);
    assert.equal(getJlptWordLevel(contract, "椅子|いす"), 5);
    assert.equal(getJlptWordLevel(contract, "気配|けはい"), 5);
    assert.equal(getJlptWordLevel(contract, "世間|せけん"), 5);
    assert.equal(getJlptWordLevel(contract, "半ば|なかば"), 5);
    assert.equal(getJlptWordLevel(contract, "小指|こゆび"), 5);
    assert.equal(getJlptWordLevel(contract, "木刀|ぼくとう"), 5);
    assert.equal(getJlptWordLevel(contract, "木陰|こかげ"), 5);
    assert.equal(getJlptWordLevel(contract, "春雨|はるさめ"), 5);
    assert.equal(getJlptWordLevel(contract, "女神|めがみ"), 5);
    assert.equal(getJlptWordLevel(contract, "子年|ねどし"), 5);
    assert.equal(getJlptWordLevel(contract, "午年|うまどし"), 5);
    assert.equal(getJlptWordLevel(contract, "天の川|あまのがわ"), 5);
    assert.equal(getJlptWordLevel(contract, "天気雨|てんきあめ"), 5);
    assert.equal(getJlptWordLevel(contract, "河川|かせん"), 5);
    assert.equal(getJlptWordLevel(contract, "白髪|しらが"), 5);
    assert.equal(getJlptWordLevel(contract, "話|はなし"), 5);
    assert.equal(getJlptWordLevel(contract, "後れる|おくれる"), 5);
    assert.equal(getJlptWordLevel(contract, "上り|のぼり"), 5);
    assert.equal(getJlptWordLevel(contract, "下り|くだり"), 5);
    assert.equal(getJlptWordLevel(contract, "左折|させつ"), 5);
    assert.equal(getJlptWordLevel(contract, "母語|ぼご"), 5);
    assert.equal(getJlptWordLevel(contract, "小川|おがわ"), 5);
    assert.equal(getJlptWordLevel(contract, "円高|えんだか"), 5);
    assert.equal(getJlptWordLevel(contract, "小雨|こさめ"), 5);
    assert.equal(getJlptWordLevel(contract, "来い|こい"), 5);
    assert.equal(getJlptWordLevel(contract, "金具|かなぐ"), 5);
    assert.equal(getJlptWordLevel(contract, "黄金|おうごん"), 5);
    assert.equal(getJlptWordLevel(contract, "食う|くう"), 5);
    assert.equal(getJlptWordLevel(contract, "上座|かみざ"), 5);
    assert.equal(getJlptWordLevel(contract, "女房|にょうぼう"), 5);
    assert.equal(getJlptWordLevel(contract, "白夜|びゃくや"), 5);
    assert.equal(getJlptWordLevel(contract, "足下|あしもと"), 5);
    assert.equal(getJlptWordLevel(contract, "出来上がり|できあがり"), 5);
    assert.equal(getJlptWordLevel(contract, "上昇|じょうしょう"), 5);
    assert.equal(getJlptWordLevel(contract, "行方|ゆくえ"), 5);
    assert.equal(getJlptWordLevel(contract, "生地|きじ"), 5);
    assert.equal(getJlptWordLevel(contract, "生やす|はやす"), 5);
    assert.equal(getJlptWordLevel(contract, "火照る|ほてる"), 5);
    assert.equal(getJlptWordLevel(contract, "生かす|いかす"), 5);
    assert.equal(getJlptWordLevel(contract, "眼鏡|めがね"), 5);
    assert.equal(getJlptWordLevel(contract, "断食|だんじき"), 5);
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
    assert.equal(getJlptWordLevel(contract, "寝かす|ねかす"), 4);
    assert.equal(getJlptWordLevel(contract, "建つ|たつ"), 4);
    assert.equal(getJlptWordLevel(contract, "行き止まり|いきどまり"), 4);
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
