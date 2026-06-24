const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OUTPUT_COLUMNS,
    buildTubelexOutputIntegrity,
    buildTubelexWordFrequencyRows,
    formatTubelexWordFrequencyTsv,
} = require("../src/services/tubelexWordFrequencyService");

test("TubeLex normalizer builds exact-identity support rows without granting ambiguous reading proof", () => {
    const tubelexText = [
        "word\tcount\tvideos\tchannels\tpos\tcount:education\tcount:gaming",
        "本\t1000\t50\t25\t名詞\t700\t300",
        "学校\t800\t40\t20\t名詞\t700\t100",
        "の\t500\t35\t15\t助詞\t250\t250",
        "[TOTAL]\t2300\t60\t30\t\t1650\t650",
    ].join("\n");
    const jmdictText = [
        "written\treading\tmeaning\tfrequencyRank\tsource\tnotes",
        "本\tほん\tbook\t\tjmdict\tentrySeq=1",
        "学校\tがっこう\tschool\t100\tjmdict\tentrySeq=2",
        "野\tの\tfield\t\tjmdict\tentrySeq=3",
        "乃\tの\tpossessive marker\t\tjmdict\tentrySeq=4",
    ].join("\n");

    const result = buildTubelexWordFrequencyRows({ tubelexText, jmdictText });
    const rowsByKey = new Map(result.rows.map((row) => [`${row.written}|${row.reading}`, row]));

    assert.equal(result.summary.tubelexRows, 3);
    assert.equal(result.summary.jmdictRows, 4);
    assert.equal(result.summary.derivedRows, 4);
    assert.deepEqual(result.summary.outputColumns, OUTPUT_COLUMNS);
    assert.equal(rowsByKey.get("本|ほん").tubelexMatchStatus, "exact_written");
    assert.equal(rowsByKey.get("本|ほん").tubelexFrequencyBand, "strong");
    assert.equal(rowsByKey.get("学校|がっこう").tubelexMatchStatus, "exact_written");
    assert.equal(rowsByKey.get("野|の").tubelexMatchStatus, "ambiguous_written");
    assert.equal(rowsByKey.get("野|の").tubelexFrequencyBand, "poor");
    assert.match(rowsByKey.get("野|の").notes, /not reading proof/);
    assert.equal(result.summary.matchStatusCounts.ambiguous_written, 2);

    const tsv = formatTubelexWordFrequencyTsv(result.rows);
    assert.match(tsv.split(/\r?\n/u)[0], /^written\treading\tmeaning\tfrequencyRank\t/);
    const integrity = buildTubelexOutputIntegrity(tsv, result.rows);
    assert.equal(integrity.rowCount, 4);
    assert.equal(integrity.columns.includes("tubelexFrequencyBand"), true);
});
