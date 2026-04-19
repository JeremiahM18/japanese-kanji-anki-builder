const pino = require("pino");
const { loadConfig } = require("./config");

function buildLoggerOptions({ nodeEnv = "development", logLevel = "info" } = {}) {
    const isDevelopment = nodeEnv !== "production";

    return {
        level: logLevel,
        ...(isDevelopment
            ? {
                transport: {
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                        translateTime: "SYS:standard",
                    },
                },
            }
            : {}),
    };
}

function resolveLoggerRuntime({ cwd = process.cwd(), env = process.env, loadConfigFn = loadConfig } = {}) {
    try {
        const config = loadConfigFn({ cwd, env });
        return {
            nodeEnv: config.nodeEnv,
            logLevel: env.LOG_LEVEL || "info",
        };
    } catch {
        return {
            nodeEnv: env.NODE_ENV === "production" ? "production" : "development",
            logLevel: env.LOG_LEVEL || "info",
        };
    }
}

function createLogger(runtime = resolveLoggerRuntime()) {
    return pino(buildLoggerOptions(runtime));
}

const logger = createLogger();

module.exports = {
    buildLoggerOptions,
    createLogger,
    logger,
    resolveLoggerRuntime,
};
