const test = require("node:test");
const assert = require("node:assert/strict");

const {
    WORD_GOLD_FIELDS,
    buildLaneAuthorityDuplicationReport,
} = require("../src/services/laneAuthorityAuditService");

test("lane authority duplication audit records word slimming progress and remaining kanji debt", () => {
    const report = buildLaneAuthorityDuplicationReport();

    assert.match(report.boundary, /Read-only transitional lane-authority audit/);
    assert.deepEqual(report.levels, [5, 4, 3, 2, 1]);

    assert.deepEqual(report.word.n5.counts, {
        gold: 308,
        sapphire: 308,
        platinum: 308,
    });
    assert.equal(report.word.n5.sapphireVsPlatinum.shared, 308);
    assert.equal(report.word.n5.sapphireVsPlatinum.identicalByField.readingIncludes, 308);
    assert.equal(report.word.n5.sapphireVsPlatinum.identicalByField.qualityGates, 0);
    assert.equal(report.word.n3.sapphireMinusPlatinum, 1030);

    for (const field of WORD_GOLD_FIELDS) {
        assert.ok(
            Object.hasOwn(report.word.n5.goldVsSapphire.identicalByField, field),
            `audit must track Gold-owned word field ${field}`
        );
        if (field !== "readingIncludes") {
            assert.equal(
                report.word.n5.goldVsSapphire.identicalByField[field],
                0,
                `word Sapphire must not duplicate Gold-owned ${field} after slimming`
            );
        }
    }

    assert.deepEqual(report.kanji.n5.counts, {
        gold: 80,
        sapphire: 80,
        platinum: 80,
    });
    assert.equal(report.kanji.n3.sapphireVsPlatinum.shared, 341);
    assert.equal(report.kanji.n3.sapphireVsPlatinum.identicalByField.qualityGates, 341);
});
