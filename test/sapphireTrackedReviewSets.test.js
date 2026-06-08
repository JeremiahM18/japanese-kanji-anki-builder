const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ACTIVE_SAPPHIRE_STATUSES,
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
    evaluateSapphireKanjiReviewSet,
    formatSapphireKanjiReviewReport,
} = require("../src/services/sapphireKanjiReviewService");
const {
    parseSapphireKanjiReviewSet,
} = require("../src/datasets/sapphireKanjiReviewSet");
const {
    promoteSapphireKanjiBatch,
} = require("../src/services/sapphireKanjiPromotionService");

const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function normalizeList(values = []) {
    return (Array.isArray(values) ? values : []).filter(Boolean);
}

function activeEntries(entries = []) {
    return entries.filter((entry) => ACTIVE_SAPPHIRE_STATUSES.includes(entry.status));
}

function isAllowedLegacyLanePath(pathParts = [], value = "") {
    const pathText = pathParts.join(".");
    return pathText.includes("migrationProvenance")
        || pathText.includes("migrationBoundary")
        || pathText.includes("commandsReviewed")
        || pathText.includes("trackedSourceContractBoundary")
        || pathText.endsWith("reviewer")
        || /(?:npm run deck:platinum|node out\/n1-platinum-review)/.test(value);
}

function collectLegacyLaneTextIssues(value, pathParts = []) {
    if (typeof value === "string") {
        return /Platinum|platinum|rereview/.test(value) && !isAllowedLegacyLanePath(pathParts, value)
            ? [`${pathParts.join(".") || "(root)"}: ${value}`]
            : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectLegacyLaneTextIssues(item, [...pathParts, String(index)]));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, entryValue]) => (
            collectLegacyLaneTextIssues(entryValue, [...pathParts, key])
        ));
    }
    return [];
}

function buildSyntheticSapphireRows(entries = [], levelLabel = "") {
    return activeEntries(entries).map((entry) => {
        const surface = entry.sapphireReviewAudit?.generatedSurface || {};
        const reading = normalizeList(entry.readingIncludes)[0] || surface.primaryReading || "";
        return {
            kanji: entry.kanji,
            levelLabel,
            displayWord: surface.displayWord || entry.kanji,
            meaningJP: surface.meaningJP || normalizeList(entry.meaningIncludes).join(" / "),
            primaryReading: reading,
            kanjiMeanings: surface.kanjiMeanings || normalizeList(entry.kanjiMeaningsIncludes).join(" / "),
            studyWordKanji: surface.studyWordKanji ?? "",
            onReading: surface.onReading || "",
            kunReading: surface.kunReading || "",
            strokeOrder: surface.strokeOrder || `<img src="${entry.kanji}-stroke-order.gif" alt="Stroke order for ${entry.kanji}" />`,
            audio: surface.audio || `[sound:${entry.kanji}-kanji-reading-${entry.kanji}-${reading}.wav]`,
            radical: "",
            notes: surface.notes || normalizeList(entry.notesIncludes).join(" / "),
            exampleSentence: surface.exampleSentence || normalizeList(entry.exampleIncludes).join(" / "),
        };
    });
}

test("tracked Sapphire kanji manifests are first-class structural review sets", () => {
    const sapphireFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => /^sapphire_n[1-5]_review_set\.json$/.test(name))
        .sort();

    assert.deepEqual(sapphireFiles, [
        "sapphire_n1_review_set.json",
        "sapphire_n2_review_set.json",
        "sapphire_n3_review_set.json",
        "sapphire_n4_review_set.json",
        "sapphire_n5_review_set.json",
    ]);

    for (const fileName of sapphireFiles) {
        const level = Number(fileName.match(/^sapphire_n([1-5])_review_set\.json$/)?.[1]);
        const entries = loadJson(path.join("templates", fileName));
        const manifestActiveEntries = activeEntries(entries);

        assert.ok(manifestActiveEntries.length > 0, `${fileName} must have active Sapphire coverage`);
        for (const entry of manifestActiveEntries) {
            const label = `${fileName} ${entry.kanji}`;
            assert.ok(ACTIVE_SAPPHIRE_STATUSES.includes(entry.status), `${label} status must be Sapphire-native`);
            assert.equal(entry.reviewStandard, CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD, `${label} review standard`);
            assert.ok(entry.sapphireReviewAudit, `${label} must include sapphireReviewAudit`);
            assert.equal(entry.platinumReviewAudit, undefined, `${label} must not include platinumReviewAudit`);
            assert.equal(entry.rereviewProvenance, undefined, `${label} must not carry inline Obsidian proof`);
            assert.ok(entry.migrationProvenance, `${label} must record migration provenance`);
            assert.match(
                entry.migrationProvenance.authority || "",
                /not claim Platinum content certification/i,
                `${label} migration boundary must keep Platinum separate`
            );
            if (entry.sapphireReviewAudit.actualCardDataReview) {
                assert.equal(
                    entry.sapphireReviewAudit.actualCardDataReview.reviewStandard,
                    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
                    `${label} audit review standard`
                );
            } else {
                assert.match(
                    entry.sapphireReviewAudit.auditType || "",
                    /structural-sapphire|sapphire-card/i,
                    `${label} legacy migrated audit must still identify the Sapphire lane`
                );
            }
            assert.ok(
                entry.sapphireReviewAudit.migrationBoundary?.legacyCommandNamesPreserved,
                `${label} audit must disclose preserved legacy command names`
            );
            assert.deepEqual(
                collectLegacyLaneTextIssues(entry),
                [],
                `${label} active Sapphire evidence must not carry undisclosed legacy Platinum/rereview text`
            );
            const generatedSurface = entry.sapphireReviewAudit.generatedSurface || {};
            if (generatedSurface.hardChecks) {
                assert.equal(
                    generatedSurface.hardChecksPassed,
                    true,
                    `${label} generated-surface hard checks`
                );
                for (const [checkName, passed] of Object.entries(generatedSurface.hardChecks)) {
                    assert.equal(passed, true, `${label} generated-surface hard check must pass: ${checkName}`);
                }
            } else {
                assert.ok(
                    entry.sapphireReviewAudit.migrationBoundary,
                    `${label} legacy migrated audit without generated-surface hard checks must disclose migration boundary`
                );
            }
            if (entry.status === "fixed_then_sapphire") {
                assert.ok(entry.fixSummary, `${label} fixed_then_sapphire entries must keep fixSummary`);
            } else {
                assert.equal(entry.fixSummary, undefined, `${label} non-fixed Sapphire entries must not keep fixSummary`);
            }
        }

        const report = evaluateSapphireKanjiReviewSet({
            rows: buildSyntheticSapphireRows(entries, `N${level}`),
            entries,
            requireCurrentReviewStandard: true,
        });
        assert.equal(report.passed, true, `${fileName}\n${formatSapphireKanjiReviewReport(report)}`);
    }
});

test("Sapphire migration preserves legacy Platinum manifests as read-only inputs", () => {
    for (const level of [1, 2, 3, 4, 5]) {
        const sapphireEntries = loadJson(path.join("templates", `sapphire_n${level}_review_set.json`));
        const platinumEntries = loadJson(path.join("templates", `platinum_n${level}_review_set.json`));
        const sapphireActiveCount = activeEntries(sapphireEntries).length;
        const platinumActiveCount = platinumEntries.filter((entry) => ["platinum", "fixed_then_platinum"].includes(entry.status)).length;

        assert.ok(
            sapphireActiveCount >= platinumActiveCount,
            `N${level} Sapphire coverage must preserve at least the legacy Platinum compatibility coverage`
        );
        if (level !== 1) {
            assert.equal(
                sapphireActiveCount,
                platinumActiveCount,
                `N${level} Sapphire migration should preserve count parity with the legacy input`
            );
        }
    }
});

test("Sapphire schema validates native manifests and rejects Platinum-shaped candidates", () => {
    const entries = loadJson(path.join("templates", "sapphire_n5_review_set.json"));

    assert.doesNotThrow(() => parseSapphireKanjiReviewSet(entries, "sapphire_n5_review_set.json"));

    const platinumShapedCandidate = {
        ...entries[0],
        status: "platinum",
        reviewStandard: "kanji-platinum-v3-evidence-lanes",
        platinumReviewAudit: entries[0].sapphireReviewAudit,
        sapphireReviewAudit: undefined,
    };
    assert.throws(
        () => parseSapphireKanjiReviewSet([platinumShapedCandidate], "bad candidate"),
        /bad candidate failed schema validation/i
    );
});

test("Sapphire kanji coverage reports expose Sapphire-native field names", () => {
    const sourceEntries = activeEntries(loadJson(path.join("templates", "sapphire_n5_review_set.json")));
    const entries = sourceEntries.slice(0, 1);
    const rows = buildSyntheticSapphireRows(sourceEntries.slice(0, 2), "N5");
    const report = evaluateSapphireKanjiReviewSet({
        rows,
        entries,
        requireCurrentReviewStandard: true,
        requireAllRows: true,
    });

    assert.equal(report.activePlatinumCount, undefined);
    assert.equal(report.activePlatinumStatusCount, undefined);
    assert.equal(report.currentStandardPlatinumCount, undefined);
    assert.equal(report.legacyOrUnversionedPlatinumCount, undefined);
    assert.equal(report.missingPlatinumRows, undefined);
    assert.equal(report.missingCurrentStandardRows, undefined);
    assert.equal(report.activeSapphireCount, 1);
    assert.equal(report.currentStandardSapphireCount, 1);
    assert.deepEqual(report.missingSapphireRows, [sourceEntries[1].kanji]);
    assert.match(report.coverageFailures.join("\n"), /missing Sapphire entries/);
    assert.doesNotMatch(report.coverageFailures.join("\n"), /Platinum entries|Platinum coverage/);
});

test("Sapphire promoter merges reviewed input and fails closed on unsafe candidates", () => {
    const candidate = JSON.parse(JSON.stringify(loadJson(path.join("templates", "sapphire_n5_review_set.json"))[0]));
    const rows = buildSyntheticSapphireRows([candidate], "N5");
    const promoted = promoteSapphireKanjiBatch({
        existingEntries: [],
        candidateEntries: [candidate],
        rows,
    });

    assert.equal(promoted.summary.candidateEntries, 1);
    assert.deepEqual(promoted.summary.promotedKanji, [candidate.kanji]);
    assert.equal(promoted.summary.outputEntries, 1);

    assert.throws(
        () => promoteSapphireKanjiBatch({
            existingEntries: [],
            candidateEntries: [candidate, candidate],
            rows,
        }),
        /Duplicate Sapphire candidate kanji/
    );
    assert.throws(
        () => promoteSapphireKanjiBatch({
            existingEntries: [candidate],
            candidateEntries: [candidate],
            rows,
        }),
        /already exist/
    );

    const platinumShapedCandidate = {
        ...candidate,
        status: "platinum",
        reviewStandard: "kanji-platinum-v3-evidence-lanes",
    };
    assert.throws(
        () => promoteSapphireKanjiBatch({
            existingEntries: [],
            candidateEntries: [platinumShapedCandidate],
            rows,
        }),
        /Sapphire candidate batch failed schema validation/i
    );
});
