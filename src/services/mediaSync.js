const { buildJlptBuckets } = require("../datasets/sentenceCorpusCoverage");
const { findReusableManagedAudioAsset } = require("./audioService");
const {
    managedAssetExists,
    readManifestIfExists,
} = require("./mediaStore");
const { mapWithConcurrency } = require("../utils/concurrency");

function parseLevelArgument(value) {
    if (value === null || value === undefined) {
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
    const levels = level === null || level === undefined
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

async function buildExistingCompleteSyncResult({ kanji, mediaRootDir, audioMetadata = {} }) {
    if (!mediaRootDir) {
        return null;
    }

    const manifest = await readManifestIfExists(mediaRootDir, kanji);
    if (!manifest) {
        return null;
    }

    const strokeOrderImage = manifest.assets?.strokeOrderImage || null;
    const strokeOrderAnimation = manifest.assets?.strokeOrderAnimation || null;
    const audioAsset = findReusableManagedAudioAsset(manifest.assets?.audio || [], {
        category: "kanji-reading",
        text: kanji,
        reading: audioMetadata.reading,
    });

    const hasImage = managedAssetExists(mediaRootDir, kanji, strokeOrderImage?.path);
    const hasAnimation = managedAssetExists(mediaRootDir, kanji, strokeOrderAnimation?.path);
    const hasAudio = managedAssetExists(mediaRootDir, kanji, audioAsset?.path);

    if (!hasImage || !hasAnimation || !hasAudio) {
        return null;
    }

    return {
        kanji,
        strokeOrder: {
            kanji,
            manifest,
            found: {
                image: false,
                animation: false,
            },
            acquisition: {
                image: [],
                animation: [],
            },
            skipped: true,
        },
        audio: {
            kanji,
            manifest,
            found: {
                audio: false,
            },
            acquisition: {
                audio: [],
            },
            skipped: true,
        },
    };
}

async function syncMediaForKanjiList({ kanjiList, strokeOrderService, audioService, concurrency = 4, audioMetadata = {}, mediaRootDir = null }) {
    const results = await mapWithConcurrency(kanjiList, concurrency, async (kanji) => {
        const existingComplete = await buildExistingCompleteSyncResult({ kanji, mediaRootDir, audioMetadata });
        if (existingComplete) {
            return existingComplete;
        }

        const tasks = [
            strokeOrderService.syncKanji(kanji),
            typeof audioService?.syncKanji === "function"
                ? audioService.syncKanji(kanji, {
                    category: "kanji-reading",
                    text: kanji,
                    ...audioMetadata,
                })
                : Promise.resolve({
                    kanji,
                    manifest: {
                        assets: {
                            audio: [],
                        },
                    },
                    found: {
                        audio: false,
                    },
                    acquisition: {
                        audio: [],
                    },
                    skipped: true,
                }),
        ];
        const [strokeOrder, audio] = await Promise.allSettled(tasks);

        return {
            kanji,
            strokeOrder: strokeOrder.status === "fulfilled"
                ? strokeOrder.value
                : {
                    error: strokeOrder.reason instanceof Error ? strokeOrder.reason.message : String(strokeOrder.reason),
                },
            audio: audio.status === "fulfilled"
                ? audio.value
                : {
                    error: audio.reason instanceof Error ? audio.reason.message : String(audio.reason),
                },
        };
    });

    return {
        results,
        summary: summarizeSyncResults(results),
    };
}

module.exports = {
    buildExistingCompleteSyncResult,
    parseLevelArgument,
    selectKanjiForSync,
    summarizeSyncResults,
    syncMediaForKanjiList,
};
