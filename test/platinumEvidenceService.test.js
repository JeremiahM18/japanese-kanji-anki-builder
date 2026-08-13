const test = require("node:test");
const assert = require("node:assert/strict");

const {
    normalizeForEvidence,
    resolvePlatinumCardSourceMatches,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
} = require("../src/services/platinumEvidenceService");

function japaneseEvidence({ source, detail = "Reviewed field-bound card values." } = {}) {
    return [{ type: "japanese-source", source, detail }];
}

test("validateJapaneseSourceEvidence requires governed field-verification sources", () => {
    const generatedOnlyFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "templates/starter_word_study_data.json; templates/golden_n5_word_review_set.json",
        detail: "Tracked local data says 今日|きょう has reading きょう and meaning today.",
    }), {
        context: "word card accuracy",
        requiredUse: "word-field-verification",
    });
    assert.match(generatedOnlyFailures.join("\n"), /governed source allowed for word-field-verification/);

    const wordListOnlyFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "JLPTStudy.net N5 vocabulary list https://jlptstudy.net/N5/lists/n5_vocab-list.html",
        detail: "JLPTStudy lists 今日|きょう.",
    }), {
        context: "word card accuracy",
        requiredUse: "word-field-verification",
    });
    assert.match(wordListOnlyFailures.join("\n"), /governed source allowed for word-field-verification/);

    const dictionaryFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "JLearn.net Japanese Dictionary https://jlearn.net/dictionary/%E4%BB%8A%E6%97%A5",
        detail: "JLearn verifies 今日|きょう, reading きょう, and meaning today.",
    }), {
        context: "word card accuracy",
        requiredUse: "word-field-verification",
    });
    assert.deepEqual(dictionaryFailures, []);

    const jmdictFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "JMdict https://www.edrdg.org/jmdict/j_jmdict.html",
        detail: "JMdict verifies 不利|ふり, reading ふり, and meaning disadvantage.",
    }), {
        context: "word card accuracy",
        requiredUse: "word-field-verification",
    });
    assert.deepEqual(jmdictFailures, []);

    const kanjidic2WordFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "KANJIDIC2 https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
        detail: "KANJIDIC2 verifies 不利|ふり, reading ふり, and meaning disadvantage.",
    }), {
        context: "word card accuracy",
        requiredUse: "word-field-verification",
    });
    assert.match(kanjidic2WordFailures.join("\n"), /governed source allowed for word-field-verification/);
    assert.doesNotMatch(kanjidic2WordFailures.join("\n"), /unregistered URL host/);
});

test("normalizeForEvidence compares escaped generated snippets by visible text", () => {
    assert.equal(
        normalizeForEvidence("I go to school at one o&#39;clock. <ruby>日<rt>ひ</rt></ruby>"),
        "i go to school at one o'clock. 日"
    );
});

test("validateEvidenceSnippets accepts escaped generated snippets against unescaped evidence", () => {
    const failures = validateEvidenceSnippets({
        sourceEvidence: [{
            type: "current-standard-review",
            source: "manual review",
            detail: "Current-standard review checked translation I go to school at one o'clock.",
        }],
        type: "current-standard-review",
        label: "current-standard whole-card revalidation",
        snippets: ["I go to school at one o&#39;clock."],
    });

    assert.deepEqual(failures, []);
});

test("validateEvidenceSnippets treats governed list separators as punctuation, not missing proof", () => {
    const failures = validateEvidenceSnippets({
        sourceEvidence: [{
            type: "current-standard-review",
            source: "manual review",
            detail: "Current-standard review checked reading breakdown 本 （ほん）; book.",
        }],
        type: "current-standard-review",
        label: "current-standard whole-card revalidation",
        snippets: ["本 （ほん） ／ book"],
    });

    assert.deepEqual(failures, []);
});

test("validateJapaneseSourceEvidence supports single-kanji word checks without making kanji references general word dictionaries", () => {
    const sourceEvidence = japaneseEvidence({
        source: "https://www.kanjipedia.jp/kanji/0005127900; Bunka Joyo Kanji reading index",
        detail: "Kanjipedia verifies 土|つち, reading つち, and meaning soil.",
    });

    const ordinaryWordFailures = validateJapaneseSourceEvidence(sourceEvidence, {
        context: "word card accuracy",
        requiredUse: "word-field-verification",
    });
    assert.match(ordinaryWordFailures.join("\n"), /word-field-verification/);

    const singleKanjiWordFailures = validateJapaneseSourceEvidence(sourceEvidence, {
        context: "word card accuracy",
        alternativeRequiredUses: ["single-kanji-word-field-verification"],
        requiredUse: "word-field-verification",
    });
    assert.deepEqual(singleKanjiWordFailures, []);
});

test("validateJapaneseSourceEvidence rejects unregistered URL hosts and circular source origins", () => {
    const unknownHostFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "JLearn.net Japanese Dictionary https://jlearn.net/dictionary/%E4%BB%8A%E6%97%A5; https://example.invalid/source",
        detail: "JLearn verifies 今日|きょう.",
    }), {
        context: "word card accuracy",
        requiredUse: "word-field-verification",
    });
    assert.match(unknownHostFailures.join("\n"), /unregistered URL host/);

    const circularFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "https://www.kanjipedia.jp/kanji/0005127900",
        detail: "Kanjipedia verifies 土 primary reading つち and meaning soil.",
    }), {
        context: "kanji card accuracy",
        requiredUse: "kanji-field-verification",
        sourceOriginIds: ["kanjipedia"],
    });
    assert.match(circularFailures.join("\n"), /must be independent of source-claim origin/);

    const unknownOriginFailures = validateJapaneseSourceEvidence(japaneseEvidence({
        source: "https://www.kanjipedia.jp/kanji/0005127900",
        detail: "Kanjipedia verifies 土 primary reading つち and meaning soil.",
    }), {
        context: "kanji card accuracy",
        requiredUse: "kanji-field-verification",
        sourceOriginIds: ["missing_origin_source"],
    });
    assert.match(unknownOriginFailures.join("\n"), /unregistered source-claim origin id/);
});

test("resolvePlatinumCardSourceMatches records both field and lineage surfaces", () => {
    const matches = resolvePlatinumCardSourceMatches(japaneseEvidence({
        source: "https://www.kanjipedia.jp/kanji/0000097800; templates/jlpt_kanji_source_evidence.json; out/build/additional_unverified/exports/additional-unverified-n5.tsv",
        detail: "Kanjipedia verifies 安 field values; source governance and generated export are lineage only.",
    }));
    const sourceIds = matches.map((match) => match.sourceId).sort();

    assert.deepEqual(sourceIds, [
        "generated_exports",
        "kanjipedia",
        "source_governance_manifest",
    ]);
});
