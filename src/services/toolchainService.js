const { spawnSync } = require("node:child_process");

function trimVersionText(value) {
    return String(value || "").trim();
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

    const result = spawnSync(command, args, {
        encoding: "utf8",
    });

    const stdout = trimVersionText(result.stdout);
    const stderr = trimVersionText(result.stderr);
    const version = stdout || stderr || null;

    if (result.error) {
        return {
            name,
            command,
            args,
            required,
            purpose,
            available: false,
            version: null,
            error: result.error.message,
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
            version,
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
        version,
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
            describeTool({
                name: "Python",
                command: process.platform === "win32" ? "python" : "python3",
                args: ["--version"],
                required: false,
                purpose: "Python packaging CLI",
            }),
            describeTool({
                name: "sqlite3",
                command: "sqlite3",
                args: ["-version"],
                required: false,
                purpose: "native .apkg collection generation",
            }),
            describeTool({
                name: "tar",
                command: "tar",
                args: ["--version"],
                required: false,
                purpose: "native .apkg archive creation",
            }),
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
    describeTool,
    getMissingPackagingTools,
    getMissingRequiredTools,
    trimVersionText,
};
