const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLoggerOptions, resolveLoggerRuntime } = require("../src/logger");

test("buildLoggerOptions enables pretty transport outside production", () => {
    const options = buildLoggerOptions({ nodeEnv: "development", logLevel: "debug" });

    assert.equal(options.level, "debug");
    assert.equal(options.transport.target, "pino-pretty");
});

test("buildLoggerOptions omits pretty transport in production", () => {
    const options = buildLoggerOptions({ nodeEnv: "production", logLevel: "info" });

    assert.equal(options.level, "info");
    assert.equal("transport" in options, false);
});

test("resolveLoggerRuntime uses validated config when available", () => {
    const runtime = resolveLoggerRuntime({
        env: { LOG_LEVEL: "warn" },
        loadConfigFn: () => ({ nodeEnv: "production" }),
    });

    assert.deepEqual(runtime, {
        nodeEnv: "production",
        logLevel: "warn",
    });
});

test("resolveLoggerRuntime falls back to env when config loading fails", () => {
    const runtime = resolveLoggerRuntime({
        env: { NODE_ENV: "production", LOG_LEVEL: "error" },
        loadConfigFn: () => {
            throw new Error("invalid config");
        },
    });

    assert.deepEqual(runtime, {
        nodeEnv: "production",
        logLevel: "error",
    });
});
