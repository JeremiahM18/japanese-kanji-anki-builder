const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadGovernedComponentMap, pickMainComponent } = require("../src/datasets/kradfile");

test("pickMainComponent formats the full deterministic KRAD component list", () => {
    assert.equal(pickMainComponent(["夕", "卜"]), "夕 / 卜");
});

test("pickMainComponent handles empty component lists", () => {
    assert.equal(pickMainComponent([]), "");
    assert.equal(pickMainComponent(null), "");
});

test("loadGovernedComponentMap prefers the tracked contract over local KRAD fallback", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "component-map-test-"));

    try {
        const contractPath = path.join(rootDir, "kanji_component_contract.json");
        const kradfilePath = path.join(rootDir, "KRADFILE");

        fs.writeFileSync(contractPath, JSON.stringify({
            version: 1,
            inventoryCounts: { "5": 1 },
            components: { 外: ["卜", "夕"] },
        }), "utf8");
        fs.writeFileSync(kradfilePath, "外 : 夕\n", "utf8");

        const map = loadGovernedComponentMap({
            kanjiComponentContractPath: contractPath,
            kradfilePath,
        });

        assert.deepEqual(map.get("外"), ["卜", "夕"]);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
