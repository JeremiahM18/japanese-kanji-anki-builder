const test = require("node:test");
const assert = require("node:assert/strict");

const {
    classifyProbeResult,
    describePythonTool,
    describeTool,
    getBlockedTools,
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

test("classifyProbeResult marks EPERM failures as blocked", () => {
    assert.equal(classifyProbeResult({ error: "spawnSync python EPERM", errorCode: "EPERM", status: null }), "blocked");
});

test("getMissingPackagingTools filters unavailable packaging commands", () => {
    const missing = getMissingPackagingTools({
        packaging: [
            { name: "Python", available: false, blocked: false },
            { name: "Sandboxed Python", available: false, blocked: true },
            { name: "Node.js", available: true, blocked: false },
        ],
    });

    assert.deepEqual(missing, [{ name: "Python", available: false, blocked: false }]);
});

test("getBlockedTools filters tools blocked by the current runtime", () => {
    const blocked = getBlockedTools({
        packaging: [
            { name: "Python", available: false, blocked: true },
            { name: "Node.js", available: true, blocked: false },
        ],
    });

    assert.deepEqual(blocked, [{ name: "Python", available: false, blocked: true }]);
});

test("describePythonTool reports an available Python runtime when present", () => {
    const tool = describePythonTool();

    assert.equal(typeof tool.available, "boolean");
    if (tool.available) {
        assert.match(tool.version, /^Python \d+/);
        assert.equal(Array.isArray(tool.runArgsPrefix), true);
    }
});
