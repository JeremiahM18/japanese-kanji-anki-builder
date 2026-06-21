const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
    buildWordInventoryExpansionCandidateReport,
    classifyCandidateDisposition,
    classifyKanjiScope,
    formatWordInventoryExpansionCandidateReport,
    normalizeTriageDecisions,
    normalizeTriageDecision,
    normalizeCandidateSourceRow,
    normalizeCandidateSourceRows,
    parseCandidateSourceText,
    parseDelimitedLine,
    parseSourceLevel,
    resolveTriageDecisionForPlacementMode,
    resolveCrossLevelRoutingTargetLevel,
    splitReadingVariants,
} = require("../src/services/wordInventoryExpansionCandidateService");

const jlptLevelContract = {
    kanjiLevels: {
        山: 5,
        川: 5,
        学: 5,
        校: 5,
        行: 5,
        手: 4,
        紙: 4,
        茶: 4,
        新: 4,
        幹: 4,
        線: 4,
        謎: 1,
    },
};

const jlptWordLevelContract = {
    wordLevels: {
        "学校|がっこう": { written: "学校", reading: "がっこう", jlpt: 5 },
        "行く|いく": { written: "行く", reading: "いく", jlpt: 5 },
    },
    excludedWordLevels: {
        "山の上|やまのうえ": { written: "山の上", reading: "やまのうえ", jlpt: 5, exclusionReason: "phrase" },
    },
};

test("parseCandidateSourceText reads TSV, CSV, and JSON candidate sources", () => {
    assert.deepEqual(parseDelimitedLine("\"山川\",さんせん,\"mountains, rivers\"", ","), [
        "山川",
        "さんせん",
        "mountains, rivers",
    ]);

    assert.deepEqual(parseCandidateSourceText("word\treading\tmeaning\n山川\tさんせん\tmountains and rivers"), [{
        word: "山川",
        reading: "さんせん",
        meaning: "mountains and rivers",
    }]);

    assert.deepEqual(parseCandidateSourceText("[{\"written\":\"山川\",\"reading\":\"さんせん\"}]"), [{
        written: "山川",
        reading: "さんせん",
    }]);
});

test("normalizeCandidateSourceRow maps common external vocab headers", () => {
    assert.deepEqual(normalizeCandidateSourceRow({
        Expression: "山川",
        Kana: "さんせん",
        English: "mountains and rivers",
        JLPT: "JLPT N5",
        Source: "fixture",
    }), {
        written: "山川",
        reading: "さんせん",
        meaning: "mountains and rivers",
        source: "fixture",
        notes: "",
        sourceLevel: 5,
        frequencyRank: null,
        key: "山川|さんせん",
    });

    assert.equal(parseSourceLevel("n4"), 4);
    assert.equal(parseSourceLevel(""), null);
});

test("buildWordInventoryExpansionCandidateReport keeps only new source words that match the requested kanji scope", () => {
    const sourceRows = [
        { written: "学校", reading: "がっこう", meaning: "school", jlpt: "N5" },
        { written: "山川", reading: "さんせん", meaning: "mountains and rivers", jlpt: "N5" },
        { written: "山川", reading: "さんせん", meaning: "duplicate", jlpt: "N5" },
        { written: "行く", reading: "いく/ゆく", meaning: "to go", jlpt: "N5" },
        { written: "～円", reading: "～えん", meaning: "yen suffix", jlpt: "N5" },
        { written: "おちゃ", reading: "おちゃ", meaning: "tea", jlpt: "N5" },
        { written: "お茶", reading: "おちゃ", meaning: "tea", jlpt: "N5" },
        { written: "新幹線", reading: "しんかんせん", meaning: "bullet train", jlpt: "N5" },
        { written: "山茶", reading: "やまちゃ", meaning: "mountain tea", jlpt: "N5" },
        { written: "山の上", reading: "やまのうえ", meaning: "on the mountain", jlpt: "N5" },
    ];

    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows,
        targetLevel: 5,
        kanjiScope: "at-or-below",
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
        triageDecisions: {
            "山川|さんせん": {
                decision: "move_candidate",
                targetLevel: "N4",
                priority: "high",
                reason: "Useful sourced word, but it belongs in the N4 learner lane.",
                nextStep: "Promote only through the N4 contract and starter data.",
            },
            "行く|ゆく": {
                decision: "reject_candidate",
                priority: "low",
                reason: "Same written duplicate.",
            },
        },
    });

    assert.equal(report.summary.sourceRows, 10);
    assert.equal(report.summary.normalizedRows, 11);
    assert.equal(report.summary.uniqueRows, 10);
    assert.equal(report.summary.duplicateSourceRows, 1);
    assert.equal(report.summary.reviewCandidateRows, 2);
    assert.equal(report.summary.sameWrittenCandidateRows, 1);
    assert.equal(report.summary.triagedCandidateRows, 2);
    assert.equal(report.summary.untriagedCandidateRows, 0);
    assert.deepEqual(report.summary.triageDecisions, {
        move_candidate: 1,
        reject_candidate: 1,
    });
    assert.equal(report.candidates[0].key, "山川|さんせん");
    assert.equal(report.candidates[0].triageDecision.decision, "move_candidate");
    assert.equal(report.candidates[0].triageDecision.targetLevel, 4);
    assert.equal(report.candidates[1].key, "行く|ゆく");
    assert.deepEqual(report.candidates[1].sameWrittenContractEntries, [{
        key: "行く|いく",
        reading: "いく",
        jlpt: 5,
        exclusionReason: "",
        type: "governed",
    }]);
    assert.equal(report.summary.dispositions.already_governed, 2);
    assert.equal(report.summary.dispositions.kana_only, 1);
    assert.equal(report.summary.dispositions.no_target_kanji, 2);
    assert.equal(report.summary.dispositions.kanji_scope_mismatch, 1);
    assert.equal(report.summary.dispositions.already_excluded, 1);
    assert.equal(report.summary.dispositions.source_template, 1);
});

test("cross-level source rows are visible without becoming current-level promotion candidates", () => {
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows: [{
            written: "手紙",
            reading: "てがみ",
            meaning: "letter",
            jlpt: "N5",
            source: "fixture",
        }],
        targetLevel: 5,
        kanjiScope: "at-or-below",
        requireSourceLevel: true,
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
        triageDecisions: {
            "手紙|てがみ": {
                decision: "move_candidate",
                targetLevel: "N4",
                priority: "normal",
                reason: "Source lists this as N5, but every known constituent kanji anchors in N4.",
                nextStep: "Review only through the N4 word contract and starter data.",
            },
        },
    });

    assert.equal(report.summary.reviewCandidateRows, 0);
    assert.equal(report.summary.triagedCandidateRows, 0);
    assert.equal(report.summary.crossLevelRoutingRows, 1);
    assert.equal(report.summary.triagedCrossLevelRoutingRows, 1);
    assert.equal(report.summary.untriagedCrossLevelRoutingRows, 0);
    assert.deepEqual(report.summary.crossLevelRoutingTriageDecisions, {
        move_candidate: 1,
    });
    assert.equal(report.candidates.length, 0);
    assert.equal(report.crossLevelRoutingCandidates[0].key, "手紙|てがみ");
    assert.equal(report.crossLevelRoutingCandidates[0].disposition, "no_target_kanji");
    assert.equal(report.crossLevelRoutingCandidates[0].reason, "does not contain N5 kanji");
    assert.equal(report.crossLevelRoutingCandidates[0].crossLevelRoutingTargetLevel, 4);
    assert.equal(report.crossLevelRoutingCandidates[0].triageDecision.targetLevel, 4);

    const text = formatWordInventoryExpansionCandidateReport(report);
    assert.match(text, /No review candidates matched the requested source and kanji scope\./);
    assert.match(text, /Cross-level routing rows shown \(1\):/);
    assert.match(text, /not current-level promotion candidates/);
    assert.match(text, /手紙 \(てがみ\)/);
    assert.match(text, /suggested anchor review level: N4/);
    assert.match(text, /triage target level: N4/);
});

test("tracked cross-level move_candidate decisions target the computed anchor review level", () => {
    const trackedJlptLevelContract = JSON.parse(fs.readFileSync("templates/jlpt_level_contract.json", "utf8"));
    const trackedTriage = JSON.parse(fs.readFileSync("templates/word_inventory_expansion_triage.json", "utf8"));
    const mismatches = [];
    let checkedCrossLevelMoves = 0;

    for (const [levelLabel, sourceDecisions] of Object.entries(trackedTriage || {})) {
        const targetLevel = Number(String(levelLabel).replace(/^N/i, ""));
        assert.ok(Number.isInteger(targetLevel) && targetLevel >= 1 && targetLevel <= 5, `Unexpected triage level: ${levelLabel}`);

        for (const [sourceLabel, decisions] of Object.entries(sourceDecisions || {})) {
            for (const [key, decision] of Object.entries(decisions || {})) {
                const normalizedDecision = normalizeTriageDecision(decision, { key, currentLevel: targetLevel });
                if (normalizedDecision?.decision !== "move_candidate") {
                    continue;
                }

                const written = String(key).split("|")[0] || "";
                const scope = classifyKanjiScope({ written }, {
                    targetLevel,
                    jlptLevelContract: trackedJlptLevelContract,
                });
                const routedLevel = resolveCrossLevelRoutingTargetLevel(scope, targetLevel);
                if (!Number.isInteger(routedLevel)) {
                    continue;
                }

                checkedCrossLevelMoves += 1;
                if (normalizedDecision.targetLevel !== routedLevel) {
                    mismatches.push(`${levelLabel}/${sourceLabel}/${key}: target N${normalizedDecision.targetLevel}, expected N${routedLevel}`);
                }
            }
        }
    }

    assert.ok(checkedCrossLevelMoves > 0, "Expected at least one tracked cross-level move_candidate decision.");
    assert.deepEqual(mismatches, []);
});

test("normalizeTriageDecisions keeps only decisions with a reason", () => {
    assert.deepEqual(normalizeTriageDecisions({
        "山川|さんせん": {
            decision: " move_candidate ",
            targetLevel: " n4 ",
            priority: " high ",
            reason: " review this ",
            nextStep: " promote later ",
        },
        "行く|ゆく": {
            decision: "reject_candidate",
        },
    }), {
        "山川|さんせん": {
            decision: "move_candidate",
            targetLevel: 4,
            priority: "high",
            reason: "review this",
            nextStep: "promote later",
        },
    });

    assert.throws(() => normalizeTriageDecisions({
        "山川|さんせん": {
            decision: "move_candidate",
            reason: "Move without target.",
        },
    }), /move_candidate triage decision for 山川\|さんせん must include targetLevel N1-N5/);

    assert.throws(() => normalizeTriageDecisions({
        "山川|さんせん": {
            decision: "move_candidate",
            targetLevel: 5,
            reason: "Same-level move should be keep.",
        },
    }, { currentLevel: 5 }), /targets the current level N5; use keep_candidate instead/);

    assert.throws(() => normalizeTriageDecisions({
        "山川|さんせん": {
            decision: "maybe_candidate",
            reason: "Unsupported review state.",
        },
    }), /Unsupported word expansion triage decision for 山川\|さんせん: maybe_candidate/);
});

test("normalizeTriageDecisions keeps placement-specific decisions without overwriting anchor moves", () => {
    const normalized = normalizeTriageDecisions({
        "手紙|てがみ": {
            decision: "move_candidate",
            targetLevel: "N4",
            priority: "medium",
            reason: "Anchor-mode routing belongs in N4.",
            placementDecisions: {
                "vocabulary-level": {
                    decision: "keep_candidate",
                    priority: "high",
                    reason: "Source-listed N5 vocabulary should stay eligible for N5 vocabulary review.",
                },
            },
        },
    }, { currentLevel: 5 });

    const decision = normalized["手紙|てがみ"];
    assert.equal(decision.decision, "move_candidate");
    assert.equal(decision.targetLevel, 4);
    assert.equal(decision.placementDecisions["vocabulary-level"].decision, "keep_candidate");
    assert.equal(
        resolveTriageDecisionForPlacementMode(decision, { placementMode: "kanji-anchor" }).decision,
        "move_candidate"
    );
    assert.equal(
        resolveTriageDecisionForPlacementMode(decision, { placementMode: "vocabulary-level" }).decision,
        "keep_candidate"
    );
});

test("source normalization splits slash readings into exact word identities", () => {
    assert.deepEqual(splitReadingVariants("いく/ゆく"), ["いく", "ゆく"]);
    assert.deepEqual(normalizeCandidateSourceRows({
        written: "行く",
        reading: "いく/ゆく",
        meaning: "to go",
    }).map((row) => row.key), ["行く|いく", "行く|ゆく"]);
});

test("target-level scope rejects easier-level kanji while at-or-below accepts them", () => {
    const row = { written: "茶山", reading: "ちゃやま", sourceLevel: 4, key: "茶山|ちゃやま" };

    assert.equal(classifyCandidateDisposition(row, {
        targetLevel: 4,
        kanjiScope: "at-or-below",
        jlptLevelContract,
        jlptWordLevelContract: { wordLevels: {}, excludedWordLevels: {} },
    }).disposition, "review_candidate");

    assert.equal(classifyCandidateDisposition(row, {
        targetLevel: 4,
        kanjiScope: "target-level",
        jlptLevelContract,
        jlptWordLevelContract: { wordLevels: {}, excludedWordLevels: {} },
    }).disposition, "kanji_scope_mismatch");
});

test("formatWordInventoryExpansionCandidateReport is explicit that candidates do not change readiness", () => {
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows: [{ written: "山川", reading: "さんせん", meaning: "mountains and rivers" }],
        targetLevel: 5,
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
    });
    const text = formatWordInventoryExpansionCandidateReport(report);

    assert.match(text, /Read-only report/);
    assert.match(text, /does not promote words, change contracts, or affect readiness/);
    assert.match(text, /Use after the current reading-coverage pass/);
    assert.match(text, /山川 \(さんせん\)/);
    assert.match(text, /Triaged review candidates: 0\/1/);
    assert.match(text, /triage: untriaged/);
});

test("formatWordInventoryExpansionCandidateReport flags same-written governed readings", () => {
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows: [{ written: "行く", reading: "ゆく", meaning: "to go" }],
        targetLevel: 5,
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
        triageDecisions: {
            "行く|ゆく": {
                decision: "move_candidate",
                targetLevel: "N4",
                priority: "low",
                reason: "Valid source identity, but better reviewed in N4.",
                nextStep: "Move only by adding the N4 contract and starter row.",
            },
        },
    });
    const text = formatWordInventoryExpansionCandidateReport(report);

    assert.equal(report.summary.sameWrittenCandidateRows, 1);
    assert.match(text, /Same-written candidate warnings: 1/);
    assert.match(text, /same-written warning: already tracked with reading\(s\) いく \(N5\)/);
    assert.match(text, /Triaged review candidates: 1\/1/);
    assert.match(text, /triage: move_candidate \[low\]/);
    assert.match(text, /triage target level: N4/);
    assert.match(text, /triage reason: Valid source identity, but better reviewed in N4\./);
    assert.match(text, /triage next step: Move only by adding the N4 contract and starter row\./);
});

test("vocabulary-level placement surfaces source-level words beyond kanji-anchor move triage", () => {
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows: [{
            written: "手紙",
            reading: "てがみ",
            meaning: "letter",
            jlpt: "N5",
        }],
        targetLevel: 5,
        kanjiScope: "at-or-below",
        requireSourceLevel: true,
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
        placementMode: "vocabulary-level",
        triageDecisions: {
            "手紙|てがみ": {
                decision: "move_candidate",
                targetLevel: "N4",
                priority: "normal",
                reason: "Anchor-mode routing belongs in N4.",
            },
        },
    });

    assert.equal(report.summary.placementMode, "vocabulary-level");
    assert.equal(report.summary.reviewCandidateRows, 1);
    assert.equal(report.summary.triagedCandidateRows, 0);
    assert.equal(report.summary.crossLevelRoutingRows, 0);
    assert.equal(report.candidates[0].key, "手紙|てがみ");
    assert.equal(report.candidates[0].triageDecision, null);
    assert.equal(report.candidates[0].sourceTriageDecision.decision, "move_candidate");
    assert.equal(report.candidates[0].sourceTriageDecision.targetLevel, 4);
    assert.match(report.candidates[0].reason, /source-listed vocabulary fits the requested JLPT vocabulary level/);

    const text = formatWordInventoryExpansionCandidateReport(report);
    assert.match(text, /Placement mode: vocabulary-level/);
    assert.match(text, /triage: untriaged/);
    assert.match(text, /anchor triage retained: move_candidate/);
});
