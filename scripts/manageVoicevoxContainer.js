#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const DEFAULT_CONTAINER_NAME = "voicevox-nemo";
const DEFAULT_IMAGE = "voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest";
const DEFAULT_PORT = 50021;

function parseArgs(argv = []) {
    const args = [...argv];
    const action = args.shift() || "status";
    const parsed = {
        action,
        recreate: false,
        containerName: DEFAULT_CONTAINER_NAME,
        image: DEFAULT_IMAGE,
        port: DEFAULT_PORT,
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
            parsed.port = Number(args[++i]);
        } else if (arg.startsWith("--port=")) {
            parsed.port = Number(arg.slice("--port=".length));
        } else {
            throw new Error(`Unknown voicevox container option: ${arg}`);
        }
    }

    if (!["status", "start", "stop"].includes(parsed.action)) {
        throw new Error(`Unknown voicevox container action: ${parsed.action}`);
    }
    if (!Number.isInteger(parsed.port) || parsed.port <= 0) {
        throw new Error(`Invalid VOICEVOX port: ${parsed.port}`);
    }
    if (!parsed.containerName) {
        throw new Error("Missing VOICEVOX container name.");
    }
    if (!parsed.image) {
        throw new Error("Missing VOICEVOX Docker image.");
    }

    return parsed;
}

function runDocker(args, { allowFailure = false } = {}) {
    const result = spawnSync("docker", args, {
        encoding: "utf8",
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

function parseDockerInspect(stdout) {
    const parsed = JSON.parse(stdout || "[]");
    return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
}

function getPublishedHostPorts(container, port) {
    const target = `${port}/tcp`;
    const bindings = container?.NetworkSettings?.Ports?.[target];
    if (!Array.isArray(bindings)) {
        return [];
    }

    return bindings
        .map((binding) => binding?.HostPort)
        .filter((hostPort) => typeof hostPort === "string" && hostPort.length > 0);
}

function hasExpectedPortMapping(container, port = DEFAULT_PORT) {
    return getPublishedHostPorts(container, port).includes(String(port));
}

function getContainerState(container) {
    if (!container) {
        return "missing";
    }
    return container?.State?.Running ? "running" : "stopped";
}

function buildStartPlan(container, { recreate = false, port = DEFAULT_PORT } = {}) {
    if (!container) {
        return { action: "create", reason: "container is missing" };
    }

    const state = getContainerState(container);
    const portReady = hasExpectedPortMapping(container, port);
    if (portReady && state === "running") {
        return { action: "ready", reason: `container is already running with ${port}:${port}` };
    }
    if (portReady) {
        return { action: "start", reason: `container exists with ${port}:${port}` };
    }
    if (recreate) {
        return { action: "recreate", reason: `container exists without published ${port}:${port}` };
    }

    return { action: "needs_recreate", reason: `container exists without published ${port}:${port}` };
}

function inspectContainer(containerName) {
    const result = runDocker(["inspect", containerName], { allowFailure: true });
    if (result.status !== 0) {
        return null;
    }
    return parseDockerInspect(result.stdout);
}

function formatContainerStatus(container, port = DEFAULT_PORT) {
    if (!container) {
        return `VOICEVOX container ${DEFAULT_CONTAINER_NAME}: missing`;
    }
    const state = getContainerState(container);
    const hostPorts = getPublishedHostPorts(container, port);
    const published = hostPorts.length > 0 ? hostPorts.join(", ") : "none";
    return [
        `VOICEVOX container ${container.Name || DEFAULT_CONTAINER_NAME}: ${state}`,
        `Image: ${container.Config?.Image || container.Image || "unknown"}`,
        `Published ${port}/tcp host ports: ${published}`,
    ].join("\n");
}

function runStatus(options) {
    const container = inspectContainer(options.containerName);
    console.log(formatContainerStatus(container, options.port));
    if (container && !hasExpectedPortMapping(container, options.port)) {
        console.log(`Missing required ${options.port}:${options.port} port mapping. Run npm run voicevox:start:fresh to recreate it intentionally.`);
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
        throw new Error(`VOICEVOX container ${options.containerName} ${plan.reason}. Run npm run voicevox:start:fresh to recreate it with the required Docker port publishing.`);
    }
    if (plan.action === "start") {
        runDocker(["start", options.containerName]);
        console.log(`Started VOICEVOX container ${options.containerName}.`);
        return;
    }
    if (plan.action === "recreate") {
        runDocker(["rm", "-f", options.containerName]);
    }

    runDocker([
        "run",
        "--detach",
        "--name",
        options.containerName,
        "-p",
        `${options.port}:${options.port}`,
        options.image,
    ]);
    console.log(`Started VOICEVOX container ${options.containerName} from ${options.image} on 127.0.0.1:${options.port}.`);
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
    formatContainerStatus,
    getContainerState,
    getPublishedHostPorts,
    hasExpectedPortMapping,
    parseArgs,
    parseDockerInspect,
};
