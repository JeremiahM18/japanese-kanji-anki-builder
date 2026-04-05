const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");

function normalizeForSearch(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[\s　（）()／・、。,.-]/g, "");
}

function getTrackedN1BatchPaths() {
    return fs.readdirSync(path.join(process.cwd(), "templates"))
        .filter((name) => /^starter_curated_study_data_n1_batch_\d+\.json$/.test(name))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(process.cwd(), "templates", name));
}

test("tracked starter curated N3-N5 entries keep required learner-facing quality metadata", () => {
    const starterPath = path.join(process.cwd(), "templates", "starter_curated_study_data.json");
    const starterData = JSON.parse(fs.readFileSync(starterPath, "utf8"));

    for (const [kanji, entry] of Object.entries(starterData)) {
        if (![3, 4, 5].includes(entry?.jlpt)) {
            continue;
        }

        assert.equal(entry.source, "starter-curated", `${kanji}: source should stay starter-curated`);
        assert.ok(entry.tags.includes("starter"), `${kanji}: tags should include starter`);
        assert.ok(entry.tags.includes(`n${entry.jlpt}`), `${kanji}: tags should include n${entry.jlpt}`);
        assert.ok(Array.isArray(entry.preferredWords) && entry.preferredWords.length > 0, `${kanji}: should have preferred words`);
        assert.ok(String(entry.englishMeaning || "").trim().length > 0, `${kanji}: meaning should be present`);
        assert.ok(String(entry.notes || "").trim().length > 0, `${kanji}: notes should be present`);
        assert.ok(String(entry.exampleSentence?.japanese || "").trim().length > 0, `${kanji}: example Japanese should be present`);
        assert.ok(String(entry.exampleSentence?.reading || "").trim().length > 0, `${kanji}: example reading should be present`);
        assert.ok(String(entry.exampleSentence?.english || "").trim().length > 0, `${kanji}: example English should be present`);
        assert.ok(String(entry.exampleSentence.japanese).length <= 30, `${kanji}: example sentence should stay concise for learners`);
        assert.ok(!String(entry.notes).includes("Offline preview built from local data only."), `${kanji}: notes should never fall back to the generic offline placeholder`);

        const normalizedNotes = normalizeForSearch(entry.notes);
        const mentionsPreferredWord = entry.preferredWords.some((word) => normalizedNotes.includes(normalizeForSearch(word)));
        assert.ok(mentionsPreferredWord, `${kanji}: notes should mention at least one preferred word`);
    }
});

test("tracked starter curated N1 batch entries keep required learner-facing quality metadata", () => {
    const starterPaths = getTrackedN1BatchPaths();

    assert.ok(starterPaths.length >= 1, "expected at least one tracked N1 batch file");

    for (const starterPath of starterPaths) {
        const starterData = JSON.parse(fs.readFileSync(starterPath, "utf8"));
        const entryCount = Object.keys(starterData).length;

        assert.ok(entryCount >= 6 && entryCount <= 8, `${path.basename(starterPath)}: batch should stay within the 6-8 kanji workflow`);

        for (const [kanji, entry] of Object.entries(starterData)) {
            assert.equal(entry.source, "starter-curated", `${kanji}: source should stay starter-curated`);
            assert.equal(entry.jlpt, 1, `${kanji}: batch should stay N1`);
            assert.ok(entry.tags.includes("starter"), `${kanji}: tags should include starter`);
            assert.ok(entry.tags.includes("n1"), `${kanji}: tags should include n1`);
            assert.ok(Array.isArray(entry.preferredWords) && entry.preferredWords.length > 0, `${kanji}: should have preferred words`);
            assert.ok(String(entry.displayWord?.written || "").trim().length > 0, `${kanji}: display word should be present`);
            assert.ok(String(entry.displayWord?.pron || "").trim().length > 0, `${kanji}: display reading should be present`);
            assert.ok(String(entry.englishMeaning || "").trim().length > 0, `${kanji}: meaning should be present`);
            assert.ok(String(entry.notes || "").trim().length > 0, `${kanji}: notes should be present`);
            assert.ok(String(entry.exampleSentence?.japanese || "").trim().length > 0, `${kanji}: example Japanese should be present`);
            assert.ok(String(entry.exampleSentence?.reading || "").trim().length > 0, `${kanji}: example reading should be present`);
            assert.ok(String(entry.exampleSentence?.english || "").trim().length > 0, `${kanji}: example English should be present`);
            assert.ok(String(entry.exampleSentence.japanese).length <= 30, `${kanji}: example sentence should stay concise for learners`);
            assert.ok(!String(entry.notes).includes("Offline preview built from local data only."), `${kanji}: notes should never fall back to the generic offline placeholder`);

            const normalizedNotes = normalizeForSearch(entry.notes);
            const mentionsPreferredWord = entry.preferredWords.some((word) => normalizedNotes.includes(normalizeForSearch(word)));
            assert.ok(mentionsPreferredWord, `${kanji}: notes should mention at least one preferred word`);
        }
    }
});

test("resolved curated N3-N5 entries keep selected learner-facing editorial choices stable", () => {
    const curatedStudyData = loadCuratedStudyData(path.join(process.cwd(), "data", "curated_study_data.json"));

    assert.deepEqual(curatedStudyData["便"].displayWord, { written: "便利", pron: "べんり" });
    assert.equal(curatedStudyData["便"].englishMeaning, "convenience / mail service");
    assert.deepEqual(curatedStudyData["便"].preferredWords, ["便利", "郵便"]);

    assert.deepEqual(curatedStudyData["情"].displayWord, { written: "事情", pron: "じじょう" });
    assert.equal(curatedStudyData["情"].englishMeaning, "situation / emotion");
    assert.deepEqual(curatedStudyData["情"].preferredWords, ["事情", "感情", "愛情"]);

    assert.deepEqual(curatedStudyData["成"].displayWord, { written: "成功", pron: "せいこう" });
    assert.equal(curatedStudyData["成"].englishMeaning, "succeed / become / complete");

    assert.equal(curatedStudyData["役"].englishMeaning, "role / usefulness");
    assert.deepEqual(curatedStudyData["役"].preferredWords, ["役に立つ", "役目", "役所"]);

    assert.deepEqual(curatedStudyData["居"].displayWord, { written: "居る", pron: "いる" });
    assert.deepEqual(curatedStudyData["居"].preferredWords, ["居る", "居間", "居場所"]);

    assert.deepEqual(curatedStudyData["常"].displayWord, { written: "常に", pron: "つねに" });
    assert.equal(curatedStudyData["常"].englishMeaning, "usual / always / constant");

    assert.equal(curatedStudyData["師"].englishMeaning, "specialist / teacher");

    assert.deepEqual(curatedStudyData["係"].preferredWords, ["係", "係員", "関係"]);
    assert.equal(curatedStudyData["係"].englishMeaning, "person in charge / relation");

    assert.equal(curatedStudyData["処"].englishMeaning, "handle / place");
    assert.ok(curatedStudyData["処"].notes.includes("処 （ところ） - place"));

    assert.equal(curatedStudyData["暮"].englishMeaning, "live / dusk / year end");
    assert.deepEqual(curatedStudyData["暮"].preferredWords, ["暮らす", "日暮れ", "暮れ"]);

    assert.equal(curatedStudyData["偶"].preferredWords.length, 2);
    assert.deepEqual(curatedStudyData["偶"].preferredWords, ["偶然", "偶数"]);

    assert.deepEqual(curatedStudyData["回"].displayWord, { written: "今回", pron: "こんかい" });
    assert.equal(curatedStudyData["回"].englishMeaning, "time / occurrence");

    assert.equal(curatedStudyData["君"].englishMeaning, "you (informal)");
    assert.deepEqual(curatedStudyData["君"].preferredWords, ["君", "君たち"]);

    assert.deepEqual(curatedStudyData["愛"].displayWord, { written: "愛情", pron: "あいじょう" });
    assert.equal(curatedStudyData["愛"].englishMeaning, "affection / love");

    assert.deepEqual(curatedStudyData["客"].displayWord, { written: "お客さん", pron: "おきゃくさん" });
    assert.deepEqual(curatedStudyData["客"].preferredWords, ["お客さん", "乗客"]);

    assert.deepEqual(curatedStudyData["列"].displayWord, { written: "行列", pron: "ぎょうれつ" });
    assert.deepEqual(curatedStudyData["列"].preferredWords, ["行列", "列"]);

    assert.deepEqual(curatedStudyData["富"].displayWord, { written: "豊富", pron: "ほうふ" });
    assert.equal(curatedStudyData["富"].englishMeaning, "abundant / wealth");

    assert.deepEqual(curatedStudyData["以"].displayWord, { written: "以内", pron: "いない" });
    assert.equal(curatedStudyData["以"].englishMeaning, "within / from");

    assert.deepEqual(curatedStudyData["医"].displayWord, { written: "医者", pron: "いしゃ" });
    assert.equal(curatedStudyData["医"].englishMeaning, "doctor / medicine");

    assert.deepEqual(curatedStudyData["員"].displayWord, { written: "店員", pron: "てんいん" });
    assert.deepEqual(curatedStudyData["員"].preferredWords, ["店員", "会社員", "会員"]);

    assert.deepEqual(curatedStudyData["映"].displayWord, { written: "映画", pron: "えいが" });
    assert.equal(curatedStudyData["映"].englishMeaning, "movie / reflect");

    assert.deepEqual(curatedStudyData["画"].displayWord, { written: "計画", pron: "けいかく" });
    assert.equal(curatedStudyData["画"].englishMeaning, "plan / picture");

    assert.deepEqual(curatedStudyData["銀"].displayWord, { written: "銀行", pron: "ぎんこう" });
    assert.equal(curatedStudyData["銀"].englishMeaning, "bank / silver");

    assert.deepEqual(curatedStudyData["局"].displayWord, { written: "郵便局", pron: "ゆうびんきょく" });
    assert.deepEqual(curatedStudyData["局"].preferredWords, ["郵便局", "放送局"]);

    assert.deepEqual(curatedStudyData["来"].preferredWords, ["来る", "来週"]);
    assert.equal(curatedStudyData["来"].notes, "来る （くる） - come ／ 来週 （らいしゅう） - next week");

    assert.deepEqual(curatedStudyData["読"].preferredWords, ["読む", "読書"]);
    assert.equal(curatedStudyData["読"].notes, "読む （よむ） - read ／ 読書 （どくしょ） - reading");

    assert.deepEqual(curatedStudyData["話"].preferredWords, ["話す", "会話"]);
    assert.equal(curatedStudyData["話"].notes, "話す （はなす） - speak / talk ／ 会話 （かいわ） - conversation");

    assert.equal(curatedStudyData["水"].notes, "水 （みず） - water ／ 水曜日 （すいようび） - Wednesday");

    assert.deepEqual(curatedStudyData["天"].displayWord, { written: "天気", pron: "てんき" });
    assert.equal(curatedStudyData["天"].englishMeaning, "weather / sky");

    assert.deepEqual(curatedStudyData["候"].displayWord, { written: "気候", pron: "きこう" });
    assert.equal(curatedStudyData["候"].englishMeaning, "season / climate");

    assert.deepEqual(curatedStudyData["晴"].displayWord, { written: "晴れる", pron: "はれる" });
    assert.equal(curatedStudyData["晴"].englishMeaning, "clear up / sunny");
});

test("resolved tracked N1 batch entries keep selected learner-facing editorial choices stable", () => {
    const curatedStudyData = loadCuratedStudyData(path.join(process.cwd(), "data", "curated_study_data.json"));

    assert.deepEqual(curatedStudyData["賀"].displayWord, { written: "年賀状", pron: "ねんがじょう" });
    assert.deepEqual(curatedStudyData["購"].displayWord, { written: "購入", pron: "こうにゅう" });
    assert.deepEqual(curatedStudyData["謝"].preferredWords, ["感謝", "謝罪", "謝る"]);
    assert.equal(curatedStudyData["趣"].englishMeaning, "interest / hobby / gist");
    assert.equal(curatedStudyData["需"].notes, "需要 （じゅよう） - demand ／ 需給 （じゅきゅう） - supply and demand ／ 必需品 （ひつじゅひん） - necessities");
    assert.equal(curatedStudyData["穏"].exampleSentence.japanese, "海は一日中穏やかだった。");
    assert.equal(curatedStudyData["巡"].exampleSentence.english, "I walked along the riverside path that circles the area.");
    assert.equal(curatedStudyData["祉"].englishMeaning, "welfare / well-being");
    assert.deepEqual(curatedStudyData["素"].displayWord, { written: "素晴らしい", pron: "すばらしい" });
    assert.equal(curatedStudyData["策"].notes, "対策 （たいさく） - countermeasure / step ／ 政策 （せいさく） - policy ／ 作戦 （さくせん） - strategy / operation");
    assert.equal(curatedStudyData["節"].exampleSentence.japanese, "この季節は朝晩が冷えます。");
    assert.deepEqual(curatedStudyData["紀"].preferredWords, ["世紀", "紀元", "紀行"]);
    assert.equal(curatedStudyData["統"].englishMeaning, "unite / control / govern");
    assert.deepEqual(curatedStudyData["縁"].displayWord, { written: "縁", pron: "えん" });
    assert.deepEqual(curatedStudyData["締"].preferredWords, ["締切", "引き締める", "取締"]);
    assert.equal(curatedStudyData["縮"].exampleSentence.english, "We shortened the meeting to thirty minutes.");
    assert.deepEqual(curatedStudyData["納"].displayWord, { written: "納得", pron: "なっとく" });
    assert.deepEqual(curatedStudyData["結"].preferredWords, ["結ぶ", "結婚", "結局"]);
    assert.equal(curatedStudyData["維"].notes, "維持 （いじ） - maintain / preserve ／ 繊維 （せんい） - fiber ／ 維新 （いしん） - restoration / reform");
    assert.equal(curatedStudyData["緩"].exampleSentence.japanese, "坂は頂上に近いほど緩やかになる。");
    assert.deepEqual(curatedStudyData["縦"].displayWord, { written: "縦", pron: "たて" });
    assert.equal(curatedStudyData["織"].englishMeaning, "weave / organization / fabric");
    assert.deepEqual(curatedStudyData["磁"].preferredWords, ["磁石", "磁気", "磁場"]);
    assert.equal(curatedStudyData["秘"].exampleSentence.english, "That plan remained secret until the end.");
    assert.deepEqual(curatedStudyData["級"].displayWord, { written: "高級", pron: "こうきゅう" });
    assert.equal(curatedStudyData["系"].notes, "体系 （たいけい） - system / framework ／ 系統 （けいとう） - system / line ／ 家系 （かけい） - family line");
    assert.deepEqual(curatedStudyData["請"].preferredWords, ["請求", "要請", "申請"]);
    assert.equal(curatedStudyData["診"].exampleSentence.japanese, "医師の診断を受けて安心した。");
    assert.deepEqual(curatedStudyData["閲"].displayWord, { written: "閲覧", pron: "えつらん" });
    assert.equal(curatedStudyData["覧"].englishMeaning, "look / view / peruse");
    assert.deepEqual(curatedStudyData["聖"].preferredWords, ["神聖", "聖書", "聖地"]);
    assert.equal(curatedStudyData["紫"].exampleSentence.english, "The evening sky looked light purple.");
    assert.deepEqual(curatedStudyData["詠"].displayWord, { written: "詠う", pron: "うたう" });
    assert.deepEqual(curatedStudyData["票"].preferredWords, ["投票", "票", "伝票"]);
    assert.equal(curatedStudyData["禅"].notes, "禅 （ぜん） - Zen ／ 座禅 （ざぜん） - seated meditation ／ 禅寺 （ぜんでら） - Zen temple");
    assert.equal(curatedStudyData["禍"].exampleSentence.english, "A small lapse invited a major disaster.");
    assert.deepEqual(curatedStudyData["稀"].displayWord, { written: "稀", pron: "まれ" });
    assert.equal(curatedStudyData["稲"].exampleSentence.japanese, "秋の田んぼで稲が風に揺れていた。");
    assert.deepEqual(curatedStudyData["穂"].preferredWords, ["穂", "稲穂"]);
    assert.equal(curatedStudyData["碁"].englishMeaning, "go board game");
    assert.deepEqual(curatedStudyData["謡"].displayWord, { written: "謡う", pron: "うたう" });
    assert.equal(curatedStudyData["顕"].notes, "顕著 （けんちょ） - remarkable / noticeable ／ 顕在 （けんざい） - become apparent ／ 顕微鏡 （けんびきょう） - microscope");
    assert.deepEqual(curatedStudyData["肝"].preferredWords, ["肝心", "肝", "肝臓"]);
    assert.equal(curatedStudyData["紋"].exampleSentence.english, "The fabric pattern stood out beautifully in the light.");
    assert.deepEqual(curatedStudyData["絞"].displayWord, { written: "絞る", pron: "しぼる" });
    assert.equal(curatedStudyData["縫"].exampleSentence.japanese, "ほつれた所を丁寧に縫い直した。");
    assert.deepEqual(curatedStudyData["繁"].preferredWords, ["繁忙", "繁栄", "頻繁"]);
    assert.equal(curatedStudyData["臭"].englishMeaning, "smell / odor / stinking");
    assert.deepEqual(curatedStudyData["郷"].displayWord, { written: "故郷", pron: "ふるさと" });
    assert.equal(curatedStudyData["鎮"].notes, "鎮める （しずめる） - calm / suppress ／ 鎮静 （ちんせい） - calming / sedation ／ 鎮火 （ちんか） - extinguishing a fire");
    assert.deepEqual(curatedStudyData["附"].preferredWords, ["附録", "附属", "附記"]);
    assert.equal(curatedStudyData["詩"].exampleSentence.english, "I read a short poem aloud.");
    assert.deepEqual(curatedStudyData["瞳"].displayWord, { written: "瞳", pron: "ひとみ" });
    assert.equal(curatedStudyData["謹"].englishMeaning, "be respectful / be humble / reverent");
    assert.deepEqual(curatedStudyData["跳"].preferredWords, ["跳ぶ", "跳ねる", "跳躍"]);
    assert.equal(curatedStudyData["軸"].exampleSentence.japanese, "話の軸が最後までぶれなかった。");
    assert.deepEqual(curatedStudyData["穴"].displayWord, { written: "穴", pron: "あな" });
    assert.equal(curatedStudyData["笛"].notes, "笛 （ふえ） - flute ／ 汽笛 （きてき） - steam whistle ／ 口笛 （くちぶえ） - whistle");
    assert.deepEqual(curatedStudyData["筋"].preferredWords, ["筋", "筋道", "筋肉"]);
    assert.equal(curatedStudyData["紺"].exampleSentence.english, "The navy jacket creates a calm impression.");
    assert.deepEqual(curatedStudyData["絹"].displayWord, { written: "絹", pron: "きぬ" });
    assert.equal(curatedStudyData["綱"].englishMeaning, "rope / cord / main line");
    assert.deepEqual(curatedStudyData["融"].preferredWords, ["融ける", "金融", "融通"]);
    assert.equal(curatedStudyData["露"].exampleSentence.japanese, "草の先に朝露が静かに残っていた。");
    assert.deepEqual(curatedStudyData["網"].displayWord, { written: "網", pron: "あみ" });
    assert.equal(curatedStudyData["縄"].notes, "縄 （なわ） - rope ／ 縄跳び （なわとび） - jump rope ／ 縄文 （じょうもん） - Jomon period / cord-marked pattern");
    assert.deepEqual(curatedStudyData["羊"].preferredWords, ["羊", "羊毛", "羊肉"]);
    assert.equal(curatedStudyData["肺"].exampleSentence.english, "I underwent a test to examine the condition of my lungs.");
    assert.deepEqual(curatedStudyData["舌"].displayWord, { written: "舌", pron: "した" });
    assert.equal(curatedStudyData["訳"].englishMeaning, "reason / meaning / translate");
    assert.deepEqual(curatedStudyData["証"].preferredWords, ["証拠", "証明", "保証"]);
    assert.equal(curatedStudyData["評"].exampleSentence.japanese, "新しい企画は高い評価を受けた。");
    assert.deepEqual(curatedStudyData["街"].displayWord, { written: "街", pron: "まち" });
    assert.equal(curatedStudyData["邦"].notes, "邦画 （ほうが） - Japanese film ／ 邦人 （ほうじん） - fellow countryman ／ 友邦 （ゆうほう） - friendly nation");
    assert.deepEqual(curatedStudyData["邸"].preferredWords, ["官邸", "公邸", "邸宅"]);
    assert.equal(curatedStudyData["裸"].exampleSentence.english, "The child was running barefoot along the beach.");
    assert.deepEqual(curatedStudyData["虹"].displayWord, { written: "虹", pron: "にじ" });
    assert.equal(curatedStudyData["蛇"].englishMeaning, "snake");
    assert.deepEqual(curatedStudyData["菊"].preferredWords, ["菊", "菊花", "白菊"]);
    assert.equal(curatedStudyData["苗"].exampleSentence.japanese, "田んぼに新しい苗が並んで植えられた。");
    assert.deepEqual(curatedStudyData["瞬"].displayWord, { written: "一瞬", pron: "いっしゅん" });
    assert.equal(curatedStudyData["瞭"].notes, "明瞭 （めいりょう） - clear / definite ／ 瞭然 （りょうぜん） - obvious / evident ／ 不明瞭 （ふめいりょう） - unclear");
    assert.deepEqual(curatedStudyData["響"].preferredWords, ["響く", "反響", "音響"]);
    assert.equal(curatedStudyData["魂"].exampleSentence.english, "That performance was filled with strong spirit.");
    assert.deepEqual(curatedStudyData["鈴"].displayWord, { written: "鈴", pron: "すず" });
    assert.equal(curatedStudyData["鎖"].englishMeaning, "chain / link / shackle");
    assert.deepEqual(curatedStudyData["雷"].preferredWords, ["雷", "落雷", "雷雨"]);
    assert.equal(curatedStudyData["霧"].exampleSentence.japanese, "朝の霧で山道が白く包まれていた。");
    assert.deepEqual(curatedStudyData["虎"].displayWord, { written: "虎", pron: "とら" });
    assert.equal(curatedStudyData["蚊"].notes, "蚊 （か） - mosquito ／ 蚊取り線香 （かとりせんこう） - mosquito coil ／ 蚊帳 （かや） - mosquito net");
    assert.deepEqual(curatedStudyData["蝶"].preferredWords, ["蝶", "蝶々", "胡蝶"]);
    assert.equal(curatedStudyData["鐘"].exampleSentence.english, "The temple bell was echoing at dusk.");
    assert.deepEqual(curatedStudyData["鏡"].displayWord, { written: "鏡", pron: "かがみ" });
    assert.equal(curatedStudyData["鉢"].englishMeaning, "bowl / pot");
    assert.deepEqual(curatedStudyData["酢"].preferredWords, ["酢", "酢の物", "黒酢"]);
    assert.equal(curatedStudyData["隣"].exampleSentence.japanese, "隣の席の人が静かに本を読んでいた。");
    assert.deepEqual(curatedStudyData["雄"].displayWord, { written: "雄", pron: "おす" });
    assert.equal(curatedStudyData["雌"].notes, "雌 （めす） - female ／ 雌花 （しか） - female flower ／ 雌鳥 （めんどり） - hen");
    assert.deepEqual(curatedStudyData["釣"].preferredWords, ["釣る", "釣り", "釣り糸"]);
    assert.equal(curatedStudyData["酸"].exampleSentence.english, "That fruit was more sour than I expected.");
    assert.deepEqual(curatedStudyData["鉛"].displayWord, { written: "鉛", pron: "なまり" });
    assert.equal(curatedStudyData["霞"].englishMeaning, "haze / mist");
    assert.deepEqual(curatedStudyData["霜"].preferredWords, ["霜", "霜柱", "霜降り"]);
    assert.equal(curatedStudyData["墨"].exampleSentence.japanese, "半紙に墨の香りが静かに広がった。");
    assert.deepEqual(curatedStudyData["芽"].displayWord, { written: "芽", pron: "め" });
    assert.equal(curatedStudyData["茎"].notes, "茎 （くき） - stem / stalk ／ 花茎 （かけい） - flower stalk ／ 地下茎 （ちかけい） - rhizome");
    assert.deepEqual(curatedStudyData["薫"].preferredWords, ["薫る", "薫り", "薫風"]);
    assert.equal(curatedStudyData["鳩"].exampleSentence.english, "A pigeon in the park was walking near people's feet.");
    assert.deepEqual(curatedStudyData["鶴"].displayWord, { written: "鶴", pron: "つる" });
    assert.equal(curatedStudyData["鯨"].englishMeaning, "whale");
    assert.deepEqual(curatedStudyData["雛"].preferredWords, ["雛", "雛鳥", "雛人形"]);
    assert.equal(curatedStudyData["苑"].exampleSentence.japanese, "静かな苑を歩くと心が落ち着いた。");
});
