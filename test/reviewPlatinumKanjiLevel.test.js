const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs, parseKanjiTsvForPlatinum } = require("../scripts/reviewPlatinumKanjiLevel");
const { parseArgs: parseAdditionalArgs } = require("../scripts/reviewPlatinumAdditionalKanjiLevel");
const { parseArgs: parseBatchReportArgs } = require("../scripts/platinumKanjiBatchReport");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
} = require("../src/services/obsidianProofProviderService");

test("parseArgs accepts platinum kanji review options", () => {
    const options = parseArgs(["--level=5", "--json", "--require-all", "--allow-empty"]);

    assert.deepEqual(options, {
        allowEmpty: true,
        json: true,
        level: 5,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
        requireCurrentReviewStandard: true,
        requireAllRows: true,
        unknownArgs: [],
    });
});

test("parseArgs allows explicit legacy platinum inspection", () => {
    const options = parseArgs(["--level=5", "--allow-legacy-standard", "--proof-provider=inline", "--oops"]);

    assert.equal(options.requireCurrentReviewStandard, false);
    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.INLINE);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("parseArgs defaults platinum kanji review to ledger fallback proof provider", () => {
    const options = parseArgs(["--level=3"]);

    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE);
});

test("parseArgs accepts additional platinum kanji review options", () => {
    const options = parseAdditionalArgs([
        "--level=5",
        "--out-dir=out/custom-additional",
        "--json",
        "--require-all",
        "--allow-empty",
        "--allow-legacy-standard",
        "--oops",
    ]);

    assert.deepEqual(options, {
        allowEmpty: true,
        json: true,
        level: 5,
        outDir: "out/custom-additional",
        requireCurrentReviewStandard: false,
        requireAllRows: true,
        unknownArgs: ["--oops"],
    });
});

test("parseKanjiTsvForPlatinum preserves release-critical kanji card fields", () => {
    const rows = parseKanjiTsvForPlatinum([
        "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
        "日\t日\tday\tひ\tday / sun\t\tOn: ニチ\tKun: ひ\t<img src=\"65E5_日-stroke-order.gif\" />\t[sound:65E5_日-kanji-reading-日-ひ.wav]\t日\t<ruby>日<rt>ひ</rt></ruby> - day\t雨の日です。",
    ].join("\n"), { level: 5 });

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        kanji: "日",
        levelLabel: "N5",
        displayWord: "日",
        meaningJP: "day",
        primaryReading: "ひ",
        kanjiMeanings: "day / sun",
        studyWordKanji: "",
        onReading: "On: ニチ",
        kunReading: "Kun: ひ",
        strokeOrder: "<img src=\"65E5_日-stroke-order.gif\" />",
        audio: "[sound:65E5_日-kanji-reading-日-ひ.wav]",
        radical: "日",
        notes: "<ruby>日<rt>ひ</rt></ruby> - day",
        exampleSentence: "雨の日です。",
    });
});

test("platinumKanjiBatchReport parseArgs accepts scoped read-only batch options", () => {
    const options = parseBatchReportArgs([
        "--level=N5",
        "--kanji=日,本",
        "--limit=2",
        "--proof-provider=inline",
        "--queue=missing-current-standard",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options, {
        json: true,
        kanji: ["日", "本"],
        level: 5,
        limit: 2,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
        queue: "missing-current-standard",
        unknownArgs: ["--oops"],
    });
});

test("platinumKanjiBatchReport parseArgs defaults to ledger fallback proof provider", () => {
    const options = parseBatchReportArgs([]);

    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE);
});
