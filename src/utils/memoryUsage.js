const MEMORY_FIELDS = Object.freeze([
    "rss",
    "heapTotal",
    "heapUsed",
    "external",
    "arrayBuffers",
]);

function snapshotMemoryUsage() {
    const usage = process.memoryUsage();
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [field, Number(usage[field] || 0)])
    );
}

function diffMemoryUsage(after = {}, before = {}) {
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [field, Number(after[field] || 0) - Number(before[field] || 0)])
    );
}

function maxMemoryUsage(snapshots = []) {
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [
            field,
            Math.max(0, ...snapshots.map((snapshot) => Number(snapshot?.[field] || 0))),
        ])
    );
}

function maxMemoryDelta(samples = []) {
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [
            field,
            Math.max(0, ...samples.map((sample) => Number(sample?.delta?.[field] || 0))),
        ])
    );
}

function buildMemorySample(before = {}, after = {}) {
    return {
        before,
        after,
        delta: diffMemoryUsage(after, before),
    };
}

function summarizeMemorySamples(samples = []) {
    if (samples.length === 0) {
        return null;
    }

    const first = samples[0].before;
    const last = samples[samples.length - 1].after;
    return {
        unit: "bytes",
        samples: samples.length,
        before: first,
        after: last,
        delta: diffMemoryUsage(last, first),
        max: maxMemoryUsage(samples.flatMap((sample) => [sample.before, sample.after])),
        maxDelta: maxMemoryDelta(samples),
    };
}

function formatBytesAsMiB(value) {
    return `${(Number(value || 0) / 1048576).toFixed(2)} MiB`;
}

function formatSignedBytesAsMiB(value) {
    const numeric = Number(value || 0);
    const sign = numeric > 0 ? "+" : "";
    return `${sign}${formatBytesAsMiB(numeric)}`;
}

function formatMemorySnapshot(snapshot = {}) {
    return [
        `rss ${formatBytesAsMiB(snapshot.rss)}`,
        `heapUsed ${formatBytesAsMiB(snapshot.heapUsed)}`,
        `heapTotal ${formatBytesAsMiB(snapshot.heapTotal)}`,
    ].join("; ");
}

function formatMemoryDelta(delta = {}) {
    return [
        `rss ${formatSignedBytesAsMiB(delta.rss)}`,
        `heapUsed ${formatSignedBytesAsMiB(delta.heapUsed)}`,
        `heapTotal ${formatSignedBytesAsMiB(delta.heapTotal)}`,
    ].join("; ");
}

module.exports = {
    MEMORY_FIELDS,
    buildMemorySample,
    diffMemoryUsage,
    formatBytesAsMiB,
    formatMemoryDelta,
    formatMemorySnapshot,
    formatSignedBytesAsMiB,
    maxMemoryDelta,
    maxMemoryUsage,
    snapshotMemoryUsage,
    summarizeMemorySamples,
};
