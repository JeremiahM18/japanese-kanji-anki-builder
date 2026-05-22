const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const {
    buildKanjidic2JlptSource,
    decodeKanjidic2Buffer,
    extractKanjidic2JlptRows,
    formatKanjidic2JlptRowsAsTsv,
    normalizeLegacyJlptLevel,
} = require("../src/services/kanjidic2JlptSourceService");
const {
    formatNormalizeReport,
    parseArgs,
} = require("../scripts/normalizeKanjidic2JlptSource");

function buildFixtureXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
  <header>
    <file_version>4</file_version>
    <database_version>fixture</database_version>
    <date_of_creation>2026-05-05</date_of_creation>
  </header>
  <character>
    <literal>日</literal>
    <misc><jlpt>4</jlpt></misc>
  </character>
  <character>
    <literal>語</literal>
    <misc><jlpt>3</jlpt></misc>
  </character>
  <character>
    <literal>鬱</literal>
    <misc><jlpt>1</jlpt></misc>
  </character>
  <character>
    <literal>橋</literal>
    <misc><jlpt>2</jlpt></misc>
  </character>
  <character>
    <literal>々</literal>
    <misc><stroke_count>3</stroke_count></misc>
  </character>
  <character>
    <literal>丈</literal>
    <misc><jlpt>1</jlpt></misc>
  </character>
</kanjidic2>`;
}

test("normalizeLegacyJlptLevel maps only safe legacy JLPT levels", () => {
    assert.deepEqual(normalizeLegacyJlptLevel("4"), {
        legacyLevel: 4,
        modernLevel: 5,
        reason: null,
    });
    assert.deepEqual(normalizeLegacyJlptLevel("3"), {
        legacyLevel: 3,
        modernLevel: 4,
        reason: null,
    });
    assert.deepEqual(normalizeLegacyJlptLevel("1"), {
        legacyLevel: 1,
        modernLevel: 1,
        reason: null,
    });

    const oldLevelTwo = normalizeLegacyJlptLevel("2");
    assert.equal(oldLevelTwo.legacyLevel, 2);
    assert.equal(oldLevelTwo.modernLevel, null);
    assert.deepEqual(oldLevelTwo.modernLevelRange, [2, 3]);
    assert.equal(oldLevelTwo.reason, null);
});

test("extractKanjidic2JlptRows emits reviewed rows and preserves legacy level 2 as range evidence", () => {
    const result = extractKanjidic2JlptRows(buildFixtureXml());

    assert.equal(result.sourceCharacterCount, 6);
    assert.deepEqual(result.rows.map((row) => `${row.kanji}:${row.legacyJlptLevel}`), [
        "丈:1",
        "鬱:1",
        "橋:2",
        "語:3",
        "日:4",
    ]);
    assert.equal(result.rows.every((row) => row.reviewStatus === "reviewed"), true);
    assert.equal(result.rows.every((row) => row.citation.includes("EDRDG KANJIDIC2")), true);
    assert.deepEqual(result.skipped, []);
    assert.match(result.rows.find((row) => row.kanji === "橋").notes, /N2\/N3 range evidence/);
});

test("extractKanjidic2JlptRows can scope normalized assignments to the current contract", () => {
    const result = extractKanjidic2JlptRows(buildFixtureXml(), {
        contractKanjiSet: new Set(["日", "語", "鬱", "橋"]),
    });

    assert.deepEqual(result.rows.map((row) => row.kanji), ["鬱", "橋", "語", "日"]);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped.find((row) => row.kanji === "丈").reason, /outside the current JLPT kanji contract/);
});

test("extractKanjidic2JlptRows does not expand XML entities", () => {
    const result = extractKanjidic2JlptRows(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE kanjidic2 [<!ENTITY probe "日">]>
<kanjidic2>
  <character>
    <literal>&probe;</literal>
    <misc><jlpt>4</jlpt></misc>
  </character>
</kanjidic2>`);

    assert.equal(result.sourceCharacterCount, 1);
    assert.deepEqual(result.rows.map((row) => row.kanji), ["&probe;"]);
    assert.notDeepEqual(result.rows.map((row) => row.kanji), ["日"]);
});

test("buildKanjidic2JlptSource supports gzipped XML and deterministic TSV output", () => {
    const sourceBuffer = zlib.gzipSync(Buffer.from(buildFixtureXml(), "utf8"));
    assert.match(decodeKanjidic2Buffer(sourceBuffer), /<kanjidic2>/);

    const result = buildKanjidic2JlptSource({
        sourceBuffer,
        contract: { kanjiLevels: { 日: 5, 語: 4, 鬱: 1, 橋: 2 } },
    });
    assert.equal(result.rowCount, 4);
    assert.equal(result.skippedCount, 1);
    assert.deepEqual(result.legacyLevelCounts, {
        1: 1,
        2: 1,
        3: 1,
        4: 1,
    });
    assert.deepEqual(result.skippedLevelCounts, {
        1: 1,
    });
    assert.equal(result.skippedReasonCounts["outside the current JLPT kanji contract; excluded from source assignment import"], 1);
    assert.match(result.tsv, /^kanji\tlegacyJlptLevel\treviewStatus\tcitation\tevidenceRef\tnotes\n鬱\t1\t/m);
    assert.equal(result.tsv, formatKanjidic2JlptRowsAsTsv(result.rows));
});

test("normalizeKanjidic2JlptSource script parses args and formats read-only report", () => {
    const options = parseArgs([
        "--input=downloads/custom.xml.gz",
        "--out=downloads/custom.tsv",
        "--contract=templates/custom-contract.json",
        "--json",
    ]);

    assert.equal(options.input, "downloads/custom.xml.gz");
    assert.equal(options.out, "downloads/custom.tsv");
    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.json, true);

    const text = formatNormalizeReport({
        inputPath: "downloads/custom.xml.gz",
        outPath: "downloads/custom.tsv",
        contractPath: "templates/custom-contract.json",
        result: {
            sourceCharacterCount: 5,
            rowCount: 3,
            skippedCount: 1,
            legacyLevelCounts: { 1: 1, 2: 1, 4: 1 },
            skippedLevelCounts: {},
            skippedReasonCounts: {
                "outside the current JLPT kanji contract; excluded from source assignment import": 0,
            },
        },
    });

    assert.match(text, /old 4 -> N5: 1/);
    assert.match(text, /old 2 -> N2\/N3 range evidence: 1/);
    assert.match(text, /outside current contract: 0/);
    assert.match(text, /does not update tracked evidence, move kanji, move words, or change readiness/);
});
