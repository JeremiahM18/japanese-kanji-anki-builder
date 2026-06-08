const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWordExportOptions, parseArgs, parseWordTsvForPlatinum } = require("../scripts/reviewPlatinumWordLevel");
const { parseArgs: parseBatchReportArgs } = require("../scripts/platinumWordBatchReport");
const { parseArgs: parseSapphireArgs } = require("../scripts/reviewSapphireWordLevel");
const { parseArgs: parseSapphireBatchReportArgs } = require("../scripts/sapphireWordBatchReport");
const { parseArgs: parseRereviewStatusArgs } = require("../scripts/reportObsidianWordRereviewStatus");
const { parseArgs: parseCertificationStatusArgs } = require("../scripts/reportObsidianWordCertificationStatus");
const { parseArgs: parseSourcePostureArgs } = require("../scripts/reportPlatinumWordSourcePosture");
const { parseArgs: parsePlatinumGovernanceGateArgs } = require("../scripts/runPlatinumGovernanceGate");

test("parseArgs accepts platinum word review options", () => {
    const options = parseArgs(["--level=5", "--json", "--require-all", "--allow-empty"]);

    assert.deepEqual(options, {
        allowEmpty: true,
        json: true,
        level: 5,
        proofProvider: "ledger-if-available",
        requireCurrentReviewStandard: true,
        requireAllRows: true,
        unknownArgs: [],
    });
});

test("parseArgs can opt into legacy word platinum inspection", () => {
    const options = parseArgs(["--level=5", "--allow-legacy-standard"]);

    assert.equal(options.requireCurrentReviewStandard, false);
});

test("parseArgs accepts explicit word platinum proof provider audits", () => {
    const options = parseArgs(["--level=5", "--proof-provider=inline", "--oops"]);

    assert.equal(options.proofProvider, "inline");
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("platinumWordBatchReport parseArgs accepts scoped read-only batch options", () => {
    const options = parseBatchReportArgs(["--level=N5", "--words=今日:きょう,八日|ようか", "--limit=2", "--queue=missing-current-standard", "--json", "--oops"]);

    assert.deepEqual(options, {
        json: true,
        level: 5,
        limit: 2,
        proofProvider: undefined,
        queue: "missing-current-standard",
        unknownArgs: ["--oops"],
        words: [
            { word: "今日", reading: "きょう" },
            { word: "八日", reading: "ようか" },
        ],
    });
});

test("platinumWordBatchReport defaults word review batches to eight cards", () => {
    const options = parseBatchReportArgs(["--level=N5"]);

    assert.equal(options.limit, 8);
    assert.equal(options.queue, "missing-current-standard");
    assert.equal(options.proofProvider, undefined);
});

test("platinumWordBatchReport parseArgs accepts explicit proof provider audits", () => {
    const options = parseBatchReportArgs(["--level=N5", "--proof-provider=ledger"]);

    assert.equal(options.proofProvider, "ledger");
});

test("parseArgs accepts first-class Sapphire word review options", () => {
    const options = parseSapphireArgs(["--level=5", "--json", "--require-all", "--allow-empty"]);

    assert.deepEqual(options, {
        allowEmpty: true,
        json: true,
        level: 5,
        requireCurrentReviewStandard: true,
        requireAllRows: true,
        unknownArgs: [],
    });
});

test("sapphireWordBatchReport defaults to missing current-standard structure", () => {
    const options = parseSapphireBatchReportArgs(["--level=N5"]);

    assert.equal(options.limit, 8);
    assert.equal(options.queue, "missing-current-standard");
    assert.deepEqual(options.words, []);
});

test("sapphireWordBatchReport parseArgs accepts scoped read-only batch options", () => {
    const options = parseSapphireBatchReportArgs(["--level=N5", "--words=今日:きょう,八日|ようか", "--limit=2", "--queue=substantive-rereview", "--json", "--oops"]);

    assert.deepEqual(options, {
        json: true,
        level: 5,
        limit: 2,
        queue: "substantive-rereview",
        unknownArgs: ["--oops"],
        words: [
            { word: "今日", reading: "きょう" },
            { word: "八日", reading: "ようか" },
        ],
    });
});

test("obsidian word proof status parseArgs accepts scoped read-only status options", () => {
    const options = parseRereviewStatusArgs(["--levels=5,4", "--json", "--oops"]);

    assert.deepEqual(options, {
        json: true,
        levels: [5, 4],
        proofProvider: "ledger-if-available",
        unknownArgs: ["--oops"],
    });
});

test("obsidian word proof status parseArgs accepts explicit proof provider audits", () => {
    const options = parseRereviewStatusArgs(["--levels=5,4", "--proof-provider=ledger"]);

    assert.equal(options.proofProvider, "ledger");
});

test("obsidian word proof status parseArgs accepts scoped default provider overrides", () => {
    const options = parseRereviewStatusArgs([], {
        defaultProofProvider: "inline",
    });

    assert.equal(options.proofProvider, "inline");
});

test("obsidian word certification status parseArgs accepts scoped fail-closed status options", () => {
    const options = parseCertificationStatusArgs(["--levels=5,4", "--json", "--oops"]);

    assert.deepEqual(options, {
        json: true,
        levels: [5, 4],
        proofProvider: "ledger-if-available",
        unknownArgs: ["--oops"],
    });
});

test("obsidian word certification status parseArgs accepts explicit proof provider audits", () => {
    const options = parseCertificationStatusArgs(["--levels=5,4", "--proof-provider=inline"]);

    assert.equal(options.proofProvider, "inline");
});

test("platinum word source posture parseArgs accepts scoped read-only posture options", () => {
    const options = parseSourcePostureArgs(["--level=5", "--json", "--oops"]);

    assert.deepEqual(options, {
        json: true,
        levels: [5],
        unknownArgs: ["--oops"],
    });
});

test("platinum governance gate parseArgs accepts scoped real-row gate options", () => {
    const options = parsePlatinumGovernanceGateArgs(["--kanji-levels=5,4", "--word-levels=5", "--json", "--oops"]);

    assert.deepEqual(options, {
        json: true,
        kanjiLevels: [5, 4],
        proofProvider: "ledger-if-available",
        wordLevels: [5],
        unknownArgs: ["--oops"],
    });
});

test("platinum governance gate parseArgs accepts kanji proof-provider override", () => {
    const options = parsePlatinumGovernanceGateArgs(["--proof-provider=inline"]);

    assert.equal(options.proofProvider, "inline");
});

test("platinum word row builder uses the managed media root for exact word audio", () => {
    const options = buildWordExportOptions({
        level: 5,
        config: { mediaRootDir: "C:/repo/data/media" },
        jlptOnlyJson: { 日: { jlpt: 5 } },
        jlptWordLevelContract: { wordLevels: {} },
        kanjiApiClient: {},
        strokeOrderService: {},
        audioService: {},
    });

    assert.equal(options.mediaRootDir, "C:/repo/data/media");
    assert.equal(options.includeInferred, false);
});

test("parseWordTsvForPlatinum preserves release-critical word card fields", () => {
    const rows = parseWordTsvForPlatinum([
        "Word	Reading	ReadingBreakdown	Audio	PitchAccent	Meaning	JLPTLevel	CoverageRole	FocusKanji	CoversReading	KanjiBreakdown	ExampleSentence	Notes",
        "今日	きょう	<ruby>今日<rt>きょう</rt></ruby>	[sound:word-今日-きょう.wav]	<span>きょう</span>	today	JLPT N5	JLPT core + reading coverage	今、日	今: いま ／ 日: ひ	<div>今</div>	今日は図書館へ行きます。	Common word.",
    ].join("\n"));

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        word: "今日",
        reading: "きょう",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        audio: "[sound:word-今日-きょう.wav]",
        pitchAccent: "<span>きょう</span>",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "<div>今</div>",
        exampleSentence: "今日は図書館へ行きます。",
        notes: "Common word.",
    });
});
