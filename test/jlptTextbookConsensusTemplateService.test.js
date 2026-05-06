const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptTextbookConsensusTemplateRows,
    buildSourceEvidencePriority,
    formatJlptTextbookConsensusTemplateTsv,
    normalizePriorityMode,
    parseJlptLevelFilter,
    resolvePositiveLimit,
} = require("../src/services/jlptTextbookConsensusTemplateService");
const {
    formatTemplateReport,
    formatPrioritySummary,
    parseArgs,
} = require("../scripts/createJlptTextbookConsensusTemplate");

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

test("textbook source template rows stay deterministic and blank until reviewed", () => {
    const rows = buildJlptTextbookConsensusTemplateRows({
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

test("textbook source template supports level and limit filters", () => {
    const rows = buildJlptTextbookConsensusTemplateRows({
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

test("textbook source template TSV exposes only manual review fields", () => {
    const tsv = formatJlptTextbookConsensusTemplateTsv([
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

test("textbook source template can prioritize current source-evidence gaps", () => {
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

    const rows = buildJlptTextbookConsensusTemplateRows({
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

test("textbook source template rejects invalid CLI filters", () => {
    assert.equal(parseJlptLevelFilter("n4"), 4);
    assert.equal(resolvePositiveLimit(3), 3);
    assert.equal(normalizePriorityMode("source-gaps"), "source-gaps");
    assert.throws(() => parseJlptLevelFilter("N6"), /Invalid JLPT level/);
    assert.throws(() => resolvePositiveLimit(0), /Invalid positive limit/);
    assert.throws(() => normalizePriorityMode("fast"), /Invalid JLPT source review priority mode/);
});

test("createJlptTextbookConsensusTemplate script parses args and reports no deck mutation", () => {
    const options = parseArgs([
        "--contract=templates/custom-contract.json",
        "--config=templates/custom-inputs.json",
        "--evidence=templates/custom-evidence.json",
        "--source=nihongo_sou_matome_kanji",
        "--out=downloads/custom-textbook.tsv",
        "--level=5",
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
    assert.equal(options.limit, 12);
    assert.equal(options.priority, "source-gaps");
    assert.equal(options.json, true);

    const text = formatTemplateReport({
        outPath: "downloads/custom-textbook.tsv",
        contractPath: "templates/custom-contract.json",
        evidencePath: "templates/custom-evidence.json",
        sourceId: "nihongo_sou_matome_kanji",
        level: "5",
        priority: "source-gaps",
        rows: [
            { kanji: "日", reviewPriority: "missing_evidence" },
            { kanji: "月", reviewPriority: "missing_evidence" },
        ],
    });

    assert.match(text, /manual-review worksheet only/);
    assert.match(text, /does not import evidence, move kanji, move words, update decks, or change readiness/);
    assert.match(text, /selected source lane/);
    assert.match(text, /Priority mode: source-gaps/);
    assert.match(text, /Priority summary: missing_evidence: 2/);
    assert.equal(formatPrioritySummary([{ reviewPriority: "b" }, { reviewPriority: "a" }]), "a: 1, b: 1");
});
