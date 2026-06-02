const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDockerRunArgs,
    buildStartPlan,
    formatContainerStatus,
    getRuntimeHardeningIssues,
    getPublishedHostBindings,
    getPublishedHostPorts,
    hasExpectedPortMapping,
    hasExpectedRuntimeHardening,
    isMissingContainerInspectResult,
    parseArgs,
    parseDockerInspect,
    parseMemoryLimitBytes,
} = require("../scripts/manageVoicevoxContainer");

function containerFixture({ running = false, ports = null, portBindings = null, hardened = true } = {}) {
    return {
        Name: "/voicevox-nemo",
        Config: {
            Image: "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
        },
        HostConfig: {
            PortBindings: portBindings,
            SecurityOpt: hardened ? ["no-new-privileges"] : [],
            CapDrop: hardened ? ["ALL"] : [],
            CapAdd: hardened ? ["CAP_SETUID", "CAP_SETGID"] : [],
            RestartPolicy: { Name: hardened ? "no" : "always" },
            Init: hardened,
            Memory: hardened ? 4 * 1024 * 1024 * 1024 : 0,
            NanoCpus: hardened ? 4_000_000_000 : 0,
            PidsLimit: hardened ? 512 : 0,
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
        memory: "4g",
        cpus: 4,
        pidsLimit: 512,
    });
});

test("parseMemoryLimitBytes supports Docker memory suffixes", () => {
    assert.equal(parseMemoryLimitBytes("512m"), 512 * 1024 * 1024);
    assert.equal(parseMemoryLimitBytes("4g"), 4 * 1024 * 1024 * 1024);
    assert.equal(parseMemoryLimitBytes("bad"), null);
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
    assert.equal(hasExpectedRuntimeHardening(container), true);
    assert.deepEqual(getPublishedHostBindings(container, 50121), [{ hostIp: "127.0.0.1", hostPort: "50021" }]);
    assert.deepEqual(getPublishedHostPorts(container, 50121), ["50021"]);
    assert.deepEqual(buildStartPlan(container), {
        action: "start",
        reason: "container exists with 127.0.0.1:50021:50121 and required runtime hardening",
    });
});

test("getPublishedHostBindings de-duplicates matching Docker inspect port sources", () => {
    const container = containerFixture({
        ports: {
            "50121/tcp": [{ HostIp: "127.0.0.1", HostPort: "50021" }],
        },
        portBindings: {
            "50121/tcp": [{ HostIp: "127.0.0.1", HostPort: "50021" }],
        },
    });

    assert.deepEqual(getPublishedHostBindings(container, 50121), [{ hostIp: "127.0.0.1", hostPort: "50021" }]);
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

test("buildStartPlan refuses containers missing runtime hardening unless recreation is explicit", () => {
    const container = containerFixture({
        running: false,
        hardened: false,
        ports: {
            "50121/tcp": [{ HostIp: "127.0.0.1", HostPort: "50021" }],
        },
    });

    assert.equal(hasExpectedPortMapping(container), true);
    assert.equal(hasExpectedRuntimeHardening(container), false);
    assert.match(getRuntimeHardeningIssues(container).join("; "), /missing no-new-privileges/);
    assert.deepEqual(buildStartPlan(container), {
        action: "needs_recreate",
        reason: "container exists without required runtime hardening (missing no-new-privileges; missing cap-drop ALL; missing cap-add SETUID; missing cap-add SETGID; unexpected restart policy always; missing Docker init process; memory limit is 0, expected 4294967296; CPU limit is 0, expected 4000000000; pids limit is 0, expected 512)",
    });
    assert.deepEqual(buildStartPlan(container, { recreate: true }), {
        action: "recreate",
        reason: "container exists without required runtime hardening (missing no-new-privileges; missing cap-drop ALL; missing cap-add SETUID; missing cap-add SETGID; unexpected restart policy always; missing Docker init process; memory limit is 0, expected 4294967296; CPU limit is 0, expected 4000000000; pids limit is 0, expected 512)",
    });
});

test("getRuntimeHardeningIssues requires an explicit no restart policy", () => {
    const container = containerFixture();
    delete container.HostConfig.RestartPolicy;

    assert.deepEqual(getRuntimeHardeningIssues(container), ["unexpected restart policy missing"]);
    assert.equal(hasExpectedRuntimeHardening(container), false);
});

test("buildDockerRunArgs creates a hardened localhost-only container", () => {
    assert.deepEqual(
        buildDockerRunArgs({
            containerName: "voicevox-nemo",
            image: "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
            hostIp: "127.0.0.1",
            hostPort: 50021,
            containerPort: 50121,
            memory: "4g",
            cpus: 4,
            pidsLimit: 512,
        }),
        [
            "run",
            "--detach",
            "--name",
            "voicevox-nemo",
            "--pull",
            "missing",
            "--restart",
            "no",
            "--security-opt",
            "no-new-privileges",
            "--cap-drop",
            "ALL",
            "--cap-add",
            "SETUID",
            "--cap-add",
            "SETGID",
            "--init",
            "--memory",
            "4g",
            "--cpus",
            "4",
            "--pids-limit",
            "512",
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
    assert.match(status, /Runtime hardening: pass/);
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
