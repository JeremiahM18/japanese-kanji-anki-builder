const test = require("node:test");
const assert = require("node:assert/strict");

const {
    KANJI_GOLD_FIELDS,
    WORD_GOLD_FIELDS,
    buildLaneAuthorityDuplicationReport,
} = require("../src/services/laneAuthorityAuditService");

test("lane authority duplication audit records word and kanji authority slimming progress", () => {
    const report = buildLaneAuthorityDuplicationReport();

    assert.match(report.boundary, /Read-only transitional lane-authority audit/);
    assert.deepEqual(report.levels, [5, 4, 3, 2, 1]);

    assert.deepEqual(report.word.n5.counts, {
        gold: 398,
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
    for (const field of KANJI_GOLD_FIELDS) {
        assert.equal(
            report.kanji.n5.goldVsSapphire.identicalByField[field],
            0,
            `kanji Sapphire must not duplicate Gold-owned ${field} after slimming`
        );
    }
    for (const level of ["n5", "n4", "n3", "n2", "n1"]) {
        assert.equal(
            report.kanji[level].sapphireVsPlatinum.identicalByField.qualityGates,
            0,
            `${level} kanji Sapphire must not carry Platinum qualityGates after slimming`
        );
    }
});
