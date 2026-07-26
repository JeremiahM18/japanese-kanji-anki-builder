const test = require("node:test");
const assert = require("node:assert/strict");

const {
    assertGoldenKanjiReviewScope,
    parseArgs,
} = require("../scripts/reviewGoldenLevel");

test("reviewGoldenLevel requires explicit manifest scope and records unsupported flags", () => {
    const args = parseArgs(["--level=1", "--json", "--manifest-scoped", "--unexpected"]);

    assert.equal(args.level, 1);
    assert.equal(args.json, true);
    assert.equal(args.manifestScoped, true);
    assert.deepEqual(args.unknownArgs, ["--unexpected"]);
    assert.doesNotThrow(() => assertGoldenKanjiReviewScope(args));
    assert.throws(
        () => assertGoldenKanjiReviewScope({ manifestScoped: false }),
        /must be explicit/
    );
});
