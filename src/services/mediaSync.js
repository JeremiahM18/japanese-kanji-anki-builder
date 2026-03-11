const { buildJlptBuckets } = require("../datasets/sentenceCorpusCoverage");

function parseLevelArgument(value) {
    if (value == null) {
        return null;
    }

    const normalized = String(value).trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function selectKanjiForSync({ jlptOnlyJson = {}, level = null, limit = null, kanji = [] }) {
    if (Array.isArray(kanji) && kanji.length > 0) {
        return [...new Set(kanji.map((item) => String(item).trim()).filter(Boolean))];
    }

    const buckets = buildJlptBuckets(jlptOnlyJson);
    const levels = level == null
        ? [...buckets.keys()].sort((a, b) => a - b)
        : [level];
    const selected = levels.flatMap((entryLevel) => buckets.get(entryLevel) || []);

    if (Number.isFinite(limit) && limit > 0) {
        return selected.slice(0, limit);
    }

    return selected;
}

function summarizeSyncResults(results) {
    const summary = {
        totalKanji: results.length,
        strokeOrder: {
            imageHits: 0,
            animationHits: 0,
            sourceCounts: {},
        },
        audio: {
            hits: 0,
            sourceCounts: {},
        },
        errors: [],
    };

    for (const result of results) {
        if (result.strokeOrder?.error || result.audio?.error) {
            summary.errors.push({
                kanji: result.kanji,
                strokeOrderError: result.strokeOrder?.error || null,
                audioError: result.audio?.error || null,
            });
        }

        if (result.strokeOrder?.manifest?.assets?.strokeOrderImage) {
            summary.strokeOrder.imageHits += 1;
            const source = result.strokeOrder.manifest.assets.strokeOrderImage.source || "unknown";
            summary.strokeOrder.sourceCounts[source] = (summary.strokeOrder.sourceCounts[source] || 0) + 1;
        }

        if (result.strokeOrder?.manifest?.assets?.strokeOrderAnimation) {
            summary.strokeOrder.animationHits += 1;
            const source = result.strokeOrder.manifest.assets.strokeOrderAnimation.source || "unknown";
            summary.strokeOrder.sourceCounts[source] = (summary.strokeOrder.sourceCounts[source] || 0) + 1;
        }

        const audioAssets = result.audio?.manifest?.assets?.audio || [];
        if (audioAssets.length > 0) {
            summary.audio.hits += 1;
            const source = audioAssets[0].source || "unknown";
            summary.audio.sourceCounts[source] = (summary.audio.sourceCounts[source] || 0) + 1;
        }
    }

    return summary;
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex++;
            if (currentIndex >= items.length) {
                return;
            }

            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.min(Math.max(1, Number(concurrency) || 1), Math.max(1, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

async function syncMediaForKanjiList({ kanjiList, strokeOrderService, audioService, concurrency = 4, audioMetadata = {} }) {
    const results = await mapWithConcurrency(kanjiList, concurrency, async (kanji) => {
        const result = { kanji };

        try {
            result.strokeOrder = await strokeOrderService.syncKanji(kanji);
        } catch (error) {
            result.strokeOrder = {
                error: error instanceof Error ? error.message : String(error),
            };
        }

        try {
            result.audio = await audioService.syncKanji(kanji, {
                category: "kanji-reading",
                text: kanji,
                ...audioMetadata,
            });
        } catch (error) {
            result.audio = {
                error: error instanceof Error ? error.message : String(error),
            };
        }

        return result;
    });

    return {
        results,
        summary: summarizeSyncResults(results),
    };
}

module.exports = {
    mapWithConcurrency,
    parseLevelArgument,
    selectKanjiForSync,
    summarizeSyncResults,
    syncMediaForKanjiList,
};
