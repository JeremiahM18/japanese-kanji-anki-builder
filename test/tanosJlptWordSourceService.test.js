const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_ATTRIBUTION,
    buildTanosJlptWordSource,
    buildTanosJlptWordSourceFromMnemosyne,
    cleanExtractedLines,
    formatTanosWordRowsAsTsv,
    normalizeLevel,
    parseMnemosyneItems,
    parseTanosJlptWordMnemosyneRows,
    parseTanosJlptWordRows,
} = require("../src/services/tanosJlptWordSourceService");
const {
    formatNormalizeReport,
    parseArgs,
} = require("../scripts/normalizeTanosJlptWordSource");

test("cleanExtractedLines removes Tanos PDF boilerplate", () => {
    assert.deepEqual(cleanExtractedLines([
        "JLPT Resources – http://www.tanos.co.uk/jlpt/",
        "1",
        "JLPT N3 Vocab List",
        "This is not a cumulative list. (It doesn't contain the vocab needed by JLPT N4",
        "and below).",
        "Kanji",
        "Hiragana",
        "English",
        "愛",
    ].join("\n")), ["愛"]);
});

test("parseTanosJlptWordRows handles extracted PDF row shapes", () => {
    const result = parseTanosJlptWordRows([
        "Kanji",
        "Hiragana",
        "English",
        "愛",
        "あい",
        "love",
        "あっ",
        "Ah!,Oh!",
        "いつも",
        "いつも",
        "always,usually",
        "お目に掛",
        "かる",
        "おめにかかる",
        "思い出",
        "おもいで",
        "memories",
        "ジェット",
        "機",
        "ジェットき",
        "jet aeroplane",
        "したがっ",
        "て",
        "したがって",
        "therefore",
        "すみませ",
        "ん",
        "（感）",
        "sorry,excuse me",
        "できる",
        "（可能。出現。",
        "発生）",
        "to be able to,to be ready,to occur",
        "それと",
        "それとも",
        "or,or else",
    ].join("\n"), {
        level: 3,
        sourceId: "fixture-tanos-n3",
        sourceLabel: "Fixture Tanos N3",
    });

    assert.deepEqual(result.rows.map((row) => [row.written, row.reading, row.meaning]), [
        ["愛", "あい", "love"],
        ["あっ", "あっ", "Ah!,Oh!"],
        ["いつも", "いつも", "always,usually"],
        ["お目に掛かる", "おめにかかる", ""],
        ["思い出", "おもいで", "memories"],
        ["ジェット機", "ジェットき", "jet aeroplane"],
        ["したがって", "したがって", "therefore"],
        ["すみません", "すみません", "（感） sorry,excuse me"],
        ["できる", "できる", "（可能。出現。 発生） to be able to,to be ready,to occur"],
        ["それと", "それとも", "or,or else"],
    ]);
    assert.equal(result.rows[0].jlpt, "N3");
    assert.equal(result.rows[0].source, "fixture-tanos-n3");
    assert.match(result.rows[0].notes, /Discovery and weak level hint only/);
    assert.match(result.rows[0].notes, /Fixture Tanos N3/);
});

test("buildTanosJlptWordSource formats normalized TSV", () => {
    const result = buildTanosJlptWordSource({
        level: "N3",
        sourceText: [
            "愛",
            "あい",
            "love",
        ].join("\n"),
        sourceId: "fixture",
        sourceLabel: "Fixture",
    });

    assert.equal(result.rowCount, 1);
    assert.equal(result.tsv, formatTanosWordRowsAsTsv(result.rows));
    assert.match(result.tsv, /^written\treading\tmeaning\tjlpt\tsource\tnotes\n愛\tあい\tlove\tN3\tfixture\t/m);
    assert.match(result.tsv, new RegExp(DEFAULT_ATTRIBUTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

function mnemosyneItem({ question, answer }) {
    return [
        "(imnemosyne.core.mnemosyne_core",
        "Item",
        "(dp1",
        "S'a'",
        `V${JSON.stringify(answer)}`,
        "p2",
        "sS'q'",
        `V${JSON.stringify(question)}`,
        "p3",
        "sba",
    ].join("\n");
}

test("parseTanosJlptWordMnemosyneRows pairs English and reading exports", () => {
    const englishMemText = [
        mnemosyneItem({ question: "あいかわらず", answer: "as ever,as usual,the same" }),
        mnemosyneItem({ question: "遭う", answer: "to meet,to encounter" }),
        mnemosyneItem({ question: "紅葉", answer: "autumn colours,maple" }),
    ].join("\n");
    const readingMemText = [
        mnemosyneItem({ question: "遭う", answer: "あう" }),
        mnemosyneItem({ question: "紅葉", answer: "こうよう" }),
        mnemosyneItem({ question: "紅葉", answer: "もみじ" }),
    ].join("\n");

    const result = parseTanosJlptWordMnemosyneRows({
        englishMemText,
        readingMemText,
        level: 2,
        sourceId: "fixture-tanos-n2",
        sourceLabel: "Fixture Tanos N2",
    });

    assert.deepEqual(result.rows.map((row) => [row.written, row.reading, row.meaning]), [
        ["あいかわらず", "あいかわらず", "as ever,as usual,the same"],
        ["遭う", "あう", "to meet,to encounter"],
        ["紅葉", "こうよう", "autumn colours,maple"],
        ["紅葉", "もみじ", "autumn colours,maple"],
    ]);
    assert.equal(result.englishItemCount, 3);
    assert.equal(result.readingItemCount, 3);
    assert.equal(result.sourceRecordCount, 6);
    assert.match(result.rows[0].notes, /paired Mnemosyne export/);

    assert.deepEqual(parseMnemosyneItems(englishMemText).map((item) => [item.question, item.answer]), [
        ["あいかわらず", "as ever,as usual,the same"],
        ["遭う", "to meet,to encounter"],
        ["紅葉", "autumn colours,maple"],
    ]);

    const built = buildTanosJlptWordSourceFromMnemosyne({
        englishMemText,
        readingMemText,
        level: "N2",
        sourceId: "fixture-tanos-n2",
        sourceLabel: "Fixture Tanos N2",
    });
    assert.equal(built.rowCount, 4);
    assert.match(built.tsv, /紅葉\tもみじ\tautumn colours,maple\tN2\tfixture-tanos-n2/);
});

test("buildTanosJlptWordSourceFromMnemosyne can emit reviewed source evidence columns", () => {
    const result = buildTanosJlptWordSourceFromMnemosyne({
        englishMemText: mnemosyneItem({ question: "水", answer: "water" }),
        readingMemText: mnemosyneItem({ question: "水", answer: "みず" }),
        level: "N5",
        sourceId: "fixture-tanos-n5",
        sourceLabel: "Fixture Tanos N5",
        reviewedEvidence: {
            citation: "Fixture Tanos N5 machine-readable export",
            evidenceRefPrefix: "fixture paired exports",
        },
    });

    assert.equal(result.rows[0].reviewStatus, "reviewed");
    assert.equal(result.rows[0].citation, "Fixture Tanos N5 machine-readable export");
    assert.equal(result.rows[0].evidenceRef, "fixture paired exports; normalized paired row 1");
    assert.match(result.tsv, /^written\treading\tmeaning\tjlpt\tsource\treviewStatus\tcitation\tevidenceRef\tnotes\n/);
    assert.match(result.tsv, /水\tみず\twater\tN5\tfixture-tanos-n5\treviewed\tFixture Tanos N5 machine-readable export\tfixture paired exports; normalized paired row 1/);
});

test("reviewed Tanos output leaves duplicate exact identities pending", () => {
    const result = buildTanosJlptWordSourceFromMnemosyne({
        englishMemText: [
            mnemosyneItem({ question: "水", answer: "water" }),
            mnemosyneItem({ question: "水", answer: "water duplicate" }),
        ].join("\n"),
        readingMemText: mnemosyneItem({ question: "水", answer: "みず" }),
        level: "N5",
        sourceId: "fixture-tanos-n5",
        sourceLabel: "Fixture Tanos N5",
        reviewedEvidence: {
            citation: "Fixture citation",
            evidenceRefPrefix: "fixture refs",
        },
    });

    assert.equal(result.rows[0].reviewStatus, "reviewed");
    assert.equal(result.rows[1].reviewStatus, "needs_review");
    assert.match(result.rows[1].notes, /Duplicate exact identity/);
    assert.match(result.tsv, /water duplicate\tN5\tfixture-tanos-n5\tneeds_review\tFixture citation\tfixture refs; normalized paired row 2/);
});

test("normalizeTanosJlptWordSource script parses args and reports read-only scope", () => {
    const options = parseArgs([
        "--level=N5",
        "--input=downloads/tanos/n5/n5-vocab-kanji-eng.mem",
        "--reading-input=downloads/tanos/n5/n5-vocab-kanji-hiragana.mem",
        "--out=downloads/tanos-n5-vocab.tsv",
        "--reviewed",
        "--citation=Fixture citation",
        "--evidence-ref=Fixture evidence ref",
        "--json",
    ]);

    assert.equal(normalizeLevel(options.level), 5);
    assert.equal(options.input, "downloads/tanos/n5/n5-vocab-kanji-eng.mem");
    assert.equal(options.readingInput, "downloads/tanos/n5/n5-vocab-kanji-hiragana.mem");
    assert.equal(options.out, "downloads/tanos-n5-vocab.tsv");
    assert.equal(options.reviewed, true);
    assert.equal(options.citation, "Fixture citation");
    assert.equal(options.evidenceRef, "Fixture evidence ref");
    assert.equal(options.json, true);

    const text = formatNormalizeReport({
        inputPath: "downloads/tanos/n2/VocabList.N2.txt",
        outPath: "downloads/tanos-n2-vocab.tsv",
        result: {
            rows: [{ jlpt: "N2" }],
            sourceLabel: "Fixture Tanos N2",
            sourceUrl: "https://example.com/n2.pdf",
            sourceRecordCount: 6,
            englishItemCount: 3,
            readingItemCount: 3,
            rowCount: 1,
            skippedLines: [],
        },
    });

    assert.match(text, /Level: N2/);
    assert.match(text, /Source records parsed: 6/);
    assert.match(text, /does not approve cards, verify dictionary identity, move words, generate decks, or change readiness/);
});
