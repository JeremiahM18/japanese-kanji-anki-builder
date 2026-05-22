const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDockerRunArgs,
    buildStartPlan,
    formatContainerStatus,
    getPublishedHostBindings,
    getPublishedHostPorts,
    hasExpectedPortMapping,
    isMissingContainerInspectResult,
    parseArgs,
    parseDockerInspect,
} = require("../scripts/manageVoicevoxContainer");

function containerFixture({ running = false, ports = null, portBindings = null } = {}) {
    return {
        Name: "/voicevox-nemo",
        Config: {
            Image: "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
        },
        HostConfig: {
            PortBindings: portBindings,
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
        hostPort: 50021,
        hostIp: "127.0.0.1",
        containerPort: 50121,
    });
});

test("hasExpectedPortMapping rejects containers created without publishing the Nemo engine port", () => {
    const container = containerFixture({ running: false, ports: {} });
    assert.equal(hasExpectedPortMapping(container), false);
    assert.deepEqual(getPublishedHostPorts(container, 50121), []);
});

test("hasExpectedPortMapping accepts stopped containers with preserved host port bindings", () => {
    const container = containerFixture({
        running: false,
        ports: {},
        portBindings: {
            "50121/tcp": [{ HostIp: "127.0.0.1", HostPort: "50021" }],
        },
    });

    assert.equal(hasExpectedPortMapping(container), true);
    assert.deepEqual(getPublishedHostBindings(container, 50121), [{ hostIp: "127.0.0.1", hostPort: "50021" }]);
    assert.deepEqual(getPublishedHostPorts(container, 50121), ["50021"]);
    assert.deepEqual(buildStartPlan(container), {
        action: "start",
        reason: "container exists with 127.0.0.1:50021:50121",
    });
});

test("buildStartPlan refuses a stale container unless recreation is explicit", () => {
    const container = containerFixture({ running: false, ports: {} });
    assert.deepEqual(buildStartPlan(container), {
        action: "needs_recreate",
        reason: "container exists without published 127.0.0.1:50021:50121",
    });
    assert.deepEqual(buildStartPlan(container, { recreate: true, hostPort: 50021, containerPort: 50121 }), {
        action: "recreate",
        reason: "container exists without published 127.0.0.1:50021:50121",
    });
});

test("buildStartPlan rejects a broad host binding even when the host port matches", () => {
    const container = containerFixture({
        running: false,
        ports: {
            "50121/tcp": [{ HostIp: "0.0.0.0", HostPort: "50021" }],
        },
    });

    assert.deepEqual(buildStartPlan(container), {
        action: "needs_recreate",
        reason: "container exists without published 127.0.0.1:50021:50121",
    });
});

test("buildDockerRunArgs creates a localhost-only port publishing rule", () => {
    assert.deepEqual(
        buildDockerRunArgs({
            containerName: "voicevox-nemo",
            image: "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
            hostIp: "127.0.0.1",
            hostPort: 50021,
            containerPort: 50121,
        }),
        [
            "run",
            "--detach",
            "--name",
            "voicevox-nemo",
            "-p",
            "127.0.0.1:50021:50121",
            "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
        ]
    );
});

test("parseDockerInspect and formatContainerStatus expose the bad-container shape", () => {
    const parsed = parseDockerInspect(JSON.stringify([containerFixture({ running: false, ports: {} })]));
    const status = formatContainerStatus(parsed);

    assert.equal(parsed.Name, "/voicevox-nemo");
    assert.match(status, /stopped/);
    assert.match(status, /Required mapping: 127\.0\.0\.1:50021 -> container 50121/);
    assert.match(status, /Published 50121\/tcp host bindings: none/);
});

test("isMissingContainerInspectResult does not treat Docker permission errors as missing containers", () => {
    assert.equal(isMissingContainerInspectResult({
        status: 1,
        stderr: "Error: No such object: voicevox-nemo",
        stdout: "",
    }), true);
    assert.equal(isMissingContainerInspectResult({
        status: 1,
        stderr: "permission denied while trying to connect to the docker API",
        stdout: "",
    }), false);
});
