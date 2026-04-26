const test = require("node:test");
const assert = require("node:assert/strict");

const { pickMainComponent } = require("../src/datasets/kradfile");

test("pickMainComponent formats the full deterministic KRAD component list", () => {
    assert.equal(pickMainComponent(["夕", "卜"]), "夕 / 卜");
});

test("pickMainComponent handles empty component lists", () => {
    assert.equal(pickMainComponent([]), "");
    assert.equal(pickMainComponent(null), "");
});
