const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createShutdownController,
    installSignalHandlers,
    listenAsync,
} = require("../src/server");

test("createShutdownController closes the server once and exits after signal shutdown", async () => {
    const calls = [];
    let cleanupCalls = 0;
    let exitCode = null;

    const controller = createShutdownController({
        server: { close() {} },
        logger: {
            info(payloadOrMessage, maybeMessage) {
                calls.push({ level: "info", payloadOrMessage, maybeMessage });
            },
            error(payloadOrMessage, maybeMessage) {
                calls.push({ level: "error", payloadOrMessage, maybeMessage });
            },
        },
        closeServer: async () => {
            calls.push({ level: "close" });
            await new Promise((resolve) => setTimeout(resolve, 10));
        },
        cleanupSignalHandlers: () => {
            cleanupCalls += 1;
        },
        exitFn: (code) => {
            exitCode = code;
        },
        shutdownTimeoutMs: 100,
    });

    await Promise.all([
        controller.shutdown({ signal: "SIGTERM", exitCode: 0 }),
        controller.shutdown({ signal: "SIGTERM", exitCode: 0 }),
    ]);

    assert.equal(cleanupCalls, 1);
    assert.equal(calls.filter((entry) => entry.level === "close").length, 1);
    assert.equal(exitCode, 0);
});

test("createShutdownController exits with failure when close times out", async () => {
    let exitCode = null;

    const controller = createShutdownController({
        server: { close() {} },
        logger: {
            info() {},
            error() {},
        },
        closeServer: async () => new Promise(() => {}),
        cleanupSignalHandlers: () => {},
        exitFn: (code) => {
            exitCode = code;
        },
        shutdownTimeoutMs: 20,
    });

    await assert.rejects(
        controller.shutdown({ signal: "SIGINT", exitCode: 0 }),
        /timed out/
    );
    assert.equal(exitCode, 1);
});

test("installSignalHandlers installs and cleans up process listeners", () => {
    const registrations = [];
    const removals = [];

    const cleanup = installSignalHandlers({
        signals: ["SIGINT", "SIGTERM"],
        onSignal: () => {},
        on: (signal, handler) => {
            registrations.push({ signal, handler });
        },
        off: (signal, handler) => {
            removals.push({ signal, handler });
        },
    });

    assert.equal(registrations.length, 2);
    cleanup();
    assert.deepEqual(
        removals.map((entry) => entry.signal),
        ["SIGINT", "SIGTERM"]
    );
});

test("listenAsync resolves once the server starts listening", async () => {
    const app = {
        listen(_port, _host) {
            const listeners = new Map();
            const server = {
                once(event, handler) {
                    listeners.set(event, handler);
                },
                off(event) {
                    listeners.delete(event);
                },
            };

            queueMicrotask(() => {
                listeners.get("listening")?.();
            });

            return server;
        },
    };

    const server = await listenAsync(app, 3719);
    assert.equal(typeof server.once, "function");
});
