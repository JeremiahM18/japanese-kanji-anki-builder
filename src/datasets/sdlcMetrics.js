const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SDLC_METRICS_PATH = path.resolve(__dirname, "..", "..", "templates", "sdlc_metrics.json");

function loadSdlcMetrics({ metricsPath = DEFAULT_SDLC_METRICS_PATH } = {}) {
    return JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
}

function resolveSdlcMetricsPath(cwd = process.cwd(), metricsPath = undefined) {
    if (!metricsPath) {
        return DEFAULT_SDLC_METRICS_PATH;
    }
    return path.isAbsolute(metricsPath)
        ? metricsPath
        : path.resolve(cwd, metricsPath);
}

module.exports = {
    DEFAULT_SDLC_METRICS_PATH,
    loadSdlcMetrics,
    resolveSdlcMetricsPath,
};
