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

    assert.equal(contract.inventoryCounts["1"], 38);
    assert.equal(contract.inventoryCounts["2"], 61);
    assert.equal(contract.inventoryCounts["3"], 1099);
    assert.equal(contract.inventoryCounts["4"], 729);
    assert.equal(contract.inventoryCounts["5"], 588);
    assert.deepEqual(contract.excludedCounts, {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
    });
    assert.deepEqual(Object.keys(contract.excludedWordLevels), []);
    assert.equal(contract.wordLevels["食べもの|たべもの"]?.jlpt, 5);
    assert.equal(contract.wordLevels["食べ物|たべもの"]?.jlpt, 5);
    const n5RoutedMoveTargets = {
        "お弁当|おべんとう": 3,
        "泳ぐ|およぐ": 2,
        "鉛筆|えんぴつ": 2,
        "塩|しお": 2,
        "奥さん|おくさん": 3,
        "温い|ぬるい": 3,
        "暇|ひま": 1,
        "灰皿|はいざら": 2,
        "皆さん|みなさん": 3,
        "階段|かいだん": 3,
        "角|かど": 2,
        "甘い|あまい": 2,
        "机|つくえ": 2,
        "居る|いる": 2,
        "橋|はし": 2,
        "狭い|せまい": 1,
        "曲る|まがる": 2,
        "靴|くつ": 3,
        "警官|けいかん": 3,
        "結構|けっこう": 3,
        "嫌|いや": 1,
        "嫌い|きらい": 1,
        "玄関|げんかん": 3,
        "戸|と": 2,
        "交差点|こうさてん": 3,
        "厚い|あつい": 2,
        "困る|こまる": 2,
        "差す|さす": 3,
        "砂糖|さとう": 2,
        "細い|ほそい": 2,
        "咲く|さく": 2,
        "撮る|とる": 1,
        "雑誌|ざっし": 3,
        "傘|かさ": 1,
        "歯|は": 2,
        "取る|とる": 3,
        "暑い|あつい": 1,
        "辛い|からい": 2,
        "晴れ|はれ": 2,
        "晴れる|はれる": 2,
        "静か|しずか": 2,
        "脱ぐ|ぬぐ": 1,
        "弾く|ひく": 1,
        "暖かい|あたたかい": 1,
        "締める|しめる": 1,
        "曇り|くもり": 2,
        "曇る|くもる": 2,
        "難しい|むずかしい": 2,
        "背|せい": 3,
        "薄い|うすい": 2,
        "鼻|はな": 2,
        "封筒|ふうとう": 2,
        "返す|かえす": 3,
        "磨く|みがく": 2,
        "卵|たまご": 2,
        "涼しい|すずしい": 2,
        "隣|となり": 1,
        "冷蔵庫|れいぞうこ": 3,
        "零|れい": 2,
        "お皿|おさら": 2,
        "お酒|おさけ": 3,
        "結婚|けっこん": 3,
        "掃除|そうじ": 2,
    };
    assert.equal(Object.keys(n5RoutedMoveTargets).length, 63);
    for (const [key, level] of Object.entries(n5RoutedMoveTargets)) {
        assert.equal(contract.wordLevels[key]?.jlpt, level, `${key} should be governed in N${level}`);
    }
    for (const key of [
        "羞恥|しゅうち",
        "資本|しほん",
        "事務|じむ",
        "収穫|しゅうかく",
        "就職|しゅうしょく",
        "住宅|じゅうたく",
        "収入|しゅうにゅう",
        "宿泊|しゅくはく",
        "手術|しゅじゅつ",
        "手段|しゅだん",
        "出席|しゅっせき",
        "主婦|しゅふ",
        "主要|しゅよう",
        "需要|じゅよう",
        "順調|じゅんちょう",
        "障害|しょうがい",
        "状況|じょうきょう",
        "条件|じょうけん",
        "常識|じょうしき",
        "症状|しょうじょう",
        "状態|じょうたい",
        "上達|じょうたつ",
        "冗談|じょうだん",
        "上等|じょうとう",
        "商人|しょうにん",
        "承認|しょうにん",
        "商売|しょうばい",
        "消防|しょうぼう",
        "情報|じょうほう",
        "女王|じょおう",
        "職|しょく",
        "職業|しょくぎょう",
        "食欲|しょくよく",
        "頂上|ちょうじょう",
        "正直|しょうじき",
        "直接|ちょくせつ",
        "追加|ついか",
        "庭園|ていえん",
        "伝統|でんとう",
        "登山|とざん",
        "渡航|とこう",
        "怒鳴る|どなる",
        "投票|とうひょう",
        "銭湯|せんとう",
        "同等|どうとう",
        "逃走|とうそう",
        "波乱|はらん",
        "破壊|はかい",
        "乗馬|じょうば",
        "敗北|はいぼく",
        "杯|はい",
        "背景|はいけい",
        "反物|たんもの",
        "彼岸|ひがん",
        "悲劇|ひげき",
        "必要|ひつよう",
        "表現|ひょうげん",
        "貧困|ひんこん",
        "貧乏|びんぼう",
        "丈夫|じょうぶ",
        "浮上|ふじょう",
        "負担|ふたん",
        "腹痛|ふくつう",
        "並行|へいこう",
        "米国|べいこく",
        "新米|しんまい",
        "逮捕|たいほ",
        "抱負|ほうふ",
        "法被|はっぴ",
        "訪問|ほうもん",
        "亡者|もうじゃ",
        "忘年会|ぼうねんかい",
        "本望|ほんもう",
        "末路|ばつろ",
        "睡眠|すいみん",
        "夢中|むちゅう",
        "解く|とく",
        "寿命|じゅみょう",
        "命令|めいれい",
        "迷惑|めいわく",
        "悲鳴|ひめい",
        "兵役|へいえき",
        "石油|せきゆ",
        "遊園地|ゆうえんち",
        "余裕|よゆう",
        "給与|きゅうよ",
        "預金|よきん",
        "紅葉|こうよう",
        "欲望|よくぼう",
        "連絡|れんらく",
        "落語|らくご",
        "表裏|ひょうり",
        "良好|りょうこう",
        "緑茶|りょくちゃ",
        "車輪|しゃりん",
        "感涙|かんるい",
        "冷房|れいぼう",
        "横|よこ",
        "取引|とりひき",
        "押し付ける|おしつける",
        "窓際|まどぎわ",
        "初雪|はつゆき",
        "折り返し|おりかえし",
        "置き換える|おきかえる",
        "雨雲|あまぐも",
        "年寄り|としより",
        "皆様|みなさま",
        "酒屋|さかや",
        "宿屋|やどや",
        "焼き鳥|やきとり",
        "船便|ふなびん",
        "花束|はなたば",
        "日付|ひづけ",
        "木の実|きのみ",
        "富|とみ",
        "際立つ|きわだつ",
        "種|たね",
        "罪|つみ",
        "顔付き|かおつき",
        "打ち合わせ|うちあわせ",
        "伝手|つて",
        "神主|かんぬし",
        "冷える|ひえる",
        "冷やす|ひやす",
        "冷ます|さます",
        "冷める|さめる",
        "散る|ちる",
        "散らかる|ちらかる",
        "散らかす|ちらかす",
        "散らす|ちらす",
        "因る|よる",
        "果て|はて",
        "果てる|はてる",
        "割く|さく",
        "割る|わる",
        "関わる|かかわる",
        "関取|せきとり",
        "窓越し|まどごし",
        "越え|ごえ",
        "越し|ごし",
        "向かい|むかい",
        "向き|むき",
        "向く|むく",
        "向け|むけ",
        "向ける|むける",
        "幸|さち",
        "交ざる|まざる",
        "交じる|まじる",
        "交ぜる|まぜる",
        "交える|まじえる",
        "交わる|まじわる",
        "経つ|たつ",
        "経る|へる",
        "供|とも",
        "解かす|とかす",
        "解ける|とける",
        "解ける|ほどける",
        "解る|わかる",
        "汚い|きたない",
        "汚す|よごす",
        "降りる|おりる",
        "降り|ふり",
        "観る|みる",
        "大関|おおぜき",
        "機織り|はたおり",
        "手許|てもと",
        "行き交う|いきかう",
        "向こう|むこう",
        "見込み|みこみ",
        "済み|ずみ",
        "参る|まいる",
        "消す|けす",
        "常|つね",
        "直る|なおる",
        "山積み|やまづみ",
        "成す|なす",
        "成る|なる",
        "直ちに|ただちに",
        "和む|なごむ",
        "和やか|なごやか",
        "和らぐ|やわらぐ",
        "和らげる|やわらげる",
        "温かい|あたたかい",
        "温まる|あたたまる",
        "温める|あたためる",
        "散らばる|ちらばる",
        "退く|どく",
        "退く|のく",
        "退く|しりぞく",
        "退ける|どける",
        "退ける|のける",
        "労る|いたわる",
        "捕まる|つかまる",
        "捕らえる|とらえる",
        "汚らわしい|けがらわしい",
        "互に|かたみに",
        "会社勤め|かいしゃづとめ",
        "済まない|すまない",
        "賛える|たたえる",
        "辞む|いなむ",
        "数々|しばしば",
        "席|むしろ",
        "生き存える|いきながらえる",
        "末|うれ",
        "直き|なおき",
        "川伝い|かわづたい",
        "認める|したためる",
        "反る|かえる",
        "夫れ夫れ|それぞれ",
        "権殿|かりどの",
        "婦|よめ",
        "米酢|よねず",
        "法面|のりめん",
        "亡い|ない",
        "約やか|つづまやか",
        "労き|いたずき",
        "守|かみ",
        "政所|まんどころ",
        "向いている|むいている",
        "寝ぬ|いぬ",
        "愛しい|かなしい",
        "苦る|にがる",
        "お弁当|おべんとう",
        "奥さん|おくさん",
        "温い|ぬるい",
        "皆さん|みなさん",
        "階段|かいだん",
    ]) {
        assert.equal(getJlptWordLevel(contract, key), 3);
    }
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
    assert.equal(getJlptWordLevel(contract, "牛乳|ぎゅうにゅう"), 4);
    assert.equal(getJlptWordLevel(contract, "果物|くだもの"), 4);
    assert.equal(getJlptWordLevel(contract, "紅茶|こうちゃ"), 4);
    assert.equal(getJlptWordLevel(contract, "好き|すき"), 4);
    assert.equal(getJlptWordLevel(contract, "洗濯|せんたく"), 4);
    assert.equal(getJlptWordLevel(contract, "全部|ぜんぶ"), 4);
    assert.equal(getJlptWordLevel(contract, "建物|たてもの"), 4);
    assert.equal(getJlptWordLevel(contract, "手紙|てがみ"), 4);
    assert.equal(getJlptWordLevel(contract, "夏|なつ"), 4);
    assert.equal(getJlptWordLevel(contract, "番号|ばんごう"), 4);
    assert.equal(getJlptWordLevel(contract, "服|ふく"), 4);
    assert.equal(getJlptWordLevel(contract, "文章|ぶんしょう"), 4);
    assert.equal(getJlptWordLevel(contract, "便利|べんり"), 4);
    assert.equal(getJlptWordLevel(contract, "両親|りょうしん"), 4);
    assert.equal(getJlptWordLevel(contract, "お兄さん|おにいさん"), 4);
    assert.equal(getJlptWordLevel(contract, "お姉さん|おねえさん"), 4);
    assert.equal(getJlptWordLevel(contract, "青|あお"), 4);
    assert.equal(getJlptWordLevel(contract, "赤|あか"), 4);
    assert.equal(getJlptWordLevel(contract, "黄色|きいろ"), 4);
    assert.equal(getJlptWordLevel(contract, "黄色い|きいろい"), 4);
    assert.equal(getJlptWordLevel(contract, "黒|くろ"), 4);
    assert.equal(getJlptWordLevel(contract, "お手洗い|おてあらい"), 4);
    assert.equal(getJlptWordLevel(contract, "お風呂|おふろ"), 4);
    assert.equal(getJlptWordLevel(contract, "風邪|かぜ"), 4);
    assert.equal(getJlptWordLevel(contract, "花瓶|かびん"), 4);
    assert.equal(getJlptWordLevel(contract, "交番|こうばん"), 4);
    assert.equal(getJlptWordLevel(contract, "字引|じびき"), 4);
    assert.equal(getJlptWordLevel(contract, "背広|せびろ"), 4);
    assert.equal(getJlptWordLevel(contract, "近く|ちかく"), 4);
    assert.equal(getJlptWordLevel(contract, "とり肉|とりにく"), 4);
    assert.equal(getJlptWordLevel(contract, "豚肉|ぶたにく"), 4);
    assert.equal(getJlptWordLevel(contract, "門|もん"), 4);
    assert.equal(getJlptWordLevel(contract, "昨夜|ゆうべ"), 4);
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
    assert.equal(getJlptWordLevel(contract, "一枚|いちまい"), 3);
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
    assert.equal(getJlptWordLevel(contract, "貿易|ぼうえき"), 3);
    assert.equal(getJlptWordLevel(contract, "暗雲|あんうん"), 3);
    assert.equal(getJlptWordLevel(contract, "優越感|ゆうえつかん"), 3);
    assert.equal(getJlptWordLevel(contract, "越年|おつねん"), 3);
    assert.equal(getJlptWordLevel(contract, "奥義|おうぎ"), 3);
    assert.equal(getJlptWordLevel(contract, "押収|おうしゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "卵黄|らんおう"), 3);
    assert.equal(getJlptWordLevel(contract, "黄砂|こうさ"), 3);
    assert.equal(getJlptWordLevel(contract, "出荷|しゅっか"), 3);
    assert.equal(getJlptWordLevel(contract, "過程|かてい"), 3);
    assert.equal(getJlptWordLevel(contract, "解熱剤|げねつざい"), 3);
    assert.equal(getJlptWordLevel(contract, "皆無|かいむ"), 3);
    assert.equal(getJlptWordLevel(contract, "格子|こうし"), 3);
    assert.equal(getJlptWordLevel(contract, "分割|ぶんかつ"), 3);
    assert.equal(getJlptWordLevel(contract, "岩石|がんせき"), 3);
    assert.equal(getJlptWordLevel(contract, "願望|がんぼう"), 3);
    assert.equal(getJlptWordLevel(contract, "危機|きき"), 3);
    assert.equal(getJlptWordLevel(contract, "幾何学|きかがく"), 3);
    assert.equal(getJlptWordLevel(contract, "要求|ようきゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "許可|きょか"), 3);
    assert.equal(getJlptWordLevel(contract, "供養|くよう"), 3);
    assert.equal(getJlptWordLevel(contract, "関係|かんけい"), 3);
    assert.equal(getJlptWordLevel(contract, "典型|てんけい"), 3);
    assert.equal(getJlptWordLevel(contract, "不可欠|ふかけつ"), 3);
    assert.equal(getJlptWordLevel(contract, "君主|くんしゅ"), 3);
    assert.equal(getJlptWordLevel(contract, "経典|きょうてん"), 3);
    assert.equal(getJlptWordLevel(contract, "権化|ごんげ"), 3);
    assert.equal(getJlptWordLevel(contract, "相互|そうご"), 3);
    assert.equal(getJlptWordLevel(contract, "港湾|こうわん"), 3);
    assert.equal(getJlptWordLevel(contract, "以降|いこう"), 3);
    assert.equal(getJlptWordLevel(contract, "香水|こうすい"), 3);
    assert.equal(getJlptWordLevel(contract, "根拠|こんきょ"), 3);
    assert.equal(getJlptWordLevel(contract, "骨盤|こつばん"), 3);
    assert.equal(getJlptWordLevel(contract, "夫妻|ふさい"), 3);
    assert.equal(getJlptWordLevel(contract, "歳|さい"), 3);
    assert.equal(getJlptWordLevel(contract, "返済|へんさい"), 3);
    assert.equal(getJlptWordLevel(contract, "雑煮|ぞうに"), 3);
    assert.equal(getJlptWordLevel(contract, "残業|ざんぎょう"), 3);
    assert.equal(getJlptWordLevel(contract, "寺院|じいん"), 3);
    assert.equal(getJlptWordLevel(contract, "治療|ちりょう"), 3);
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
    assert.equal(getJlptWordLevel(contract, "死亡|しぼう"), 3);
    assert.equal(getJlptWordLevel(contract, "辺|へん"), 3);
    assert.equal(getJlptWordLevel(contract, "報告|ほうこく"), 3);
    assert.equal(getJlptWordLevel(contract, "忘れる|わすれる"), 3);
    assert.equal(getJlptWordLevel(contract, "捕まえる|つかまえる"), 3);
    assert.equal(getJlptWordLevel(contract, "眠い|ねむい"), 3);
    assert.equal(getJlptWordLevel(contract, "訪ねる|たずねる"), 3);
    assert.equal(getJlptWordLevel(contract, "加わる|くわわる"), 3);
    assert.equal(getJlptWordLevel(contract, "経営|けいえい"), 3);
    assert.equal(getJlptWordLevel(contract, "景気|けいき"), 3);
    assert.equal(getJlptWordLevel(contract, "経験|けいけん"), 3);
    assert.equal(getJlptWordLevel(contract, "傾向|けいこう"), 3);
    assert.equal(getJlptWordLevel(contract, "警告|けいこく"), 3);
    assert.equal(getJlptWordLevel(contract, "計算|けいさん"), 3);
    assert.equal(getJlptWordLevel(contract, "掲示|けいじ"), 3);
    assert.equal(getJlptWordLevel(contract, "芸術|げいじゅつ"), 3);
    assert.equal(getJlptWordLevel(contract, "契約|けいやく"), 3);
    assert.equal(getJlptWordLevel(contract, "経由|けいゆ"), 3);
    assert.equal(getJlptWordLevel(contract, "結果|けっか"), 3);
    assert.equal(getJlptWordLevel(contract, "欠陥|けっかん"), 3);
    assert.equal(getJlptWordLevel(contract, "欠席|けっせき"), 3);
    assert.equal(getJlptWordLevel(contract, "欠点|けってん"), 3);
    assert.equal(getJlptWordLevel(contract, "結論|けつろん"), 3);
    assert.equal(getJlptWordLevel(contract, "見解|けんかい"), 3);
    assert.equal(getJlptWordLevel(contract, "現金|げんきん"), 3);
    assert.equal(getJlptWordLevel(contract, "現在|げんざい"), 3);
    assert.equal(getJlptWordLevel(contract, "現実|げんじつ"), 3);
    assert.equal(getJlptWordLevel(contract, "現象|げんしょう"), 3);
    assert.equal(getJlptWordLevel(contract, "現状|げんじょう"), 3);
    assert.equal(getJlptWordLevel(contract, "現代|げんだい"), 3);
    assert.equal(getJlptWordLevel(contract, "見当|けんとう"), 3);
    assert.equal(getJlptWordLevel(contract, "現場|げんば"), 3);
    assert.equal(getJlptWordLevel(contract, "憲法|けんぽう"), 3);
    assert.equal(getJlptWordLevel(contract, "権利|けんり"), 3);
    assert.equal(getJlptWordLevel(contract, "幸運|こううん"), 3);
    assert.equal(getJlptWordLevel(contract, "講演|こうえん"), 3);
    assert.equal(getJlptWordLevel(contract, "効果|こうか"), 3);
    assert.equal(getJlptWordLevel(contract, "高価|こうか"), 3);
    assert.equal(getJlptWordLevel(contract, "合格|ごうかく"), 3);
    assert.equal(getJlptWordLevel(contract, "交換|こうかん"), 3);
    assert.equal(getJlptWordLevel(contract, "光景|こうけい"), 3);
    assert.equal(getJlptWordLevel(contract, "交際|こうさい"), 3);
    assert.equal(getJlptWordLevel(contract, "構成|こうせい"), 3);
    assert.equal(getJlptWordLevel(contract, "高速|こうそく"), 3);
    assert.equal(getJlptWordLevel(contract, "強盗|ごうとう"), 3);
    assert.equal(getJlptWordLevel(contract, "幸福|こうふく"), 3);
    assert.equal(getJlptWordLevel(contract, "候補|こうほ"), 3);
    assert.equal(getJlptWordLevel(contract, "越える|こえる"), 3);
    assert.equal(getJlptWordLevel(contract, "誤解|ごかい"), 3);
    assert.equal(getJlptWordLevel(contract, "呼吸|こきゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "越す|こす"), 3);
    assert.equal(getJlptWordLevel(contract, "骨折|こっせつ"), 3);
    assert.equal(getJlptWordLevel(contract, "断る|ことわる"), 3);
    assert.equal(getJlptWordLevel(contract, "殺す|ころす"), 3);
    assert.equal(getJlptWordLevel(contract, "混雑|こんざつ"), 3);
    assert.equal(getJlptWordLevel(contract, "婚約|こんやく"), 3);
    assert.equal(getJlptWordLevel(contract, "差|さ"), 3);
    assert.equal(getJlptWordLevel(contract, "際|さい"), 3);
    assert.equal(getJlptWordLevel(contract, "最高|さいこう"), 3);
    assert.equal(getJlptWordLevel(contract, "財産|ざいさん"), 3);
    assert.equal(getJlptWordLevel(contract, "最中|さいちゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "最低|さいてい"), 3);
    assert.equal(getJlptWordLevel(contract, "才能|さいのう"), 3);
    assert.equal(getJlptWordLevel(contract, "裁判|さいばん"), 3);
    assert.equal(getJlptWordLevel(contract, "幸い|さいわい"), 3);
    assert.equal(getJlptWordLevel(contract, "酒|さけ"), 3);
    assert.equal(getJlptWordLevel(contract, "支える|ささえる"), 3);
    assert.equal(getJlptWordLevel(contract, "指す|さす"), 3);
    assert.equal(getJlptWordLevel(contract, "差別|さべつ"), 3);
    assert.equal(getJlptWordLevel(contract, "作法|さほう"), 3);
    assert.equal(getJlptWordLevel(contract, "覚ます|さます"), 3);
    assert.equal(getJlptWordLevel(contract, "覚める|さめる"), 3);
    assert.equal(getJlptWordLevel(contract, "更に|さらに"), 3);
    assert.equal(getJlptWordLevel(contract, "参加|さんか"), 3);
    assert.equal(getJlptWordLevel(contract, "散歩|さんぽ"), 3);
    assert.equal(getJlptWordLevel(contract, "幸せ|しあわせ"), 3);
    assert.equal(getJlptWordLevel(contract, "ジェット機|ジェットき"), 3);
    assert.equal(getJlptWordLevel(contract, "直に|じかに"), 3);
    assert.equal(getJlptWordLevel(contract, "式|しき"), 3);
    assert.equal(getJlptWordLevel(contract, "支給|しきゅう"), 3);
    assert.equal(getJlptWordLevel(contract, "資源|しげん"), 3);
    assert.equal(getJlptWordLevel(contract, "事件|じけん"), 3);
    assert.equal(getJlptWordLevel(contract, "時刻|じこく"), 3);
    assert.equal(getJlptWordLevel(contract, "自殺|じさつ"), 3);
    assert.equal(getJlptWordLevel(contract, "事実|じじつ"), 3);
    assert.equal(getJlptWordLevel(contract, "支出|ししゅつ"), 3);
    assert.equal(getJlptWordLevel(contract, "思想|しそう"), 3);
    assert.equal(getJlptWordLevel(contract, "失業|しつぎょう"), 3);
    assert.equal(getJlptWordLevel(contract, "実験|じっけん"), 3);
    assert.equal(getJlptWordLevel(contract, "実現|じつげん"), 3);
    assert.equal(getJlptWordLevel(contract, "実行|じっこう"), 3);
    assert.equal(getJlptWordLevel(contract, "実際|じっさい"), 3);
    assert.equal(getJlptWordLevel(contract, "実施|じっし"), 3);
    assert.equal(getJlptWordLevel(contract, "実に|じつに"), 3);
    assert.equal(getJlptWordLevel(contract, "実は|じつは"), 3);
    assert.equal(getJlptWordLevel(contract, "失望|しつぼう"), 3);
    assert.equal(getJlptWordLevel(contract, "支店|してん"), 3);
    assert.equal(getJlptWordLevel(contract, "指導|しどう"), 3);
    assert.equal(getJlptWordLevel(contract, "支配|しはい"), 3);
    assert.equal(getJlptWordLevel(contract, "支払|しはらい"), 3);
    assert.equal(getJlptWordLevel(contract, "支払う|しはらう"), 3);
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
    assert.equal(getJlptWordLevel(contract, "お弁当|おべんとう"), 3);
    assert.equal(getJlptWordLevel(contract, "泳ぐ|およぐ"), 2);
    assert.equal(getJlptWordLevel(contract, "鉛筆|えんぴつ"), 2);
    assert.equal(getJlptWordLevel(contract, "塩|しお"), 2);
    assert.equal(getJlptWordLevel(contract, "奥さん|おくさん"), 3);
    assert.equal(getJlptWordLevel(contract, "温い|ぬるい"), 3);
    assert.equal(getJlptWordLevel(contract, "暇|ひま"), 1);
    assert.equal(getJlptWordLevel(contract, "灰皿|はいざら"), 2);
    assert.equal(getJlptWordLevel(contract, "皆さん|みなさん"), 3);
    assert.equal(getJlptWordLevel(contract, "階段|かいだん"), 3);
    assert.equal(getJlptWordLevel(contract, "角|かど"), 2);
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
