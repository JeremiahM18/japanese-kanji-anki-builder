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

test("starter curated N3 entries keep selected learner-facing editorial choices stable", () => {
    const curatedStudyData = loadCuratedStudyData();

    assert.deepEqual(curatedStudyData["便"].displayWord, { written: "便利", pron: "べんり" });
    assert.equal(curatedStudyData["便"].englishMeaning, "convenience / mail service");
    assert.deepEqual(curatedStudyData["便"].preferredWords, ["便利", "郵便"]);

    assert.deepEqual(curatedStudyData["情"].displayWord, { written: "気持ち", pron: "きもち" });
    assert.equal(curatedStudyData["情"].englishMeaning, "feeling / situation");
    assert.equal(curatedStudyData["情"].breakdownOverrides[0].englishMeaning, "feeling");

    assert.deepEqual(curatedStudyData["成"].displayWord, { written: "成功", pron: "せいこう" });
    assert.equal(curatedStudyData["成"].englishMeaning, "succeed / become / complete");

    assert.deepEqual(curatedStudyData["候"].displayWord, { written: "気候", pron: "きこう" });
    assert.equal(curatedStudyData["候"].englishMeaning, "season / climate");

    assert.deepEqual(curatedStudyData["晴"].displayWord, { written: "晴れる", pron: "はれる" });
    assert.equal(curatedStudyData["晴"].englishMeaning, "clear up / sunny");
});
