const { readManifestIfExists } = require("../services/mediaStore");
const { buildJlptBuckets } = require("./sentenceCorpusCoverage");
const { selectBestAudioAsset } = require("../services/audioService");

function getBestStrokeOrderAsset(manifest) {
    if (!manifest?.assets) {
        return null;
    }

    return manifest.assets.strokeOrderAnimation || manifest.assets.strokeOrderImage || null;
}

function getBestAudioAsset(manifest, kanji) {
    if (!manifest?.assets) {
        return null;
    }

    return selectBestAudioAsset(manifest.assets.audio, {
        category: "kanji-reading",
        text: kanji,
    });
}

function incrementCount(map, key) {
    const name = key || "unknown";
    map[name] = (map[name] || 0) + 1;
}

async function loadMediaRows({ jlptOnlyJson = {}, mediaRootDir }) {
    const rows = [];

    for (const [kanji, value] of Object.entries(jlptOnlyJson)) {
        const manifest = await readManifestIfExists(mediaRootDir, kanji);
        const strokeOrderAsset = getBestStrokeOrderAsset(manifest);
        const audioAsset = getBestAudioAsset(manifest, kanji);

        rows.push({
            kanji,
            level: value?.jlpt,
            strokeOrderAsset,
            audioAsset,
        });
    }

    return rows;
}

function buildMediaCoverageSummaryFromRows(rows, jlptOnlyJson) {
    const strokeOrderSources = {};
    const audioSources = {};
    const buckets = buildJlptBuckets(jlptOnlyJson);
    const levels = [...buckets.keys()].sort((a, b) => a - b);
    const rowMap = new Map(rows.map((row) => [row.kanji, row]));

    for (const row of rows) {
        if (row.strokeOrderAsset) {
            incrementCount(strokeOrderSources, row.strokeOrderAsset.source);
        }

        if (row.audioAsset) {
            incrementCount(audioSources, row.audioAsset.source);
        }
    }

    const levelRows = levels.map((level) => {
        const kanjiList = buckets.get(level);
        const scopedRows = kanjiList.map((kanji) => rowMap.get(kanji));
        const strokeOrderCovered = scopedRows.filter((row) => Boolean(row?.strokeOrderAsset)).length;
        const audioCovered = scopedRows.filter((row) => Boolean(row?.audioAsset)).length;
        const fullMediaCovered = scopedRows.filter((row) => Boolean(row?.strokeOrderAsset) && Boolean(row?.audioAsset)).length;
        const missing = scopedRows
            .filter((row) => !row?.strokeOrderAsset || !row?.audioAsset)
            .map((row) => ({
                kanji: row.kanji,
                level,
                missingStrokeOrder: !row.strokeOrderAsset,
                missingAudio: !row.audioAsset,
            }));

        return {
            level,
            totalKanji: scopedRows.length,
            strokeOrderCovered,
            audioCovered,
            fullMediaCovered,
            strokeOrderCoverageRatio: scopedRows.length > 0 ? Number((strokeOrderCovered / scopedRows.length).toFixed(4)) : 0,
            audioCoverageRatio: scopedRows.length > 0 ? Number((audioCovered / scopedRows.length).toFixed(4)) : 0,
            fullMediaCoverageRatio: scopedRows.length > 0 ? Number((fullMediaCovered / scopedRows.length).toFixed(4)) : 0,
            sampleMissing: missing.slice(0, 10),
        };
    });

    const totalKanji = rows.length;
    const strokeOrderCovered = rows.filter((row) => Boolean(row.strokeOrderAsset)).length;
    const audioCovered = rows.filter((row) => Boolean(row.audioAsset)).length;
    const fullMediaCovered = rows.filter((row) => Boolean(row.strokeOrderAsset) && Boolean(row.audioAsset)).length;

    return {
        totalKanji,
        strokeOrderCovered,
        audioCovered,
        fullMediaCovered,
        strokeOrderCoverageRatio: totalKanji > 0 ? Number((strokeOrderCovered / totalKanji).toFixed(4)) : 0,
        audioCoverageRatio: totalKanji > 0 ? Number((audioCovered / totalKanji).toFixed(4)) : 0,
        fullMediaCoverageRatio: totalKanji > 0 ? Number((fullMediaCovered / totalKanji).toFixed(4)) : 0,
        strokeOrderSources,
        audioSources,
        levels: levelRows,
        missingByPriority: levelRows
            .flatMap((row) => row.sampleMissing)
            .sort((a, b) => a.level - b.level || a.kanji.localeCompare(b.kanji)),
    };
}

async function buildMediaCoverageSummary({ jlptOnlyJson = {}, mediaRootDir }) {
    const rows = await loadMediaRows({ jlptOnlyJson, mediaRootDir });
    return buildMediaCoverageSummaryFromRows(rows, jlptOnlyJson);
}

module.exports = {
    buildMediaCoverageSummary,
    buildMediaCoverageSummaryFromRows,
    getBestAudioAsset,
    getBestStrokeOrderAsset,
    loadMediaRows,
};
