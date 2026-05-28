const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");

const repoRootDir = path.resolve(__dirname, "..");
const templatesDir = path.join(repoRootDir, "templates");
const dataDir = path.join(repoRootDir, "data");

function normalizeForSearch(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[\s　（）()／・、。,.-]/g, "");
}

function getTrackedN1BatchPaths() {
    return fs.readdirSync(templatesDir)
        .filter((name) => /^starter_curated_study_data_n1_batch_\d+\.json$/.test(name))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(templatesDir, name));
}

test("tracked starter curated N3-N5 entries keep required learner-facing quality metadata", () => {
    const starterPath = path.join(templatesDir, "starter_curated_study_data.json");
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

test("tracked N2 parked review entries use individual-kanji primary anchors", () => {
    const starterPath = path.join(templatesDir, "starter_curated_study_data.json");
    const starterData = JSON.parse(fs.readFileSync(starterPath, "utf8"));

    assert.deepEqual(starterData["岸"].displayWord, { written: "岸", pron: "きし" });
    assert.equal(starterData["岸"].exampleSentence.japanese, "川の岸に小さな花が咲いています。");
    assert.deepEqual(starterData["喫"].displayWord, { written: "喫", pron: "きつ" });
    assert.match(starterData["喫"].notes, /喫茶店/);
    assert.deepEqual(starterData["舟"].displayWord, { written: "舟", pron: "ふね" });
    assert.deepEqual(starterData["召"].displayWord, { written: "召す", pron: "めす" });
    assert.deepEqual(starterData["省"].displayWord, { written: "省く", pron: "はぶく" });
    assert.deepEqual(starterData["泉"].displayWord, { written: "泉", pron: "いずみ" });
    assert.deepEqual(starterData["帯"].displayWord, { written: "帯", pron: "おび" });
});

test("tracked N2 review entries avoid compound-led primary anchors and noisy meanings", () => {
    const starterPath = path.join(templatesDir, "starter_curated_study_data.json");
    const starterData = JSON.parse(fs.readFileSync(starterPath, "utf8"));

    assert.deepEqual(starterData["滴"].displayWord, { written: "滴", pron: "しずく" });
    assert.equal(starterData["滴"].exampleSentence.japanese, "葉の先に小さな滴が光っていました。");
    assert.deepEqual(starterData["湯"].displayWord, { written: "湯", pron: "ゆ" });
    assert.equal(starterData["湯"].exampleSentence.japanese, "カップに湯を注いでください。");
    assert.deepEqual(starterData["灯"].displayWord, { written: "灯り", pron: "あかり" });
    assert.equal(starterData["灯"].exampleSentence.japanese, "暗い道に家の灯りが見えました。");
    assert.deepEqual(starterData["筒"].displayWord, { written: "筒", pron: "つつ" });
    assert.equal(starterData["筒"].exampleSentence.japanese, "紙を丸めて筒の形にしました。");
    assert.deepEqual(starterData["板"].displayWord, { written: "板", pron: "いた" });
    assert.equal(starterData["板"].exampleSentence.japanese, "古い板を使って棚を作りました。");
    assert.deepEqual(starterData["筆"].displayWord, { written: "筆", pron: "ふで" });
    assert.equal(starterData["筆"].exampleSentence.japanese, "筆で大きな字を書きました。");
    assert.deepEqual(starterData["粉"].displayWord, { written: "粉", pron: "こな" });
    assert.equal(starterData["粉"].exampleSentence.japanese, "白い粉が机の上にこぼれました。");
    assert.deepEqual(starterData["辺"].displayWord, { written: "辺", pron: "へん" });
    assert.equal(starterData["辺"].notes, "辺 （へん） - area / side ／ この辺 （このへん） - around here ／ 周辺 （しゅうへん） - surrounding area ／ 海辺 （うみべ） - seaside");
    assert.deepEqual(starterData["符"].displayWord, { written: "符", pron: "ふ" });
    assert.deepEqual(starterData["符"].breakdownDisplayWord, { written: "符", pron: "ふ" });
    assert.deepEqual(starterData["符"].breakdownOverrides, [
        {
            matchWord: "切符",
            displayWord: { written: "符", pron: "ぷ" },
            englishMeaning: "sign / token",
        },
    ]);
    assert.deepEqual(starterData["浴"].displayWord, { written: "浴びる", pron: "あびる" });
    assert.deepEqual(starterData["絡"].displayWord, { written: "絡む", pron: "からむ" });
    assert.deepEqual(starterData["綿"].displayWord, { written: "綿", pron: "わた" });
    assert.deepEqual(starterData["輪"].displayWord, { written: "輪", pron: "わ" });
    assert.deepEqual(starterData["零"].displayWord, { written: "零", pron: "れい" });

    assert.deepEqual(starterData["匹"].blockedMeanings, ["equal", "head", "roll of cloth"]);
    assert.deepEqual(starterData["土"].blockedMeanings, ["Turkey"]);
    assert.deepEqual(starterData["中"].blockedMeanings, ["mean"]);
    assert.deepEqual(starterData["休"].blockedMeanings, ["retire", "sleep"]);
    assert.deepEqual(starterData["先"].blockedMeanings, ["precedence"]);
    assert.deepEqual(starterData["出"].blockedMeanings, ["protrude"]);
    assert.deepEqual(starterData["午"].blockedMeanings, [
        "seventh sign of Chinese zodiac",
        "sign of the horse",
    ]);
    assert.deepEqual(starterData["半"].blockedMeanings, ["odd number", "part-", "semi-"]);
    assert.deepEqual(starterData["底"].blockedMeanings, ["bottom price", "kind", "sort"]);
    assert.deepEqual(starterData["灯"].blockedMeanings, ["counter for lights"]);
    assert.deepEqual(starterData["筒"].blockedMeanings, ["gun barrel", "sleeve"]);
    assert.deepEqual(starterData["貯"].blockedMeanings, ["wear mustache"]);
    assert.deepEqual(starterData["比"].blockedMeanings, ["Philippines", "race"]);
    assert.deepEqual(starterData["波"].blockedMeanings, ["Poland", "billows", "waves"]);
    assert.deepEqual(starterData["般"].blockedMeanings, ["carrier", "carry"]);
    assert.deepEqual(starterData["薄"].blockedMeanings, ["pampas grass", "weak (tea)"]);
    assert.deepEqual(starterData["被"].blockedMeanings, [
        "be exposed (film)",
        "brood over",
        "cover",
        "put on",
        "receiving",
        "shelter",
        "veil",
        "wear",
    ]);
    assert.deepEqual(starterData["募"].blockedMeanings, ["campaign", "enlist", "gather (contributions)", "grow violent"]);
    assert.deepEqual(starterData["幅"].blockedMeanings, ["hanging scroll"]);
    assert.deepEqual(starterData["府"].blockedMeanings, ["borough", "govt office", "representative body", "storehouse"]);
    assert.deepEqual(starterData["普"].blockedMeanings, ["Prussia", "wide(ly)"]);
    assert.deepEqual(starterData["暴"].blockedMeanings, ["cruelty", "force", "fret", "outburst", "outrage", "rave"]);
    assert.deepEqual(starterData["沸"].blockedMeanings, ["breed", "ferment", "seethe", "uproar"]);
    assert.deepEqual(starterData["符"].blockedMeanings, ["charm", "mark", "tally"]);
    assert.deepEqual(starterData["編"].blockedMeanings, ["braid", "completed poem", "part of a book", "plait", "twist"]);
    assert.deepEqual(starterData["膚"].blockedMeanings, ["body", "disposition", "grain", "texture"]);
    assert.deepEqual(starterData["領"].blockedMeanings, ["collar"]);
});

test("tracked starter curated N1 batch entries keep required learner-facing quality metadata", () => {
    const starterPaths = getTrackedN1BatchPaths();
    const finalBatchPath = starterPaths.at(-1);

    assert.ok(starterPaths.length >= 1, "expected at least one tracked N1 batch file");

    for (const starterPath of starterPaths) {
        const starterData = JSON.parse(fs.readFileSync(starterPath, "utf8"));
        const entryCount = Object.keys(starterData).length;
        const isFinalCloseoutBatch = starterPath === finalBatchPath;

        if (isFinalCloseoutBatch) {
            assert.ok(
                entryCount >= 1 && entryCount <= 8,
                `${path.basename(starterPath)}: final closeout batch should stay within 1-8 kanji`
            );
        } else {
            assert.ok(entryCount >= 6 && entryCount <= 8, `${path.basename(starterPath)}: batch should stay within the 6-8 kanji workflow`);
        }

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
    const curatedStudyData = loadCuratedStudyData(path.join(dataDir, "__tracked_starter_only__.json"), {
        starterPath: path.join(templatesDir, "starter_curated_study_data.json"),
    });

    assert.deepEqual(curatedStudyData["便"].displayWord, { written: "便利", pron: "べんり" });
    assert.equal(curatedStudyData["便"].englishMeaning, "convenience / mail service");
    assert.deepEqual(curatedStudyData["便"].preferredWords, ["便利", "郵便"]);
    assert.deepEqual(curatedStudyData["不"].blockedMeanings, ["bad", "clumsy", "ugly"]);
    assert.deepEqual(curatedStudyData["世"].blockedMeanings, ["public"]);
    assert.equal(curatedStudyData["世"].exampleSentence.english, "It is a big world.");
    assert.deepEqual(curatedStudyData["主"].blockedMeanings, ["lord", "main thing", "master", "principal"]);
    assert.deepEqual(curatedStudyData["乗"].blockedMeanings, ["counter for vehicles", "join", "multiplication", "power", "record"]);
    assert.deepEqual(curatedStudyData["事"].blockedMeanings, ["possibly", "reason"]);
    assert.deepEqual(curatedStudyData["仕"].displayWord, { written: "仕", pron: "し" });
    assert.deepEqual(curatedStudyData["仕"].blockedMeanings, ["official"]);
    assert.deepEqual(curatedStudyData["代"].blockedMeanings, ["change", "charge", "convert", "counter for decades of ages, eras, etc.", "period", "rate"]);
    assert.deepEqual(curatedStudyData["会"].blockedMeanings, ["interview", "party"]);
    assert.equal(curatedStudyData["会"].exampleSentence.english, "I go to work.");
    assert.deepEqual(curatedStudyData["低"].blockedMeanings, ["humble", "short"]);
    assert.deepEqual(curatedStudyData["住"].blockedMeanings, ["inhabit"]);
    assert.deepEqual(curatedStudyData["体"].blockedMeanings, ["counter for images", "object", "reality", "substance"]);
    assert.deepEqual(curatedStudyData["作"].blockedMeanings, ["prepare", "production"]);
    assert.deepEqual(curatedStudyData["使"].blockedMeanings, ["ambassador", "cause", "envoy", "messenger", "order", "send on a mission"]);
    assert.deepEqual(curatedStudyData["便"].blockedMeanings, ["chance", "excrement", "facility", "feces"]);
    assert.deepEqual(curatedStudyData["働"].blockedMeanings, ["(kokuji)"]);
    assert.deepEqual(curatedStudyData["元"].displayWord, { written: "元", pron: "もと" });
    assert.deepEqual(curatedStudyData["元"].breakdownDisplayWord, { written: "元", pron: "もと" });
    assert.deepEqual(
        curatedStudyData["元"].breakdownOverrides.find((entry) => entry.matchWord === "元気").displayWord,
        { written: "元", pron: "げん" }
    );
    assert.deepEqual(
        curatedStudyData["元"].breakdownOverrides.find((entry) => entry.matchWord === "元日").displayWord,
        { written: "元", pron: "がん" }
    );
    assert.equal(curatedStudyData["元"].exampleSentence.japanese, "元の場所に戻してください。");
    assert.deepEqual(curatedStudyData["全"].blockedMeanings, ["fulfill"]);
    assert.deepEqual(curatedStudyData["公"].blockedMeanings, ["prince"]);
    assert.deepEqual(curatedStudyData["写"].blockedMeanings, ["describe"]);
    assert.equal(curatedStudyData["写"].exampleSentence.japanese, "先生の字をノートに写しました。");
    assert.deepEqual(curatedStudyData["切"].blockedMeanings, ["cutoff"]);
    assert.deepEqual(curatedStudyData["別"].blockedMeanings, ["branch off", "diverge", "fork"]);
    assert.equal(curatedStudyData["別"].notes, "別 （べつ） - different / separate ／ 別れる （わかれる） - part ways");
    assert.deepEqual(curatedStudyData["力"].blockedMeanings, ["bear up", "exert", "strain", "strong"]);
    assert.deepEqual(curatedStudyData["勉"].blockedMeanings, [
        "diligent",
        "encourage",
        "endeavour",
        "exertion",
        "make effort",
        "strive",
    ]);
    assert.deepEqual(curatedStudyData["動"].blockedMeanings, ["confusion"]);
    assert.deepEqual(curatedStudyData["去"].blockedMeanings, ["divorce", "quit"]);
    assert.deepEqual(curatedStudyData["台"].blockedMeanings, ["a stand"]);
    assert.equal(curatedStudyData["台"].notes, "台 （だい） - stand / platform ／ 台所 （だいどころ） - kitchen ／ 台風 （たいふう） - typhoon");
    assert.equal(curatedStudyData["台"].exampleSentence.japanese, "新しいテレビ台を買いました。");
    assert.deepEqual(curatedStudyData["合"].blockedMeanings, ["0.1"]);
    assert.deepEqual(curatedStudyData["品"].blockedMeanings, ["counter for meal courses"]);
    assert.deepEqual(curatedStudyData["有"].preferredWords, ["有る", "有名"]);
    assert.deepEqual(curatedStudyData["有"].blockedMeanings, ["approx", "happen", "occur"]);
    assert.equal(curatedStudyData["有"].notes, "有る （ある） - exist / have ／ 有名 （ゆうめい） - famous");
    assert.equal(curatedStudyData["有"].exampleSentence.japanese, "まだ時間が有るので、少し休みます。");
    assert.deepEqual(curatedStudyData["服"].blockedMeanings, ["admit", "discharge", "obey"]);
    assert.deepEqual(curatedStudyData["朝"].blockedMeanings, ["(North) Korea", "dynasty", "epoch", "period", "regime"]);
    assert.deepEqual(curatedStudyData["業"].blockedMeanings, ["arts", "performance", "vocation"]);
    assert.equal(curatedStudyData["止"].exampleSentence.japanese, "バスが駅前で止まりました。");
    assert.deepEqual(curatedStudyData["正"].blockedMeanings, ["10**40"]);
    assert.equal(curatedStudyData["死"].exampleSentence.japanese, "水がないと花はすぐ死んでしまいます。");
    assert.equal(curatedStudyData["民"].exampleSentence.japanese, "この町には多くの住民がいます。");
    assert.deepEqual(curatedStudyData["注"].preferredWords, ["注意", "注文"]);
    assert.deepEqual(curatedStudyData["注"].blockedMeanings, [
        "annotate",
        "comment",
        "concentrate on",
        "flow into",
        "irrigate",
        "notes",
        "shed (tears)",
    ]);
    assert.equal(curatedStudyData["洋"].exampleSentence.english, "Today I plan to eat Western food near the station.");

    assert.deepEqual(curatedStudyData["情"].displayWord, { written: "事情", pron: "じじょう" });
    assert.equal(curatedStudyData["情"].englishMeaning, "situation / emotion");
    assert.deepEqual(curatedStudyData["情"].preferredWords, ["事情", "感情", "愛情"]);

    assert.deepEqual(curatedStudyData["成"].displayWord, { written: "成功", pron: "せいこう" });
    assert.equal(curatedStudyData["成"].englishMeaning, "succeed / become / complete");
    assert.deepEqual(curatedStudyData["成"].blockedMeanings, ["elapse", "get"]);

    assert.deepEqual(curatedStudyData["才"].blockedMeanings, ["cubic shaku"]);

    assert.deepEqual(curatedStudyData["打"].blockedMeanings, ["dozen"]);

    assert.deepEqual(curatedStudyData["払"].blockedMeanings, ["banish", "dispose of", "prune"]);

    assert.deepEqual(curatedStudyData["投"].blockedMeanings, ["join", "launch into", "sell at a loss"]);

    assert.deepEqual(curatedStudyData["折"].blockedMeanings, ["submit", "yield"]);

    assert.deepEqual(curatedStudyData["抱"].blockedMeanings, ["have"]);

    assert.deepEqual(curatedStudyData["押"].blockedMeanings, [
        "attach",
        "check",
        "do in spite of",
        "weight",
    ]);

    assert.deepEqual(curatedStudyData["拾"].blockedMeanings, ["go on foot"]);

    assert.deepEqual(curatedStudyData["指"].blockedMeanings, [
        "measure (ruler)",
        "play (chess)",
        "put into",
    ]);

    assert.deepEqual(curatedStudyData["捨"].blockedMeanings, ["resign", "sacrifice"]);

    assert.deepEqual(curatedStudyData["掛"].blockedMeanings, ["arrive at", "depend", "pour", "tax"]);

    assert.deepEqual(curatedStudyData["換"].blockedMeanings, ["period"]);

    assert.deepEqual(curatedStudyData["敗"].blockedMeanings, ["reversal"]);

    assert.deepEqual(curatedStudyData["数"].blockedMeanings, ["law", "strength"]);

    assert.deepEqual(curatedStudyData["断"].blockedMeanings, [
        "apologize",
        "dismiss",
        "prohibit",
        "severance",
        "warn",
    ]);

    assert.deepEqual(curatedStudyData["易"].blockedMeanings, ["ready to"]);

    assert.deepEqual(curatedStudyData["更"].blockedMeanings, ["night watch", "of course", "renovate"]);

    assert.deepEqual(curatedStudyData["未"].blockedMeanings, [
        "1-3PM",
        "eighth sign of Chinese zodiac",
        "hitherto",
        "sign of the ram",
    ]);

    assert.deepEqual(curatedStudyData["末"].blockedMeanings, ["posterity", "powder"]);

    assert.deepEqual(curatedStudyData["束"].blockedMeanings, [
        "control",
        "govern",
        "manage",
        "ream",
        "sheaf",
    ]);

    assert.deepEqual(curatedStudyData["枚"].blockedMeanings, ["sheet of..."]);

    assert.deepEqual(curatedStudyData["果"].blockedMeanings, ["reward"]);

    assert.deepEqual(curatedStudyData["根"].blockedMeanings, ["head (pimple)"]);

    assert.deepEqual(curatedStudyData["格"].blockedMeanings, [
        "capacity",
        "case (law, grammar)",
    ]);

    assert.deepEqual(curatedStudyData["構"].blockedMeanings, ["appearance"]);

    assert.deepEqual(curatedStudyData["横"].blockedMeanings, [
        "perverse",
        "unreasonable",
        "woof",
    ]);

    assert.deepEqual(curatedStudyData["機"].blockedMeanings, [
        "efficacy",
        "loom",
        "potency",
    ]);

    assert.deepEqual(curatedStudyData["欲"].blockedMeanings, ["covetousness", "passion"]);

    assert.deepEqual(curatedStudyData["歳"].blockedMeanings, ["occasion", "opportunity"]);

    assert.deepEqual(curatedStudyData["殺"].blockedMeanings, [
        "butcher",
        "diminish",
        "murder",
        "slice off",
        "split",
        "spoil",
    ]);

    assert.deepEqual(curatedStudyData["汚"].blockedMeanings, ["defile", "disgrace"]);

    assert.deepEqual(curatedStudyData["治"].blockedMeanings, [
        "conserve",
        "govt",
        "quell",
        "reign",
        "subdue",
    ]);

    assert.deepEqual(curatedStudyData["法"].blockedReadings, ["フラン"]);

    assert.deepEqual(curatedStudyData["活"].blockedMeanings, ["being helped", "resuscitation"]);

    assert.deepEqual(curatedStudyData["涙"].blockedMeanings, ["sympathy"]);

    assert.equal(curatedStudyData["深"].notes, "深い （ふかい） - deep ／ 深刻 （しんこく） - serious / grave ／ 深夜 （しんや） - late night");
    assert.deepEqual(curatedStudyData["深"].preferredWords, ["深い", "深刻", "深夜"]);

    assert.deepEqual(curatedStudyData["済"].blockedMeanings, ["excusable", "need not", "relieve (burden)"]);
    assert.deepEqual(curatedStudyData["済"].blockedReadings, ["すく.う", "な.す", "わた.る", "わたし"]);

    assert.deepEqual(curatedStudyData["渡"].preferredWords, ["渡る", "渡す", "渡航"]);
    assert.deepEqual(curatedStudyData["渡"].blockedMeanings, [
        "diameter",
        "ford",
        "import",
        "migrate",
        "transit",
    ]);
    assert.equal(curatedStudyData["渡"].notes, "渡る （わたる） - cross ／ 渡す （わたす） - hand over ／ 渡航 （とこう） - voyage / crossing");

    assert.deepEqual(curatedStudyData["温"].blockedReadings, ["ぬく"]);

    assert.equal(curatedStudyData["港"].exampleSentence.english, "A large ship was docked in the harbor.");

    assert.deepEqual(curatedStudyData["演"].blockedMeanings, ["play", "render"]);

    assert.deepEqual(curatedStudyData["然"].blockedReadings, ["さ", "しか", "しか.し", "しか.り"]);
    assert.deepEqual(curatedStudyData["然"].blockedMeanings, [
        "if so",
        "in that case",
        "sort of thing",
        "well",
    ]);

    assert.deepEqual(curatedStudyData["熱"].blockedMeanings, ["mania"]);

    assert.deepEqual(curatedStudyData["犯"].blockedReadings, ["ボン"]);
    assert.deepEqual(curatedStudyData["犯"].blockedMeanings, ["sin"]);

    assert.deepEqual(curatedStudyData["状"].blockedMeanings, ["conditions", "status quo"]);

    assert.deepEqual(curatedStudyData["玉"].blockedReadings, ["-だま"]);

    assert.deepEqual(curatedStudyData["王"].blockedReadings, ["-ノウ"]);
    assert.deepEqual(curatedStudyData["王"].blockedMeanings, ["magnate", "rule"]);

    assert.deepEqual(curatedStudyData["現"].blockedReadings, ["うつ.つ"]);

    assert.deepEqual(curatedStudyData["由"].blockedMeanings, ["a reason", "wherefore"]);

    assert.deepEqual(curatedStudyData["申"].blockedMeanings, [
        "3-5PM",
        "have the honor to",
        "ninth sign of Chinese zodiac",
        "sign of the monkey",
    ]);

    assert.deepEqual(curatedStudyData["留"].blockedReadings, ["るうぶる"]);

    assert.deepEqual(curatedStudyData["登"].blockedReadings, ["ショウ", "チョウ", "ドウ"]);

    assert.deepEqual(curatedStudyData["直"].blockedReadings, ["ジカ"]);

    assert.deepEqual(curatedStudyData["相"].blockedMeanings, [
        "councillor",
        "inter-",
        "minister of state",
        "physiognomy",
    ]);

    assert.deepEqual(curatedStudyData["眠"].blockedMeanings, ["die"]);

    assert.deepEqual(curatedStudyData["破"].blockedMeanings, ["frustrate", "rend"]);

    assert.deepEqual(curatedStudyData["確"].blockedReadings, ["コウ"]);
    assert.deepEqual(curatedStudyData["確"].blockedMeanings, ["assurance", "tight"]);

    assert.deepEqual(curatedStudyData["礼"].blockedMeanings, ["remuneration", "salute"]);

    assert.equal(curatedStudyData["神"].englishMeaning, "god / deity");
    assert.deepEqual(curatedStudyData["神"].blockedMeanings, ["shrine"]);

    assert.deepEqual(curatedStudyData["移"].blockedMeanings, ["drift", "pass into"]);

    assert.deepEqual(curatedStudyData["程"].blockedMeanings, ["formula"]);

    assert.deepEqual(curatedStudyData["種"].blockedReadings, ["-ぐさ"]);

    assert.deepEqual(curatedStudyData["積"].blockedMeanings, ["acreage", "contents"]);

    assert.deepEqual(curatedStudyData["窓"].blockedReadings, ["けむだし", "ス", "てんまど"]);

    assert.deepEqual(curatedStudyData["算"].blockedReadings, ["そろ"]);
    assert.deepEqual(curatedStudyData["算"].blockedMeanings, ["abacus", "divining", "probability"]);

    assert.deepEqual(curatedStudyData["箱"].blockedMeanings, ["bin", "chest", "railway car"]);

    assert.deepEqual(curatedStudyData["米"].blockedReadings, ["メエトル"]);
    assert.deepEqual(curatedStudyData["米"].blockedMeanings, ["metre"]);

    assert.deepEqual(curatedStudyData["精"].blockedReadings, ["くわ.しい", "しら.げる"]);
    assert.deepEqual(curatedStudyData["精"].blockedMeanings, ["fairy", "ghost", "semen"]);

    assert.equal(curatedStudyData["約"].englishMeaning, "promise / approximately");
    assert.ok(curatedStudyData["約"].notes.includes("約 （やく） - promise / approximately"));

    assert.deepEqual(curatedStudyData["組"].blockedMeanings, ["braid", "grapple", "plait"]);

    assert.deepEqual(curatedStudyData["経"].blockedReadings, ["のり", "はか.る"]);
    assert.deepEqual(curatedStudyData["経"].blockedMeanings, ["expire", "pass thru"]);

    assert.deepEqual(curatedStudyData["給"].blockedReadings, ["-たま.え", "たま.う", "たも.う"]);
    assert.deepEqual(curatedStudyData["給"].blockedMeanings, ["allow", "gift"]);

    assert.equal(curatedStudyData["絶"].englishMeaning, "cease / die out");
    assert.deepEqual(curatedStudyData["絶"].displayWord, { written: "絶える", pron: "たえる" });
    assert.deepEqual(curatedStudyData["絶"].preferredWords, ["絶える", "絶対", "絶望"]);
    assert.deepEqual(curatedStudyData["絶"].blockedMeanings, [
        "abstain",
        "be beyond",
        "suppress",
        "unparalleled",
        "without match",
    ]);
    assert.equal(curatedStudyData["絶"].exampleSentence.japanese, "その古い習慣は少しずつ絶えていきました。");

    assert.deepEqual(curatedStudyData["続"].blockedReadings, ["キョウ", "コウ", "ショク", "つぐ.ない"]);

    assert.deepEqual(curatedStudyData["緒"].blockedMeanings, ["end", "thong"]);
    assert.deepEqual(curatedStudyData["置"].blockedMeanings, ["deposit", "employ", "pawn"]);
    assert.deepEqual(curatedStudyData["老"].blockedMeanings, ["old man"]);
    assert.deepEqual(curatedStudyData["育"].blockedMeanings, ["rear"]);

    assert.deepEqual(curatedStudyData["背"].blockedMeanings, ["rebel"]);
    assert.deepEqual(curatedStudyData["能"].blockedReadings, ["あた.う", "よ.く"]);
    assert.deepEqual(curatedStudyData["舞"].blockedMeanings, ["circle", "flit", "wheel"]);
    assert.deepEqual(curatedStudyData["芸"].blockedReadings, ["ウン", "のり"]);
    assert.deepEqual(curatedStudyData["芸"].blockedMeanings, ["stunt", "trick"]);
    assert.deepEqual(curatedStudyData["若"].blockedReadings, [
        "ごと.し",
        "ニャ",
        "ニャク",
        "も.し",
        "も.しくは",
        "も.しくわ",
    ]);
    assert.deepEqual(curatedStudyData["若"].blockedMeanings, ["if", "low number", "perhaps", "possibly"]);

    assert.equal(curatedStudyData["苦"].displayWord.pron, "くるしい");
    assert.deepEqual(curatedStudyData["苦"].blockedReadings, ["-ぐる.しい"]);
    assert.deepEqual(curatedStudyData["苦"].blockedMeanings, ["scowl", "trial", "worry"]);
    assert.deepEqual(curatedStudyData["草"].blockedMeanings, ["draft", "herbs", "pasture", "write"]);
    assert.deepEqual(curatedStudyData["荷"].blockedMeanings, ["shoulder (a gun)", "shoulder-pole load"]);
    assert.deepEqual(curatedStudyData["菓"].blockedMeanings, ["fruit"]);
    assert.deepEqual(curatedStudyData["落"].blockedMeanings, ["hamlet", "village"]);
    assert.deepEqual(curatedStudyData["葉"].blockedMeanings, [
        "blade",
        "counter for flat things",
        "fragment",
        "lobe",
        "needle",
        "piece",
        "plane",
        "spear",
    ]);
    assert.deepEqual(curatedStudyData["術"].blockedMeanings, ["magic", "resources", "trick"]);
    assert.equal(curatedStudyData["表"].displayWord.pron, "おもて");
    assert.deepEqual(curatedStudyData["表"].blockedMeanings, ["diagram"]);

    assert.deepEqual(curatedStudyData["裏"].blockedMeanings, ["palm", "sole"]);
    assert.deepEqual(curatedStudyData["覚"].blockedMeanings, ["sober up"]);
    assert.deepEqual(curatedStudyData["解"].blockedMeanings, ["key", "minute", "notes"]);
    assert.deepEqual(curatedStudyData["記"].blockedMeanings, ["scribe"]);
    assert.deepEqual(curatedStudyData["訪"].blockedMeanings, ["offer sympathy"]);

    assert.deepEqual(curatedStudyData["当"].blockedMeanings, ["himself"]);

    assert.equal(curatedStudyData["役"].englishMeaning, "role / usefulness");
    assert.deepEqual(curatedStudyData["役"].preferredWords, ["役に立つ", "役目", "役所"]);
    assert.deepEqual(curatedStudyData["役"].blockedMeanings, ["campaign", "drafted labor", "war"]);

    assert.deepEqual(curatedStudyData["座"].blockedMeanings, ["cushion", "squat"]);

    assert.deepEqual(curatedStudyData["彼"].blockedMeanings, ["the"]);

    assert.deepEqual(curatedStudyData["忙"].blockedMeanings, ["restless"]);

    assert.deepEqual(curatedStudyData["念"].blockedMeanings, ["sense"]);

    assert.deepEqual(curatedStudyData["認"].blockedMeanings, ["appreciate", "believe", "witness"]);
    assert.deepEqual(curatedStudyData["誕"].blockedMeanings, [
        "be arbitrary",
        "declension",
        "lie",
        "nativity",
    ]);
    assert.deepEqual(curatedStudyData["課"].blockedMeanings, ["counter for chapters (of a book)"]);
    assert.deepEqual(curatedStudyData["調"].blockedMeanings, [
        "exorcise",
        "mediate",
        "meter",
        "prepare",
        "writing style",
    ]);

    assert.deepEqual(curatedStudyData["識"].blockedMeanings, ["discriminating", "write"]);
    assert.deepEqual(curatedStudyData["警"].blockedMeanings, ["commandment"]);
    assert.deepEqual(curatedStudyData["負"].blockedMeanings, ["-"]);
    assert.equal(curatedStudyData["財"].englishMeaning, "property / wealth");
    assert.deepEqual(curatedStudyData["資"].blockedMeanings, [
        "be conducive to",
        "contribute to",
        "data",
    ]);
    assert.deepEqual(curatedStudyData["賛"].blockedMeanings, ["title or inscription on picture"]);
    assert.deepEqual(curatedStudyData["越"].blockedMeanings, ["Vietnam"]);
    assert.deepEqual(curatedStudyData["輪"].blockedMeanings, ["counter for wheels and flowers"]);
    assert.deepEqual(curatedStudyData["込"].blockedMeanings, ["(kokuji)", "in bulk", "mixture"]);
    assert.deepEqual(curatedStudyData["返"].blockedMeanings, ["fade"]);
    assert.deepEqual(curatedStudyData["迷"].blockedMeanings, ["illusion"]);
    assert.deepEqual(curatedStudyData["追"].blockedMeanings, ["meanwhile"]);
    assert.equal(curatedStudyData["退"].englishMeaning, "withdraw / retreat");
    assert.equal(curatedStudyData["配"].englishMeaning, "distribute / deliver");
    assert.deepEqual(curatedStudyData["配"].displayWord, { written: "配る", pron: "くばる" });
    assert.deepEqual(curatedStudyData["配"].blockedMeanings, ["exile", "rationing", "spouse"]);
    assert.deepEqual(curatedStudyData["酒"].displayWord, { written: "酒", pron: "さけ" });
    assert.deepEqual(curatedStudyData["険"].blockedMeanings, [
        "impregnable position",
        "inaccessible place",
        "sharp eyes",
        "steep place",
    ]);
    assert.deepEqual(curatedStudyData["陽"].blockedMeanings, [
        "daytime",
        "heaven",
        "male",
        "positive",
        "yang principle",
    ]);
    assert.equal(curatedStudyData["際"].englishMeaning, "occasion / time");
    assert.deepEqual(curatedStudyData["際"].displayWord, { written: "際", pron: "さい" });
    assert.deepEqual(curatedStudyData["際"].blockedMeanings, [
        "adventurous",
        "dangerous",
        "indecent",
    ]);
    assert.equal(curatedStudyData["雑"].englishMeaning, "rough / miscellaneous");
    assert.deepEqual(curatedStudyData["雑"].displayWord, { written: "雑", pron: "ざつ" });
    assert.deepEqual(curatedStudyData["雑"].blockedMeanings, ["magazine"]);
    assert.equal(curatedStudyData["非"].englishMeaning, "non- / fault");
    assert.deepEqual(curatedStudyData["非"].displayWord, { written: "非", pron: "ひ" });
    assert.deepEqual(curatedStudyData["非"].blockedMeanings, ["very"]);
    assert.equal(curatedStudyData["面"].englishMeaning, "face / surface");
    assert.deepEqual(curatedStudyData["面"].displayWord, { written: "画面", pron: "がめん" });
    assert.deepEqual(curatedStudyData["面"].blockedMeanings, ["interesting"]);
    assert.deepEqual(curatedStudyData["頂"].blockedMeanings, ["place on the head"]);
    assert.equal(curatedStudyData["額"].englishMeaning, "amount / frame");
    assert.ok(curatedStudyData["額"].notes.includes("額 （がく） - amount / frame"));
    assert.ok(curatedStudyData["額"].notes.includes("前額 （ぜんがく） - forehead"));
    assert.deepEqual(curatedStudyData["額"].blockedMeanings, ["volume"]);
    assert.deepEqual(curatedStudyData["類"].blockedMeanings, ["genus"]);
    assert.deepEqual(curatedStudyData["飛"].blockedMeanings, ["skip (pages)"]);
    assert.deepEqual(curatedStudyData["駐"].blockedMeanings, ["resident", "stop-over"]);
    assert.deepEqual(curatedStudyData["鳴"].blockedMeanings, ["bark", "chirp", "echo", "honk"]);

    assert.deepEqual(curatedStudyData["息"].blockedMeanings, [
        "coming to an end",
        "interest (on money)",
        "nuture",
    ]);

    assert.deepEqual(curatedStudyData["居"].displayWord, { written: "居る", pron: "いる" });
    assert.deepEqual(curatedStudyData["居"].preferredWords, ["居る", "居間", "居場所"]);

    assert.deepEqual(curatedStudyData["常"].displayWord, { written: "日常", pron: "にちじょう" });
    assert.equal(curatedStudyData["常"].englishMeaning, "usual / normal");

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

    assert.deepEqual(curatedStudyData["内"].displayWord, { written: "案内", pron: "あんない" });
    assert.deepEqual(curatedStudyData["内"].preferredWords, ["案内", "内"]);

    assert.deepEqual(curatedStudyData["列"].displayWord, { written: "列", pron: "れつ" });
    assert.deepEqual(curatedStudyData["列"].preferredWords, ["列", "行列"]);

    assert.deepEqual(curatedStudyData["富"].displayWord, { written: "豊富", pron: "ほうふ" });
    assert.equal(curatedStudyData["富"].englishMeaning, "abundant / wealth");

    assert.deepEqual(curatedStudyData["以"].displayWord, { written: "以内", pron: "いない" });
    assert.equal(curatedStudyData["以"].englishMeaning, "within / from");

    assert.deepEqual(curatedStudyData["医"].displayWord, { written: "医者", pron: "いしゃ" });
    assert.equal(curatedStudyData["医"].englishMeaning, "doctor / medicine");

    assert.deepEqual(curatedStudyData["員"].displayWord, { written: "員", pron: "いん" });
    assert.deepEqual(curatedStudyData["員"].preferredWords, ["店員", "会社員", "会員"]);

    assert.deepEqual(curatedStudyData["映"].displayWord, { written: "映画", pron: "えいが" });
    assert.equal(curatedStudyData["映"].englishMeaning, "movie / reflect");

    assert.deepEqual(curatedStudyData["画"].displayWord, { written: "計画", pron: "けいかく" });
    assert.equal(curatedStudyData["画"].englishMeaning, "plan");

    assert.deepEqual(curatedStudyData["銀"].displayWord, { written: "銀色", pron: "ぎんいろ" });
    assert.equal(curatedStudyData["銀"].englishMeaning, "silver");

    assert.deepEqual(curatedStudyData["局"].displayWord, { written: "郵便局", pron: "ゆうびんきょく" });
    assert.deepEqual(curatedStudyData["局"].preferredWords, ["郵便局", "放送局"]);

    assert.deepEqual(curatedStudyData["来"].preferredWords, ["来る", "来週"]);
    assert.equal(curatedStudyData["来"].notes, "来る （くる） - come ／ 来週 （らいしゅう） - next week");

    assert.deepEqual(curatedStudyData["読"].preferredWords, ["読む", "読書"]);
    assert.equal(curatedStudyData["読"].notes, "読む （よむ） - read ／ 読書 （どくしょ） - reading");

    assert.deepEqual(curatedStudyData["話"].preferredWords, ["話す", "会話"]);
    assert.equal(curatedStudyData["話"].notes, "話す （はなす） - speak / talk ／ 会話 （かいわ） - conversation");

    assert.equal(curatedStudyData["水"].notes, "水 （みず） - water ／ 水曜日 （すいようび） - Wednesday");
    assert.deepEqual(curatedStudyData["一"].displayWord, { written: "一", pron: "いち" });
    assert.deepEqual(curatedStudyData["二"].displayWord, { written: "二", pron: "に" });
    assert.deepEqual(curatedStudyData["三"].displayWord, { written: "三", pron: "さん" });
    assert.deepEqual(curatedStudyData["四"].displayWord, { written: "四", pron: "よん" });
    assert.deepEqual(curatedStudyData["五"].displayWord, { written: "五", pron: "ご" });
    assert.deepEqual(curatedStudyData["六"].displayWord, { written: "六", pron: "ろく" });
    assert.deepEqual(curatedStudyData["七"].displayWord, { written: "七", pron: "なな" });
    assert.deepEqual(curatedStudyData["八"].displayWord, { written: "八", pron: "はち" });
    assert.deepEqual(curatedStudyData["九"].displayWord, { written: "九", pron: "きゅう" });
    assert.deepEqual(curatedStudyData["十"].displayWord, { written: "十", pron: "じゅう" });
    assert.deepEqual(curatedStudyData["千"].displayWord, { written: "千", pron: "せん" });
    assert.deepEqual(curatedStudyData["午"].displayWord, { written: "午", pron: "ご" });
    assert.deepEqual(curatedStudyData["女"].displayWord, { written: "女", pron: "おんな" });
    assert.equal(curatedStudyData["女"].notes, "女 （おんな） - woman ／ 女の子 （おんなのこ） - girl");
    assert.deepEqual(curatedStudyData["電"].displayWord, { written: "電", pron: "でん" });
    assert.deepEqual(curatedStudyData["地"].displayWord, { written: "地", pron: "ち" });
    assert.deepEqual(curatedStudyData["員"].displayWord, { written: "員", pron: "いん" });
    assert.deepEqual(curatedStudyData["問"].displayWord, { written: "問", pron: "もん" });
    assert.deepEqual(curatedStudyData["堂"].displayWord, { written: "堂", pron: "どう" });
    assert.deepEqual(curatedStudyData["力"].displayWord, { written: "力", pron: "ちから" });
    assert.deepEqual(curatedStudyData["場"].displayWord, { written: "場", pron: "ば" });
    assert.deepEqual(curatedStudyData["用"].displayWord, { written: "用", pron: "よう" });
    assert.deepEqual(curatedStudyData["用"].blockedMeanings, ["service"]);
    assert.deepEqual(curatedStudyData["田"].displayWord, { written: "田", pron: "た" });
    assert.equal(curatedStudyData["田"].exampleSentence.japanese, "家の近くに田んぼがあります。");
    assert.deepEqual(curatedStudyData["立"].blockedReadings, ["リットル"]);
    assert.deepEqual(curatedStudyData["真"].displayWord, { written: "真", pron: "ま" });
    assert.deepEqual(curatedStudyData["真"].blockedMeanings, ["Buddhist sect"]);
    assert.equal(curatedStudyData["真"].exampleSentence.japanese, "この紙は真っ白です。");
    assert.deepEqual(curatedStudyData["発"].displayWord, { written: "発", pron: "はつ" });
    assert.deepEqual(curatedStudyData["発"].blockedReadings, ["あばく", "おこる", "たつ", "つかわす", "はなつ"]);
    assert.deepEqual(curatedStudyData["発"].blockedMeanings, ["counter for gunshots", "disclose", "start from"]);
    assert.deepEqual(curatedStudyData["目"].blockedMeanings, ["care", "class", "experience", "favor", "insight", "look"]);
    assert.deepEqual(curatedStudyData["県"].blockedReadings, ["かける"]);
    assert.deepEqual(curatedStudyData["英"].blockedMeanings, ["calyx", "hero", "outstanding"]);
    assert.deepEqual(curatedStudyData["茶"].displayWord, { written: "茶", pron: "ちゃ" });
    assert.deepEqual(curatedStudyData["薬"].blockedMeanings, ["benefit", "chemical", "enamel", "gunpowder"]);
    assert.deepEqual(curatedStudyData["親"].blockedMeanings, ["dealer (cards)", "familiarity", "intimacy", "relative"]);
    assert.deepEqual(curatedStudyData["質"].blockedReadings, ["わりふ"]);
    assert.deepEqual(curatedStudyData["計"].blockedMeanings, ["plot", "scheme"]);
    assert.deepEqual(curatedStudyData["試"].blockedMeanings, ["ordeal"]);
    assert.deepEqual(curatedStudyData["軽"].blockedReadings, ["キョウ"]);
    assert.deepEqual(curatedStudyData["間"].displayWord, { written: "間", pron: "あいだ" });
    assert.deepEqual(curatedStudyData["食"].displayWord, { written: "食べる", pron: "たべる" });
    assert.deepEqual(curatedStudyData["生"].displayWord, { written: "生きる", pron: "いきる" });
    assert.equal(curatedStudyData["生"].exampleSentence.japanese, "この魚は川で生きています。");
    assert.deepEqual(curatedStudyData["勉"].displayWord, { written: "勉強", pron: "べんきょう" });
    assert.deepEqual(curatedStudyData["勉"].preferredWords, ["勉強"]);
    assert.deepEqual(curatedStudyData["主"].displayWord, { written: "主", pron: "おも" });
    assert.deepEqual(curatedStudyData["主"].preferredWords, ["主に", "主人"]);
    assert.deepEqual(curatedStudyData["世"].displayWord, { written: "世の中", pron: "よのなか" });
    assert.equal(curatedStudyData["世"].exampleSentence.japanese, "世の中は広いです。");

    assert.deepEqual(curatedStudyData["天"].displayWord, { written: "天気", pron: "てんき" });
    assert.equal(curatedStudyData["天"].englishMeaning, "weather / sky");
    assert.deepEqual(curatedStudyData["飲"].displayWord, { written: "飲む", pron: "のむ" });
    assert.deepEqual(curatedStudyData["歌"].displayWord, { written: "歌", pron: "うた" });
    assert.deepEqual(curatedStudyData["家"].displayWord, { written: "家", pron: "いえ" });
    assert.deepEqual(curatedStudyData["音"].displayWord, { written: "音", pron: "おと" });
    assert.deepEqual(curatedStudyData["開"].displayWord, { written: "開ける", pron: "あける" });
    assert.deepEqual(curatedStudyData["洗"].blockedMeanings, ["inquire into", "probe"]);
    assert.deepEqual(curatedStudyData["理"].blockedMeanings, ["justice"]);
    assert.deepEqual(curatedStudyData["産"].blockedMeanings, ["bear", "give birth", "native", "yield"]);

    assert.deepEqual(curatedStudyData["候"].displayWord, { written: "気候", pron: "きこう" });
    assert.equal(curatedStudyData["候"].englishMeaning, "season / climate");

    assert.deepEqual(curatedStudyData["晴"].displayWord, { written: "晴れる", pron: "はれる" });
    assert.equal(curatedStudyData["晴"].englishMeaning, "clear up / sunny");
});

test("resolved tracked N1 batch entries keep selected learner-facing editorial choices stable", () => {
    const curatedStudyData = loadCuratedStudyData(path.join(process.cwd(), "data", "curated_study_data.json"));

    assert.deepEqual(curatedStudyData["渥"].displayWord, { written: "渥い", pron: "あつい" });
    assert.equal(curatedStudyData["渥"].exampleSentence.japanese, "先生から渥い支援を受けた。");
    assert.ok(!curatedStudyData["慰"].notes.includes("慰问"));

    assert.deepEqual(curatedStudyData["賀"].displayWord, { written: "年賀状", pron: "ねんがじょう" });
    assert.deepEqual(curatedStudyData["購"].displayWord, { written: "購入", pron: "こうにゅう" });
    assert.deepEqual(curatedStudyData["謝"].preferredWords, ["感謝", "謝罪", "謝る"]);
    assert.equal(curatedStudyData["趣"].englishMeaning, "interest / hobby / gist");
    assert.equal(curatedStudyData["需"].notes, "需要 （じゅよう） - demand ／ 需給 （じゅきゅう） - supply and demand ／ 必需品 （ひつじゅひん） - necessities");
    assert.equal(curatedStudyData["穏"].exampleSentence.japanese, "海は一日中穏やかだった。");
    assert.equal(curatedStudyData["巡"].exampleSentence.english, "I walked along the riverside path that circles the area.");
    assert.equal(curatedStudyData["祉"].englishMeaning, "welfare / well-being");
    assert.deepEqual(curatedStudyData["素"].displayWord, { written: "素晴らしい", pron: "すばらしい" });
    assert.equal(curatedStudyData["策"].notes, "対策 （たいさく） - countermeasure / step ／ 政策 （せいさく） - policy ／ 方策 （ほうさく） - plan / measure");
    assert.equal(curatedStudyData["節"].exampleSentence.japanese, "この季節は朝晩が冷えます。");
    assert.deepEqual(curatedStudyData["紀"].preferredWords, ["世紀", "紀元", "紀行"]);
    assert.equal(curatedStudyData["統"].englishMeaning, "unite / control / govern");
    assert.deepEqual(curatedStudyData["縁"].displayWord, { written: "縁", pron: "えん" });
    assert.deepEqual(curatedStudyData["締"].preferredWords, ["締切", "引き締める", "取締"]);
    assert.equal(curatedStudyData["縮"].exampleSentence.english, "We shortened the meeting to thirty minutes.");
    assert.deepEqual(curatedStudyData["納"].displayWord, { written: "納入", pron: "のうにゅう" });
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
    assert.deepEqual(curatedStudyData["呂"].preferredWords, ["風呂", "語呂", "律呂"]);
    assert.deepEqual(curatedStudyData["詠"].displayWord, { written: "詠う", pron: "うたう" });
    assert.deepEqual(curatedStudyData["票"].preferredWords, ["投票", "票", "伝票"]);
    assert.equal(curatedStudyData["禅"].notes, "禅 （ぜん） - Zen ／ 座禅 （ざぜん） - seated meditation ／ 禅寺 （ぜんでら） - Zen temple");
    assert.equal(curatedStudyData["禍"].exampleSentence.english, "A small lapse invited a major disaster.");
    assert.deepEqual(curatedStudyData["稀"].displayWord, { written: "稀", pron: "まれ" });
    assert.equal(curatedStudyData["稲"].exampleSentence.japanese, "秋の田んぼで稲が風に揺れていた。");
    assert.deepEqual(curatedStudyData["穂"].preferredWords, ["穂", "稲穂"]);
    assert.equal(curatedStudyData["碁"].englishMeaning, "go board game");
    assert.deepEqual(curatedStudyData["棋"].breakdownDisplayWord, { written: "棋", pron: "き" });
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
    assert.deepEqual(curatedStudyData["嶺"].preferredWords, ["山嶺", "分水嶺", "高嶺"]);
    assert.equal(curatedStudyData["謹"].englishMeaning, "be respectful / be humble / reverent");
    assert.equal(curatedStudyData["吟"].englishMeaning, "recite / examine carefully");
    assert.deepEqual(curatedStudyData["跳"].preferredWords, ["跳ぶ", "跳ねる", "跳躍"]);
    assert.ok(curatedStudyData["廉"].blockedMeanings.includes("suspicion"));
    assert.ok(curatedStudyData["露"].blockedMeanings.includes("Russia"));
    assert.deepEqual(curatedStudyData["倭"].preferredWords, ["倭", "倭人", "倭国"]);
    assert.equal(curatedStudyData["倭"].exampleSentence.japanese, "倭という呼び名は古い時代の日本を表します。");
    assert.ok(curatedStudyData["枠"].blockedMeanings.includes("(kokuji)"));
    assert.equal(curatedStudyData["侑"].exampleSentence.japanese, "宴席で客に酒を侑めました。");
    assert.deepEqual(curatedStudyData["勁"].preferredWords, ["勁い", "勁草", "遒勁"]);
    assert.deepEqual(curatedStudyData["崚"].preferredWords, ["崚層", "崚"]);
    assert.equal(curatedStudyData["晟"].notes, "晟 （せい） - bright / flourishing");
    assert.deepEqual(curatedStudyData["漱"].preferredWords, ["漱ぐ", "含漱"]);
    assert.equal(curatedStudyData["漱"].exampleSentence.japanese, "食後に口を漱いでから席を立ちました。");
    assert.deepEqual(curatedStudyData["燎"].preferredWords, ["燎", "燎火", "燎原"]);
    assert.equal(curatedStudyData["燎"].exampleSentence.japanese, "夜祭りでは川辺に燎が並んでいました。");
    assert.deepEqual(curatedStudyData["颯"].displayWord, { written: "颯", pron: "さつ" });
    assert.equal(curatedStudyData["颯"].exampleSentence.japanese, "冷たい風が颯然と吹き抜けました。");
    assert.deepEqual(curatedStudyData["凜"].displayWord, { written: "凜", pron: "りん" });
    assert.ok(curatedStudyData["凜"].notes.includes("凜 （りん）"));
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
    assert.deepEqual(curatedStudyData["茄"].breakdownDisplayWord, { written: "茄", pron: "なす" });
    assert.deepEqual(curatedStudyData["却"].breakdownDisplayWord, { written: "却", pron: "きゃく" });
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
    assert.equal(curatedStudyData["雌"].notes, "雌 （めす） - female ／ 雌花 （めばな） - female flower ／ 雌鳥 （めんどり） - hen");
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
    assert.deepEqual(curatedStudyData["秀"].displayWord, { written: "優秀", pron: "ゆうしゅう" });
    assert.equal(curatedStudyData["秩"].notes, "秩序 （ちつじょ） - order ／ 秩序立てる （ちつじょだてる） - arrange systematically");
    assert.deepEqual(curatedStudyData["稼"].preferredWords, ["稼ぐ", "稼働", "稼ぎ"]);
    assert.equal(curatedStudyData["稿"].exampleSentence.english, "I finally finished the manuscript before the deadline.");
    assert.deepEqual(curatedStudyData["穫"].displayWord, { written: "収穫", pron: "しゅうかく" });
    assert.equal(curatedStudyData["糖"].englishMeaning, "sugar");
    assert.deepEqual(curatedStudyData["第"].preferredWords, ["次第", "第一", "次第に"]);
    assert.equal(curatedStudyData["範"].exampleSentence.japanese, "彼の行動は後輩の模範になっている。");
    assert.deepEqual(curatedStudyData["称"].displayWord, { written: "名称", pron: "めいしょう" });
    assert.equal(curatedStudyData["継"].notes, "中継 （ちゅうけい） - relay broadcast ／ 継続 （けいぞく） - continuation ／ 引き継ぐ （ひきつぐ） - take over");
    assert.deepEqual(curatedStudyData["繊"].preferredWords, ["繊細", "繊維"]);
    assert.equal(curatedStudyData["稔"].exampleSentence.english, "The field crops ripened well by autumn.");
    assert.deepEqual(curatedStudyData["窒"].displayWord, { written: "窒息", pron: "ちっそく" });
    assert.equal(curatedStudyData["竜"].englishMeaning, "dragon");
    assert.deepEqual(curatedStudyData["竜"].displayWord, { written: "竜", pron: "りゅう" });
    assert.deepEqual(curatedStudyData["簿"].preferredWords, ["名簿", "帳簿", "簿記"]);
    assert.equal(curatedStudyData["礎"].exampleSentence.japanese, "基礎がしっかりしていれば応用も利く。");
    assert.deepEqual(curatedStudyData["緊"].displayWord, { written: "緊張", pron: "きんちょう" });
    assert.equal(curatedStudyData["罰"].notes, "罰金 （ばっきん） - fine / penalty ／ 罰 （ばつ） - punishment ／ 罰する （ばっする） - punish");
    assert.deepEqual(curatedStudyData["脈"].preferredWords, ["文脈", "脈", "山脈"]);
    assert.equal(curatedStudyData["菌"].exampleSentence.english, "The equipment was thoroughly sterilized before use.");
    assert.deepEqual(curatedStudyData["豚"].displayWord, { written: "豚肉", pron: "ぶたにく" });
    assert.equal(curatedStudyData["誠"].englishMeaning, "sincerity / honesty");
    assert.deepEqual(curatedStudyData["虚"].preferredWords, ["謙虚", "虚偽", "虚構"]);
    assert.equal(curatedStudyData["蛍"].exampleSentence.japanese, "川辺で蛍が淡く光っていた。");
    assert.deepEqual(curatedStudyData["胆"].displayWord, { written: "大胆", pron: "だいたん" });
    assert.equal(curatedStudyData["艶"].notes, "艶 （つや） - gloss / sheen ／ 艶やか （つややか） - glossy / elegant ／ 色艶 （いろつや） - luster / healthy glow");
    assert.deepEqual(curatedStudyData["虞"].preferredWords, ["危惧", "不虞", "虞れ"]);
    assert.equal(curatedStudyData["衿"].exampleSentence.english, "I straightened the kimono collar before going outside.");
    assert.deepEqual(curatedStudyData["襟"].displayWord, { written: "襟元", pron: "えりもと" });
    assert.equal(curatedStudyData["閑"].notes, "閑静 （かんせい） - quiet / peaceful ／ 閑散 （かんさん） - deserted / quiet ／ 閑話 （かんわ） - digression / side talk");
    assert.equal(curatedStudyData["郡"].exampleSentence.japanese, "郡部では車が生活の足になっている。");
    assert.deepEqual(curatedStudyData["翼"].displayWord, { written: "翼", pron: "つばさ" });
    assert.equal(curatedStudyData["繭"].exampleSentence.english, "There was a white cocoon on the mulberry leaf.");
    assert.deepEqual(curatedStudyData["篤"].preferredWords, ["危篤", "篤実", "篤志"]);
    assert.equal(curatedStudyData["翻"].notes, "翻訳 （ほんやく） - translation ／ 翻す （ひるがえす） - turn over / wave ／ 翻弄 （ほんろう） - toy with / lead around");
    assert.deepEqual(curatedStudyData["聴"].displayWord, { written: "傾聴", pron: "けいちょう" });
    assert.equal(curatedStudyData["臨"].exampleSentence.japanese, "本番に臨む前に深呼吸した。");
    assert.deepEqual(curatedStudyData["蓄"].preferredWords, ["蓄える", "蓄積", "貯蓄"]);
    assert.equal(curatedStudyData["衡"].notes, "均衡 （きんこう） - balance ／ 平衡 （へいこう） - equilibrium ／ 衡量 （こうりょう） - weighing / judgment");
    assert.deepEqual(curatedStudyData["裁"].displayWord, { written: "裁判", pron: "さいばん" });
    assert.equal(curatedStudyData["訴"].exampleSentence.english, "The victim plans to sue the company.");
    assert.deepEqual(curatedStudyData["礁"].preferredWords, ["岩礁", "暗礁", "珊瑚礁"]);
    assert.equal(curatedStudyData["視"].notes, "視点 （してん） - point of view ／ 監視 （かんし） - monitoring ／ 凝視 （ぎょうし） - stare");
    assert.deepEqual(curatedStudyData["製"].displayWord, { written: "製品", pron: "せいひん" });
    assert.equal(curatedStudyData["覇"].exampleSentence.japanese, "地域での覇権を争う企業が多い。");
    assert.deepEqual(curatedStudyData["閥"].preferredWords, ["派閥", "財閥", "閥族"]);
    assert.equal(curatedStudyData["蚕"].notes, "蚕 （かいこ） - silkworm ／ 養蚕 （ようさん） - sericulture ／ 蚕糸 （さんし） - silk thread");
    assert.deepEqual(curatedStudyData["鮎"].displayWord, { written: "鮎", pron: "あゆ" });
    assert.equal(curatedStudyData["膜"].exampleSentence.english, "I was careful not to damage the cornea.");
    assert.deepEqual(curatedStudyData["糾"].preferredWords, ["糾弾", "糾合", "糾明"]);
    assert.equal(curatedStudyData["薦"].notes, "推薦 （すいせん） - recommendation ／ 自薦 （じせん） - self-recommendation ／ 薦める （すすめる） - recommend");
    assert.deepEqual(curatedStudyData["翔"].displayWord, { written: "飛翔", pron: "ひしょう" });
    assert.equal(curatedStudyData["衷"].exampleSentence.japanese, "両案を折衷した形でまとめた。");
    assert.deepEqual(curatedStudyData["端"].preferredWords, ["先端", "極端", "端末"]);
    assert.equal(curatedStudyData["罷"].notes, "罷免 （ひめん） - dismissal from office ／ 罷業 （ひぎょう） - strike / work stoppage ／ 罷める （やめる） - resign / stop");
    assert.deepEqual(curatedStudyData["該"].displayWord, { written: "該当", pron: "がいとう" });
    assert.equal(curatedStudyData["謀"].exampleSentence.english, "People around me said it was a reckless challenge.");
    assert.deepEqual(curatedStudyData["護"].preferredWords, ["保護", "弁護", "介護"]);
    assert.equal(curatedStudyData["豪"].notes, "豪華 （ごうか） - luxurious ／ 豪雨 （ごうう） - torrential rain ／ 豪快 （ごうかい） - bold / hearty");
    assert.deepEqual(curatedStudyData["透"].displayWord, { written: "透明", pron: "とうめい" });
    assert.equal(curatedStudyData["貫"].exampleSentence.japanese, "彼女は最後まで信念を貫いた。");
    assert.deepEqual(curatedStudyData["養"].preferredWords, ["栄養", "養う", "養成"]);
    assert.equal(curatedStudyData["魅"].notes, "魅力 （みりょく） - charm / appeal ／ 魅了 （みりょう） - captivate ／ 魅惑 （みわく） - fascination / temptation");
    assert.deepEqual(curatedStudyData["詐"].displayWord, { written: "詐欺", pron: "さぎ" });
    assert.deepEqual(curatedStudyData["諒"].displayWord, { written: "諒解", pron: "りょうかい" });
    assert.equal(curatedStudyData["諒"].exampleSentence.japanese, "変更点についてはご諒解ください。");
    assert.equal(curatedStudyData["諒"].exampleSentence.english, "Please understand the changes.");
    assert.deepEqual(curatedStudyData["賠"].preferredWords, ["賠償", "賠責", "損害賠償"]);
    assert.equal(curatedStudyData["豪"].exampleSentence.japanese, "式典は予想以上に豪華だった。");
    assert.deepEqual(curatedStudyData["轄"].displayWord, { written: "管轄", pron: "かんかつ" });
    assert.deepEqual(curatedStudyData["謙"].preferredWords, ["謙虚", "謙遜", "謙る"]);
    assert.equal(curatedStudyData["輝"].notes, "輝く （かがやく） - shine / sparkle ／ 光輝 （こうき） - brilliance ／ 輝度 （きど） - brightness / luminance");
    assert.deepEqual(curatedStudyData["矢"].displayWord, { written: "矢印", pron: "やじるし" });
    assert.equal(curatedStudyData["遣"].exampleSentence.english, "Specialists were dispatched to the disaster area.");
    assert.deepEqual(curatedStudyData["粋"].preferredWords, ["純粋", "粋", "無粋"]);
    assert.equal(curatedStudyData["託"].notes, "委託 （いたく） - entrust / outsource ／ 託す （たくす） - entrust ／ 寄託 （きたく） - deposit / entrustment");
    assert.deepEqual(curatedStudyData["諾"].displayWord, { written: "承諾", pron: "しょうだく" });
    assert.equal(curatedStudyData["譜"].exampleSentence.japanese, "古い楽譜を見ながら静かに練習した。");
    assert.deepEqual(curatedStudyData["譲"].preferredWords, ["譲る", "譲歩", "譲渡"]);
    assert.equal(curatedStudyData["遥"].notes, "遥か （はるか） - distant / far away ／ 遥々 （はるばる） - from afar ／ 遥拝 （ようはい） - worship from afar");
    assert.deepEqual(curatedStudyData["逮"].displayWord, { written: "逮捕", pron: "たいほ" });
    assert.equal(curatedStudyData["踏"].exampleSentence.english, "We reviewed the policy based on feedback from the field.");
    assert.deepEqual(curatedStudyData["衰"].preferredWords, ["衰える", "衰退", "盛衰"]);
    assert.equal(curatedStudyData["逸"].notes, "逸れる （それる） - stray / deviate ／ 秀逸 （しゅういつ） - excellent ／ 逸話 （いつわ） - anecdote");
    assert.deepEqual(curatedStudyData["遂"].displayWord, { written: "完遂", pron: "かんすい" });
    assert.equal(curatedStudyData["輔"].exampleSentence.japanese, "新任の責任者を輔佐する役目を任された。");
    assert.deepEqual(curatedStudyData["緯"].preferredWords, ["北緯", "南緯", "経緯"]);
    assert.equal(curatedStudyData["逝"].notes, "急逝 （きゅうせい） - sudden death ／ 逝去 （せいきょ） - passing away ／ 逝く （ゆく） - pass away");
    assert.deepEqual(curatedStudyData["連"].blockedMeanings, ["clique", "gang", "party"]);
    assert.deepEqual(curatedStudyData["遅"].blockedMeanings, ["back"]);
    assert.deepEqual(curatedStudyData["達"].breakdownDisplayWord, { written: "達", pron: "たつ" });
    assert.deepEqual(curatedStudyData["適"].blockedMeanings, ["occasional", "rare"]);
});
