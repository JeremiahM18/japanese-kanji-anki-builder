const pino = require("pino");

const isDevelopment = process.env.NODE_ENV !== "production";

const logger = pino({
    level: process.env.LOG_LEVEL || "info",
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
});

module.exports = {
    logger,
};
