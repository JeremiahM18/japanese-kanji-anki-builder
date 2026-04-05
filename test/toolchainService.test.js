const test = require("node:test");
const assert = require("node:assert/strict");

const {
    describePythonTool,
    describeTool,
    trimVersionText,
    getMissingPackagingTools,
} = require("../src/services/toolchainService");

test("trimVersionText trims whitespace safely", () => {
    assert.equal(trimVersionText("  hello  \n"), "hello");
    assert.equal(trimVersionText(null), "");
});

test("describeTool reports an available command", () => {
    const tool = describeTool({
        name: "Node.js",
        command: process.execPath,
        args: ["--version"],
        required: true,
    });

    assert.equal(tool.available, true);
    assert.match(tool.version, /^v\d+/);
    assert.equal(tool.error, null);
});

test("describeTool reports a missing command cleanly", () => {
    const tool = describeTool({
        name: "Missing",
        command: "codex-missing-tool-for-test",
    });

    assert.equal(tool.available, false);
    assert.equal(tool.version, null);
    assert.equal(typeof tool.error, "string");
});

test("getMissingPackagingTools filters unavailable packaging commands", () => {
    const missing = getMissingPackagingTools({
        packaging: [
            { name: "Python", available: false },
            { name: "Node.js", available: true },
        ],
    });

    assert.deepEqual(missing, [{ name: "Python", available: false }]);
});

test("describePythonTool reports an available Python runtime when present", () => {
    const tool = describePythonTool();

    assert.equal(typeof tool.available, "boolean");
    if (tool.available) {
        assert.match(tool.version, /^Python \d+/);
        assert.equal(Array.isArray(tool.runArgsPrefix), true);
    }
});
