function buildJlptBuckets(jlptOnlyJson = {}) {
    const buckets = new Map();

    for (const [kanji, value] of Object.entries(jlptOnlyJson)) {
        const level = value?.jlpt;
        if (!Number.isInteger(level)) {
            continue;
        }

        if (!buckets.has(level)) {
            buckets.set(level, []);
        }

        buckets.get(level).push(kanji);
    }

    for (const entries of buckets.values()) {
        entries.sort((a, b) => a.localeCompare(b));
    }

    return buckets;
}

module.exports = {
    buildJlptBuckets,
};
