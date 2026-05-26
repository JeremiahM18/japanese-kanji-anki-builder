const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const {
    buildKanjidic2ReadingReferenceContract,
    extractKanjidic2ReadingReference,
} = require("../src/services/kanjidic2ReadingReferenceService");
const {
    formatBuildReport,
    parseArgs,
} = require("../scripts/buildKanjidic2ReadingReferenceContract");

function buildFixtureXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
  <header>
    <file_version>4</file_version>
    <database_version>fixture</database_version>
    <date_of_creation>2026-05-26</date_of_creation>
  </header>
  <character>
    <literal>日</literal>
    <reading_meaning>
      <rmgroup>
        <reading r_type="ja_on">ニチ</reading>
        <reading r_type="ja_on">ジツ</reading>
        <reading r_type="ja_kun">ひ</reading>
        <reading r_type="ja_kun">-び</reading>
        <reading r_type="pinyin">ri4</reading>
      </rmgroup>
      <nanori>あき</nanori>
    </reading_meaning>
  </character>
  <character>
    <literal>好</literal>
    <reading_meaning>
      <rmgroup>
        <reading r_type="ja_on">コウ</reading>
        <reading r_type="ja_kun">この.む</reading>
        <reading r_type="ja_kun">す.く</reading>
      </rmgroup>
    </reading_meaning>
  </character>
  <character>
    <literal>々</literal>
    <reading_meaning>
      <rmgroup>
        <reading r_type="ja_kun">おなじ</reading>
      </rmgroup>
    </reading_meaning>
  </character>
</kanjidic2>`;
}

test("extractKanjidic2ReadingReference tracks only source ja_on and ja_kun readings", () => {
    const result = extractKanjidic2ReadingReference(buildFixtureXml(), {
        jlptLevelContract: {
            kanjiLevels: {
                日: 5,
                好: 4,
            },
        },
    });

    assert.equal(result.sourceCharacterCount, 3);
    assert.deepEqual(Object.keys(result.entries), ["好", "日"]);
    assert.deepEqual(result.entries["日"].onReadings, ["ニチ", "ジツ"]);
    assert.deepEqual(result.entries["日"].kunReadings, ["ひ", "-び"]);
    assert.deepEqual(result.entries["日"].normalizedOnReadings, ["にち", "じつ"]);
    assert.deepEqual(result.entries["日"].normalizedKunReadings, ["ひ", "び"]);
    assert.deepEqual(result.entries["好"].normalizedKunReadings, ["このむ", "すく"]);
    assert.equal(result.entries["日"].sourceRef, "edrdg-kanjidic2:literal:日:reading-meaning/rmgroup/reading");
    assert.deepEqual(result.missingKanji, []);
});

test("buildKanjidic2ReadingReferenceContract pins source identity and use limits", () => {
    const sourceBuffer = zlib.gzipSync(Buffer.from(buildFixtureXml(), "utf8"));
    const contract = buildKanjidic2ReadingReferenceContract({
        sourceBuffer,
        jlptLevelContract: {
            kanjiLevels: {
                日: 5,
                好: 4,
            },
        },
        sourcePath: "downloads/fixture.xml.gz",
        checkedAt: "2026-05-26",
    });

    assert.equal(contract.contractType, "kanji-reading-reference");
    assert.equal(contract.sourceFile.path, "downloads/fixture.xml.gz");
    assert.match(contract.sourceFile.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(contract.sourceFile.header.databaseVersion, "fixture");
    assert.deepEqual(contract.sourceUse.allowedUse, ["kanji-reading-reference"]);
    assert.equal(contract.sourceUse.disallowedUse.includes("kanji-field-verification"), true);
    assert.equal(contract.sourceUse.disallowedUse.includes("placement-claim-origin"), true);
    assert.equal(contract.extraction.readingTypesIncluded.join(","), "ja_on,ja_kun");
    assert.equal(contract.coverage.contractKanjiCount, 2);
    assert.equal(contract.coverage.entryCount, 2);
});

test("extractKanjidic2ReadingReference does not expand XML entities", () => {
    const result = extractKanjidic2ReadingReference(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE kanjidic2 [<!ENTITY probe "日">]>
<kanjidic2>
  <character>
    <literal>&probe;</literal>
    <reading_meaning>
      <rmgroup><reading r_type="ja_kun">ひ</reading></rmgroup>
    </reading_meaning>
  </character>
</kanjidic2>`, {
        jlptLevelContract: {
            kanjiLevels: {
                日: 5,
            },
        },
    });

    assert.equal(result.sourceCharacterCount, 1);
    assert.deepEqual(result.entries, {});
    assert.deepEqual(result.missingKanji, ["日"]);
});

test("buildKanjidic2ReadingReferenceContract script parses args and reports boundaries", () => {
    const options = parseArgs([
        "--input=downloads/custom.xml.gz",
        "--out=templates/custom-reading-reference.json",
        "--contract=templates/custom-contract.json",
        "--checked-at=2026-05-26",
        "--json",
    ]);

    assert.equal(options.input, "downloads/custom.xml.gz");
    assert.equal(options.out, "templates/custom-reading-reference.json");
    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.checkedAt, "2026-05-26");
    assert.equal(options.json, true);

    const text = formatBuildReport({
        inputPath: "downloads/custom.xml.gz",
        outPath: "templates/custom-reading-reference.json",
        contractPath: "templates/custom-contract.json",
        contract: {
            sourceFile: {
                sha256: "abc",
                byteSize: 123,
                header: { databaseVersion: "fixture" },
            },
            coverage: {
                sourceCharacterCount: 10,
                contractKanjiCount: 2,
                entryCount: 2,
                missingEntryCount: 0,
                missingOnReading: 0,
                missingKunReading: 1,
            },
        },
    });

    assert.match(text, /allowed: kanji-reading-reference/);
    assert.match(text, /disallowed: kanji-field-verification/);
    assert.match(text, /does not move JLPT levels, verify full card fields, certify cards, or change release readiness/);
});
