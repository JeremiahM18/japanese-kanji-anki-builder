const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptKanjiSourceInputTemplateRows,
    buildSourceEvidencePriority,
    formatJlptKanjiSourceInputTemplateTsv,
    normalizePriorityMode,
    parseJlptLevelFilter,
    resolvePositiveLimit,
} = require("../src/services/jlptKanjiSourceInputTemplateService");
const {
    formatTemplateReport,
    formatPrioritySummary,
    parseArgs,
    run,
} = require("../scripts/createJlptKanjiSourceInputTemplate");

function buildGovernedSource(overrides = {}) {
    return {
        status: "active",
        independent: true,
        countsForConsensus: true,
        allowedUse: "bulk-import",
        sourceKind: "assignment",
        canStoreAssignments: true,
        licenseStatus: "approved",
        weight: 1,
        ...overrides,
    };
}

test("kanji source input template rows stay deterministic and blank until reviewed", () => {
    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract: {
            kanjiLevels: {
                鬱: 1,
                日: 5,
                語: 4,
                橋: 2,
            },
        },
    });

    assert.deepEqual(rows.map((row) => `${row.kanji}:${row.currentContractLevel}`), [
        "日:N5",
        "語:N4",
        "橋:N2",
        "鬱:N1",
    ]);
    assert.equal(rows.every((row) => row.reviewStatus === "needs_review"), true);
    assert.equal(rows.every((row) => row.level === ""), true);
    assert.equal(rows.every((row) => row.citation === ""), true);
    assert.equal(rows.every((row) => row.evidenceRef === ""), true);
    assert.equal(rows.every((row) => row.reviewPriority === "contract_order"), true);
});

test("kanji source input template supports level and limit filters", () => {
    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract: {
            kanjiLevels: {
                日: 5,
                月: 5,
                語: 4,
            },
        },
        level: "N5",
        limit: 1,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].currentContractLevel, "N5");
});

test("kanji source input template TSV exposes only manual review fields", () => {
    const tsv = formatJlptKanjiSourceInputTemplateTsv([
        {
            kanji: "日",
            currentContractLevel: "N5",
            level: "",
            reviewStatus: "needs_review",
            citation: "",
            evidenceRef: "",
            notes: "",
        },
    ]);

    assert.equal(tsv, [
        "kanji\tcurrentContractLevel\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\t\tneeds_review\t\t\t",
        "",
    ].join("\n"));
});

test("kanji source input template can prioritize current source-evidence gaps", () => {
    const contract = {
        kanjiLevels: {
            日: 5,
            月: 5,
            語: 4,
        },
    };
    const evidence = {
        policy: {
            minimumIndependentSources: 1,
            minimumIndependentEvidenceLineages: 1,
            minimumJapanesePublishedSources: 1,
            standardAgreementScore: 0.67,
            highAgreementScore: 0.8,
        },
        sourceLineages: {
            legacy: {
                label: "Legacy",
                role: "direct-legacy-jlpt",
                description: "Fixture legacy source.",
            },
            textbook: {
                label: "Textbook",
                role: "japanese-published-study",
                description: "Fixture textbook source.",
            },
        },
        sources: {
            legacy_source: buildGovernedSource({
                evidenceLineage: "legacy",
                japanesePublished: false,
            }),
            textbook_source: buildGovernedSource({
                allowedUse: "manual-citation-only",
                evidenceLineage: "textbook",
                japanesePublished: true,
            }),
        },
        assignments: {
            legacy_source: {
                日: { level: 5, reviewStatus: "reviewed" },
                語: { level: 5, reviewStatus: "reviewed" },
            },
            textbook_source: {
                日: { level: 5, reviewStatus: "reviewed" },
            },
        },
    };

    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract,
        evidence,
        priority: "source-gaps",
    });

    assert.deepEqual(rows.map((row) => `${row.kanji}:${row.reviewPriority}`), [
        "語:contract_consensus_mismatch",
        "月:missing_evidence",
        "日:high_confidence",
    ]);
    assert.match(rows[0].reviewReason, /differs from computed external source consensus/);
});

test("kanji source input template can prepare source-level delta review rows", () => {
    const contract = {
        kanjiLevels: {
            日: 5,
            学: 4,
            本: 3,
        },
    };
    const evidence = {
        policy: {
            minimumIndependentSources: 1,
            minimumIndependentEvidenceLineages: 0,
            minimumJapanesePublishedSources: 0,
            standardAgreementScore: 0.67,
            highAgreementScore: 0.8,
        },
        sources: {
            kanjidic2_legacy: buildGovernedSource(),
            tanos_legacy_direct: buildGovernedSource(),
        },
        assignments: {
            kanjidic2_legacy: {
                日: { level: 5, reviewStatus: "reviewed" },
                学: { level: 5, reviewStatus: "reviewed" },
                本: { level: 5, reviewStatus: "reviewed" },
            },
            tanos_legacy_direct: {
                日: { level: 5, reviewStatus: "reviewed" },
                学: { level: 4, reviewStatus: "reviewed" },
            },
        },
    };

    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract,
        evidence,
        priority: "source-level-deltas",
        sourceLevel: "N5",
    });

    assert.deepEqual(rows.map((row) => `${row.kanji}:${row.currentContractLevel}:${row.reviewPriority}`), [
        "学:N4:disputed_source_candidate_outside_current_level",
        "本:N3:source_consensus_outside_current_level",
    ]);
    assert.equal(rows.every((row) => row.reviewStatus === "needs_review"), true);
    assert.equal(rows.every((row) => row.level === ""), true);
    assert.equal(rows.every((row) => row.citation === ""), true);
    assert.equal(rows.every((row) => row.evidenceRef === ""), true);
    assert.match(rows[0].reviewReason, /source votes are disputed/);
    assert.match(rows[1].reviewReason, /Active source consensus places this kanji at N5/);
});

test("kanji source input template can prepare all-level source review worklist rows", () => {
    const contract = {
        kanjiLevels: {
            日: 5,
            学: 4,
            本: 3,
        },
    };
    const evidence = {
        policy: {
            minimumIndependentSources: 1,
            minimumIndependentEvidenceLineages: 0,
            minimumJapanesePublishedSources: 0,
            standardAgreementScore: 0.67,
            highAgreementScore: 0.8,
        },
        sources: {
            kanjidic2_legacy: buildGovernedSource(),
            tanos_legacy_direct: buildGovernedSource(),
        },
        assignments: {
            kanjidic2_legacy: {
                日: { level: 5, reviewStatus: "reviewed" },
                学: { level: 5, reviewStatus: "reviewed" },
                本: { level: 5, reviewStatus: "reviewed" },
            },
            tanos_legacy_direct: {
                日: { level: 5, reviewStatus: "reviewed" },
                学: { level: 4, reviewStatus: "reviewed" },
            },
        },
    };

    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract,
        evidence,
        priority: "source-review-worklist",
        skippedSourceKanji: new Set(["学"]),
    });

    assert.deepEqual(rows.map((row) => `${row.kanji}:${row.currentContractLevel}:${row.reviewPriority}`), [
        "本:N3:contract_consensus_mismatch",
    ]);
    assert.equal(rows[0].reviewStatus, "needs_review");
    assert.equal(rows[0].level, "");
    assert.match(rows[0].reviewReason, /Review levels: N5, N3/);
});

test("kanji source input template skips already reviewed local source rows", () => {
    const contract = {
        kanjiLevels: {
            日: 5,
            学: 4,
            本: 3,
        },
    };
    const evidence = {
        policy: {
            minimumIndependentSources: 1,
            minimumIndependentEvidenceLineages: 0,
            minimumJapanesePublishedSources: 0,
            standardAgreementScore: 0.67,
            highAgreementScore: 0.8,
        },
        sources: {
            kanjidic2_legacy: buildGovernedSource(),
        },
        assignments: {
            kanjidic2_legacy: {
                日: { level: 5, reviewStatus: "reviewed" },
                学: { level: 5, reviewStatus: "reviewed" },
                本: { level: 5, reviewStatus: "reviewed" },
            },
        },
    };

    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract,
        evidence,
        priority: "source-level-deltas",
        sourceLevel: "N5",
        skippedSourceKanji: new Set(["学"]),
    });

    assert.deepEqual(rows.map((row) => row.kanji), ["本"]);
});

test("source-level delta template priority rejects ambiguous filters", () => {
    assert.equal(normalizePriorityMode("source-level-deltas"), "source-level-deltas");
    assert.throws(() => buildJlptKanjiSourceInputTemplateRows({
        contract: { kanjiLevels: { 日: 5 } },
        evidence: {},
        priority: "source-level-deltas",
    }), /requires --source-level/);
    assert.throws(() => buildJlptKanjiSourceInputTemplateRows({
        contract: { kanjiLevels: { 日: 5 } },
        evidence: {},
        priority: "source-level-deltas",
        level: "N5",
        sourceLevel: "N5",
    }), /must not also use --level/);
    assert.throws(() => buildJlptKanjiSourceInputTemplateRows({
        contract: { kanjiLevels: { 日: 5 } },
        priority: "source-level-deltas",
        sourceLevel: "N5",
    }), /requires a source-evidence manifest/);
    assert.throws(() => buildJlptKanjiSourceInputTemplateRows({
        contract: { kanjiLevels: { 日: 5 } },
        priority: "source-gaps",
        sourceLevel: "N5",
    }), /only supported with source-level-deltas/);
    assert.throws(() => buildJlptKanjiSourceInputTemplateRows({
        contract: { kanjiLevels: { 日: 5 } },
        evidence: {},
        priority: "source-review-worklist",
        level: "N5",
    }), /must not use --level/);
    assert.throws(() => buildJlptKanjiSourceInputTemplateRows({
        contract: { kanjiLevels: { 日: 5 } },
        evidence: {},
        priority: "source-review-worklist",
        sourceLevel: "N5",
    }), /must not use --source-level/);
});

test("source-evidence priority labels missing Japanese-published source evidence", () => {
    const priority = buildSourceEvidencePriority({
        kanji: "語",
        contractLevel: 4,
        evidence: {
            policy: {
                minimumIndependentSources: 1,
                minimumIndependentEvidenceLineages: 1,
                minimumJapanesePublishedSources: 1,
            },
            sources: {
                legacy_source: buildGovernedSource({
                    japanesePublished: false,
                }),
            },
            assignments: {
                legacy_source: {
                    語: { level: 4, reviewStatus: "reviewed" },
                },
            },
        },
    });

    assert.equal(priority.reviewPriority, "missing_japanese_published_source");
});

test("kanji source input template rejects invalid CLI filters", () => {
    assert.equal(parseJlptLevelFilter("n4"), 4);
    assert.equal(resolvePositiveLimit(3), 3);
    assert.equal(normalizePriorityMode("source-gaps"), "source-gaps");
    assert.throws(() => parseJlptLevelFilter("N6"), /Invalid JLPT level/);
    assert.throws(() => resolvePositiveLimit(0), /Invalid positive limit/);
    assert.throws(() => normalizePriorityMode("fast"), /Invalid JLPT source review priority mode/);
});

test("createJlptKanjiSourceInputTemplate script parses args and reports no deck mutation", () => {
    const options = parseArgs([
        "--contract=templates/custom-contract.json",
        "--config=templates/custom-inputs.json",
        "--evidence=templates/custom-evidence.json",
        "--source=nihongo_sou_matome_kanji",
        "--out=downloads/custom-textbook.tsv",
        "--level=5",
        "--source-level=N5",
        "--limit=12",
        "--priority=source-gaps",
        "--json",
    ]);

    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.config, "templates/custom-inputs.json");
    assert.equal(options.evidence, "templates/custom-evidence.json");
    assert.equal(options.source, "nihongo_sou_matome_kanji");
    assert.equal(options.out, "downloads/custom-textbook.tsv");
    assert.equal(options.level, "5");
    assert.equal(options.sourceLevel, "N5");
    assert.equal(options.limit, 12);
    assert.equal(options.priority, "source-gaps");
    assert.equal(options.json, true);

    const text = formatTemplateReport({
        outPath: "downloads/custom-textbook.tsv",
        contractPath: "templates/custom-contract.json",
        evidencePath: "templates/custom-evidence.json",
        sourceId: "nihongo_sou_matome_kanji",
        level: "5",
        sourceLevel: "N5",
        priority: "source-gaps",
        skippedExistingSourceRows: 2,
        rows: [
            { kanji: "日", reviewPriority: "missing_evidence" },
            { kanji: "月", reviewPriority: "missing_evidence" },
        ],
    });

    assert.match(text, /manual-review worksheet only/);
    assert.match(text, /does not import evidence, move kanji, move words, update decks, or change readiness/);
    assert.match(text, /selected source lane/);
    assert.match(text, /Priority mode: source-gaps/);
    assert.match(text, /Source level filter: N5/);
    assert.match(text, /Priority summary: missing_evidence: 2/);
    assert.match(text, /Already resolved source rows skipped: 2/);
    assert.equal(formatPrioritySummary([{ reviewPriority: "b" }, { reviewPriority: "a" }]), "a: 1, b: 1");
});

test("source-level delta template command requires an explicit batch output", () => {
    assert.throws(() => run({
        contract: "templates/jlpt_level_contract.json",
        config: "templates/jlpt_kanji_source_inputs.json",
        evidence: "templates/jlpt_kanji_source_evidence.json",
        source: "shin_kanzen_master_kanji",
        priority: "source-level-deltas",
        sourceLevel: "N5",
        limit: 23,
    }), /requires --out=<batch.tsv>/);
});

test("source review worklist template command requires an explicit batch output", () => {
    assert.throws(() => run({
        contract: "templates/jlpt_level_contract.json",
        config: "templates/jlpt_kanji_source_inputs.json",
        evidence: "templates/jlpt_kanji_source_evidence.json",
        source: "shin_kanzen_master_kanji",
        priority: "source-review-worklist",
        limit: 10,
    }), /requires --out=<batch.tsv>/);
});
