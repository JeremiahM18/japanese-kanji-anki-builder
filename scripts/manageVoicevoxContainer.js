#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const DEFAULT_CONTAINER_NAME = "voicevox-nemo";
const DEFAULT_IMAGE = "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest";
const DEFAULT_HOST_IP = "127.0.0.1";
const DEFAULT_HOST_PORT = 50021;
const DEFAULT_CONTAINER_PORT = 50121;
const DEFAULT_MEMORY_LIMIT = "4g";
const DEFAULT_CPUS = 4;
const DEFAULT_PIDS_LIMIT = 512;
const REQUIRED_CAP_ADD = Object.freeze(["SETUID", "SETGID"]);

function parseArgs(argv = []) {
    const args = [...argv];
    const action = args.shift() || "status";
    const parsed = {
        action,
        recreate: false,
        containerName: DEFAULT_CONTAINER_NAME,
        image: DEFAULT_IMAGE,
        hostIp: DEFAULT_HOST_IP,
        hostPort: DEFAULT_HOST_PORT,
        containerPort: DEFAULT_CONTAINER_PORT,
        memory: DEFAULT_MEMORY_LIMIT,
        cpus: DEFAULT_CPUS,
        pidsLimit: DEFAULT_PIDS_LIMIT,
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--recreate") {
            parsed.recreate = true;
        } else if (arg === "--container-name") {
            parsed.containerName = args[++i];
        } else if (arg.startsWith("--container-name=")) {
            parsed.containerName = arg.slice("--container-name=".length);
        } else if (arg === "--image") {
            parsed.image = args[++i];
        } else if (arg.startsWith("--image=")) {
            parsed.image = arg.slice("--image=".length);
        } else if (arg === "--port") {
            parsed.hostPort = Number(args[++i]);
        } else if (arg.startsWith("--port=")) {
            parsed.hostPort = Number(arg.slice("--port=".length));
        } else if (arg === "--host-port") {
            parsed.hostPort = Number(args[++i]);
        } else if (arg.startsWith("--host-port=")) {
            parsed.hostPort = Number(arg.slice("--host-port=".length));
        } else if (arg === "--host-ip") {
            parsed.hostIp = args[++i];
        } else if (arg.startsWith("--host-ip=")) {
            parsed.hostIp = arg.slice("--host-ip=".length);
        } else if (arg === "--container-port") {
            parsed.containerPort = Number(args[++i]);
        } else if (arg.startsWith("--container-port=")) {
            parsed.containerPort = Number(arg.slice("--container-port=".length));
        } else if (arg === "--memory") {
            parsed.memory = args[++i];
        } else if (arg.startsWith("--memory=")) {
            parsed.memory = arg.slice("--memory=".length);
        } else if (arg === "--cpus") {
            parsed.cpus = Number(args[++i]);
        } else if (arg.startsWith("--cpus=")) {
            parsed.cpus = Number(arg.slice("--cpus=".length));
        } else if (arg === "--pids-limit") {
            parsed.pidsLimit = Number(args[++i]);
        } else if (arg.startsWith("--pids-limit=")) {
            parsed.pidsLimit = Number(arg.slice("--pids-limit=".length));
        } else {
            throw new Error(`Unknown voicevox container option: ${arg}`);
        }
    }

    if (!["status", "start", "stop"].includes(parsed.action)) {
        throw new Error(`Unknown voicevox container action: ${parsed.action}`);
    }
    if (!Number.isInteger(parsed.hostPort) || parsed.hostPort <= 0) {
        throw new Error(`Invalid VOICEVOX host port: ${parsed.hostPort}`);
    }
    if (!parsed.hostIp || typeof parsed.hostIp !== "string") {
        throw new Error("Missing VOICEVOX host IP.");
    }
    if (!Number.isInteger(parsed.containerPort) || parsed.containerPort <= 0) {
        throw new Error(`Invalid VOICEVOX container port: ${parsed.containerPort}`);
    }
    if (!parsed.containerName) {
        throw new Error("Missing VOICEVOX container name.");
    }
    if (!parsed.image) {
        throw new Error("Missing VOICEVOX Docker image.");
    }
    if (!parseMemoryLimitBytes(parsed.memory)) {
        throw new Error(`Invalid VOICEVOX memory limit: ${parsed.memory}`);
    }
    if (!Number.isFinite(parsed.cpus) || parsed.cpus <= 0) {
        throw new Error(`Invalid VOICEVOX CPU limit: ${parsed.cpus}`);
    }
    if (!Number.isInteger(parsed.pidsLimit) || parsed.pidsLimit <= 0) {
        throw new Error(`Invalid VOICEVOX pids limit: ${parsed.pidsLimit}`);
    }

    return parsed;
}

function parseMemoryLimitBytes(value) {
    const match = String(value || "").trim().toLowerCase().match(/^(\d+)([kmg])?b?$/u);
    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    const unit = match[2] || "";
    const multiplier = {
        "": 1,
        k: 1024,
        m: 1024 * 1024,
        g: 1024 * 1024 * 1024,
    }[unit];
    return amount > 0 ? amount * multiplier : null;
}

function runDocker(args, { allowFailure = false } = {}) {
    const result = spawnSync("docker", args, {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
    });

    if (result.error && !allowFailure) {
        throw result.error;
    }
    if (result.status !== 0 && !allowFailure) {
        throw new Error((result.stderr || result.stdout || `docker ${args.join(" ")} failed`).trim());
    }

    return result;
}

function isMissingContainerInspectResult(result) {
    if (!result || result.status === 0) {
        return false;
    }
    const output = `${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
    return output.includes("no such object") || output.includes("no such container");
}

function parseDockerInspect(stdout) {
    const parsed = JSON.parse(stdout || "[]");
    return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
}

function getPublishedHostPorts(container, containerPort = DEFAULT_CONTAINER_PORT) {
    return getPublishedHostBindings(container, containerPort).map((binding) => binding.hostPort);
}

function getPublishedHostBindings(container, containerPort = DEFAULT_CONTAINER_PORT) {
    const target = `${containerPort}/tcp`;
    const bindings = [
        ...(
            Array.isArray(container?.NetworkSettings?.Ports?.[target])
                ? container.NetworkSettings.Ports[target]
                : []
        ),
        ...(
            Array.isArray(container?.HostConfig?.PortBindings?.[target])
                ? container.HostConfig.PortBindings[target]
                : []
        ),
    ];

    const seen = new Set();
    return bindings
        .map((binding) => ({
            hostIp: binding?.HostIp || "",
            hostPort: binding?.HostPort || "",
        }))
        .filter((binding) => {
            if (binding.hostPort.length === 0) {
                return false;
            }
            const key = `${binding.hostIp}:${binding.hostPort}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function hasExpectedPortMapping(container, hostPort = DEFAULT_HOST_PORT, containerPort = DEFAULT_CONTAINER_PORT, hostIp = DEFAULT_HOST_IP) {
    return getPublishedHostBindings(container, containerPort).some((binding) => binding.hostIp === hostIp && binding.hostPort === String(hostPort));
}

function getRuntimeHardeningIssues(container, {
    memory = DEFAULT_MEMORY_LIMIT,
    cpus = DEFAULT_CPUS,
    pidsLimit = DEFAULT_PIDS_LIMIT,
} = {}) {
    if (!container) {
        return ["container is missing"];
    }

    const hostConfig = container.HostConfig || {};
    const issues = [];
    const securityOptions = new Set(hostConfig.SecurityOpt || []);
    const capDrop = new Set(hostConfig.CapDrop || []);
    const capAdd = new Set((hostConfig.CapAdd || []).map(normalizeLinuxCapability));
    const expectedMemoryBytes = parseMemoryLimitBytes(memory);
    const expectedNanoCpus = Math.trunc(cpus * 1_000_000_000);

    if (!securityOptions.has("no-new-privileges")) {
        issues.push("missing no-new-privileges");
    }
    if (!capDrop.has("ALL")) {
        issues.push("missing cap-drop ALL");
    }
    for (const requiredCapability of REQUIRED_CAP_ADD) {
        if (!capAdd.has(requiredCapability)) {
            issues.push(`missing cap-add ${requiredCapability}`);
        }
    }
    const restartPolicyName = hostConfig.RestartPolicy?.Name || "";
    if (restartPolicyName !== "no") {
        issues.push(`unexpected restart policy ${restartPolicyName || "missing"}`);
    }
    if (hostConfig.Init !== true) {
        issues.push("missing Docker init process");
    }
    if (expectedMemoryBytes && hostConfig.Memory !== expectedMemoryBytes) {
        issues.push(`memory limit is ${hostConfig.Memory || 0}, expected ${expectedMemoryBytes}`);
    }
    if (expectedNanoCpus && hostConfig.NanoCpus !== expectedNanoCpus) {
        issues.push(`CPU limit is ${hostConfig.NanoCpus || 0}, expected ${expectedNanoCpus}`);
    }
    if (hostConfig.PidsLimit !== pidsLimit) {
        issues.push(`pids limit is ${hostConfig.PidsLimit || 0}, expected ${pidsLimit}`);
    }

    return issues;
}

function normalizeLinuxCapability(value) {
    return String(value || "").replace(/^CAP_/u, "").toUpperCase();
}

function hasExpectedRuntimeHardening(container, options = {}) {
    return getRuntimeHardeningIssues(container, options).length === 0;
}

function getContainerState(container) {
    if (!container) {
        return "missing";
    }
    return container?.State?.Running ? "running" : "stopped";
}

function buildStartPlan(container, {
    recreate = false,
    hostIp = DEFAULT_HOST_IP,
    hostPort = DEFAULT_HOST_PORT,
    containerPort = DEFAULT_CONTAINER_PORT,
    memory = DEFAULT_MEMORY_LIMIT,
    cpus = DEFAULT_CPUS,
    pidsLimit = DEFAULT_PIDS_LIMIT,
} = {}) {
    if (!container) {
        return { action: "create", reason: "container is missing" };
    }

    const state = getContainerState(container);
    const portReady = hasExpectedPortMapping(container, hostPort, containerPort, hostIp);
    const hardeningIssues = getRuntimeHardeningIssues(container, { memory, cpus, pidsLimit });
    const runtimeReady = hardeningIssues.length === 0;
    if (portReady && runtimeReady && state === "running") {
        return { action: "ready", reason: `container is already running with ${hostIp}:${hostPort}:${containerPort} and required runtime hardening` };
    }
    if (portReady && runtimeReady) {
        return { action: "start", reason: `container exists with ${hostIp}:${hostPort}:${containerPort} and required runtime hardening` };
    }
    if (recreate) {
        const reason = portReady
            ? `container exists without required runtime hardening (${hardeningIssues.join("; ")})`
            : `container exists without published ${hostIp}:${hostPort}:${containerPort}`;
        return { action: "recreate", reason };
    }

    const reason = portReady
        ? `container exists without required runtime hardening (${hardeningIssues.join("; ")})`
        : `container exists without published ${hostIp}:${hostPort}:${containerPort}`;
    return { action: "needs_recreate", reason };
}

function inspectContainer(containerName) {
    const result = runDocker(["inspect", containerName], { allowFailure: true });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        if (isMissingContainerInspectResult(result)) {
            return null;
        }
        throw new Error((result.stderr || result.stdout || `docker inspect ${containerName} failed`).trim());
    }
    return parseDockerInspect(result.stdout);
}

function formatContainerStatus(container, hostPort = DEFAULT_HOST_PORT, containerPort = DEFAULT_CONTAINER_PORT, hostIp = DEFAULT_HOST_IP, hardeningOptions = {}) {
    if (!container) {
        return `VOICEVOX container ${DEFAULT_CONTAINER_NAME}: missing`;
    }
    const state = getContainerState(container);
    const hostBindings = getPublishedHostBindings(container, containerPort);
    const published = hostBindings.length > 0
        ? hostBindings.map((binding) => `${binding.hostIp || "0.0.0.0"}:${binding.hostPort}`).join(", ")
        : "none";
    return [
        `VOICEVOX container ${container.Name || DEFAULT_CONTAINER_NAME}: ${state}`,
        `Image: ${container.Config?.Image || container.Image || "unknown"}`,
        `Required mapping: ${hostIp}:${hostPort} -> container ${containerPort}`,
        `Published ${containerPort}/tcp host bindings: ${published}`,
        `Runtime hardening: ${hasExpectedRuntimeHardening(container, hardeningOptions) ? "pass" : "fail"}`,
    ].join("\n");
}

function runStatus(options) {
    const container = inspectContainer(options.containerName);
    console.log(formatContainerStatus(container, options.hostPort, options.containerPort, options.hostIp, options));
    if (container && !hasExpectedPortMapping(container, options.hostPort, options.containerPort, options.hostIp)) {
        console.log(`Missing required ${options.hostIp}:${options.hostPort}:${options.containerPort} port mapping. Run npm run voicevox:start:fresh to recreate it intentionally.`);
    }
    if (container && !hasExpectedRuntimeHardening(container, options)) {
        console.log(`Missing required Docker runtime hardening: ${getRuntimeHardeningIssues(container, options).join("; ")}. Run npm run voicevox:start:fresh to recreate it intentionally.`);
    }
}

function runStart(options) {
    const container = inspectContainer(options.containerName);
    const plan = buildStartPlan(container, options);

    if (plan.action === "ready") {
        console.log(`VOICEVOX container ${options.containerName} is already ready: ${plan.reason}.`);
        return;
    }
    if (plan.action === "needs_recreate") {
        throw new Error(`VOICEVOX container ${options.containerName} ${plan.reason}. Run npm run voicevox:start:fresh to recreate it with the required Docker port publishing and runtime hardening.`);
    }
    if (plan.action === "start") {
        runDocker(["start", options.containerName]);
        console.log(`Started VOICEVOX container ${options.containerName}.`);
        return;
    }
    if (plan.action === "recreate") {
        runDocker(["rm", "-f", options.containerName]);
    }

    runDocker(buildDockerRunArgs(options));
    console.log(`Started VOICEVOX container ${options.containerName} from ${options.image} on ${options.hostIp}:${options.hostPort} -> container ${options.containerPort}.`);
}

function buildDockerRunArgs(options) {
    return [
        "run",
        "--detach",
        "--name",
        options.containerName,
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
        options.memory,
        "--cpus",
        String(options.cpus),
        "--pids-limit",
        String(options.pidsLimit),
        "-p",
        `${options.hostIp}:${options.hostPort}:${options.containerPort}`,
        options.image,
    ];
}

function runStop(options) {
    const container = inspectContainer(options.containerName);
    if (!container) {
        console.log(`VOICEVOX container ${options.containerName} is missing; nothing to stop.`);
        return;
    }
    if (getContainerState(container) !== "running") {
        console.log(`VOICEVOX container ${options.containerName} is already stopped.`);
        return;
    }

    runDocker(["stop", options.containerName]);
    console.log(`Stopped VOICEVOX container ${options.containerName}.`);
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.action === "status") {
        runStatus(options);
    } else if (options.action === "start") {
        runStart(options);
    } else {
        runStop(options);
    }
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message || error);
        process.exitCode = 1;
    }
}

module.exports = {
    buildStartPlan,
    buildDockerRunArgs,
    formatContainerStatus,
    getContainerState,
    getRuntimeHardeningIssues,
    getPublishedHostBindings,
    getPublishedHostPorts,
    hasExpectedPortMapping,
    hasExpectedRuntimeHardening,
    isMissingContainerInspectResult,
    parseArgs,
    parseDockerInspect,
    parseMemoryLimitBytes,
};
