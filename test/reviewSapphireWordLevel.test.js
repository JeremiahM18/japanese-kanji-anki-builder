const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseArgs,
    readGoldenReviewSet,
    readSapphireReviewSet,
} = require("../scripts/reviewSapphireWordLevel");
const {
    ACTIVE_WORD_SAPPHIRE_STATUSES,
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    evaluateSapphireWordReviewSet,
    formatSapphireWordReviewReport,
} = require("../src/services/sapphireWordReviewService");

const ROOT_DIR = path.resolve(__dirname, "..");

function normalizeList(values = []) {
    return (Array.isArray(values) ? values : []).filter(Boolean);
}

function activeEntries(entries = []) {
    return entries.filter((entry) => ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status));
}

function findGoldenExpectation(entry = {}, goldenExpectations = []) {
    const reading = normalizeList(entry.readingIncludes)[0] || "";
    return goldenExpectations.find((expectation) => (
        expectation.word === entry.word
        && normalizeList(expectation.readingIncludes).includes(reading)
    )) || {};
}

function mergeProtectedSnippets(primary = [], secondary = []) {
    return [...new Set([...normalizeList(primary), ...normalizeList(secondary)])];
}

function buildSyntheticRows(entries = [], goldenExpectations = []) {
    return activeEntries(entries).map((entry) => {
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const golden = findGoldenExpectation(entry, goldenExpectations);
        const pitchAccent = normalizeList(entry.pitchAccentIncludes)
            .map((snippet) => `<span aria-label="${snippet}">${snippet}</span>`)
            .join(" ");

        return {
            word: entry.word,
            reading,
            readingBreakdown: `<ruby>${entry.word}<rt>${reading}</rt></ruby>`,
            audio: `[sound:word-reading-${entry.word}-${reading}.wav]`,
            pitchAccent,
            meaning: mergeProtectedSnippets(entry.meaningIncludes, golden.meaningIncludes).join(" / "),
            jlptLevel: mergeProtectedSnippets(entry.jlptLevelIncludes, golden.jlptLevelIncludes).join(" / "),
            coverageRole: mergeProtectedSnippets(entry.coverageRoleIncludes, golden.coverageRoleIncludes).join(" / "),
            focusKanji: mergeProtectedSnippets(entry.focusIncludes, golden.focusIncludes).join("、"),
            coversReading: mergeProtectedSnippets(entry.coversReadingIncludes, golden.coversReadingIncludes).join(" ／ "),
            kanjiBreakdown: mergeProtectedSnippets(entry.breakdownIncludes, golden.breakdownIncludes).join(" ／ "),
            exampleSentence: mergeProtectedSnippets(entry.exampleIncludes, golden.exampleIncludes).join(" / "),
            notes: mergeProtectedSnippets(entry.notesIncludes, golden.notesIncludes).join(" / "),
        };
    });
}

test("reviewSapphireWordLevel CLI args default to strict current-standard review", () => {
    const options = parseArgs(["--level=3", "--require-all", "--json", "--allow-empty"]);

    assert.equal(options.level, 3);
    assert.equal(options.requireAllRows, true);
    assert.equal(options.requireCurrentReviewStandard, true);
    assert.equal(options.json, true);
    assert.equal(options.allowEmpty, true);
    assert.deepEqual(options.unknownArgs, []);

    const legacyOptions = parseArgs(["--level=3", "--allow-legacy-standard", "--unexpected"]);
    assert.equal(legacyOptions.requireCurrentReviewStandard, false);
    assert.deepEqual(legacyOptions.unknownArgs, ["--unexpected"]);
});

test("formatSapphireWordReviewReport labels inactive decisions as deferred/removed tracked", () => {
    const formatted = formatSapphireWordReviewReport({
        totalEntries: 3,
        generatedRowCount: 1,
        activeSapphireCount: 1,
        currentStandardSapphireCount: 1,
        nonShippingCount: 2,
        failedCount: 0,
        passed: true,
        results: [
            { label: "本 (ほん)", status: "sapphire", passed: true },
            { label: "会う (あう)", status: "deferred", passed: true },
        ],
    });

    assert.match(formatted, /Active generated rows: 1/);
    assert.match(formatted, /Sapphire cards: 1\/1/);
    assert.match(formatted, /Current-standard Sapphire cards: 1\/1/);
    assert.match(formatted, /Review ledger entries: 3/);
    assert.match(formatted, /Deferred\/removed tracked: 2 \(audit-only; not active backlog\)/);
    assert.match(formatted, /会う \(あう\): manifest status=deferred; inactive decision valid/);
    assert.doesNotMatch(formatted, /Passed entries/);
    assert.doesNotMatch(formatted, /deferred; Sapphire gate pass/);
    assert.doesNotMatch(formatted, /Non-Sapphire ledger/);
});

test("reviewSapphireWordLevel reads N3 Sapphire and prior Gold lane inputs", () => {
    const sapphireEntries = readSapphireReviewSet(3, { cwd: ROOT_DIR });
    const goldenExpectations = readGoldenReviewSet(3, { cwd: ROOT_DIR });
    const activeSapphireEntries = activeEntries(sapphireEntries);

    assert.equal(goldenExpectations.length, 1081);
    assert.ok(activeSapphireEntries.length >= 18);
    assert.ok(
        activeSapphireEntries.every((entry) => entry.reviewStandard === CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD)
    );
});

test("reviewSapphireWordLevel reviewed N3 Sapphire rows pass without requiring full coverage", () => {
    const sapphireEntries = readSapphireReviewSet(3, { cwd: ROOT_DIR });
    const goldenExpectations = readGoldenReviewSet(3, { cwd: ROOT_DIR });
    const rows = buildSyntheticRows(sapphireEntries, goldenExpectations);
    const report = evaluateSapphireWordReviewSet({
        rows,
        entries: sapphireEntries,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
        requireAllRows: false,
    });

    assert.equal(report.failedCount, 0, formatSapphireWordReviewReport(report));
    assert.deepEqual(report.coverageFailures, []);
    assert.equal(report.passed, true, formatSapphireWordReviewReport(report));
});
