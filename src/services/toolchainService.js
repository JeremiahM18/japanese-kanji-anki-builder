const { spawnSync } = require("node:child_process");

function trimVersionText(value) {
    return String(value || "").trim();
}

function probeCommand(command, args = ["--version"]) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
    });

    const stdout = trimVersionText(result.stdout);
    const stderr = trimVersionText(result.stderr);
    const version = stdout || stderr || null;

    return {
        command,
        args,
        version,
        error: result.error ? result.error.message : null,
        status: result.status,
    };
}

function describeTool({ name, command, args = ["--version"], required = false, purpose = "" }) {
    if (command === process.execPath && Array.isArray(args) && args.length === 1 && args[0] === "--version") {
        return {
            name,
            command,
            args,
            required,
            purpose,
            available: true,
            version: process.version,
            error: null,
        };
    }

    const result = probeCommand(command, args);

    if (result.error) {
        return {
            name,
            command,
            args,
            required,
            purpose,
            available: false,
            version: null,
            error: result.error,
        };
    }

    if (result.status !== 0) {
        return {
            name,
            command,
            args,
            required,
            purpose,
            available: false,
            version: result.version,
            error: `exit code ${result.status}`,
        };
    }

    return {
        name,
        command,
        args,
        required,
        purpose,
        available: true,
        version: result.version,
        error: null,
    };
}

function describeNpmTool() {
    const userAgent = String(process.env.npm_config_user_agent || "");
    const match = userAgent.match(/npm\/(\S+)/);

    if (match) {
        return {
            name: "npm",
            command: process.platform === "win32" ? "npm.cmd" : "npm",
            args: ["--version"],
            required: true,
            purpose: "package management",
            available: true,
            version: match[1],
            error: null,
        };
    }

    return describeTool({
        name: "npm",
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["--version"],
        required: true,
        purpose: "package management",
    });
}

function getPythonCandidates() {
    if (process.platform === "win32") {
        return [
            {
                command: "python",
                probeArgs: ["--version"],
                runArgsPrefix: [],
            },
            {
                command: "py",
                probeArgs: ["-3", "--version"],
                runArgsPrefix: ["-3"],
            },
        ];
    }

    return [
        {
            command: "python3",
            probeArgs: ["--version"],
            runArgsPrefix: [],
        },
        {
            command: "python",
            probeArgs: ["--version"],
            runArgsPrefix: [],
        },
    ];
}

function describePythonTool() {
    const candidates = getPythonCandidates();
    let firstFailure = null;

    for (const candidate of candidates) {
        const result = probeCommand(candidate.command, candidate.probeArgs);
        if (!result.error && result.status === 0) {
            return {
                name: "Python",
                command: candidate.command,
                args: candidate.probeArgs,
                required: false,
                purpose: "native .apkg generation",
                available: true,
                version: result.version,
                error: null,
                runArgsPrefix: candidate.runArgsPrefix,
            };
        }

        if (!firstFailure) {
            firstFailure = {
                command: candidate.command,
                args: candidate.probeArgs,
                version: result.version,
                error: result.error || `exit code ${result.status}`,
            };
        }
    }

    return {
        name: "Python",
        command: firstFailure?.command || candidates[0].command,
        args: firstFailure?.args || candidates[0].probeArgs,
        required: false,
        purpose: "native .apkg generation",
        available: false,
        version: null,
        error: firstFailure?.error || "not found",
        runArgsPrefix: candidates[0].runArgsPrefix,
    };
}

function resolvePythonCommand() {
    const tool = describePythonTool();
    if (!tool.available) {
        return null;
    }

    return {
        command: tool.command,
        argsPrefix: Array.isArray(tool.runArgsPrefix) ? tool.runArgsPrefix : [],
        version: tool.version,
    };
}

function buildToolchainStatus() {
    return {
        runtime: [
            describeTool({
                name: "Node.js",
                command: process.execPath,
                args: ["--version"],
                required: true,
                purpose: "runtime",
            }),
            describeNpmTool(),
        ],
        packaging: [
            describePythonTool(),
        ],
    };
}

function getMissingRequiredTools(toolGroups = {}) {
    return Object.values(toolGroups)
        .flatMap((group) => Array.isArray(group) ? group : [])
        .filter((tool) => tool.required && !tool.available);
}

function getMissingPackagingTools(toolGroups = {}) {
    return (Array.isArray(toolGroups.packaging) ? toolGroups.packaging : [])
        .filter((tool) => !tool.available);
}

module.exports = {
    buildToolchainStatus,
    describePythonTool,
    describeTool,
    getMissingPackagingTools,
    getMissingRequiredTools,
    resolvePythonCommand,
    trimVersionText,
};
