const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJmdictWordSource,
    extractJmdictWordRows,
    priorityRank,
} = require("../src/services/jmdictWordSourceService");

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<JMdict>
  <entry>
    <ent_seq>1001</ent_seq>
    <k_ele>
      <keb>明かす</keb>
      <ke_pri>news1</ke_pri>
    </k_ele>
    <k_ele>
      <keb>開かす</keb>
    </k_ele>
    <r_ele>
      <reb>あかす</reb>
      <re_pri>ichi1</re_pri>
    </r_ele>
    <r_ele>
      <reb>ひらかす</reb>
      <re_restr>開かす</re_restr>
    </r_ele>
    <sense>
      <stagk>明かす</stagk>
      <gloss>to reveal</gloss>
    </sense>
    <sense>
      <stagk>開かす</stagk>
      <stagr>ひらかす</stagr>
      <gloss>to open</gloss>
    </sense>
  </entry>
  <entry>
    <ent_seq>1002</ent_seq>
    <r_ele>
      <reb>かな</reb>
    </r_ele>
    <sense>
      <gloss>kana-only row</gloss>
    </sense>
  </entry>
</JMdict>`;

test("extractJmdictWordRows respects reading and sense restrictions", () => {
    const extracted = extractJmdictWordRows(FIXTURE_XML);
    assert.deepEqual(extracted.rows.map((row) => `${row.written}|${row.reading}`), [
        "開かす|ひらかす",
        "明かす|あかす",
    ]);

    const reveal = extracted.rows.find((row) => row.written === "明かす");
    assert.equal(reveal.meaning, "to reveal");
    assert.equal(reveal.frequencyRank, 100);
    assert.match(reveal.notes, /jmdictPriority=ichi1,news1/);

    const open = extracted.rows.find((row) => row.written === "開かす");
    assert.equal(open.meaning, "to open");
    assert.equal(open.frequencyRank, "");
    assert.match(open.notes, /jmdictPriority=none/);
});

test("buildJmdictWordSource produces pinned TSV output", () => {
    const result = buildJmdictWordSource({
        sourceBuffer: Buffer.from(FIXTURE_XML, "utf8"),
    });

    assert.equal(result.rowCount, 2);
    assert.equal(result.priorityRowCount, 1);
    assert.match(result.tsv, /^written\treading\tmeaning\tfrequencyRank\tsource\tnotes/m);
    assert.equal(result.outputIntegrity.rowCount, 2);
    assert.match(result.outputIntegrity.sha256, /^[a-f0-9]{64}$/u);
});

test("extractJmdictWordRows does not expand XML entities", () => {
    const extracted = extractJmdictWordRows(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE JMdict [<!ENTITY probe "明かす">]>
<JMdict>
  <entry>
    <ent_seq>2001</ent_seq>
    <k_ele><keb>&probe;</keb></k_ele>
    <r_ele><reb>あかす</reb></r_ele>
    <sense><gloss>to reveal</gloss></sense>
  </entry>
</JMdict>`);

    assert.equal(extracted.sourceEntryCount, 1);
    assert.deepEqual(extracted.rows.map((row) => row.written), ["&probe;"]);
    assert.notDeepEqual(extracted.rows.map((row) => row.written), ["明かす"]);
});

test("priorityRank maps JMdict priority tags to stable buckets", () => {
    assert.equal(priorityRank(["nf03"]), 1003);
    assert.equal(priorityRank(["spec2", "news1"]), 100);
    assert.equal(priorityRank(["unknown"]), null);
});
