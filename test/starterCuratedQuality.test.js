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
