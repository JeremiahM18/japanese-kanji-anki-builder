const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_ATTRIBUTION,
    buildTanosJlptWordSource,
    cleanExtractedLines,
    formatTanosWordRowsAsTsv,
    normalizeLevel,
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

test("normalizeTanosJlptWordSource script parses args and reports read-only scope", () => {
    const options = parseArgs([
        "--level=N2",
        "--input=downloads/tanos/n2/VocabList.N2.txt",
        "--out=downloads/tanos-n2-vocab.tsv",
        "--json",
    ]);

    assert.equal(normalizeLevel(options.level), 2);
    assert.equal(options.input, "downloads/tanos/n2/VocabList.N2.txt");
    assert.equal(options.out, "downloads/tanos-n2-vocab.tsv");
    assert.equal(options.json, true);

    const text = formatNormalizeReport({
        inputPath: "downloads/tanos/n2/VocabList.N2.txt",
        outPath: "downloads/tanos-n2-vocab.tsv",
        result: {
            rows: [{ jlpt: "N2" }],
            sourceLabel: "Fixture Tanos N2",
            sourceUrl: "https://example.com/n2.pdf",
            sourceLineCount: 3,
            rowCount: 1,
            skippedLines: [],
        },
    });

    assert.match(text, /Level: N2/);
    assert.match(text, /does not approve cards, verify dictionary identity, move words, generate decks, or change readiness/);
});
