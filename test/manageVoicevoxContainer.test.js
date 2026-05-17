const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildStartPlan,
    formatContainerStatus,
    getPublishedHostPorts,
    hasExpectedPortMapping,
    parseArgs,
    parseDockerInspect,
} = require("../scripts/manageVoicevoxContainer");

function containerFixture({ running = false, ports = null } = {}) {
    return {
        Name: "/voicevox-nemo",
        Config: {
            Image: "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
        },
        State: {
            Running: running,
        },
        NetworkSettings: {
            Ports: ports,
        },
    };
}

test("parseArgs defaults to the governed local VOICEVOX container", () => {
    assert.deepEqual(parseArgs(["start"]), {
        action: "start",
        recreate: false,
        containerName: "voicevox-nemo",
        image: "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
        port: 50021,
    });
});

test("hasExpectedPortMapping rejects containers created without publishing 50021", () => {
    const container = containerFixture({ running: false, ports: {} });
    assert.equal(hasExpectedPortMapping(container), false);
    assert.deepEqual(getPublishedHostPorts(container, 50021), []);
});

test("buildStartPlan refuses a stale container unless recreation is explicit", () => {
    const container = containerFixture({ running: false, ports: {} });
    assert.deepEqual(buildStartPlan(container), {
        action: "needs_recreate",
        reason: "container exists without published 50021:50021",
    });
    assert.deepEqual(buildStartPlan(container, { recreate: true, port: 50021 }), {
        action: "recreate",
        reason: "container exists without published 50021:50021",
    });
});

test("buildStartPlan starts a stopped container only when the port mapping is already correct", () => {
    const container = containerFixture({
        running: false,
        ports: {
            "50021/tcp": [{ HostIp: "0.0.0.0", HostPort: "50021" }],
        },
    });

    assert.deepEqual(buildStartPlan(container), {
        action: "start",
        reason: "container exists with 50021:50021",
    });
});

test("parseDockerInspect and formatContainerStatus expose the bad-container shape", () => {
    const parsed = parseDockerInspect(JSON.stringify([containerFixture({ running: false, ports: {} })]));
    const status = formatContainerStatus(parsed);

    assert.equal(parsed.Name, "/voicevox-nemo");
    assert.match(status, /stopped/);
    assert.match(status, /Published 50021\/tcp host ports: none/);
});
